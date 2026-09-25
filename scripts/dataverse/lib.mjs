// Shared helpers for FlowCom Dataverse schema scripts. See create-core-tables.mjs.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

export const ORG = 'https://org160fcf6d.crm3.dynamics.com'
export const SOLUTION = 'FlowComcore'
const LANG = 1033
const OPTION_PREFIX = 122370000
export const SOURCE_VALUES = ['manual', 'flowcom', 'buffer', 'odoo', 'whatsapp', 'meta_ads', 'google_ads', 'linkedin_ads']
export const DRY_RUN = process.argv.includes('--dry-run')

// ─── Dataverse helpers ────────────────────────────────────────────────────────

// Terminals opened before the Azure CLI was installed may not have it on PATH;
// fall back to its default Windows install location.
const WINDOWS_AZ = 'C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd'
const AZ = process.platform === 'win32' && existsSync(WINDOWS_AZ) ? `"${WINDOWS_AZ}"` : 'az'
const token = execSync(`${AZ} account get-access-token --resource ${ORG} --query accessToken -o tsv`, { encoding: 'utf8', shell: true }).trim()

// Metadata calls carry the solution header so new components land in FlowCom core;
// passing `extraHeaders` (for data rows) sends only the headers given plus the basics.
export async function api(method, path, body, extraHeaders) {
  const res = await fetch(`${ORG}/api/data/v9.2/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-Version': '4.0',
      ...(extraHeaders ?? { 'MSCRM.SolutionUniqueName': SOLUTION }),
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

export const done = []
export async function step(description, run) {
  if (DRY_RUN) { console.log(`[plan] ${description}`); return }
  await run()
  done.push(description)
  console.log(`[done] ${description}`)
}

let sourceOptionSetId = null
export async function ensureSourceChoice() {
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

export function attributeBody([logical, display, type, opts = {}]) {
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
      return { ...base, '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', Precision: opts.precision ?? 2, MinValue: opts.min ?? -100000000000, MaxValue: opts.max ?? 100000000000 }
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

export async function ensureColumn(table, column) {
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

export async function ensureTable(spec) {
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

export async function ensureKey(table, [logical, display, attributes]) {
  const existing = await api('GET', `EntityDefinitions(LogicalName='${table}')/Keys(LogicalName='${logical}')?$select=LogicalName`)
  if (existing) { console.log(`[skip] key ${table}.${logical} exists`); return }
  await step(`create alternate key ${table}.${logical} (${attributes.join(', ')})`, () => api('POST', `EntityDefinitions(LogicalName='${table}')/Keys`, {
    SchemaName: schemaName(logical), DisplayName: label(display), KeyAttributes: attributes,
  }))
}


// Creates missing tables, columns, lookups and keys, then publishes.
export async function runSchema({ tables = [], extend = [], requires = [] }) {
  console.log(`${DRY_RUN ? 'DRY RUN - nothing will change' : 'APPLYING'} in ${ORG}, solution ${SOLUTION}
`)
  for (const target of requires) {
    if (!await api('GET', `EntityDefinitions(LogicalName='${target}')?$select=LogicalName`)) throw new Error(`Expected existing table ${target} was not found`)
  }
  await ensureSourceChoice()
  for (const spec of tables) await ensureTable(spec)
  for (const spec of tables) for (const column of spec.columns) await ensureColumn(spec.name, column)
  for (const [table, column] of extend) await ensureColumn(table, column)
  for (const spec of tables) for (const key of spec.keys ?? []) await ensureKey(spec.name, key)
  if (!DRY_RUN && done.length) {
    const entities = [...new Set([...tables.map(t => t.name), ...extend.map(([t]) => t)])]
    const xml = `<importexportxml><entities>${entities.map(e => `<entity>${e}</entity>`).join('')}</entities><optionsets><optionset>fc_source</optionset></optionsets></importexportxml>`
    await api('POST', 'PublishXml', { ParameterXml: xml })
    console.log('[done] published customizations')
  }
}
