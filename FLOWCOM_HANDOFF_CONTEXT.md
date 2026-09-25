# FlowCom handoff context

Updated: 2026-09-25 (Africa/Douala)

Continuation brief for a future session or another model: what FlowCom is, how
it is built, where everything lives, and what comes next. It contains no API
keys, tokens or passwords; never add any.

## Goal

FlowCom integrates AI into the company's marketing work and supports
data-driven decisions. The AI must see context across every source (content,
campaigns, social publishing, and later Odoo CRM and WhatsApp) through one
linked data model, while people stay in control of every change.

## Status

The migration from Supabase to Power Platform is **complete**: no Supabase
code, functions or dependencies remain. Working today:

- Company memory, editorial calendar, content generator, library, Studio
  (publishing via Buffer), weekly report, roadmap, publishing history.
- Settings page (⚙ in the top bar): one row per role (AI model, social
  publishing); providers are options inside a role.
- Campaigns: list, editor, KPIs against targets, AI brief and analysis,
  Buffer and manual results, linked content, geographic target zones.
  Campaigns steer Studio, the Content Generator and the Calendar (channels,
  dates, brief, UTM-tagged links, automatic linking).
- AI assistant (✨ in the top bar): tool-based answers with charts, tables,
  images and sources; proposed actions that run only after approval; weekly
  digest; saved conversations.

## Environment

| Item | Value |
|---|---|
| Power Platform environment | Franck's Env, `7a0e4eed-419e-ec1f-b18f-db53cd2b62f3` |
| Dataverse org | `https://org160fcf6d.crm3.dynamics.com` |
| Solution | FlowCom core, unique name `FlowComcore`, publisher prefix `fc`, choice values start at `122370000` |
| Code app | `ee37bbf2-90e2-4725-95f3-5ef5cd4f2575` |
| Repository | `C:\Users\Metatron\Desktop\FLOWCOM` (Vite, React, TypeScript), branch `main` |

Identity comes from the Power Apps host (Microsoft Entra, `getContext()`).
FlowCom has no sign-in of its own; plain `npm run dev` shows the "open from
Power Apps" page. Use `npm run power:run` locally.

## Cloud flows (all in FlowCom core)

| Flow | Inputs (generated names) | Does |
|---|---|---|
| **SaveCompanySecret** | `text` companyId, `text_1` provider name (`Groq`, `Buffer`), `text_2` secret | Upserts the company's row in Company Secrets (`fc_companysecrets1`). Provider choice from the input: Buffer → 122370001, otherwise Groq 122370000 |
| **ModelCall** | `text` companyId, `text_1` provider, `text_2` model, `text_3` messages JSON, `text_4` temperature, `text_5` max tokens, `text_6` optional `extra` JSON merged into the request (tools, tool_choice, reasoning_effort) | Reads the company's Groq key, calls `https://api.groq.com/openai/v1/chat/completions`, returns `content`, `message` (full assistant message JSON, including tool_calls) and `error`. Responds after HTTP failures too |
| **BufferCall** | `text` companyId, `text_1` GraphQL query, `text_2` variables JSON | Reads the company's Buffer token, POSTs to `https://api.buffer.com/graphql`, returns `content` (raw response JSON). Responds after HTTP failures too |

Changes to flows were made with scripts that back up the definition first
(`scripts/dataverse/upgrade-modelcall.mjs`) or by hand in the designer.

## Secrets

- Secrets live only in **Company Secrets** (`fc_companysecrets1`, entity set
  `fc_companysecrets1s`), column `fc_accesstoken`, column security enabled.
  One row per company and provider.
- The app never reads secrets. It saves them through SaveCompanySecret and
  uses them only through ModelCall and BufferCall.
- Non-secret connection status is in **Company Integrations**
  (`fc_companyintegration`): provider `buffer` 122370000 / `groq` 122370001,
  status `connected` 122370000. The app uses it to show "Connecté" after a reload.

## Data model

Full design: `docs/ai-data-model.md`. Existing marketing tables (company,
profile, membership, product, audience segment, key message, calendar item,
library item, roadmap milestone, weekly report, content score) plus:

