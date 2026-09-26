import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, Unlink, X } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBuffer } from '@/contexts/BufferContext'
import {
  CAMPAIGN_CHANNELS, CAMPAIGN_OBJECTIVES, CAMPAIGN_STATUSES,
  createCampaign, createCampaignInsight, deleteCampaign, listCampaignContent, listCampaignInsights,
  listCampaignMetrics, listCampaigns, setContentCampaign, syncCampaignBufferResults, totalMetrics,
  updateCampaign, upsertCampaignMetric,
  type Campaign, type CampaignChannel, type CampaignContentItem, type CampaignInput, type CampaignInsight,
  type CampaignMetric, type CampaignStatus, type MetricTotals,
} from '@/lib/campaigns'
import { CONTENT_CHANNEL } from '@/lib/campaignContext'
import { CHANNEL_MAP } from '@/lib/channels'
import { listDataverseCalendarItems, listDataverseLibraryItems } from '@/lib/dataverse'
import { callModel, callModelJSON, buildModelError } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'
import { createPlace, createZone, deleteZone, describeZone, listPlaces, listZones, updateZone, type Place, type Zone, type ZoneInput } from '@/lib/geo'
import { Badge, Button, Card, CardBody, CardHeader, Chip, SelectField, Sheet, Spark, TextField, type Tone } from '@/components/ui'
import { cn } from '@/lib/utils'

// ─── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  fr: {
    title: 'Campagnes', newCampaign: 'Nouvelle campagne', zones: 'Zones',
    all: 'Toutes', empty: 'Aucune campagne pour le moment.', emptyHint: 'Une campagne regroupe vos posts autour d’un objectif, d’une audience et d’une période.',
    noMatch: 'Aucune campagne avec ce statut.',
    name: 'Nom', objective: 'Objectif', status: 'Statut', campaign: 'Campagne', period: 'Période', channels: 'Réseaux',
    audience: 'Audience cible', keyMessage: 'Message clé', none: 'Aucun', zone: 'Zone cible',
    targetLeads: 'Objectif de prospects', targetReach: 'Objectif de portée', trackingCode: 'Code de suivi des liens',
    start: 'Début', end: 'Fin', save: 'Enregistrer', saving: 'Enregistrement…', cancel: 'Annuler', edit: 'Modifier',
    delete: 'Supprimer', deleteCampaign: 'Supprimer la campagne', confirmDelete: 'Supprimer cette campagne, ses résultats et ses analyses ?', back: 'Campagnes',
    brief: 'Brief', generateBrief: 'Générer le brief', regenerate: 'Régénérer', generating: 'Génération…', briefEmpty: 'Pas encore de brief. L’IA peut en écrire un à partir de la campagne et de votre mémoire d’entreprise.',
    results: 'Résultats par jour', refresh: 'Actualiser', addResults: 'Saisir',
    reach: 'Portée', impressions: 'Impressions', engagements: 'Engagements', clicks: 'Clics', leads: 'Prospects',
    engShort: 'Engag.', leadsShort: 'Prosp.',
    noResults: 'Pas encore de résultats. Ils arrivent quand les posts de la campagne sont publiés depuis le Studio, ou vous pouvez les saisir.',
    date: 'Date', network: 'Réseau', of: 'de', noTarget: 'pas d’objectif', target: 'objectif',
    content: 'Contenus liés', linkContent: 'Lier un contenu', noContent: 'Aucun contenu lié. Choisissez la campagne dans le calendrier ou le générateur.', unlink: 'Délier',
    calendarItem: 'Calendrier', libraryItem: 'Bibliothèque',
    analysis: 'Analyse', analyze: 'Analyser', analyzing: 'Analyse…', noAnalysis: 'Pas encore d’analyse. L’IA juge la campagne uniquement sur ses résultats et le dit quand les données manquent.',
    analysedOn: 'Analyse du', rows: 'lignes de résultats', older: (n: number) => `Analyses précédentes (${n})`, thisWeek: 'Cette semaine',
    writePost: 'Rédiger un post', day: (d: number, t: number) => `jour ${d} sur ${t}`, startsIn: (n: number) => `commence dans ${n} jour${n > 1 ? 's' : ''}`, ended: 'terminée',
    notStarted: 'pas encore commencée',
    zoneHint: 'Oriente le contenu et les tactiques locales ; les posts organiques restent visibles partout.',
    newZoneShort: 'Nouvelle zone', editZone: 'Modifier la zone', deleteZone: 'Supprimer la zone', zoneReuse: 'Une zone enregistrée peut servir à plusieurs campagnes.', sources: { manual: 'Saisie manuelle', network: 'Réseaux' },
    newZone: 'Nouvelle zone', noZones: 'Aucune zone. Créez-en une pour cibler une région, une ville ou des quartiers.',
    zoneName: 'Nom de la zone', description: 'Description', places: 'Lieux', searchPlaces: 'Rechercher un lieu…', selected: 'sélectionné(s)',
    center: 'Centre du rayon', radius: 'Rayon (km)', noRadius: 'Pas de rayon', addQuarter: 'Ajouter un quartier', quarterName: 'Nom du quartier', add: 'Ajouter',
    confirmDeleteZone: "Supprimer cette zone ? Les campagnes qui la ciblent n'auront plus de zone.",
    synced: 'posts suivis, dont', withData: 'avec des résultats des réseaux', nextSteps: 'Prochaines étapes',
    notConnected: 'Les réseaux sociaux ne sont pas encore connectés. Contactez votre gestionnaire FlowCom.',
    objectives: { awareness: 'Notoriété', engagement: 'Engagement', leads: 'Prospects', sales: 'Ventes', retention: 'Fidélisation' },
    statuses: { draft: 'Brouillon', planned: 'Planifiée', active: 'Active', paused: 'En pause', completed: 'Terminée', cancelled: 'Annulée' },
    statusPlural: { draft: 'brouillons', planned: 'planifiées', active: 'actives', paused: 'en pause', completed: 'terminées', cancelled: 'annulées' },
    itemStatus: { idea: 'Idée', scheduled: 'Programmé', published: 'Publié', Draft: 'Brouillon', Validated: 'Validé', Published: 'Publié', Archived: 'Archivé' } as Record<string, string>,
  },
  en: {
    title: 'Campaigns', newCampaign: 'New campaign', zones: 'Zones',
    all: 'All', empty: 'No campaigns yet.', emptyHint: 'A campaign groups your posts around a goal, an audience and a period.',
    noMatch: 'No campaign with this status.',
    name: 'Name', objective: 'Objective', status: 'Status', campaign: 'Campaign', period: 'Period', channels: 'Networks',
    audience: 'Target audience', keyMessage: 'Key message', none: 'None', zone: 'Target zone',
    targetLeads: 'Leads target', targetReach: 'Reach target', trackingCode: 'Link tracking code',
    start: 'Start', end: 'End', save: 'Save', saving: 'Saving…', cancel: 'Cancel', edit: 'Edit',
    delete: 'Delete', deleteCampaign: 'Delete the campaign', confirmDelete: 'Delete this campaign with its results and analyses?', back: 'Campaigns',
    brief: 'Brief', generateBrief: 'Generate the brief', regenerate: 'Regenerate', generating: 'Generating…', briefEmpty: 'No brief yet. The AI can write one from the campaign and your company memory.',
    results: 'Results by day', refresh: 'Refresh', addResults: 'Enter',
    reach: 'Reach', impressions: 'Impressions', engagements: 'Engagements', clicks: 'Clicks', leads: 'Leads',
    engShort: 'Eng.', leadsShort: 'Leads',
    noResults: 'No results yet. They arrive once the campaign’s posts are published from the Studio, or you can enter them.',
    date: 'Date', network: 'Network', of: 'of', noTarget: 'no target', target: 'target',
    content: 'Linked content', linkContent: 'Link content', noContent: 'No linked content. Pick the campaign in the calendar or the generator.', unlink: 'Unlink',
    calendarItem: 'Calendar', libraryItem: 'Library',
    analysis: 'Analysis', analyze: 'Analyse', analyzing: 'Analysing…', noAnalysis: 'No analysis yet. The AI judges the campaign only on its results and says so when data is missing.',
    analysedOn: 'Analysis of', rows: 'result rows', older: (n: number) => `Earlier analyses (${n})`, thisWeek: 'This week',
    writePost: 'Write a post', day: (d: number, t: number) => `day ${d} of ${t}`, startsIn: (n: number) => `starts in ${n} day${n > 1 ? 's' : ''}`, ended: 'ended',
    notStarted: 'not started yet',
    zoneHint: 'Guides content and local tactics; organic posts stay visible everywhere.',
    newZoneShort: 'New zone', editZone: 'Edit the zone', deleteZone: 'Delete the zone', zoneReuse: 'A saved zone can be used by several campaigns.', sources: { manual: 'Entered by hand', network: 'Networks' },
    newZone: 'New zone', noZones: 'No zones yet. Create one to target a region, a city or neighbourhoods.',
    zoneName: 'Zone name', description: 'Description', places: 'Places', searchPlaces: 'Search places…', selected: 'selected',
    center: 'Radius centre', radius: 'Radius (km)', noRadius: 'No radius', addQuarter: 'Add a neighbourhood', quarterName: 'Neighbourhood name', add: 'Add',
    confirmDeleteZone: 'Delete this zone? Campaigns targeting it will no longer have a zone.',
    synced: 'posts tracked,', withData: 'with network results', nextSteps: 'Next steps',
    notConnected: 'Social networks are not connected yet. Contact your FlowCom manager.',
    objectives: { awareness: 'Awareness', engagement: 'Engagement', leads: 'Leads', sales: 'Sales', retention: 'Retention' },
    statuses: { draft: 'Draft', planned: 'Planned', active: 'Active', paused: 'Paused', completed: 'Completed', cancelled: 'Cancelled' },
    statusPlural: { draft: 'drafts', planned: 'planned', active: 'active', paused: 'paused', completed: 'completed', cancelled: 'cancelled' },
    itemStatus: { idea: 'Idea', scheduled: 'Scheduled', published: 'Published', Draft: 'Draft', Validated: 'Validated', Published: 'Published', Archived: 'Archived' } as Record<string, string>,
  },
}
type Copy = typeof COPY.fr

