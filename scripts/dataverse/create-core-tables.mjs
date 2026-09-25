#!/usr/bin/env node
// Creates the shared-core, campaign and AI-layer tables described in
// docs/ai-data-model.md inside the "FlowCom core" solution.
//
//   node scripts/dataverse/create-core-tables.mjs --dry-run   # show the plan, change nothing
//   node scripts/dataverse/create-core-tables.mjs             # create what is missing, then publish
//
// Requires the Azure CLI signed in to the FlowCom tenant (`az login`).
// Idempotent: existing choices, tables, columns, relationships and keys are skipped.

import { DRY_RUN, done, runSchema } from './lib.mjs'

// ─── Model ────────────────────────────────────────────────────────────────────
// Column tuple: [logicalName, displayName, type, options]
// Types: string, email, phone, multiline, int, decimal, bool, datetime, dateonly,
//        choice (values), multichoice (values), source (global fc_source choice), lookup (target)

const CHANNELS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'whatsapp', 'google']

const company = ['fc_company', 'Company', 'lookup', { target: 'fc_company', required: true }]

const TABLES = [
  {
    name: 'fc_contact', display: 'Contact', plural: 'Contacts', primary: ['fc_name', 'Name', 200],
    description: 'A person or organization the company deals with, linked to every source that knows them.',
    columns: [
      company,
      ['fc_kind', 'Kind', 'choice', { values: ['person', 'organization'] }],
      ['fc_organization', 'Organization', 'lookup', { target: 'fc_contact' }],
      ['fc_phone', 'Phone (E.164)', 'phone', { maxLength: 30 }],
      ['fc_email', 'Email', 'email', { maxLength: 320 }],
      ['fc_city', 'City', 'string', { maxLength: 100 }],
      ['fc_country', 'Country', 'string', { maxLength: 100 }],
      ['fc_segment', 'Audience segment', 'lookup', { target: 'fc_audiencesegment' }],
      ['fc_lifecyclestage', 'Lifecycle stage', 'choice', { values: ['lead', 'prospect', 'customer', 'inactive'] }],
      ['fc_firstsource', 'First source', 'source'],
      ['fc_whatsappconsent', 'WhatsApp consent', 'bool'],
      ['fc_whatsappconsenton', 'WhatsApp consent on', 'datetime'],
      ['fc_lastactivityon', 'Last activity on', 'datetime'],
      ['fc_summary', 'Summary', 'multiline', { maxLength: 2000 }],
    ],
  },
  {
    name: 'fc_contactidentity', display: 'Contact Identity', plural: 'Contact Identities', primary: ['fc_name', 'Handle', 320],
    description: 'How one source (Odoo, WhatsApp, ads, ...) refers to a contact.',
    columns: [
      company,
      ['fc_contact', 'Contact', 'lookup', { target: 'fc_contact', required: true }],
      ['fc_source', 'Source', 'source', { required: true }],
      ['fc_externalid', 'External ID', 'string', { maxLength: 200, required: true }],
    ],
    keys: [['fc_companysourceexternalid', 'Company, source and external ID', ['fc_company', 'fc_source', 'fc_externalid']]],
  },
  {
    name: 'fc_campaign', display: 'Campaign', plural: 'Campaigns', primary: ['fc_name', 'Name', 200],
    description: 'A marketing campaign with its objective, channels, targets and brief.',
    columns: [
      company,
      ['fc_objective', 'Objective', 'choice', { values: ['awareness', 'engagement', 'leads', 'sales', 'retention'] }],
      ['fc_type', 'Type', 'choice', { values: ['organic', 'paid', 'mixed'] }],
      ['fc_status', 'Status', 'choice', { values: ['draft', 'planned', 'active', 'paused', 'completed', 'cancelled'] }],
      ['fc_startdate', 'Start date', 'dateonly'],
      ['fc_enddate', 'End date', 'dateonly'],
      ['fc_channels', 'Channels', 'multichoice', { values: CHANNELS }],
      ['fc_segment', 'Audience segment', 'lookup', { target: 'fc_audiencesegment' }],
      ['fc_keymessage', 'Key message', 'lookup', { target: 'fc_keymessage' }],
      ['fc_budget', 'Budget', 'decimal'],
      ['fc_currency', 'Currency', 'string', { maxLength: 3 }],
      ['fc_targetleads', 'Target leads', 'int'],
      ['fc_targetrevenue', 'Target revenue', 'decimal'],
      ['fc_targetreach', 'Target reach', 'int'],
      ['fc_trackingcode', 'Tracking code', 'string', { maxLength: 100 }],
      ['fc_brief', 'Brief', 'multiline', { maxLength: 10000 }],
      ['fc_summary', 'Summary', 'multiline', { maxLength: 2000 }],
    ],
  },
  {
    name: 'fc_campaignmetric', display: 'Campaign Metric', plural: 'Campaign Metrics', primary: ['fc_name', 'Name', 200],
    description: 'Daily campaign results per channel and source.',
    columns: [
      company,
      ['fc_campaign', 'Campaign', 'lookup', { target: 'fc_campaign', required: true }],
      ['fc_date', 'Date', 'dateonly', { required: true }],
      ['fc_channel', 'Channel', 'choice', { values: CHANNELS, required: true }],
      ['fc_source', 'Source', 'source', { required: true }],
      ['fc_impressions', 'Impressions', 'int'],
      ['fc_reach', 'Reach', 'int'],
      ['fc_clicks', 'Clicks', 'int'],
      ['fc_engagements', 'Engagements', 'int'],
      ['fc_leads', 'Leads', 'int'],
      ['fc_conversions', 'Conversions', 'int'],
      ['fc_spend', 'Spend', 'decimal'],
      ['fc_revenue', 'Revenue', 'decimal'],
    ],
    keys: [['fc_campaigndatechannelsource', 'Campaign, date, channel and source', ['fc_campaign', 'fc_date', 'fc_channel', 'fc_source']]],
  },
  {
    name: 'fc_activity', display: 'Timeline Event', plural: 'Timeline Events', primary: ['fc_name', 'Title', 300],
    description: 'Unified timeline: what happened, from any source.',
    columns: [
      company,
      ['fc_occurredon', 'Occurred on', 'datetime', { required: true }],
      ['fc_type', 'Type', 'choice', { values: ['message_in', 'message_out', 'opportunity_created', 'stage_changed', 'deal_won', 'deal_lost', 'post_published', 'campaign_started', 'campaign_ended', 'note', 'ai_action_executed'] }],
      ['fc_source', 'Source', 'source', { required: true }],
      ['fc_contact', 'Contact', 'lookup', { target: 'fc_contact' }],
      ['fc_campaign', 'Campaign', 'lookup', { target: 'fc_campaign' }],
      ['fc_summary', 'Summary', 'multiline', { maxLength: 2000 }],
      ['fc_amount', 'Amount', 'decimal'],
      ['fc_currency', 'Currency', 'string', { maxLength: 3 }],
      ['fc_externalid', 'External ID', 'string', { maxLength: 200 }],
    ],
  },
  {
    name: 'fc_aiinsight', display: 'AI Insight', plural: 'AI Insights', primary: ['fc_name', 'Title', 300],
    description: 'A finding produced by the AI, with the evidence it was based on.',
    columns: [
      company,
      ['fc_kind', 'Kind', 'choice', { values: ['summary', 'recommendation', 'risk', 'opportunity', 'anomaly', 'duplicate'] }],
      ['fc_body', 'Body', 'multiline', { maxLength: 10000 }],
      ['fc_evidence', 'Evidence', 'multiline', { maxLength: 10000 }],
      ['fc_campaign', 'Campaign', 'lookup', { target: 'fc_campaign' }],
      ['fc_contact', 'Contact', 'lookup', { target: 'fc_contact' }],
      ['fc_origin', 'Origin', 'choice', { values: ['assistant', 'scheduled'] }],
      ['fc_status', 'Status', 'choice', { values: ['new', 'accepted', 'dismissed', 'done'] }],
      ['fc_expireson', 'Expires on', 'datetime'],
    ],
  },
  {
    name: 'fc_aiaction', display: 'AI Action', plural: 'AI Actions', primary: ['fc_name', 'Title', 300],
    description: 'An AI-proposed action with side effects, waiting for human approval.',
    columns: [
      company,
      ['fc_kind', 'Kind', 'choice', { values: ['send_whatsapp', 'create_odoo_activity', 'update_odoo_stage', 'create_calendar_item', 'update_campaign'] }],
      ['fc_payload', 'Payload', 'multiline', { maxLength: 10000 }],
      ['fc_insight', 'Insight', 'lookup', { target: 'fc_aiinsight' }],
      ['fc_status', 'Status', 'choice', { values: ['proposed', 'approved', 'rejected', 'executed', 'failed'] }],
      ['fc_decidedby', 'Decided by', 'lookup', { target: 'fc_flowcomprofile' }],
      ['fc_decidedon', 'Decided on', 'datetime'],
      ['fc_executedon', 'Executed on', 'datetime'],
      ['fc_result', 'Result', 'multiline', { maxLength: 4000 }],
    ],
  },
]

// Columns added to tables that already exist.
const EXTEND = [
  ['fc_company', ['fc_currency', 'Currency', 'string', { maxLength: 3 }]],
  ['fc_calendaritem', ['fc_campaign', 'Campaign', 'lookup', { target: 'fc_campaign' }]],
  ['fc_libraryitem', ['fc_campaign', 'Campaign', 'lookup', { target: 'fc_campaign' }]],
]

// ─── Run ──────────────────────────────────────────────────────────────────────

await runSchema({
  tables: TABLES,
  extend: EXTEND,
  requires: ['fc_company', 'fc_audiencesegment', 'fc_keymessage', 'fc_flowcomprofile', 'fc_calendaritem', 'fc_libraryitem'],
})
console.log(`
${DRY_RUN ? 'Plan complete.' : `Finished: ${done.length} change(s).`}`)
