import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FileText, Sparkles, Save, Check, Copy,
  AlertCircle, RefreshCw, Camera, X, ChevronDown, StickyNote, Wand2, Loader2,
} from 'lucide-react'
import {
  FaLinkedinIn, FaInstagram, FaTiktok, FaFacebookF,
  FaYoutube, FaXTwitter, FaWhatsapp, FaEnvelope, FaWordpress, FaPodcast,
} from 'react-icons/fa6'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { callGroqJSON, buildGroqError } from '@/lib/groq'
import { buildAiContext } from '@/lib/aiContext'
import { supabase } from '@/lib/supabase'
import { toLibraryInsert } from '@/lib/dataMappers'
import { cn } from '@/lib/utils'
import { HfInference } from '@huggingface/inference'

// ─── Types ─────────────────────────────────────────────────────
interface GeneratedPost {
  content: string
  visualIdea: string
}

// ─── Channel config ────────────────────────────────────────────
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

const SECTION_LABELS: Record<keyof GeneratedPost, { fr: string; en: string }> = {
  content:        { fr: 'Contenu (Prêt à publier)', en: 'Content (Ready to publish)' },
  visualIdea:     { fr: 'Idée visuelle IA',   en: 'AI Visual Idea' },
}

// ─── Chip ──────────────────────────────────────────────────────
function Chip({ active, onClick, children, activeColor }: {
  active: boolean; onClick: () => void; children: React.ReactNode; activeColor?: string
}) {
  return (
    <button onClick={onClick}
      className={cn('px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all whitespace-nowrap',
        active ? 'text-white border-transparent shadow-sm'
               : 'text-[var(--color-text-muted)] border-[var(--color-border)] bg-[var(--color-surface-alt)] hover:border-indigo-400 hover:text-[var(--color-text)]'
      )}
      style={active ? { backgroundColor: activeColor ?? '#4f46e5', borderColor: activeColor ?? '#4f46e5' } : {}}
    >{children}</button>
  )
}

// ─── Copy button ───────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) }
  return (
    <button onClick={copy} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── Skeleton section ──────────────────────────────────────────
function SkeletonSection({ wide = false }: { wide?: boolean }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 animate-pulse space-y-3 h-full">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[var(--color-border)]" />
        <div className="h-3 w-24 bg-[var(--color-border)] rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-3 rounded-full bg-[var(--color-border)]" style={{ width: wide ? '88%' : '68%' }} />
        <div className="h-3 rounded-full bg-[var(--color-border)] opacity-60" style={{ width: wide ? '72%' : '52%' }} />
        {wide && <div className="h-3 rounded-full bg-[var(--color-border)] opacity-40" style={{ width: '60%' }} />}
      </div>
    </div>
  )
}