| Batch | Tables | Created by |
|---|---|---|
| 1 | `fc_source` choice, `fc_contact`, `fc_contactidentity`, `fc_activity` (Timeline Event), `fc_campaign`, `fc_campaignmetric`, `fc_aiinsight`, `fc_aiaction`; `fc_company.fc_currency`; campaign lookups on calendar and library items | `scripts/dataverse/create-core-tables.mjs` |
| 1b | `fc_place` (seeded with Cameroon: country, 10 regions, main cities, Douala and Yaoundé neighbourhoods), `fc_zone`, `fc_zoneplace`; `fc_campaign.fc_zone`, `fc_contact.fc_place` | `scripts/dataverse/create-geo-tables.mjs` |
| 2 (Odoo) | `fc_opportunity`, `fc_syncstate` | planned |
| 3 (WhatsApp) | `fc_conversation`, `fc_message` | planned |

Rules: every table has a required `fc_company` lookup except `fc_place`
(shared reference places have none); every cross-source link is optional;
synced rows carry `fc_source` + `fc_externalid`; amounts are decimals with an
ISO currency code copied from the company (default XAF).

Schema scripts share `scripts/dataverse/lib.mjs`, are idempotent, support
`--dry-run`, and authenticate through the Azure CLI (`az login` as
`tankeu.frank@africauniv.tech`; the scripts find `az` even when it is not on PATH).
`scripts/dataverse/delete-unused-tables.mjs` removes leftover duplicate
Company Secrets tables and placeholder tables when they are empty.

## Frontend map

| Area | Files |
|---|---|
| Dataverse access | `src/lib/dataverse.ts` (existing tables), `src/lib/campaigns.ts`, `src/lib/geo.ts`, generated services in `src/generated` (regenerate with `npx pa app add data-source` / `refresh data-source` / `add flow`) |
| AI model calls | `src/lib/model.ts` (`callModel`, `callModelJSON`, `callModelWithTools`) |
| Providers and settings | `src/lib/integrations.ts` (registry, `saveCompanySecret`, `ASSISTANT_MODEL`), `src/pages/Settings.tsx` |
| Buffer | `src/lib/buffer.ts` (`bufferQuery`, `saveBufferToken`), `src/contexts/BufferContext.tsx` |
| Campaigns | `src/pages/Campaigns.tsx` (list, editor, detail, Zones tab), `src/lib/campaignContext.ts` (shared campaign logic: prompt context, warnings, UTM tagging, `useCampaignOptions`) |
| Assistant | `src/lib/assistant.ts` (tools, loop, snapshot, digest, inline tool-call recovery), `src/lib/assistantActions.ts` (propose/approve/reject), `src/components/assistant/` (panel, charts) |
| Auth and company | `src/contexts/AuthContext.tsx`, `src/contexts/CompanyContext.tsx` |

Assistant design: the model gets tools, not a data dump. The app runs every
query filtered to the active company. Display tools (`show_chart`,
`show_table`, `show_images`) and action tools (`propose_action`,
`open_in_studio`) return blocks the panel renders. Proposals are stored as AI
Actions with status `proposed` and run only when an owner, admin or editor
approves them.

## Content security policy (App (code) tab in the admin centre)

`img-src` was customised to: `'self'`, `data:`, `blob:`,
`https://buffer-channel-avatars-bucket.s3.amazonaws.com`,
`https://res.cloudinary.com`. `connect-src` is still the default; direct
browser uploads to `https://api.cloudinary.com` may need it extended; read the
exact default list from the browser console error before changing it.

## Deploy and verify

```powershell
npx tsc -b        # type-check
npm test          # vitest
npm run power:push
```

## Next steps

1. **Odoo CRM** (next feature): needs the Odoo version, hosting (Odoo Online
   needs the Custom plan for API access; Odoo.sh or self-hosted also work) and
   an API key. Plan: read-only scheduled sync of `crm.lead`, `res.partner`
   and won orders into `fc_opportunity`, `fc_contact`, `fc_contactidentity`
   and `fc_activity`, then assistant tools over the pipeline.
2. **WhatsApp Business** (Cloud API): verified Meta Business account and a
   dedicated number; webhook best hosted in the repo's `functions/` Azure
   Functions project; 24-hour reply window; AI replies in draft mode by default.
3. **Paid ads** later: zones already use the shape ad platforms accept
   (named places plus a radius).
4. **Team access**: give colleagues' security roles the new tables before
   they use campaigns, zones or the assistant.
5. **Claude** as a provider: add an Anthropic branch in ModelCall (different
   request and tool format) and an Anthropic key; the app side is ready.

## Known limitations

- Organic posts cannot be geo-restricted; zones steer content and analysis.
- Buffer app tokens may return posts without metrics; manual entry exists.
- The weekly digest is written when someone first opens the assistant that
  week, not by a scheduler.
- Saved assistant conversations are stored per device.
- Team invites were removed with Supabase; members are listed from Dataverse
  but new members are added outside FlowCom for now.
