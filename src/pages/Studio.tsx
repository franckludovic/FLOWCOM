import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import EmojiPicker, { Theme as EmojiTheme, type EmojiClickData } from 'emoji-picker-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBuffer, bufferQuery } from '@/contexts/BufferContext'
import { callGroq, buildGroqError } from '@/lib/groq'
import { buildAiContext } from '@/lib/aiContext'
import { listDataverseLibraryItems, updateDataverseLibraryItem } from '@/lib/dataverse'
import {
  Send, Check, Loader2, AlertCircle, CheckSquare,
  Upload, X, Smile, Wand2, RotateCcw, Hash, Film, Briefcase, Layers, Search,
  Play, Pause, Volume2, VolumeX, ShieldCheck, CalendarClock
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Cloudinary ───────────────────────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

interface SelectedMedia {
  id: string; file: File; previewUrl: string
  kind: 'image' | 'video'; publicUrl?: string
}

// ─── Presets ──────────────────────────────────────────────────────────────────
type Preset = 'professional' | 'feed' | 'shortform'

const PRESETS = [
  {
    id: 'professional' as Preset,
    label: 'Professional', labelFr: 'Professionnel',
    icon: <Briefcase className="w-3.5 h-3.5" />,
    placeholder: 'Lead with your idea, support with context, close with a CTA.',
    placeholderFr: 'Commencez par votre idée, donnez du contexte, terminez par un CTA.',
    tip: 'LinkedIn · Google Business', tipFr: 'LinkedIn · Google Business',
    charLimit: 3000, hashtags: false,
  },
  {
    id: 'feed' as Preset,
    label: 'Feed Post', labelFr: 'Post Feed',
    icon: <Layers className="w-3.5 h-3.5" />,
    placeholder: 'Hook line 1 ✦ Story in the middle ✦ CTA at the end',
    placeholderFr: 'Accroche ligne 1 ✦ Histoire au milieu ✦ CTA à la fin',
    tip: 'Instagram · Facebook · Threads', tipFr: 'Instagram · Facebook · Threads',
    charLimit: 2200, hashtags: true,
  },
  {
    id: 'shortform' as Preset,
    label: 'Short-form', labelFr: 'Vidéo Courte',
    icon: <Film className="w-3.5 h-3.5" />,
    placeholder: 'Hook- first line before "see more"...',
    placeholderFr: 'Accroche- première ligne avant "voir plus"...',
    tip: 'TikTok · Reels · YT Shorts', tipFr: 'TikTok · Reels · YT Shorts',
    charLimit: 500, hashtags: true,
  },
]

// ─── Tones ────────────────────────────────────────────────────────────────────
type ToneId = 'professional' | 'casual' | 'persuasive' | 'fun' | 'inspiring'
const TONES: { id: ToneId; label: string; labelFr: string; emoji: string; prompt: string }[] = [
  { id: 'professional', label: 'Professional', labelFr: 'Professionnel', emoji: '💼',
    prompt: 'Rewrite in a professional, authoritative tone. Clear, no fluff. Keep the core message.' },
  { id: 'casual', label: 'Casual', labelFr: 'Décontracté', emoji: '💬',
    prompt: 'Rewrite in a casual, conversational tone- like talking to a friend.' },
  { id: 'persuasive', label: 'Persuasive', labelFr: 'Persuasif', emoji: '🎯',
    prompt: 'Rewrite to be persuasive and action-oriented. Strong hook, compelling CTA.' },
  { id: 'fun', label: 'Fun', labelFr: 'Fun', emoji: '🎉',
    prompt: 'Rewrite in a fun, playful tone. Natural emojis, punchy sentences.' },
  { id: 'inspiring', label: 'Inspiring', labelFr: 'Inspirant', emoji: '✨',
    prompt: 'Rewrite in an inspiring, motivational tone. Emotional, story-driven.' },
]

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 6000); return () => clearTimeout(t) }, [onDismiss])
  return (
    <div className="fixed top-4 right-4 z-50 flex items-start gap-2.5 max-w-sm w-full bg-red-600 text-white text-sm rounded-2xl shadow-xl px-4 py-3">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="flex-1 leading-snug">{message}</span>
      <button onClick={onDismiss} className="shrink-0 opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
    </div>
  )
}

// ─── Char counter ─────────────────────────────────────────────────────────────
function CharCount({ count, limit }: { count: number; limit: number }) {
  const pct = count / limit
  return (
    <span className={cn('text-[10px] tabular-nums font-medium',
      pct >= 1 ? 'text-red-400' : pct >= 0.85 ? 'text-amber-400' : 'text-[var(--color-text-muted)]'
    )}>{count} / {limit}</span>
  )
}

