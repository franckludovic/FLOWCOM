import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowUp, BarChart3, Bookmark, BookOpen, CalendarDays, CalendarPlus, Check, ChevronDown, ChevronRight, Copy, Database,
  FileText, History, Lightbulb, Loader2, Megaphone, PenLine, Plus, Send, Settings, Sparkles, TrendingUp, X,
  type LucideIcon,
} from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBuffer } from '@/contexts/BufferContext'
import {
  askAssistant, findWeeklyDigest, generateWeeklyDigest, saveAssistantNote, weekStart,
  type AssistantBlock, type AssistantContext, type AssistantTurn, type WeeklyDigest,
} from '@/lib/assistant'
import { approveAction, rejectAction, type ProposedAction } from '@/lib/assistantActions'
import { ASSISTANT_MODEL } from '@/lib/integrations'
import { useAppSettings } from '@/contexts/AppSettingsContext'
import { enabledTools } from '@/modules/registry'
import { buildModelError, type ChatMessage } from '@/lib/model'
import { FallbackImage } from '@/components/FallbackImage'
import { ChartBlock, TableBlock } from './ChartBlock'
import { cn } from '@/lib/utils'

type Entry =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; turn: AssistantTurn; question: string }
  | { id: string; role: 'error'; text: string }

interface Thread {
  id: string
  title: string
  updated: string
  entries: Entry[]
  history: ChatMessage[]
}

const COPY = {
  fr: {
    title: 'Assistant FlowCom', placeholder: 'Posez une question…', newChat: 'Nouvelle conversation', history: 'Conversations',
    hello: 'Bonjour', helloSub: 'Je lis vos campagnes, contenus, résultats et notes pour vous aider à décider. Je propose, vous validez.',
    suggestions: [
      { icon: TrendingUp, text: 'Quelle campagne performe le mieux, et pourquoi ?' },
      { icon: BarChart3, text: 'Montre l\'évolution de la portée de mes derniers posts' },
      { icon: Lightbulb, text: 'Propose 3 idées de posts pour cette semaine' },
      { icon: FileText, text: 'Résume mes dernières analyses et notes' },
    ],
    campaignSuggestions: [
      { icon: TrendingUp, text: 'Comment se porte cette campagne ?' },
      { icon: Lightbulb, text: 'Que faut-il changer dans cette campagne ?' },
      { icon: CalendarPlus, text: 'Propose des posts pour cette campagne' },
    ],
    thinking: 'Réflexion', basedOn: 'Sources', copy: 'Copier', copied: 'Copié', save: 'Enregistrer en note', saved: 'Note enregistrée',
    noKey: 'Ajoutez la clé API du modèle IA dans les Paramètres pour utiliser l\'assistant.', noCompany: 'Sélectionnez une entreprise.',
    digest: 'Bilan de la semaine', digestPreparing: 'Préparation du bilan…',
    approve: 'Approuver', reject: 'Refuser', approved: 'Exécutée', rejected: 'Refusée', failed: 'Échec', pending: 'En attente de validation', proposal: 'Proposition',
    ideas: 'idée(s) de calendrier', statusTo: 'Nouveau statut', openStudio: 'Ouvrir dans le Studio', draft: 'Brouillon de post',
    tools: { get_company_context: 'Mémoire de l\'entreprise', list_campaigns: 'Campagnes', get_campaign_performance: 'Résultats de campagne', list_content: 'Contenus', get_recent_posts: 'Posts publiés', list_zones: 'Zones', list_notes: 'Notes', show_chart: 'Graphique', show_table: 'Tableau', show_images: 'Images', propose_action: 'Proposition', open_in_studio: 'Brouillon' } as Record<string, string>,
  },
  en: {
    title: 'FlowCom assistant', placeholder: 'Ask a question…', newChat: 'New conversation', history: 'Conversations',
    hello: 'Hello', helloSub: 'I read your campaigns, content, results and notes to help you decide. I propose; you approve.',
    suggestions: [
      { icon: TrendingUp, text: 'Which campaign performs best, and why?' },
      { icon: BarChart3, text: 'Show the reach trend of my recent posts' },
      { icon: Lightbulb, text: 'Suggest 3 post ideas for this week' },
      { icon: FileText, text: 'Summarize my latest analyses and notes' },
    ],
    campaignSuggestions: [
      { icon: TrendingUp, text: 'How is this campaign doing?' },
      { icon: Lightbulb, text: 'What should change in this campaign?' },
      { icon: CalendarPlus, text: 'Suggest posts for this campaign' },
    ],
    thinking: 'Thinking', basedOn: 'Sources', copy: 'Copy', copied: 'Copied', save: 'Save as note', saved: 'Note saved',
    noKey: 'Add the AI model API key in Settings to use the assistant.', noCompany: 'Select a company.',
    digest: 'Weekly digest', digestPreparing: 'Preparing the digest…',
    approve: 'Approve', reject: 'Reject', approved: 'Done', rejected: 'Rejected', failed: 'Failed', pending: 'Waiting for approval', proposal: 'Proposal',
    ideas: 'calendar idea(s)', statusTo: 'New status', openStudio: 'Open in Studio', draft: 'Post draft',
    tools: { get_company_context: 'Company memory', list_campaigns: 'Campaigns', get_campaign_performance: 'Campaign results', list_content: 'Content', get_recent_posts: 'Published posts', list_zones: 'Zones', list_notes: 'Notes', show_chart: 'Chart', show_table: 'Table', show_images: 'Images', propose_action: 'Proposal', open_in_studio: 'Draft' } as Record<string, string>,
  },
}
type Copy = typeof COPY.fr

