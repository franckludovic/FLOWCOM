import { Fc_aiinsightsService } from '@/generated'
import type { AudienceSegment, Company, KeyMessage, Product } from '@/types'
import { buildAiContext } from './aiContext'
import { bufferQuery } from './buffer'
import {
  CAMPAIGN_CHANNELS, listCampaignContent, listCampaignInsights, listCampaignMetrics, listCampaigns, totalMetrics,
  type Campaign,
} from './campaigns'
import { createdAt, listDataverseCalendarItems, listDataverseLibraryItems, lookup, unwrap } from './dataverse'
import { describeZone, listPlaces, listZones } from './geo'
import { callModelWithTools, type ChatMessage, type ToolDefinition } from './model'
import { parseActionProposal, proposeAction, type ProposedAction } from './assistantActions'

// ─── Display blocks the assistant can put in its answer ───────────────────────

export interface ChartSpec {
  type: 'bar' | 'line' | 'donut'
  title: string
  labels: string[]
  series: Array<{ name: string; values: number[] }>
  unit?: string
}

export type AssistantBlock =
  | { kind: 'chart'; chart: ChartSpec }
  | { kind: 'table'; title: string; columns: string[]; rows: Array<Array<string | number>> }
  | { kind: 'images'; title: string; images: Array<{ url: string; caption?: string }> }
  | { kind: 'action'; action: ProposedAction }
  | { kind: 'draft'; text: string; channel?: string; campaign_id?: string }

export interface AssistantTurn {
  text: string
  blocks: AssistantBlock[]
  // Human-readable list of the data the answer was based on.
  sources: string[]
}

export interface AssistantContext {
  company: Company
  products: Product[]
  segments: AudienceSegment[]
  keyMessages: KeyMessage[]
  lang: 'fr' | 'en'
  buffer: { orgId: string | null; channels: Array<{ id: string; name: string; service: string }> }
  // Where the user is in the app, e.g. { page: 'campaign', id } - lets "this campaign" resolve.
  page?: { page: string; id?: string }
  model?: string
  // 'low' keeps everyday questions fast; the weekly digest uses 'medium'.
  effort?: 'low' | 'medium' | 'high'
  // Per-question cache so repeated lookups (campaigns, zones, content) hit Dataverse once.
  cache?: Map<string, Promise<unknown>>
}

function memo<T>(ctx: AssistantContext, key: string, load: () => Promise<T>): Promise<T> {
  if (!ctx.cache) return load()
  if (!ctx.cache.has(key)) ctx.cache.set(key, load())
  return ctx.cache.get(key) as Promise<T>
}

// ─── Tools ────────────────────────────────────────────────────────────────────

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false })