const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', x: 'X', whatsapp: 'WhatsApp', google: 'Google',
}
const STATUS_TONE: Record<CampaignStatus, Tone> = { draft: 'neutral', planned: 'info', active: 'success', paused: 'warning', completed: 'neutral', cancelled: 'danger' }
// Active campaigns first, then what is coming, then the rest.
const STATUS_ORDER: Record<CampaignStatus, number> = { active: 0, paused: 1, planned: 2, draft: 3, completed: 4, cancelled: 5 }

// Shared by the zone editor below.
const inputClass = 'fc-input'
const labelClass = 'fc-label mb-1 block'
const btnPrimary = 'fc-btn fc-btn--primary fc-btn--sm'
const btnSecondary = 'fc-btn fc-btn--secondary fc-btn--sm'

const today = () => new Date().toISOString().slice(0, 10)
const slug = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

function ChannelMark({ channel, className = 'h-3 w-3' }: { channel: string; className?: string }) {
  const def = CHANNEL_MAP[CONTENT_CHANNEL[channel as CampaignChannel] ?? channel]
  return def ? <def.icon className={className} style={{ color: def.color }} title={def.label} /> : null
}

function useFormat(lang: 'fr' | 'en') {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB'
  return useMemo(() => ({
    n: (value: number) => new Intl.NumberFormat(locale).format(value),
    d: (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '…'),
  }), [locale])
}

// Where a campaign stands in time.
function timeline(campaign: Campaign) {
  if (!campaign.start_date || !campaign.end_date) return null
  const start = Date.parse(campaign.start_date)
  const end = Date.parse(campaign.end_date)
  const total = Math.max(1, Math.round((end - start) / 86400000) + 1)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const day = Math.round((now.getTime() - start) / 86400000) + 1
  return { total, day: Math.min(total, Math.max(0, day)), before: day < 1 ? 1 - day : 0, after: day > total }
}