const MAX_THREADS = 20

// Conversations are a per-device convenience; storage may be unavailable.
function loadThreads(key: string): Thread[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as Thread[] } catch { return [] }
}
function storeThreads(key: string, threads: Thread[]) {
  try { localStorage.setItem(key, JSON.stringify(threads.slice(0, MAX_THREADS))) } catch { /* storage full or blocked */ }
}

// Which part of the app the user is looking at, for "this campaign" questions.
function pageFromPath(pathname: string): AssistantContext['page'] {
  const campaign = pathname.match(/^\/campaigns\/([0-9a-f-]{36})/i)
  if (campaign) return { page: 'campaign', id: campaign[1] }
  const first = pathname.split('/')[1]
  return first ? { page: first } : undefined
}

// Icon for an in-app link, by path.
function linkIcon(href: string): LucideIcon {
  if (href.startsWith('/campaigns')) return Megaphone
  if (href.startsWith('/calendar')) return CalendarDays
  if (href.startsWith('/library')) return BookOpen
  if (href.startsWith('/studio')) return Send
  if (href.startsWith('/settings')) return Settings
  return ChevronRight
}

const iconBadge = 'w-7 h-7 rounded-lg flex items-center justify-center shrink-0'

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, t } = useI18n()
  const c = COPY[lang === 'fr' ? 'fr' : 'en']
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured, user, profile } = useAuth()
  const buffer = useBuffer()
  const { modules } = useAppSettings()
  const { pathname } = useLocation()
  const page = pageFromPath(pathname)

  const storageKey = `flowcom:assistant:${user?.id ?? 'anon'}:${activeCompany?.id ?? 'none'}`
  const [threads, setThreads] = useState<Thread[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [digest, setDigest] = useState<WeeklyDigest | null>(null)
  const [digestBusy, setDigestBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const thread = threads.find(th => th.id === threadId) ?? null
  const entries = thread?.entries ?? []
  const firstName = (profile?.name ?? '').split(' ')[0]

  const context = (): AssistantContext | null => activeCompany ? {
    company: activeCompany, products, segments, keyMessages, lang: lang === 'fr' ? 'fr' : 'en',
    buffer: { orgId: buffer.orgId, channels: buffer.channels }, page, model: ASSISTANT_MODEL, tools: enabledTools(modules),
  } : null

  // Conversations belong to one user and company.
  useEffect(() => { setThreads(loadThreads(storageKey)); setThreadId(null) }, [storageKey])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [entries.length, progress])
  // Grow the input with its content, up to a limit.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [input])

  // Weekly digest: show this week's, or write it the first time someone opens the assistant this week.
  useEffect(() => {
    if (!open || !activeCompany || !apiKeyConfigured) return
    let alive = true
    const attemptKey = `flowcom:digest-attempt:${activeCompany.id}:${weekStart()}`
    findWeeklyDigest(activeCompany.id).then(async existing => {
      if (!alive) return
      if (existing) { setDigest(existing); return }
      if (!['owner', 'admin', 'editor'].includes(activeCompany.role ?? '')) return
      try { if (sessionStorage.getItem(attemptKey)) return; sessionStorage.setItem(attemptKey, '1') } catch { /* storage blocked */ }
      const ctx = context()
      if (!ctx) return
      setDigestBusy(true)
      try {
        const created = await generateWeeklyDigest(ctx)
        if (alive) setDigest(created)
      } catch { /* the digest is optional */ } finally {
        if (alive) setDigestBusy(false)
      }
    }).catch(() => undefined)
    return () => { alive = false }
  }, [open, activeCompany?.id, apiKeyConfigured])  // eslint-disable-line react-hooks/exhaustive-deps

  const saveThread = (updated: Thread) => {
    setThreads(prev => {
      const next = [updated, ...prev.filter(th => th.id !== updated.id)]
      storeThreads(storageKey, next)
      return next
    })
  }

  const updateEntry = (entryId: string, change: (entry: Entry) => Entry) => {
    if (!thread) return
    saveThread({ ...thread, entries: thread.entries.map(e => e.id === entryId ? change(e) : e) })
  }

  const ask = async (question: string) => {
    const q = question.trim()
    const ctx = context()
    if (!q || busy || !ctx) return
    setInput('')
    setBusy(true)
    setProgress([])
    const base: Thread = thread ?? { id: crypto.randomUUID(), title: q.slice(0, 80), updated: '', entries: [], history: [] }
    let current: Thread = { ...base, updated: new Date().toISOString(), entries: [...base.entries, { id: crypto.randomUUID(), role: 'user', text: q }] }
    setThreadId(current.id)
    saveThread(current)
    try {
      const { turn, history } = await askAssistant(base.history, q, ctx, tool => setProgress(prev => prev.includes(tool) ? prev : [...prev, tool]))
      current = { ...current, history, entries: [...current.entries, { id: crypto.randomUUID(), role: 'assistant', turn, question: q }] }
    } catch (err) {
      const key = buildModelError(err)
      const text = key !== 'error.generic' ? t(key as Parameters<typeof t>[0]) : err instanceof Error ? err.message : String(err)
      current = { ...current, entries: [...current.entries, { id: crypto.randomUUID(), role: 'error', text }] }
    } finally {
      saveThread(current)
      setBusy(false)
      setProgress([])
    }
  }

  const suggestions = page?.page === 'campaign' ? c.campaignSuggestions : c.suggestions
  const disabled = !apiKeyConfigured || !activeCompany

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        'fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] flex flex-col bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      )}
    >
      {/* Header */}
      <div className="h-14 flex items-center gap-2 px-3 border-b border-[var(--color-border)] shrink-0">
        <div className={cn(iconBadge, 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm')}>
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[var(--color-text)] truncate leading-tight">{thread?.title ?? c.title}</p>
          {thread && <p className="text-[10px] text-[var(--color-text-muted)] leading-tight">{c.title}</p>}
        </div>
        <IconButton label={c.history} onClick={() => setShowHistory(v => !v)} active={showHistory} disabled={!threads.length}><History className="w-4 h-4" /></IconButton>
        <IconButton label={c.newChat} onClick={() => { setThreadId(null); setShowHistory(false) }} disabled={busy || !thread}><Plus className="w-4 h-4" /></IconButton>
        <IconButton label="Close" onClick={onClose}><X className="w-4 h-4" /></IconButton>
      </div>

      {showHistory && (
        <div className="border-b border-[var(--color-border)] max-h-72 overflow-y-auto shrink-0 p-2 space-y-0.5 bg-[var(--color-surface-alt)]">
          {threads.map(th => (
            <button key={th.id} onClick={() => { setThreadId(th.id); setShowHistory(false) }}
              className={cn('w-full text-left px-3 py-2 rounded-lg transition-colors', th.id === threadId ? 'bg-[var(--color-surface)] shadow-sm' : 'hover:bg-[var(--color-surface)]')}>
              <span className="block truncate text-sm text-[var(--color-text)]">{th.title}</span>
              <span className="block text-[10px] text-[var(--color-text-muted)]">{th.updated.slice(0, 16).replace('T', ' ')}</span>
            </button>
          ))}
        </div>
      )}

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {entries.length === 0 && (
          <div className="space-y-4">
            <div className="pt-2">
              <p className="text-lg font-bold text-[var(--color-text)]">{c.hello}{firstName ? `, ${firstName}` : ''} 👋</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1 leading-relaxed">{c.helloSub}</p>
            </div>
            {(digest || digestBusy) && <DigestCard digest={digest} busy={digestBusy} c={c} />}
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map(({ icon: Icon, text }) => (
                <button key={text} onClick={() => void ask(text)} disabled={busy || disabled}
                  className="group text-left p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm disabled:opacity-50 transition-all">
                  <Icon className="w-4 h-4 text-indigo-500 mb-2" />
                  <span className="block text-xs font-medium text-[var(--color-text)] leading-snug">{text}</span>
                </button>
              ))}
            </div>
            {!apiKeyConfigured && <Notice>{c.noKey}</Notice>}
            {!activeCompany && <Notice>{c.noCompany}</Notice>}
          </div>
        )}

        {entries.map(entry => entry.role === 'user' ? (
          <div key={entry.id} className="flex justify-end">
            <p className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 text-white text-sm whitespace-pre-wrap shadow-sm">{entry.text}</p>
          </div>
        ) : entry.role === 'error' ? (
          <Notice key={entry.id} tone="error">{entry.text}</Notice>
        ) : (
          <AssistantAnswer key={entry.id} turn={entry.turn} question={entry.question} c={c}
            onActionChange={action => updateEntry(entry.id, e => e.role === 'assistant'
              ? { ...e, turn: { ...e.turn, blocks: e.turn.blocks.map(b => b.kind === 'action' && b.action.id === action.id ? { ...b, action } : b) } }
              : e)} />
        ))}

        {busy && <ProgressSteps steps={progress} c={c} />}
      </div>

      {/* Composer */}
      <form onSubmit={e => { e.preventDefault(); void ask(input) }} className="px-3 pb-3 pt-2 shrink-0">
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] pl-4 pr-2 py-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} rows={1} placeholder={c.placeholder}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input) } }}
            disabled={disabled}
            className="flex-1 resize-none bg-transparent text-sm text-[var(--color-text)] outline-none py-1.5 placeholder:text-[var(--color-text-muted)]" />
          <button type="submit" disabled={busy || !input.trim() || disabled}
            className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center disabled:opacity-30 disabled:bg-[var(--color-text-muted)] transition-colors shrink-0" aria-label="Send">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </aside>
  )
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function IconButton({ label, onClick, active, disabled, children }: {
  label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] disabled:opacity-30 transition-colors',
        active && 'bg-[var(--color-surface-alt)] text-[var(--color-text)]')}>
      {children}
    </button>
  )
}

