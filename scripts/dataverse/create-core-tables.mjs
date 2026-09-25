#!/usr/bin/env node
// Creates the shared-core, campaign and AI-layer tables described in
// docs/ai-data-model.md inside the "FlowCom core" solution.
//
//   node scripts/dataverse/create-core-tables.mjs --dry-run   # show the plan, change nothing
//   node scripts/dataverse/create-core-tables.mjs             # create what is missing, then publish
//
// Requires the Azure CLI signed in to the FlowCom tenant (`az login`).
// Idempotent: existing choices, tables, columns, relationships and keys are skipped.

import { execSync } from 'node:child_process'

const ORG = 'https://org160fcf6d.crm3.dynamics.com'
const SOLUTION = 'FlowComcore'
const LANG = 1033
const OPTION_PREFIX = 122370000
const DRY_RUN = process.argv.includes('--dry-run')

// ─── Model ────────────────────────────────────────────────────────────────────
// Column tuple: [logicalName, displayName, type, options]
// Types: string, email, phone, multiline, int, decimal, bool, datetime, dateonly,
//        choice (values), multichoice (values), source (global fc_source choice), lookup (target)

const SOURCE_VALUES = ['manual', 'flowcom', 'buffer', 'odoo', 'whatsapp', 'meta_ads', 'google_ads', 'linkedin_ads']
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

// ─── Dataverse helpers ────────────────────────────────────────────────────────

const token = execSync(`az account get-access-token --resource ${ORG} --query accessToken -o tsv`, { encoding: 'utf8', shell: true }).trim()

async function api(method, path, body) {
  const res = await fetch(`${ORG}/api/data/v9.2/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-Version': '4.0',
      'MSCRM.SolutionUniqueName': SOLUTION,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 404 && method === 'GET') return null
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : {}
}

const label = text => ({ LocalizedLabels: [{ Label: text, LanguageCode: LANG }] })
const schemaName = logical => logical.replace(/^fc_/, 'fc_').replace(/^fc_(.)/, (_, c) => `fc_${c.toUpperCase()}`)
const required = opts => ({ Value: opts?.required ? 'ApplicationRequired' : 'None' })
const options = values => values.map((v, i) => ({ Value: OPTION_PREFIX + i, Label: label(v) }))

const done = []
async function step(description, run) {
  if (DRY_RUN) { console.log(`[plan] ${description}`); return }
  await run()
  done.push(description)
  console.log(`[done] ${description}`)
}

let sourceOptionSetId = null
async function ensureSourceChoice() {
  const existing = await api('GET', `GlobalOptionSetDefinitions(Name='fc_source')`)
  if (existing) { sourceOptionSetId = existing.MetadataId; console.log('[skip] global choice fc_source exists'); return }
  await step('create global choice fc_source', async () => {
    await api('POST', 'GlobalOptionSetDefinitions', {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      Name: 'fc_source', DisplayName: label('Source'), IsGlobal: true, OptionSetType: 'Picklist',
      Options: options(SOURCE_VALUES),
    })
    sourceOptionSetId = (await api('GET', `GlobalOptionSetDefinitions(Name='fc_source')`)).MetadataId
  })
}

function attributeBody([logical, display, type, opts = {}]) {
  const base = { SchemaName: schemaName(logical), DisplayName: label(display), RequiredLevel: required(opts) }
  switch (type) {
    case 'string': case 'email': case 'phone':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', MaxLength: opts.maxLength ?? 200,
        FormatName: { Value: type === 'email' ? 'Email' : type === 'phone' ? 'Phone' : 'Text' } }
    case 'multiline':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', MaxLength: opts.maxLength ?? 4000, Format: 'TextArea' }
    case 'int':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', MinValue: 0, MaxValue: 2147483647, Format: 'None' }
    case 'decimal':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', Precision: 2, MinValue: -100000000000, MaxValue: 100000000000 }
    case 'bool':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', DefaultValue: false,
        OptionSet: { TrueOption: { Value: 1, Label: label('Yes') }, FalseOption: { Value: 0, Label: label('No') } } }
    case 'datetime':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', Format: 'DateAndTime', DateTimeBehavior: { Value: 'UserLocal' } }
    case 'dateonly':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', Format: 'DateOnly', DateTimeBehavior: { Value: 'DateOnly' } }
    case 'choice':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
        OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false, OptionSetType: 'Picklist', Options: options(opts.values) } }
    case 'multichoice':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata',
        OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false, OptionSetType: 'Picklist', Options: options(opts.values) } }
    case 'source':
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
        'GlobalOptionSet@odata.bind': `/GlobalOptionSetDefinitions(${sourceOptionSetId ?? '00000000-0000-0000-0000-000000000000'})` }
    default:
      throw new Error(`Unknown column type ${type} for ${logical}`)
  }
}

async function ensureColumn(table, column) {
  const [logical, display, type, opts = {}] = column
  const existing = await api('GET', `EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${logical}')?$select=LogicalName`)
  if (existing) { console.log(`[skip] ${table}.${logical} exists`); return }
  if (type === 'lookup') {
    const target = await api('GET', `EntityDefinitions(LogicalName='${opts.target}')?$select=PrimaryIdAttribute`)
    const pk = target?.PrimaryIdAttribute ?? `${opts.target}id`
    await step(`create lookup ${table}.${logical} -> ${opts.target}`, () => api('POST', 'RelationshipDefinitions', {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: `${opts.target}_${table}_${logical}`,
      ReferencedEntity: opts.target,
      ReferencedAttribute: pk,
      ReferencingEntity: table,
      CascadeConfiguration: {
        Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade',
        Share: 'NoCascade', Unshare: 'NoCascade', RollupView: 'NoCascade',
      },
      Lookup: {
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        AttributeType: 'Lookup', AttributeTypeName: { Value: 'LookupType' },
        SchemaName: schemaName(logical), DisplayName: label(display), RequiredLevel: required(opts),
      },
    }))
    return
  }
  await step(`create column ${table}.${logical} (${type})`, () => api('POST', `EntityDefinitions(LogicalName='${table}')/Attributes`, attributeBody(column)))
}

async function ensureTable(spec) {
  const existing = await api('GET', `EntityDefinitions(LogicalName='${spec.name}')?$select=LogicalName`)
  if (existing) { console.log(`[skip] table ${spec.name} exists`); return }
  const [pName, pDisplay, pLength] = spec.primary
  await step(`create table ${spec.name} (${spec.display})`, () => api('POST', 'EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: schemaName(spec.name),
    DisplayName: label(spec.display),
    DisplayCollectionName: label(spec.plural),
    Description: label(spec.description),
    OwnershipType: 'UserOwned',
    HasActivities: false,
    HasNotes: false,
    IsActivity: false,
    Attributes: [{
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName(pName), IsPrimaryName: true, MaxLength: pLength,
      FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'None' }, DisplayName: label(pDisplay),
    }],
  }))
}

