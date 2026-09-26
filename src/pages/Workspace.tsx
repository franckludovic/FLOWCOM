import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppSettings } from '@/contexts/AppSettingsContext'
import { callModelJSON, buildModelError } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'
import { getDataverseWorkspaceCounts, listDataverseCalendarItems, listDataverseLibraryItems, type DataverseCalendarItem } from '@/lib/dataverse'
import { listCampaignMetrics, listCampaigns, totalMetrics, type Campaign, type MetricTotals } from '@/lib/campaigns'
import { CHANNEL_MAP, networkOf } from '@/lib/channels'
import { Badge, Button, Card, CardBody, CardHeader, Spark, type Tone } from '@/components/ui'
import type { LibraryItem } from '@/types'
import { cn } from '@/lib/utils'

interface Activity {
  title_fr: string
  title_en: string
  reason_fr: string
  reason_en: string
  action_fr: string
  action_en: string
  route: string
  step?: number
  priority: 'high' | 'medium' | 'low'
}

const ACTIVITY_TTL = 24 * 60 * 60 * 1000
const DAY = 86400000
const PRIORITY_COLOR = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--ink-subtle)' }
const STATUS_TONE: Record<string, Tone> = { idea: 'neutral', scheduled: 'info', published: 'success' }

const COPY = {
  fr: {
    hello: 'Bonjour', welcome: 'Bienvenue',
    planMonth: 'Planifier le mois', writePost: 'Rédiger un post', schedule: 'Programmer',
    published30: 'Publiés sur 30 jours', vsBefore: (d: number) => (d === 0 ? 'autant que les 30 jours précédents' : `${d > 0 ? '+' : '−'}${Math.abs(d)} par rapport aux 30 jours précédents`),
    ideas: 'Idées à rédiger', thisWeekCount: (n: number) => (n ? `dont ${n} cette semaine` : 'aucune cette semaine'),
    drafts: 'Brouillons en attente', staleNote: 'depuis plus de 7 jours', noneWaiting: 'rien en attente',
    activeCampaigns: 'Campagnes actives', nextStart: (d: string) => `la prochaine commence le ${d}`, noneUpcoming: 'aucune à venir',
    todo: "À faire aujourd'hui", refresh: 'Actualiser les priorités', preparing: 'Préparation des priorités…', noTodo: 'Rien d’urgent : tout est à jour.',
    week: 'Cette semaine', calendar: 'Calendrier', nothing: 'Rien de prévu', today: "Aujourd'hui", tomorrow: 'Demain',
    campaigns: 'Campagnes en cours', allCampaigns: 'Toutes', noCampaign: 'Aucune campagne en cours.', createCampaign: 'Créer une campagne',
    reach: 'Portée', leads: 'Prospects', day: (d: number, t: number) => `jour ${d} sur ${t}`,
    content: 'Contenu', library: 'Bibliothèque',
    pipeline: { ideas: 'Idées au calendrier', draft: 'Brouillons', validated: 'Validés, prêts à programmer', published: 'Publiés sur 30 jours' },
    status: { idea: 'Idée', scheduled: 'Programmé', published: 'Publié' } as Record<string, string>,
    noCompany: 'Aucune entreprise pour le moment', noCompanyText: 'Décrivez votre entreprise pour que FlowCom prépare votre calendrier, vos contenus et vos priorités.', setup: 'Commencer',
  },
  en: {
    hello: 'Hello', welcome: 'Welcome',
    planMonth: 'Plan the month', writePost: 'Write a post', schedule: 'Schedule',
    published30: 'Published in 30 days', vsBefore: (d: number) => (d === 0 ? 'same as the 30 days before' : `${d > 0 ? '+' : '−'}${Math.abs(d)} on the 30 days before`),
    ideas: 'Ideas to write', thisWeekCount: (n: number) => (n ? `${n} this week` : 'none this week'),
    drafts: 'Drafts waiting', staleNote: 'for more than 7 days', noneWaiting: 'nothing waiting',
    activeCampaigns: 'Active campaigns', nextStart: (d: string) => `next one starts ${d}`, noneUpcoming: 'none coming up',
    todo: 'To do today', refresh: 'Refresh priorities', preparing: 'Preparing priorities…', noTodo: 'Nothing urgent: everything is up to date.',
    week: 'This week', calendar: 'Calendar', nothing: 'Nothing planned', today: 'Today', tomorrow: 'Tomorrow',
    campaigns: 'Running campaigns', allCampaigns: 'All', noCampaign: 'No campaign running.', createCampaign: 'Create a campaign',
    reach: 'Reach', leads: 'Leads', day: (d: number, t: number) => `day ${d} of ${t}`,
    content: 'Content', library: 'Library',
    pipeline: { ideas: 'Ideas in the calendar', draft: 'Drafts', validated: 'Validated, ready to schedule', published: 'Published in 30 days' },
    status: { idea: 'Idea', scheduled: 'Scheduled', published: 'Published' } as Record<string, string>,
    noCompany: 'No company yet', noCompanyText: 'Describe your company so FlowCom can prepare your calendar, content and priorities.', setup: 'Get started',
  },
}