// ─── AI Tone popover ──────────────────────────────────────────────────────────
function TonePopover({ open, onClose, onApply, toningId, toneError, hasContent, apiOk, beforeTone, onUndo, lang }:
  { open: boolean; onClose: () => void; onApply: (t: typeof TONES[0]) => void
    toningId: ToneId | null; toneError: string; hasContent: boolean
    apiOk: boolean; beforeTone: string | null; onUndo: () => void; lang: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div ref={ref} className="absolute bottom-full right-0 mb-2 z-40 w-52 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5 text-purple-500" />
          <span className="text-xs font-bold text-[var(--color-text)]">{lang === 'fr' ? 'Réécriture IA' : 'AI Tone'}</span>
        </div>
        <div className="flex items-center gap-2">
          {beforeTone !== null && (
            <button onClick={onUndo} className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              <RotateCcw className="w-3 h-3" />{lang === 'fr' ? 'Annuler' : 'Undo'}
            </button>
          )}
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {TONES.map(tone => (
          <button key={tone.id} onClick={() => onApply(tone)}
            disabled={!hasContent || !!toningId || !apiOk}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left w-full transition-all',
              'bg-[var(--color-surface-alt)] border border-transparent',
              'hover:border-purple-400 hover:text-purple-500 disabled:opacity-40 disabled:cursor-not-allowed',
              toningId === tone.id && 'border-purple-400 text-purple-500'
            )}>
            {toningId === tone.id ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <span className="text-sm leading-none shrink-0">{tone.emoji}</span>}
            {lang === 'fr' ? tone.labelFr : tone.label}
          </button>
        ))}
      </div>
      {!hasContent && <p className="mt-2 text-[10px] text-[var(--color-text-muted)] italic">{lang === 'fr' ? 'Écrivez votre post d\'abord.' : 'Write your post first.'}</p>}
      {!apiOk && <p className="mt-2 text-[10px] text-amber-400 font-medium">{lang === 'fr' ? 'Clé Groq requise.' : 'Groq key required.'}</p>}
      {toneError && <p className="mt-2 text-[10px] text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" />{toneError}</p>}
    </div>
  )
}