const TOOLS: ToolDefinition[] = [
  { type: 'function', function: { name: 'get_company_context', description: 'Company memory: profile, mission, tone, products, audience segments, key messages.', parameters: obj() } },
  { type: 'function', function: { name: 'list_campaigns', description: 'Campaigns with objective, status, dates, channels, targets and target zone.', parameters: obj({ status: { type: 'string', enum: ['draft', 'planned', 'active', 'paused', 'completed', 'cancelled'] } }) } },
  { type: 'function', function: { name: 'get_campaign_performance', description: 'Results of one campaign: totals and per-channel figures vs targets, daily metrics, linked content count and past AI analyses.', parameters: obj({ campaign_id: { type: 'string' } }, ['campaign_id']) } },
  { type: 'function', function: { name: 'list_content', description: 'Editorial calendar ideas and library posts, optionally filtered by date range (YYYY-MM-DD) or status.', parameters: obj({ from: { type: 'string' }, to: { type: 'string' }, source: { type: 'string', enum: ['calendar', 'library', 'both'] } }) } },
  { type: 'function', function: { name: 'get_recent_posts', description: 'Recently published social posts from Buffer with their metrics (impressions, reach, engagements) and image thumbnails.', parameters: obj({ limit: { type: 'integer', minimum: 1, maximum: 50 } }) } },
  { type: 'function', function: { name: 'list_zones', description: 'Geographic target zones and the places they cover.', parameters: obj() } },
  { type: 'function', function: { name: 'list_notes', description: 'Saved notes and AI insights (analyses, recommendations), newest first.', parameters: obj({ limit: { type: 'integer', minimum: 1, maximum: 20 } }) } },
  { type: 'function', function: { name: 'propose_action', description: 'Propose a change for the user to approve. Nothing happens until they click Approve. kind "create_calendar_item": add post ideas to the editorial calendar (items with date YYYY-MM-DD, topic, goal, format Post|Carousel|Video|Story, channel such as facebook, instagram, linkedin, tiktok, twitter, whatsapp), optionally for a campaign_id. kind "update_campaign": change a campaign status.', parameters: obj({
    kind: { type: 'string', enum: ['create_calendar_item', 'update_campaign'] },
    title: { type: 'string', description: 'Short description of the action shown on the approval card' },
    campaign_id: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'planned', 'active', 'paused', 'completed', 'cancelled'] },
    items: { type: 'array', items: obj({ date: { type: 'string' }, topic: { type: 'string' }, goal: { type: 'string' }, format: { type: 'string' }, channel: { type: 'string' } }, ['date', 'topic']) },
  }, ['kind', 'title']) } },
  { type: 'function', function: { name: 'open_in_studio', description: 'Offer a ready-to-publish post draft the user can open in Studio (nothing is published).', parameters: obj({
    text: { type: 'string' }, channel: { type: 'string' }, campaign_id: { type: 'string' },
  }, ['text']) } },
  { type: 'function', function: { name: 'show_chart', description: 'Display a chart in the answer. Use for trends over time (line), comparisons across categories (bar), or share of a whole with at most 6 parts (donut). All series share one axis and unit.', parameters: obj({
    type: { type: 'string', enum: ['bar', 'line', 'donut'] },
    title: { type: 'string' },
    labels: { type: 'array', items: { type: 'string' } },
    series: { type: 'array', items: obj({ name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } }, ['name', 'values']) },
    unit: { type: 'string' },
  }, ['type', 'title', 'labels', 'series']) } },
  { type: 'function', function: { name: 'show_table', description: 'Display a table in the answer.', parameters: obj({
    title: { type: 'string' },
    columns: { type: 'array', items: { type: 'string' } },
    rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number'] } } },
  }, ['title', 'columns', 'rows']) } },
  { type: 'function', function: { name: 'show_images', description: 'Display images (for example post visuals returned by get_recent_posts). Only use URLs returned by a tool.', parameters: obj({
    title: { type: 'string' },
    images: { type: 'array', items: obj({ url: { type: 'string' }, caption: { type: 'string' } }, ['url']) },
  }, ['title', 'images']) } },
]

