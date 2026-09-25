import {
  Fc_activitiesService,
  Fc_aiinsightsService,
  Fc_calendaritemsService,
  Fc_campaignmetricsService,
  Fc_campaignsService,
  Fc_libraryitemsService,
} from '@/generated'
import type { Fc_campaigns } from '@/generated/models/Fc_campaignsModel'
import type { Fc_campaignmetrics } from '@/generated/models/Fc_campaignmetricsModel'
import type { Fc_aiinsights } from '@/generated/models/Fc_aiinsightsModel'
import { createdAt, lookup, unwrap } from './dataverse'
import { bufferQuery } from './buffer'

// ─── Types ────────────────────────────────────────────────────────────────────

export const CAMPAIGN_OBJECTIVES = ['awareness', 'engagement', 'leads', 'sales', 'retention'] as const
export const CAMPAIGN_STATUSES = ['draft', 'planned', 'active', 'paused', 'completed', 'cancelled'] as const
export const CAMPAIGN_CHANNELS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'whatsapp', 'google'] as const
export const METRIC_SOURCES = ['manual', 'flowcom', 'buffer', 'odoo', 'whatsapp', 'meta_ads', 'google_ads', 'linkedin_ads'] as const

export type CampaignObjective = typeof CAMPAIGN_OBJECTIVES[number]
export type CampaignStatus = typeof CAMPAIGN_STATUSES[number]
export type CampaignChannel = typeof CAMPAIGN_CHANNELS[number]
export type MetricSource = typeof METRIC_SOURCES[number]

export interface Campaign {
  id: string
  name: string
  objective: CampaignObjective
  status: CampaignStatus
  start_date: string
  end_date: string
  channels: CampaignChannel[]
  segment_id: string | null
  key_message_id: string | null
  zone_id: string | null
  target_leads: number | null
  target_reach: number | null
  tracking_code: string
  brief: string
  summary: string
  currency: string
  created_at: string
}

export type CampaignInput = Omit<Campaign, 'id' | 'created_at' | 'currency'>

export interface CampaignMetric {
  id: string
  date: string
  channel: CampaignChannel
  source: MetricSource
  impressions: number
  reach: number
  clicks: number
  engagements: number
  leads: number
  conversions: number
}

export type MetricInput = Omit<CampaignMetric, 'id'>

export interface CampaignContentItem {
  id: string
  kind: 'calendar' | 'library'
  title: string
  date: string
  channel: string
  status: string
}

export interface CampaignInsight {
  id: string
  title: string
  body: string
  evidence: string
  created_at: string
}

// Choice values share the publisher prefix; a choice's value is its index + 122370000.
const OPTION_BASE = 122370000
const toValue = <T extends string>(list: readonly T[], item: T) => (OPTION_BASE + list.indexOf(item)) as never
const fromValue = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list[Number(value) - OPTION_BASE] ?? fallback

