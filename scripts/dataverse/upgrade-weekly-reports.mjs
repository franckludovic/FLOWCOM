#!/usr/bin/env node
// Gives fc_weeklyreport room for a real report. Its existing text columns hold
// only 100 characters in the database, far too little for a week's posts and
// the AI diagnostic, so the report moves to long-text columns plus the week's
// start date. The old columns are left in place, unused.
//
//   node scripts/dataverse/upgrade-weekly-reports.mjs --dry-run
//   node scripts/dataverse/upgrade-weekly-reports.mjs
//
// Afterwards, refresh the app's data source so the new columns are known:
//   npx pa app refresh data-source

import { DRY_RUN, done, runSchema } from './lib.mjs'

const EXTEND = [
  ['fc_weeklyreport', ['fc_weekstart', 'Week start', 'dateonly']],
  ['fc_weeklyreport', ['fc_postsdata', 'Posts (JSON)', 'multiline', { maxLength: 100000 }]],
  ['fc_weeklyreport', ['fc_analysisdata', 'AI diagnostic (JSON)', 'multiline', { maxLength: 20000 }]],
  ['fc_weeklyreport', ['fc_scoresdata', 'Score breakdown (JSON)', 'multiline', { maxLength: 4000 }]],
]

await runSchema({ extend: EXTEND, requires: ['fc_weeklyreport'] })
console.log(`\n${DRY_RUN ? 'Plan complete.' : `Finished: ${done.length} change(s).`}`)