const MAX_RESULT_CHARS = 5000
const clip = (value: unknown) => {
  const text = JSON.stringify(value)
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}…(truncated)` : text
}

async function campaignSummaries(ctx: AssistantContext): Promise<Array<Campaign & { zone: string }>> {
  const [campaigns, zones, places] = await Promise.all([
    memo(ctx, 'campaigns', () => listCampaigns(ctx.company.id)),
    memo(ctx, 'zones', () => listZones(ctx.company.id)),
    memo(ctx, 'places', () => listPlaces(ctx.company.id)),
  ])
  return campaigns.map(c => {
    const zone = zones.find(z => z.id === c.zone_id)
    return { ...c, zone: zone ? `${zone.name}: ${describeZone(zone, places)}` : '' }
  })
}

type ToolRun = { result: unknown; source?: string; block?: AssistantBlock }

async function runTool(name: string, args: Record<string, unknown>, ctx: AssistantContext): Promise<ToolRun> {
  const companyId = ctx.company.id
  switch (name) {
    case 'get_company_context':
      return { result: buildAiContext(ctx), source: ctx.lang === 'fr' ? 'Mémoire de l\'entreprise' : 'Company memory' }

    case 'list_campaigns': {
      const all = await campaignSummaries(ctx)
      const list = args.status ? all.filter(c => c.status === args.status) : all
      return {
        result: list.map(c => ({ id: c.id, name: c.name, objective: c.objective, status: c.status, start: c.start_date, end: c.end_date, channels: c.channels, target_reach: c.target_reach, target_leads: c.target_leads, zone: c.zone || null })),
        source: `${ctx.lang === 'fr' ? 'Campagnes' : 'Campaigns'} (${list.length})`,
      }
    }

    case 'get_campaign_performance': {
      const id = String(args.campaign_id ?? '')
      const campaign = (await campaignSummaries(ctx)).find(c => c.id === id)
      if (!campaign) return { result: { error: 'No campaign with this id for this company.' } }
      const [metrics, content, insights] = await Promise.all([listCampaignMetrics(id), listCampaignContent(id), listCampaignInsights(id)])
      return {
        result: {
          campaign: { name: campaign.name, objective: campaign.objective, status: campaign.status, start: campaign.start_date, end: campaign.end_date, zone: campaign.zone || null },
          targets: { reach: campaign.target_reach, leads: campaign.target_leads },
          totals: totalMetrics(metrics),
          by_channel: CAMPAIGN_CHANNELS.map(ch => ({ channel: ch, ...totalMetrics(metrics.filter(m => m.channel === ch)) })).filter(r => r.reach || r.impressions || r.engagements || r.leads),
          daily: metrics.slice(-30).map(m => ({ date: m.date, channel: m.channel, source: m.source, reach: m.reach, impressions: m.impressions, engagements: m.engagements, clicks: m.clicks, leads: m.leads })),
          linked_content: content.length,
          past_analyses: insights.slice(0, 3).map(i => ({ title: i.title, date: i.created_at.slice(0, 10), body: i.body.slice(0, 600) })),
          note: metrics.length ? undefined : 'No results recorded yet for this campaign.',
        },
        source: `${ctx.lang === 'fr' ? 'Résultats' : 'Results'}: ${campaign.name} (${metrics.length} ${ctx.lang === 'fr' ? 'lignes' : 'rows'})`,
      }
    }

    case 'list_content': {
      const from = typeof args.from === 'string' ? args.from : ''
      const to = typeof args.to === 'string' ? args.to : ''
      const source = args.source === 'calendar' || args.source === 'library' ? args.source : 'both'
      const inRange = (date: string) => (!from || date >= from) && (!to || date <= to)
      const [calendar, library] = await Promise.all([
        source !== 'library' ? memo(ctx, 'calendar', () => listDataverseCalendarItems(companyId)) : Promise.resolve([]),
        source !== 'calendar' ? memo(ctx, 'library', () => listDataverseLibraryItems(companyId)) : Promise.resolve([]),
      ])
      const cal = calendar.filter(i => inRange(i.date)).map(i => ({ id: i.id, campaign_id: i.campaign_id ?? null, kind: 'calendar', date: i.date, topic: i.topic, goal: i.goal, format: i.format, channel: i.channel, status: i.status }))
      const lib = library.filter(i => inRange((i.publish_date ?? i.created_at).slice(0, 10))).map(i => ({ id: i.id, kind: 'library', date: (i.publish_date ?? i.created_at).slice(0, 10), title: i.title, channel: i.channel, format: i.format, status: i.status, hook: i.hook.slice(0, 160) }))
      return { result: [...cal, ...lib].slice(0, 80), source: `${ctx.lang === 'fr' ? 'Contenus' : 'Content'} (${cal.length + lib.length})` }
    }

    case 'get_recent_posts': {
      if (!ctx.buffer.orgId || !ctx.buffer.channels.length) return { result: { error: 'Buffer is not connected for this company.' } }
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20))
      const data = await bufferQuery(companyId, `
        query RecentPosts($first: Int!, $input: PostsInput!) {
          posts(first: $first, input: $input) {
            edges { node { id text sentAt channelId metrics { type value } assets { source thumbnail } } }
          }
        }`, { first: limit, input: { organizationId: ctx.buffer.orgId, filter: { status: ['sent'], channelIds: ctx.buffer.channels.map(c => c.id) } } })
      const channelById = new Map(ctx.buffer.channels.map(c => [c.id, c]))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const posts = ((data?.posts?.edges ?? []) as any[]).map(({ node }) => {
        const metrics: Record<string, number> = {}
        for (const m of node.metrics ?? []) metrics[m.type] = (metrics[m.type] ?? 0) + (Number(m.value) || 0)
        const ch = channelById.get(node.channelId)
        return {
          date: String(node.sentAt ?? '').slice(0, 10), channel: ch?.service ?? '', account: ch?.name ?? '',
          text: String(node.text ?? '').slice(0, 220), metrics,
          image: node.assets?.[0]?.thumbnail || node.assets?.[0]?.source || null,
        }
      })
      return { result: posts, source: `${ctx.lang === 'fr' ? 'Posts publiés (Buffer)' : 'Published posts (Buffer)'} (${posts.length})` }
    }

    case 'list_zones': {
      const [zones, places] = await Promise.all([memo(ctx, 'zones', () => listZones(companyId)), memo(ctx, 'places', () => listPlaces(companyId))])
      return { result: zones.map(z => ({ name: z.name, description: z.description, covers: describeZone(z, places) })), source: `Zones (${zones.length})` }
    }

    case 'list_notes': {
      const limit = Math.min(20, Math.max(1, Number(args.limit) || 10))
      const rows = unwrap(await Fc_aiinsightsService.getAll({ filter: `_fc_company_value eq ${companyId}`, orderBy: ['createdon desc'], top: limit }), 'load notes')
      return {
        result: rows.map(r => ({ title: r.fc_name ?? '', date: createdAt(r).slice(0, 10), kind: r.fc_kindname ?? '', body: (r.fc_body ?? '').slice(0, 800) })),
        source: `${ctx.lang === 'fr' ? 'Notes et analyses' : 'Notes and analyses'} (${rows.length})`,
      }
    }

    case 'propose_action': {
      const payload = parseActionProposal(args)
      if (!payload) return { result: { error: 'Invalid proposal: check kind, dates (YYYY-MM-DD), topics or campaign status.' } }
      if (payload.kind === 'update_campaign' || payload.campaign_id) {
        const id = payload.kind === 'update_campaign' ? payload.campaign_id : payload.campaign_id
        if (!(await memo(ctx, 'campaigns', () => listCampaigns(companyId))).some(c => c.id === id)) return { result: { error: 'Unknown campaign_id for this company.' } }
      }
      const action = await proposeAction(companyId, String(args.title ?? 'Proposed action'), payload)
      return { result: 'Proposal shown to the user; it runs only if they approve it.', block: { kind: 'action', action } }
    }

    case 'open_in_studio': {
      const text = String(args.text ?? '').slice(0, 5000)
      if (!text.trim()) return { result: { error: 'Empty draft.' } }
      return {
        result: 'Draft offered; the user can open it in Studio.',
        block: { kind: 'draft', text, channel: args.channel ? String(args.channel) : undefined, campaign_id: args.campaign_id ? String(args.campaign_id) : undefined },
      }
    }

    case 'show_chart': {
      const chart = sanitizeChart(args)
      return chart ? { result: 'Chart displayed.', block: { kind: 'chart', chart } } : { result: { error: 'Invalid chart: labels and every series must have the same length.' } }
    }

    case 'show_table': {
      const columns = Array.isArray(args.columns) ? args.columns.map(String).slice(0, 8) : []
      const rows = Array.isArray(args.rows) ? (args.rows as unknown[]).filter(Array.isArray).slice(0, 50).map(r => (r as unknown[]).slice(0, columns.length).map(v => typeof v === 'number' ? v : String(v ?? ''))) : []
      return columns.length ? { result: 'Table displayed.', block: { kind: 'table', title: String(args.title ?? ''), columns, rows } } : { result: { error: 'A table needs columns.' } }
    }

    case 'show_images': {
      const images = Array.isArray(args.images)
        ? (args.images as Array<Record<string, unknown>>).filter(i => typeof i?.url === 'string' && /^https:\/\//.test(i.url as string)).slice(0, 8).map(i => ({ url: String(i.url), caption: i.caption ? String(i.caption) : undefined }))
        : []
      return images.length ? { result: 'Images displayed.', block: { kind: 'images', title: String(args.title ?? ''), images } } : { result: { error: 'No valid https image URLs.' } }
    }

    default:
      return { result: { error: `Unknown tool ${name}` } }
  }
}

function sanitizeChart(args: Record<string, unknown>): ChartSpec | null {
  const type = args.type === 'line' || args.type === 'donut' ? args.type : 'bar'
  const labels = Array.isArray(args.labels) ? args.labels.map(String).slice(0, 60) : []
  const series = Array.isArray(args.series)
    ? (args.series as Array<Record<string, unknown>>).slice(0, 6).map(s => ({
      name: String(s?.name ?? ''),
      values: Array.isArray(s?.values) ? (s.values as unknown[]).slice(0, labels.length).map(v => Number(v) || 0) : [],
    }))
    : []
  if (!labels.length || !series.length || series.some(s => s.values.length !== labels.length)) return null
  // A donut shows one series' parts of a whole; more than 6 parts reads better as bars.
  const finalType = type === 'donut' && (series.length > 1 || labels.length > 6) ? 'bar' : type
  return { type: finalType, title: String(args.title ?? ''), labels, series, unit: args.unit ? String(args.unit) : undefined }
}

// ─── Conversation loop ────────────────────────────────────────────────────────

function pageHint(ctx: AssistantContext): string {
  if (!ctx.page) return ''
  if (ctx.page.page === 'campaign' && ctx.page.id) return `

