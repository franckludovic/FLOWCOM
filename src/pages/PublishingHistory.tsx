import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  History, Search, ExternalLink, RefreshCw, ChevronDown, ChevronUp,
  CalendarDays, Filter, X, AlertCircle, Loader2, Globe, Sparkles, Wand2
} from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBuffer, bufferQuery } from '@/contexts/BufferContext'
import { callGroqJSON, buildGroqError } from '@/lib/groq'
import { buildAiContext } from '@/lib/aiContext'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
interface BufferPost {
  id: string
  text: string
  sentAt: string | null
  dueAt: string | null
  channelId: string
  channelName: string
  channelService: string
  channelAvatar: string | null
  assets: { source: string; thumbnail: string; mimeType: string }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SERVICE_COLORS: Record<string, string> = {
  instagram:      'from-purple-500 to-pink-500',
  facebook:       'bg-blue-600',
  twitter:        'bg-sky-500',
  linkedin:       'bg-blue-700',
  youtube:        'bg-red-600',
  tiktok:         'bg-zinc-900',
  pinterest:      'bg-red-500',
  googlebusiness: 'bg-green-600',
  mastodon:       'bg-indigo-600',
  bluesky:        'bg-sky-600',
  threads:        'bg-gray-700',
}

const SERVICE_LABELS: Record<string, string> = {
  instagram:      'Instagram',
  facebook:       'Facebook',
  twitter:        'X / Twitter',
  linkedin:       'LinkedIn',
  youtube:        'YouTube',
  tiktok:         'TikTok',
  pinterest:      'Pinterest',
  googlebusiness: 'Google Business',
  mastodon:       'Mastodon',
  bluesky:        'Bluesky',
  threads:        'Threads',
}

function ServiceIcon({ service, className }: { service: string; className?: string }) {
  const cls = cn('w-4 h-4 shrink-0', className)
  switch (service) {
    case 'instagram':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.326 3.608 1.301.975.975 1.24 2.242 1.301 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.326 2.633-1.301 3.608-.975.975-2.242 1.24-3.608 1.301-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.326-3.608-1.301-.975-.975-1.24-2.242-1.301-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.326-2.633 1.301-3.608C4.509 2.489 5.776 2.225 7.142 2.163 8.408 2.105 8.788 2.163 12 2.163zm0-2.163C8.756 0 8.332.014 7.052.072 4.01.209 1.419 1.631.417 4.42.072 5.7 0 6.124 0 12c0 5.876.072 6.3.417 7.58 1.002 2.789 3.593 4.211 6.635 4.348C8.332 23.986 8.756 24 12 24s3.668-.014 4.948-.072c3.042-.137 5.633-1.559 6.635-4.348.345-1.28.417-1.704.417-7.58 0-5.876-.072-6.3-.417-7.58C22.581 1.631 19.99.209 16.948.072 15.668.014 15.244 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
        </svg>
      )
    case 'twitter':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      )
    case 'facebook':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
      )
    case 'linkedin':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      )
    case 'youtube':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      )
    case 'tiktok':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
        </svg>
      )
    case 'pinterest':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
        </svg>
      )
    case 'bluesky':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/>
        </svg>
      )
    default:
      return <Globe className={cls} />
  }
}

function ServiceBadge({ service }: { service: string }) {
  const color = SERVICE_COLORS[service]
  const label = SERVICE_LABELS[service] ?? service
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white uppercase tracking-wide',
      color?.startsWith('from-') ? `bg-gradient-to-r ${color}` : (color ?? 'bg-gray-500')
    )}>
      <ServiceIcon service={service} className="w-3 h-3" />
      {label}
    </span>
  )
}

// ─── Date range ───────────────────────────────────────────────────────────────
type DateRange = '7d' | '30d' | '90d' | 'all'

function dateRangeStart(range: DateRange): Date | null {
  if (range === 'all') return null
  const d = new Date()
  d.setDate(d.getDate() - (range === '7d' ? 7 : range === '30d' ? 30 : 90))
  return d
}

