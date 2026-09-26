import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, Trash2 } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { callModelJSON, buildModelError } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'
import { setContentCampaign } from '@/lib/campaigns'
import { buildCampaignContext, CONTENT_CHANNEL, useCampaignOptions } from '@/lib/campaignContext'
import {
  createDataverseCalendarItem, deleteDataverseCalendarItem, listDataverseCalendarItems, updateDataverseCalendarItem,
} from '@/lib/dataverse'
import { CHANNELS, CHANNEL_MAP, ChannelIcons, FORMATS, FORMAT_MAP, networkOf, parseChannels, suggestedFormat, type ContentFormat } from '@/lib/channels'
import {
  Badge, Button, Card, CardBody, CardHeader, Chip, InsightCard, SelectField, Sheet, Spark, TextField, type Tone,
} from '@/components/ui'
import { cn } from '@/lib/utils'

type Status = 'idea' | 'scheduled' | 'published'

interface CalendarItem {
  id: string
  date: string
  topic: string
  goal: string
  format: ContentFormat
  channel: string
  status: Status
  campaign_id?: string | null
}

type Draft = Omit<CalendarItem, 'id'> & { id?: string }

const COPY = {
  fr: {
    title: 'Calendrier éditorial', posts: 'posts', ideasToWrite: 'idées à rédiger',
    today: "Aujourd'hui", month: 'Mois', list: 'Liste', newIdea: 'Nouvelle idée', plan: "Planifier avec l'IA",
    allCampaigns: 'Toutes les campagnes', noCampaign: 'Sans campagne',
    status: { idea: 'Idée', scheduled: 'Programmé', published: 'Publié' } as Record<Status, string>,
    statusPlural: { idea: 'idées', scheduled: 'programmés', published: 'publiés' } as Record<Status, string>,
    weekdays: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], more: 'autre(s)',
    analysis: 'Analyse du mois', analysing: 'Analyse du mois…', analysisOk: 'Rien à signaler ce mois-ci',
    analysisOkText: 'La répartition des posts, des réseaux et des objectifs est équilibrée.', proposePosts: 'Proposer des posts',
    mix: 'Répartition par réseau', upcoming: 'À venir', nothingUpcoming: 'Aucun post prévu après aujourd\'hui.',
    empty: 'Aucun post ce mois-ci.', emptyHint: 'Planifiez le mois avec l\'IA ou ajoutez une idée.',
    week: 'Semaine du', dayPosts: 'posts ce jour-là', addToDay: 'Ajouter une idée ce jour-là',
    planTitle: "Planifier avec l'IA", planSub: 'selon votre mémoire d\'entreprise', campaign: 'Campagne', goals: 'Objectifs',
    networks: 'Réseaux', rhythm: 'Rythme', perWeek: 'posts par semaine', theme: 'Thème du mois (optionnel)',
    themePlaceholder: 'Par exemple : réussir sa reconversion', about: 'Environ', ideasFor: 'idées pour',
    added: 'Elles sont ajoutées au calendrier sans effacer vos posts existants.', generate: 'Générer les idées', generating: 'Génération…',
    campaignHint: "Les idées suivent le brief, l'audience et la zone de la campagne",
    clearMonth: 'Vider le mois', confirmClear: 'Supprimer tous les posts de ce mois ? Cette action est définitive.',
    cancel: 'Annuler', save: 'Enregistrer', delete: 'Supprimer', confirmDelete: 'Supprimer ce post du calendrier ?',
    topic: 'Sujet', goal: 'Objectif', date: 'Date', format: 'Format', network: 'Réseau', networksHint: 'Un post par réseau, rédigé pour ce réseau.',
    adapt: 'Adapter pour un autre réseau', adaptHint: 'Crée une copie de cette idée pour le réseau choisi ; le texte sera rédigé pour ce réseau.',
    notWritten: 'Pas encore rédigé', notWrittenText: "L'IA peut rédiger ce post à partir du sujet, de l'objectif et du brief de la campagne.",
    write: "Rédiger avec l'IA", newIdeaTitle: 'Nouvelle idée', needNetwork: 'Choisissez au moins un réseau.', needTopic: 'Indiquez un sujet.',
    goalOptions: ['Visibilité', 'Prospects', 'Engagement', 'Conversion', 'Éducation', 'Fidélisation'],
    evidence: 'Calendrier', memory: 'Mémoire',
  },
  en: {
    title: 'Editorial calendar', posts: 'posts', ideasToWrite: 'ideas to write',
    today: 'Today', month: 'Month', list: 'List', newIdea: 'New idea', plan: 'Plan with AI',
    allCampaigns: 'All campaigns', noCampaign: 'No campaign',
    status: { idea: 'Idea', scheduled: 'Scheduled', published: 'Published' } as Record<Status, string>,
    statusPlural: { idea: 'ideas', scheduled: 'scheduled', published: 'published' } as Record<Status, string>,
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], more: 'more',
    analysis: 'Month analysis', analysing: 'Analysing the month…', analysisOk: 'Nothing to flag this month',
    analysisOkText: 'Posts, networks and goals are well balanced.', proposePosts: 'Suggest posts',
    mix: 'Posts per network', upcoming: 'Coming up', nothingUpcoming: 'Nothing planned after today.',
    empty: 'No posts this month.', emptyHint: 'Plan the month with AI or add an idea.',
    week: 'Week of', dayPosts: 'posts that day', addToDay: 'Add an idea that day',
    planTitle: 'Plan with AI', planSub: 'based on your company memory', campaign: 'Campaign', goals: 'Goals',
    networks: 'Networks', rhythm: 'Rhythm', perWeek: 'posts per week', theme: 'Theme of the month (optional)',
    themePlaceholder: 'For example: changing careers', about: 'About', ideasFor: 'ideas for',
    added: 'They are added to the calendar without removing your existing posts.', generate: 'Generate ideas', generating: 'Generating…',
    campaignHint: "Ideas follow the campaign's brief, audience and zone",
    clearMonth: 'Clear the month', confirmClear: 'Delete every post of this month? This cannot be undone.',
    cancel: 'Cancel', save: 'Save', delete: 'Delete', confirmDelete: 'Delete this post from the calendar?',
    topic: 'Topic', goal: 'Goal', date: 'Date', format: 'Format', network: 'Network', networksHint: 'One post per network, written for that network.',
    adapt: 'Adapt for another network', adaptHint: 'Creates a copy of this idea for the chosen network; the text is written for that network.',
    notWritten: 'Not written yet', notWrittenText: "The AI can write this post from the topic, the goal and the campaign's brief.",
    write: 'Write with AI', newIdeaTitle: 'New idea', needNetwork: 'Choose at least one network.', needTopic: 'Enter a topic.',
    goalOptions: ['Visibility', 'Leads', 'Engagement', 'Conversion', 'Education', 'Retention'],
    evidence: 'Calendar', memory: 'Memory',
  },
}
type Copy = typeof COPY.fr