The user is viewing the campaign with id ${ctx.page.id}. "This campaign" means that one; call get_campaign_performance for it when relevant.`
  const names: Record<string, string> = { campaigns: 'the campaign list', calendar: 'the editorial calendar', library: 'the content library', studio: 'Studio (publishing)', content: 'the content generator', workspace: 'the dashboard', report: 'the weekly report', 'publishing-history': 'the publishing history' }
  return names[ctx.page.page] ? `

The user is currently on ${names[ctx.page.page]}.` : ''
}

function systemPrompt(ctx: AssistantContext): string {
  return `You are the FlowCom assistant for ${ctx.company.name}, helping the team make data-driven marketing decisions.
Today is ${new Date().toISOString().slice(0, 10)}. Answer in ${ctx.lang === 'fr' ? 'French' : 'English'}.

Rules:
- Use the tools to get facts. Never invent numbers, names or dates; if the data is missing or too thin, say so plainly.
- Prefer showing over telling: call show_chart for trends and comparisons, show_table for detailed lists, show_images for post visuals. Do not repeat every number in the text once it is in a chart or table.
- Keep answers short and skimmable in Markdown: a one-line answer first, then key points, then concrete next steps when useful.
- You never change anything yourself. When a concrete change would help, call propose_action (calendar ideas, campaign status) or open_in_studio (a post draft); the user approves or opens it. Propose at most one action per answer unless asked.
- Link to app pages with Markdown links using these paths: campaigns [name](/campaigns/<id>), all campaigns (/campaigns), calendar (/calendar), library (/library), studio (/studio), settings (/settings). Only use ids returned by tools.
- Only use image URLs returned by tools.
- Never write JSON, code blocks or tool arguments in your answer. To propose an action, draft a post or show a chart or table, call the tool; the app renders it.${pageHint(ctx)}`
}

const MAX_STEPS = 6

// ─── Snapshot ─────────────────────────────────────────────────────────────────
// A compact overview sent with every question so common questions need no
// lookup steps. Cached briefly per company and cleared when data changes.

const SNAPSHOT_TTL_MS = 90_000
const snapshotCache = new Map<string, { at: number; text: string }>()
if (typeof window !== 'undefined') window.addEventListener('flowcom:data-updated', () => snapshotCache.clear())

async function buildSnapshot(ctx: AssistantContext): Promise<string> {
  const hit = snapshotCache.get(ctx.company.id)
  if (hit && Date.now() - hit.at < SNAPSHOT_TTL_MS) return hit.text
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const [campaigns, calendar, library] = await Promise.all([
    campaignSummaries(ctx),
    memo(ctx, 'calendar', () => listDataverseCalendarItems(ctx.company.id)),
    memo(ctx, 'library', () => listDataverseLibraryItems(ctx.company.id)),
  ])
  const upcoming = calendar.filter(i => i.date >= today && i.date <= horizon)
  const byStatus = library.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {})
  const lines = [
    `Campaigns (${campaigns.length}):`,
    ...campaigns.slice(0, 15).map(c => `- ${c.name} [id ${c.id}] ${c.status}, ${c.objective}, ${c.start_date || '?'} → ${c.end_date || '?'}, targets reach ${c.target_reach ?? '-'} / leads ${c.target_leads ?? '-'}${c.zone ? `, zone ${c.zone}` : ''}`),
    `Calendar, next 14 days: ${upcoming.length} item(s)${upcoming.length ? '' : ' (nothing planned)'}`,
    ...upcoming.slice(0, 8).map(i => `- ${i.date} ${i.channel} ${i.format}: ${i.topic}`),
    `Library: ${library.length} post(s)${Object.keys(byStatus).length ? ` (${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`,
    ctx.buffer.orgId ? `Buffer: connected, channels ${ctx.buffer.channels.map(ch => ch.service).join(', ') || 'none'}` : 'Buffer: not connected',
  ]
  const text = `\n\nCurrent snapshot (${today}). Answer from it when it is enough; call tools for results, metrics, notes, content details or anything missing:\n${lines.join('\n')}`
  snapshotCache.set(ctx.company.id, { at: Date.now(), text })
  return text
}

