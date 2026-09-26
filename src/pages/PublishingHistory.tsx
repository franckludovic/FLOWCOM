import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Clapperboard, Image as ImageIcon, Loader2, Plus, RefreshCw, Search } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBuffer, bufferQuery, type BufferChannel } from '@/contexts/BufferContext'
import { callModelJSON } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'
import { listCampaignPostIds } from '@/lib/campaigns'
import { useCampaignOptions } from '@/lib/campaignContext'
import { CHANNEL_MAP } from '@/lib/channels'
import { Button, Card, Chip, PagerBar, Spark, Tabs, usePaged } from '@/components/ui'
import { cn } from '@/lib/utils'

type Status = 'scheduled' | 'sent' | 'error'
type Period = '7d' | '30d' | '90d' | 'all'

interface Post {
  id: string
  text: string
  at: string | null
  channel: BufferChannel | undefined
  channelId: string
  assets: { source: string; thumbnail: string; mimeType: string }[]
  error: string
}

interface TabState {
  posts: Post[]
  loading: boolean
  loaded: boolean
  // Buffer refused this status: the tab is hidden rather than shown empty.
  unavailable: boolean
  cursor: string | null
  hasMore: boolean
}

const EMPTY_TAB: TabState = { posts: [], loading: false, loaded: false, unavailable: false, cursor: null, hasMore: false }
const DIGEST_HIDDEN_KEY = 'flowcom:history-digest-hidden'