// Multi-select choices can arrive as an array or a comma-separated string.
function channelsFromRow(value: unknown): CampaignChannel[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return raw.map(v => CAMPAIGN_CHANNELS[Number(v) - OPTION_BASE]).filter((c): c is CampaignChannel => Boolean(c))
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

function campaignFromRow(row: Fc_campaigns): Campaign {
  return {
    id: row.fc_campaignid,
    name: row.fc_name ?? '',
    objective: fromValue(CAMPAIGN_OBJECTIVES, row.fc_objective, 'awareness'),
    status: fromValue(CAMPAIGN_STATUSES, row.fc_status, 'draft'),
    start_date: row.fc_startdate?.slice(0, 10) ?? '',
    end_date: row.fc_enddate?.slice(0, 10) ?? '',
    channels: channelsFromRow(row.fc_channels),
    segment_id: row._fc_segment_value ?? null,
    key_message_id: row._fc_keymessage_value ?? null,
    zone_id: row._fc_zone_value ?? null,
    target_leads: row.fc_targetleads ?? null,
    target_reach: row.fc_targetreach ?? null,
    tracking_code: row.fc_trackingcode ?? '',
    brief: row.fc_brief ?? '',
    summary: row.fc_summary ?? '',
    currency: row.fc_currency || 'XAF',
    created_at: createdAt(row),
  }
}

function campaignPayload(input: Partial<CampaignInput>) {
  const payload: Record<string, unknown> = {}
  if (input.name !== undefined) payload.fc_name = input.name
  if (input.objective !== undefined) payload.fc_objective = toValue(CAMPAIGN_OBJECTIVES, input.objective)
  if (input.status !== undefined) payload.fc_status = toValue(CAMPAIGN_STATUSES, input.status)
  if (input.start_date !== undefined) payload.fc_startdate = input.start_date || null
  if (input.end_date !== undefined) payload.fc_enddate = input.end_date || null
  if (input.channels !== undefined) payload.fc_channels = input.channels.map(c => toValue(CAMPAIGN_CHANNELS, c))
  if (input.segment_id !== undefined) payload['fc_Segment@odata.bind'] = input.segment_id ? lookup('fc_audiencesegments', input.segment_id) : null
  if (input.key_message_id !== undefined) payload['fc_Keymessage@odata.bind'] = input.key_message_id ? lookup('fc_keymessages', input.key_message_id) : null
  if (input.zone_id !== undefined) payload['fc_Zone@odata.bind'] = input.zone_id ? lookup('fc_zones', input.zone_id) : null
  if (input.target_leads !== undefined) payload.fc_targetleads = input.target_leads
  if (input.target_reach !== undefined) payload.fc_targetreach = input.target_reach
  if (input.tracking_code !== undefined) payload.fc_trackingcode = input.tracking_code
  if (input.brief !== undefined) payload.fc_brief = input.brief
  if (input.summary !== undefined) payload.fc_summary = input.summary
  return payload
}

export async function listCampaigns(companyId: string): Promise<Campaign[]> {
  return unwrap(await Fc_campaignsService.getAll({
    filter: `_fc_company_value eq ${companyId}`,
    orderBy: ['fc_startdate desc'],
  }), 'load campaigns').map(campaignFromRow)
}

export async function createCampaign(companyId: string, currency: string, input: CampaignInput): Promise<Campaign> {
  const row = unwrap(await Fc_campaignsService.create({
    ...campaignPayload(input),
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    fc_type: toValue(['organic', 'paid', 'mixed'], 'organic'),
    fc_currency: currency || 'XAF',
    statecode: 0,
  } as never), 'create campaign')
  return campaignFromRow(row)
}

export async function updateCampaign(id: string, changes: Partial<CampaignInput>): Promise<void> {
  unwrap(await Fc_campaignsService.update(id, campaignPayload(changes) as never), 'update campaign')
}

// Removes the campaign with its metrics and insights. Linked posts and timeline
// events are kept; Dataverse clears their campaign link.
export async function deleteCampaign(id: string): Promise<void> {
  const [metrics, insights] = await Promise.all([
    Fc_campaignmetricsService.getAll({ filter: `_fc_campaign_value eq ${id}`, select: ['fc_campaignmetricid'] }),
    Fc_aiinsightsService.getAll({ filter: `_fc_campaign_value eq ${id}`, select: ['fc_aiinsightid'] }),
  ])
  await Promise.all([
    ...unwrap(metrics, 'load campaign metrics').map(m => Fc_campaignmetricsService.delete(m.fc_campaignmetricid)),
    ...unwrap(insights, 'load campaign insights').map(i => Fc_aiinsightsService.delete(i.fc_aiinsightid)),
  ])
  await Fc_campaignsService.delete(id)
}

// ─── Linked content ───────────────────────────────────────────────────────────

export async function listCampaignContent(campaignId: string): Promise<CampaignContentItem[]> {
  const [calendar, library] = await Promise.all([
    Fc_calendaritemsService.getAll({ filter: `_fc_campaign_value eq ${campaignId}`, orderBy: ['fc_postdate asc'] }),
    Fc_libraryitemsService.getAll({ filter: `_fc_campaign_value eq ${campaignId}`, orderBy: ['createdon desc'] }),
  ])
  return [
    ...unwrap(calendar, 'load campaign calendar items').map(row => ({
      id: row.fc_calendaritemid, kind: 'calendar' as const, title: row.fc_topic ?? row.fc_name ?? '',
      date: row.fc_postdate?.slice(0, 10) ?? '', channel: row.fc_channel ?? '', status: row.fc_statusname ?? '',
    })),
    ...unwrap(library, 'load campaign library items').map(row => ({
      id: row.fc_libraryitemid, kind: 'library' as const, title: row.fc_title ?? row.fc_name ?? '',
      date: row.fc_publishdate?.slice(0, 10) ?? '', channel: row.fc_channel ?? '', status: row.fc_statusname ?? '',
    })),
  ]
}

export async function setContentCampaign(kind: 'calendar' | 'library', itemId: string, campaignId: string | null): Promise<void> {
  const payload = { 'fc_Campaign@odata.bind': campaignId ? lookup('fc_campaigns', campaignId) : null } as never
  if (kind === 'calendar') unwrap(await Fc_calendaritemsService.update(itemId, payload), 'link calendar item')
  else unwrap(await Fc_libraryitemsService.update(itemId, payload), 'link library item')
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function metricFromRow(row: Fc_campaignmetrics): CampaignMetric {
  return {
    id: row.fc_campaignmetricid,
    date: row.fc_date?.slice(0, 10) ?? '',
    channel: fromValue(CAMPAIGN_CHANNELS, row.fc_channel, 'facebook'),
    source: fromValue(METRIC_SOURCES, row.fc_source, 'manual'),
    impressions: row.fc_impressions ?? 0,
    reach: row.fc_reach ?? 0,
    clicks: row.fc_clicks ?? 0,
    engagements: row.fc_engagements ?? 0,
    leads: row.fc_leads ?? 0,
    conversions: row.fc_conversions ?? 0,
  }
}

export async function listCampaignMetrics(campaignId: string): Promise<CampaignMetric[]> {
  return unwrap(await Fc_campaignmetricsService.getAll({
    filter: `_fc_campaign_value eq ${campaignId}`,
    orderBy: ['fc_date asc'],
  }), 'load campaign metrics').map(metricFromRow)
}

// One row per campaign, day, channel and source (enforced by an alternate key);
// writing the same combination again updates it.
export async function upsertCampaignMetric(companyId: string, campaignId: string, metric: MetricInput): Promise<void> {
  const channel = toValue(CAMPAIGN_CHANNELS, metric.channel)
  const source = toValue(METRIC_SOURCES, metric.source)
  const values = {
    fc_impressions: metric.impressions, fc_reach: metric.reach, fc_clicks: metric.clicks,
    fc_engagements: metric.engagements, fc_leads: metric.leads, fc_conversions: metric.conversions,
  }
  const existing = unwrap(await Fc_campaignmetricsService.getAll({
    filter: `_fc_campaign_value eq ${campaignId} and fc_date eq ${metric.date} and fc_channel eq ${channel} and fc_source eq ${source}`,
    select: ['fc_campaignmetricid'],
    top: 1,
  }), 'find campaign metric')[0]
  if (existing) {
    unwrap(await Fc_campaignmetricsService.update(existing.fc_campaignmetricid, values), 'update campaign metric')
    return
  }
  unwrap(await Fc_campaignmetricsService.create({
    ...values,
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    'fc_Campaign@odata.bind': lookup('fc_campaigns', campaignId),
    fc_name: `${metric.date} ${metric.channel} ${metric.source}`,
    fc_date: metric.date,
    fc_channel: channel,
    fc_source: source,
    statecode: 0,
  } as never), 'create campaign metric')
}

// ─── Timeline: published posts ────────────────────────────────────────────────

export async function recordPostPublished(companyId: string, campaignId: string | null, bufferPostId: string, text: string): Promise<void> {
  unwrap(await Fc_activitiesService.create({
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    ...(campaignId ? { 'fc_Campaign@odata.bind': lookup('fc_campaigns', campaignId) } : {}),
    fc_name: text.slice(0, 300) || 'Post published',
    fc_summary: text.slice(0, 2000),
    fc_type: toValue(['message_in', 'message_out', 'opportunity_created', 'stage_changed', 'deal_won', 'deal_lost', 'post_published'], 'post_published'),
    fc_source: toValue(METRIC_SOURCES, 'buffer'),
    fc_externalid: bufferPostId,
    fc_occurredon: new Date().toISOString(),
    statecode: 0,
  } as never), 'record published post')
}

export async function listCampaignPostIds(campaignId: string): Promise<string[]> {
  const rows = unwrap(await Fc_activitiesService.getAll({
    filter: `_fc_campaign_value eq ${campaignId} and fc_source eq ${toValue(METRIC_SOURCES, 'buffer')}`,
    select: ['fc_externalid'],
  }), 'load campaign posts')
  return rows.map(r => r.fc_externalid).filter((id): id is string => Boolean(id))
}

// ─── AI insights ──────────────────────────────────────────────────────────────

function insightFromRow(row: Fc_aiinsights): CampaignInsight {
  return {
    id: row.fc_aiinsightid,
    title: row.fc_name ?? '',
    body: row.fc_body ?? '',
    evidence: row.fc_evidence ?? '',
    created_at: createdAt(row),
  }
}

export async function listCampaignInsights(campaignId: string): Promise<CampaignInsight[]> {
  return unwrap(await Fc_aiinsightsService.getAll({
    filter: `_fc_campaign_value eq ${campaignId}`,
    orderBy: ['createdon desc'],
    top: 10,
  }), 'load campaign insights').map(insightFromRow)
}

export async function createCampaignInsight(companyId: string, campaignId: string, insight: { title: string; body: string; evidence: unknown }): Promise<CampaignInsight> {
  const row = unwrap(await Fc_aiinsightsService.create({
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    'fc_Campaign@odata.bind': lookup('fc_campaigns', campaignId),
    fc_name: insight.title.slice(0, 300),
    fc_body: insight.body.slice(0, 10000),
    fc_evidence: JSON.stringify(insight.evidence).slice(0, 10000),
    fc_kind: toValue(['summary', 'recommendation'], 'recommendation'),
    fc_origin: toValue(['assistant', 'scheduled'], 'assistant'),
    fc_status: toValue(['new'], 'new'),
    statecode: 0,
  } as never), 'save campaign insight')
  return insightFromRow(row)
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export interface MetricTotals {
  impressions: number
  reach: number
  clicks: number
  engagements: number
  leads: number
  conversions: number
}

export function totalMetrics(metrics: CampaignMetric[]): MetricTotals {
  return metrics.reduce<MetricTotals>((t, m) => ({
    impressions: t.impressions + m.impressions,
    reach: t.reach + m.reach,
    clicks: t.clicks + m.clicks,
    engagements: t.engagements + m.engagements,
    leads: t.leads + m.leads,
    conversions: t.conversions + m.conversions,
  }), { impressions: 0, reach: 0, clicks: 0, engagements: 0, leads: 0, conversions: 0 })
}

// ─── Buffer results ───────────────────────────────────────────────────────────

const BUFFER_SERVICE_TO_CHANNEL: Record<string, CampaignChannel> = {
  facebook: 'facebook', instagram: 'instagram', linkedin: 'linkedin', tiktok: 'tiktok',
  twitter: 'x', x: 'x', googlebusiness: 'google', google: 'google',
}

// Reads Buffer metrics for the posts published under this campaign and stores
// them as daily metrics per channel (source `buffer`). Returns how many of the
// campaign's posts Buffer reported on.
export async function syncCampaignBufferResults(
  companyId: string,
  campaignId: string,
  orgId: string,
  channels: Array<{ id: string; service: string }>,
): Promise<{ tracked: number; matched: number }> {
  const postIds = new Set(await listCampaignPostIds(campaignId))
  if (!postIds.size || !channels.length) return { tracked: postIds.size, matched: 0 }

  const data = await bufferQuery(companyId, `
    query CampaignPosts($input: PostsInput!) {
      posts(first: 100, input: $input) {
        edges { node { id sentAt channelId metrics { type value } } }
      }
    }`, { input: { organizationId: orgId, filter: { status: ['sent'], channelIds: channels.map(c => c.id) } } })

  const serviceByChannel = new Map(channels.map(c => [c.id, c.service?.toLowerCase() ?? '']))
  const buckets = new Map<string, MetricInput>()
  let matched = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const { node } of (data?.posts?.edges ?? []) as any[]) {
    if (!postIds.has(node.id) || !node.sentAt) continue
    const channel = BUFFER_SERVICE_TO_CHANNEL[serviceByChannel.get(node.channelId) ?? '']
    if (!channel) continue
    matched++
    const date = String(node.sentAt).slice(0, 10)
    const key = `${date}|${channel}`
    const bucket = buckets.get(key) ?? { date, channel, source: 'buffer', impressions: 0, reach: 0, clicks: 0, engagements: 0, leads: 0, conversions: 0 }
    for (const m of node.metrics ?? []) {
      const value = Number(m.value) || 0
      if (m.type === 'impressions') bucket.impressions += value
      else if (m.type === 'reach') bucket.reach += value
      else if (m.type === 'clicks' || m.type === 'link_clicks') bucket.clicks += value
      else if (['reactions', 'likes', 'comments', 'reposts', 'shares', 'saves'].includes(m.type)) bucket.engagements += value
    }
    buckets.set(key, bucket)
  }

  for (const metric of buckets.values()) await upsertCampaignMetric(companyId, campaignId, metric)
  return { tracked: postIds.size, matched }
}