export async function askAssistant(
  history: ChatMessage[],
  question: string,
  context: AssistantContext,
  onProgress?: (label: string) => void,
): Promise<{ turn: AssistantTurn; history: ChatMessage[] }> {
  const ctx: AssistantContext = { ...context, cache: new Map() }
  const snapshot = await buildSnapshot(ctx).catch(() => '')
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(ctx) + snapshot }, ...history, { role: 'user', content: question }]
  const blocks: AssistantBlock[] = []
  const sources: string[] = []

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callModelWithTools(ctx.company.id, messages, TOOLS, { max_tokens: 3000, model: ctx.model, reasoning_effort: ctx.effort ?? 'low' })
    if (!reply.tool_calls.length) {
      const recovered = await recoverInlineToolCalls(reply.content.trim(), ctx)
      blocks.push(...recovered.blocks)
      const text = recovered.text
      return { turn: { text, blocks, sources: [...new Set(sources)] }, history: nextHistory(history, question, text) }
    }
    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.tool_calls })
    // Tools the model asks for in the same turn run in parallel; results keep the call order.
    const runs = await Promise.all(reply.tool_calls.map(async (call): Promise<ToolRun> => {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(call.function.arguments || '{}') } catch { args = {} }
      onProgress?.(call.function.name)
      try {
        return await runTool(call.function.name, args, ctx)
      } catch (err) {
        return { result: { error: err instanceof Error ? err.message : String(err) } }
      }
    }))
    runs.forEach((run, i) => {
      if (run.block) blocks.push(run.block)
      if (run.source) sources.push(run.source)
      messages.push({ role: 'tool', tool_call_id: reply.tool_calls[i].id, content: clip(run.result) })
    })
  }
  const text = ctx.lang === 'fr'
    ? 'Je n\'ai pas pu terminer l\'analyse en un nombre raisonnable d\'étapes. Essayez une question plus précise.'
    : 'I could not finish in a reasonable number of steps. Try a more specific question.'
  return { turn: { text, blocks, sources: [...new Set(sources)] }, history: nextHistory(history, question, text) }
}

