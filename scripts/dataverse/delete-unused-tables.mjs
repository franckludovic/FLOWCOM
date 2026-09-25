#!/usr/bin/env node
// Deletes leftover tables that FlowCom does not use: three duplicate
// "Company Secrets" tables (the real one is fc_companysecrets1) and two
// placeholder tables. Deleting a table is permanent and removes its data, so a
// table is skipped when it still has rows or when components outside it
// depend on it.
//
//   node scripts/dataverse/delete-unused-tables.mjs --dry-run
//   node scripts/dataverse/delete-unused-tables.mjs

import { api, DRY_RUN } from './lib.mjs'

const TABLES = [
  'fc_companysecret',     // duplicate Company Secrets (Company as plain text)
  'fc_companysecrets',    // duplicate Company Secrets (token in the name column)
  'fc_fc_companysecret',  // empty duplicate
  'fc_table1',            // placeholder
  'fc_table3',            // placeholder
]
const KEEP = 'fc_companysecrets1'

const data = {} // plain data request headers (no solution header)

console.log(`${DRY_RUN ? 'DRY RUN - nothing will change' : 'APPLYING'}; kept: ${KEEP}\n`)
let deleted = 0

for (const logical of TABLES) {
  const meta = await api('GET', `EntityDefinitions(LogicalName='${logical}')?$select=MetadataId,EntitySetName,DisplayName`)
  if (!meta) { console.log(`[skip] ${logical}: not found (already deleted)`); continue }
  const name = meta.DisplayName?.UserLocalizedLabel?.Label ?? logical

  const rows = (await api('GET', `${meta.EntitySetName}?$select=createdon&$top=50`, undefined, data))?.value?.length ?? 0
  if (rows > 0) { console.log(`[keep] ${logical} (${name}): has ${rows}${rows === 50 ? '+' : ''} row(s); not deleting`); continue }

  // Components elsewhere (flows, apps, other tables) that would block or break on delete.
  const deps = await api('GET', `RetrieveDependenciesForDelete(ObjectId=${meta.MetadataId},ComponentType=1)`)
  const blocking = (deps?.value ?? []).filter(d => d.dependentcomponentparentid !== meta.MetadataId)
  if (blocking.length) {
    console.log(`[keep] ${logical} (${name}): ${blocking.length} outside dependenc(ies); not deleting`)
    for (const d of blocking.slice(0, 5)) console.log(`         type ${d.dependentcomponenttype} id ${d.dependentcomponentobjectid}`)
    continue
  }

  if (DRY_RUN) { console.log(`[plan] delete ${logical} (${name}): empty, no outside dependencies`); continue }
  await api('DELETE', `EntityDefinitions(${meta.MetadataId})`)
  deleted++
  console.log(`[done] deleted ${logical} (${name})`)
}

console.log(`\n${DRY_RUN ? 'Plan complete.' : `Finished: ${deleted} table(s) deleted.`}`)
