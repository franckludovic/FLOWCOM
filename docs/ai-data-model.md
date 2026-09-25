# FlowCom shared data model (proposal)

Status: **draft for review**. Nothing in this document exists in Dataverse yet.

## Goal

FlowCom's AI must reason across every source (content, campaigns, Odoo CRM,
WhatsApp, ads) as one picture of the company. That requires the data to be
**linked**, not just stored side by side. This model defines:

1. a shared **Contact** that every source links to,
2. one **Activity timeline** that records what happened, from any source,
3. domain tables per feature (campaigns, CRM, conversations),
4. an **AI layer** that stores insights and proposed actions with their evidence.

The AI does not receive all data on every request. It calls **tools**
(Dataverse queries run by the app) and gets back only what it needs; see
[AI tools](#ai-tools).

## Rules that apply to every table

| Rule | Why |
|---|---|
| Prefix `fc_`, user/team ownership, like the existing tables | Consistency with `dataverse/flowcom-schema.json` |
| Required `fc_company` lookup | Every row belongs to exactly one company |
| Synced rows carry `fc_source` + `fc_externalid`, with an alternate key on (`fc_company`, `fc_source`, `fc_externalid`) | Syncs can upsert repeatedly without creating duplicates |
| Every table's primary name column is `fc_name` (the title, handle or label shown in lists) | Matches the existing tables |
| Short `fc_summary` text on rows the AI reads often | Lets tools return compact context instead of raw payloads |
| No secrets outside Company Secrets | Tokens stay in the column-secured table, reached only through flows |
| Amounts are decimal columns paired with `fc_currency` (ISO 4217 code), copied from the company's currency when the row is created | Each company chooses its currency (default XAF) without Dataverse's multi-currency setup |
| Only `fc_company` is required; every link to a contact, campaign, opportunity or conversation is optional | Data is never expected to exist in every source; a contact may be known to one source, several, or none yet, and a new source adds a `fc_source` value and its own tables without changing the core |

`fc_source` choice (shared): `manual`, `flowcom`, `buffer`, `odoo`, `whatsapp`, `meta_ads`, `google_ads`, `linkedin_ads`.

## Build order

| Batch | Tables | Status |
|---|---|---|
| 1 | `fc_source` choice, `fc_contact`, `fc_contactidentity`, `fc_activity`, `fc_campaign`, `fc_campaignmetric`, `fc_aiinsight`, `fc_aiaction`, plus `fc_company.fc_currency` and `fc_campaign` lookups on calendar and library items | script: `scripts/dataverse/create-core-tables.mjs` |
| 2 (Odoo) | `fc_opportunity`, `fc_syncstate`; opportunity lookups on `fc_activity` and `fc_aiinsight`; alternate key on `fc_activity` (`fc_company`, `fc_source`, `fc_externalid`) | with the Odoo feature |
| 3 (WhatsApp) | `fc_conversation`, `fc_message`; conversation lookups on `fc_activity` and `fc_aiinsight` | with the WhatsApp feature |

Lookups to tables from later batches are added when those tables are created.

## Entity overview

```
                        fc_company
                            │ (every table)
        ┌───────────────────┼─────────────────────────────┐
        │                   │                             │
  fc_campaign ◄──────── fc_contact ────────► fc_contactidentity
   │   │  ▲               │  ▲  ▲               (odoo partner id, whatsapp number,
   │   │  │               │  │  │                email, ad lead id …)
   │   │  └─ fc_opportunity ┘  │  │
   │   │         (Odoo)        │  │
   │   └─ fc_campaignmetric    │  fc_conversation ── fc_message
   │        (daily results)    │     (WhatsApp)
   │                           │
   ├─ fc_calendaritem (+campaign lookup)
   └─ fc_libraryitem  (+campaign lookup)

  fc_activity ── timeline row pointing to contact / campaign / opportunity / conversation
  fc_aiinsight ── AI finding + evidence, pointing to any of the above
  fc_aiaction  ── AI-proposed action awaiting human approval
  fc_syncstate ── per-source sync cursor and health
```

## 1. Shared core

### fc_contact: a person or organization the company deals with

| Column | Type | Notes |
|---|---|---|
| fc_company | lookup → fc_company | required |
| fc_name | string 200 | required; defaults to the phone number or email when a source provides no name |
| fc_kind | choice | `person`, `organization` |
| fc_organization | lookup → fc_contact | the organization a person belongs to |
| fc_phone | string 30 | normalized E.164 (`+2376…`), used for matching |
| fc_email | string 320 | lowercased, used for matching |
| fc_city / fc_country | string 100 | market analysis |
| fc_segment | lookup → fc_audiencesegment | links CRM data to the existing marketing memory |
| fc_lifecyclestage | choice | `lead`, `prospect`, `customer`, `inactive` |
| fc_firstsource | choice (fc_source) | where the contact first appeared |
| fc_firstcampaign | lookup → fc_campaign | attribution |
| fc_whatsappconsent | yes/no + fc_whatsappconsenton date | required before any outbound WhatsApp |
| fc_lastactivityon | date/time | kept current by syncs; drives "not followed up" |
| fc_summary | multiline 2000 | AI-maintained one-paragraph profile |

### fc_contactidentity: how each source refers to a contact

| Column | Type | Notes |
|---|---|---|
| fc_company | lookup | required |
| fc_contact | lookup → fc_contact | required |
| fc_source | choice (fc_source) | required |
| fc_externalid | string 200 | Odoo `res.partner` id, WhatsApp `wa_id`, ad lead id … |
| fc_name | string 320 | primary name: the human-readable handle (phone, email) |

Alternate key (`fc_company`, `fc_source`, `fc_externalid`).

**Matching rule when a sync meets an unknown record:** match an existing
contact by normalized phone, then by email. If nothing matches, create a new
contact. A second match on a different contact is never merged automatically;
it creates an `fc_aiinsight` of kind `duplicate` for a human to resolve.

### fc_activity: the unified timeline

| Column | Type | Notes |
|---|---|---|
| fc_company | lookup | required |
| fc_occurredon | date/time | required |
| fc_type | choice | `message_in`, `message_out`, `opportunity_created`, `stage_changed`, `deal_won`, `deal_lost`, `post_published`, `campaign_started`, `campaign_ended`, `note`, `ai_action_executed` |
| fc_source | choice (fc_source) | required |
| fc_contact / fc_campaign / fc_opportunity / fc_conversation | lookups | any that apply |
| fc_name | string 300 | primary name: the title, e.g. "Stage: Proposal → Won" |
| fc_summary | multiline 2000 | compact text the AI reads |
| fc_amount + fc_currency | decimal + string 3 | for won deals, spend, orders |
| fc_externalid | string 200 | alternate key with company + source |

Syncs write activities alongside their domain rows, so "what happened with X
recently" is a single query regardless of source.

## 2. Campaigns (feature 1)

### fc_campaign

| Column | Type | Notes |
|---|---|---|
| fc_company | lookup | required |
| fc_name | string 200 | required |
| fc_objective | choice | `awareness`, `engagement`, `leads`, `sales`, `retention` |
| fc_type | choice | `organic`, `paid`, `mixed` |
| fc_status | choice | `draft`, `planned`, `active`, `paused`, `completed`, `cancelled` |
| fc_startdate / fc_enddate | date only | |
| fc_channels | multi-select choice | `facebook`, `instagram`, `linkedin`, `tiktok`, `x`, `whatsapp`, `google` |
| fc_segment | lookup → fc_audiencesegment | target audience |
| fc_keymessage | lookup → fc_keymessage | main message |
| fc_budget + fc_currency | decimal + string 3 | planned paid budget; currency defaults to the company's |
| fc_targetleads / fc_targetrevenue / fc_targetreach | whole number / decimal / whole number | KPIs the AI measures progress against |
| fc_trackingcode | string 100 | UTM campaign value, also used to match Odoo `utm.campaign` |
| fc_brief | multiline 10000 | AI-drafted, human-edited brief |
| fc_summary | multiline 2000 | AI-maintained status paragraph |

### fc_campaignmetric: daily results per channel

| Column | Type | Notes |
|---|---|---|
| fc_company / fc_campaign | lookups | required |
| fc_date | date only | required |
| fc_channel | choice | same values as fc_channels |
| fc_source | choice (fc_source) | `buffer`, `meta_ads`, `manual` … |
| fc_impressions / fc_reach / fc_clicks / fc_engagements / fc_leads / fc_conversions | whole numbers | |
| fc_spend / fc_revenue | decimal | in the campaign's currency |

Alternate key (`fc_campaign`, `fc_date`, `fc_channel`, `fc_source`).

### Changes to existing tables

- `fc_company`: add `fc_currency` (string 3, default `XAF`, editable in company settings).
- `fc_calendaritem`: add `fc_campaign` lookup.
- `fc_libraryitem`: add `fc_campaign` lookup.

## 3. Odoo CRM (feature 2)

### fc_opportunity: mirror of Odoo `crm.lead` (read-only sync at first)

| Column | Type | Notes |
|---|---|---|
| fc_company / fc_contact | lookups | contact via `fc_contactidentity` (source `odoo`) |
| fc_name | string 300 | |
| fc_stage | string 100 | Odoo stage name (stages vary per Odoo instance) |
| fc_state | choice | `open`, `won`, `lost` |
| fc_probability | decimal | |
| fc_expectedrevenue + fc_currency | decimal + string 3 | Odoo's currency for the deal |
| fc_expectedclose | date only | |
| fc_salesperson | string 200 | Odoo user name |
| fc_campaign | lookup → fc_campaign | matched through `fc_trackingcode` ↔ Odoo UTM campaign |
| fc_lostreason | string 300 | |
| fc_lastactivityon / fc_nextactivityon | date/time | "stale opportunity" detection |
| fc_source + fc_externalid | | `odoo` + `crm.lead` id; alternate key |
| fc_syncedon | date/time | |

Sales orders (`sale.order`) are written as `fc_activity` rows of type
`deal_won` with `fc_amount`, rather than a separate table, until reporting
needs more detail.

## 4. WhatsApp (feature 3)

### fc_conversation: one thread per contact and business number

| Column | Type | Notes |
|---|---|---|
| fc_company / fc_contact | lookups | |
| fc_businessnumber | string 30 | the company's WhatsApp number (phone number id) |
| fc_status | choice | `open`, `waiting_on_us`, `waiting_on_customer`, `closed` |
| fc_lastinboundon | date/time | start of Meta's 24-hour free-form reply window |
| fc_lastoutboundon | date/time | |
| fc_aimode | choice | `off`, `draft` (AI drafts, human sends), `auto` (AI sends for allowed intents only) |
| fc_topic / fc_sentiment | string 200 / choice (`positive`, `neutral`, `negative`) | AI-classified |
| fc_summary | multiline 2000 | AI-maintained thread summary |
| fc_source + fc_externalid | | `whatsapp` + customer `wa_id`; alternate key |

### fc_message

Retention: message bodies are kept for **12 months**. A daily scheduled flow
first folds older messages into the conversation's `fc_summary` and a monthly
`fc_activity` digest, then deletes the `fc_message` rows. Summaries, intents
and counts remain available to the AI indefinitely.


| Column | Type | Notes |
|---|---|---|
| fc_company / fc_conversation | lookups | required |
| fc_direction | choice | `inbound`, `outbound` |
| fc_author | choice | `customer`, `human`, `ai` |
| fc_kind | choice | `text`, `image`, `document`, `audio`, `template`, `other` |
| fc_body | multiline 4000 | |
| fc_templatename | string 200 | for template sends outside the 24-hour window |
| fc_deliverystatus | choice | `sent`, `delivered`, `read`, `failed` |
| fc_occurredon | date/time | |
| fc_intent + fc_confidence | string 100 + decimal | AI classification of inbound messages |
| fc_approvedby | lookup → fc_profile | who approved an AI draft |
| fc_externalid | string 200 | WhatsApp message id (`wamid`); alternate key with company |

## 5. AI layer

### fc_aiinsight: a finding the AI produced, with its evidence

| Column | Type | Notes |
|---|---|---|
| fc_company | lookup | required |
| fc_kind | choice | `summary`, `recommendation`, `risk`, `opportunity`, `anomaly`, `duplicate` |
| fc_name | string 300 | primary name: the title |
| fc_body | multiline 10000 | |
| fc_evidence | multiline 10000 | JSON: which tools ran and which record ids and figures were used |
| fc_campaign / fc_contact / fc_opportunity / fc_conversation | lookups | subject(s) of the insight |
| fc_origin | choice | `assistant` (asked in chat), `scheduled` (daily/weekly job) |
| fc_status | choice | `new`, `accepted`, `dismissed`, `done` |
| fc_expireson | date/time | stale insights drop out of the feed |

### fc_aiaction: anything with side effects waits here for approval

| Column | Type | Notes |
|---|---|---|
| fc_company | lookup | required |
| fc_kind | choice | `send_whatsapp`, `create_odoo_activity`, `update_odoo_stage`, `create_calendar_item`, `update_campaign` |
| fc_payload | multiline 10000 | JSON the executor runs once approved |
| fc_insight | lookup → fc_aiinsight | why it was proposed |
| fc_status | choice | `proposed`, `approved`, `rejected`, `executed`, `failed` |
| fc_decidedby + fc_decidedon | lookup → fc_profile + date/time | |
| fc_executedon + fc_result | date/time + multiline 4000 | |

Automatic execution without approval is limited to WhatsApp replies in
`auto` mode, for intents on an explicit allow-list, above a confidence
threshold, inside the 24-hour window. Everything else goes through `fc_aiaction`.

### fc_syncstate: sync health per company, source and entity

| Column | Type | Notes |
|---|---|---|
| fc_company | lookup | required |
| fc_source | choice (fc_source) | |
| fc_entity | string 100 | e.g. `crm.lead`, `res.partner` |
| fc_cursor | string 200 | last Odoo `write_date` or similar, for incremental sync |
| fc_lastrunon / fc_status / fc_lasterror | date/time / choice (`ok`, `failed`) / multiline 4000 | shown in Settings |

## AI tools

The assistant gets tools, not a data dump. Each tool is a Dataverse query run
by the app, **always filtered to the user's active company by the app itself**;
the model never chooses the company.

| Tool | Returns | Available from |
|---|---|---|
| `get_company_context` | memory: profile, products, segments, key messages | now |
| `list_content(period, status)` | calendar and library items with scores | now |
| `get_publishing_results(period)` | Buffer post results | now |
| `list_campaigns(status)` / `get_campaign(id, period)` | campaign with KPIs vs targets and daily metrics | feature 1 |
| `search_contacts(query)` / `get_contact_timeline(id)` | contact and recent `fc_activity` | feature 2 |
| `get_pipeline_summary(period)` / `list_opportunities(filters)` | stage totals, stale deals, won/lost | feature 2 |
| `list_conversations(filters)` / `get_conversation(id)` | threads, summaries, recent messages | feature 3 |
| `propose_action(kind, payload)` | creates an `fc_aiaction`, never executes | all |

Every answer records the tools it called in `fc_evidence`, so users can check
the figures behind a recommendation.

Tools return only what exists. When a source has no data for the question (a
contact with no CRM history, a campaign with no paid results), the tool says so
and the assistant states the gap in its answer instead of filling it in.

## Security note

Today companies are separated by the `fc_company` filter the app applies
(`single-environment-company-partition`). CRM and WhatsApp data are more
sensitive than marketing content. Before Odoo or WhatsApp data arrives, decide
whether that is enough, or whether each company should become a Dataverse
business unit or owner team, so the platform enforces the separation even
outside the app.

## Decisions

| Question | Decision |
|---|---|
| Custom `fc_contact` or standard Contact/Account | **Custom `fc_contact`**: FlowCom does not use Dynamics 365, and custom tables keep the same company partition as every other FlowCom table |
| Currency | **Per company**, default **XAF**, changeable in company settings (`fc_company.fc_currency`) |
| WhatsApp message retention | **12 months** of message bodies, then summaries only (see `fc_message`) |
| Paid advertising | **Organic first.** Campaign results come from Buffer and manual entry. Paid campaign types, budgets and ad-platform sources stay in the model but are hidden in the UI until an ad platform is chosen and connected as a later feature |