// Some models occasionally write a tool call into their answer as JSON instead
// of calling the tool. Recognise the display and proposal tools in that text,
// run them as real tool calls, and remove the JSON from the answer.
function toolFromJson(value: Record<string, unknown>): { name: string; args: Record<string, unknown> } | null {
  if (typeof value.name === 'string' && value.arguments && typeof value.arguments === 'object') {
    return { name: value.name, args: value.arguments as Record<string, unknown> }
  }
  if (value.kind === 'create_calendar_item' || value.kind === 'update_campaign') return { name: 'propose_action', args: value }
  if (Array.isArray(value.labels) && Array.isArray(value.series)) return { name: 'show_chart', args: value }
  if (Array.isArray(value.columns) && Array.isArray(value.rows)) return { name: 'show_table', args: value }
  return null
}

const INLINE_TOOLS = new Set(['propose_action', 'open_in_studio', 'show_chart', 'show_table', 'show_images'])

// Finds tool calls written as JSON in an answer and returns the answer without them.
export function extractInlineToolCalls(text: string): { text: string; calls: Array<{ name: string; args: Record<string, unknown> }> } {
  const candidates: Array<{ raw: string; json: string }> = []
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) candidates.push({ raw: match[0], json: match[1] })
  if (!candidates.length) {
    // A bare JSON object, typically at the end of the answer.
    const start = text.search(/^\s*\{/m)
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) candidates.push({ raw: text.slice(start, end + 1), json: text.slice(start, end + 1) })
  }
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  let clean = text
  for (const candidate of candidates) {
    let parsed: unknown
    try { parsed = JSON.parse(candidate.json.trim()) } catch { continue }
    const call = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? toolFromJson(parsed as Record<string, unknown>) : null
    if (!call || !INLINE_TOOLS.has(call.name)) continue
    calls.push(call)
    clean = clean.replace(candidate.raw, '')
  }
  // Collapse the blank lines left where the JSON was.
  return { text: clean.replace(/\n{3,}/g, '\n\n').trim(), calls }
}

