import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookMarked, Search, Filter, Trash2, Edit2, Save, Copy, Send, Wand2
} from 'lucide-react'
import {
  FaLinkedinIn, FaInstagram, FaTiktok, FaFacebookF,
  FaYoutube, FaXTwitter, FaWhatsapp, FaEnvelope, FaWordpress, FaPodcast,
} from 'react-icons/fa6'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  listDataverseContentScores,
  listDataverseLibraryItems,
  replaceDataverseLibraryItems,
  saveDataverseContentScores,
} from '@/lib/dataverse'
import { callModel } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'

// ─── Interfaces & Config ─────────────────────────────────────────
interface LibraryItem {
  id: string
  title: string
  hook: string
  body: string
  visual_idea: string
  channel: string
  format: string
  tone: string
  status: 'Draft' | 'Validated' | 'Published' | 'Archived'
  created_at: string
}

const CHANNELS = [
  { value: 'linkedin',   icon: FaLinkedinIn, color: '#0A66C2', label: 'LinkedIn' },
  { value: 'facebook',   icon: FaFacebookF,  color: '#1877F2', label: 'Facebook' },
  { value: 'instagram',  icon: FaInstagram,  color: '#E4405F', label: 'Instagram' },
  { value: 'tiktok',     icon: FaTiktok,     color: '#111827', label: 'TikTok' },
  { value: 'youtube',    icon: FaYoutube,    color: '#FF0000', label: 'YouTube' },
  { value: 'twitter',    icon: FaXTwitter,   color: '#111827', label: 'X (Twitter)' },
  { value: 'whatsapp',   icon: FaWhatsapp,   color: '#25D366', label: 'WhatsApp' },
  { value: 'newsletter', icon: FaEnvelope,   color: '#FF6719', label: 'Newsletter' },
  { value: 'blog',       icon: FaWordpress,  color: '#21759B', label: 'Blog' },
  { value: 'podcast',    icon: FaPodcast,    color: '#872EC4', label: 'Podcast' },
]
const CHANNEL_MAP = Object.fromEntries(CHANNELS.map(c => [c.value, c]))

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  Validated: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  Published: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  Archived: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700',
}

const NEXT_STATUS: Record<string, LibraryItem['status']> = {
  Draft: 'Validated',
  Validated: 'Published',
  Published: 'Archived',
  Archived: 'Draft',
}