function Notice({ children, tone = 'warning' }: { children: React.ReactNode; tone?: 'warning' | 'error' }) {
  return (
    <p className={cn('text-xs px-3 py-2 rounded-xl border',
      tone === 'error'
        ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'
        : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900')}>
      {children}
    </p>
  )
}

function ProgressSteps({ steps, c }: { steps: string[]; c: Copy }) {
  return (
    <div className="flex gap-2.5">
      <div className={cn(iconBadge, 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500')}><Sparkles className="w-3.5 h-3.5 animate-pulse" /></div>
      <div className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 space-y-1">
        {steps.map((step, i) => (
          <p key={step} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            {i < steps.length - 1 ? <Check className="w-3 h-3 text-emerald-500" /> : <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
            {c.tools[step] ?? step}
          </p>
        ))}
        {steps.length === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <Loader2 className="w-3 h-3 animate-spin text-indigo-500" /> {c.thinking}…
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Answer rendering ─────────────────────────────────────────────────────────

function Markdown({ text }: { text: string }) {
  const navigate = useNavigate()
  return (
    <div className="text-sm text-[var(--color-text)] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}
        components={{
          p: props => <p className="mb-2 last:mb-0" {...props} />,
          ul: props => <ul className="list-disc marker:text-indigo-400 pl-5 mb-2 space-y-1" {...props} />,
          ol: props => <ol className="list-decimal marker:text-indigo-400 pl-5 mb-2 space-y-1" {...props} />,
          h1: props => <p className="font-bold mt-3 mb-1 first:mt-0" {...props} />,
          h2: props => <p className="font-bold mt-3 mb-1 first:mt-0" {...props} />,
          h3: props => <p className="font-semibold mt-2 mb-1 first:mt-0" {...props} />,
          strong: props => <strong className="font-semibold text-[var(--color-text)]" {...props} />,
          // App paths render as pills that open inside FlowCom; other links open in a new tab.
          a: ({ href, children }) => {
            if (href?.startsWith('/')) {
              const Icon = linkIcon(href)
              return (
                <button type="button" onClick={() => navigate(href)}
                  className="inline-flex items-center gap-1 align-baseline mx-0.5 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                  <Icon className="w-3 h-3" />{children}
                </button>
              )
            }
            return <a href={href} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2">{children}</a>
          },
          code: props => <code className="px-1 py-0.5 rounded bg-[var(--color-surface-alt)] text-xs" {...props} />,
          table: props => <div className="overflow-x-auto mb-2 rounded-lg border border-[var(--color-border)]"><table className="w-full text-xs" {...props} /></div>,
          th: props => <th className="text-left px-2 py-1.5 font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-alt)]" {...props} />,
          td: props => <td className="px-2 py-1.5 border-t border-[var(--color-border)]" {...props} />,
        }}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

function Blocks({ blocks, c, onActionChange }: { blocks: AssistantBlock[]; c: Copy; onActionChange?: (action: ProposedAction) => void }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'chart': return <ChartBlock key={i} chart={block.chart} />
          case 'table': return <TableBlock key={i} title={block.title} columns={block.columns} rows={block.rows} />
          case 'action': return <ActionCard key={i} action={block.action} c={c} onChange={onActionChange} />
          case 'draft': return <DraftCard key={i} text={block.text} campaignId={block.campaign_id} c={c} />
          case 'images': return (
            <figure key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              {block.title && <figcaption className="text-xs font-semibold text-[var(--color-text)] mb-2">{block.title}</figcaption>}
              <div className="grid grid-cols-3 gap-2">
                {block.images.map(img => (
                  <div key={img.url} className="space-y-1">
                    <FallbackImage src={img.url} alt={img.caption ?? ''} className="w-full aspect-square object-cover rounded-lg border border-[var(--color-border)]"
                      fallback={<div className="w-full aspect-square rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)]" />} />
                    {img.caption && <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2">{img.caption}</p>}
                  </div>
                ))}
              </div>
            </figure>
          )
        }
      })}
    </>
  )
}

function AssistantAnswer({ turn, question, c, onActionChange }: {
  turn: AssistantTurn
  question: string
  c: Copy
  onActionChange: (action: ProposedAction) => void
}) {
  const { activeCompany } = useCompany()
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(turn.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  const save = async () => {
    if (!activeCompany) return
    setSaving(true)
    setError('')
    try {
      await saveAssistantNote(activeCompany.id, question, turn)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex gap-2.5">
      <div className={cn(iconBadge, 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm')}><Sparkles className="w-3.5 h-3.5" /></div>
      <div className="flex-1 min-w-0 space-y-3">
        {turn.text && <Markdown text={turn.text} />}
        <Blocks blocks={turn.blocks} c={c} onActionChange={onActionChange} />

        <div className="flex flex-wrap items-center gap-1">
          {turn.sources.map(source => (
            <span key={source} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] border border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)]">
              <Database className="w-2.5 h-2.5" />{source}
            </span>
          ))}
          <span className="flex-1" />
          <IconButton label={copied ? c.copied : c.copy} onClick={() => void copy()}>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </IconButton>
          <IconButton label={saved ? c.saved : c.save} onClick={() => void save()} disabled={saving || saved || !activeCompany}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Bookmark className="w-3.5 h-3.5" />}
          </IconButton>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </div>
  )
}

function ActionCard({ action, c, onChange }: { action: ProposedAction; c: Copy; onChange?: (action: ProposedAction) => void }) {
  const { activeCompany } = useCompany()
  const { profile } = useAuth()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const canDecide = Boolean(activeCompany && ['owner', 'admin', 'editor'].includes(activeCompany.role ?? ''))
  const payload = action.payload
  const Icon = payload.kind === 'create_calendar_item' ? CalendarPlus : Megaphone

  const decide = async (approve: boolean) => {
    if (!activeCompany) return
    setBusy(approve ? 'approve' : 'reject')
    try {
      const next = approve
        ? await approveAction(activeCompany.id, action, profile?.id ?? null)
        : await rejectAction(action, profile?.id ?? null)
      onChange?.(next)
    } catch (err) {
      onChange?.({ ...action, status: 'failed', result: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(null)
    }
  }

  const done = action.status === 'executed' || action.status === 'approved'
  const statusTone = done
    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
    : action.status === 'failed' ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
    : action.status === 'rejected' ? 'text-[var(--color-text-muted)] bg-[var(--color-surface-alt)]'
    : 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
  const statusLabel = { proposed: c.pending, approved: c.approved, executed: c.approved, rejected: c.rejected, failed: c.failed }[action.status]

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-3.5">
        <div className={cn(iconBadge, 'w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400')}><Icon className="w-4 h-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{c.proposal}</p>
          <p className="text-sm font-semibold text-[var(--color-text)] leading-snug">{action.title}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {payload.kind === 'create_calendar_item' ? `${payload.items.length} ${c.ideas}` : `${c.statusTo}: ${payload.status}`}
          </p>
        </div>
        <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium', statusTone)}>{statusLabel}</span>
      </div>

      {payload.kind === 'create_calendar_item' && (
        <div className="px-3.5 pb-3 space-y-1.5">
          {payload.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg bg-[var(--color-surface-alt)]">
              <div className="text-center shrink-0 w-10">
                <p className="text-[9px] uppercase text-[var(--color-text-muted)] leading-tight">{new Date(item.date).toLocaleDateString(undefined, { month: 'short' })}</p>
                <p className="text-sm font-bold text-[var(--color-text)] leading-tight">{item.date.slice(8, 10)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--color-text)] leading-snug">{item.topic}</p>
                <p className="text-[10px] text-[var(--color-text-muted)] capitalize">{[item.channel, item.format].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {action.status === 'proposed' ? (
        <div className="grid grid-cols-2 gap-2 p-3 border-t border-[var(--color-border)] bg-[var(--color-surface-alt)]">
          <button onClick={() => void decide(false)} disabled={busy !== null || !canDecide}
            className="py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] disabled:opacity-50 transition-colors">
            {busy === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : c.reject}
          </button>
          <button onClick={() => void decide(true)} disabled={busy !== null || !canDecide}
            className="inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 transition-colors">
            {busy === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {c.approve}
          </button>
        </div>
      ) : action.result ? (
        <p className="px-3.5 py-2.5 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">{action.result}</p>
      ) : null}
    </div>
  )
}

function DraftCard({ text, campaignId, c }: { text: string; campaignId?: string; c: Copy }) {
  const navigate = useNavigate()
  const params = new URLSearchParams({ text, ...(campaignId ? { campaign: campaignId } : {}) })
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 pt-3.5">
        <div className={cn(iconBadge, 'w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400')}><PenLine className="w-4 h-4" /></div>
        <p className="text-sm font-semibold text-[var(--color-text)]">{c.draft}</p>
      </div>
      <p className="mx-3.5 my-3 p-3 rounded-xl bg-[var(--color-surface-alt)] text-sm text-[var(--color-text)] whitespace-pre-wrap line-clamp-8 leading-relaxed">{text}</p>
      <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface-alt)]">
        <button onClick={() => navigate(`/studio?${params.toString()}`)}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors">
          <Send className="w-3.5 h-3.5" /> {c.openStudio}
        </button>
      </div>
    </div>
  )
}

function DigestCard({ digest, busy, c }: { digest: WeeklyDigest | null; busy: boolean; c: Copy }) {
  const [open, setOpen] = useState(false)
  const preview = useMemo(() => digest?.body.split('\n').find(line => line.trim())?.replace(/[#*_>]/g, '').trim() ?? '', [digest])
  return (
    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/30 overflow-hidden">
      <button onClick={() => digest && setOpen(v => !v)} className="w-full flex items-center gap-3 p-3.5 text-left">
        <div className={cn(iconBadge, 'w-9 h-9 rounded-xl bg-white/80 dark:bg-white/10 text-indigo-600 dark:text-indigo-300 shadow-sm')}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
        </div>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-[var(--color-text)]">{digest?.title ?? c.digest}</span>
          <span className="block text-xs text-[var(--color-text-muted)] truncate">{busy ? c.digestPreparing : preview}</span>
        </span>
        {digest && <ChevronDown className={cn('w-4 h-4 text-[var(--color-text-muted)] transition-transform', open && 'rotate-180')} />}
      </button>
      {open && digest && (
        <div className="space-y-3 px-3.5 pb-3.5">
          <Markdown text={digest.body} />
          <Blocks blocks={digest.blocks} c={c} />
        </div>
      )}
    </div>
  )
}
