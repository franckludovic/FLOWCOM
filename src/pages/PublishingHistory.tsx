import { useEffect, useState } from 'react'
import { CalendarDays, FileText, History, Search } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { supabase } from '@/lib/supabase'

interface PublishedPost {
  id: string
  title: string
  body: string
  channel: string
  format: string
  created_at: string
  publish_date: string | null
}

export default function PublishingHistoryPage() {
  const { lang } = useI18n()
  const { activeCompany } = useCompany()
  const [posts, setPosts] = useState<PublishedPost[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const loadPosts = async () => {
      if (!activeCompany) { setPosts([]); setLoading(false); return }
      setLoading(true)
      const { data } = await supabase
        .from('library_items')
        .select('id, title, body, channel, format, created_at, publish_date')
        .eq('company_id', activeCompany.id)
        .eq('status', 'Published')
        .order('publish_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setPosts(data ?? [])
        setLoading(false)
      }
    }
    loadPosts()
    return () => { cancelled = true }
  }, [activeCompany?.id])

  const filteredPosts = posts.filter(post => {
    const query = search.trim().toLowerCase()
    return !query || `${post.title} ${post.body} ${post.channel} ${post.format}`.toLowerCase().includes(query)
  })

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 sm:p-6 gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
            <History className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">{lang === 'fr' ? 'Historique de publication' : 'Publishing History'}</h1>
            <p className="text-xs text-[var(--color-text-muted)]">{lang === 'fr' ? 'Tous vos posts publiés via FlowCom.' : 'Every post published through FlowCom.'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
          <span><strong className="text-[var(--color-text)]">{posts.length}</strong> {lang === 'fr' ? 'publications' : 'published posts'}</span>
          <span><strong className="text-[var(--color-text)]">{new Set(posts.map(post => post.channel)).size}</strong> {lang === 'fr' ? 'canaux' : 'channels'}</span>
        </div>
      </header>

      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder={lang === 'fr' ? 'Rechercher une publication...' : 'Search published posts...'}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="py-20 text-center text-sm text-[var(--color-text-muted)]">{lang === 'fr' ? 'Chargement...' : 'Loading history...'}</div>
        ) : filteredPosts.length === 0 ? (
          <div className="py-20 text-center text-sm text-[var(--color-text-muted)]">{lang === 'fr' ? 'Aucune publication trouvée.' : 'No published posts found.'}</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-6">
            {filteredPosts.map(post => (
              <article key={post.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-[var(--color-text)] truncate">{post.title || 'Untitled post'}</h2>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--color-text-muted)] uppercase">
                      <span>{post.channel}</span><span>·</span><span>{post.format}</span>
                    </div>
                  </div>
                  <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                </div>
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap line-clamp-5">{post.body}</p>
                <div className="flex items-center gap-1.5 mt-4 text-xs text-[var(--color-text-muted)]">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {new Date(post.publish_date ?? post.created_at).toLocaleDateString()}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
