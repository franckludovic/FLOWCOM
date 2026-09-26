import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Copy, Loader2, Megaphone, Search, Send, Trash2 } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  deleteDataverseLibraryItem, listDataverseContentScores, listDataverseLibraryItems, saveDataverseContentScores, updateDataverseLibraryItem,
} from '@/lib/dataverse'
import { callModel } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'
import { useCampaignOptions } from '@/lib/campaignContext'
import { CHANNELS, CHANNEL_LIMITS, CHANNEL_MAP, FORMAT_MAP, suggestedFormat, type ContentFormat } from '@/lib/channels'
import {
  Badge, Button, Card, Chip, InsightCard, PagerBar, Sheet, Spark, Tabs, TextAreaField, TextField, usePaged, type Tone,
} from '@/components/ui'
import type { LibraryItem } from '@/types'
import { cn } from '@/lib/utils'

type Status = LibraryItem['status']
type ScoreLevel = 'ready' | 'good' | 'needs-work'
type Sort = 'recent' | 'oldest' | 'title'

const STATUSES: Status[] = ['Draft', 'Validated', 'Published', 'Archived']
const STATUS_TONE: Record<Status, Tone> = { Draft: 'warning', Validated: 'info', Published: 'success', Archived: 'neutral' }
const SCORE_COLOR: Record<ScoreLevel, string> = { ready: 'var(--success)', good: 'var(--info)', 'needs-work': 'var(--warning)' }
// Placeholders the AI writes where a fact is missing, such as [NOMBRE] or [DATE].
const PLACEHOLDER = /\[[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9 _'-]*\]/g

const COPY = {
  fr: {
    title: 'Bibliothèque', items: 'contenus', ready: 'prêts à programmer', newPost: 'Nouveau post',
    tabs: { all: 'Tous', Draft: 'Brouillons', Validated: 'Validés', Published: 'Publiés', Archived: 'Archivés' },
    status: { Draft: 'Brouillon', Validated: 'Validé', Published: 'Publié', Archived: 'Archivé' } as Record<Status, string>,
    score: { ready: 'Prêt', good: 'Bien', 'needs-work': 'À améliorer' } as Record<ScoreLevel, string>,
    search: 'Rechercher un titre, une accroche, un hashtag', allNetworks: 'Tous les réseaux', allFormats: 'Tous les formats',
    sort: { recent: 'Plus récents', oldest: 'Plus anciens', title: 'Par titre' } as Record<Sort, string>,
    readyBanner: (n: number) => `${n} ${n > 1 ? 'contenus sont prêts' : 'contenu est prêt'} à publier`, readyBannerText: 'selon la relecture IA, et pas encore programmés.',
    showReady: (n: number) => `Voir ${n > 1 ? `les ${n}` : 'le contenu'}`, clearReady: 'Tout afficher',
    empty: 'Votre bibliothèque est vide', emptyText: 'Les posts rédigés avec le générateur de contenu arrivent ici.',
    noMatch: 'Aucun contenu ne correspond à ces filtres.', select: 'Choisissez un contenu pour le voir ici.',
    untitled: 'Sans titre', created: 'créé le', statusLabel: 'Statut',
    review: 'Relecture IA', reviewPending: 'Relecture en attente',
    reviewText: { ready: 'Accroche claire et appel à l\'action présent.', good: 'Correct, mais l\'accroche ou l\'appel à l\'action peuvent être renforcés.', 'needs-work': 'Accroche faible ou message peu clair : retravaillez-le avant de le programmer.' } as Record<ScoreLevel, string>,
    chars: (n: string, l: string) => `${n} caractères sur ${l}.`, overLimit: 'Trop long pour ce réseau.',
    placeholders: (p: string) => `Remplacez ${p} avant de programmer.`,
    text: 'Texte', hashtags: 'Hashtags', visual: 'Idée de visuel', titleLabel: 'Titre',
    edit: 'Modifier', cancel: 'Annuler', save: 'Enregistrer', copy: 'Copier le texte', copied: 'Copié',
    delete: 'Supprimer', confirmDelete: 'Supprimer ce contenu de la bibliothèque ? Cette action est définitive.',
    adapt: 'Adapter pour un autre réseau', adaptHint: 'Le générateur rédige une version pour le réseau choisi.',
    adaptButton: 'Adapter', adaptTip: 'Réécrire ce contenu pour un autre réseau, sans modifier celui-ci',
    schedule: 'Programmer dans le Studio', close: 'Fermer',
  },
  en: {
    title: 'Library', items: 'items', ready: 'ready to schedule', newPost: 'New post',
    tabs: { all: 'All', Draft: 'Drafts', Validated: 'Validated', Published: 'Published', Archived: 'Archived' },
    status: { Draft: 'Draft', Validated: 'Validated', Published: 'Published', Archived: 'Archived' } as Record<Status, string>,
    score: { ready: 'Ready', good: 'Good', 'needs-work': 'Needs work' } as Record<ScoreLevel, string>,
    search: 'Search a title, a hook, a hashtag', allNetworks: 'All networks', allFormats: 'All formats',
    sort: { recent: 'Newest', oldest: 'Oldest', title: 'By title' } as Record<Sort, string>,
    readyBanner: (n: number) => `${n} ${n > 1 ? 'items are' : 'item is'} ready to publish`, readyBannerText: 'according to the AI review, and not scheduled yet.',
    showReady: (n: number) => (n > 1 ? `Show the ${n}` : 'Show it'), clearReady: 'Show all',
    empty: 'Your library is empty', emptyText: 'Posts written with the content generator land here.',
    noMatch: 'Nothing matches these filters.', select: 'Pick an item to see it here.',
    untitled: 'Untitled', created: 'created', statusLabel: 'Status',
    review: 'AI review', reviewPending: 'Review pending',
    reviewText: { ready: 'Clear hook and a call to action.', good: 'Fine, but the hook or the call to action could be stronger.', 'needs-work': 'Weak hook or unclear message: rework it before scheduling.' } as Record<ScoreLevel, string>,
    chars: (n: string, l: string) => `${n} of ${l} characters.`, overLimit: 'Too long for this network.',
    placeholders: (p: string) => `Replace ${p} before scheduling.`,
    text: 'Text', hashtags: 'Hashtags', visual: 'Visual idea', titleLabel: 'Title',
    edit: 'Edit', cancel: 'Cancel', save: 'Save', copy: 'Copy the text', copied: 'Copied',
    delete: 'Delete', confirmDelete: 'Delete this item from the library? This cannot be undone.',
    adapt: 'Adapt for another network', adaptHint: 'The generator writes a version for the chosen network.',
    adaptButton: 'Adapt', adaptTip: 'Rewrite this content for another network, leaving this one unchanged',
    schedule: 'Schedule in the Studio', close: 'Close',
  },
}
type Copy = typeof COPY.fr

const toFormat = (format: LibraryItem['format'] | string): ContentFormat =>
  format === 'carousel' ? 'Carousel' : format === 'video' ? 'Video' : format === 'story' ? 'Story' : 'Post'
const itemText = (item: LibraryItem) => `${item.body}${item.hashtags.trim() ? `\n\n${item.hashtags.trim()}` : ''}`
const firstLine = (item: LibraryItem) => item.hook || item.body.split('\n').find(l => l.trim()) || ''

function useNarrow() {
  const query = '(max-width: 1023px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

function NetworkMark({ network, size = 36 }: { network: string; size?: number }) {
  const def = CHANNEL_MAP[network]
  return (
    <span className="grid shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-sunken" style={{ width: size, height: size }}>
      {def && <def.icon className="h-4 w-4" style={{ color: def.color }} title={def.label} />}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const { lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const navigate = useNavigate()
  const narrow = useNarrow()
  const { campaigns } = useCampaignOptions(activeCompany?.id)

  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'all' | Status>('all')
  const [search, setSearch] = useState('')
  const [network, setNetwork] = useState('all')
  const [format, setFormat] = useState('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [readyOnly, setReadyOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!activeCompany) { setItems([]); setLoading(false); return }
    setLoading(true)
    listDataverseLibraryItems(activeCompany.id)
      .then(data => { if (!cancelled) setItems(data) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeCompany?.id])

  // ── AI review scores: Dataverse is the source, localStorage gives instant reads.
  const localKey = `flowcom:library_scores:${activeCompany?.id ?? 'default'}`
  const [scores, setScores] = useState<Record<string, ScoreLevel>>(() => {
    try { return JSON.parse(localStorage.getItem(localKey) ?? '{}') } catch { return {} }
  })
  const scoring = useRef(false)

  const mergeScores = (next: Record<string, ScoreLevel>) => setScores(prev => {
    const merged = { ...prev, ...next }
    try { localStorage.setItem(localKey, JSON.stringify(merged)) } catch { /* storage unavailable */ }
    return merged
  })

  useEffect(() => {
    if (!activeCompany) return
    listDataverseContentScores(activeCompany.id).then(remote => { if (Object.keys(remote).length) mergeScores(remote) }).catch(() => {})
  }, [activeCompany?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reviews up to 5 unscored items in the background.
  useEffect(() => {
    if (!apiKeyConfigured || !activeCompany || scoring.current) return
    const unscored = items.filter(i => i.status !== 'Archived' && !scores[i.id] && (i.hook || i.body)).slice(0, 5)
    if (!unscored.length) return
    scoring.current = true
    const context = buildAiContext({ company: activeCompany, products, segments, keyMessages })
    void (async () => {
      const found: Record<string, ScoreLevel> = {}
      for (const item of unscored) {
        try {
          const reply = await callModel(activeCompany.id, [
            { role: 'system', content: `You are a social media content reviewer. Rate this ${item.channel} ${item.format} content. Reply with ONLY one word: "ready" (strong hook, clear message, good call to action), "good" (decent but could be improved) or "needs-work" (weak hook, unclear or no call to action). Brand context:\n${context}` },
            { role: 'user', content: [item.hook, item.body].filter(Boolean).join('\n').slice(0, 600) },
          ], { temperature: 0.1, max_tokens: 10 })
          const word = reply.trim().toLowerCase().replace(/[^a-z-]/g, '')
          if (word === 'ready' || word === 'good' || word === 'needs-work') found[item.id] = word
        } catch { /* the review is optional */ }
      }
      if (Object.keys(found).length) {
        mergeScores(found)
        await saveDataverseContentScores(activeCompany.id, found).catch(() => {})
      }
      scoring.current = false
    })()
  }, [items.length, apiKeyConfigured]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Changes touch only the one item, so its id and links stay intact.
  const update = async (id: string, changes: Partial<LibraryItem>) => {
    await updateDataverseLibraryItem(id, changes)
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...changes } : i)))
    window.dispatchEvent(new Event('flowcom:data-updated'))
  }

  const remove = async (id: string) => {
    await deleteDataverseLibraryItem(id)
    setItems(prev => prev.filter(i => i.id !== id))
    setSelectedId(null)
    window.dispatchEvent(new Event('flowcom:data-updated'))
  }

  const schedule = (item: LibraryItem) => {
    const params = new URLSearchParams({ item: item.id })
    if (item.campaign_id) params.set('campaign', item.campaign_id)
    navigate(`/studio?${params.toString()}`)
  }

  const adapt = (item: LibraryItem, target: string) => {
    const params = new URLSearchParams({ topic: item.title, channel: target, format: suggestedFormat(target, toFormat(item.format)) })
    if (item.campaign_id) params.set('campaign', item.campaign_id)
    navigate(`/content?${params.toString()}`)
  }

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(STATUSES.map(s => [s, items.filter(i => i.status === s).length])) as Record<Status, number>
    return { all: items.length, ...byStatus }
  }, [items])
  const readyItems = items.filter(i => scores[i.id] === 'ready' && (i.status === 'Draft' || i.status === 'Validated'))
  const networks = useMemo(() => [...new Set(items.map(i => i.channel).filter(Boolean))], [items])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = items.filter(i => {
      if (readyOnly && !(scores[i.id] === 'ready' && (i.status === 'Draft' || i.status === 'Validated'))) return false
      if (tab !== 'all' && i.status !== tab) return false
      if (network !== 'all' && i.channel !== network) return false
      if (format !== 'all' && toFormat(i.format) !== format) return false
      if (q && ![i.title, i.hook, i.body, i.hashtags].some(v => v.toLowerCase().includes(q))) return false
      return true
    })
    return list.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'oldest' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at))
  }, [items, tab, network, format, search, sort, readyOnly, scores])

  const paged = usePaged(visible, [tab, search, network, format, sort, readyOnly].join('|'))

  // Keep a selection on wide screens; phones open the item on tap.
  useEffect(() => {
    if (narrow) return
    if (!visible.length) { setSelectedId(null); return }
    if (!selectedId || !visible.some(i => i.id === selectedId)) setSelectedId(visible[0].id)
  }, [visible, narrow]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = items.find(i => i.id === selectedId) ?? null
  const campaignName = (id?: string | null) => campaigns.find(cp => cp.id === id)?.name
  const canEdit = Boolean(activeCompany && ['owner', 'admin', 'editor'].includes(activeCompany.role ?? ''))

  const detail = selected && (
    <Detail key={selected.id} item={selected} c={c} lang={L} score={scores[selected.id]} campaign={campaignName(selected.campaign_id)}
      canEdit={canEdit} inSheet={narrow} onUpdate={changes => update(selected.id, changes)} onDelete={() => remove(selected.id)}
      onSchedule={() => schedule(selected)} onAdapt={target => adapt(selected, target)} />
  )

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-4 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
            <p className="m-0 mt-0.5 text-sm text-ink-muted">{items.length} {c.items} · {readyItems.length} {c.ready}</p>
          </div>
          <Button variant="ai" onClick={() => navigate('/content')}>{c.newPost}</Button>
        </div>

        {error && <p className="m-0 rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div className={cn('grid gap-4', !narrow && 'grid-cols-[minmax(0,1fr)_440px] items-start')}>
          <section className="flex min-w-0 flex-col gap-3">
            {narrow ? (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
                {(['all', ...STATUSES] as const).map(s => (
                  <Chip key={s} pressed={tab === s} onClick={() => setTab(s)} className="shrink-0">{c.tabs[s]} {counts[s]}</Chip>
                ))}
              </div>
            ) : (
              <Tabs value={tab} onChange={setTab} tabs={(['all', ...STATUSES] as const).map(s => ({
                id: s, label: <>{c.tabs[s]} <span className="ml-1 font-bold text-ink-muted">{counts[s]}</span></>,
              }))} />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block min-w-[220px] flex-1">
                <span className="sr-only">{c.search}</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <input className="fc-input" style={{ paddingLeft: 36 }} value={search} placeholder={c.search} onChange={e => setSearch(e.target.value)} />
              </label>
              <select className="fc-input w-auto" aria-label={c.allNetworks} value={network} onChange={e => setNetwork(e.target.value)}>
                <option value="all">{c.allNetworks}</option>
                {networks.map(n => <option key={n} value={n}>{CHANNEL_MAP[n]?.label ?? n}</option>)}
              </select>
              <select className="fc-input w-auto" aria-label={c.allFormats} value={format} onChange={e => setFormat(e.target.value)}>
                <option value="all">{c.allFormats}</option>
                {(['Post', 'Carousel', 'Video', 'Story'] as ContentFormat[]).map(f => <option key={f} value={f}>{FORMAT_MAP[f].label[L]}</option>)}
              </select>
              <select className="fc-input w-auto" aria-label={c.sort.recent} value={sort} onChange={e => setSort(e.target.value as Sort)}>
                {(Object.keys(c.sort) as Sort[]).map(s => <option key={s} value={s}>{c.sort[s]}</option>)}
              </select>
            </div>

            {(readyItems.length > 0 || readyOnly) && (
              <article className="fc-insight">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Spark className="shrink-0" />
                  <p className="fc-insight__text m-0 min-w-0 flex-1"><strong className="text-ink">{c.readyBanner(readyItems.length)}</strong> {c.readyBannerText}</p>
                  <Button variant="secondary" size="sm" onClick={() => setReadyOnly(r => !r)}>{readyOnly ? c.clearReady : c.showReady(readyItems.length)}</Button>
                </div>
              </article>
            )}

            {loading ? (
              <Card className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ink-muted" /></Card>
            ) : !items.length ? (
              <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <span className="fc-proposal__icon mb-1"><Spark /></span>
                <p className="m-0 text-[15px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{c.empty}</p>
                <p className="m-0 max-w-sm text-sm text-ink-muted">{c.emptyText}</p>
                <Button variant="ai" size="sm" className="mt-2" onClick={() => navigate('/content')}>{c.newPost}</Button>
              </Card>
            ) : !visible.length ? (
              <Card className="px-6 py-10 text-center text-sm text-ink-muted">{c.noMatch}</Card>
            ) : (
              <div className="flex flex-col gap-1.5">
                {paged.items.map(item => (
                  <Row key={item.id} item={item} c={c} lang={L} score={scores[item.id]} campaign={campaignName(item.campaign_id)}
                    selected={!narrow && item.id === selectedId} onClick={() => setSelectedId(item.id)} />
                ))}
                <PagerBar paged={paged} lang={L} className="pt-1.5" />
              </div>
            )}
          </section>

          {!narrow && (
            <div className="sticky top-4 min-w-0">
              {detail ?? <Card className="px-6 py-14 text-center text-sm text-ink-muted">{c.select}</Card>}
            </div>
          )}
        </div>
      </div>

      {narrow && selected && (
        <Sheet open onClose={() => setSelectedId(null)} closeLabel={c.close} title={selected.title || c.untitled}
          subtitle={[CHANNEL_MAP[selected.channel]?.label ?? selected.channel, FORMAT_MAP[toFormat(selected.format)].label[L]].join(' · ')}>
          {detail}
        </Sheet>
      )}
    </div>
  )
}

// ─── List row ─────────────────────────────────────────────────────────────────

function Row({ item, c, lang, score, campaign, selected, onClick }: {
  item: LibraryItem; c: Copy; lang: 'fr' | 'en'; score?: ScoreLevel; campaign?: string; selected: boolean; onClick: () => void
}) {
  const fmt = FORMAT_MAP[toFormat(item.format)]
  const date = item.created_at ? new Date(item.created_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' }) : ''
  return (
    <button onClick={onClick} aria-current={selected || undefined}
      className={cn('flex w-full items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-2.5 text-left text-ink transition-colors',
        selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface-card hover:border-line-strong')}>
      <NetworkMark network={item.channel} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{item.title || c.untitled}</span>
          {campaign && <Badge tone="brand" className="shrink-0">{campaign}</Badge>}
        </span>
        <span className="mt-px block truncate text-[13px] text-ink-muted">{firstLine(item)}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-muted">
          <fmt.icon className="h-3.5 w-3.5" aria-hidden="true" />{fmt.label[lang]}
          {date && <><span className="h-2.5 w-px bg-line-strong" aria-hidden="true" />{date}</>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge tone={STATUS_TONE[item.status]}>{c.status[item.status]}</Badge>
        {score && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: SCORE_COLOR[score] }}>
            <Spark className="h-[11px] w-[11px]" />{c.score[score]}
          </span>
        )}
      </span>
    </button>
  )
}

// ─── Detail ───────────────────────────────────────────────────────────────────

function Detail({ item, c, lang, score, campaign, canEdit, inSheet, onUpdate, onDelete, onSchedule, onAdapt }: {
  item: LibraryItem; c: Copy; lang: 'fr' | 'en'; score?: ScoreLevel; campaign?: string; canEdit: boolean
  // Inside the phone sheet, which already shows the title.
  inSheet?: boolean
  onUpdate: (changes: Partial<LibraryItem>) => Promise<void>; onDelete: () => Promise<void>
  onSchedule: () => void; onAdapt: (network: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: item.title, body: item.body, hashtags: item.hashtags, visual_idea: item.visual_idea })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [adapting, setAdapting] = useState(false)
  const [copied, setCopied] = useState(false)

  const fmt = FORMAT_MAP[toFormat(item.format)]
  const def = CHANNEL_MAP[item.channel]
  const text = itemText(item)
  const limit = CHANNEL_LIMITS[item.channel]
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB'
  const placeholders = [...new Set(text.match(PLACEHOLDER) ?? [])]
  const created = item.created_at ? new Date(item.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : ''

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await action() } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  const reviewNotes = [
    score ? c.reviewText[score] : '',
    limit ? `${c.chars(text.length.toLocaleString(locale), limit.toLocaleString(locale))}${text.length > limit ? ` ${c.overLimit}` : ''}` : '',
    placeholders.length ? c.placeholders(placeholders.join(', ')) : '',
  ].filter(Boolean).join(' ')

  const tools = (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button variant="ghost" size="sm" iconOnly icon={copied ? <Check className="text-success" /> : <Copy />} onClick={() => void copy()} aria-label={copied ? c.copied : c.copy} />
      <Button variant="secondary" size="sm" title={c.adaptTip} aria-expanded={adapting}
        className={cn(adapting && 'border-brand bg-brand-soft text-brand-ink')} onClick={() => setAdapting(a => !a)}>{c.adaptButton}</Button>
    </div>
  )

  return (
    <Card className={cn('flex flex-col overflow-hidden', inSheet && '-mx-5 -my-5 rounded-none border-0 bg-transparent shadow-none')}>
      <div className={cn('flex items-start gap-3 border-b border-line px-5 py-4', inSheet && 'hidden')}>
        <NetworkMark network={item.channel} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[18px] font-bold leading-6 text-ink" style={{ fontFamily: 'var(--font-display)' }}>{item.title || c.untitled}</h2>
          <p className="m-0 mt-0.5 text-[13px] text-ink-muted">{[def?.label ?? item.channel, fmt.label[lang], campaign, created && `${c.created} ${created}`].filter(Boolean).join(' · ')}</p>
        </div>
        {tools}
      </div>

      <div className="flex flex-col gap-3.5 px-5 py-4">
        {inSheet && <div className="-mb-1 flex justify-end">{tools}</div>}
        {adapting && (
          <div className="fc-field rounded-[var(--radius-md)] border border-line p-3">
            <span className="fc-label">{c.adapt}</span>
            <div role="group" aria-label={c.adapt} className="flex flex-wrap gap-1.5">
              {CHANNELS.slice(0, 7).filter(ch => ch.value !== item.channel).map(ch => (
                <Chip key={ch.value} icon={<ch.icon className="h-3.5 w-3.5" style={{ color: ch.color }} />} onClick={() => onAdapt(ch.value)}>{ch.label}</Chip>
              ))}
            </div>
            <span className="fc-hint">{c.adaptHint}</span>
          </div>
        )}
        <div className="fc-field">
          <span className="fc-label">{c.statusLabel}</span>
          <div role="radiogroup" aria-label={c.statusLabel} className="grid grid-cols-4 gap-1.5">
            {STATUSES.map(s => (
              <Chip key={s} pressed={item.status === s} disabled={!canEdit || busy} className="justify-center px-1.5"
                onClick={() => { if (item.status !== s) void run(() => onUpdate({ status: s })) }}>{c.status[s]}</Chip>
            ))}
          </div>
        </div>

        {(score || placeholders.length > 0 || (limit && text.length > limit)) && (
          <InsightCard kind={c.review} title={score ? c.score[score] : c.reviewPending}>{reviewNotes}</InsightCard>
        )}

        {editing ? (
          <>
            <TextField label={c.titleLabel} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <TextAreaField label={c.text} rows={10} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
              style={{ lineHeight: '21px', padding: '10px 12px', resize: 'vertical' }} />
            <TextField label={c.hashtags} value={form.hashtags} onChange={e => setForm({ ...form, hashtags: e.target.value })} />
            <TextAreaField label={c.visual} rows={3} value={form.visual_idea} onChange={e => setForm({ ...form, visual_idea: e.target.value })}
              style={{ padding: '8px 12px', resize: 'vertical' }} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setEditing(false); setForm({ title: item.title, body: item.body, hashtags: item.hashtags, visual_idea: item.visual_idea }) }}>{c.cancel}</Button>
              <Button variant="primary" loading={busy} onClick={() => void run(async () => {
                await onUpdate({ ...form, hook: form.body.split('\n').find(l => l.trim()) ?? '' })
                setEditing(false)
              })}>{c.save}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="fc-label">{c.text}</span>
                {canEdit && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>{c.edit}</Button>}
              </div>
              <p className="m-0 max-h-[340px] overflow-y-auto whitespace-pre-line rounded-[var(--radius-md)] bg-surface-sunken px-3.5 py-3 text-sm leading-[21px] text-ink">{item.body || '—'}</p>
              {item.hashtags.trim() && (
                <div className="flex flex-wrap gap-1.5">
                  {item.hashtags.trim().split(/\s+/).map(tag => <Badge key={tag} tone="info">{tag}</Badge>)}
                </div>
              )}
            </div>
            {item.visual_idea && (
              <div className="fc-field">
                <span className="fc-label">{c.visual}</span>
                <p className="m-0 text-[13px] leading-[19px] text-ink-muted">{item.visual_idea}</p>
              </div>
            )}
            {campaign && item.campaign_id && (
              <div className="flex flex-wrap gap-1.5">
                <Link to={`/campaigns/${item.campaign_id}`} className="fc-evidence"><Megaphone />{campaign}</Link>
              </div>
            )}
          </>
        )}

        {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-surface-sunken px-5 py-3">
        {canEdit && (
          <Button variant="danger" icon={<Trash2 />} disabled={busy}
            onClick={() => { if (window.confirm(c.confirmDelete)) void run(onDelete) }}>{c.delete}</Button>
        )}
        <span className="flex-1" />
        <Button variant="primary" icon={<Send />} disabled={busy || item.status === 'Archived'} onClick={onSchedule}>{c.schedule}</Button>
      </div>
    </Card>
  )
}
