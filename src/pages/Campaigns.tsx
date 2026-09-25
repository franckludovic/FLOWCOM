import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, ChevronDown, ChevronRight, Link2, Loader2, MapPin, Megaphone, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, Unlink, X,
} from 'lucide-react'
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
  type CampaignMetric, type CampaignObjective, type CampaignStatus,
} from '@/lib/campaigns'
import { listDataverseCalendarItems, listDataverseLibraryItems } from '@/lib/dataverse'
import { callModel, callModelJSON, buildModelError } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'
import { createPlace, createZone, deleteZone, describeZone, listPlaces, listZones, updateZone, type Place, type Zone, type ZoneInput } from '@/lib/geo'
import { cn } from '@/lib/utils'

// ─── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  fr: {
    title: 'Campagnes', subtitle: 'Planifiez, suivez et analysez vos campagnes.', newCampaign: 'Nouvelle campagne',
    all: 'Toutes', empty: 'Aucune campagne pour le moment.', name: 'Nom', objective: 'Objectif', status: 'Statut',
    period: 'Période', channels: 'Canaux', audience: 'Audience cible', keyMessage: 'Message clé', none: 'Aucun',
    targetLeads: 'Objectif prospects', targetReach: 'Objectif portée', trackingCode: 'Code de suivi',
    start: 'Début', end: 'Fin', save: 'Enregistrer', saving: 'Enregistrement…', cancel: 'Annuler', edit: 'Modifier',
    delete: 'Supprimer', confirmDelete: 'Supprimer cette campagne, ses résultats et ses analyses ?', back: 'Campagnes',
    brief: 'Brief', generateBrief: 'Générer le brief', generating: 'Génération…', briefEmpty: 'Aucun brief. Générez-en un ou rédigez-le.',
    results: 'Résultats', refreshBuffer: 'Actualiser depuis Buffer', addResults: 'Saisir des résultats',
    reach: 'Portée', impressions: 'Impressions', engagements: 'Engagements', clicks: 'Clics', leads: 'Prospects',
    noResults: 'Aucun résultat. Publiez des posts de cette campagne depuis le Studio ou saisissez des résultats.',
    date: 'Date', channel: 'Canal', source: 'Source', of: 'sur',
    content: 'Contenus liés', linkContent: 'Lier un contenu', noContent: 'Aucun contenu lié.', unlink: 'Délier',
    calendarItem: 'Calendrier', libraryItem: 'Bibliothèque', choose: 'Choisir…',
    analysis: 'Analyse IA', analyze: 'Analyser la campagne', analyzing: 'Analyse…', noAnalysis: 'Aucune analyse pour le moment.',
    zones: 'Zones', zone: 'Zone cible', allZones: 'Toute la zone', newZone: 'Nouvelle zone', noZones: 'Aucune zone. Créez-en une pour cibler une région, une ville ou des quartiers.',
    zoneName: 'Nom de la zone', description: 'Description', places: 'Lieux', searchPlaces: 'Rechercher un lieu…', selected: 'sélectionné(s)',
    center: 'Centre du rayon', radius: 'Rayon (km)', noRadius: 'Pas de rayon', addQuarter: 'Ajouter un quartier', quarterName: 'Nom du quartier', add: 'Ajouter',
    zoneNote: "Les posts organiques ne sont pas limités à la zone : elle oriente le contenu, les tactiques locales et l'analyse. Le ciblage strict viendra avec la publicité payante et WhatsApp.",
    confirmDeleteZone: "Supprimer cette zone ? Les campagnes qui la ciblent n'auront plus de zone.", manageZones: 'Gérer les zones',
    basedOn: 'Basé sur', nextSteps: 'Prochaines étapes', dayOf: 'Jour', synced: 'posts suivis, dont', withData: 'avec des données Buffer',
    objectives: { awareness: 'Notoriété', engagement: 'Engagement', leads: 'Prospects', sales: 'Ventes', retention: 'Fidélisation' },
    statuses: { draft: 'Brouillon', planned: 'Planifiée', active: 'Active', paused: 'En pause', completed: 'Terminée', cancelled: 'Annulée' },
  },
  en: {
    title: 'Campaigns', subtitle: 'Plan, follow up and analyse your campaigns.', newCampaign: 'New campaign',
    all: 'All', empty: 'No campaigns yet.', name: 'Name', objective: 'Objective', status: 'Status',
    period: 'Period', channels: 'Channels', audience: 'Target audience', keyMessage: 'Key message', none: 'None',
    targetLeads: 'Leads target', targetReach: 'Reach target', trackingCode: 'Tracking code',
    start: 'Start', end: 'End', save: 'Save', saving: 'Saving…', cancel: 'Cancel', edit: 'Edit',
    delete: 'Delete', confirmDelete: 'Delete this campaign with its results and analyses?', back: 'Campaigns',
    brief: 'Brief', generateBrief: 'Generate brief', generating: 'Generating…', briefEmpty: 'No brief yet. Generate one or write it.',
    results: 'Results', refreshBuffer: 'Refresh from Buffer', addResults: 'Enter results',
    reach: 'Reach', impressions: 'Impressions', engagements: 'Engagements', clicks: 'Clicks', leads: 'Leads',
    noResults: 'No results yet. Publish this campaign\'s posts from Studio or enter results.',
    date: 'Date', channel: 'Channel', source: 'Source', of: 'of',
    content: 'Linked content', linkContent: 'Link content', noContent: 'No linked content.', unlink: 'Unlink',
    calendarItem: 'Calendar', libraryItem: 'Library', choose: 'Choose…',
    analysis: 'AI analysis', analyze: 'Analyse campaign', analyzing: 'Analysing…', noAnalysis: 'No analysis yet.',
    zones: 'Zones', zone: 'Target zone', allZones: 'Whole zone', newZone: 'New zone', noZones: 'No zones yet. Create one to target a region, a city or neighbourhoods.',
    zoneName: 'Zone name', description: 'Description', places: 'Places', searchPlaces: 'Search places…', selected: 'selected',
    center: 'Radius centre', radius: 'Radius (km)', noRadius: 'No radius', addQuarter: 'Add a neighbourhood', quarterName: 'Neighbourhood name', add: 'Add',
    zoneNote: 'Organic posts are not restricted to the zone: it guides content, local tactics and analysis. Strict targeting comes with paid ads and WhatsApp.',
    confirmDeleteZone: 'Delete this zone? Campaigns targeting it will no longer have a zone.', manageZones: 'Manage zones',
    basedOn: 'Based on', nextSteps: 'Next steps', dayOf: 'Day', synced: 'posts tracked,', withData: 'with Buffer data',
    objectives: { awareness: 'Awareness', engagement: 'Engagement', leads: 'Leads', sales: 'Sales', retention: 'Retention' },
    statuses: { draft: 'Draft', planned: 'Planned', active: 'Active', paused: 'Paused', completed: 'Completed', cancelled: 'Cancelled' },
  },
}
type Copy = typeof COPY.fr

