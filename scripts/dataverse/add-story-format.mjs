#!/usr/bin/env node
// Adds "story" to the library's format choice (fc_libraryitem.fc_format), so a
// Story saved from the content generator comes back as a Story instead of a post.
//
//   node scripts/dataverse/add-story-format.mjs --dry-run
//   node scripts/dataverse/add-story-format.mjs

import { DRY_RUN, SOLUTION, api, done, step } from './lib.mjs'

const TABLE = 'fc_libraryitem'
const COLUMN = 'fc_format'
const STORY = 122370003

const attr = await api('GET', `EntityDefinitions(LogicalName='${TABLE}')/Attributes(LogicalName='${COLUMN}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`)
if (!attr) throw new Error(`${TABLE}.${COLUMN} not found`)

if (attr.OptionSet.Options.some(o => o.Value === STORY)) {
  console.log('[skip] the story option already exists')
} else {
  await step(`add option ${STORY} "story" to ${TABLE}.${COLUMN}`, () => api('POST', 'InsertOptionValue', {
    EntityLogicalName: TABLE,
    AttributeLogicalName: COLUMN,
    Value: STORY,
    Label: { LocalizedLabels: [{ Label: 'story', LanguageCode: 1033 }] },
    SolutionUniqueName: SOLUTION,
  }))
  await step(`publish ${TABLE}`, () => api('POST', 'PublishXml', {
    ParameterXml: `<importexportxml><entities><entity>${TABLE}</entity></entities></importexportxml>`,
  }))
}

console.log(`\n${DRY_RUN ? 'Plan complete.' : `Finished: ${done.length} change(s).`}`)
