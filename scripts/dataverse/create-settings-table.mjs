#!/usr/bin/env node
// Creates fc_appsetting: one record per installation holding its theme (brand
// colours, logo, fonts, corner style, density) and its enabled modules, both as
// JSON. See docs/product-brief.md, "Installations, companies and modules".
//
//   node scripts/dataverse/create-settings-table.mjs --dry-run
//   node scripts/dataverse/create-settings-table.mjs

import { DRY_RUN, done, runSchema } from './lib.mjs'

const TABLES = [
  {
    name: 'fc_appsetting', display: 'App Setting', plural: 'App Settings', primary: ['fc_name', 'Name', 200],
    description: 'Installation-wide settings: the theme and the enabled modules. One record, fc_key "installation".',
    columns: [
      ['fc_key', 'Key', 'string', { maxLength: 100, required: true }],
      ['fc_theme', 'Theme (JSON)', 'multiline', { maxLength: 20000 }],
      ['fc_modules', 'Enabled modules (JSON)', 'multiline', { maxLength: 4000 }],
    ],
    keys: [['fc_appsettingkey', 'Setting key', ['fc_key']]],
  },
]

await runSchema({ tables: TABLES, requires: [] })
console.log(`\n${DRY_RUN ? 'Plan complete.' : `Finished: ${done.length} change(s).`}`)