// ─── Main Page ─────────────────────────────────────────────────
export default function LibraryPage() {
  const { t, lang } = useI18n()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loadingItems, setLoadingItems] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState('all')

  // Modals / Edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editTitle, setEditTitle] = useState('')
  
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadItems = async () => {
      if (!activeCompany) { setItems([]); setLoadingItems(false); return }
      setLoadingItems(true)
      const data = await listDataverseLibraryItems(activeCompany.id)
      if (!cancelled) {
        setItems(data)
        setLoadingItems(false)
      }
    }
    loadItems()
    return () => { cancelled = true }
  }, [activeCompany?.id])

  // ── AI content scores ─────────────────────────────────────────────────────
  // score: 'ready' | 'good' | 'needs-work'
  // Primary store: Supabase content_scores table (syncs across devices)
  // Secondary: localStorage for instant reads without waiting for DB
  type ScoreLevel = 'ready' | 'good' | 'needs-work'
  const localKey = `flowcom:library_scores:${activeCompany?.id ?? 'default'}`

  const [scores, setScores] = useState<Record<string, ScoreLevel>>(() => {
    try { return JSON.parse(localStorage.getItem(localKey) ?? '{}') }
    catch { return {} }
  })
  const scoringRef = useRef(false)

  // Load scores from Dataverse when company changes (authoritative source)
  useEffect(() => {
    if (!activeCompany) return
    listDataverseContentScores(activeCompany.id).then(remote => {
      if (!Object.keys(remote).length) return
      setScores(prev => {
        const merged = { ...prev, ...remote }
        localStorage.setItem(localKey, JSON.stringify(merged))
        return merged
      })
    })
  }, [activeCompany?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist new scores to Supabase + localStorage
  const persistScores = async (newScores: Record<string, ScoreLevel>) => {
    if (!activeCompany || Object.keys(newScores).length === 0) return
    setScores(prev => {
      const merged = { ...prev, ...newScores }
      localStorage.setItem(localKey, JSON.stringify(merged))
      return merged
    })
    await saveDataverseContentScores(activeCompany.id, newScores)
  }

  // Background scorer - runs when items load, scores up to 5 unscored items
  useEffect(() => {
    if (!apiKeyConfigured || scoringRef.current) return
    const unscored = items
      .filter(i => i.status !== 'Archived' && !scores[i.id] && (i.hook || i.body))
      .slice(0, 5)
    if (unscored.length === 0) return

    scoringRef.current = true
    const ctx = buildAiContext({ company: activeCompany, products, segments, keyMessages })

    const runBatch = async () => {
      const newScores: Record<string, ScoreLevel> = {}
      for (const item of unscored) {
        try {
          const text = [item.hook, item.body].filter(Boolean).join('\n').slice(0, 400)
          const result = await callModel(activeCompany?.id ?? '', [
            {
              role: 'system',
              content: `You are a social media content reviewer. Rate this ${item.channel} ${item.format} content. Reply with ONLY one word: "ready" (strong hook, clear message, good CTA), "good" (decent but could be improved), or "needs-work" (weak hook, unclear, or missing CTA). Brand context:\n${ctx}\nRespond in ${lang === 'fr' ? 'French' : 'English'} but the rating word must still be one of: ready, good, needs-work.`,
            },
            { role: 'user', content: text },
          ], { temperature: 0.1, max_tokens: 10 })
          const word = result.trim().toLowerCase().replace(/[^a-z-]/g, '')
          if (word === 'ready' || word === 'good' || word === 'needs-work') {
            newScores[item.id] = word as ScoreLevel
          }
        } catch {
          // Skip silently
        }
        await new Promise(r => setTimeout(r, 1000))
      }
      await persistScores(newScores)
      scoringRef.current = false
    }
    runBatch()
  }, [items.length, apiKeyConfigured]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveToStorage = async (newItems: LibraryItem[]) => {
    if (!activeCompany) return
    setItems(newItems)
    await replaceDataverseLibraryItems(activeCompany.id, newItems.map(item => ({
      title: item.title,
      hook: item.hook,
      episode_context: '',
      body: item.body,
      conclusion: '',
      reward: '',
      cta: '',
      hashtags: '',
      visual_idea: item.visual_idea,
      video_script: '',
      channel: item.channel,
      format: (item.format === 'carousel' || item.format === 'video' ? item.format : 'post'),
      tone: (item.tone === 'casual' ? 'casual' : 'professional'),
      status: item.status,
      publish_date: null,
    })))
    window.dispatchEvent(new Event('flowcom:data-updated'))
  }

  // ─── Actions ───
  const cycleStatus = async (id: string) => {
    await saveToStorage(items.map(i => i.id === id ? { ...i, status: NEXT_STATUS[i.status] } : i))
  }

  const openStudio = (item: LibraryItem) => {
    navigate(`/studio?item=${encodeURIComponent(item.id)}`)
  }

  const handleDelete = async () => {
    if (!itemToDelete) return
    await saveToStorage(items.filter(i => i.id !== itemToDelete))
    setItemToDelete(null)
  }

  const startEdit = (item: LibraryItem) => {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditBody(item.body)
  }

  const saveEdit = async () => {
    if (!editingId) return
    await saveToStorage(items.map(i => i.id === editingId ? { ...i, title: editTitle, body: editBody } : i))
    setEditingId(null)
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  // ─── Derived State ───
  const filteredItems = useMemo(() => {
    return items.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (channelFilter !== 'all' && i.channel !== channelFilter) return false
      if (formatFilter !== 'all' && i.format !== formatFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return i.title.toLowerCase().includes(q) || 
               i.hook.toLowerCase().includes(q) || 
               i.body.toLowerCase().includes(q)
      }
      return true
    })
  }, [items, search, statusFilter, channelFilter, formatFilter])

  const metrics = useMemo(() => {
    return {
      total: items.length,
      drafts: items.filter(i => i.status === 'Draft').length,
      validated: items.filter(i => i.status === 'Validated').length,
      published: items.filter(i => i.status === 'Published').length,
      archived: items.filter(i => i.status === 'Archived').length,
    }
  }, [items])

  return (
    <div className="flex flex-col p-4 sm:p-6 gap-6 min-h-full">
      
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-pink-600 flex items-center justify-center shrink-0">
            <BookMarked className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/50 px-2 py-0.5 rounded-full border border-pink-200 dark:border-pink-800">
                {t('library.badge')}
              </span>
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text)] font-sans leading-tight">{t('library.title')}</h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              <span className="font-bold text-[var(--color-text)]">{metrics.total}</span> {t('library.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* ── Metrics Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-[var(--color-text)]">{metrics.total}</span>
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{t('library.metricTotal')}</span>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-amber-600 dark:text-amber-400">{metrics.drafts}</span>
          <span className="text-[10px] font-semibold text-amber-700/70 dark:text-amber-500/70 uppercase tracking-wider">{t('library.metricDrafts')}</span>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{metrics.validated}</span>
          <span className="text-[10px] font-semibold text-blue-700/70 dark:text-blue-500/70 uppercase tracking-wider">{t('library.metricValidated')}</span>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.published}</span>
          <span className="text-[10px] font-semibold text-emerald-700/70 dark:text-emerald-500/70 uppercase tracking-wider">{t('library.metricPublished')}</span>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-gray-500 dark:text-gray-400">{metrics.archived}</span>
          <span className="text-[10px] font-semibold text-gray-500/70 dark:text-gray-400/70 uppercase tracking-wider">{t('library.metricArchived')}</span>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shrink-0 flex flex-wrap items-center gap-3">
        
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input 
            type="text" 
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('library.searchPh')}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-pink-500 transition-all"
          />
        </div>

        {/* Status */}
        <div className="relative shrink-0">
          <select 
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none pl-9 pr-8 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm font-semibold text-[var(--color-text)] outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
          >
            <option value="all">{t('library.allStatuses')}</option>
            <option value="Draft">{t('status.Draft')}</option>
            <option value="Validated">{t('status.Validated')}</option>
            <option value="Published">{t('status.Published')}</option>
            <option value="Archived">{t('status.Archived')}</option>
          </select>
          <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
        </div>

        {/* Channel */}
        <div className="relative shrink-0">
          <select 
            value={channelFilter} onChange={e => setChannelFilter(e.target.value)}
            className="appearance-none pl-4 pr-8 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm font-semibold text-[var(--color-text)] outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
          >
            <option value="all">{t('library.allChannels')}</option>
            {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {/* Format */}
        <div className="relative shrink-0">
          <select 
            value={formatFilter} onChange={e => setFormatFilter(e.target.value)}
            className="appearance-none pl-4 pr-8 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm font-semibold text-[var(--color-text)] outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
          >
            <option value="all">{t('library.allFormats')}</option>
            <option value="post">Post</option>
            <option value="carousel">Carousel</option>
            <option value="video">Video</option>
            <option value="story">Story</option>
          </select>
        </div>
      </div>

      {/* ── Content Grid ── */}
      <div className="flex-1 pb-6">
        {loadingItems ? (
          <div className="py-24 text-center text-sm text-[var(--color-text-muted)]">Loading library...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mb-3 shadow-sm">
              <BookMarked className="w-6 h-6 text-[var(--color-text-muted)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--color-text)] mb-1">{t('library.empty')}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-24 text-sm text-[var(--color-text-muted)]">
            {t('library.noMatch')}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredItems.map(item => {
              const meta = CHANNEL_MAP[item.channel]
              const isEditing = editingId === item.id
              return (
                <div key={item.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-all">
                  
                  {/* Card Header */}
                  <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {meta && (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm" style={{ backgroundColor: meta.color }}>
                          <meta.icon className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        {isEditing ? (
                          <input 
                            value={editTitle} onChange={e => setEditTitle(e.target.value)}
                            className="text-sm font-bold bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-1 rounded outline-none w-full max-w-[200px]"
                          />
                        ) : (
                          <h3 className="text-sm font-bold text-[var(--color-text)] line-clamp-1" title={item.title}>
                            {item.title || 'Untitled Post'}
                          </h3>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                          <span className="capitalize">{item.format}</span>
                          <span>•</span>
                          <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => cycleStatus(item.id)}
                        className={cn('text-xs px-2.5 py-1 rounded-full font-semibold border transition-colors cursor-pointer hover:opacity-80', STATUS_COLORS[item.status])}
                        title={lang === 'fr' ? 'Changer le statut' : 'Change status'}
                      >
                        {t(`status.${item.status}` as any) || item.status}
                      </button>

                      {/* AI score chip */}
                      {scores[item.id] && (
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                          scores[item.id] === 'ready'      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                          : scores[item.id] === 'good'     ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
                          :                                  'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                        )}>
                          <Wand2 className="w-2.5 h-2.5" />
                          {scores[item.id] === 'ready' ? (lang === 'fr' ? 'Prêt' : 'Ready')
                            : scores[item.id] === 'good' ? (lang === 'fr' ? 'Bien' : 'Good')
                            : (lang === 'fr' ? 'À améliorer' : 'Needs work')}
                        </span>
                      )}
                      
                      <div className="h-4 w-px bg-[var(--color-border)] mx-1" />
                      
                      <button onClick={() => openStudio(item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 shadow-sm transition-colors" title="Open in Studio">
                        <Send className="w-3.5 h-3.5" />
                        Publish
                      </button>

                      <button onClick={() => { copyToClipboard(item.body); }} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors" title="Copy">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => isEditing ? saveEdit() : startEdit(item)} className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Edit">
                        {isEditing ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setItemToDelete(item.id)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col gap-4">
                    <div className="flex-1">
                      {isEditing ? (
                        <textarea
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          className="w-full h-full min-h-[150px] text-sm text-[var(--color-text)] bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl p-3 resize-none outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <div className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed line-clamp-6" title={item.body}>
                          {item.body}
                        </div>
                      )}
                    </div>
                    
                    {item.visual_idea && !isEditing && (
                      <div className="p-3 bg-[var(--color-surface-alt)] rounded-xl border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                        <span className="font-semibold block mb-1 text-[var(--color-text)]">Visual Idea:</span>
                        {item.visual_idea}
                      </div>
                    )}
                  </div>
                  
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Delete Modal ── */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5">
              <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">{t('library.deleteTitle')}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">{t('library.deleteConfirm')}</p>
            </div>
            <div className="p-4 bg-[var(--color-surface-alt)] border-t border-[var(--color-border)] flex items-center justify-end gap-2">
              <button onClick={() => setItemToDelete(null)} className="px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] rounded-xl transition-colors">
                {t('library.deleteCancel')}
              </button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm">
                {t('library.deleteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