// Drops any internal signal the model still quoted, e.g. "(Signal: Calendar = 5)".
const cleanReason = (text: string) => text.replace(/\s*\((?:signal|signaux|signals?)\s*:[^)]*\)/gi, '').replace(/\s+([.!?])$/, '$1').trim()

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function WorkspacePage() {
  const { t, lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const locale = L === 'fr' ? 'fr-FR' : 'en-GB'
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { profile, apiKeyConfigured } = useAuth()
  const { isEnabled } = useAppSettings()
  const navigate = useNavigate()
  const marketing = isEnabled('marketing-studio')
  const campaignsOn = isEnabled('campaigns')

  const [counts, setCounts] = useState<Awaited<ReturnType<typeof getDataverseWorkspaceCounts>> | null>(null)
  const [calendar, setCalendar] = useState<DataverseCalendarItem[]>([])
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignTotals, setCampaignTotals] = useState<Record<string, MetricTotals>>({})
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)
  const [activitiesError, setActivitiesError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    if (!activeCompany) return
    setLoaded(false)
    Promise.all([
      getDataverseWorkspaceCounts(activeCompany.id).catch(() => null),
      marketing ? listDataverseCalendarItems(activeCompany.id).catch(() => []) : Promise.resolve([]),
      marketing ? listDataverseLibraryItems(activeCompany.id).catch(() => []) : Promise.resolve([]),
      campaignsOn ? listCampaigns(activeCompany.id).catch(() => []) : Promise.resolve([]),
    ]).then(async ([countsResult, calendarItems, libraryItems, campaignList]) => {
      if (!alive) return
      setCounts(countsResult)
      setCalendar(calendarItems as DataverseCalendarItem[])
      setLibrary(libraryItems as LibraryItem[])
      setCampaigns(campaignList as Campaign[])
      setLoaded(true)
      const running = (campaignList as Campaign[]).filter(cp => cp.status === 'active')
      const pairs = await Promise.all(running.map(cp => listCampaignMetrics(cp.id).then(m => [cp.id, totalMetrics(m)] as const).catch(() => null)))
      if (alive) setCampaignTotals(Object.fromEntries(pairs.filter((p): p is readonly [string, MetricTotals] => Boolean(p))))
    })
    return () => { alive = false }
  }, [activeCompany?.id, marketing, campaignsOn]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── What the page shows, computed from the loaded data.
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const todayIso = iso(today)
  const weekEndIso = iso(new Date(today.getTime() + 6 * DAY))
  const upcomingIdeas = calendar.filter(i => i.status === 'idea' && i.date >= todayIso)
  const ideasThisWeek = upcomingIdeas.filter(i => i.date <= weekEndIso).length
  const active = campaigns.filter(cp => cp.status === 'active')
  const nextPlanned = campaigns.filter(cp => cp.status === 'planned' && cp.start_date >= todayIso).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  const drafts = library.filter(i => i.status === 'Draft').length
  const validated = library.filter(i => i.status === 'Validated').length
  const lastPlanned = calendar.map(i => i.date).sort().pop() ?? ''
  const fmtDay = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today.getTime() + i * DAY)
    const key = iso(date)
    return {
      key,
      label: i === 0 ? c.today : i === 1 ? c.tomorrow : date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }),
      posts: calendar.filter(item => item.date === key),
    }
  }), [calendar, today, c, locale])

  // ── The AI's three priorities, cached for a day unless the signals change.
  const loadActivities = useCallback(async (force = false) => {
    if (!activeCompany || !apiKeyConfigured || !counts || !loaded) return
    const emptyDays = week.filter(d => !d.posts.length).length
    const campaignSignals = active.map(cp => {
      const tot = campaignTotals[cp.id]
      const reach = cp.target_reach && tot ? `${Math.round((tot.reach / cp.target_reach) * 100)}% of reach target` : 'no reach data'
      return `${cp.name} (ends ${cp.end_date || 'not set'}, ${reach})`
    }).join('; ')
    const signals = [
      `Products configured: ${products.length}`,
      `Audience segments configured: ${segments.length}`,
      `Key messages configured: ${keyMessages.length}`,
      marketing ? `Calendar: ${upcomingIdeas.length} ideas still to write, ${ideasThisWeek} of them this week; ${emptyDays} of the next 7 days have nothing planned; last planned date ${lastPlanned || 'none'}` : '',
      marketing ? `Library: ${drafts} drafts (${counts.staleDrafts} untouched for 7+ days), ${validated} validated and ready to schedule` : '',
      marketing ? `Posts published in the last 30 days: ${counts.publishedLast30} (previous 30 days: ${counts.publishedPrev30})` : '',
      campaignsOn ? `Active campaigns: ${campaignSignals || 'none'}` : '',
      `Roadmap milestones completed: ${counts.roadmap}`,
      `Weekly report filed this week: ${counts.hasReportThisWeek ? 'yes' : 'no'}`,
      `Today: ${todayIso}`,
    ].filter(Boolean).join('\n')
    const routes = ['/onboarding', '/memory', '/roadmap', '/report',
      ...(marketing ? ['/calendar', '/content', '/library', '/studio', '/publishing-history'] : []),
      ...(campaignsOn ? ['/campaigns'] : [])]
    const cacheKey = `flowcom:workspace_activity:v4:${activeCompany.id}:${signals.length}:${todayIso}`
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as { createdAt: number; activities: Activity[] } | null
        if (cached && Date.now() - cached.createdAt < ACTIVITY_TTL) { setActivities(cached.activities); return }
      } catch { /* storage unavailable */ }
    }
    setActivitiesLoading(true)
    setActivitiesError('')
    try {
      const result = await callModelJSON<{ activities: Activity[] }>(activeCompany.id, [
        { role: 'system', content: `You are FlowCom's proactive communication strategist. Turn the live workspace signals into at most three useful, non-duplicated actions for today, most urgent first. Prioritise missing foundations, then what is due soonest, then optimisation. Each reason is one natural sentence for the user that states the fact behind it (a number, a date, a campaign name). Never quote the signal names below, never write "Signal", labels in parentheses or "key = value": the signals are internal notes, the reader never sees them. Write French fields entirely in French and English fields entirely in English. Return only JSON: {"activities":[{"title_fr":"short imperative in French","title_en":"short imperative in English","reason_fr":"one sentence in French","reason_en":"one sentence in English","action_fr":"2-3 word button label in French","action_en":"2-3 word button label in English","route":"one of ${routes.join(', ')}","step":"only for /onboarding: 1 company, 2 brand identity, 3 products, 4 audience, 5 communication","priority":"high or medium or low"}]}. Return an empty list when nothing needs doing. Never invent facts.\nCompany context:\n${buildAiContext({ company: activeCompany, products, segments, keyMessages })}\nLive signals:\n${signals}` },
        { role: 'user', content: 'What should I do today?' },
      ], { temperature: 0.4, max_tokens: 900, requiredKeys: ['activities'] })
      const safe = (result.activities ?? []).filter(a =>
        a.title_fr && a.title_en && a.reason_fr && a.reason_en && a.action_fr && a.action_en && routes.includes(a.route) &&
        (a.route !== '/onboarding' || (Number.isInteger(Number(a.step)) && Number(a.step) >= 1 && Number(a.step) <= 5)),
      ).slice(0, 3).map(a => ({
        ...a,
        reason_fr: cleanReason(a.reason_fr),
        reason_en: cleanReason(a.reason_en),
        priority: (['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'low') as Activity['priority'],
        route: a.route === '/onboarding' ? `/onboarding?step=${Number(a.step)}` : a.route,
      }))
      setActivities(safe)
      try { localStorage.setItem(cacheKey, JSON.stringify({ createdAt: Date.now(), activities: safe })) } catch { /* storage unavailable */ }
    } catch (err) {
      setActivitiesError(t(buildModelError(err) as Parameters<typeof t>[0]))
    } finally {
      setActivitiesLoading(false)
    }
  }, [activeCompany, apiKeyConfigured, counts, loaded, week, active, campaignTotals, products, segments, keyMessages, marketing, campaignsOn, upcomingIdeas.length, ideasThisWeek, lastPlanned, drafts, validated, todayIso, t])

  useEffect(() => { void loadActivities() }, [loaded, activeCompany?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const firstName = profile?.name?.split(' ')[0] ?? ''
  const dateLabel = today.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })

  if (!activeCompany) {
    return (
      <div className="min-h-full bg-surface-page">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-20 text-center">
          <span className="fc-proposal__icon"><Spark /></span>
          <h1 className="m-0 text-[22px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{c.noCompany}</h1>
          <p className="m-0 text-sm text-ink-muted">{c.noCompanyText}</p>
          <Button variant="primary" icon={<ArrowRight />} onClick={() => navigate('/onboarding')}>{c.setup}</Button>
        </div>
      </div>
    )
  }

  const kpis = [
    ...(marketing ? [
      { label: c.published30, value: counts?.publishedLast30, to: '/publishing-history',
        sub: counts ? c.vsBefore(counts.publishedLast30 - counts.publishedPrev30) : '', color: counts && counts.publishedLast30 > counts.publishedPrev30 ? 'var(--success)' : 'var(--ink-muted)' },
      { label: c.ideas, value: upcomingIdeas.length, to: '/calendar', sub: c.thisWeekCount(ideasThisWeek), color: 'var(--ink-muted)' },
      { label: c.drafts, value: counts?.staleDrafts, to: '/library', sub: counts?.staleDrafts ? c.staleNote : c.noneWaiting, color: counts?.staleDrafts ? 'var(--warning)' : 'var(--ink-muted)' },
    ] : []),
    ...(campaignsOn ? [
      { label: c.activeCampaigns, value: active.length, to: '/campaigns', sub: nextPlanned ? c.nextStart(fmtDay(nextPlanned.start_date)) : c.noneUpcoming, color: 'var(--ink-muted)' },
    ] : []),
  ]

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-3.5 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>
              {firstName ? `${c.hello} ${firstName}` : c.welcome}
            </h1>
            <p className="m-0 mt-0.5 text-sm text-ink-muted"><span className="capitalize">{dateLabel}</span> · {activeCompany.name}</p>
          </div>
          {marketing && (
            <div className="flex flex-wrap gap-1.5">
              <Link to="/calendar" className="fc-btn fc-btn--secondary fc-btn--sm">{c.planMonth}</Link>
              <Link to="/content" className="fc-btn fc-btn--secondary fc-btn--sm">{c.writePost}</Link>
              <Link to="/studio" className="fc-btn fc-btn--primary fc-btn--sm">{c.schedule}</Link>
            </div>
          )}
        </div>

        {kpis.length > 0 && (
          <Card className={cn('grid grid-cols-2', kpis.length === 4 ? 'lg:grid-cols-4' : kpis.length === 3 ? 'lg:grid-cols-3' : '')}>
            {kpis.map((k, i) => (
              <Link key={k.label} to={k.to} className={cn('block px-4 py-3 text-ink hover:bg-surface-sunken',
                i % 2 === 1 && 'border-l border-line', i > 1 && 'border-t border-line lg:border-t-0', i > 0 && 'lg:border-l lg:border-line')}>
                <span className="block text-[12px] font-semibold text-ink-muted">{k.label}</span>
                <span className="mt-0.5 block text-[22px] font-bold leading-7 tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{k.value ?? '—'}</span>
                <span className="mt-0.5 block text-[12px]" style={{ color: k.color }}>{k.sub}</span>
              </Link>
            ))}
          </Card>
        )}

        <div className={cn('grid gap-3.5', (marketing || campaignsOn) && 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]')}>
          <div className="flex min-w-0 flex-col gap-3.5">
            {apiKeyConfigured && (
              <Card>
                <CardHeader title={<span className="flex items-center gap-1.5"><Spark className="h-4 w-4" />{c.todo}</span>}
                  actions={<Button variant="ghost" size="sm" iconOnly icon={<RefreshCw className={cn(activitiesLoading && 'animate-spin')} />} aria-label={c.refresh}
                    disabled={activitiesLoading || !loaded} onClick={() => void loadActivities(true)} />} />
                <CardBody className="flex flex-col pt-1.5">
                  {activitiesLoading || !loaded ? (
                    <p className="m-0 flex items-center gap-2 py-2 text-[13px] text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />{c.preparing}</p>
                  ) : activitiesError ? (
                    <p className="m-0 py-2 text-[13px] text-danger">{activitiesError}</p>
                  ) : !activities.length ? (
                    <p className="m-0 py-2 text-[13px] text-ink-muted">{c.noTodo}</p>
                  ) : activities.map((a, i) => (
                    <div key={`${a.title_en}-${i}`} className="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-3 border-b border-line py-2.5 last:border-b-0 sm:grid-cols-[10px_minmax(0,1fr)_auto]">
                      <span className="mt-1.5 h-2 w-2 rounded-full" style={{ background: PRIORITY_COLOR[a.priority] }} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{a[`title_${L}`]}</span>
                        <span className="mt-px block text-[13px] leading-[18px] text-ink-muted">{a[`reason_${L}`]}</span>
                      </span>
                      <Link to={a.route} className="fc-btn fc-btn--secondary fc-btn--sm col-start-2 justify-self-start sm:col-start-auto">{a[`action_${L}`]}</Link>
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}

            {marketing && (
              <Card>
                <CardHeader title={c.week} actions={<Link to="/calendar" className="fc-btn fc-btn--ghost fc-btn--sm">{c.calendar}</Link>} />
                <CardBody className="flex flex-col pt-1.5">
                  {week.map(d => (
                    <div key={d.key} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 border-b border-line py-2 last:border-b-0">
                      <span className="text-[12px] font-bold capitalize leading-5 text-ink-muted">{d.label}</span>
                      <span className="flex min-w-0 flex-col gap-1">
                        {d.posts.length ? d.posts.map(p => {
                          const def = CHANNEL_MAP[networkOf(p.channel)]
                          return (
                            <span key={p.id} className="flex items-center gap-2 text-[13px] leading-5">
                              {def && <def.icon className="h-3.5 w-3.5 shrink-0" style={{ color: def.color }} />}
                              <span className="min-w-0 flex-1 truncate text-ink">{p.topic || '—'}</span>
                              <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{c.status[p.status] ?? p.status}</Badge>
                            </span>
                          )
                        }) : <span className="text-[13px] leading-5 text-ink-subtle">{c.nothing}</span>}
                      </span>
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>

          {(marketing || campaignsOn) && (
            <div className="flex min-w-0 flex-col gap-3.5">
              {campaignsOn && (
                <Card>
                  <CardHeader title={c.campaigns} actions={<Link to="/campaigns" className="fc-btn fc-btn--ghost fc-btn--sm">{c.allCampaigns}</Link>} />
                  <CardBody className="flex flex-col pt-1.5">
                    {!active.length ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-[13px] text-ink-muted">
                        {c.noCampaign}<Link to="/campaigns" className="fc-btn fc-btn--secondary fc-btn--sm">{c.createCampaign}</Link>
                      </div>
                    ) : active.map(cp => {
                      const start = Date.parse(cp.start_date)
                      const end = Date.parse(cp.end_date)
                      const total = cp.start_date && cp.end_date ? Math.max(1, Math.round((end - start) / DAY) + 1) : 0
                      const dayNo = total ? Math.min(total, Math.max(1, Math.round((today.getTime() - start) / DAY) + 1)) : 0
                      const tot = campaignTotals[cp.id]
                      const pct = (value: number | undefined, target: number | null) => (target && value !== undefined ? `${Math.round((value / target) * 100)} %` : '—')
                      return (
                        <Link key={cp.id} to={`/campaigns/${cp.id}`} className="block border-b border-line py-2.5 text-ink last:border-b-0">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{cp.name}</span>
                            {total > 0 && <span className="shrink-0 text-[12px] text-ink-muted">{c.day(dayNo, total)}</span>}
                          </span>
                          {total > 0 && (
                            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                              <span className="block h-full rounded-full bg-brand" style={{ width: `${(dayNo / total) * 100}%` }} />
                            </span>
                          )}
                          <span className="mt-1.5 flex gap-3.5 text-[12px] text-ink-muted">
                            <span>{c.reach} <strong className="text-ink">{pct(tot?.reach, cp.target_reach)}</strong></span>
                            <span>{c.leads} <strong className="text-ink">{pct(tot?.leads, cp.target_leads)}</strong></span>
                          </span>
                        </Link>
                      )
                    })}
                  </CardBody>
                </Card>
              )}

              {marketing && (
                <Card>
                  <CardHeader title={c.content} actions={<Link to="/library" className="fc-btn fc-btn--ghost fc-btn--sm">{c.library}</Link>} />
                  <CardBody className="flex flex-col pt-1.5">
                    {([
                      [c.pipeline.ideas, upcomingIdeas.length, 'var(--ink-subtle)', '/calendar'],
                      [c.pipeline.draft, drafts, 'var(--warning)', '/library'],
                      [c.pipeline.validated, validated, 'var(--info)', '/library'],
                      [c.pipeline.published, counts?.publishedLast30 ?? 0, 'var(--success)', '/publishing-history'],
                    ] as const).map(([label, count, color, to]) => (
                      <Link key={label} to={to} className="flex items-center gap-2.5 border-b border-line py-2 text-[13px] text-ink last:border-b-0 hover:text-brand">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                        <span className="flex-1">{label}</span>
                        <strong className="text-sm tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{count}</strong>
                      </Link>
                    ))}
                  </CardBody>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