const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', x: 'X', whatsapp: 'WhatsApp', google: 'Google',
}

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: 'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)]',
  planned: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400',
  active: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
  paused: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  completed: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400',
  cancelled: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400',
}

const inputClass = 'w-full px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm outline-none focus:ring-2 focus:ring-indigo-500'
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1'
const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-50'
const btnSecondary = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-colors disabled:opacity-50'

const today = () => new Date().toISOString().slice(0, 10)
const slug = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const formatNumber = (n: number) => new Intl.NumberFormat().format(n)

function StatusBadge({ status, c }: { status: CampaignStatus; c: Copy }) {
  return <span className={cn('inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium', STATUS_STYLES[status])}>{c.statuses[status]}</span>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const { lang } = useI18n()
  const c = COPY[lang === 'fr' ? 'fr' : 'en']
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeCompany } = useCompany()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all')
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null)
  const [view, setView] = useState<'campaigns' | 'zones'>('campaigns')
  const [places, setPlaces] = useState<Place[]>([])
  const [zones, setZones] = useState<Zone[]>([])

  const reload = useCallback(async () => {
    if (!activeCompany) return
    setLoading(true)
    setError('')
    try {
      const [list, placeList, zoneList] = await Promise.all([listCampaigns(activeCompany.id), listPlaces(activeCompany.id), listZones(activeCompany.id)])
      setCampaigns(list)
      setPlaces(placeList)
      setZones(zoneList)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [activeCompany])

  useEffect(() => { void reload() }, [reload])

  const selected = id ? campaigns.find(item => item.id === id) : undefined
  const visible = filter === 'all' ? campaigns : campaigns.filter(item => item.status === filter)

  const onSaved = (saved: Campaign) => {
    setEditing(null)
    setCampaigns(prev => prev.some(p => p.id === saved.id) ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev])
    if (!id) navigate(`/campaigns/${saved.id}`)
  }

  if (!activeCompany) {
    return <div className="p-6 text-sm text-[var(--color-text-muted)]">{c.empty}</div>
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)]">
      <div className="max-w-6xl px-6 py-5 space-y-4">
        {selected ? (
          <CampaignDetail
            campaign={selected} c={c}
            zoneLabel={(() => { const z = zones.find(item => item.id === selected.zone_id); return z ? `${z.name}: ${describeZone(z, places)}` : '' })()}
            onBack={() => navigate('/campaigns')}
            onEdit={() => setEditing(selected)}
            onChange={updated => setCampaigns(prev => prev.map(p => p.id === updated.id ? updated : p))}
            onDeleted={() => { setCampaigns(prev => prev.filter(p => p.id !== selected.id)); navigate('/campaigns') }}
          />
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-[var(--color-text)]">{c.title}</h1>
                <p className="text-sm text-[var(--color-text-muted)]">{c.subtitle}</p>
              </div>
              {view === 'campaigns' && (
                <button onClick={() => setEditing('new')} className={btnPrimary}>
                  <Plus className="w-3.5 h-3.5" /> {c.newCampaign}
                </button>
              )}
            </div>

            <div className="flex gap-4 border-b border-[var(--color-border)]">
              {(['campaigns', 'zones'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={cn('pb-2 -mb-px text-sm font-medium border-b-2 transition-colors',
                    view === v ? 'border-indigo-600 text-[var(--color-text)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]')}>
                  {v === 'campaigns' ? c.title : c.zones}
                </button>
              ))}
            </div>

            {view === 'zones' ? (
              <ZonesPanel c={c} places={places} zones={zones} onPlacesChange={setPlaces} onZonesChange={setZones} />
            ) : (<>
            <div className="flex flex-wrap gap-1.5">
              {(['all', ...CAMPAIGN_STATUSES] as const).map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    filter === s ? 'bg-indigo-600 text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]')}>
                  {s === 'all' ? c.all : c.statuses[s]}
                </button>
              ))}
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-x-auto">
              {loading ? (
                <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" /></div>
              ) : visible.length === 0 ? (
                <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">{c.empty}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="px-4 py-2 font-semibold">{c.name}</th>
                      <th className="px-4 py-2 font-semibold">{c.objective}</th>
                      <th className="px-4 py-2 font-semibold">{c.period}</th>
                      <th className="px-4 py-2 font-semibold">{c.channels}</th>
                      <th className="px-4 py-2 font-semibold">{c.status}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {visible.map(item => (
                      <tr key={item.id} onClick={() => navigate(`/campaigns/${item.id}`)}
                        className="cursor-pointer hover:bg-[var(--color-surface-alt)] transition-colors">
                        <td className="px-4 py-2.5 font-medium text-[var(--color-text)]">{item.name}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{c.objectives[item.objective]}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)] whitespace-nowrap">{item.start_date || '–'} → {item.end_date || '–'}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{item.channels.map(ch => CHANNEL_LABELS[ch]).join(', ') || '–'}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={item.status} c={c} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </>)}
          </>
        )}
      </div>

      {editing && (
        <CampaignEditor
          c={c}
          zones={zones}
          onManageZones={() => { setEditing(null); navigate('/campaigns'); setView('zones') }}
          campaign={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function CampaignEditor({ c, campaign, zones, onManageZones, onClose, onSaved }: {
  c: Copy
  campaign: Campaign | null
  zones: Zone[]
  onManageZones: () => void
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
  const set = <K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) => setForm(prev => ({ ...prev, [key]: value }))
  const toNumber = (value: string) => value.trim() === '' ? null : Math.max(0, Math.round(Number(value)) || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--color-text)]">{campaign ? c.edit : c.newCampaign}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className={labelClass}>{c.name}</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} autoFocus required />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>{c.objective}</label>
            <select value={form.objective} onChange={e => set('objective', e.target.value as CampaignObjective)} className={inputClass}>
              {CAMPAIGN_OBJECTIVES.map(o => <option key={o} value={o}>{c.objectives[o]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>{c.status}</label>
            <select value={form.status} onChange={e => set('status', e.target.value as CampaignStatus)} className={inputClass}>
              {CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{c.statuses[s]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>{c.start}</label>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{c.end}</label>
            <input type="date" value={form.end_date} min={form.start_date} onChange={e => set('end_date', e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>{c.channels}</label>
          <div className="flex flex-wrap gap-1.5">
            {CAMPAIGN_CHANNELS.map(ch => {
              const on = form.channels.includes(ch)
              return (
                <button type="button" key={ch}
                  onClick={() => set('channels', on ? form.channels.filter(x => x !== ch) : [...form.channels, ch])}
                  className={cn('px-2.5 py-1 rounded-md border text-xs font-medium transition-colors',
                    on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]')}>
                  {CHANNEL_LABELS[ch]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{c.audience}</label>
            <select value={form.segment_id ?? ''} onChange={e => set('segment_id', e.target.value || null)} className={inputClass}>
              <option value="">{c.none}</option>
              {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>{c.keyMessage}</label>
            <select value={form.key_message_id ?? ''} onChange={e => set('key_message_id', e.target.value || null)} className={inputClass}>
              <option value="">{c.none}</option>
              {keyMessages.map(k => <option key={k.id} value={k.id}>{k.content.slice(0, 80)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className={labelClass}>{c.zone}</label>
            <button type="button" onClick={onManageZones} className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline mb-1">{c.manageZones}</button>
          </div>
          <select value={form.zone_id ?? ''} onChange={e => set('zone_id', e.target.value || null)} className={inputClass}>
            <option value="">{c.none}</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          {form.zone_id && <p className="text-[11px] text-[var(--color-text-muted)] mt-1">{c.zoneNote}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>{c.targetReach}</label>
            <input type="number" min={0} value={form.target_reach ?? ''} onChange={e => set('target_reach', toNumber(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{c.targetLeads}</label>
            <input type="number" min={0} value={form.target_leads ?? ''} onChange={e => set('target_leads', toNumber(e.target.value))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{c.trackingCode}</label>
            <input value={form.tracking_code} placeholder={slug(form.name)} onChange={e => set('tracking_code', e.target.value)} className={cn(inputClass, 'font-mono')} />
          </div>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnSecondary}>{c.cancel}</button>
          <button type="submit" disabled={saving || !form.name.trim()} className={btnPrimary}>{saving ? c.saving : c.save}</button>
        </div>
      </form>
    </div>
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

function CampaignDetail({ campaign, c, zoneLabel, onBack, onEdit, onChange, onDeleted }: {
  campaign: Campaign
  c: Copy
  zoneLabel: string
  onBack: () => void
  onEdit: () => void
  onChange: (campaign: Campaign) => void
  onDeleted: () => void
}) {
  const { lang, t } = useI18n()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const buffer = useBuffer()
  const canEdit = Boolean(activeCompany && ['owner', 'admin', 'editor'].includes(activeCompany.role ?? ''))

  const [metrics, setMetrics] = useState<CampaignMetric[]>([])
  const [content, setContent] = useState<CampaignContentItem[]>([])
  const [insights, setInsights] = useState<CampaignInsight[]>([])
  const [candidates, setCandidates] = useState<CampaignContentItem[]>([])
  const [brief, setBrief] = useState(campaign.brief)
  const [busy, setBusy] = useState<'' | 'brief' | 'saveBrief' | 'sync' | 'analyze' | 'delete'>('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [showEntry, setShowEntry] = useState(false)

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

  const progress = useMemo(() => {
    if (!campaign.start_date || !campaign.end_date) return null
    const start = Date.parse(campaign.start_date)
    const end = Date.parse(campaign.end_date)
    const total = Math.max(1, Math.round((end - start) / 86400000) + 1)
    const elapsed = Math.min(total, Math.max(0, Math.round((Date.now() - start) / 86400000) + 1))
    return { total, elapsed }
  }, [campaign.start_date, campaign.end_date])

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
      { role: 'system', content: `You are a senior marketing strategist. Write a concise, actionable organic campaign brief. Tailor every recommendation to the target zone when one is given (local references, neighbourhoods, languages spoken there). Use short sections with plain-text headings: Objective, Audience insight, Core message, Content pillars (3), Channel plan (per channel: formats and weekly frequency), Local reach tactics (only when a target zone is given: location tags, local groups and communities, local hashtags and neighbourhood names, since organic posts cannot be geo-restricted), KPIs to track. Maximum 400 words. No markdown symbols such as # or *. Respond in ${lang === 'fr' ? 'French' : 'English'}.\n\nCompany context:\n${context}` },
      { role: 'user', content: campaignFacts() },
    ], { temperature: 0.6, max_tokens: 1200 })
    setBrief(text.trim())
  })

  const saveBrief = () => run('saveBrief', async () => {
    await updateCampaign(campaign.id, { brief })
    onChange({ ...campaign, brief })
  })

  const syncBuffer = () => run('sync', async () => {
    if (!activeCompany || !buffer.orgId) throw new Error(lang === 'fr' ? 'Buffer n\'est pas connecté.' : 'Buffer is not connected.')
    const result = await syncCampaignBufferResults(activeCompany.id, campaign.id, buffer.orgId, buffer.channels)
    setMetrics(await listCampaignMetrics(campaign.id))
    setNotice(`${result.tracked} ${c.synced} ${result.matched} ${c.withData}.`)
  })

  const analyze = () => run('analyze', async () => {
    if (!activeCompany) return
    const byChannel = campaign.channels.map(ch => ({ channel: ch, ...totalMetrics(metrics.filter(m => m.channel === ch)) }))
    const evidence = {
      asOf: today(),
      period: { start: campaign.start_date, end: campaign.end_date, dayOfCampaign: progress?.elapsed ?? null, totalDays: progress?.total ?? null },
      targets: { reach: campaign.target_reach, leads: campaign.target_leads },
      totals,
      byChannel,
      metricRows: metrics.length,
      linkedContent: { total: content.length, published: content.filter(i => /publi/i.test(i.status)).length },
      sources: [...new Set(metrics.map(m => m.source))],
    }
    const context = buildAiContext({ company: activeCompany, products, segments, keyMessages })
    const result = await callModelJSON<Analysis>(activeCompany.id, [
      { role: 'system', content: `You are a marketing performance analyst. Assess an organic campaign using ONLY the data provided. If data is missing or too thin to judge, say so explicitly instead of guessing. Return JSON: {"title": short headline, "onTrack": boolean, "assessment": 2-3 sentences citing the numbers, "findings": up to 4 strings, "nextSteps": up to 4 concrete actions for the coming week}. Respond in ${lang === 'fr' ? 'French' : 'English'}.\n\nCompany context:\n${context}` },
      { role: 'user', content: `${campaignFacts()}\n\nData:\n${JSON.stringify(evidence)}` },
    ], { temperature: 0.3, max_tokens: 1200, requiredKeys: ['title', 'assessment', 'nextSteps'] })
    const findings = Array.isArray(result.findings) ? result.findings : []
    const nextSteps = Array.isArray(result.nextSteps) ? result.nextSteps : []
    const body = [
      result.assessment,
      findings.length ? findings.map(f => `• ${f}`).join('\n') : '',
      nextSteps.length ? `${c.nextSteps}:\n${nextSteps.map(s => `→ ${s}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n')
    const saved = await createCampaignInsight(activeCompany.id, campaign.id, { title: result.title, body, evidence })
    setInsights(prev => [saved, ...prev])
  })

  const changeStatus = (status: CampaignStatus) => run('saveBrief', async () => {
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

  const kpis: Array<{ label: string; value: number; target: number | null }> = [
    { label: c.reach, value: totals.reach, target: campaign.target_reach },
    { label: c.impressions, value: totals.impressions, target: null },
    { label: c.engagements, value: totals.engagements, target: null },
    { label: c.clicks, value: totals.clicks, target: null },
    { label: c.leads, value: totals.leads, target: campaign.target_leads },
  ]

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
        <ArrowLeft className="w-3.5 h-3.5" /> {c.back}
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-indigo-500 shrink-0" />
            <h1 className="text-xl font-bold text-[var(--color-text)] truncate">{campaign.name}</h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {c.objectives[campaign.objective]} · {campaign.start_date || '–'} → {campaign.end_date || '–'}
            {progress && ` · ${c.dayOf} ${progress.elapsed}/${progress.total}`}
            {campaign.channels.length > 0 && ` · ${campaign.channels.map(ch => CHANNEL_LABELS[ch]).join(', ')}`}
          </p>
          {zoneLabel && (
            <p className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] mt-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="text-[var(--color-text)]">{zoneLabel}</span>
            </p>
          )}
          {(segment || keyMessage) && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {segment && <>{c.audience}: <span className="text-[var(--color-text)]">{segment.name}</span></>}
              {segment && keyMessage && ' · '}
              {keyMessage && <>{c.keyMessage}: <span className="text-[var(--color-text)]">{keyMessage.content.slice(0, 90)}</span></>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={campaign.status} disabled={!canEdit} onChange={e => changeStatus(e.target.value as CampaignStatus)}
            className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-xs outline-none">
            {CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{c.statuses[s]}</option>)}
          </select>
          <button onClick={onEdit} disabled={!canEdit} className={btnSecondary}><Pencil className="w-3.5 h-3.5" /> {c.edit}</button>
          <button onClick={remove} disabled={!canEdit || busy === 'delete'} className={cn(btnSecondary, 'text-red-600 dark:text-red-400')} title={c.delete}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{error}</p>}
      {notice && <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 rounded-lg">{notice}</p>}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {kpis.map(k => (
          <div key={k.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">{k.label}</p>
            <p className="text-lg font-bold text-[var(--color-text)]">{formatNumber(k.value)}</p>
            {k.target ? (
              <>
                <div className="h-1 rounded-full bg-[var(--color-surface-alt)] mt-1.5 overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (k.value / k.target) * 100)}%` }} />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{Math.round((k.value / k.target) * 100)}% {c.of} {formatNumber(k.target)}</p>
              </>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4 min-w-0">
          {/* Brief */}
          <Section title={c.brief} actions={
            <>
              <button onClick={generateBrief} disabled={!canEdit || !apiKeyConfigured || busy !== ''} className={btnSecondary}>
                {busy === 'brief' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {busy === 'brief' ? c.generating : c.generateBrief}
              </button>
              {brief !== campaign.brief && (
                <button onClick={saveBrief} disabled={busy !== ''} className={btnPrimary}>{busy === 'saveBrief' ? c.saving : c.save}</button>
              )}
            </>
          }>
            <textarea value={brief} onChange={e => setBrief(e.target.value)} readOnly={!canEdit} placeholder={c.briefEmpty}
              className="w-full min-h-[220px] px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm leading-relaxed outline-none focus:ring-2 focus:ring-indigo-500 resize-y" />
          </Section>

          {/* Results */}
          <Section title={c.results} actions={
            <>
              <button onClick={syncBuffer} disabled={!canEdit || busy !== ''} className={btnSecondary}>
                <RefreshCw className={cn('w-3.5 h-3.5', busy === 'sync' && 'animate-spin')} /> {c.refreshBuffer}
              </button>
              <button onClick={() => setShowEntry(v => !v)} disabled={!canEdit} className={btnSecondary}>
                <Plus className="w-3.5 h-3.5" /> {c.addResults}
              </button>
            </>
          }>
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
              <p className="text-sm text-[var(--color-text-muted)]">{c.noResults}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="py-1.5 pr-3 font-semibold">{c.date}</th>
                      <th className="py-1.5 pr-3 font-semibold">{c.channel}</th>
                      <th className="py-1.5 pr-3 font-semibold">{c.source}</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">{c.reach}</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">{c.engagements}</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">{c.clicks}</th>
                      <th className="py-1.5 font-semibold text-right">{c.leads}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {[...metrics].reverse().map(m => (
                      <tr key={m.id} className="text-[var(--color-text)]">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{m.date}</td>
                        <td className="py-1.5 pr-3">{CHANNEL_LABELS[m.channel]}</td>
                        <td className="py-1.5 pr-3 text-[var(--color-text-muted)]">{m.source}</td>
                        <td className="py-1.5 pr-3 text-right">{formatNumber(m.reach)}</td>
                        <td className="py-1.5 pr-3 text-right">{formatNumber(m.engagements)}</td>
                        <td className="py-1.5 pr-3 text-right">{formatNumber(m.clicks)}</td>
                        <td className="py-1.5 text-right">{formatNumber(m.leads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-4 min-w-0">
          {/* AI analysis */}
          <Section title={c.analysis} actions={
            <button onClick={analyze} disabled={!apiKeyConfigured || busy !== ''} className={btnPrimary}>
              {busy === 'analyze' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart3 className="w-3.5 h-3.5" />}
              {busy === 'analyze' ? c.analyzing : c.analyze}
            </button>
          }>
            {insights.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">{c.noAnalysis}</p>
            ) : (
              <div className="space-y-3">
                {insights.map(insight => <InsightCard key={insight.id} insight={insight} c={c} />)}
              </div>
            )}
          </Section>

          {/* Linked content */}
          <Section title={c.content} actions={
            canEdit && candidates.length > 0 ? (
              <label className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <Link2 className="w-3.5 h-3.5" />
                <select value="" onChange={e => link(e.target.value)} disabled={busy !== ''}
                  className="max-w-[180px] px-2 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-xs outline-none">
                  <option value="">{c.linkContent}</option>
                  {candidates.map(item => (
                    <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>
                      {item.kind === 'calendar' ? c.calendarItem : c.libraryItem} · {item.title.slice(0, 50) || c.choose}
                    </option>
                  ))}
                </select>
              </label>
            ) : null
          }>
            {content.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">{c.noContent}</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {content.map(item => (
                  <li key={`${item.kind}:${item.id}`} className="flex items-center gap-2 py-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] w-20 shrink-0">
                      {item.kind === 'calendar' ? c.calendarItem : c.libraryItem}
                    </span>
                    <span className="text-sm text-[var(--color-text)] truncate flex-1">{item.title || '–'}</span>
                    <span className="text-[11px] text-[var(--color-text-muted)] shrink-0">{item.date}</span>
                    {canEdit && (
                      <button onClick={() => unlink(item)} disabled={busy !== ''} title={c.unlink}
                        className="p-1 rounded text-[var(--color-text-muted)] hover:text-red-500 hover:bg-[var(--color-surface-alt)]">
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

function InsightCard({ insight, c }: { insight: CampaignInsight; c: Copy }) {
  const [open, setOpen] = useState(false)
  const sources = useMemo(() => {
    try {
      const evidence = JSON.parse(insight.evidence)
      return `${evidence.metricRows ?? 0} · ${(evidence.sources ?? []).join(', ') || '–'} · ${evidence.asOf ?? ''}`
    } catch {
      return ''
    }
  }, [insight.evidence])
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-sm font-semibold text-[var(--color-text)]">{insight.title}</p>
      <p className="text-[11px] text-[var(--color-text-muted)]">{insight.created_at.slice(0, 16).replace('T', ' ')}</p>
      <p className="text-sm text-[var(--color-text)] whitespace-pre-line mt-2 leading-relaxed">{insight.body}</p>
      {insight.evidence && (
        <button onClick={() => setOpen(v => !v)} className="mt-2 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline">
          {c.basedOn}: {sources}
        </button>
      )}
      {open && (
        <pre className="mt-2 text-[10px] leading-snug text-[var(--color-text-muted)] bg-[var(--color-surface-alt)] rounded p-2 overflow-x-auto">
          {(() => { try { return JSON.stringify(JSON.parse(insight.evidence), null, 2) } catch { return insight.evidence } })()}
        </pre>
      )}
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
    <form onSubmit={e => {
      e.preventDefault()
      onSave({ date, channel, source: 'manual', impressions: 0, reach: n(values.reach), engagements: n(values.engagements), clicks: n(values.clicks), leads: n(values.leads), conversions: 0 })
    }} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end p-3 rounded-lg bg-[var(--color-surface-alt)]">
      <div className="col-span-2 sm:col-span-1">
        <label className={labelClass}>{c.date}</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>{c.channel}</label>
        <select value={channel} onChange={e => setChannel(e.target.value as CampaignChannel)} className={inputClass}>
          {options.map(ch => <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>)}
        </select>
      </div>
      {(['reach', 'engagements', 'clicks', 'leads'] as const).map(key => (
        <div key={key}>
          <label className={labelClass}>{c[key]}</label>
          <input type="number" min={0} value={values[key]} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} className={inputClass} />
        </div>
      ))}
      <div className="col-span-2 sm:col-span-6 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnSecondary}>{c.cancel}</button>
        <button type="submit" className={btnPrimary}>{c.save}</button>
      </div>
    </form>
  )
}

// ─── Zones ────────────────────────────────────────────────────────────────────

function ZonesPanel({ c, places, zones, onPlacesChange, onZonesChange }: {
  c: Copy
  places: Place[]
  zones: Zone[]
  onPlacesChange: (places: Place[]) => void
  onZonesChange: (zones: Zone[]) => void
}) {
  const { activeCompany } = useCompany()
  const canEdit = Boolean(activeCompany && ['owner', 'admin', 'editor'].includes(activeCompany.role ?? ''))
  const [editing, setEditing] = useState<Zone | 'new' | null>(null)
  const [error, setError] = useState('')

  const remove = async (zone: Zone) => {
    if (!window.confirm(c.confirmDeleteZone)) return
    setError('')
    try {
      await deleteZone(zone.id)
      onZonesChange(zones.filter(z => z.id !== zone.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setEditing('new')} disabled={!canEdit} className={btnPrimary}><Plus className="w-3.5 h-3.5" /> {c.newZone}</button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
        {zones.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">{c.noZones}</p>
        ) : zones.map(zone => (
          <div key={zone.id} className="flex items-center gap-3 px-4 py-3">
            <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--color-text)]">{zone.name}</p>
              <p className="text-xs text-[var(--color-text-muted)] truncate">{describeZone(zone, places)}</p>
            </div>
            {canEdit && (
              <>
                <button onClick={() => setEditing(zone)} className={btnSecondary}><Pencil className="w-3.5 h-3.5" /> {c.edit}</button>
                <button onClick={() => remove(zone)} className={cn(btnSecondary, 'text-red-600 dark:text-red-400')} title={c.delete}><Trash2 className="w-3.5 h-3.5" /></button>
              </>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <ZoneEditor
          c={c}
          zone={editing === 'new' ? null : editing}
          places={places}
          onPlaceAdded={place => onPlacesChange([...places, place])}
          onClose={() => setEditing(null)}
          onSaved={saved => {
            setEditing(null)
            onZonesChange(zones.some(z => z.id === saved.id) ? zones.map(z => z.id === saved.id ? saved : z) : [...zones, saved])
          }}
        />
      )}
    </div>
  )
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function ZoneEditor({ c, zone, places, onPlaceAdded, onClose, onSaved }: {
  c: Copy
  zone: Zone | null
  places: Place[]
  onPlaceAdded: (place: Place) => void
  onClose: () => void
  onSaved: (zone: Zone) => void
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
        <div className="flex items-center gap-1.5 py-1 hover:bg-[var(--color-surface-alt)] rounded" style={{ paddingLeft: depth * 16 + 4 }}>
          {expandable ? (
            <button type="button" onClick={() => toggleExpanded(place.id)} className="p-0.5 text-[var(--color-text-muted)]">
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="inline-block w-[18px]" />}
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)] cursor-pointer flex-1 min-w-0">
            <input type="checkbox" checked={selected.has(place.id)} onChange={() => toggle(place.id)} className="accent-indigo-600" />
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
                    autoFocus className="flex-1 min-w-0 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-xs outline-none"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addQuarter() } }} />
                  <button type="button" onClick={() => void addQuarter()} className={btnSecondary}>{c.add}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setNewQuarter({ cityId: place.id, name: '' })}
                  className="flex items-center gap-1 py-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline" style={{ paddingLeft: (depth + 1) * 16 + 24 }}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-2xl p-5 space-y-3 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-base font-bold text-[var(--color-text)]">{zone ? c.edit : c.newZone}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"><X className="w-4 h-4" /></button>
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
                <span key={p.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs">
                  {p.name}
                  <button type="button" onClick={() => toggle(p.id)} className="p-0.5 hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={c.searchPlaces} className={cn(inputClass, 'pl-8')} />
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-1.5 overflow-y-auto min-h-[180px] max-h-[40vh]">
            {query.trim()
              ? matches.map(place => (
                <label key={place.id} className="flex items-center gap-2 px-1 py-1 text-sm text-[var(--color-text)] cursor-pointer hover:bg-[var(--color-surface-alt)] rounded">
                  <input type="checkbox" checked={selected.has(place.id)} onChange={() => toggle(place.id)} className="accent-indigo-600" />
                  <span>{place.name}</span>
                  <span className="text-[11px] text-[var(--color-text-muted)] truncate">{path(place)}</span>
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

        {error && <p className="text-xs text-red-600 dark:text-red-400 shrink-0">{error}</p>}

        <div className="flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className={btnSecondary}>{c.cancel}</button>
          <button type="submit" disabled={saving || !form.name.trim() || (form.place_ids.length === 0 && !(form.radius_km && form.center_id))} className={btnPrimary}>
            {saving ? c.saving : c.save}
          </button>
        </div>
      </form>
    </div>
  )
}
