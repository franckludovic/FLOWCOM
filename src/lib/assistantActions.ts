import { Fc_aiactionsService } from '@/generated'
import { listCampaigns, setContentCampaign, updateCampaign, CAMPAIGN_STATUSES, type CampaignStatus } from './campaigns'
import { createDataverseCalendarItem, lookup, unwrap } from './dataverse'

// Actions the assistant can propose. Each is stored as an AI Action with status
// "proposed" and runs only when a person approves it.

export interface CalendarIdea {
  date: string
  topic: string
  goal: string
  format: 'Post' | 'Carousel' | 'Video' | 'Story'
  channel: string
}

export type ActionPayload =
  | { kind: 'create_calendar_item'; campaign_id?: string; items: CalendarIdea[] }
  | { kind: 'update_campaign'; campaign_id: string; status: CampaignStatus }

export type ActionStatus = 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed'

export interface ProposedAction {
  id: string
  title: string
  payload: ActionPayload
  status: ActionStatus
  result: string
}

// fc_aiaction choice values (see scripts/dataverse/create-core-tables.mjs).
const KIND_VALUE = { create_calendar_item: 122370003, update_campaign: 122370004 } as const
const STATUS_VALUE: Record<ActionStatus, number> = { proposed: 122370000, approved: 122370001, rejected: 122370002, executed: 122370003, failed: 122370004 }

const FORMATS = ['Post', 'Carousel', 'Video', 'Story'] as const

// Validates what the model proposed before anything is stored.
export function parseActionProposal(args: Record<string, unknown>): ActionPayload | null {
  if (args.kind === 'create_calendar_item') {
    const items = Array.isArray(args.items) ? (args.items as Array<Record<string, unknown>>) : []
    const clean = items.slice(0, 20).map(item => ({
      date: String(item?.date ?? '').slice(0, 10),
      topic: String(item?.topic ?? '').slice(0, 500),
      goal: String(item?.goal ?? '').slice(0, 500),
      format: (FORMATS as readonly string[]).includes(String(item?.format)) ? String(item?.format) as CalendarIdea['format'] : 'Post',
      channel: String(item?.channel ?? '').toLowerCase().slice(0, 50),
    })).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.topic)
    if (!clean.length) return null
    return { kind: 'create_calendar_item', campaign_id: typeof args.campaign_id === 'string' && args.campaign_id ? args.campaign_id : undefined, items: clean }
  }
  if (args.kind === 'update_campaign' && typeof args.campaign_id === 'string' && (CAMPAIGN_STATUSES as readonly string[]).includes(String(args.status))) {
    return { kind: 'update_campaign', campaign_id: args.campaign_id, status: args.status as CampaignStatus }
  }
  return null
}

export async function proposeAction(companyId: string, title: string, payload: ActionPayload): Promise<ProposedAction> {
  const row = unwrap(await Fc_aiactionsService.create({
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    fc_name: title.slice(0, 300),
    fc_kind: KIND_VALUE[payload.kind] as never,
    fc_payload: JSON.stringify(payload),
    fc_status: STATUS_VALUE.proposed as never,
    statecode: 0,
  } as never), 'propose action')
  return { id: row.fc_aiactionid, title, payload, status: 'proposed', result: '' }
}

async function setStatus(id: string, status: ActionStatus, profileId: string | null, result: string) {
  const now = new Date().toISOString()
  unwrap(await Fc_aiactionsService.update(id, {
    fc_status: STATUS_VALUE[status] as never,
    fc_decidedon: now,
    ...(profileId ? { 'fc_Decidedby@odata.bind': lookup('fc_flowcomprofiles', profileId) } : {}),
    ...(status === 'executed' || status === 'failed' ? { fc_executedon: now } : {}),
    fc_result: result.slice(0, 4000),
  } as never), 'update action')
}

export async function rejectAction(action: ProposedAction, profileId: string | null): Promise<ProposedAction> {
  await setStatus(action.id, 'rejected', profileId, '')
  return { ...action, status: 'rejected' }
}

// Runs an approved action for the active company. Campaign ids are checked
// against the company's own campaigns before anything is changed.
export async function approveAction(companyId: string, action: ProposedAction, profileId: string | null): Promise<ProposedAction> {
  try {
    const campaigns = await listCampaigns(companyId)
    const payload = action.payload
    let result: string
    if (payload.kind === 'create_calendar_item') {
      const campaign = payload.campaign_id ? campaigns.find(c => c.id === payload.campaign_id) : undefined
      const created = await Promise.all(payload.items.map(item => createDataverseCalendarItem(companyId, { ...item, status: 'idea' })))
      if (campaign) await Promise.all(created.map(item => setContentCampaign('calendar', item.id, campaign.id)))
      window.dispatchEvent(new Event('flowcom:data-updated'))
      result = `${created.length} calendar item(s) created${campaign ? ` for ${campaign.name}` : ''}.`
    } else {
      const campaign = campaigns.find(c => c.id === payload.campaign_id)
      if (!campaign) throw new Error('Campaign not found for this company.')
      await updateCampaign(campaign.id, { status: payload.status })
      result = `${campaign.name}: status set to ${payload.status}.`
    }
    await setStatus(action.id, 'executed', profileId, result)
    return { ...action, status: 'executed', result }
  } catch (err) {
    const result = err instanceof Error ? err.message : String(err)
    await setStatus(action.id, 'failed', profileId, result).catch(() => undefined)
    return { ...action, status: 'failed', result }
  }
}