// ─── Post card ────────────────────────────────────────────────────────────────
function PostCard({ post, lang }: { post: BufferPost; lang: string }) {
  const [expanded, setExpanded] = useState(false)
  const publishedAt = post.sentAt
    ? new Date(post.sentAt)
    : post.dueAt ? new Date(post.dueAt) : null

  return (
    <article className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4 sm:p-5">
        {/* Channel + Buffer link */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {post.channelAvatar ? (
              <img
                src={post.channelAvatar}
                alt={post.channelName}
                className="w-8 h-8 rounded-full shrink-0 object-cover ring-2 ring-[var(--color-border)]"
              />
            ) : (
              <div className={cn(
                'w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white',
                SERVICE_COLORS[post.channelService]?.startsWith('from-')
                  ? `bg-gradient-to-br ${SERVICE_COLORS[post.channelService]}`
                  : (SERVICE_COLORS[post.channelService] ?? 'bg-gray-500')
              )}>
                <ServiceIcon service={post.channelService} className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text)] truncate leading-tight">
                {post.channelName}
              </p>
              <ServiceBadge service={post.channelService} />
            </div>
          </div>

          <a
            href="https://publish.buffer.com/"
            target="_blank"
            rel="noopener noreferrer"
            title={lang === 'fr' ? 'Voir dans Buffer' : 'View in Buffer'}
            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-500 font-medium transition-colors shrink-0"
          >
            Buffer <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Post text */}
        <p className={cn(
          'text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-wrap',
          !expanded && 'line-clamp-4'
        )}>
          {post.text
            ? post.text
            : <span className="italic text-[var(--color-text-muted)]">
                {lang === 'fr' ? '(post media sans texte)' : '(media-only post)'}
              </span>
          }
        </p>

        {post.text.length > 200 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-1 flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-500 font-medium"
          >
            {expanded
              ? (lang === 'fr' ? 'Voir moins' : 'Show less')
              : (lang === 'fr' ? 'Voir plus' : 'Show more')
            }
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}

        {/* Asset thumbnails */}
        {post.assets.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {post.assets.map((asset, i) => (
              <img
                key={i}
                src={asset.thumbnail || asset.source}
                alt=""
                className="w-16 h-16 object-cover rounded-lg border border-[var(--color-border)] shrink-0 bg-[var(--color-bg)]"
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: publish date */}
      {publishedAt && (
        <div className="px-4 sm:px-5 pb-4">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            {publishedAt.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
        </div>
      )}
    </article>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PublishingHistoryPage() {
  const { lang } = useI18n()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const bufferToken = import.meta.env.VITE_BUFFER_API_KEY as string | undefined
  // Channels + orgId come from the shared context — already fetched, no extra request
  const { channels, orgId, error: bufferCtxError } = useBuffer()

  const [allPosts, setAllPosts] = useState<BufferPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasNextPage, setHasNextPage] = useState(false)
  const [endCursor, setEndCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // AI digest state
  const [digest, setDigest]             = useState<{ bullets: string[]; recommendation: string } | null>(null)
  const [digestLoading, setDigestLoading] = useState(false)
  const [digestError, setDigestError]   = useState('')
  const [digestOpen, setDigestOpen]     = useState(true)
  const digestFiredRef                  = useRef(false)

  // Show context-level Buffer errors (e.g. bad API key)
  useEffect(() => { if (bufferCtxError) setError(bufferCtxError) }, [bufferCtxError])

  // Filters — purely client-side, never trigger a network request
  const [search, setSearch] = useState('')
  const [activeChannelIds, setActiveChannelIds] = useState<string[]>([])
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>('30d')
  const [showFilters, setShowFilters] = useState(false)

  // ── Core fetch — only fetches POSTS (org+channels already in context) ──────
  const fetchPosts = useCallback(async (reset: boolean) => {
    if (!bufferToken) {
      setError(lang === 'fr' ? 'Clé API Buffer manquante.' : 'Missing Buffer API key.')
      return
    }
    if (!orgId) {
      // orgId not ready yet (context still loading) — will retry via useEffect below
      return
    }

    reset ? setLoading(true) : setLoadingMore(true)
    if (reset) { setError(''); setAllPosts([]); setEndCursor(null); setHasNextPage(false) }

    try {
      const channelMap = new Map(channels.map(c => [c.id, c]))
      const allChannelIds = Array.from(channelMap.keys())
      if (allChannelIds.length === 0) { setLoading(false); setLoadingMore(false); return }

      const cursor = reset ? null : endCursor
      const pd = await bufferQuery(bufferToken,
        `query Posts($first: Int!, $after: String, $input: PostsInput!) {
          posts(first: $first, after: $after, input: $input) {
            edges {
              node {
                id text dueAt sentAt channelId
                assets { source thumbnail mimeType }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        {
          first: 50,
          after: cursor,
          input: { organizationId: orgId, filter: { status: ['sent'], channelIds: allChannelIds } },
        }
      )

      const edges: any[] = pd?.posts?.edges ?? []
      const pageInfo = pd?.posts?.pageInfo

      const newPosts: BufferPost[] = edges.map(({ node }: any) => {
        const ch = channelMap.get(node.channelId)
        return {
          id: node.id,
          text: node.text ?? '',
          dueAt: node.dueAt ?? null,
          sentAt: node.sentAt ?? null,
          channelId: node.channelId,
          channelName: ch?.name ?? node.channelId,
          channelService: ch?.service ?? 'unknown',
          channelAvatar: ch?.avatar ?? null,
          assets: node.assets ?? [],
        }
      })

      setAllPosts(prev => reset ? newPosts : [...prev, ...newPosts])
      setHasNextPage(pageInfo?.hasNextPage ?? false)
      setEndCursor(pageInfo?.endCursor ?? null)
    } catch (e: any) {
      setError(lang === 'fr' ? `Erreur Buffer : ${e.message}` : `Buffer error: ${e.message}`)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [bufferToken, lang, orgId, channels]) // eslint-disable-line react-hooks/exhaustive-deps
  // endCursor intentionally omitted — stale closure is fine for cursor-based pagination

  // Fetch posts once orgId is available (context finishes loading)
  useEffect(() => {
    if (orgId) fetchPosts(true)
  }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => fetchPosts(false), [fetchPosts])

  // ── AI digest — fires once when posts first load (≥5 posts needed) ────────
  useEffect(() => {
    if (digestFiredRef.current) return
    if (allPosts.length < 5) return
    if (!apiKeyConfigured) return
    digestFiredRef.current = true

    const run = async () => {
      setDigestLoading(true)
      setDigestError('')
      try {
        // Take up to 15 most recent posts as text samples
        const sample = allPosts.slice(0, 15).map((p, i) =>
          `Post ${i + 1} [${p.channelService} · ${p.sentAt ? new Date(p.sentAt).toLocaleDateString() : '?'}]: ${p.text.slice(0, 200)}`
        ).join('\n\n')

        const ctx = buildAiContext({ company: activeCompany, products, segments, keyMessages })

        const result = await callGroqJSON<{ bullets: string[]; recommendation: string }>('', [
          {
            role: 'system',
            content: `You are a social media analyst. Analyze these recent published posts and identify patterns. Return JSON exactly matching: {"bullets":["string","string","string"],"recommendation":"string"}. The bullets array must have exactly 3 short observations (max 12 words each) about: topics covered, channels used, and content style/format patterns. The recommendation must be one concrete actionable sentence (max 20 words). Base everything only on the posts provided — do not invent data.\nBrand context:\n${ctx}`,
          },
          { role: 'user', content: `Analyze these ${allPosts.slice(0, 15).length} recent published posts:\n\n${sample}` },
        ], { temperature: 0.3, max_tokens: 300, requiredKeys: ['bullets', 'recommendation'] })

        if (Array.isArray(result.bullets) && result.bullets.length === 3 && result.recommendation) {
          setDigest(result)
        }
      } catch (e: any) {
        const key = buildGroqError(e)
        if (key !== 'error.noKey') setDigestError(lang === 'fr' ? 'Analyse IA indisponible.' : 'AI analysis unavailable.')
      } finally {
        setDigestLoading(false)
      }
    }
    run()
  }, [allPosts.length, apiKeyConfigured]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Channels that actually appear in fetched posts (for filter chips) ─────
  const channelsWithPosts = useMemo(() => {
    const ids = new Set(allPosts.map(p => p.channelId))
    return channels.filter(c => ids.has(c.id))
  }, [channels, allPosts])

  // ── Client-side filtered view ─────────────────────────────────────────────
  const rangeStart = useMemo(() => dateRangeStart(selectedDateRange), [selectedDateRange])

  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allPosts.filter(post => {
      // Channel filter
      if (activeChannelIds.length > 0 && !activeChannelIds.includes(post.channelId)) return false
      // Date range filter (uses sentAt first, fallback to dueAt)
      const ts = post.sentAt ?? post.dueAt
      if (rangeStart && ts && new Date(ts) < rangeStart) return false
      // Text search
      if (q && !post.text.toLowerCase().includes(q) && !post.channelName.toLowerCase().includes(q)) return false
      return true
    })
  }, [allPosts, activeChannelIds, rangeStart, search])

  // ── Summary stats (over filtered view) ───────────────────────────────────
  const stats = useMemo(() => ({
    total: filteredPosts.length,
    channels: new Set(filteredPosts.map(p => p.channelId)).size,
  }), [filteredPosts])

  // ── Filter helpers ────────────────────────────────────────────────────────
  const toggleChannel = (id: string) =>
    setActiveChannelIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  const clearFilters = () => { setActiveChannelIds([]); setSelectedDateRange('30d'); setSearch('') }

  const hasActiveFilters = activeChannelIds.length > 0 || selectedDateRange !== '30d' || search.trim() !== ''

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden p-4 sm:p-6 gap-4">

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
            <History className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">
              {lang === 'fr' ? 'Historique de publication' : 'Publishing History'}
            </h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              {lang === 'fr'
                ? 'Tous vos posts publiés via Buffer, en temps réel.'
                : 'All posts published via Buffer, pulled live.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchPosts(true)}
            disabled={loading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors',
              loading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            {lang === 'fr' ? 'Actualiser' : 'Refresh'}
          </button>

          <a
            href="https://publish.buffer.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {lang === 'fr' ? 'Ouvrir Buffer' : 'Open Buffer'}
          </a>
        </div>
      </header>

      {/* Stats */}
      {!loading && allPosts.length > 0 && (
        <div className="flex flex-wrap gap-3 shrink-0">
          {[
            { label: lang === 'fr' ? 'Publications' : 'Posts sent',     value: stats.total },
            { label: lang === 'fr' ? 'Canaux actifs' : 'Active channels', value: stats.channels },
          ].map(s => (
            <div key={s.label} className="flex items-baseline gap-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2">
              <span className="text-base font-bold text-[var(--color-text)]">{s.value}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI digest panel */}
      {(digestLoading || digest || digestError) && !loading && (
        <div className="shrink-0 rounded-2xl border border-purple-200 dark:border-purple-900 bg-purple-50/60 dark:bg-purple-950/20 overflow-hidden">
          <button
            onClick={() => setDigestOpen(o => !o)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center shrink-0">
              {digestLoading
                ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                : <Sparkles className="w-3.5 h-3.5 text-white" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                {lang === 'fr' ? 'Analyse IA de vos publications' : 'AI digest of your posts'}
              </p>
              {digestLoading && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {lang === 'fr' ? 'Analyse en cours…' : 'Analysing your posts…'}
                </p>
              )}
            </div>
            {!digestLoading && (digest || digestError) && (
              digestOpen
                ? <ChevronUp className="w-4 h-4 text-purple-500 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-purple-500 shrink-0" />
            )}
          </button>

          {digestOpen && !digestLoading && digest && (
            <div className="px-4 pb-4 space-y-3">
              <ul className="space-y-1.5">
                {digest.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text)]">
                    <span className="text-purple-500 shrink-0 mt-0.5">✦</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-start gap-2 p-3 rounded-xl bg-purple-100/60 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <Wand2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                  {digest.recommendation}
                </p>
              </div>
            </div>
          )}

          {digestOpen && digestError && (
            <p className="px-4 pb-3 text-xs text-[var(--color-text-muted)] italic">{digestError}</p>
          )}
        </div>
      )}

      {/* Search + filters row */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={lang === 'fr' ? 'Rechercher un post...' : 'Search posts...'}
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" />
            </button>
          )}
        </div>

        {/* Date range */}
        <select
          value={selectedDateRange}
          onChange={e => setSelectedDateRange(e.target.value as DateRange)}
          className="px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="7d">{lang === 'fr' ? '7 derniers jours' : 'Last 7 days'}</option>
          <option value="30d">{lang === 'fr' ? '30 derniers jours' : 'Last 30 days'}</option>
          <option value="90d">{lang === 'fr' ? '90 derniers jours' : 'Last 90 days'}</option>
          <option value="all">{lang === 'fr' ? "Tout l'historique" : 'All time'}</option>
        </select>

        {/* Channel filter toggle */}
        <button
          onClick={() => setShowFilters(f => !f)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors',
            showFilters || activeChannelIds.length > 0
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          {lang === 'fr' ? 'Canaux' : 'Channels'}
          {activeChannelIds.length > 0 && (
            <span className="ml-1 w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">
              {activeChannelIds.length}
            </span>
          )}
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors"
          >
            <X className="w-3 h-3" />
            {lang === 'fr' ? 'Effacer' : 'Clear'}
          </button>
        )}
      </div>

      {/* Channel filter chips */}
      {showFilters && channelsWithPosts.length > 0 && (
        <div className="flex flex-wrap gap-2 shrink-0 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
          <p className="w-full text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
            {lang === 'fr' ? 'Filtrer par canal' : 'Filter by channel'}
          </p>
          {channelsWithPosts.map(ch => {
            const active = activeChannelIds.includes(ch.id)
            return (
              <button
                key={ch.id}
                onClick={() => toggleChannel(ch.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all',
                  active
                    ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                    : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] hover:border-emerald-400'
                )}
              >
                {ch.avatar
                  ? <img src={ch.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                  : <ServiceIcon service={ch.service} className="w-4 h-4" />
                }
                <span>{ch.name}</span>
                <span className={cn('text-[10px] uppercase tracking-wide', active ? 'text-emerald-100' : 'text-[var(--color-text-muted)]')}>
                  {SERVICE_LABELS[ch.service] ?? ch.service}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400 shrink-0">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Post list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            <p className="text-sm text-[var(--color-text-muted)]">
              {lang === 'fr' ? 'Chargement depuis Buffer…' : 'Loading from Buffer…'}
            </p>
          </div>
        ) : !error && filteredPosts.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <History className="w-10 h-10 mx-auto text-[var(--color-text-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-text-muted)]">
              {allPosts.length === 0
                ? (lang === 'fr' ? 'Aucun post publié trouvé dans Buffer.' : 'No sent posts found in Buffer.')
                : (lang === 'fr' ? 'Aucun post ne correspond aux filtres.' : 'No posts match the current filters.')
              }
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-emerald-600 hover:underline">
                {lang === 'fr' ? 'Réinitialiser les filtres' : 'Reset filters'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4 pb-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredPosts.map(post => (
                <PostCard key={post.id} post={post} lang={lang} />
              ))}
            </div>

            {/* Load more- only shown when not currently filtered to a subset */}
            {hasNextPage && !hasActiveFilters && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className={cn(
                    'flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors',
                    loadingMore && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {loadingMore
                    ? <><Loader2 className="w-4 h-4 animate-spin" />{lang === 'fr' ? 'Chargement…' : 'Loading…'}</>
                    : (lang === 'fr' ? 'Charger plus de posts' : 'Load more posts')
                  }
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