function Meter({ value, target, tone = 'brand' }: { value: number; target: number; tone?: 'brand' | 'muted' }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return (
    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone === 'brand' ? 'var(--brand)' : 'var(--ink-subtle)' }} />
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const { lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeCompany } = useCompany()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [totals, setTotals] = useState<Record<string, MetricTotals>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all')
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null)
  const [places, setPlaces] = useState<Place[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const canEdit = Boolean(activeCompany && ['owner', 'admin', 'editor'].includes(activeCompany.role ?? ''))

  const reload = useCallback(async () => {
    if (!activeCompany) return
    setLoading(true)
    setError('')
    try {
      const [list, placeList, zoneList] = await Promise.all([listCampaigns(activeCompany.id), listPlaces(activeCompany.id), listZones(activeCompany.id)])
      setCampaigns(list)
      setPlaces(placeList)
      setZones(zoneList)
      // Figures for the list, per campaign; a failure only leaves a dash.
      const pairs = await Promise.all(list.map(cp => listCampaignMetrics(cp.id).then(m => [cp.id, totalMetrics(m)] as const).catch(() => null)))
      setTotals(Object.fromEntries(pairs.filter((p): p is readonly [string, MetricTotals] => Boolean(p))))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [activeCompany])

  useEffect(() => { void reload() }, [reload])

  const selected = id ? campaigns.find(item => item.id === id) : undefined
  const zoneOf = (campaign: Campaign) => zones.find(z => z.id === campaign.zone_id)
  const sorted = useMemo(() => [...campaigns].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.start_date || '').localeCompare(a.start_date || '')), [campaigns])
  const visible = filter === 'all' ? sorted : sorted.filter(item => item.status === filter)
  const counts = useMemo(() => Object.fromEntries(CAMPAIGN_STATUSES.map(s => [s, campaigns.filter(cp => cp.status === s).length])) as Record<CampaignStatus, number>, [campaigns])
  const summary = (['active', 'planned', 'completed'] as CampaignStatus[]).filter(s => counts[s]).map(s => `${counts[s]} ${c.statusPlural[s]}`).join(' · ')

  const onSaved = (saved: Campaign) => {
    setEditing(null)
    setCampaigns(prev => (prev.some(p => p.id === saved.id) ? prev.map(p => (p.id === saved.id ? saved : p)) : [saved, ...prev]))
    if (!id) navigate(`/campaigns/${saved.id}`)
  }

  if (!activeCompany) return <div className="p-6 text-sm text-ink-muted">{c.empty}</div>

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-3.5 px-4 py-5 sm:px-6">
        {selected ? (
          <CampaignDetail
            campaign={selected} c={c} lang={L} canEdit={canEdit}
            zoneLabel={(() => { const z = zoneOf(selected); return z ? `${z.name} : ${describeZone(z, places)}` : '' })()}
            onEdit={() => setEditing(selected)}
            onChange={updated => setCampaigns(prev => prev.map(p => (p.id === updated.id ? updated : p)))}
            onDeleted={() => { setCampaigns(prev => prev.filter(p => p.id !== selected.id)); navigate('/campaigns') }}
          />
        ) : id && loading ? (
          <Card className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ink-muted" /></Card>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
                {summary && <p className="m-0 mt-0.5 text-sm text-ink-muted">{summary}</p>}
              </div>
              <Button variant="primary" size="sm" icon={<Plus />} disabled={!canEdit} onClick={() => setEditing('new')}>{c.newCampaign}</Button>
            </div>

              <>
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                  <Chip pressed={filter === 'all'} className="shrink-0" onClick={() => setFilter('all')}>{c.all}</Chip>
                  {CAMPAIGN_STATUSES.filter(s => counts[s]).map(s => (
                    <Chip key={s} pressed={filter === s} className="shrink-0" onClick={() => setFilter(s)}>{c.statuses[s]} <span className="text-ink-muted">{counts[s]}</span></Chip>
                  ))}
                </div>

                {error && <p className="m-0 rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

                {loading && !campaigns.length ? (
                  <Card className="grid h-48 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ink-muted" /></Card>
                ) : !campaigns.length ? (
                  <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                    <p className="m-0 text-[15px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{c.empty}</p>
                    <p className="m-0 max-w-sm text-sm text-ink-muted">{c.emptyHint}</p>
                    {canEdit && <Button variant="primary" size="sm" icon={<Plus />} className="mt-2" onClick={() => setEditing('new')}>{c.newCampaign}</Button>}
                  </Card>
                ) : !visible.length ? (
                  <Card className="px-6 py-10 text-center text-sm text-ink-muted">{c.noMatch}</Card>
                ) : (
                  <CampaignList campaigns={visible} totals={totals} zoneName={cp => zoneOf(cp)?.name ?? ''} c={c} lang={L} />
                )}
              </>
          </>
        )}
      </div>

      {editing && (
        <CampaignEditor c={c} zones={zones} places={places} campaign={editing === 'new' ? null : editing}
          onZonesChange={setZones} onPlacesChange={setPlaces}
          onClose={() => setEditing(null)} onSaved={onSaved} />
      )}
    </div>
  )
}

// ─── List ─────────────────────────────────────────────────────────────────────