const COPY = {
  fr: {
    title: 'Publications', subtitle: 'Ce qui va être publié, ce qui est parti, et ce qui a échoué',
    refresh: 'Actualiser', newPost: 'Nouveau post',
    tabs: { scheduled: 'Programmés', sent: 'Publiés', error: 'Échecs' } as Record<Status, string>,
    search: 'Rechercher un post', allDates: 'Toutes les dates',
    periods: { '7d': '7 derniers jours', '30d': '30 derniers jours', '90d': '90 derniers jours', all: "Tout l'historique" } as Record<Period, string>,
    today: "Aujourd'hui", yesterday: 'Hier', tomorrow: 'Demain',
    image: 'Image', video: 'Vidéo', noText: '(post sans texte)', failedNoReason: "Ce post n'a pas pu être publié.",
    reuse: 'Réutiliser', retry: 'Réessayer',
    more: 'Afficher plus', loading: 'Chargement des publications…',
    empty: { scheduled: 'Rien de programmé pour le moment.', sent: 'Aucun post publié sur cette période.', error: 'Aucun échec, tout est parti.' } as Record<Status, string>,
    noMatch: 'Aucun post ne correspond à ces filtres.', clear: 'Effacer les filtres',
    noBuffer: 'Aucun compte de réseau social n’est connecté pour le moment. Contactez votre gestionnaire FlowCom.', unavailable: 'Les publications sont momentanément indisponibles. Si cela dure, contactez votre gestionnaire FlowCom.',
    digestOn: (n: number) => `Sur ${n} posts :`, hide: 'Masquer', showDigest: "Voir l'analyse de l'IA",
  },
  en: {
    title: 'Publications', subtitle: 'What will be published, what went out, and what failed',
    refresh: 'Refresh', newPost: 'New post',
    tabs: { scheduled: 'Scheduled', sent: 'Published', error: 'Failed' } as Record<Status, string>,
    search: 'Search a post', allDates: 'All dates',
    periods: { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' } as Record<Period, string>,
    today: 'Today', yesterday: 'Yesterday', tomorrow: 'Tomorrow',
    image: 'Image', video: 'Video', noText: '(post without text)', failedNoReason: 'This post could not be published.',
    reuse: 'Reuse', retry: 'Retry',
    more: 'Show more', loading: 'Loading publications…',
    empty: { scheduled: 'Nothing scheduled yet.', sent: 'No post published in this period.', error: 'No failures, everything went out.' } as Record<Status, string>,
    noMatch: 'No post matches these filters.', clear: 'Clear filters',
    noBuffer: 'No social media account is connected yet. Contact your FlowCom manager.', unavailable: 'Publications are unavailable right now. If it lasts, contact your FlowCom manager.',
    digestOn: (n: number) => `Across ${n} posts:`, hide: 'Hide', showDigest: 'Show the AI analysis',
  },
}
type Copy = typeof COPY.fr

const networkOf = (channel?: BufferChannel) => {
  const s = channel?.service.toLowerCase() ?? ''
  return s === 'x' ? 'twitter' : s
}

const POST_FIELDS = 'id text dueAt sentAt channelId assets { source thumbnail mimeType }'

export default function PublishingHistoryPage() {
  const { lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const locale = L === 'fr' ? 'fr-FR' : 'en-GB'
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const { channels, orgId, loading: loadingChannels, error: bufferError } = useBuffer()
  const { campaigns } = useCampaignOptions(activeCompany?.id)
  const navigate = useNavigate()

  const [tab, setTab] = useState<Status>('sent')
  const [data, setData] = useState<Record<Status, TabState>>({ scheduled: EMPTY_TAB, sent: EMPTY_TAB, error: EMPTY_TAB })
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>('30d')
  const [accountFilter, setAccountFilter] = useState<string[]>([])
  const [campaignOf, setCampaignOf] = useState<Record<string, string>>({})

  // The publishing service's own errors are for FlowCom's team, not the client.
  useEffect(() => { if (bufferError) { console.warn('Publishing service:', bufferError); setError(c.unavailable) } }, [bufferError]) // eslint-disable-line react-hooks/exhaustive-deps

  const channelMap = useMemo(() => new Map(channels.map(ch => [ch.id, ch])), [channels])

  const fetchStatus = useCallback(async (status: Status, reset: boolean) => {
    if (!activeCompany || !orgId || !channels.length) return
    const cursor = reset ? null : data[status].cursor
    setData(prev => ({ ...prev, [status]: { ...prev[status], loading: true, ...(reset ? { posts: [], cursor: null, hasMore: false } : {}) } }))
    const run = (fields: string) => bufferQuery(activeCompany.id,
      `query Posts($first: Int!, $after: String, $input: PostsInput!) {
        posts(first: $first, after: $after, input: $input) {
          edges { node { ${fields} } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { first: 50, after: cursor, input: { organizationId: orgId, filter: { status: [status], channelIds: channels.map(ch => ch.id) } } })
    try {
      let result
      // Failed posts carry Buffer's reason when the API offers it; fall back without it.
      try { result = await run(status === 'error' ? `${POST_FIELDS} error { message }` : POST_FIELDS) }
      catch (first) { if (status !== 'error') throw first; result = await run(POST_FIELDS) }
      type Node = { id: string; text?: string; dueAt?: string; sentAt?: string; channelId: string; assets?: Post['assets']; error?: { message?: string } }
      const edges: Array<{ node: Node }> = result?.posts?.edges ?? []
      const posts: Post[] = edges.map(({ node }) => ({
        id: node.id,
        text: node.text ?? '',
        at: (status === 'sent' ? node.sentAt ?? node.dueAt : node.dueAt ?? node.sentAt) ?? null,
        channel: channelMap.get(node.channelId),
        channelId: node.channelId,
        assets: node.assets ?? [],
        error: node.error?.message ?? '',
      }))
      setData(prev => ({
        ...prev,
        [status]: {
          posts: reset ? posts : [...prev[status].posts, ...posts],
          loading: false, loaded: true, unavailable: false,
          cursor: result?.posts?.pageInfo?.endCursor ?? null, hasMore: Boolean(result?.posts?.pageInfo?.hasNextPage),
        },
      }))
    } catch (err) {
      // "sent" always works; another status Buffer refuses just hides its tab.
      if (status === 'sent') { console.warn('Publishing service:', err); setError(c.unavailable) }
      setData(prev => ({ ...prev, [status]: { ...EMPTY_TAB, loaded: true, unavailable: status !== 'sent' } }))
    }
  }, [activeCompany, orgId, channels, channelMap, data, L])

  const refresh = useCallback(() => {
    setError('')
    for (const status of ['sent', 'scheduled', 'error'] as Status[]) void fetchStatus(status, true)
  }, [fetchStatus])

  // Load every tab once Buffer's accounts are known, so the counts show at once.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !orgId || !channels.length) return
    started.current = true
    refresh()
  }, [orgId, channels.length, refresh])

  // Which campaign each Buffer post belongs to, from FlowCom's timeline.
  useEffect(() => {
    let alive = true
    if (!campaigns.length) return
    Promise.all(campaigns.map(cp => listCampaignPostIds(cp.id).then(ids => ids.map(id => [id, cp.name] as const)).catch(() => [])))
      .then(lists => { if (alive) setCampaignOf(Object.fromEntries(lists.flat())) })
    return () => { alive = false }
  }, [campaigns])

  // If the tab you are on turns out unavailable, fall back to Published.
  useEffect(() => { if (data[tab].unavailable) setTab('sent') }, [data, tab])

  const current = data[tab]
  const since = useMemo(() => {
    if (tab === 'scheduled' || period === 'all') return null
    const d = new Date()
    d.setDate(d.getDate() - (period === '7d' ? 7 : period === '30d' ? 30 : 90))
    return d
  }, [period, tab])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return current.posts
      .filter(p => !accountFilter.length || accountFilter.includes(p.channelId))
      .filter(p => !since || !p.at || new Date(p.at) >= since)
      .filter(p => !q || p.text.toLowerCase().includes(q) || (p.channel?.name ?? '').toLowerCase().includes(q))
      .sort((a, b) => (tab === 'scheduled' ? (a.at ?? '').localeCompare(b.at ?? '') : (b.at ?? '').localeCompare(a.at ?? '')))
  }, [current.posts, accountFilter, since, search, tab])

  const paged = usePaged(visible, [tab, search, period, accountFilter.join(',')].join('|'))
  const groups = useMemo(() => {
    const map = new Map<string, Post[]>()
    for (const post of paged.items) {
      const key = post.at ? post.at.slice(0, 10) : 'none'
      map.set(key, [...(map.get(key) ?? []), post])
    }
    return [...map.entries()]
  }, [paged.items])

  const dayLabel = (key: string) => {
    if (key === 'none') return '—'
    const day = new Date(`${key}T00:00:00`)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const diff = Math.round((day.getTime() - today.getTime()) / 86400000)
    const full = day.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })
    if (diff === 0) return `${c.today} · ${full}`
    if (diff === -1) return `${c.yesterday} · ${full}`
    if (diff === 1) return `${c.tomorrow} · ${full}`
    return full
  }

  const accountsInTab = useMemo(() => {
    const ids = new Set(current.posts.map(p => p.channelId))
    return channels.filter(ch => ids.has(ch.id))
  }, [channels, current.posts])

  const filtered = accountFilter.length > 0 || search.trim() !== '' || (tab !== 'scheduled' && period !== '30d')
  const clearFilters = () => { setAccountFilter([]); setSearch(''); setPeriod('30d') }
  const reuse = (post: Post) => navigate(`/studio?${new URLSearchParams({ text: post.text }).toString()}`)
  const tabsShown = (['scheduled', 'sent', 'error'] as Status[]).filter(s => !data[s].unavailable)
  const countLabel = (s: Status) => (data[s].loaded ? `${data[s].posts.length}${data[s].hasMore ? '+' : ''}` : '…')

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-3.5 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
            <p className="m-0 mt-0.5 text-sm text-ink-muted">{c.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="ghost" size="sm" icon={<RefreshCw className={cn(tabsShown.some(s => data[s].loading) && 'animate-spin')} />} onClick={refresh}
              disabled={!orgId || tabsShown.some(s => data[s].loading)}>{c.refresh}</Button>
            <Link to="/studio" className="fc-btn fc-btn--primary fc-btn--sm"><Plus />{c.newPost}</Link>
          </div>
        </div>

        <Tabs value={tab} onChange={setTab} tabs={tabsShown.map(s => ({
          id: s, label: <>{c.tabs[s]} <span className={cn('ml-1 font-bold', s === 'error' && data.error.posts.length ? 'text-danger' : 'text-ink-muted')}>{countLabel(s)}</span></>,
        }))} />

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">{c.search}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input className="fc-input" style={{ paddingLeft: 34 }} value={search} placeholder={c.search} onChange={e => setSearch(e.target.value)} />
          </label>
          {tab !== 'scheduled' && (
            <select className="fc-input w-auto" aria-label={c.periods['30d']} value={period} onChange={e => setPeriod(e.target.value as Period)}>
              {(Object.keys(c.periods) as Period[]).map(p => <option key={p} value={p}>{c.periods[p]}</option>)}
            </select>
          )}
          {accountsInTab.length > 1 && <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />}
          {accountsInTab.length > 1 && accountsInTab.map(ch => {
            const def = CHANNEL_MAP[networkOf(ch)]
            const on = accountFilter.includes(ch.id)
            return (
              <Chip key={ch.id} pressed={on} icon={def ? <def.icon className="h-3.5 w-3.5" style={{ color: def.color }} /> : undefined}
                onClick={() => setAccountFilter(f => (on ? f.filter(x => x !== ch.id) : [...f, ch.id]))}>{ch.name}</Chip>
            )
          })}
          {filtered && <Button variant="ghost" size="sm" onClick={clearFilters}>{c.clear}</Button>}
        </div>

        {error && (
          <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-[13px] text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </p>
        )}

        {tab === 'sent' && <Digest posts={data.sent.posts} c={c} companyReady={Boolean(activeCompany) && apiKeyConfigured}
          context={() => buildAiContext({ company: activeCompany, products, segments, keyMessages })} companyId={activeCompany?.id ?? ''} lang={L} />}

        {!loadingChannels && !channels.length ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm text-ink-muted">
            {c.noBuffer}
          </Card>
        ) : current.loading && !current.posts.length ? (
          <Card className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />{c.loading}</Card>
        ) : !visible.length ? (
          <Card className="flex flex-col items-center gap-2 py-14 text-center text-sm text-ink-muted">
            {current.posts.length ? c.noMatch : c.empty[tab]}
            {filtered && <Button variant="ghost" size="sm" onClick={clearFilters}>{c.clear}</Button>}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {groups.map(([key, posts]) => (
              <section key={key}>
                <h2 className="m-0 border-b border-line bg-surface-sunken px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted first-letter:uppercase">{dayLabel(key)}</h2>
                {posts.map(post => (
                  <Row key={post.id} post={post} status={tab} c={c} locale={locale} campaign={campaignOf[post.id]} onReuse={() => reuse(post)} />
                ))}
              </section>
            ))}
            <PagerBar paged={paged} lang={L} className="border-t border-line px-3.5 py-2.5" />
            {current.hasMore && paged.page === paged.pageCount && (
              <div className="flex justify-center border-t border-line p-3">
                <Button variant="ghost" size="sm" loading={current.loading} onClick={() => void fetchStatus(tab, false)}>{c.more}</Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── One post ─────────────────────────────────────────────────────────────────

function Row({ post, status, c, locale, campaign, onReuse }: {
  post: Post; status: Status; c: Copy; locale: string; campaign?: string; onReuse: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const def = CHANNEL_MAP[networkOf(post.channel)]
  const time = post.at ? new Date(post.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''
  const video = post.assets.some(a => a.mimeType?.startsWith('video'))
  const thumb = post.assets.find(a => a.thumbnail || a.source)
  const long = post.text.length > 160
  const name = post.channel?.name ?? post.channelId

  return (
    <div className="grid grid-cols-[44px_28px_minmax(0,1fr)] items-start gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[52px_28px_minmax(0,1fr)_auto]">
      <span className="text-[12px] font-semibold leading-5 text-ink-muted tabular-nums">{time}</span>
      <span className="relative h-7 w-7">
        {post.channel?.avatar
          ? <img src={post.channel.avatar} alt="" className="h-7 w-7 rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
          : <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-sunken text-[11px] font-bold text-ink-muted">{name.replace('@', '').charAt(0).toUpperCase()}</span>}
        {def && <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-surface-card"><def.icon className="h-2.5 w-2.5" style={{ color: def.color }} /></span>}
      </span>
      <div className="min-w-0">
        <p className={cn('m-0 whitespace-pre-line text-[13px] leading-[19px] text-ink', !expanded && 'line-clamp-2')}>
          {post.text || <span className="italic text-ink-muted">{c.noText}</span>}
        </p>
        {long && (
          <button onClick={() => setExpanded(e => !e)} className="text-[12px] font-semibold text-ink-muted hover:text-ink">
            {expanded ? (c === COPY.fr ? 'Voir moins' : 'Show less') : (c === COPY.fr ? 'Voir plus' : 'Show more')}
          </button>
        )}
        <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-muted">
          <span>{name}</span>
          {post.assets.length > 0 && (
            <span className="inline-flex items-center gap-1">{video ? <Clapperboard className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}{video ? c.video : c.image}{post.assets.length > 1 ? ` ×${post.assets.length}` : ''}</span>
          )}
          {campaign && <span>· {campaign}</span>}
        </p>
        {status === 'error' && <p className="m-0 mt-1 text-[12px] font-semibold text-danger">{post.error || c.failedNoReason}</p>}
        <div className="mt-1.5 flex items-center gap-1 sm:hidden">
          <Actions status={status} c={c} onReuse={onReuse} />
        </div>
      </div>
      <div className="hidden items-center gap-1 sm:flex">
        {thumb && !video && <img src={thumb.thumbnail || thumb.source} alt="" className="h-10 w-10 rounded-[var(--radius-sm)] border border-line object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
        <Actions status={status} c={c} onReuse={onReuse} />
      </div>
    </div>
  )
}

function Actions({ status, c, onReuse }: { status: Status; c: Copy; onReuse: () => void }) {
  return <Button variant="ghost" size="sm" onClick={onReuse}>{status === 'error' ? c.retry : c.reuse}</Button>
}

// ─── AI analysis of what went out ─────────────────────────────────────────────

function Digest({ posts, c, companyReady, context, companyId, lang }: {
  posts: Post[]; c: Copy; companyReady: boolean; context: () => string; companyId: string; lang: 'fr' | 'en'
}) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DIGEST_HIDDEN_KEY) === '1' } catch { return false } })
  const [text, setText] = useState<{ fr: string; en: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const fired = useRef(false)

  useEffect(() => {
    if (hidden || fired.current || !companyReady || posts.length < 5) return
    fired.current = true
    setLoading(true)
    const sample = posts.slice(0, 20).map((p, i) =>
      `Post ${i + 1} [${p.channel?.service ?? '?'} · ${p.at?.slice(0, 10) ?? '?'} · ${p.assets.some(a => a.mimeType?.startsWith('video')) ? 'video' : p.assets.length ? 'image' : 'text'}]: ${p.text.slice(0, 200)}`).join('\n')
    callModelJSON<{ summary_fr: string; summary_en: string }>(companyId, [
      { role: 'system', content: `You are a social media analyst. From the published posts below, write ONE short paragraph (max 45 words) per language: the main pattern (networks, topics, formats, rhythm) with the numbers you can count, then one concrete tip for the coming week. Return JSON {"summary_fr":"string","summary_en":"string"}. Use only the posts given; never invent data.\nBrand context:\n${context()}` },
      { role: 'user', content: sample },
    ], { temperature: 0.3, max_tokens: 400, requiredKeys: ['summary_fr', 'summary_en'] })
      .then(r => { if (r.summary_fr && r.summary_en) setText({ fr: r.summary_fr, en: r.summary_en }) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [hidden, companyReady, posts, companyId, context])

  const setHide = (value: boolean) => {
    setHidden(value)
    try { localStorage.setItem(DIGEST_HIDDEN_KEY, value ? '1' : '0') } catch { /* storage unavailable */ }
  }

  if (hidden) {
    return posts.length >= 5 && companyReady
      ? <button onClick={() => setHide(false)} className="inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-ink-muted hover:text-ink"><Spark className="h-3.5 w-3.5" />{c.showDigest}</button>
      : null
  }
  if (!loading && !text) return null
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-line bg-surface-card px-3.5 py-2.5 text-[13px] leading-[19px]">
      <Spark className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="m-0 min-w-0 flex-1 text-ink-muted">
        {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /></span>
          : <><strong className="text-ink">{c.digestOn(Math.min(posts.length, 20))}</strong> {text![lang]}</>}
      </p>
      <Button variant="ghost" size="sm" onClick={() => setHide(true)}>{c.hide}</Button>
    </div>
  )
}