async function recoverInlineToolCalls(text: string, ctx: AssistantContext): Promise<{ text: string; blocks: AssistantBlock[] }> {
  const extracted = extractInlineToolCalls(text)
  const blocks: AssistantBlock[] = []
  for (const call of extracted.calls) {
    try {
      const run = await runTool(call.name, call.args, ctx)
      if (run.block) blocks.push(run.block)
    } catch { /* the proposal is dropped; the answer text still explains it */ }
  }
  return { text: extracted.text, blocks }
}

// Follow-up questions carry the conversation's questions and answers, not the
// raw tool results; the assistant calls tools again when it needs fresh data.
function nextHistory(history: ChatMessage[], question: string, answer: string): ChatMessage[] {
  return [...history, { role: 'user' as const, content: question }, { role: 'assistant' as const, content: answer }].slice(-12)
}

// Saves an assistant answer as a note (AI Insight) with the data it was based on.
export async function saveAssistantNote(companyId: string, title: string, turn: AssistantTurn): Promise<void> {
  unwrap(await Fc_aiinsightsService.create({
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    fc_name: title.slice(0, 300),
    fc_body: turn.text.slice(0, 10000),
    fc_evidence: JSON.stringify({ sources: turn.sources, blocks: turn.blocks }).slice(0, 10000),
    fc_kind: 122370000,
    fc_origin: 122370000,
    fc_status: 122370000,
    statecode: 0,
  } as never), 'save note')
}

// ─── Weekly digest ────────────────────────────────────────────────────────────
// Written once per company per week, the first time someone opens the
// assistant that week, and saved as an AI Insight (origin "scheduled") so the
// whole team sees the same digest.

export interface WeeklyDigest {
  title: string
  body: string
  blocks: AssistantBlock[]
  created_at: string
}

export function weekStart(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

const ORIGIN_SCHEDULED = 122370001
const KIND_SUMMARY = 122370000

export async function findWeeklyDigest(companyId: string): Promise<WeeklyDigest | null> {
  const rows = unwrap(await Fc_aiinsightsService.getAll({
    filter: `_fc_company_value eq ${companyId} and fc_origin eq ${ORIGIN_SCHEDULED} and createdon ge ${weekStart()}T00:00:00Z`,
    orderBy: ['createdon desc'],
    top: 1,
  }), 'load weekly digest')
  const row = rows[0]
  if (!row) return null
  let blocks: AssistantBlock[] = []
  try { blocks = (JSON.parse(row.fc_evidence ?? '{}').blocks ?? []) as AssistantBlock[] } catch { blocks = [] }
  return { title: row.fc_name ?? '', body: row.fc_body ?? '', blocks, created_at: createdAt(row) }
}

export async function generateWeeklyDigest(ctx: AssistantContext): Promise<WeeklyDigest> {
  const question = ctx.lang === 'fr'
    ? "Prépare le bilan hebdomadaire de l'entreprise : ce qui a bien marché ces 7 derniers jours, ce qui est à risque (campagnes en retard sur leurs objectifs, semaine sans contenu prévu, données manquantes), puis les 3 actions prioritaires pour cette semaine. Utilise les outils, montre au plus un graphique, et n'appelle pas propose_action ni open_in_studio."
    : 'Prepare the weekly company digest: what worked in the last 7 days, what is at risk (campaigns behind their targets, a week with no planned content, missing data), then the 3 priority actions for this week. Use the tools, show at most one chart, and do not call propose_action or open_in_studio.'
  const { turn } = await askAssistant([], question, { ...ctx, effort: 'medium' })
  const blocks = turn.blocks.filter(b => b.kind === 'chart' || b.kind === 'table')
  const title = `${ctx.lang === 'fr' ? 'Bilan de la semaine du' : 'Weekly digest, week of'} ${weekStart()}`
  const row = unwrap(await Fc_aiinsightsService.create({
    'fc_Company@odata.bind': lookup('fc_companies', ctx.company.id),
    fc_name: title,
    fc_body: turn.text.slice(0, 10000),
    fc_evidence: JSON.stringify({ sources: turn.sources, blocks }).slice(0, 10000),
    fc_kind: KIND_SUMMARY,
    fc_origin: ORIGIN_SCHEDULED,
    fc_status: 122370000,
    statecode: 0,
  } as never), 'save weekly digest')
  return { title, body: turn.text, blocks, created_at: createdAt(row) }
}