async function ensureKey(table, [logical, display, attributes]) {
  const existing = await api('GET', `EntityDefinitions(LogicalName='${table}')/Keys(LogicalName='${logical}')?$select=LogicalName`)
  if (existing) { console.log(`[skip] key ${table}.${logical} exists`); return }
  await step(`create alternate key ${table}.${logical} (${attributes.join(', ')})`, () => api('POST', `EntityDefinitions(LogicalName='${table}')/Keys`, {
    SchemaName: schemaName(logical), DisplayName: label(display), KeyAttributes: attributes,
  }))
}

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log(`${DRY_RUN ? 'DRY RUN - nothing will change' : 'APPLYING'} in ${ORG}, solution ${SOLUTION}\n`)

for (const target of ['fc_company', 'fc_audiencesegment', 'fc_keymessage', 'fc_flowcomprofile', 'fc_calendaritem', 'fc_libraryitem']) {
  if (!await api('GET', `EntityDefinitions(LogicalName='${target}')?$select=LogicalName`)) throw new Error(`Expected existing table ${target} was not found`)
}

await ensureSourceChoice()
// Tables first, so lookups between new tables can resolve in any order.
for (const spec of TABLES) await ensureTable(spec)
for (const spec of TABLES) for (const column of spec.columns) await ensureColumn(spec.name, column)
for (const [table, column] of EXTEND) await ensureColumn(table, column)
for (const spec of TABLES) for (const key of spec.keys ?? []) await ensureKey(spec.name, key)

if (!DRY_RUN && done.length) {
  const entities = [...new Set([...TABLES.map(t => t.name), ...EXTEND.map(([t]) => t)])]
  const xml = `<importexportxml><entities>${entities.map(e => `<entity>${e}</entity>`).join('')}</entities><optionsets><optionset>fc_source</optionset></optionsets></importexportxml>`
  await api('POST', 'PublishXml', { ParameterXml: xml })
  console.log('[done] published customizations')
}

console.log(`\n${DRY_RUN ? 'Plan complete.' : `Finished: ${done.length} change(s).`}`)