// ─── Library search dropdown ──────────────────────────────────────────────────
function LibrarySearch({ items, onSelect, lang }: {
  items: any[]; onSelect: (item: any) => void; lang: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const results = query.trim().length < 1 ? [] : items.filter(i => {
    const q = query.toLowerCase()
    return i.title?.toLowerCase().includes(q) || i.body?.toLowerCase().includes(q)
  }).slice(0, 8)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)] focus-within:ring-2 focus-within:ring-blue-500 transition-all w-52">
        <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={lang === 'fr' ? 'Chercher un post...' : 'Search posts...'}
          className="flex-1 bg-transparent text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && query.trim().length >= 1 && (
        <div className="absolute top-full left-0 mt-1 w-80 z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[var(--color-text-muted)] italic">
              {lang === 'fr' ? 'Aucun résultat.' : 'No results.'}
            </p>
          ) : (
            <ul>
              {results.map((item, i) => (
                <li key={item.id}>
                  <button
                    onClick={() => { onSelect(item); setQuery(''); setOpen(false) }}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-[var(--color-surface-alt)] transition-colors',
                      i !== 0 && 'border-t border-[var(--color-border)]'
                    )}
                  >
                    <p className="text-xs font-semibold text-[var(--color-text)] truncate">{item.title || 'Untitled'}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 line-clamp-2 leading-relaxed">{item.body}</p>
                    <span className={cn(
                      'inline-block mt-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md',
                      item.status === 'Validated' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : item.status === 'Published' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
                    )}>{item.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Media panel (upload card + thumbnails below) ─────────────────────────────
function MediaPanel({ media, onAdd, onRemove, uploadingImage, aspect, lang, inputRef }:
  { media: SelectedMedia[]; onAdd: (f: FileList | null) => void; onRemove: (id: string) => void
    uploadingImage: boolean; aspect: 'side' | 'square' | 'portrait'; lang: string
    inputRef: React.RefObject<HTMLInputElement | null> }) {

  // Upload card dimensions per aspect
  const cardCls = aspect === 'portrait'
    ? 'w-[120px] h-[210px]'
    : aspect === 'square'
      ? 'w-28 h-28'
      : 'w-28 h-28'   // side: fixed square upload card, height comes from container

  return (
    <div className={cn(
      'flex shrink-0',
      aspect === 'side' ? 'flex-col gap-2 self-stretch' : 'flex-col gap-2'
    )}>
      {/* Upload card */}
      <div
        role="button" tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); onAdd(e.dataTransfer.files as FileList) }}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer shrink-0',
          'bg-[var(--color-surface-alt)] hover:border-blue-400 transition-colors',
          'border-[var(--color-border)]',
          cardCls,
          aspect === 'side' && 'flex-1 min-h-[100px]'
        )}
      >
        <div className="flex flex-col items-center gap-1.5 p-3 text-center">
          {aspect === 'portrait'
            ? <Film className="w-6 h-6 text-blue-400 opacity-60" />
            : <Upload className="w-5 h-5 text-blue-400 opacity-80" />}
          <span className="text-[9px] font-semibold text-[var(--color-text-muted)]">
            {uploadingImage ? '…' : aspect === 'portrait' ? '9:16 Video' : (lang === 'fr' ? 'Ajouter' : 'Add')}
          </span>
          <span className="text-[9px] text-[var(--color-text-muted)]">{lang === 'fr' ? 'Cliquer' : 'Click'}</span>
        </div>
        <input ref={inputRef} type="file" accept="image/*,video/*"
          multiple={aspect !== 'portrait'} className="hidden"
          onChange={e => onAdd(e.target.files)} />
      </div>

      {/* Thumbnails below the upload card */}
      {media.map(item => (
        <div key={item.id} className={cn(
          'relative shrink-0 rounded-xl overflow-hidden border border-[var(--color-border)] group',
          aspect === 'portrait' ? 'w-[120px] h-[80px]' : 'w-28 h-20'
        )}>
          {item.kind === 'video'
            ? <video src={item.previewUrl} className="w-full h-full object-cover" muted />
            : <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          <button type="button" onClick={() => onRemove(item.id)}
            className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <X className="w-3 h-3" />
          </button>
          <span className="absolute bottom-1 left-1 text-[8px] px-1 py-0.5 rounded bg-black/60 text-white uppercase font-bold">{item.kind}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Media player (video with controls, or image preview) ────────────────────
function MediaPlayer({ item, onRemove }: { item: SelectedMedia; onRemove: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !v.duration) return
    setProgress((v.currentTime / v.duration) * 100)
  }

  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v || !v.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration
    setProgress(((e.clientX - rect.left) / rect.width) * 100)
  }

  if (item.kind !== 'video') {
    return (
      <>
        <img src={item.previewUrl} alt="" className="w-full h-full object-contain bg-black" />
        {/* ✕- top left, stops propagation so click doesn't hit the drop zone */}
        <button
          type="button"
          onPointerDown={e => { e.stopPropagation(); e.preventDefault() }}
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="absolute top-2 left-2 z-20 p-1 rounded-md bg-black/70 text-white hover:bg-black/90 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </>
    )
  }

  return (
    <>
      {/* Video- object-contain so the full frame is visible, black letterbox */}
      <video
        ref={videoRef}
        src={item.previewUrl}
        className="w-full h-full object-contain bg-black"
        onTimeUpdate={onTimeUpdate}
        onEnded={() => setPlaying(false)}
        onClick={togglePlay}
        playsInline
      />

      {/* ✕- top left, isolated from video click */}
      <button
        type="button"
        onPointerDown={e => { e.stopPropagation(); e.preventDefault() }}
        onClick={e => { e.stopPropagation(); onRemove() }}
        className="absolute top-2 left-2 z-20 p-1 rounded-md bg-black/70 text-white hover:bg-black/90 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Play/pause overlay */}
      <button
        type="button"
        onClick={togglePlay}
        className="absolute inset-0 flex items-center justify-center z-10 group"
      >
        <div className={cn(
          'w-12 h-12 rounded-full bg-black/50 flex items-center justify-center transition-opacity',
          playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        )}>
          {playing
            ? <Pause className="w-5 h-5 text-white" />
            : <Play className="w-5 h-5 text-white ml-0.5" />}
        </div>
      </button>

      {/* Bottom controls- scrub bar + mute */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2"
        onClick={e => e.stopPropagation()}
      >
        <div
          className="w-full h-1.5 bg-white/30 rounded-full mb-2 cursor-pointer"
          onClick={scrub}
        >
          <div className="h-full bg-white rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <button type="button" onClick={toggleMute} className="text-white/80 hover:text-white transition-colors">
          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </>
  )
}

// ─── Split body + hashtags when loading a library item ───────────────────────
function splitBodyAndTags(item: any, keepJoined: boolean): { body: string; tags: string } {
  const rawBody: string = (item.body ?? '').trimEnd()
  const rawTags: string = (item.hashtags ?? '').trim()

  if (keepJoined) {
    // ── Professional: merge hashtags into the body text ──────────────────────
    if (!rawTags) return { body: rawBody, tags: '' }
    // Only append if not already present at the end of body
    if (rawBody.endsWith(rawTags)) return { body: rawBody, tags: '' }
    return { body: `${rawBody}\n\n${rawTags}`, tags: '' }
  }

  // ── Feed / Short-form: put hashtags in the separate field ─────────────────
  if (rawTags) {
    // Clean body: remove the hashtag block if it was also appended there
    const bodyClean = rawBody.replace(/\n{1,2}(?:#\w+\s*)+$/s, '').trimEnd()
    return { body: bodyClean || rawBody, tags: rawTags }
  }

  // No dedicated hashtags field - try to extract trailing #tags from body
  const match = rawBody.match(/^([\s\S]*?)\n{1,2}((?:#\w+\s*)+)$/)
  if (match) {
    return { body: match[1].trimEnd(), tags: match[2].trim() }
  }

  return { body: rawBody, tags: '' }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function StudioPage() {
  const { lang } = useI18n()
  const { theme } = useTheme()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const { channels, loading: loadingProfiles, error: bufferError } = useBuffer()
  const [searchParams] = useSearchParams()
  const [toast, setToast]   = useState(bufferError ? bufferError : '')
  const dismissToast        = useCallback(() => setToast(''), [])

  // Show buffer context errors as toast
  useEffect(() => { if (bufferError) setToast(bufferError) }, [bufferError])

  // Auto-select first channel once channels load
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([])
  useEffect(() => {
    if (channels.length > 0 && selectedProfiles.length === 0)
      setSelectedProfiles([channels[0].id])
  }, [channels])  // eslint-disable-line react-hooks/exhaustive-deps

  const [preset, setPreset] = useState<Preset>('professional')
  const presetCfg           = PRESETS.find(p => p.id === preset)!

  const [content, setContent]       = useState('')
  const [hashtags, setHashtags]     = useState('')
  const [media, setMedia]           = useState<SelectedMedia[]>([])
  const [uploadingImage, setUpImg]  = useState(false)

  const [emojiOpen, setEmojiOpen]   = useState(false)
  const [toneOpen, setToneOpen]     = useState(false)
  const [toningId, setToningId]     = useState<ToneId | null>(null)
  const [toneError, setToneError]   = useState('')
  const [beforeTone, setBeforeTone] = useState<string | null>(null)

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isPublishing, setIsPublishing]     = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [libraryItems, setLibraryItems]     = useState<any[]>([])

  // Pre-publish AI check
  const [preCheckModal, setPreCheckModal]   = useState<{ issues_fr: string[]; issues_en: string[] } | null>(null)
  const [preCheckLoading, setPreCheckLoading] = useState(false)

  // Scheduling - empty string means "publish now"
  const [scheduledAt, setScheduledAt] = useState('')
  const [showScheduler, setShowScheduler] = useState(false)

  const mediaInputRef   = useRef<HTMLInputElement>(null)
  const contentInputRef = useRef<HTMLTextAreaElement>(null)
  const emojiRef        = useRef<HTMLDivElement>(null)

  // Library
  useEffect(() => {
    let alive = true
    if (!activeCompany) { setLibraryItems([]); return }
    listDataverseLibraryItems(activeCompany.id)
      .then(data => { if (alive) setLibraryItems(data) })
    return () => { alive = false }
  }, [activeCompany?.id])

  // Keep a ref to preset so effects always read the current value (avoids stale closure)
  const presetRef = useRef<Preset>(preset)
  useEffect(() => { presetRef.current = preset }, [preset])

  // URL param preload - waits for libraryItems to be populated before applying
  const pendingItemId = useRef<string | null>(null)

  useEffect(() => {
    const id = searchParams.get('item')
    if (!id) return
    pendingItemId.current = id
    const item = libraryItems.find(c => c.id === id)
    if (item) {
      const { body, tags } = splitBodyAndTags(item, presetRef.current === 'professional')
      setContent(body)
      setHashtags(tags)
      setMedia([])
      setSelectedItemId(id)
      setBeforeTone(null)
      pendingItemId.current = null
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply the pending item as soon as libraryItems loads
  useEffect(() => {
    if (!pendingItemId.current || libraryItems.length === 0) return
    const item = libraryItems.find(c => c.id === pendingItemId.current)
    if (!item) return
    const { body, tags } = splitBodyAndTags(item, presetRef.current === 'professional')
    setContent(body)
    setHashtags(tags)
    setMedia([])
    setSelectedItemId(item.id)
    setBeforeTone(null)
    pendingItemId.current = null
  }, [libraryItems])

  // Close emoji on outside click
  useEffect(() => {
    if (!emojiOpen) return
    const h = (e: MouseEvent) => { if (!emojiRef.current?.contains(e.target as Node)) setEmojiOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [emojiOpen])

  // Media
  const addMedia = useCallback((files: FileList | null) => {
    if (!files) return
    const valid = Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (valid.find(f => f.size > 50 * 1024 * 1024)) { setToast(lang === 'fr' ? 'Fichier > 50 Mo.' : 'File > 50 MB.'); return }
    setMedia(prev => [...prev, ...valid.map(f => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      file: f, previewUrl: URL.createObjectURL(f),
      kind: f.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }))])
  }, [lang])

  const removeMedia = useCallback((id: string) => {
    setMedia(prev => { const m = prev.find(x => x.id === id); if (m) URL.revokeObjectURL(m.previewUrl); return prev.filter(x => x.id !== id) })
  }, [])

  const uploadMedia = async (item: SelectedMedia): Promise<string> => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) throw new Error('Cloudinary not configured.')
    const body = new FormData()
    body.append('file', item.file); body.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${item.kind}/upload`, { method: 'POST', body })
    const r = await res.json() as { secure_url?: string; error?: { message?: string } }
    if (!res.ok || !r.secure_url) throw new Error(r.error?.message ?? 'Upload failed')
    return r.secure_url
  }

  // AI tone
  const applyTone = useCallback(async (tone: typeof TONES[0]) => {
    const text = content.trim()
    if (!text || !apiKeyConfigured) return
    setToningId(tone.id); setToneError('')
    try {
      const ctx = buildAiContext({ company: activeCompany, products, segments, keyMessages })
      const result = await callGroq(activeCompany?.id ?? '', [
        { role: 'system', content: `You are a social media copywriter. ${tone.prompt}\n\nBrand context:\n${ctx}\n\nReturn ONLY the rewritten post. No explanation, no quotes. Respond in ${lang === 'fr' ? 'French' : 'English'}.` },
        { role: 'user', content: text },
      ], { temperature: 0.75, max_tokens: 1024 })
      const cleaned = result.trim().replace(/^["']|["']$/g, '')
      if (cleaned) { setBeforeTone(content); setContent(cleaned) }
    } catch (e: any) {
      const k = buildGroqError(e)
      setToneError(k === 'error.noKey' ? (lang === 'fr' ? 'Clé Groq manquante.' : 'Missing Groq key.')
        : k === 'error.429' ? (lang === 'fr' ? 'Limite atteinte.' : 'Rate limit hit.')
        : (lang === 'fr' ? 'Erreur IA.' : 'AI error.'))
    } finally { setToningId(null) }
  }, [content, apiKeyConfigured, lang, activeCompany, products, segments, keyMessages])

  // Pre-publish AI check - fast, non-blocking
  const handlePreCheck = async () => {
    const fullText = (preset !== 'professional' && hashtags.trim())
      ? `${content.trim()}\n\n${hashtags.trim()}` : content.trim()
    if (!activeCompany || !fullText || selectedProfiles.length === 0) return

    // Skip AI check if Groq not configured - go straight to publish
    if (!apiKeyConfigured) { handlePublish(); return }

    setPreCheckLoading(true)
    try {
      const selectedServices = selectedProfiles
        .map(id => channels.find(c => c.id === id)?.service ?? '')
        .filter(Boolean).join(', ')
      const charLimit = presetCfg.charLimit
      const ctx = buildAiContext({ company: activeCompany, products, segments, keyMessages })

      const result = await callGroq(activeCompany?.id ?? '', [
        {
          role: 'system',
          content: `You are a social media publishing assistant doing a quick pre-flight check. Analyze this post and return ONLY a JSON object: {"issues_fr":["string"],"issues_en":["string"]} with 0–2 issues each (max 15 words per issue). issues_fr in French, issues_en in English. Flag ONLY real problems: missing CTA when the goal is conversion, text significantly over the ${charLimit}-char limit for ${preset}, tone clearly mismatched with the brand. If the post is fine, return {"issues_fr":[],"issues_en":[]}. Do not invent issues. Brand context:\n${ctx}`,
        },
        { role: 'user', content: `Post text (${fullText.length} chars):\n${fullText.slice(0, 600)}\n\nTarget channels: ${selectedServices}\nPreset: ${preset}` },
      ], { temperature: 0.1, max_tokens: 150 })

      let issues_fr: string[] = []
      let issues_en: string[] = []
      try {
        const parsed = JSON.parse(result.trim())
        if (Array.isArray(parsed.issues_fr)) issues_fr = parsed.issues_fr.filter((s: unknown): s is string => typeof s === 'string').slice(0, 2)
        if (Array.isArray(parsed.issues_en)) issues_en = parsed.issues_en.filter((s: unknown): s is string => typeof s === 'string').slice(0, 2)
      } catch { /* treat as no issues */ }

      if (issues_fr.length === 0 && issues_en.length === 0) {
        handlePublish()
      } else {
        setPreCheckModal({ issues_fr, issues_en })
      }
    } catch {
      // AI check failed - don't block publishing
      handlePublish()
    } finally {
      setPreCheckLoading(false)
    }
  }

  // Publish
  const handlePublish = async () => {
    // Professional: hashtags are already merged into the body text.
    // Feed / Short-form: hashtags live in a separate field - append them.
    const fullText = (preset !== 'professional' && hashtags.trim())
      ? `${content.trim()}\n\n${hashtags.trim()}` : content.trim()
    if (!activeCompany || !fullText || selectedProfiles.length === 0) return
    setIsPublishing(true)
    try {
      let um = media
      if (media.some(m => !m.publicUrl)) {
        setUpImg(true); um = []
        for (const item of media) um.push({ ...item, publicUrl: item.publicUrl ?? await uploadMedia(item) })
        setMedia(um); setUpImg(false)
      }
      const results = await Promise.all(selectedProfiles.map(channelId => {
        const service = channels.find((p: any) => p.id === channelId)?.service?.toLowerCase() ?? ''
        let meta = ''
        if (service === 'facebook') meta = `metadata: { facebook: { type: post } }`
        else if (service === 'instagram') meta = `metadata: { instagram: { type: feed } }`
        const assets = um.filter(m => m.publicUrl).map(m =>
          m.kind === 'video' ? `{ video: { url: "${m.publicUrl}" } }` : `{ image: { url: "${m.publicUrl}" } }`)

        // Scheduling: customScheduled + dueAt, or automatic + shareNow
        const isScheduled = scheduledAt.trim() !== ''
        const schedulingBlock = isScheduled
          ? `schedulingType: customScheduled, mode: customScheduled, dueAt: "${new Date(scheduledAt).toISOString()}"`
          : `schedulingType: automatic, mode: shareNow`

        return bufferQuery(activeCompany.id, `
          mutation CreatePost($text: String!, $channelId: ChannelId!) {
            createPost(input: { text: $text, channelId: $channelId,
              ${schedulingBlock} ${meta}
              ${assets.length ? `assets: [${assets.join(',')}]` : ''} }) {
              ... on PostActionSuccess { post { id dueAt } }
              ... on MutationError { message }
            }
          }`, { text: fullText, channelId })
      }))
      const err = results.find(r => r?.createPost?.message)
      if (err) throw new Error(err.createPost.message)
      if (selectedItemId) {
        await updateDataverseLibraryItem(selectedItemId, { status: 'Published' })
        setLibraryItems(items => items.map(i => i.id === selectedItemId ? { ...i, status: 'Published' } : i))
        window.dispatchEvent(new Event('flowcom:data-updated'))
      }
      setPublishSuccess(true)
      setTimeout(() => {
        setPublishSuccess(false); setContent(''); setHashtags(''); setBeforeTone(null)
        setScheduledAt(''); setShowScheduler(false)
        media.forEach(m => URL.revokeObjectURL(m.previewUrl)); setMedia([]); setSelectedItemId(null)
      }, 3000)
    } catch (e: any) {
      setToast(lang === 'fr' ? `Erreur : ${e.message}` : `Error: ${e.message}`)
    } finally { setUpImg(false); setIsPublishing(false) }
  }

  const charCount = (preset !== 'professional' && hashtags.trim() ? `${content}\n\n${hashtags}` : content).length

  // Load from library search
  const loadFromLibrary = (item: any) => {
    const { body, tags } = splitBodyAndTags(item, presetRef.current === 'professional')
    setContent(body)
    setHashtags(tags)
    setMedia([])
    setSelectedItemId(item.id)
    setBeforeTone(null)
  }

  // ─── Shared bottom toolbar ──────────────────────────────────────────────────
  const Toolbar = (
    <div className="relative flex items-center justify-between pt-2.5 mt-auto shrink-0">
      {/* Emoji */}
      <div className="relative">
        <button type="button"
          onClick={() => { setEmojiOpen(p => !p); setToneOpen(false) }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-muted)] hover:text-blue-500 hover:bg-[var(--color-surface-alt)] transition-colors">
          <Smile className="w-4 h-4" />{lang === 'fr' ? 'Emoji' : 'Emoji'}
        </button>
        {emojiOpen && (
          <div ref={emojiRef} className="absolute left-0 bottom-full mb-2 z-30">
            <EmojiPicker
              onEmojiClick={(d: EmojiClickData) => {
                const input = contentInputRef.current
                const s = input?.selectionStart ?? content.length
                const e2 = input?.selectionEnd ?? content.length
                setContent(`${content.slice(0, s)}${d.emoji}${content.slice(e2)}`)
                window.requestAnimationFrame(() => {
                  input?.focus(); const c = s + d.emoji.length; input?.setSelectionRange(c, c)
                })
              }}
              theme={theme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT}
              width={280} height={300} previewConfig={{ showPreview: false }}
              searchPlaceHolder={lang === 'fr' ? 'Rechercher' : 'Search'} lazyLoadEmojis
            />
          </div>
        )}
      </div>
      {/* Char count + AI */}
      <div className="relative flex items-center gap-3">
        <CharCount count={charCount} limit={presetCfg.charLimit} />
        <button type="button"
          onClick={() => { setToneOpen(p => !p); setEmojiOpen(false) }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors',
            toneOpen ? 'bg-purple-600 text-white' : 'text-[var(--color-text-muted)] hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20'
          )}>
          {toningId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          AI
        </button>
        <TonePopover open={toneOpen} onClose={() => setToneOpen(false)}
          onApply={t => { applyTone(t); setToneOpen(false) }}
          toningId={toningId} toneError={toneError} hasContent={!!content.trim()}
          apiOk={apiKeyConfigured} beforeTone={beforeTone}
          onUndo={() => { if (beforeTone !== null) { setContent(beforeTone); setBeforeTone(null) } }}
          lang={lang} />
      </div>
    </div>
  )

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-hidden">

      {toast && <Toast message={toast} onDismiss={dismissToast} />}

      {/* Pre-publish check modal */}
      {preCheckModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPreCheckModal(null)} />
          <div className="relative w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-5 z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--color-text)]">
                  {lang === 'fr' ? 'Vérification avant publication' : 'Pre-publish check'}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {lang === 'fr' ? 'L\'IA a détecté des points à revoir.' : 'The AI spotted a few things to review.'}
                </p>
              </div>
            </div>
            <ul className="space-y-2 mb-5">
              {(lang === 'fr' ? preCheckModal.issues_fr : preCheckModal.issues_en).map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text)]">
                  <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => setPreCheckModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
              >
                {lang === 'fr' ? 'Corriger d\'abord' : 'Fix first'}
              </button>
              <button
                onClick={() => { setPreCheckModal(null); handlePublish() }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-bold text-white transition-colors"
              >
                {lang === 'fr' ? 'Publier quand même' : 'Publish anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)] leading-tight">Studio</h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              {lang === 'fr' ? 'Publiez sur plusieurs réseaux via Buffer.' : 'Publish to multiple networks via Buffer.'}
            </p>
          </div>
        </div>

        {/* Library search- right of header */}
        <LibrarySearch items={libraryItems} onSelect={loadFromLibrary} lang={lang} />
      </div>

      {/* 2-col layout- fills all remaining height */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Left: composer card- fills full height ── */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">

            {/* Card header: preset tabs */}
            <div className="flex items-center gap-2 px-4 pt-3 pb-3 border-b border-[var(--color-border)] shrink-0 flex-wrap">
              <span className="text-sm font-bold text-[var(--color-text)] shrink-0 mr-1">
                {lang === 'fr' ? 'Composer' : 'Compose'}
              </span>
              {PRESETS.map(p => (
                <button key={p.id}
                  onClick={() => { setPreset(p.id); setToneError(''); setBeforeTone(null); setToneOpen(false) }}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all',
                    preset === p.id
                      ? 'bg-blue-600 text-white'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]'
                  )}>
                  {p.icon}{lang === 'fr' ? p.labelFr : p.label}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-[var(--color-text-muted)] italic hidden lg:block">
                {lang === 'fr' ? presetCfg.tipFr : presetCfg.tip}
              </span>
            </div>

            {/* ── PROFESSIONAL: textarea (flex-1) + side media panel ── */}
            {preset === 'professional' && (
              <div className="flex flex-col flex-1 min-h-0 p-4 gap-0">
                <div className="flex gap-3 flex-1 min-h-0">
                  <textarea ref={contentInputRef} value={content}
                    onChange={e => { setContent(e.target.value); setSelectedItemId(null); setBeforeTone(null) }}
                    placeholder={lang === 'fr' ? presetCfg.placeholderFr : presetCfg.placeholder}
                    className="flex-1 min-h-0 p-3.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-[var(--color-text)] resize-none" />
                  <div className="flex flex-col gap-2 w-28 shrink-0 overflow-y-auto">
                    <MediaPanel media={media} onAdd={addMedia} onRemove={removeMedia}
                      uploadingImage={uploadingImage} aspect="side" lang={lang} inputRef={mediaInputRef} />
                  </div>
                </div>
                {Toolbar}
              </div>
            )}

            {/* ── FEED: textarea + square media + hashtag strip ── */}
            {preset === 'feed' && (
              <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">
                <div className="flex gap-3 flex-1 min-h-0">
                  <textarea ref={contentInputRef} value={content}
                    onChange={e => { setContent(e.target.value); setSelectedItemId(null); setBeforeTone(null) }}
                    placeholder={lang === 'fr' ? presetCfg.placeholderFr : presetCfg.placeholder}
                    className="flex-1 min-h-0 p-3.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-[var(--color-text)] resize-none" />
                  {/* Square media: upload card + thumbnails scrollable below */}
                  <div className="flex flex-col gap-2 w-28 shrink-0 overflow-y-auto">
                    <MediaPanel media={media} onAdd={addMedia} onRemove={removeMedia}
                      uploadingImage={uploadingImage} aspect="square" lang={lang} inputRef={mediaInputRef} />
                  </div>
                </div>
                {/* Hashtags */}
                <div className="shrink-0">
                  <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide flex items-center gap-1 mb-1">
                    <Hash className="w-3 h-3" /> Hashtags
                  </label>
                  <input value={hashtags} onChange={e => setHashtags(e.target.value)}
                    placeholder="#marketing #socialmedia"
                    className="w-full px-3 py-2 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-[var(--color-text)]" />
                </div>
                {Toolbar}
              </div>
            )}

            {/* ── SHORT-FORM: LEFT=portrait player/picker  RIGHT=hook+hashtags+toolbar ── */}
            {preset === 'shortform' && (
              <div className="flex gap-3 flex-1 min-h-0 p-4">

                {/* LEFT- 9:16 portrait, height fills the card */}
                <div className="flex flex-col min-h-0 shrink-0" style={{ width: '240px' }}>
                  <div
                    role={media.length === 0 ? 'button' : undefined}
                    tabIndex={media.length === 0 ? 0 : undefined}
                    onClick={media.length === 0 ? () => mediaInputRef.current?.click() : undefined}
                    onKeyDown={media.length === 0 ? (e => (e.key === 'Enter' || e.key === ' ') && mediaInputRef.current?.click()) : undefined}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); addMedia(e.dataTransfer.files as FileList) }}
                    className={cn(
                      'relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed overflow-hidden transition-colors flex-1 min-h-0',
                      'bg-[var(--color-surface-alt)]',
                      media.length > 0
                        ? 'border-blue-400 cursor-default'
                        : 'border-[var(--color-border)] hover:border-blue-400 cursor-pointer'
                    )}
                  >
                    {media.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <Film className="w-10 h-10 text-blue-400 opacity-60" />
                        <span className="text-sm font-semibold text-[var(--color-text-muted)]">9:16</span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {lang === 'fr' ? 'Cliquer ou déposer' : 'Click or drop'}
                        </span>
                      </div>
                    ) : (
                      <MediaPlayer item={media[0]} onRemove={() => removeMedia(media[0].id)} />
                    )}
                    <input ref={mediaInputRef} type="file" accept="image/*,video/*"
                      multiple className="hidden"
                      onChange={e => addMedia(e.target.files)} />
                  </div>

                  {/* Extra thumbnails below */}
                  {media.length > 1 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto shrink-0">
                      {media.slice(1).map(item => (
                        <div key={item.id}
                          className="relative rounded-xl overflow-hidden border border-[var(--color-border)] group shrink-0 w-16 h-16">
                          {item.kind === 'video'
                            ? <video src={item.previewUrl} className="w-full h-full object-cover" muted />
                            : <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />}
                          <button type="button" onClick={() => removeMedia(item.id)}
                            className="absolute top-0.5 left-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* RIGHT- hook + hashtags + toolbar, compact width */}
                <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-3">
                  <div className="flex flex-col flex-1 min-h-0">
                    <label className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1 block shrink-0">
                      🎣 {lang === 'fr' ? 'Accroche' : 'Hook'}
                    </label>
                    <textarea ref={contentInputRef} value={content}
                      onChange={e => { setContent(e.target.value); setSelectedItemId(null); setBeforeTone(null) }}
                      placeholder={lang === 'fr' ? presetCfg.placeholderFr : presetCfg.placeholder}
                      className="flex-1 min-h-0 w-full p-3 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-[var(--color-text)] resize-none" />
                  </div>
                  <div className="shrink-0">
                    <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide flex items-center gap-1 mb-1">
                      <Hash className="w-3 h-3" /> Hashtags
                    </label>
                    <input value={hashtags} onChange={e => setHashtags(e.target.value)}
                      placeholder="#fyp #trend"
                      className="w-full px-3 py-2 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-[var(--color-text)]" />
                  </div>
                  {Toolbar}
                </div>

              </div>
            )}

          </div>
        </div>{/* end left */}

        {/* ── Right: channels + publish- same height as left ── */}
        <div className="flex flex-col gap-3 w-60 shrink-0 min-h-0">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm flex flex-col flex-1 min-h-0">
            <p className="text-sm font-bold text-[var(--color-text)] mb-0.5 shrink-0">
              {lang === 'fr' ? 'Réseaux' : 'Channels'}
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] mb-3 shrink-0">
              {lang === 'fr' ? 'Profils' : 'profiles'}
            </p>
            <div className="flex-1 overflow-y-auto min-h-0">
              {loadingProfiles
                ? <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" /></div>
                : channels.length > 0
                  ? <div className="flex flex-col gap-2">
                      {channels.map((p: any) => (
                        <button key={p.id}
                          onClick={() => setSelectedProfiles(prev =>
                            prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                          className={cn(
                            'flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left',
                            selectedProfiles.includes(p.id)
                              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 ring-1 ring-blue-500'
                              : 'bg-[var(--color-surface-alt)] border-[var(--color-border)] hover:border-blue-300'
                          )}>
                          {p.avatar
                            ? <img src={p.avatar} alt="" className="w-7 h-7 rounded-full shrink-0" />
                            : <div className="w-7 h-7 rounded-full bg-[var(--color-bg)] shrink-0 flex items-center justify-center text-xs font-bold text-[var(--color-text-muted)]">
                                {p.name?.[0]?.toUpperCase() ?? '?'}
                              </div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[var(--color-text)] truncate">{p.name}</p>
                            <p className="text-[9px] text-[var(--color-text-muted)] capitalize">{p.service}</p>
                          </div>
                          {selectedProfiles.includes(p.id) && <CheckSquare className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  : <div className="text-center p-3 space-y-1">
                      <p className="text-xs text-[var(--color-text-muted)] italic">{lang === 'fr' ? 'Aucun profil.' : 'No profiles.'}</p>
                      <p className="text-[9px] text-[var(--color-text-muted)]">{lang === 'fr' ? 'Vérifiez votre clé Buffer.' : 'Check your Buffer key.'}</p>
                    </div>
              }
            </div>
          </div>

          {/* ── Schedule picker ── */}
          <div className="shrink-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
            <button
              onClick={() => { setShowScheduler(s => !s); if (showScheduler) setScheduledAt('') }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-left transition-colors hover:bg-[var(--color-surface-alt)]"
            >
              <CalendarClock className={cn('w-4 h-4 shrink-0', scheduledAt ? 'text-blue-500' : 'text-[var(--color-text-muted)]')} />
              <span className={cn('flex-1', scheduledAt ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]')}>
                {scheduledAt
                  ? new Date(scheduledAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : (lang === 'fr' ? 'Programmer pour plus tard' : 'Schedule for later')}
              </span>
              {scheduledAt && (
                <button
                  onClick={e => { e.stopPropagation(); setScheduledAt(''); setShowScheduler(false) }}
                  className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </button>
            {showScheduler && (
              <div className="px-4 pb-3 border-t border-[var(--color-border)]">
                <label className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide block mt-2.5 mb-1.5">
                  {lang === 'fr' ? 'Date et heure de publication' : 'Publish date & time'}
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-blue-500"
                />
                {scheduledAt && (
                  <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">
                    {lang === 'fr' ? '⏰ Sera envoyé à Buffer pour publication programmée.' : '⏰ Will be sent to Buffer as a scheduled post.'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Publish / Schedule button ── */}
          <button onClick={handlePreCheck}
            disabled={isPublishing || preCheckLoading || !content.trim() || selectedProfiles.length === 0}
            className={cn(
              'shrink-0 w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold rounded-xl transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-white',
              scheduledAt
                ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
            )}>
            {preCheckLoading ? <><Loader2 className="w-4 h-4 animate-spin" />{lang === 'fr' ? 'Vérification…' : 'Checking…'}</>
              : isPublishing ? <><Loader2 className="w-4 h-4 animate-spin" />{lang === 'fr' ? 'Envoi…' : 'Sending…'}</>
              : publishSuccess ? <><Check className="w-4 h-4" />{lang === 'fr' ? 'Envoyé !' : 'Sent!'}</>
              : scheduledAt
                ? <><CalendarClock className="w-4 h-4" />{lang === 'fr' ? 'Programmer' : 'Schedule'}</>
                : <><Send className="w-4 h-4" />{lang === 'fr' ? 'Publier' : 'Publish Now'}</>}
          </button>
        </div>

      </div>
    </div>
  )
}