const STATUSES: Status[] = ['idea', 'scheduled', 'published']
const STATUS_TONE: Record<Status, Tone> = { idea: 'neutral', scheduled: 'info', published: 'success' }
const STATUS_DOT: Record<Status, string> = { idea: 'var(--ink-subtle)', scheduled: 'var(--info)', published: 'var(--success)' }

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthKey = (y: number, m: number) => `${y}-${pad(m + 1)}`
const todayIso = () => iso(new Date())

function useNarrow() {
  const query = '(max-width: 767px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

// The Monday-first weeks covering a month.
function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7))
  const weeks: Date[][] = []
  for (let cursor = new Date(start); weeks.length < 6; ) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) { week.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1) }
    weeks.push(week)
    if (cursor.getMonth() !== month) break
  }
  return weeks
}

function StatusDot({ status }: { status: Status }) {
  return <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: STATUS_DOT[status] }} aria-hidden="true" />
}

function FormatIcon({ format, className }: { format: ContentFormat; className?: string }) {
  const Icon = FORMAT_MAP[format]?.icon ?? FORMAT_MAP.Post.icon
  return <Icon className={cn('h-3 w-3 shrink-0', className)} aria-hidden="true" />
}

function DateBlock({ date, lang }: { date: string; lang: 'fr' | 'en' }) {
  const d = new Date(`${date}T00:00:00`)
  return (
    <span className="fc-date">
      <span className="fc-date__m">{d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { month: 'short' })}</span>
      <span className="fc-date__d">{d.getDate()}</span>
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { t, lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const navigate = useNavigate()
  const narrow = useNarrow()
  const { campaigns, zoneLabel } = useCampaignOptions(activeCompany?.id)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [view, setView] = useState<'month' | 'list'>('month')
  const [items, setItems] = useState<CalendarItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [error, setError] = useState('')
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'none' | string>('all')
  const [channelFilter, setChannelFilter] = useState<string[]>([])
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [openDay, setOpenDay] = useState<string | null>(null)

  const canEdit = Boolean(activeCompany && ['owner', 'admin', 'editor'].includes(activeCompany.role ?? ''))

  useEffect(() => {
    let cancelled = false
    if (!activeCompany) { setItems([]); setLoadingItems(false); return }
    setLoadingItems(true)
    listDataverseCalendarItems(activeCompany.id)
      .then(data => { if (!cancelled) setItems(data as CalendarItem[]) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoadingItems(false) })
    return () => { cancelled = true }
  }, [activeCompany?.id])

  const mk = monthKey(year, month)
  const monthItems = useMemo(() => items.filter(i => i.date.startsWith(mk)), [items, mk])
  const visibleItems = useMemo(() => monthItems.filter(i => {
    if (campaignFilter === 'none' && i.campaign_id) return false
    if (campaignFilter !== 'all' && campaignFilter !== 'none' && i.campaign_id !== campaignFilter) return false
    if (channelFilter.length && !channelFilter.includes(networkOf(i.channel))) return false
    return true
  }).sort((a, b) => a.date.localeCompare(b.date)), [monthItems, campaignFilter, channelFilter])

  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, monthItems.filter(i => i.status === s).length])) as Record<Status, number>, [monthItems])
  const monthChannels = useMemo(() => {
    const tally: Record<string, number> = {}
    for (const item of monthItems) { const ch = networkOf(item.channel); if (ch) tally[ch] = (tally[ch] ?? 0) + 1 }
    return Object.entries(tally).sort((a, b) => b[1] - a[1])
  }, [monthItems])
  const monthName = new Date(year, month, 1).toLocaleDateString(L === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' })

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()) }

  const openNew = (date?: string) => setDraft({
    date: date ?? (mk === todayIso().slice(0, 7) ? todayIso() : `${mk}-01`),
    topic: '', goal: '', format: 'Post', channel: parseChannels(activeCompany?.channels ?? '')[0] ?? 'linkedin', status: 'idea',
    campaign_id: campaignFilter !== 'all' && campaignFilter !== 'none' ? campaignFilter : null,
  })

  const writeWithAi = (item: CalendarItem | Draft) => {
    const first = networkOf(item.channel)
    navigate(`/content?${new URLSearchParams({ topic: item.topic, channel: first, goal: item.goal, format: item.format, date: item.date, ...(item.id ? { item: item.id } : {}), ...(item.campaign_id ? { campaign: item.campaign_id } : {}) }).toString()}`)
  }

  const saveDraft = async (next: Draft): Promise<CalendarItem | null> => {
    if (!activeCompany) return null
    const { id, campaign_id, ...fields } = next
    let saved: CalendarItem
    if (id) {
      await updateDataverseCalendarItem(id, fields)
      const previous = items.find(i => i.id === id)
      if ((previous?.campaign_id ?? null) !== (campaign_id ?? null)) await setContentCampaign('calendar', id, campaign_id ?? null)
      saved = { ...fields, id, campaign_id }
      setItems(prev => prev.map(i => i.id === id ? saved : i))
    } else {
      const created = await createDataverseCalendarItem(activeCompany.id, fields)
      if (campaign_id) await setContentCampaign('calendar', created.id, campaign_id)
      saved = { ...(created as CalendarItem), campaign_id }
      setItems(prev => [...prev, saved])
    }
    window.dispatchEvent(new Event('flowcom:data-updated'))
    setDraft(null)
    return saved
  }

  const deleteItem = async (id: string) => {
    await deleteDataverseCalendarItem(id)
    setItems(prev => prev.filter(i => i.id !== id))
    window.dispatchEvent(new Event('flowcom:data-updated'))
    setDraft(null)
  }

  const clearMonth = async () => {
    if (!window.confirm(c.confirmClear)) return
    await Promise.all(monthItems.map(i => deleteDataverseCalendarItem(i.id)))
    setItems(prev => prev.filter(i => !i.date.startsWith(mk)))
    window.dispatchEvent(new Event('flowcom:data-updated'))
  }

  const onGenerated = (created: CalendarItem[]) => {
    setItems(prev => [...prev, ...created])
    window.dispatchEvent(new Event('flowcom:data-updated'))
    setPlannerOpen(false)
  }

  const showMonth = view === 'month' && !narrow

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
            <p className="m-0 mt-0.5 text-sm text-ink-muted">{monthItems.length} {c.posts} · {counts.idea} {c.ideasToWrite}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-line-strong bg-surface-card p-0.5">
              <Button variant="ghost" size="sm" iconOnly icon={<ChevronLeft />} onClick={() => shiftMonth(-1)} aria-label={L === 'fr' ? 'Mois précédent' : 'Previous month'} />
              <span className="min-w-[128px] text-center text-sm font-bold capitalize text-ink" style={{ fontFamily: 'var(--font-display)' }}>{monthName}</span>
              <Button variant="ghost" size="sm" iconOnly icon={<ChevronRight />} onClick={() => shiftMonth(1)} aria-label={L === 'fr' ? 'Mois suivant' : 'Next month'} />
            </div>
            <Button variant="ghost" size="sm" onClick={goToday}>{c.today}</Button>
            {!narrow && (
              <div role="tablist" aria-label={L === 'fr' ? 'Affichage' : 'View'} className="flex rounded-[var(--radius-md)] border border-line-strong bg-surface-card p-0.5">
                {(['month', 'list'] as const).map(v => (
                  <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                    className={cn('fc-btn fc-btn--sm', view === v ? 'bg-brand-soft text-brand-ink' : 'fc-btn--ghost')}>
                    {v === 'month' ? c.month : c.list}
                  </button>
                ))}
              </div>
            )}
            <Button variant="secondary" icon={<Plus />} onClick={() => openNew()} disabled={!canEdit}>{c.newIdea}</Button>
            <Button variant="ai" onClick={() => setPlannerOpen(true)} disabled={!canEdit || !apiKeyConfigured}>{c.plan}</Button>
          </div>
        </div>

        {/* Filters and counts */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip pressed={campaignFilter === 'all'} onClick={() => setCampaignFilter('all')}>{c.allCampaigns}</Chip>
            {campaigns.map(cp => <Chip key={cp.id} pressed={campaignFilter === cp.id} onClick={() => setCampaignFilter(cp.id)}>{cp.name}</Chip>)}
            <Chip pressed={campaignFilter === 'none'} onClick={() => setCampaignFilter('none')}>{c.noCampaign}</Chip>
            {monthChannels.length > 1 && <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />}
            {monthChannels.length > 1 && monthChannels.map(([ch]) => {
              const def = CHANNEL_MAP[ch]
              if (!def) return null
              const on = channelFilter.includes(ch)
              return (
                <Chip key={ch} pressed={on} icon={<def.icon className="h-3.5 w-3.5" style={{ color: def.color }} />}
                  onClick={() => setChannelFilter(f => on ? f.filter(x => x !== ch) : [...f, ch])}>{def.label}</Chip>
              )
            })}
          </div>
          <div className="flex items-center gap-1.5">
            {STATUSES.map(s => (
              <Badge key={s} tone={STATUS_TONE[s]} icon={<StatusDot status={s} />}>{counts[s]} {c.statusPlural[s]}</Badge>
            ))}
          </div>
        </div>

        {error && <p className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div className={cn('grid gap-4', !narrow && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
          <div className="min-w-0">
            {loadingItems ? (
              <Card className="grid h-[480px] place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ink-muted" /></Card>
            ) : showMonth ? (
              <MonthGrid year={year} month={month} items={visibleItems} c={c} canEdit={canEdit}
                onOpen={item => setDraft({ ...item })} onNew={openNew} onDay={setOpenDay} />
            ) : (
              <ListView items={visibleItems} c={c} lang={L} onOpen={item => setDraft({ ...item })} onNew={() => openNew()} canEdit={canEdit} />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <MonthAnalysis monthItems={monthItems} mk={mk} c={c} lang={L} onPropose={() => setPlannerOpen(true)} canPlan={canEdit && apiKeyConfigured} />
            {monthChannels.length > 0 && (
              <Card>
                <CardHeader title={c.mix} />
                <CardBody className="flex flex-col gap-2.5">
                  {monthChannels.map(([ch, count], i) => {
                    const def = CHANNEL_MAP[ch]
                    const max = monthChannels[0][1]
                    return (
                      <div key={ch} className="grid grid-cols-[92px_minmax(0,1fr)_24px] items-center gap-2 text-[13px] text-ink">
                        <span className="flex items-center gap-1.5 truncate">{def && <def.icon className="h-3.5 w-3.5 shrink-0" style={{ color: def.color }} />}{def?.label ?? ch}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                          <span className="block h-full rounded-full" style={{ width: `${Math.round((count / max) * 100)}%`, background: `var(--chart-${(i % 6) + 1})` }} />
                        </span>
                        <span className="text-right font-bold" style={{ fontFamily: 'var(--font-display)' }}>{count}</span>
                      </div>
                    )
                  })}
                </CardBody>
              </Card>
            )}
            <Upcoming items={items} c={c} lang={L} onOpen={item => setDraft({ ...item })} onList={() => setView('list')} />
          </div>
        </div>
      </div>

      <Planner open={plannerOpen} onClose={() => setPlannerOpen(false)} c={c} lang={L} year={year} month={month} monthName={monthName}
        campaigns={campaigns} zoneLabel={zoneLabel} onGenerated={onGenerated} onClear={clearMonth} hasMonthItems={monthItems.length > 0}
        context={() => buildAiContext({ company: activeCompany, products, segments, keyMessages })}
        segments={segments} keyMessages={keyMessages} companyId={activeCompany?.id ?? ''} companyChannels={activeCompany?.channels ?? ''} t={t} />

      <DaySheet day={openDay} items={visibleItems.filter(i => i.date === openDay)} c={c} lang={L} canEdit={canEdit}
        onClose={() => setOpenDay(null)}
        onOpen={item => { setOpenDay(null); setDraft({ ...item }) }}
        onNew={date => { setOpenDay(null); openNew(date) }} />

      <DetailSheet draft={draft} onClose={() => setDraft(null)} c={c} lang={L} campaigns={campaigns} canEdit={canEdit} apiReady={apiKeyConfigured}
        onSave={saveDraft} onDelete={deleteItem} onWrite={writeWithAi} onAdapt={setDraft} />
    </div>
  )
}

// ─── Month grid ───────────────────────────────────────────────────────────────

function MonthGrid({ year, month, items, c, canEdit, onOpen, onNew, onDay }: {
  year: number; month: number; items: CalendarItem[]; c: Copy; canEdit: boolean
  onOpen: (item: CalendarItem) => void; onNew: (date: string) => void; onDay: (date: string) => void
}) {
  const weeks = monthWeeks(year, month)
  const today = todayIso()
  const byDay = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {}
    for (const item of items) (map[item.date] ??= []).push(item)
    return map
  }, [items])

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-surface-sunken">
        {c.weekdays.map(wd => <div key={wd} className="px-2.5 py-2 text-[12px] font-semibold text-ink-muted">{wd}</div>)}
      </div>
      <div>
        {weeks.map((week, w) => (
          <div key={w} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {week.map(day => {
              const key = iso(day)
              const inMonth = day.getMonth() === month
              const dayItems = byDay[key] ?? []
              const weekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <div key={key}
                  className={cn('group relative flex min-h-[112px] min-w-0 flex-col gap-1 border-r border-line p-1.5 last:border-r-0',
                    !inMonth && 'bg-surface-page', inMonth && weekend && 'bg-[color-mix(in_srgb,var(--surface-page)_50%,var(--surface-card))]')}>
                  <div className="flex items-center justify-between">
                    <span className={cn('grid h-6 min-w-6 place-items-center text-[12px] font-semibold',
                      key === today ? 'rounded-full bg-brand px-1 font-bold text-on-brand' : inMonth ? 'text-ink' : 'text-ink-subtle')}
                      style={{ fontFamily: 'var(--font-display)' }}>{day.getDate()}</span>
                    {inMonth && canEdit && (
                      <button onClick={() => onNew(key)} aria-label={`${c.newIdea} ${key}`}
                        className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-ink-muted opacity-0 transition-opacity hover:bg-surface-sunken focus-visible:opacity-100 group-hover:opacity-100">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {dayItems.slice(0, 2).map(item => <PostChip key={item.id} item={item} c={c} onOpen={() => onOpen(item)} />)}
                  {dayItems.length > 2 && (
                    <button onClick={() => onDay(key)} className="px-1 text-left text-[11px] font-semibold text-brand hover:underline">
                      +{dayItems.length - 2} {c.more}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </Card>
  )
}

function PostChip({ item, c, onOpen }: { item: CalendarItem; c: Copy; onOpen: () => void }) {
  const channels = [networkOf(item.channel)]
  const labels = CHANNEL_MAP[channels[0]]?.label ?? channels[0]
  const formatLabel = FORMAT_MAP[item.format]?.label[c === COPY.fr ? 'fr' : 'en'] ?? item.format
  return (
    <button onClick={onOpen} title={`${item.topic} · ${formatLabel} · ${labels} · ${c.status[item.status]}`}
      className={cn('flex w-full min-w-0 flex-col gap-0.5 rounded-[var(--radius-sm)] border border-line bg-surface-card px-1.5 py-1 text-left text-[11px] leading-[14px] text-ink hover:border-line-strong',
        item.status === 'idea' && 'border-dashed')}>
      <span className="flex items-center gap-1 text-ink-muted">
        <StatusDot status={item.status} />
        <FormatIcon format={item.format} />
        <span className="flex-1" />
        <ChannelIcons channels={channels} />
      </span>
      <span className="truncate">{item.topic || '—'}</span>
    </button>
  )
}

// Every post of one day, opened from "+n more" in the month grid.
function DaySheet({ day, items, c, lang, canEdit, onClose, onOpen, onNew }: {
  day: string | null; items: CalendarItem[]; c: Copy; lang: 'fr' | 'en'; canEdit: boolean
  onClose: () => void; onOpen: (item: CalendarItem) => void; onNew: (date: string) => void
}) {
  if (!day) return null
  const title = new Date(`${day}T00:00:00`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <Sheet open onClose={onClose} closeLabel={c.cancel} title={<span className="capitalize">{title}</span>} subtitle={`${items.length} ${c.dayPosts}`}
      icon={<span className="pt-0.5"><DateBlock date={day} lang={lang} /></span>}
      footer={canEdit ? <><span className="flex-1" /><Button variant="secondary" icon={<Plus />} onClick={() => onNew(day)}>{c.addToDay}</Button></> : undefined}>
      <div className="flex flex-col gap-1.5">
        {items.map(item => (
          <button key={item.id} onClick={() => onOpen(item)}
            className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface-card px-3 py-2 text-left text-ink hover:border-line-strong">
            <ChannelIcons channels={[networkOf(item.channel)]} className="[&_svg]:h-4 [&_svg]:w-4" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{item.topic || '—'}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
                <FormatIcon format={item.format} className="h-3.5 w-3.5" />{FORMAT_MAP[item.format]?.label[lang] ?? item.format}
                <span className="mx-0.5 h-2.5 w-px bg-line-strong" aria-hidden="true" />
                {CHANNEL_MAP[networkOf(item.channel)]?.label ?? networkOf(item.channel)}
              </span>
            </span>
            <Badge tone={STATUS_TONE[item.status]}>{c.status[item.status]}</Badge>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({ items, c, lang, canEdit, onOpen, onNew }: {
  items: CalendarItem[]; c: Copy; lang: 'fr' | 'en'; canEdit: boolean; onOpen: (item: CalendarItem) => void; onNew: () => void
}) {
  const groups = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const item of items) {
      const d = new Date(`${item.date}T00:00:00`)
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = iso(monday)
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return [...map.entries()]
  }, [items])

  if (!items.length) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="m-0 text-[15px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{c.empty}</p>
        <p className="m-0 text-sm text-ink-muted">{c.emptyHint}</p>
        {canEdit && <Button variant="secondary" size="sm" icon={<Plus />} onClick={onNew} className="mt-2">{c.newIdea}</Button>}
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([monday, list]) => (
        <section key={monday} className="flex flex-col gap-1.5">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
            {c.week} {new Date(`${monday}T00:00:00`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long' })}
          </p>
          {list.map(item => {
            const channels = [networkOf(item.channel)]
            return (
              <button key={item.id} onClick={() => onOpen(item)}
                className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface-card px-3 py-2 text-left text-ink hover:border-line-strong">
                <DateBlock date={item.date} lang={lang} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.topic || '—'}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
                    <FormatIcon format={item.format} className="h-3.5 w-3.5" />{FORMAT_MAP[item.format]?.label[lang] ?? item.format}
                    <span className="mx-0.5 h-2.5 w-px bg-line-strong" aria-hidden="true" />
                    <ChannelIcons channels={channels} max={5} />
                  </span>
                </span>
                <Badge tone={STATUS_TONE[item.status]}>{c.status[item.status]}</Badge>
              </button>
            )
          })}
        </section>
      ))}
    </div>
  )
}

// ─── Side column ──────────────────────────────────────────────────────────────

function Upcoming({ items, c, lang, onOpen, onList }: { items: CalendarItem[]; c: Copy; lang: 'fr' | 'en'; onOpen: (item: CalendarItem) => void; onList: () => void }) {
  const today = todayIso()
  const next = items.filter(i => i.date >= today && i.status !== 'published').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4)
  return (
    <Card>
      <CardHeader title={c.upcoming} actions={<Button variant="ghost" size="sm" onClick={onList}>{c.list}</Button>} />
      <CardBody className="flex flex-col gap-1.5">
        {next.length === 0 && <p className="m-0 text-[13px] text-ink-muted">{c.nothingUpcoming}</p>}
        {next.map(item => (
          <button key={item.id} onClick={() => onOpen(item)}
            className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-surface-sunken px-2.5 py-2 text-left hover:bg-[color-mix(in_srgb,var(--surface-sunken)_70%,var(--line))]">
            <DateBlock date={item.date} lang={lang} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{item.topic || '—'}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
                <FormatIcon format={item.format} />{FORMAT_MAP[item.format]?.label[lang]}
                <span className="h-2.5 w-px bg-line-strong" aria-hidden="true" />
                <ChannelIcons channels={[networkOf(item.channel)]} />
              </span>
            </span>
            <Badge tone={STATUS_TONE[item.status]}>{c.status[item.status]}</Badge>
          </button>
        ))}
      </CardBody>
    </Card>
  )
}

// The AI's review of the month: gaps, network balance, missing goals.
function MonthAnalysis({ monthItems, mk, c, lang, onPropose, canPlan }: {
  monthItems: CalendarItem[]; mk: string; c: Copy; lang: 'fr' | 'en'; onPropose: () => void; canPlan: boolean
}) {
  const { activeCompany } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const [warnings, setWarnings] = useState<{ fr: string[]; en: string[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const lastKey = useRef('')

  useEffect(() => {
    if (!apiKeyConfigured || !activeCompany || monthItems.length < 3) { setWarnings(null); return }
    const tally = (pick: (i: CalendarItem) => string[]) => monthItems.reduce<Record<string, number>>((acc, i) => {
      for (const k of pick(i)) acc[k] = (acc[k] ?? 0) + 1
      return acc
    }, {})
    const channels = tally(i => [networkOf(i.channel)])
    const key = `${mk}-${monthItems.length}-${Object.keys(channels).sort().join(',')}`
    if (lastKey.current === key) return
    lastKey.current = key
    let alive = true
    const dates = [...new Set(monthItems.map(i => i.date))].sort()
    const gaps: string[] = []
    for (let d = 1; d < dates.length; d++) {
      const diff = (Date.parse(dates[d]) - Date.parse(dates[d - 1])) / 86400000
      if (diff > 5) gaps.push(`${diff} days between ${dates[d - 1]} and ${dates[d]}`)
    }
    const summary = [
      `Month: ${mk}, posts planned: ${monthItems.length}`,
      `Posts per network: ${Object.entries(channels).map(([k, v]) => `${k}(${v})`).join(', ')}`,
      `Goals: ${Object.entries(tally(i => [i.goal])).map(([k, v]) => `${k}(${v})`).join(', ')}`,
      gaps.length ? `Date gaps > 5 days: ${gaps.join('; ')}` : 'No large date gaps',
      `Brand preferred channels: ${activeCompany.channels || 'not set'}`,
      `Brand publishing frequency: ${activeCompany.frequency || 'not set'}`,
    ].join('\n')
    setLoading(true)
    callModelJSON<{ warnings_fr: string[]; warnings_en: string[] }>(activeCompany.id, [
      { role: 'system', content: 'You are an editorial calendar auditor. Return JSON {"warnings_fr":["string"],"warnings_en":["string"]} with 0 to 3 short warnings (max 18 words each; French in warnings_fr, English in warnings_en). Only flag real issues: publishing gaps over 5 days, network imbalance versus the brand\'s preferred channels, goals over- or under-represented. Cite the numbers. A good plan returns empty arrays. Do not invent problems.' },
      { role: 'user', content: summary },
    ], { temperature: 0.2, max_tokens: 400, requiredKeys: ['warnings_fr', 'warnings_en'] })
      .then(result => {
        if (!alive) return
        const clean = (list: unknown) => (Array.isArray(list) ? list.filter((w): w is string => typeof w === 'string').slice(0, 3) : [])
        setWarnings({ fr: clean(result.warnings_fr), en: clean(result.warnings_en) })
      })
      .catch(() => { if (alive) setWarnings(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [monthItems, mk, apiKeyConfigured, activeCompany])

  if (!apiKeyConfigured || monthItems.length < 3) return null
  if (loading) {
    return (
      <InsightCard kind={c.analysis} title={c.analysing}>
        <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /></span>
      </InsightCard>
    )
  }
  if (!warnings) return null
  const list = warnings[lang]
  return (
    <InsightCard kind={c.analysis} title={list.length ? list[0] : c.analysisOk}
      evidence={[`${c.evidence} (${monthItems.length})`, c.memory]}
      action={list.length && canPlan ? <Button variant="secondary" size="sm" onClick={onPropose}>{c.proposePosts}</Button> : undefined}>
      {list.length > 1
        ? <ul className="m-0 list-disc space-y-1 pl-4">{list.slice(1).map(w => <li key={w}>{w}</li>)}</ul>
        : list.length === 0 ? c.analysisOkText : null}
    </InsightCard>
  )
}

// ─── Planner (AI) ─────────────────────────────────────────────────────────────

function Planner({ open, onClose, c, lang, year, month, monthName, campaigns, zoneLabel, onGenerated, onClear, hasMonthItems, context, segments, keyMessages, companyId, companyChannels, t }: {
  open: boolean; onClose: () => void; c: Copy; lang: 'fr' | 'en'; year: number; month: number; monthName: string
  campaigns: ReturnType<typeof useCampaignOptions>['campaigns']; zoneLabel: ReturnType<typeof useCampaignOptions>['zoneLabel']
  onGenerated: (items: CalendarItem[]) => void; onClear: () => void; hasMonthItems: boolean
  context: () => string; segments: Parameters<typeof buildCampaignContext>[1]['segments']; keyMessages: Parameters<typeof buildCampaignContext>[1]['keyMessages']
  companyId: string; companyChannels: string; t: ReturnType<typeof useI18n>['t']
}) {
  const [campaignId, setCampaignId] = useState('')
  const [goals, setGoals] = useState<string[]>([c.goalOptions[0]])
  const [channels, setChannels] = useState<string[]>(() => {
    const preferred = parseChannels(companyChannels).filter(ch => CHANNEL_MAP[ch])
    return preferred.length ? preferred : ['linkedin']
  })
  const [perWeek, setPerWeek] = useState(3)
  const [theme, setTheme] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const campaign = campaigns.find(cp => cp.id === campaignId)

  const chooseCampaign = (id: string) => {
    setCampaignId(id)
    const next = campaigns.find(cp => cp.id === id)
    const mapped = next?.channels.map(ch => CONTENT_CHANNEL[ch]).filter((v): v is string => Boolean(v)) ?? []
    if (mapped.length) setChannels(mapped)
  }

  const lastDay = new Date(year, month + 1, 0).getDate()
  const from = campaign?.start_date && campaign.start_date > `${monthKey(year, month)}-01` ? Number(campaign.start_date.slice(8, 10)) : 1
  const to = campaign?.end_date && campaign.end_date < `${monthKey(year, month)}-${pad(lastDay)}` ? Number(campaign.end_date.slice(8, 10)) : lastDay
  const total = Math.max(1, Math.round(perWeek * ((to - from + 1) / 7)))
  const networkNames = channels.map(ch => CHANNEL_MAP[ch]?.label ?? ch).join(', ')

  const generate = async () => {
    if (!companyId || !channels.length) { setError(c.needNetwork); return }
    setBusy(true)
    setError('')
    const mk = monthKey(year, month)
    const system = `You are an expert social media strategist. Create editorial calendar ideas.
Return ONLY valid JSON: {"items":[{"date":"YYYY-MM-DD","topic":"string","goal":"string","format":"Post|Carousel|Video|Story","channel":"one of ${channels.join('|')}"}]}
Each item targets exactly ONE network, and its format must suit that network (TikTok and YouTube: Video; Instagram: Carousel, Story or Video; LinkedIn: Post or Carousel; WhatsApp: Story or Post). When a topic deserves several networks, create one item per network, each with the right format, optionally on different days. Use only these network ids.
Brand context:\n${context()}${campaign ? `\n\nEvery idea belongs to the campaign below: serve its objective, target its audience, carry its key message, follow its brief and adapt to its target zone.\n${buildCampaignContext(campaign, { segments, keyMessages, zoneLabel: zoneLabel(campaign) })}` : ''}`
    const user = `Create ${total} post ideas for ${monthName}, between day ${from} and day ${to} of month ${month + 1} of ${year}.
Networks available: ${networkNames}. Goals: ${goals.join(', ')}.
${theme.trim() ? `The theme of the month is "${theme.trim()}"; every topic must align with it.` : ''}
Spread the ideas evenly and vary the formats. Respond in ${lang === 'fr' ? 'French' : 'English'}.`
    try {
      type Result = { items: Array<{ date: string; topic: string; goal: string; format: string; channels?: string[]; channel?: string }> }
      const res = await callModelJSON<Result>(companyId, [{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.8, max_tokens: 3500, requiredKeys: ['items'] })
      // One calendar item per network; an item naming several networks is split.
      const payload = (res.items ?? [])
        .filter(item => typeof item.date === 'string' && item.date.startsWith(mk) && Number(item.date.slice(8, 10)) >= from && Number(item.date.slice(8, 10)) <= to)
        .flatMap(item => {
          const named = Array.isArray(item.channels) ? item.channels.map(ch => String(ch).toLowerCase()) : parseChannels(item.channel)
          const picked = named.filter(ch => channels.includes(ch))
          const format = (['Post', 'Carousel', 'Video', 'Story'].includes(item.format) ? item.format : 'Post') as ContentFormat
          return (picked.length ? picked : [channels[0]]).map(channel => ({
            date: item.date.slice(0, 10),
            topic: String(item.topic ?? '').slice(0, 500),
            goal: String(item.goal ?? '').slice(0, 500),
            format: suggestedFormat(channel, format),
            channel,
            status: 'idea' as const,
          }))
        })
      const created = await Promise.all(payload.map(item => createDataverseCalendarItem(companyId, item)))
      if (campaign) await Promise.all(created.map(item => setContentCampaign('calendar', item.id, campaign.id)))
      onGenerated(created.map(item => ({ ...(item as CalendarItem), campaign_id: campaign?.id ?? null })))
    } catch (err) {
      const key = buildModelError(err)
      setError(key !== 'error.generic' ? t(key as Parameters<typeof t>[0]) : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={c.planTitle} subtitle={<span className="capitalize">{monthName} · {c.planSub}</span>}
      icon={<span className="fc-proposal__icon"><Spark /></span>} closeLabel={c.cancel}
      footer={<>
        {hasMonthItems && <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={onClear} className="text-danger">{c.clearMonth}</Button>}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>{c.cancel}</Button>
        <Button variant="ai" loading={busy} onClick={() => void generate()} disabled={!channels.length}>{busy ? c.generating : c.generate}</Button>
      </>}>
      <SelectField label={c.campaign} value={campaignId} onChange={e => chooseCampaign(e.target.value)}
        hint={campaign ? `${c.campaignHint}${campaign.start_date || campaign.end_date ? ` (${campaign.start_date || '…'} → ${campaign.end_date || '…'})` : ''}.` : undefined}>
        <option value="">{c.noCampaign}</option>
        {campaigns.map(cp => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
      </SelectField>
      <div className="fc-field">
        <span className="fc-label">{c.goals}</span>
        <div className="flex flex-wrap gap-1.5">
          {c.goalOptions.map(g => {
            const on = goals.includes(g)
            return <Chip key={g} pressed={on} onClick={() => setGoals(list => on ? (list.length > 1 ? list.filter(x => x !== g) : list) : [...list, g])}>{g}</Chip>
          })}
        </div>
      </div>
      <div className="fc-field">
        <span className="fc-label">{c.networks}</span>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.slice(0, 7).map(ch => {
            const on = channels.includes(ch.value)
            return <Chip key={ch.value} pressed={on} icon={<ch.icon className="h-3.5 w-3.5" style={{ color: ch.color }} />}
              onClick={() => setChannels(list => on ? list.filter(x => x !== ch.value) : [...list, ch.value])}>{ch.label}</Chip>
          })}
        </div>
      </div>
      <div className="fc-field">
        <span className="fc-label">{c.rhythm}</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" iconOnly icon={<Minus />} onClick={() => setPerWeek(n => Math.max(1, n - 1))} aria-label="−" />
          <span className="min-w-8 text-center text-[18px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{perWeek}</span>
          <Button variant="secondary" size="sm" iconOnly icon={<Plus />} onClick={() => setPerWeek(n => Math.min(14, n + 1))} aria-label="+" />
          <span className="text-sm text-ink-muted">{c.perWeek}</span>
        </div>
      </div>
      <TextField label={c.theme} value={theme} placeholder={c.themePlaceholder} onChange={e => setTheme(e.target.value)} />
      <div className="rounded-[var(--radius-md)] bg-surface-sunken px-3.5 py-3 text-[13px] leading-[19px] text-ink">
        <strong className="block text-sm">{c.about} {total} {c.ideasFor.split(' ')[0]}</strong>
        {c.ideasFor.split(' ').slice(1).join(' ')} {networkNames || '—'}, {lang === 'fr' ? `du ${from} au ${to}` : `from the ${from} to the ${to}`}. {c.added}
      </div>
      {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
    </Sheet>
  )
}

// ─── Detail (edit or new idea) ────────────────────────────────────────────────

function DetailSheet({ draft, onClose, c, lang, campaigns, canEdit, apiReady, onSave, onDelete, onWrite, onAdapt }: {
  draft: Draft | null; onClose: () => void; c: Copy; lang: 'fr' | 'en'
  campaigns: ReturnType<typeof useCampaignOptions>['campaigns']; canEdit: boolean; apiReady: boolean
  onSave: (draft: Draft) => Promise<CalendarItem | null>; onDelete: (id: string) => Promise<void>; onWrite: (item: CalendarItem) => void
  onAdapt: (copy: Draft) => void
}) {
  const [form, setForm] = useState<Draft | null>(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setForm(draft); setError('') }, [draft])
  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => setForm(f => f ? { ...f, [key]: value } : f), [])
  if (!form) return null

  const network = networkOf(form.channel)
  const campaign = campaigns.find(cp => cp.id === form.campaign_id)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await action() } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  const valid = () => {
    if (!form.topic.trim()) { setError(c.needTopic); return false }
    if (!network) { setError(c.needNetwork); return false }
    return true
  }
  const cleaned = { ...form, channel: network, topic: form.topic.trim(), goal: form.goal.trim() }
  const save = () => { if (valid()) void run(async () => { await onSave(cleaned) }) }
  // Writing saves any change first, so the generator gets the current idea and its id.
  const write = () => {
    if (!valid()) return
    const unchanged = draft && form.id && (Object.keys(cleaned) as Array<keyof Draft>).every(k => (cleaned[k] ?? null) === (draft[k] ?? null))
    void run(async () => {
      const item = unchanged ? (cleaned as CalendarItem) : await onSave(cleaned)
      if (item) onWrite(item)
    })
  }

  return (
    <Sheet open onClose={onClose} closeLabel={c.cancel}
      title={form.id ? (form.topic || '—') : c.newIdeaTitle}
      subtitle={[FORMAT_MAP[form.format]?.label[lang], CHANNEL_MAP[network]?.label ?? network, campaign?.name].filter(Boolean).join(' · ')}
      icon={form.id ? <span className="pt-0.5"><DateBlock date={form.date} lang={lang} /></span> : undefined}
      footer={<>
        {form.id && canEdit && (
          <Button variant="ghost" icon={<Trash2 />} className="text-danger" disabled={busy}
            onClick={() => { if (window.confirm(c.confirmDelete)) void run(() => onDelete(form.id!)) }}>{c.delete}</Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>{c.cancel}</Button>
        <Button variant="secondary" disabled={!canEdit || busy} onClick={save}>{c.save}</Button>
        <Button variant="ai" loading={busy} disabled={!canEdit || !apiReady} onClick={write}>{c.write}</Button>
      </>}>
      <div className="fc-field">
        <span className="fc-label">{lang === 'fr' ? 'Statut' : 'Status'}</span>
        <div role="radiogroup" className="grid grid-cols-3 gap-1.5">
          {STATUSES.map(s => (
            <Chip key={s} pressed={form.status === s} onClick={() => set('status', s)} className="justify-center" disabled={!canEdit}>{c.status[s]}</Chip>
          ))}
        </div>
      </div>
      <TextField label={c.topic} value={form.topic} onChange={e => set('topic', e.target.value)} disabled={!canEdit} autoFocus={!form.id} />
      <TextField label={c.goal} value={form.goal} onChange={e => set('goal', e.target.value)} disabled={!canEdit} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label={c.date} type="date" value={form.date} onChange={e => set('date', e.target.value)} disabled={!canEdit} />
        <SelectField label={c.campaign} value={form.campaign_id ?? ''} onChange={e => set('campaign_id', e.target.value || null)} disabled={!canEdit}>
          <option value="">{c.noCampaign}</option>
          {campaigns.map(cp => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
        </SelectField>
      </div>
      <div className="fc-field">
        <span className="fc-label">{c.format}</span>
        <div className="grid grid-cols-4 gap-1.5">
          {FORMATS.map(f => (
            <Chip key={f.value} pressed={form.format === f.value} icon={<f.icon className="h-3.5 w-3.5" />} onClick={() => set('format', f.value)}
              className="justify-center" disabled={!canEdit}>{f.label[lang]}</Chip>
          ))}
        </div>
      </div>
      <div className="fc-field">
        <span className="fc-label">{c.network}</span>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          {CHANNELS.slice(0, 7).map(ch => (
            <Chip key={ch.value} pressed={network === ch.value} icon={<ch.icon className="h-3.5 w-3.5" style={{ color: ch.color }} />} disabled={!canEdit}
              onClick={() => set('channel', ch.value)}>{ch.label}</Chip>
          ))}
        </div>
        <span className="fc-hint">{c.networksHint}</span>
      </div>
      {form.id && canEdit && (
        <div className="fc-field">
          <span className="fc-label">{c.adapt}</span>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.slice(0, 7).filter(ch => ch.value !== network).map(ch => (
              <Chip key={ch.value} icon={<ch.icon className="h-3.5 w-3.5" style={{ color: ch.color }} />}
                onClick={() => onAdapt({
                  date: form.date, topic: form.topic, goal: form.goal, campaign_id: form.campaign_id, status: 'idea',
                  channel: ch.value, format: suggestedFormat(ch.value, form.format),
                })}>{ch.label}</Chip>
            ))}
          </div>
          <span className="fc-hint">{c.adaptHint}</span>
        </div>
      )}
      {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
    </Sheet>
  )
}