// ─── Output section card ───────────────────────────────────────
function SectionCard({ icon: Icon, iconColor, label, content, editable, onChange }: {
  icon: React.ElementType; iconColor: string
  label: string; content: string; editable: boolean; onChange: (v: string) => void
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 hover:border-violet-200 dark:hover:border-violet-800 transition-colors flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn('w-7 h-7 rounded-lg bg-[var(--color-surface-alt)] flex items-center justify-center', iconColor)}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{label}</span>
        </div>
        <CopyBtn text={content} />
      </div>
      {editable
        ? <textarea value={content} onChange={e => onChange(e.target.value)}
            className="w-full flex-1 min-h-[100px] text-sm text-[var(--color-text)] bg-[var(--color-surface-alt)] rounded-lg px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-violet-500 leading-relaxed" />
        : <p className="text-sm flex-1 text-[var(--color-text)] leading-relaxed whitespace-pre-wrap overflow-y-auto pr-2">{content}</p>
      }
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function ContentGeneratorPage() {
  const { t, lang } = useI18n()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const [searchParams] = useSearchParams()

  // Initial load from localStorage
  const loadDraft = () => {
    try {
      const saved = localStorage.getItem('flowcom:cg_state')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  }
  const savedState = loadDraft()

  const [contentType, setContentType] = useState<'Post' | 'Carousel' | 'Video' | 'Story'>(savedState?.contentType || 'Post')
  const [channel, setChannel]         = useState(savedState?.channel || 'linkedin')
  const [topic, setTopic]             = useState(savedState?.topic || '')
  const [angle, setAngle]             = useState(savedState?.angle || '')
  const [notes, setNotes]             = useState(savedState?.notes || '')
  const [tone, setTone]               = useState<'professional' | 'casual'>(savedState?.tone || 'professional')
  const [localSlang, setLocalSlang]   = useState(savedState?.localSlang || '')
  const [calendarGoal, setCalendarGoal] = useState(savedState?.calendarGoal || '')
  const [post, setPost]               = useState<GeneratedPost | null>(savedState?.post || null)
  const [imageSeed, setImageSeed]     = useState(Date.now())
  const [hfImageUrl, setHfImageUrl]   = useState<string>('')
  const [generatingImage, setGeneratingImage] = useState(false)

  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [saved, setSaved]             = useState(false)
  const [editable, setEditable]       = useState(false)

  // ── Hook scorer state ─────────────────────────────────────────────────────
  type HookScore = { scrollStop: 'Weak' | 'Good' | 'Strong'; clarity: 'Weak' | 'Good' | 'Strong'; intrigue: 'Weak' | 'Good' | 'Strong'; suggestion: string }
  const [hookScore, setHookScore]       = useState<HookScore | null>(null)
  const [hookScoring, setHookScoring]   = useState(false)
  const scoredContentRef                = useRef<string>('')

  useEffect(() => {
    if (!post?.visualIdea) return
    const hfToken = import.meta.env.VITE_HF_ACCESS_TOKEN
    if (!hfToken) {
      setHfImageUrl('')
      return
    }

    let active = true
    const fetchImage = async () => {
      setGeneratingImage(true)
      try {
        const hf = new HfInference(hfToken)
        const blob = await hf.textToImage({
          model: 'black-forest-labs/FLUX.1-schnell',
          inputs: post.visualIdea
        })
        if (active) setHfImageUrl(typeof blob === 'string' ? blob : URL.createObjectURL(blob as unknown as Blob))
      } catch (err) {
        console.error("HF fetch failed", err)
        if (active) setHfImageUrl('') 
      } finally {
        if (active) setGeneratingImage(false)
      }
    }
    fetchImage()
    return () => { active = false }
  }, [post?.visualIdea, imageSeed])

  // Save to localStorage when things change
  useEffect(() => {
    localStorage.setItem('flowcom:cg_state', JSON.stringify({
      contentType, channel, topic, angle, notes, tone, localSlang, calendarGoal, post
    }))
  }, [contentType, channel, topic, angle, notes, tone, localSlang, calendarGoal, post])

  // Override from URL if coming from Calendar
  useEffect(() => {
    const tp = searchParams.get('topic'); const ch = searchParams.get('channel'); const gl = searchParams.get('goal'); const fm = searchParams.get('format')
    if (tp || ch || gl || fm) {
      if (tp) setTopic(tp); if (ch && CHANNEL_MAP[ch]) setChannel(ch); if (gl) setCalendarGoal(gl)
      if (fm && ['Post', 'Carousel', 'Video', 'Story'].includes(fm)) setContentType(fm as any)
      setPost(null) // Reset generated output for new topic
      // Clear URL params so refresh doesn't trigger override again
      window.history.replaceState({}, '', '/content')
    }
  }, [searchParams])

  const buildContext = useCallback(() => {
    return buildAiContext({ company: activeCompany, products, segments, keyMessages })
  }, [activeCompany, products, segments, keyMessages])

  const handleGenerate = async () => {
    if (!topic.trim())     { setError(t('content.errorNoTopic')); return }
    setLoading(true); setError(''); setPost(null); setEditable(false); setSaved(false)

    const channelLabel = CHANNEL_MAP[channel]?.label ?? channel
    const toneDesc = tone === 'professional'
      ? (lang === 'fr' ? 'Professionnel: sérieux, max 2 emojis, autoritaire' : 'Professional: serious, max 2 emojis, authoritative')
      : (lang === 'fr' ? `Casual/Local: dynamique, max 6 emojis${localSlang ? `, argot: ${localSlang}` : ''}` : `Casual/Local: energetic, max 6 emojis${localSlang ? `, slang: ${localSlang}` : ''}`)

    let formatInstructions = ''
    if (contentType === 'Post') {
      formatInstructions = `- A scroll-stopping hook\n- The core value/body with line breaks\n- A clear call to action\n- Relevant hashtags at the end\nThe "visualIdea" field should be a short AI image prompt describing the ideal visual.`
    } else if (contentType === 'Carousel') {
      formatInstructions = `- Format as distinct slides (e.g., Slide 1:, Slide 2:, etc.)\n- Keep each slide punchy and easy to read\n- End with a CTA slide\nThe "visualIdea" field should describe the visual theme for the slides.`
    } else if (contentType === 'Video') {
      formatInstructions = `- Format with [HOOK 0-5s], [SCENE 1], etc.\n- Include both visual cues and dialogue\n- End with a strong verbal CTA\nThe "visualIdea" field should be an AI image prompt for the YouTube/TikTok Thumbnail.`
    } else if (contentType === 'Story') {
      formatInstructions = `- Format as 3-5 distinct Story frames\n- Highly engaging, short text for vertical mobile viewing\n- Include poll/sticker ideas\nThe "visualIdea" field should describe the background visual for the first frame.`
    }

    const sys = `You are an expert social media copywriter for ${channelLabel}. Return ONLY valid JSON:
{"content":"string","visualIdea":"string"}
Brand context:\n${buildContext()}`

    const usr = `Create a complete ${channelLabel} content piece.
Format: ${contentType}
Topic: ${topic}${angle ? `\nAngle (narrative spin): ${angle}` : ''}${calendarGoal ? `\nCampaign goal: ${calendarGoal}` : ''}
Tone: ${toneDesc}${notes ? `\n\nEDITORIAL NOTES (follow strictly):\n${notes}` : ''}

The "content" field should be the COMPLETE ready-to-publish ${contentType} text. It must include:
${formatInstructions}

Respond ONLY in ${lang === 'fr' ? 'French' : 'English'}.`

    try {
      const generated = await callGroqJSON<GeneratedPost>('', [{ role: 'system', content: sys }, { role: 'user', content: usr }], { temperature: 0.8, max_tokens: 3000, requiredKeys: ['content', 'visualIdea'] })
      setImageSeed(Date.now())
      setPost(generated)
    } catch (e) { setError(t(buildGroqError(e) as Parameters<typeof t>[0])) }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!post) return
    if (!activeCompany) {
      setError(lang === 'fr' ? 'Aucune entreprise active.' : 'No active company.')
      return
    }
    const draft = toLibraryInsert({
      title: topic,
      hook: post.content.split('\n')[0] ?? '',
      episode_context: '', body: post.content,
      conclusion: '', reward: '', cta: '',
      hashtags: '', visual_idea: post.visualIdea ?? '',
      video_script: contentType === 'Video' ? post.content : '',
      channel, format: contentType.toLowerCase(),
      tone, status: 'Draft', publish_date: null,
    }, activeCompany.id)
    const { error } = await supabase.from('library_items').insert(draft)
    if (error) {
      setError(buildGroqError(error))
      return
    }
    window.dispatchEvent(new Event('flowcom:data-updated'))
    setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const channelMeta = CHANNEL_MAP[channel]
  const hasOutput = !!post

  // ── Hook scorer — fires automatically 600ms after generation completes ────
  useEffect(() => {
    if (!post?.content || !apiKeyConfigured) { setHookScore(null); return }
    const hook = post.content.split('\n').find(l => l.trim().length > 0) ?? ''
    if (!hook || scoredContentRef.current === hook) return

    const timer = setTimeout(async () => {
      setHookScoring(true)
      try {
        type ScoreResult = { scrollStop: string; clarity: string; intrigue: string; suggestion: string }
        const result = await callGroqJSON<ScoreResult>('', [
          {
            role: 'system',
            content: `You are a social media hook analyst. Score this hook on 3 axes. Return JSON exactly: {"scrollStop":"Weak|Good|Strong","clarity":"Weak|Good|Strong","intrigue":"Weak|Good|Strong","suggestion":"one concrete improvement in max 15 words"}. Be honest and strict — most hooks are Weak or Good, Strong is rare. Respond ONLY in ${lang === 'fr' ? 'French' : 'English'}.`,
          },
          { role: 'user', content: `Hook: "${hook}"\nChannel: ${CHANNEL_MAP[channel]?.label ?? channel}\nTone: ${tone}` },
        ], { temperature: 0.2, max_tokens: 150, requiredKeys: ['scrollStop', 'clarity', 'intrigue', 'suggestion'] })

        const valid = ['Weak', 'Good', 'Strong']
        if (valid.includes(result.scrollStop) && valid.includes(result.clarity) && valid.includes(result.intrigue) && result.suggestion) {
          setHookScore(result as HookScore)
          scoredContentRef.current = hook
        }
      } catch {
        // Silently fail — non-critical
      } finally {
        setHookScoring(false)
      }
    }, 600)

    return () => clearTimeout(timer)
  }, [post?.content, apiKeyConfigured]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col p-4 sm:p-6 gap-4">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                {t('content.badge')}
              </span>
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text)] font-sans leading-tight">{t('content.title')}</h1>
            <p className="text-xs text-[var(--color-text-muted)]">{t('content.subtitle')}</p>
          </div>
        </div>

        {/* Format toggle top-right */}
        <div className="flex items-center gap-1 p-1 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl">
          {[
            { value: 'Post',     label: 'Post' },
            { value: 'Carousel', label: 'Carousel' },
            { value: 'Video',    label: 'Video' },
            { value: 'Story',    label: 'Story' },
          ].map(opt => (
              <button key={opt.value} onClick={() => setContentType(opt.value as any)}
                className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all',
                  contentType === opt.value
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                )}>
                {opt.label}
              </button>
            )
          )}
        </div>
      </div>

      {/* ── Config panel ── */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shrink-0 space-y-4">

        {/* Calendar banner */}
        {calendarGoal && (
          <div className="flex items-center gap-2 p-2.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs text-indigo-700 dark:text-indigo-300">
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 min-w-0"><span className="font-semibold">{t('content.fromCalendar')}</span> {calendarGoal}</span>
            <button onClick={() => setCalendarGoal('')} className="hover:opacity-70"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">

          {/* Channel */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">{t('content.channel')}</label>
            <div className="relative">
              <select value={channel} onChange={e => setChannel(e.target.value)}
                className="w-full appearance-none pl-9 pr-8 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm font-semibold text-[var(--color-text)] outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer">
                {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {channelMeta && (
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <channelMeta.icon style={{ color: channelMeta.color, fontSize: 15 }} />
                </div>
              )}
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--color-text-muted)]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Topic */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">{t('content.topic')}</label>
            <input value={topic} onChange={e => setTopic(e.target.value)}
              placeholder={t('content.topicPh')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-[var(--color-text-muted)]" />
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">{t('content.toneLabel')}</label>
            <div className="flex flex-wrap gap-2">
              <Chip active={tone === 'professional'} onClick={() => setTone('professional')} activeColor="#7c3aed">
                {t('content.toneProfessional')}
              </Chip>
              <Chip active={tone === 'casual'} onClick={() => setTone('casual')} activeColor="#7c3aed">
                {t('content.toneCasual')}
              </Chip>
              {tone === 'casual' && (
                <input value={localSlang} onChange={e => setLocalSlang(e.target.value)}
                  placeholder={t('content.toneLocalSlangPh')}
                  className="px-3 py-2 rounded-xl border border-violet-300 dark:border-violet-800 bg-[var(--color-surface-alt)] text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-[var(--color-text-muted)]" />
              )}
            </div>
          </div>

          {/* Angle */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">
              {t('content.angle')}
              <span className="ml-2 text-[10px] font-normal text-[var(--color-text-muted)] italic">
                {lang === 'fr' ? '(spin narratif unique)' : '(unique narrative spin)'}
              </span>
            </label>
            <input value={angle} onChange={e => setAngle(e.target.value)}
              placeholder={t('content.anglePh')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-[var(--color-text-muted)]" />
          </div>

          {/* Notes — full width */}
          <div className="space-y-2 md:col-span-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">
              <span className="inline-flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                {lang === 'fr' ? 'Notes & Instructions spécifiques' : 'Notes & Specific Instructions'}
                <span className="text-[10px] font-normal text-[var(--color-text-muted)] italic">
                  {lang === 'fr' ? '(optionnel — l\'IA les suit strictement)' : '(optional — AI follows strictly)'}
                </span>
              </span>
            </label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={lang === 'fr'
                ? 'Ex: Mentionner la promo de septembre. Pas de listes. Inclure une stat. Max 150 mots...'
                : 'E.g. Mention our October promo. No bullet points. Include a stat. Keep under 150 words...'}
              className="w-full px-3.5 py-2.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-[var(--color-text-muted)]" />
          </div>
        </div>

        {/* Summary + Generate row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <div className="w-4 h-4 rounded-full border-2 border-violet-500 flex items-center justify-center shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            </div>
            <span>
              {lang === 'fr' ? 'Génération pour' : 'Generating for'}{' '}
              <span className="font-bold" style={{ color: channelMeta?.color ?? '#7c3aed' }}>
                {channelMeta?.label ?? channel}
              </span>
              {' · '}
              <span className="font-bold text-[var(--color-text)] capitalize">{tone}</span>
              {' · '}
              <span className="font-bold text-violet-500">{contentType}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasOutput && (
              <>
                <button onClick={() => setEditable(e => !e)}
                  className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors',
                    editable
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                      : 'bg-[var(--color-surface-alt)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  )}>
                  {editable ? <><Check className="w-3.5 h-3.5" />{lang === 'fr' ? 'Édition' : 'Editing'}</> : <>{lang === 'fr' ? 'Modifier' : 'Edit'}</>}
                </button>
                <button onClick={handleSave} disabled={saved}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors">
                  {saved ? <><Check className="w-3.5 h-3.5" />{t('content.saved')}</> : <><Save className="w-3.5 h-3.5" />{t('content.saveToLibrary')}</>}
                </button>
              </>
            )}
            <button onClick={handleGenerate} disabled={loading || !topic.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-violet-200 dark:shadow-none">
              {loading
                ? <><RefreshCw className="w-4 h-4 animate-spin" />{t('content.generating')}</>
                : <><Sparkles className="w-4 h-4" />{t('content.generateContent')}</>}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
          </div>
        )}
      </div>

      {/* ── Output area ── */}
      <div className="pb-6 flex-1 flex flex-col min-h-[400px]">

        {/* Empty state */}
        {!loading && !hasOutput && (
          <div className="flex flex-col items-center justify-center text-center py-16 flex-1">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mb-3 shadow-sm">
              <Sparkles className="w-6 h-6 text-[var(--color-text-muted)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--color-text)] mb-1">{lang === 'fr' ? 'Aucun contenu généré' : 'Nothing generated yet'}</p>
            <p className="text-xs text-[var(--color-text-muted)] max-w-xs">{t('content.subtitle')}</p>
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 w-full h-full">
            <SkeletonSection wide={true} />
            <SkeletonSection wide={false} />
          </div>
        )}

        {/* Post output */}
        {!loading && post && (
          <div className="flex flex-col gap-4 w-full h-full">
            {/* Grid: left = text, right = image */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 flex-1 min-h-0">

              {/* Left Card: Text Content */}
              <SectionCard
                icon={FileText} iconColor="text-blue-500"
                label={SECTION_LABELS.content[lang]} content={post.content} editable={editable}
                onChange={val => setPost(prev => prev ? { ...prev, content: val } : prev)}
              />

              {/* Right Card: AI Image Generator */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col gap-3 h-full overflow-hidden hover:border-violet-200 dark:hover:border-violet-800 transition-colors">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-7 h-7 rounded-lg bg-[var(--color-surface-alt)] flex items-center justify-center text-cyan-500">
                    <Camera className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{SECTION_LABELS.visualIdea[lang]}</span>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={post.visualIdea}
                    onChange={e => setPost(prev => prev ? { ...prev, visualIdea: e.target.value } : prev)}
                    placeholder={lang === 'fr' ? 'Prompt pour l\'image...' : 'Image prompt...'}
                    className="w-full h-[60px] text-xs text-[var(--color-text)] bg-[var(--color-surface-alt)] rounded-lg px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-cyan-500 leading-relaxed border border-[var(--color-border)]"
                  />
                  <button
                    onClick={() => setImageSeed(Date.now())}
                    className="px-3 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 transition-colors flex flex-col items-center justify-center gap-1 shrink-0"
                    title={lang === 'fr' ? 'Générer une nouvelle image' : 'Generate new image'}
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="text-[9px] font-bold">Retry</span>
                  </button>
                </div>
                <div className="flex-1 min-h-[200px] w-full bg-[var(--color-surface-alt)] rounded-xl border border-[var(--color-border)] overflow-hidden flex items-center justify-center relative group">
                  {generatingImage && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--color-surface-alt)]/80 backdrop-blur-sm">
                      <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
                      <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 animate-pulse">
                        {lang === 'fr' ? 'Génération de haute qualité...' : 'Generating high quality image...'}
                      </p>
                    </div>
                  )}
                  {post.visualIdea.trim() ? (
                    <>
                      <img
                        src={import.meta.env.VITE_HF_ACCESS_TOKEN && hfImageUrl ? hfImageUrl : `https://image.pollinations.ai/prompt/${encodeURIComponent(post.visualIdea.replace(/\n/g, ' ').trim().substring(0, 800))}?width=1024&height=1024&nologo=true&seed=${imageSeed}`}
                        alt="AI Generated Visual"
                        className={cn("w-full h-full object-cover transition-opacity duration-300", generatingImage ? "opacity-30" : "opacity-100")}
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://pollinations.ai/p/${encodeURIComponent(post.visualIdea.replace(/[^a-zA-Z0-9 ]/g, '').trim().substring(0, 100))}?width=1024&height=1024&nologo=true&seed=${imageSeed}`
                        }}
                      />
                      {!generatingImage && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white p-4 text-center pointer-events-none">
                          <Camera className="w-6 h-6 mb-2 opacity-80" />
                          <p className="text-xs font-semibold">{lang === 'fr' ? 'Clic droit pour sauvegarder' : 'Right click to save'}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-[var(--color-text-muted)] text-center p-4">
                      {lang === 'fr' ? 'Entrez un prompt pour générer.' : 'Enter a prompt to generate.'}
                    </div>
                  )}
                </div>
              </div>{/* end right card */}

            </div>{/* end grid */}

            {/* ── Hook scorer ── */}
            {(hookScoring || hookScore) && (
              <div className="w-full shrink-0 flex items-start gap-3 px-4 py-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  {hookScoring
                    ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    : <Wand2 className="w-3.5 h-3.5 text-white" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1.5">
                    {lang === 'fr' ? 'Analyse de votre accroche' : 'Hook analysis'}
                  </p>
                  {hookScoring && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {lang === 'fr' ? 'Analyse en cours…' : 'Scoring your hook…'}
                    </p>
                  )}
                  {!hookScoring && hookScore && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {([
                          { key: 'scrollStop', label: lang === 'fr' ? 'Accroche scroll' : 'Scroll-stop' },
                          { key: 'clarity',    label: lang === 'fr' ? 'Clarté' : 'Clarity' },
                          { key: 'intrigue',   label: lang === 'fr' ? 'Intrigue' : 'Intrigue' },
                        ] as const).map(({ key, label }) => {
                          const val = hookScore[key]
                          const color = val === 'Strong' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                            : val === 'Good' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
                          return (
                            <span key={key} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase ${color}`}>
                              {val === 'Strong' ? '✓' : val === 'Good' ? '~' : '✗'} {label}: {val}
                            </span>
                          )
                        })}
                      </div>
                      <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">💡</span>
                        <span>{hookScore.suggestion}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}{/* end hook scorer */}

          </div>
        )}{/* end post output */}
      </div>{/* end output area */}
    </div>
  )
}