function CampaignList({ campaigns, totals, zoneName, c, lang }: {
  campaigns: Campaign[]; totals: Record<string, MetricTotals>; zoneName: (cp: Campaign) => string; c: Copy; lang: 'fr' | 'en'
}) {
  const f = useFormat(lang)
  const figure = (value: number | undefined, target: number | null, started: boolean) => {
    if (!started) return { main: '—', sub: target ? `${c.target} ${f.n(target)}` : c.notStarted }
    const v = value ?? 0
    return {
      main: value === undefined ? '—' : f.n(v),
      sub: target ? `${Math.round((v / target) * 100)} % ${c.of} ${f.n(target)}` : c.noTarget,
      pct: target ? { value: v, target } : null,
    }
  }
  const cols = 'sm:grid-cols-[minmax(0,1.6fr)_190px_140px_140px_100px]'
  return (
    <Card className="overflow-hidden">
      <div className={cn('hidden gap-4 border-b border-line bg-surface-sunken px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted sm:grid', cols)}>
        <span>{c.campaign}</span><span>{c.period}</span><span>{c.reach}</span><span>{c.leads}</span><span>{c.status}</span>
      </div>
      {campaigns.map(cp => {
        const t = timeline(cp)
        const started = !t || t.before === 0
        const reach = figure(totals[cp.id]?.reach, cp.target_reach, started)
        const leads = figure(totals[cp.id]?.leads, cp.target_leads, started)
        const zone = zoneName(cp)
        const when = !t ? '' : t.before ? c.startsIn(t.before) : t.after ? c.ended : c.day(t.day, t.total)
        return (
          <Link key={cp.id} to={`/campaigns/${cp.id}`}
            className={cn('grid grid-cols-1 gap-2 border-b border-line px-3.5 py-3 text-ink last:border-b-0 hover:bg-surface-sunken sm:items-center sm:gap-4', cols)}>
            <span className="min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{cp.name}</span>
                <Badge tone={STATUS_TONE[cp.status]} className="sm:hidden">{c.statuses[cp.status]}</Badge>
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-muted">
                {c.objectives[cp.objective]}
                {cp.channels.length > 0 && <span className="h-2.5 w-px bg-line-strong" aria-hidden="true" />}
                {cp.channels.map(ch => <ChannelMark key={ch} channel={ch} />)}
                {zone && <span>· {zone}</span>}
              </span>
            </span>
            <span className="text-[12px] text-ink-muted">
              <span className="block text-ink">{f.d(cp.start_date)} → {f.d(cp.end_date)}</span>
              {t && <Meter value={t.day} target={t.total} tone={cp.status === 'completed' || t.after ? 'muted' : 'brand'} />}
              {when && <span className="mt-0.5 block">{when}</span>}
            </span>
            {[reach, leads].map((x, i) => (
              <span key={i} className="hidden text-[12px] text-ink-muted sm:block">
                <span className="block text-sm font-bold text-ink tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{x.main}</span>
                {x.sub}
              </span>
            ))}
            <span className="flex gap-3 text-[12px] text-ink-muted sm:hidden">
              <span>{c.reach} <strong className="text-ink">{reach.main}</strong></span>
              <span>{c.leads} <strong className="text-ink">{leads.main}</strong></span>
            </span>
            <span className="hidden sm:block"><Badge tone={STATUS_TONE[cp.status]}>{c.statuses[cp.status]}</Badge></span>
          </Link>
        )
      })}
    </Card>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function CampaignEditor({ c, campaign, zones, places, onZonesChange, onPlacesChange, onClose, onSaved }: {
  c: Copy
  campaign: Campaign | null
  zones: Zone[]
  places: Place[]
  onZonesChange: (zones: Zone[]) => void
  onPlacesChange: (places: Place[]) => void
  onClose: () => void
  onSaved: (campaign: Campaign) => void
}) {
  const { activeCompany, segments, keyMessages } = useCompany()
  const [form, setForm] = useState<CampaignInput>(() => campaign ?? {
    name: '', objective: 'awareness', status: 'draft', start_date: today(), end_date: '', channels: [],
    segment_id: null, key_message_id: null, zone_id: null, target_leads: null, target_reach: null, tracking_code: '', brief: '', summary: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [zoneEditing, setZoneEditing] = useState<Zone | 'new' | null>(null)
  const currentZone = zones.find(z => z.id === form.zone_id)
  const set = <K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) => setForm(prev => ({ ...prev, [key]: value }))
  const toNumber = (value: string) => (value.trim() === '' ? null : Math.max(0, Math.round(Number(value)) || 0))

  const submit = async () => {
    if (!activeCompany || !form.name.trim()) return
    setSaving(true)
    setError('')
    const input = { ...form, name: form.name.trim(), tracking_code: form.tracking_code.trim() || slug(form.name) }
    try {
      if (campaign) {
        await updateCampaign(campaign.id, input)
        onSaved({ ...campaign, ...input })
      } else {
        onSaved(await createCampaign(activeCompany.id, activeCompany.currency, input))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} closeLabel={c.cancel} title={campaign ? `${c.edit} · ${campaign.name}` : c.newCampaign}
      footer={<>
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>{c.cancel}</Button>
        <Button variant="primary" loading={saving} disabled={!form.name.trim()} onClick={() => void submit()}>{c.save}</Button>
      </>}>
      <TextField label={c.name} value={form.name} autoFocus onChange={e => set('name', e.target.value)} />
      <div className="fc-field">
        <span className="fc-label">{c.objective}</span>
        <div role="radiogroup" aria-label={c.objective} className="flex flex-wrap gap-1.5">
          {CAMPAIGN_OBJECTIVES.map(o => <Chip key={o} pressed={form.objective === o} onClick={() => set('objective', o)}>{c.objectives[o]}</Chip>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <TextField label={c.start} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        <TextField label={c.end} type="date" value={form.end_date} min={form.start_date} onChange={e => set('end_date', e.target.value)} />
      </div>
      <SelectField label={c.status} value={form.status} onChange={e => set('status', e.target.value as CampaignStatus)}>
        {CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{c.statuses[s]}</option>)}
      </SelectField>
      <div className="fc-field">
        <span className="fc-label">{c.channels}</span>
        <div className="flex flex-wrap gap-1.5">
          {CAMPAIGN_CHANNELS.map(ch => {
            const on = form.channels.includes(ch)
            return <Chip key={ch} pressed={on} icon={<ChannelMark channel={ch} className="h-3.5 w-3.5" />}
              onClick={() => set('channels', on ? form.channels.filter(x => x !== ch) : [...form.channels, ch])}>{CHANNEL_LABELS[ch]}</Chip>
          })}
        </div>
      </div>
      <SelectField label={c.audience} value={form.segment_id ?? ''} onChange={e => set('segment_id', e.target.value || null)}>
        <option value="">{c.none}</option>
        {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>
      <SelectField label={c.keyMessage} value={form.key_message_id ?? ''} onChange={e => set('key_message_id', e.target.value || null)}>
        <option value="">{c.none}</option>
        {keyMessages.map(k => <option key={k.id} value={k.id}>{k.content.slice(0, 80)}</option>)}
      </SelectField>
      <div className="fc-field">
        <span className="fc-label">{c.zone}</span>
        <div className="flex gap-1.5">
          <select className="fc-input min-w-0 flex-1" aria-label={c.zone} value={form.zone_id ?? ''} onChange={e => set('zone_id', e.target.value || null)}>
            <option value="">{c.none}</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          {currentZone && <Button variant="secondary" size="sm" iconOnly icon={<Pencil />} aria-label={c.editZone} onClick={() => setZoneEditing(currentZone)} className="h-[var(--control-md)] w-[var(--control-md)]" />}
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setZoneEditing('new')} className="h-[var(--control-md)]">{c.newZoneShort}</Button>
        </div>
        <span className="fc-hint">{currentZone ? `${describeZone(currentZone, places)}. ${c.zoneHint}` : c.zoneReuse}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <TextField label={c.targetReach} type="number" min={0} value={form.target_reach ?? ''} onChange={e => set('target_reach', toNumber(e.target.value))} />
        <TextField label={c.targetLeads} type="number" min={0} value={form.target_leads ?? ''} onChange={e => set('target_leads', toNumber(e.target.value))} />
      </div>
      <TextField label={c.trackingCode} value={form.tracking_code} placeholder={slug(form.name)} onChange={e => set('tracking_code', e.target.value)} style={{ fontFamily: 'var(--font-mono, monospace)' }} />
      {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
      {zoneEditing && (
        <ZoneEditor c={c} zone={zoneEditing === 'new' ? null : zoneEditing} places={places}
          onPlaceAdded={place => onPlacesChange([...places, place])}
          onClose={() => setZoneEditing(null)}
          onSaved={saved => {
            setZoneEditing(null)
            onZonesChange(zones.some(z => z.id === saved.id) ? zones.map(z => (z.id === saved.id ? saved : z)) : [...zones, saved])
            set('zone_id', saved.id)
          }}
          onDeleted={id => {
            setZoneEditing(null)
            onZonesChange(zones.filter(z => z.id !== id))
            if (form.zone_id === id) set('zone_id', null)
          }} />
      )}
    </Sheet>
  )
}

// ─── Detail ───────────────────────────────────────────────────────────────────

interface Analysis {
  title: string
  onTrack: boolean
  assessment: string
  findings: string[]
  nextSteps: string[]
}

function CampaignDetail({ campaign, c, lang, canEdit, zoneLabel, onEdit, onChange, onDeleted }: {
  campaign: Campaign
  c: Copy
  lang: 'fr' | 'en'
  canEdit: boolean
  zoneLabel: string
  onEdit: () => void
  onChange: (campaign: Campaign) => void
  onDeleted: () => void
}) {
  const { t } = useI18n()
  const f = useFormat(lang)
  const navigate = useNavigate()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const buffer = useBuffer()

  const [metrics, setMetrics] = useState<CampaignMetric[]>([])
  const [content, setContent] = useState<CampaignContentItem[]>([])
  const [insights, setInsights] = useState<CampaignInsight[]>([])
  const [candidates, setCandidates] = useState<CampaignContentItem[]>([])
  const [brief, setBrief] = useState(campaign.brief)
  const [editingBrief, setEditingBrief] = useState(false)
  const [busy, setBusy] = useState<'' | 'brief' | 'saveBrief' | 'sync' | 'analyze' | 'delete' | 'status'>('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [showEntry, setShowEntry] = useState(false)
  const [showOlder, setShowOlder] = useState(false)

  const load = useCallback(async () => {
    if (!activeCompany) return
    try {
      const [m, linked, ins, calendar, library] = await Promise.all([
        listCampaignMetrics(campaign.id),
        listCampaignContent(campaign.id),
        listCampaignInsights(campaign.id),
        listDataverseCalendarItems(activeCompany.id),
        listDataverseLibraryItems(activeCompany.id),
      ])
      setMetrics(m)
      setContent(linked)
      setInsights(ins)
      const linkedIds = new Set(linked.map(item => item.id))
      setCandidates([
        ...calendar.filter(item => !linkedIds.has(item.id)).map(item => ({ id: item.id, kind: 'calendar' as const, title: item.topic, date: item.date, channel: item.channel, status: item.status })),
        ...library.filter(item => !linkedIds.has(item.id)).map(item => ({ id: item.id, kind: 'library' as const, title: item.title, date: item.publish_date ?? '', channel: item.channel, status: item.status })),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [activeCompany, campaign.id])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setBrief(campaign.brief) }, [campaign.brief])

  const totals = useMemo(() => totalMetrics(metrics), [metrics])
  const segment = segments.find(s => s.id === campaign.segment_id)
  const keyMessage = keyMessages.find(k => k.id === campaign.key_message_id)
  const progress = timeline(campaign)

  const run = async (kind: typeof busy, action: () => Promise<void>) => {
    setBusy(kind)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (err) {
      const key = buildModelError(err)
      setError(key !== 'error.generic' && (kind === 'brief' || kind === 'analyze') ? t(key as Parameters<typeof t>[0]) : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const campaignFacts = () => [
    `Campaign: ${campaign.name}`,
    `Objective: ${campaign.objective}`,
    `Period: ${campaign.start_date || 'not set'} to ${campaign.end_date || 'not set'}`,
    `Channels: ${campaign.channels.map(ch => CHANNEL_LABELS[ch]).join(', ') || 'not set'}`,
    `Target audience: ${segment ? `${segment.name} (pain points: ${segment.pain_points}; interests: ${segment.interests})` : 'not set'}`,
    `Key message: ${keyMessage?.content ?? 'not set'}`,
    `Target zone: ${zoneLabel || 'not set (no geographic restriction)'}`,
    `Targets: reach ${campaign.target_reach ?? 'not set'}, leads ${campaign.target_leads ?? 'not set'}`,
    'Type: organic (no paid advertising)',
  ].join('\n')

  const generateBrief = () => run('brief', async () => {
    const context = buildAiContext({ company: activeCompany, products, segments, keyMessages })
    const text = await callModel(activeCompany?.id ?? '', [
      { role: 'system', content: `You are a senior marketing strategist. Write a concise, actionable organic campaign brief. Tailor every recommendation to the target zone when one is given (local references, neighbourhoods, languages spoken there). Use short sections, each starting with a plain-text heading alone on its line: Objective, Audience insight, Core message, Content pillars (3), Channel plan (per channel: formats and weekly frequency), Local reach tactics (only when a target zone is given: location tags, local groups and communities, local hashtags and neighbourhood names, since organic posts cannot be geo-restricted), KPIs to track. Maximum 400 words. No markdown symbols such as # or *. Respond in ${lang === 'fr' ? 'French' : 'English'}.\n\nCompany context:\n${context}` },
      { role: 'user', content: campaignFacts() },
    ], { temperature: 0.6, max_tokens: 1200 })
    const next = text.trim()
    setBrief(next)
    // A generated brief is saved straight away; editing stays possible.
    await updateCampaign(campaign.id, { brief: next })
    onChange({ ...campaign, brief: next })
  })

  const saveBrief = () => run('saveBrief', async () => {
    await updateCampaign(campaign.id, { brief })
    onChange({ ...campaign, brief })
    setEditingBrief(false)
  })

  const syncResults = () => run('sync', async () => {
    if (!activeCompany || !buffer.orgId) throw new Error(c.notConnected)
    const result = await syncCampaignBufferResults(activeCompany.id, campaign.id, buffer.orgId, buffer.channels)
    setMetrics(await listCampaignMetrics(campaign.id))
    setNotice(`${result.tracked} ${c.synced} ${result.matched} ${c.withData}.`)
  })

  const analyze = () => run('analyze', async () => {
    if (!activeCompany) return
    const byChannel = campaign.channels.map(ch => ({ channel: ch, ...totalMetrics(metrics.filter(m => m.channel === ch)) }))
    const evidence = {
      asOf: today(),
      period: { start: campaign.start_date, end: campaign.end_date, dayOfCampaign: progress?.day ?? null, totalDays: progress?.total ?? null },
      targets: { reach: campaign.target_reach, leads: campaign.target_leads },
      totals,
      byChannel,
      metricRows: metrics.length,
      linkedContent: { total: content.length, published: content.filter(i => /publi/i.test(i.status)).length },
      sources: [...new Set(metrics.map(m => m.source))],
    }
    const context = buildAiContext({ company: activeCompany, products, segments, keyMessages })
    const result = await callModelJSON<Analysis>(activeCompany.id, [
      { role: 'system', content: `You are a marketing performance analyst. Assess an organic campaign using ONLY the data provided. If data is missing or too thin to judge, say so explicitly instead of guessing. Return JSON: {"title": short headline (max 8 words), "onTrack": boolean, "assessment": 2-3 sentences citing the numbers, "findings": up to 4 strings, "nextSteps": up to 4 concrete actions for the coming week}. Respond in ${lang === 'fr' ? 'French' : 'English'}.\n\nCompany context:\n${context}` },
      { role: 'user', content: `${campaignFacts()}\n\nData:\n${JSON.stringify(evidence)}` },
    ], { temperature: 0.3, max_tokens: 1200, requiredKeys: ['title', 'assessment', 'nextSteps'] })
    const findings = Array.isArray(result.findings) ? result.findings : []
    const nextSteps = Array.isArray(result.nextSteps) ? result.nextSteps : []
    const body = [
      result.assessment,
      findings.length ? findings.map(x => `• ${x}`).join('\n') : '',
      nextSteps.length ? `${c.nextSteps}:\n${nextSteps.map(s => `→ ${s}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n')
    const saved = await createCampaignInsight(activeCompany.id, campaign.id, { title: result.title, body, evidence: { ...evidence, onTrack: Boolean(result.onTrack) } })
    setInsights(prev => [saved, ...prev])
  })

  const changeStatus = (status: CampaignStatus) => run('status', async () => {
    await updateCampaign(campaign.id, { status })
    onChange({ ...campaign, status })
  })

  const remove = () => {
    if (!window.confirm(c.confirmDelete)) return
    void run('delete', async () => {
      await deleteCampaign(campaign.id)
      onDeleted()
    })
  }

  const link = (value: string) => {
    const item = candidates.find(i => `${i.kind}:${i.id}` === value)
    if (!item) return
    void run('saveBrief', async () => {
      await setContentCampaign(item.kind, item.id, campaign.id)
      setContent(prev => [...prev, item])
      setCandidates(prev => prev.filter(i => i !== item))
    })
  }

  const unlink = (item: CampaignContentItem) => run('saveBrief', async () => {
    await setContentCampaign(item.kind, item.id, null)
    setContent(prev => prev.filter(i => i !== item))
    setCandidates(prev => [...prev, item])
  })

  const writePost = () => {
    const first = campaign.channels.map(ch => CONTENT_CHANNEL[ch]).find(Boolean) ?? 'linkedin'
    navigate(`/content?${new URLSearchParams({ channel: first, campaign: campaign.id }).toString()}`)
  }

  const kpis: Array<{ label: string; value: number; target: number | null }> = [
    { label: c.reach, value: totals.reach, target: campaign.target_reach },
    { label: c.impressions, value: totals.impressions, target: null },
    { label: c.engagements, value: totals.engagements, target: null },
    { label: c.clicks, value: totals.clicks, target: null },
    { label: c.leads, value: totals.leads, target: campaign.target_leads },
  ]
  const when = !progress ? '' : progress.before ? c.startsIn(progress.before) : progress.after ? c.ended : c.day(progress.day, progress.total)
  const [latest, ...older] = insights

  return (
    <>
      <Link to="/campaigns" className="inline-flex items-center gap-1 self-start text-[13px] text-ink-muted hover:text-ink"><ChevronLeft className="h-3.5 w-3.5" />{c.back}</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{campaign.name}</h1>
            <select aria-label={c.status} value={campaign.status} disabled={!canEdit || busy === 'status'} onChange={e => changeStatus(e.target.value as CampaignStatus)}
              className={cn('fc-badge cursor-pointer border-0 pr-5', `fc-badge--${STATUS_TONE[campaign.status] === 'neutral' ? '' : STATUS_TONE[campaign.status]}`)}
              style={{ appearance: 'auto' }}>
              {CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{c.statuses[s]}</option>)}
            </select>
          </div>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-muted">
            {c.objectives[campaign.objective]} · {f.d(campaign.start_date)} → {f.d(campaign.end_date)}{when && ` · ${when}`}
            {campaign.channels.length > 0 && <span className="ml-1 inline-flex gap-1">{campaign.channels.map(ch => <ChannelMark key={ch} channel={ch} className="h-3.5 w-3.5" />)}</span>}
          </p>
          {(zoneLabel || segment || keyMessage) && (
            <p className="m-0 mt-1 text-[13px] text-ink-muted">
              {zoneLabel && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /><span className="text-ink">{zoneLabel}</span></span>}
              {zoneLabel && segment && ' · '}
              {segment && <>{c.audience} <span className="text-ink">{segment.name}</span></>}
              {(zoneLabel || segment) && keyMessage && ' · '}
              {keyMessage && <>{c.keyMessage} <span className="text-ink">« {keyMessage.content.slice(0, 80)} »</span></>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {canEdit && <Button variant="danger" size="sm" iconOnly icon={<Trash2 />} aria-label={c.deleteCampaign} disabled={busy === 'delete'} onClick={remove} />}
          <Button variant="secondary" size="sm" icon={<Pencil />} disabled={!canEdit} onClick={onEdit}>{c.edit}</Button>
          <Button variant="ai" size="sm" onClick={writePost}>{c.writePost}</Button>
        </div>
      </div>

      {error && <p className="m-0 rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      {notice && <p className="m-0 rounded-[var(--radius-md)] bg-success-soft px-3 py-2 text-[13px] text-ink">{notice}</p>}

      <Card className="grid grid-cols-2 sm:grid-cols-5" aria-label={c.results}>
        {kpis.map((k, i) => (
          <div key={k.label} className={cn('px-3.5 py-3', i > 0 && 'sm:border-l sm:border-line', i % 2 === 1 && 'border-l border-line sm:border-l', i > 1 && 'border-t border-line sm:border-t-0')}>
            <p className="m-0 text-[12px] font-semibold text-ink-muted">{k.label}</p>
            <p className="m-0 mt-0.5 text-[20px] font-bold leading-[26px] text-ink tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{f.n(k.value)}</p>
            {k.target ? (
              <>
                <Meter value={k.value} target={k.target} />
                <p className="m-0 mt-1 text-[12px] text-ink-muted">{Math.round((k.value / k.target) * 100)} % {c.of} {f.n(k.target)}</p>
              </>
            ) : null}
          </div>
        ))}
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Card>
            <CardHeader title={c.brief} actions={canEdit && (
              editingBrief
                ? <><Button variant="ghost" size="sm" onClick={() => { setBrief(campaign.brief); setEditingBrief(false) }}>{c.cancel}</Button>
                    <Button variant="primary" size="sm" loading={busy === 'saveBrief'} onClick={() => void saveBrief()}>{c.save}</Button></>
                : <>{brief && <Button variant="ghost" size="sm" onClick={() => setEditingBrief(true)}>{c.edit}</Button>}
                    <Button variant="ghost" size="sm" icon={<Spark />} loading={busy === 'brief'} disabled={!apiKeyConfigured || busy !== ''} onClick={() => void generateBrief()}>
                      {busy === 'brief' ? c.generating : brief ? c.regenerate : c.generateBrief}</Button></>
            )} />
            <CardBody>
              {editingBrief ? (
                <textarea aria-label={c.brief} className="fc-input" rows={16} value={brief} onChange={e => setBrief(e.target.value)} />
              ) : brief ? (
                <BriefText text={brief} />
              ) : (
                <p className="m-0 text-[13px] text-ink-muted">{c.briefEmpty}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={c.results} actions={canEdit && <>
              <Button variant="ghost" size="sm" onClick={() => setShowEntry(v => !v)} aria-expanded={showEntry}>{c.addResults}</Button>
              <Button variant="ghost" size="sm" icon={<RefreshCw className={cn(busy === 'sync' && 'animate-spin')} />} disabled={busy !== ''} onClick={() => void syncResults()}>{c.refresh}</Button>
            </>} />
            <CardBody className="flex flex-col gap-3">
              {showEntry && (
                <MetricEntry c={c} channels={campaign.channels} onCancel={() => setShowEntry(false)}
                  onSave={metric => run('saveBrief', async () => {
                    if (!activeCompany) return
                    await upsertCampaignMetric(activeCompany.id, campaign.id, metric)
                    setMetrics(await listCampaignMetrics(campaign.id))
                    setShowEntry(false)
                  })} />
              )}
              {metrics.length === 0 ? (
                <p className="m-0 text-[13px] text-ink-muted">{c.noResults}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] tabular-nums">
                    <thead>
                      <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                        <th className="py-1.5 pr-3">{c.date}</th><th className="py-1.5 pr-3">{c.network}</th>
                        <th className="py-1.5 pr-3 text-right">{c.reach}</th><th className="py-1.5 pr-3 text-right">{c.engShort}</th>
                        <th className="py-1.5 pr-3 text-right">{c.clicks}</th><th className="py-1.5 text-right">{c.leadsShort}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...metrics].reverse().map(m => (
                        <tr key={m.id} className="border-b border-line text-ink last:border-b-0">
                          <td className="whitespace-nowrap py-1.5 pr-3 text-ink-muted">{f.d(m.date)}</td>
                          <td className="py-1.5 pr-3">
                            <span className="inline-flex items-center gap-1.5"><ChannelMark channel={m.channel} />{CHANNEL_LABELS[m.channel]}</span>
                            <span className="ml-1.5 text-ink-muted">· {m.source === 'manual' ? c.sources.manual : c.sources.network}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-right">{f.n(m.reach)}</td>
                          <td className="py-1.5 pr-3 text-right">{f.n(m.engagements)}</td>
                          <td className="py-1.5 pr-3 text-right">{f.n(m.clicks)}</td>
                          <td className="py-1.5 text-right">{f.n(m.leads)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          <Card>
            <CardHeader title={c.analysis} actions={
              <Button variant="ghost" size="sm" icon={<Spark />} loading={busy === 'analyze'} disabled={!apiKeyConfigured || busy !== ''} onClick={() => void analyze()}>
                {busy === 'analyze' ? c.analyzing : c.analyze}</Button>
            } />
            <CardBody className="flex flex-col gap-3">
              {!latest ? <p className="m-0 text-[13px] text-ink-muted">{c.noAnalysis}</p> : <InsightView insight={latest} c={c} lang={lang} />}
              {older.length > 0 && (
                <div className="border-t border-line pt-2">
                  <button onClick={() => setShowOlder(o => !o)} aria-expanded={showOlder} className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted hover:text-ink">
                    {showOlder ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{c.older(older.length)}
                  </button>
                  {showOlder && <div className="mt-2 flex flex-col gap-3">{older.map(i => <InsightView key={i.id} insight={i} c={c} lang={lang} />)}</div>}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>{c.content} <span className="font-semibold text-ink-muted">{content.length || ''}</span></>} actions={canEdit && candidates.length > 0 && (
              <select aria-label={c.linkContent} value="" disabled={busy !== ''} onChange={e => link(e.target.value)} className="fc-input h-7 w-auto max-w-[180px] text-[12px]">
                <option value="">{c.linkContent}</option>
                {candidates.map(item => (
                  <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{item.kind === 'calendar' ? c.calendarItem : c.libraryItem} · {item.title.slice(0, 50) || '—'}</option>
                ))}
              </select>
            )} />
            <CardBody>
              {content.length === 0 ? (
                <p className="m-0 text-[13px] text-ink-muted">{c.noContent}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {content.map(item => {
                    const status = c.itemStatus[item.status] ?? item.status
                    const tone: Tone = /publi/i.test(item.status) ? 'success' : /schedul|valid/i.test(item.status) ? 'info' : 'neutral'
                    return (
                      <li key={`${item.kind}:${item.id}`} className="flex items-center gap-2.5 border-b border-line py-2 text-[13px] last:border-b-0">
                        <ChannelMark channel={item.channel.split(',')[0]} className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-ink">{item.title || '—'}</span>
                        <span className="shrink-0 text-[12px] text-ink-muted">{item.kind === 'calendar' ? c.calendarItem : c.libraryItem}{item.date ? ` · ${f.d(item.date)}` : ''}</span>
                        {status && <Badge tone={tone}>{status}</Badge>}
                        {canEdit && <Button variant="ghost" size="sm" iconOnly icon={<Unlink />} aria-label={c.unlink} disabled={busy !== ''} onClick={() => void unlink(item)} />}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

// A brief's plain-text headings (short lines without end punctuation) read as headings.
function BriefText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="flex flex-col gap-3 text-[13px] leading-5">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const heading = lines.length > 1 && lines[0].trim().length < 48 && !/[.!?:]$/.test(lines[0].trim()) ? lines[0].trim() : ''
        const rest = heading ? lines.slice(1).join('\n') : block
        return (
          <div key={i}>
            {heading && <p className="m-0 mb-1 font-bold text-ink">{heading}</p>}
            <p className="m-0 whitespace-pre-line text-ink-muted">{rest}</p>
          </div>
        )
      })}
    </div>
  )
}

function InsightView({ insight, c, lang }: { insight: CampaignInsight; c: Copy; lang: 'fr' | 'en' }) {
  const f = useFormat(lang)
  const evidence = useMemo(() => { try { return JSON.parse(insight.evidence) as { onTrack?: boolean; metricRows?: number } } catch { return {} } }, [insight.evidence])
  const [assessment, ...rest] = insight.body.split(/\n{2,}/)
  const steps = rest.find(block => block.startsWith(`${c.nextSteps}:`) || /^[A-Za-zÀ-ÿ ]+:\n→/.test(block))
  const findings = rest.filter(block => block !== steps)
  const dot = evidence.onTrack === undefined ? 'var(--ink-subtle)' : evidence.onTrack ? 'var(--success)' : 'var(--warning)'
  return (
    <div className="text-[13px] leading-[19px]">
      <p className="m-0 flex items-center gap-1.5 font-bold text-ink"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden="true" />{insight.title}</p>
      <p className="m-0 mt-1.5 text-ink-muted">{assessment}</p>
      {findings.map(block => <p key={block} className="m-0 mt-1.5 whitespace-pre-line text-ink-muted">{block}</p>)}
      {steps && (
        <>
          <p className="m-0 mb-1 mt-2.5 font-bold text-ink">{c.thisWeek}</p>
          <ul className="m-0 flex flex-col gap-0.5 pl-4 text-ink-muted">
            {steps.split('\n').slice(1).map(s => s.replace(/^→\s*/, '')).filter(Boolean).map(s => <li key={s}>{s}</li>)}
          </ul>
        </>
      )}
      <p className="m-0 mt-2 text-[12px] text-ink-subtle">{c.analysedOn} {f.d(insight.created_at)}{evidence.metricRows !== undefined ? ` · ${evidence.metricRows} ${c.rows}` : ''}</p>
    </div>
  )
}

function MetricEntry({ c, channels, onSave, onCancel }: {
  c: Copy
  channels: CampaignChannel[]
  onSave: (metric: Parameters<typeof upsertCampaignMetric>[2]) => void
  onCancel: () => void
}) {
  const options = channels.length ? channels : [...CAMPAIGN_CHANNELS]
  const [date, setDate] = useState(today())
  const [channel, setChannel] = useState<CampaignChannel>(options[0])
  const [values, setValues] = useState({ reach: '', engagements: '', clicks: '', leads: '' })
  const n = (value: string) => Math.max(0, Math.round(Number(value)) || 0)
  return (
    <div className="grid grid-cols-2 items-end gap-2 rounded-[var(--radius-md)] bg-surface-sunken p-3 sm:grid-cols-6">
      <TextField label={c.date} type="date" value={date} onChange={e => setDate(e.target.value)} className="col-span-2 sm:col-span-1" />
      <SelectField label={c.network} value={channel} onChange={e => setChannel(e.target.value as CampaignChannel)}>
        {options.map(ch => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}
      </SelectField>
      {(['reach', 'engagements', 'clicks', 'leads'] as const).map(key => (
        <TextField key={key} label={c[key]} type="number" min={0} value={values[key]} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />
      ))}
      <div className="col-span-2 flex justify-end gap-2 sm:col-span-6">
        <Button variant="ghost" size="sm" onClick={onCancel}>{c.cancel}</Button>
        <Button variant="primary" size="sm" onClick={() => onSave({ date, channel, source: 'manual', impressions: 0, reach: n(values.reach), engagements: n(values.engagements), clicks: n(values.clicks), leads: n(values.leads), conversions: 0 })}>{c.save}</Button>
      </div>
    </div>
  )
}

// ─── Zones ────────────────────────────────────────────────────────────────────

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function ZoneEditor({ c, zone, places, onPlaceAdded, onClose, onSaved, onDeleted }: {
  c: Copy
  zone: Zone | null
  places: Place[]
  onPlaceAdded: (place: Place) => void
  onClose: () => void
  onSaved: (zone: Zone) => void
  onDeleted: (id: string) => void
}) {
  const { activeCompany } = useCompany()
  const [form, setForm] = useState<ZoneInput>(() => zone ?? { name: '', description: '', center_id: null, radius_km: null, place_ids: [] })
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [newQuarter, setNewQuarter] = useState<{ cityId: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const byId = useMemo(() => new Map(places.map(p => [p.id, p])), [places])
  const children = useMemo(() => {
    const map = new Map<string | null, Place[]>()
    for (const place of places) map.set(place.parent_id, [...(map.get(place.parent_id) ?? []), place])
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return map
  }, [places])
  const country = places.find(p => p.level === 'country')
  const regions = country ? children.get(country.id) ?? [] : places.filter(p => p.level === 'region')
  const selected = new Set(form.place_ids)
  const centers = places.filter(p => p.latitude !== null).sort((a, b) => a.name.localeCompare(b.name))

  const path = (place: Place) => {
    const parts: string[] = []
    let current = place.parent_id ? byId.get(place.parent_id) : undefined
    while (current && current.level !== 'country') {
      parts.push(current.name)
      current = current.parent_id ? byId.get(current.parent_id) : undefined
    }
    return parts.join(' · ')
  }

  // Default radius centre: the first selected place with coordinates, or its nearest ancestor that has them.
  const suggestedCenter = (ids: string[]) => {
    for (const id of ids) {
      let current = byId.get(id)
      while (current) {
        if (current.latitude !== null) return current.id
        current = current.parent_id ? byId.get(current.parent_id) : undefined
      }
    }
    return null
  }

  const toggle = (id: string) => setForm(prev => {
    const place_ids = prev.place_ids.includes(id) ? prev.place_ids.filter(x => x !== id) : [...prev.place_ids, id]
    return { ...prev, place_ids, center_id: prev.center_id ?? suggestedCenter(place_ids) }
  })
  const toggleExpanded = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const addQuarter = async () => {
    if (!activeCompany || !newQuarter?.name.trim()) return
    const parent = byId.get(newQuarter.cityId)
    if (!parent) return
    setError('')
    try {
      const place = await createPlace(activeCompany.id, parent, newQuarter.name.trim())
      onPlaceAdded(place)
      setForm(prev => ({ ...prev, place_ids: [...prev.place_ids, place.id] }))
      setNewQuarter(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async () => {
    if (!zone || !window.confirm(c.confirmDeleteZone)) return
    setError('')
    try {
      await deleteZone(zone.id)
      onDeleted(zone.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeCompany || !form.name.trim()) return
    setSaving(true)
    setError('')
    const input = { ...form, name: form.name.trim(), center_id: form.radius_km ? form.center_id : null }
    try {
      if (zone) {
        await updateZone(activeCompany.id, zone.id, input)
        onSaved({ ...input, id: zone.id })
      } else {
        onSaved(await createZone(activeCompany.id, input))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const renderPlace = (place: Place, depth: number): React.ReactNode => {
    const kids = children.get(place.id) ?? []
    const open = expanded.has(place.id)
    const expandable = kids.length > 0 || place.level === 'city'
    return (
      <div key={place.id}>
        <div className="flex items-center gap-1.5 py-1 hover:bg-surface-sunken rounded" style={{ paddingLeft: depth * 16 + 4 }}>
          {expandable ? (
            <button type="button" onClick={() => toggleExpanded(place.id)} className="p-0.5 text-ink-muted">
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="inline-block w-[18px]" />}
          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer flex-1 min-w-0">
            <input type="checkbox" checked={selected.has(place.id)} onChange={() => toggle(place.id)} className="accent-[var(--brand)]" />
            <span className="truncate">{place.name}</span>
          </label>
        </div>
        {open && (
          <>
            {kids.map(kid => renderPlace(kid, depth + 1))}
            {place.level === 'city' && (
              newQuarter?.cityId === place.id ? (
                <div className="flex gap-1.5 py-1" style={{ paddingLeft: (depth + 1) * 16 + 24 }}>
                  <input value={newQuarter.name} onChange={e => setNewQuarter({ cityId: place.id, name: e.target.value })} placeholder={c.quarterName}
                    autoFocus className="fc-input h-7 min-w-0 flex-1 text-[12px]"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addQuarter() } }} />
                  <button type="button" onClick={() => void addQuarter()} className={btnSecondary}>{c.add}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setNewQuarter({ cityId: place.id, name: '' })}
                  className="flex items-center gap-1 py-1 text-[11px] text-brand hover:underline" style={{ paddingLeft: (depth + 1) * 16 + 24 }}>
                  <Plus className="w-3 h-3" /> {c.addQuarter}
                </button>
              )
            )}
          </>
        )}
      </div>
    )
  }

  const matches = query.trim()
    ? places.filter(p => p.level !== 'country' && normalize(p.name).includes(normalize(query.trim()))).slice(0, 40)
    : []

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <form onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label={zone ? c.editZone : c.newZone}
        className="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col gap-3 overflow-hidden bg-surface-overlay p-5 shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-ink">{zone ? c.edit : c.newZone}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-ink-muted hover:bg-surface-sunken"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div>
            <label className={labelClass}>{c.zoneName}</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} autoFocus required />
          </div>
          <div>
            <label className={labelClass}>{c.description}</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputClass} />
          </div>
        </div>

        <div className="flex flex-col min-h-0 flex-1">
          <label className={labelClass}>{c.places} · {form.place_ids.length} {c.selected}</label>
          {form.place_ids.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {form.place_ids.map(id => byId.get(id)).filter((p): p is Place => Boolean(p)).map(p => (
                <span key={p.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-brand-soft text-brand-ink text-xs">
                  {p.name}
                  <button type="button" onClick={() => toggle(p.id)} className="p-0.5 hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={c.searchPlaces} className={inputClass} style={{ paddingLeft: 32 }} />
          </div>
          <div className="rounded-lg border border-line p-1.5 overflow-y-auto min-h-[180px] max-h-[40vh]">
            {query.trim()
              ? matches.map(place => (
                <label key={place.id} className="flex items-center gap-2 px-1 py-1 text-sm text-ink cursor-pointer hover:bg-surface-sunken rounded">
                  <input type="checkbox" checked={selected.has(place.id)} onChange={() => toggle(place.id)} className="accent-[var(--brand)]" />
                  <span>{place.name}</span>
                  <span className="text-[11px] text-ink-muted truncate">{path(place)}</span>
                </label>
              ))
              : regions.map(region => renderPlace(region, 0))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div>
            <label className={labelClass}>{c.radius}</label>
            <input type="number" min={0} max={1000} step={1} value={form.radius_km ?? ''} placeholder={c.noRadius}
              onChange={e => setForm({ ...form, radius_km: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0), center_id: form.center_id ?? suggestedCenter(form.place_ids) })}
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{c.center}</label>
            <select value={form.center_id ?? ''} disabled={!form.radius_km} onChange={e => setForm({ ...form, center_id: e.target.value || null })} className={cn(inputClass, 'disabled:opacity-50')}>
              <option value="">{c.none}</option>
              {centers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="text-xs text-danger shrink-0">{error}</p>}

        <div className="flex items-center justify-end gap-2 shrink-0">
          {zone && <button type="button" onClick={() => void remove()} className="fc-btn fc-btn--danger fc-btn--sm fc-btn--icon" aria-label={c.deleteZone} title={c.deleteZone}><Trash2 className="w-3.5 h-3.5" /></button>}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={btnSecondary}>{c.cancel}</button>
          <button type="submit" disabled={saving || !form.name.trim() || (form.place_ids.length === 0 && !(form.radius_km && form.center_id))} className={btnPrimary}>
            {saving ? c.saving : c.save}
          </button>
        </div>
      </form>
    </div>
  )
}
