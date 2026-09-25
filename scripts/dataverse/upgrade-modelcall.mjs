#!/usr/bin/env node
// Upgrades the ModelCall flow for tool calling (the FlowCom assistant):
//  - new optional trigger input `extra` (text_6): a JSON object merged into the
//    provider request, e.g. {"tools":[...],"tool_choice":"auto"}
//  - the response also returns `message` (the model's full message as JSON,
//    including tool_calls) and `error` (the provider's error text, if any)
//  - the response runs after HTTP failures too, so errors reach the app instead of a 502
// Existing callers that don't send `extra` get exactly the previous behaviour.
//
//   node scripts/dataverse/upgrade-modelcall.mjs --dry-run
//   node scripts/dataverse/upgrade-modelcall.mjs

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { api, DRY_RUN } from './lib.mjs'

const WORKFLOW_ID = '114fe044-12b8-f111-aaae-70a8a5114222' // ModelCall

const base = "setProperty(setProperty(setProperty(setProperty(json('{}'), 'model', triggerBody()?['text_2']), 'messages', json(triggerBody()?['text_3'])), 'temperature', float(triggerBody()?['text_4'])), 'max_tokens', int(triggerBody()?['text_5']))"
const BODY = `@union(${base}, json(coalesce(triggerBody()?['text_6'], '{}')))`
const firstMessage = "first(coalesce(body('HTTP')?['choices'], json('[]')))?['message']"

const outputSchema = {
  type: 'object',
  properties: {
    content: { title: 'content', 'x-ms-dynamically-added': true, type: 'string' },
    message: { title: 'message', 'x-ms-dynamically-added': true, type: 'string' },
    error: { title: 'error', 'x-ms-dynamically-added': true, type: 'string' },
  },
}

const headers = {} // plain data request: no solution header
const uri = `workflows(${WORKFLOW_ID})`

const workflow = await api('GET', `${uri}?$select=name,clientdata`, undefined, headers)
const cd = JSON.parse(workflow.clientdata)
const def = cd.properties.definition
const trigger = def.triggers.manual.inputs.schema
const yes = def.actions.Condition.actions
const no = def.actions.Condition.else.actions

const alreadyUpgraded = Boolean(trigger.properties.text_6)
console.log(`${DRY_RUN ? 'DRY RUN - nothing will change' : 'APPLYING'}: ${workflow.name}${alreadyUpgraded ? ' (already upgraded; re-applying)' : ''}\n`)

trigger.properties.text_6 = {
  title: 'extra', type: 'string', 'x-ms-dynamically-added': true,
  description: 'Optional JSON object merged into the provider request (e.g. tools)', 'x-ms-content-hint': 'TEXT',
}
trigger.required = trigger.required.filter(name => name !== 'text_6')

yes.HTTP.inputs.body = BODY

const respondYes = yes.Respond_to_a_Power_App_or_flow
respondYes.runAfter = { HTTP: ['Succeeded', 'Failed'] }
respondYes.inputs.body = {
  content: `@{coalesce(${firstMessage}?['content'], '')}`,
  message: `@{string(coalesce(${firstMessage}, json('{}')))}`,
  error: "@{coalesce(body('HTTP')?['error']?['message'], '')}",
}
respondYes.inputs.schema = outputSchema

const respondNo = no.Respond_to_a_Power_App_or_flow_2
respondNo.inputs.body = { ...respondNo.inputs.body, message: '', error: '' }
respondNo.inputs.schema = outputSchema

console.log('trigger inputs  :', Object.entries(trigger.properties).map(([k, v]) => `${k}=${v.title}`).join(', '))
console.log('required        :', trigger.required.join(', '))
console.log('HTTP body       :', BODY)
console.log('respond (yes)   :', Object.keys(respondYes.inputs.body).join(', '), '| runAfter', respondYes.runAfter.HTTP.join('+'))
console.log('respond (no)    :', Object.keys(respondNo.inputs.body).join(', '))

if (DRY_RUN) {
  console.log('\nPlan complete.')
} else {
  const backup = join(tmpdir(), `ModelCall-backup-${Date.now()}.json`)
  writeFileSync(backup, workflow.clientdata)
  console.log(`\nBackup: ${backup}`)
  await api('PATCH', uri, { clientdata: JSON.stringify(cd) }, { 'If-Match': '*' })
  const check = JSON.parse((await api('GET', `${uri}?$select=clientdata,statecode`, undefined, headers)).clientdata)
  const ok = Boolean(check.properties.definition.triggers.manual.inputs.schema.properties.text_6)
  console.log(ok ? 'PATCH ok - ModelCall upgraded.' : 'PATCH sent, but the upgrade was not found on read-back.')
}
