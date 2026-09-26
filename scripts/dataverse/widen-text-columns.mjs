#!/usr/bin/env node
// Gives the content columns of the library, calendar and company memory
// (company, products, audiences, key messages) their real size.
// Their metadata says 4,000 characters but the database columns were left at
// 100 (DatabaseLength 200 bytes), so any real post was refused with
// "String or binary data would be truncated". This sets each column's size,
// publishes, then reads the database length back to confirm.
//
//   node scripts/dataverse/widen-text-columns.mjs --dry-run
//   node scripts/dataverse/widen-text-columns.mjs

import { DRY_RUN, SOLUTION, api, done, step } from './lib.mjs'

const TARGET = 4000
const CAST = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'

// Only the columns that hold written content. Codes, lookups' name columns and
// the primary name keep their size.
const COLUMNS = {
  fc_libraryitem: ['fc_title', 'fc_hook', 'fc_episodecontext', 'fc_body', 'fc_conclusion', 'fc_reward', 'fc_calltoaction', 'fc_hashtags', 'fc_visualidea', 'fc_videoscript', 'fc_channel', 'fc_tone'],
  fc_calendaritem: ['fc_topic', 'fc_goal', 'fc_channel'],
  // Company memory (the odd names are the columns' real names in Dataverse).
  fc_company: ['fc_ndustry', 'fc_ebsite', 'fc_ocation', 'fc_hortdescription', 'fc_ission', 'fc_ision', 'fc_alues', 'fc_one', 'fc_argets', 'fc_hannels', 'fc_ublishingfrequency', 'fc_eamsize', 'fc_oundedyear'],
  fc_product: ['fc_description'],
  fc_audiencesegment: ['fc_painpoints', 'fc_interests'],
  fc_keymessage: ['fc_content'],
}

const headers = { 'MSCRM.SolutionUniqueName': SOLUTION, 'MSCRM.MergeLabels': 'true' }
const path = (table, column) => `EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${column}')/${CAST}`
const read = (table, column) => api('GET', `${path(table, column)}?$select=LogicalName,MaxLength,DatabaseLength`)
const setSize = async (table, column, size) => {
  const full = await api('GET', path(table, column))
  full.MaxLength = size
  await api('PUT', path(table, column), full, headers)
}
const publish = tables => api('POST', 'PublishXml', {
  ParameterXml: `<importexportxml><entities>${tables.map(t => `<entity>${t}</entity>`).join('')}</entities></importexportxml>`,
})
// DatabaseLength is in bytes: two per character.
const isWide = attr => (attr.DatabaseLength ?? 0) >= TARGET * 2

const pending = []
for (const [table, columns] of Object.entries(COLUMNS)) {
  for (const column of columns) {
    const attr = await read(table, column)
    if (!attr) { console.log(`[skip] ${table}.${column} not found`); continue }
    if (isWide(attr) && attr.MaxLength >= TARGET) { console.log(`[ok]   ${table}.${column} (${attr.MaxLength} characters)`); continue }
    pending.push({ table, column, attr })
  }
}

if (!pending.length) {
  console.log('\nEvery content column already has its full size.')
  process.exit(0)
}

for (const { table, column, attr } of pending) {
  await step(`resize ${table}.${column} (metadata ${attr.MaxLength}, database ${attr.DatabaseLength / 2} characters) to ${TARGET}`, async () => {
    // When the metadata already says 4,000, saving the same value may change
    // nothing; step down one character first so Dataverse resizes the column.
    if (attr.MaxLength >= TARGET) await setSize(table, column, TARGET - 1)
    await setSize(table, column, TARGET)
  })
}

const tables = [...new Set(pending.map(p => p.table))]
await step(`publish ${tables.join(', ')}`, () => publish(tables))

if (!DRY_RUN) {
  console.log('\nChecking the database size again:')
  let short = 0
  for (const { table, column } of pending) {
    const attr = await read(table, column)
    const ok = isWide(attr)
    if (!ok) short++
    console.log(`${ok ? '[ok]  ' : '[STILL SHORT]'} ${table}.${column}: ${attr.DatabaseLength / 2} characters in the database`)
  }
  if (short) console.log(`\n${short} column(s) are still short. Send this output to Claude.`)
}

console.log(`\n${DRY_RUN ? 'Plan complete.' : `Finished: ${done.length} change(s).`}`)
