import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays, Sparkles, Trash2, ChevronLeft, ChevronRight, ChevronDown,
  LayoutList, LayoutGrid, Zap, AlertCircle, FileText, Clapperboard, Image,
  Wand2, Loader2
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
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { mapCalendarRow } from '@/lib/dataMappers'

// ─── Types ─────────────────────────────────────────────────────
interface CalendarItem {
  id: string
  date: string
  topic: string
  goal: string
  format: 'Post' | 'Carousel' | 'Video' | 'Story'
  channel: string
  status: 'idea' | 'scheduled' | 'published'
}

// ─── Channel config ────────────────────────────────────────────
const CHANNELS = [
  { value: 'linkedin',   icon: FaLinkedinIn,  color: '#0A66C2', label: 'LinkedIn' },
  { value: 'facebook',   icon: FaFacebookF,   color: '#1877F2', label: 'Facebook' },
  { value: 'instagram',  icon: FaInstagram,   color: '#E4405F', label: 'Instagram' },
  { value: 'tiktok',     icon: FaTiktok,      color: '#111827', label: 'TikTok' },
  { value: 'youtube',    icon: FaYoutube,     color: '#FF0000', label: 'YouTube' },
  { value: 'twitter',    icon: FaXTwitter,    color: '#111827', label: 'X (Twitter)' },
  { value: 'whatsapp',   icon: FaWhatsapp,    color: '#25D366', label: 'WhatsApp' },
  { value: 'newsletter', icon: FaEnvelope,    color: '#FF6719', label: 'Newsletter' },
  { value: 'blog',       icon: FaWordpress,   color: '#21759B', label: 'Blog' },
  { value: 'podcast',    icon: FaPodcast,     color: '#872EC4', label: 'Podcast' },
]
const CHANNEL_MAP = Object.fromEntries(CHANNELS.map(c => [c.value, c]))

const GOALS = {
  fr: ['Visibilité', 'Leads', 'Engagement', 'Conversion', 'Éducation', 'Fidélisation'],
  en: ['Visibility', 'Leads', 'Engagement', 'Conversion', 'Education', 'Retention'],
}

const FREQ_PRESETS = [1, 2, 3, 4, 5]

const STATUS_CYCLE: Record<CalendarItem['status'], CalendarItem['status']> = {
  idea: 'scheduled', scheduled: 'published', published: 'idea',
}
const STATUS_STYLE: Record<CalendarItem['status'], string> = {
  idea:      'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  scheduled: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  published: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
}
const STATUS_LABEL = {
  idea:      { fr: 'Idée', en: 'Idea' },
  scheduled: { fr: 'Planifié', en: 'Scheduled' },
  published: { fr: 'Publié', en: 'Published' },
}
const FORMAT_ICON: Record<string, React.ElementType> = {
  Post: FileText, Carousel: Image, Video: Clapperboard, Story: Zap,
}
const FORMAT_STYLE: Record<string, string> = {
  Post:     'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  Carousel: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  Video:    'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900',
  Story:    'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-900',
}

// ─── Helpers ───────────────────────────────────────────────────
function monthKey(y: number, m: number) { return `${y}-${String(m + 1).padStart(2, '0')}` }
function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function monthLabel(y: number, m: number, lang: 'fr' | 'en') {
  return new Date(y, m, 1).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' })
}

// ─── Skeleton loader row ───────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-[var(--color-border)] animate-pulse">
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-8 bg-[var(--color-border)] rounded-full" />
          <div className="h-5 w-6 bg-[var(--color-border)] rounded-md" />
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <div className="h-3 rounded-full bg-[var(--color-border)]" style={{ width: `${60 + Math.random() * 30}%` }} />
          <div className="h-3 rounded-full bg-[var(--color-border)] opacity-60" style={{ width: `${30 + Math.random() * 30}%` }} />
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="h-3 rounded-full bg-[var(--color-border)]" style={{ width: `${50 + Math.random() * 25}%` }} />
      </td>
      <td className="px-4 py-4">
        <div className="h-5 w-16 bg-[var(--color-border)] rounded-full" />
      </td>
      <td className="px-4 py-4">
        <div className="h-7 w-20 bg-[var(--color-border)] rounded-lg" />
      </td>
    </tr>
  )
}

// ─── Skeleton table ────────────────────────────────────────────
function SkeletonTable({ count = 8, lang }: { count?: number; lang: 'fr' | 'en' }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
            {[
              lang === 'fr' ? 'DATE' : 'DATE',
              lang === 'fr' ? 'SUJET SUGGÉRÉ' : 'SUGGESTED TOPIC',
              lang === 'fr' ? 'OBJECTIF SPÉCIFIQUE' : 'SPECIFIC GOAL',
              'FORMAT',
              'ACTION',
            ].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: count }).map((_, i) => <SkeletonRow key={i} />)}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────
export default function CalendarPage() {
  const { t, lang } = useI18n()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const navigate = useNavigate()

  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [goals, setGoals]       = useState<string[]>([GOALS[lang][0]])
  const [theme, setTheme]       = useState('')
  const [channels, setChannels] = useState<string[]>(['linkedin'])
  const [freq, setFreq]         = useState(2)
  const [customFreq, setCustomFreq] = useState('')
  const [isCustomFreq, setIsCustomFreq] = useState(false)

  const [view, setView]       = useState<'list' | 'grid'>('list')
  const [items, setItems]     = useState<CalendarItem[]>(() => {
    return []
  })
  const [loading, setLoading] = useState(false)
  const [loadingItems, setLoadingItems] = useState(true)
  const [error, setError]     = useState('')

  // ── AI gap analysis state ──────────────────────────────────────────────────
  const [gapWarnings, setGapWarnings]       = useState<{ fr: string[]; en: string[] } | null>(null)
  const [gapLoading, setGapLoading]         = useState(false)
  const [gapDismissed, setGapDismissed]     = useState(false)
  const gapAnalysedKeyRef                   = useRef<string>('')

  useEffect(() => {
    let cancelled = false
    const loadItems = async () => {
      if (!activeCompany) { setItems([]); setLoadingItems(false); return }
      setLoadingItems(true)
      const { data } = await supabase
        .from('calendar_items')
        .select('*')
        .eq('company_id', activeCompany.id)
        .order('post_date')
      if (!cancelled) {
        setItems((data ?? []).map(mapCalendarRow))
        setLoadingItems(false)
      }
    }
    loadItems()
    return () => { cancelled = true }
  }, [activeCompany?.id])

  const mk           = monthKey(year, month)
  const monthItems   = useMemo(() => items.filter(i => i.date.startsWith(mk)), [items, mk])
  const daysInMonth  = getDaysInMonth(year, month)
  const effectiveFreq = isCustomFreq ? (parseInt(customFreq) || 1) : freq
  const totalPosts   = Math.round(effectiveFreq * 4.33)

  const stats = useMemo(() => ({
    idea:      monthItems.filter(i => i.status === 'idea').length,
    scheduled: monthItems.filter(i => i.status === 'scheduled').length,
    published: monthItems.filter(i => i.status === 'published').length,
  }), [monthItems])

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  const buildContext = () => {
    return buildAiContext({ company: activeCompany, products, segments, keyMessages })
  }

  const handleGenerate = async () => {
    if (!activeCompany)    { setError(lang === 'fr' ? 'Aucune entreprise active.' : 'No active company.'); return }
    setLoading(true); setError('')

    const mLabel       = monthLabel(year, month, lang)
    const channelLabels = channels.map(c => CHANNEL_MAP[c]?.label ?? c).join(', ')
    const goalLabels   = goals.join(', ')
    const channelEnum  = channels.join('|')

    const systemMsg = `You are an expert social media strategist. Create a monthly editorial calendar.
Return ONLY valid JSON matching this exact schema:
{"items":[{"date":"YYYY-MM-DD","topic":"string","goal":"string","format":"Post|Carousel|Video|Story","channel":"${channelEnum}"}]}
Brand context:\n${buildContext()}`

    const userMsg = `Create ${totalPosts} post ideas distributed across these channels: ${channelLabels} in ${mLabel}.
Goals to target: ${goalLabels}.
${theme.trim() ? `CRITICAL: The overarching theme for this month is "${theme.trim()}". All topics MUST strongly align with this theme.` : ''}
Spread evenly across the month, vary the formats.
The date must be within month ${month + 1} of year ${year}.
Respond ONLY in ${lang === 'fr' ? 'French' : 'English'}.`

    try {
      type APIResponse = { items: Array<{ date: string; topic: string; goal: string; format: string; channel: string }> }
      const res = await callGroqJSON<APIResponse>('', [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userMsg },
      ], { temperature: 0.8, max_tokens: 3000, requiredKeys: ['items'] })

      const newItems: CalendarItem[] = (res.items ?? []).map((item, i) => ({
        id: `${mk}-${i}-${Date.now()}`,
        date: item.date,
        topic: item.topic,
        goal: item.goal,
        format: (['Post', 'Carousel', 'Video', 'Story'].includes(item.format)
          ? item.format : 'Post') as CalendarItem['format'],
        channel: channels.includes(item.channel?.toLowerCase()) ? item.channel.toLowerCase() : channels[0],
        status: 'idea',
      }))
      await supabase.from('calendar_items').delete().eq('company_id', activeCompany.id).eq('month', mk)
      const { data: savedItems } = await supabase.from('calendar_items').insert(newItems.map(item => ({
        company_id: activeCompany.id,
        month: mk,
        post_date: item.date,
        topic: item.topic,
        goal: item.goal,
        format: item.format,
        channel: item.channel,
        status: item.status,
      }))).select('*')
      setItems(prev => [...prev.filter(i => !i.date.startsWith(mk)), ...(savedItems ?? []).map(mapCalendarRow)])
    } catch (e) {
      setError(t(buildGroqError(e) as Parameters<typeof t>[0]))
    } finally {
      setLoading(false)
    }
  }

  const clearMonth  = async () => {
    if (!activeCompany) return
    await supabase.from('calendar_items').delete().eq('company_id', activeCompany.id).eq('month', mk)
    setItems(prev => prev.filter(i => !i.date.startsWith(mk)))
  }
  const cycleStatus = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return
    const status = STATUS_CYCLE[item.status]
    await supabase.from('calendar_items').update({ status }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }
  const removeItem  = async (id: string) => {
    await supabase.from('calendar_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }
  const updateItem  = async (id: string, field: keyof CalendarItem, value: string) => {
    await supabase.from('calendar_items').update({ [field === 'date' ? 'post_date' : field]: value }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }
  const goGenerate  = (item: CalendarItem) => {
    navigate(`/content?${new URLSearchParams({ topic: item.topic, channel: item.channel, goal: item.goal, format: item.format }).toString()}`)
  }

  // ── AI gap analysis — fires when monthItems changes and has ≥3 items ───────
  useEffect(() => {
    if (!apiKeyConfigured) return
    if (monthItems.length < 3) { setGapWarnings(null); return }

    // Use month+item-count+channel-set as a key so we only re-run when the plan changes
    const key = `${mk}-${monthItems.length}-${[...new Set(monthItems.map(i => i.channel))].sort().join(',')}`
    if (gapAnalysedKeyRef.current === key) return
    gapAnalysedKeyRef.current = key
    setGapDismissed(false)

    const run = async () => {
      setGapLoading(true)
      setGapWarnings(null)
      try {
        // Summarise the plan as text
        const channelCounts = monthItems.reduce<Record<string, number>>((acc, i) => {
          acc[i.channel] = (acc[i.channel] ?? 0) + 1; return acc
        }, {})
        const goalCounts = monthItems.reduce<Record<string, number>>((acc, i) => {
          acc[i.goal] = (acc[i.goal] ?? 0) + 1; return acc
        }, {})
        const dates = [...new Set(monthItems.map(i => i.date))].sort()
        const gaps: string[] = []
        for (let d = 1; d < dates.length; d++) {
          const diff = (new Date(dates[d]).getTime() - new Date(dates[d - 1]).getTime()) / 86400000
          if (diff > 5) gaps.push(`${diff} days between ${dates[d - 1]} and ${dates[d]}`)
        }

        const planSummary = [
          `Month: ${mk}, Total posts planned: ${monthItems.length}`,
          `Channel distribution: ${Object.entries(channelCounts).map(([k, v]) => `${k}(${v})`).join(', ')}`,
          `Goal distribution: ${Object.entries(goalCounts).map(([k, v]) => `${k}(${v})`).join(', ')}`,
          gaps.length ? `Date gaps > 5 days: ${gaps.join('; ')}` : 'No large date gaps detected',
          `Brand preferred channels: ${activeCompany?.channels ?? 'not set'}`,
          `Brand publishing frequency: ${activeCompany?.frequency ?? 'not set'}`,
        ].join('\n')

        type GapResult = { warnings_fr: string[]; warnings_en: string[] }
        const result = await callGroqJSON<GapResult>('', [
          {
            role: 'system',
            content: `You are an editorial calendar auditor. Analyze this month's content plan and identify real problems. Return JSON exactly: {"warnings_fr":["string"],"warnings_en":["string"]} — each array contains 1 to 3 short warning strings (max 15 words each) in French for warnings_fr and English for warnings_en. Only flag real issues: publishing gaps > 5 days, channel imbalance vs brand preference, goals that are overrepresented or missing. If the plan is good, return {"warnings_fr":[],"warnings_en":[]}. Do not invent problems.`,
          },
          { role: 'user', content: planSummary },
        ], { temperature: 0.2, max_tokens: 300, requiredKeys: ['warnings_fr', 'warnings_en'] })

        if (Array.isArray(result.warnings_fr)) {
          setGapWarnings({
            fr: result.warnings_fr.filter((w): w is string => typeof w === 'string').slice(0, 3),
            en: result.warnings_en.filter((w): w is string => typeof w === 'string').slice(0, 3),
          })
        }
      } catch {
        // Silently fail — gap analysis is non-critical
      } finally {
        setGapLoading(false)
      }
    }
    run()
  }, [monthItems, mk, apiKeyConfigured]) // eslint-disable-line react-hooks/exhaustive-deps

  // Grid helpers
  const itemsByDay = useMemo(() => {
    const map: Record<number, CalendarItem[]> = {}
    monthItems.forEach(item => {
      const d = parseInt(item.date.split('-')[2], 10)
      if (!map[d]) map[d] = []
      map[d].push(item)
    })
    return map
  }, [monthItems])
  const firstDayOfWeek = new Date(year, month, 1).getDay()

  // ─── Chip button ──────────────────────────────────────────────
  const Chip = ({ active, onClick, children, activeColor }: {
    active: boolean; onClick: () => void; children: React.ReactNode; activeColor?: string
  }) => (
    <button
      onClick={onClick}
      className={cn(
        'px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all whitespace-nowrap',
        active
          ? 'text-white border-transparent shadow-sm'
          : 'text-[var(--color-text-muted)] border-[var(--color-border)] bg-[var(--color-surface-alt)] hover:border-indigo-400 hover:text-[var(--color-text)]'
      )}
      style={active ? { backgroundColor: activeColor ?? '#4f46e5', borderColor: activeColor ?? '#4f46e5' } : {}}
    >
      {children}
    </button>
  )

  return (
    <div className="flex flex-col p-4 sm:p-6 gap-4">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                {t('calendar.badge')}
              </span>
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text)] font-sans leading-tight">{t('calendar.title')}</h1>
            <p className="text-xs text-[var(--color-text-muted)]">{t('calendar.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl p-1">
          <button onClick={() => setView('list')} className={cn('p-2 rounded-lg transition-colors', view === 'list' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]')}>
            <LayoutList className="w-4 h-4" />
          </button>
          <button onClick={() => setView('grid')} className={cn('p-2 rounded-lg transition-colors', view === 'grid' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]')}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Config panel ── */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shrink-0 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">

          {/* Mois cible */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">{t('calendar.targetMonth')}</label>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-2 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="flex-1 text-center text-sm font-bold text-[var(--color-text)] capitalize px-2 py-2 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl">
                {monthLabel(year, month, lang)}
              </span>
              <button onClick={nextMonth} className="p-2 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Objectif principal -> Objectif(s) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">{t('calendar.primaryGoal')}</label>
            <div className="flex flex-wrap gap-2">
              {GOALS[lang].map(g => {
                const isActive = goals.includes(g)
                const toggleGoal = () => {
                  setGoals(prev => 
                    prev.includes(g) && prev.length > 1 
                      ? prev.filter(x => x !== g) 
                      : Array.from(new Set([...prev, g]))
                  )
                }
                return (
                  <Chip key={g} active={isActive} onClick={toggleGoal} activeColor="#4f46e5">{g}</Chip>
                )
              })}
            </div>
          </div>

          {/* Réseau social */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">{t('calendar.socialNetwork')}</label>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(c => {
                const Icon = c.icon
                const isActive = channels.includes(c.value)
                const toggleChannel = () => {
                  setChannels(prev => 
                    prev.includes(c.value) && prev.length > 1 
                      ? prev.filter(x => x !== c.value) 
                      : Array.from(new Set([...prev, c.value]))
                  )
                }
                return (
                  <button
                    key={c.value}
                    onClick={toggleChannel}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all',
                      isActive
                        ? 'text-white border-transparent shadow-sm'
                        : 'text-[var(--color-text-muted)] border-[var(--color-border)] bg-[var(--color-surface-alt)] hover:border-current'
                    )}
                    style={isActive ? { backgroundColor: c.color, borderColor: c.color } : { '--tw-ring-color': c.color } as React.CSSProperties}
                  >
                    <Icon style={{ fontSize: 13, color: isActive ? 'white' : c.color }} />
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fréquence */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">{t('calendar.weeklyFreq')}</label>
            <div className="flex flex-wrap gap-2">
              {FREQ_PRESETS.map(f => (
                <Chip
                  key={f}
                  active={!isCustomFreq && freq === f}
                  onClick={() => { setFreq(f); setIsCustomFreq(false) }}
                  activeColor="#10b981"
                >
                  {f}× / {lang === 'fr' ? 'sem.' : 'wk'}
                </Chip>
              ))}
              {/* Custom frequency */}
              <button
                onClick={() => setIsCustomFreq(true)}
                className={cn(
                  'px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all',
                  isCustomFreq
                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                    : 'text-[var(--color-text-muted)] border-[var(--color-border)] bg-[var(--color-surface-alt)] hover:border-emerald-400 hover:text-[var(--color-text)]'
                )}
              >
                {lang === 'fr' ? 'Personnalisé' : 'Custom'}
              </button>
              {isCustomFreq && (
                <input
                  type="number"
                  min={1} max={14}
                  value={customFreq}
                  onChange={e => setCustomFreq(e.target.value)}
                  placeholder={lang === 'fr' ? 'Ex: 6' : 'E.g. 6'}
                  className="w-24 px-3 py-2 rounded-xl border border-emerald-400 bg-[var(--color-surface-alt)] text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* Theme of the month */}
          <div className="space-y-2 md:col-span-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">
              {lang === 'fr' ? 'Thème du mois (Optionnel)' : 'Theme of the month (Optional)'}
            </label>
            <input
              type="text"
              value={theme}
              onChange={e => setTheme(e.target.value)}
              placeholder={lang === 'fr' ? 'Ex: Lancement produit, Halloween, Éducation client...' : 'E.g. Product launch, Halloween, Customer education...'}
              className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Summary + Generate row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <div className="w-4 h-4 rounded-full border-2 border-indigo-500 flex items-center justify-center shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            </div>
            <span>
              {t('calendar.willGenerate')}{' '}
              <span className="font-bold text-[var(--color-text)]">{totalPosts}</span>{' '}
              {t('calendar.postIdeasFor')}{' '}
              <span className="font-bold text-indigo-500">
                {channels.map(c => CHANNEL_MAP[c]?.label).join(', ')}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {monthItems.length > 0 && (
              <button onClick={clearMonth} className="flex items-center gap-1.5 px-3 py-2 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
                {t('calendar.clear')}
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200 dark:shadow-none"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? t('calendar.generating') : t('calendar.generate')}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}
      </div>

      {/* ── Stats bar ── */}
      {monthItems.length > 0 && !loading && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-[var(--color-text)]">{monthItems.length} {t('calendar.ideas')}</span>
          <span className="text-[var(--color-border)]">·</span>
          {(['idea', 'scheduled', 'published'] as const).map(s => (
            <span key={s} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[s])}>
              {stats[s]} {STATUS_LABEL[s][lang]}
            </span>
          ))}
        </div>
      )}

      {/* ── AI gap warning banner ── */}
      {!gapDismissed && monthItems.length >= 3 && !loading && (gapLoading || (gapWarnings && (lang === 'fr' ? gapWarnings.fr : gapWarnings.en).length > 0)) && (
        <div className="shrink-0 flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <div className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center shrink-0 mt-0.5">
            {gapLoading
              ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              : <Wand2 className="w-3.5 h-3.5 text-white" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
              {lang === 'fr' ? 'Analyse IA du calendrier' : 'AI calendar check'}
            </p>
            {gapLoading && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {lang === 'fr' ? 'Analyse du plan en cours…' : 'Checking your plan…'}
              </p>
            )}
            {!gapLoading && gapWarnings && (lang === 'fr' ? gapWarnings.fr : gapWarnings.en).length > 0 && (
              <ul className="space-y-1">
                {(lang === 'fr' ? gapWarnings.fr : gapWarnings.en).map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!gapLoading && gapWarnings && (lang === 'fr' ? gapWarnings.fr : gapWarnings.en).length > 0 && (
            <button
              onClick={() => setGapDismissed(true)}
              className="shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
              title={lang === 'fr' ? 'Fermer' : 'Dismiss'}
            >
              <span className="text-sm leading-none">✕</span>
            </button>
          )}
        </div>
      )}

      {/* ── Content area ── */}
      <div className="pb-4">

        {/* Skeleton while loading */}
        {(loading || loadingItems) && <SkeletonTable count={totalPosts > 10 ? 10 : totalPosts} lang={lang} />}

        {/* Empty state */}
        {!loading && monthItems.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mb-4">
              <CalendarDays className="w-7 h-7 text-[var(--color-text-muted)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--color-text)] mb-1">
              {lang === 'fr' ? 'Aucun calendrier généré' : 'No calendar generated'}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] max-w-xs">{t('calendar.noCalendar')}</p>
          </div>
        )}

        {/* LIST VIEW */}
        {!loading && monthItems.length > 0 && view === 'list' && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
                  {[t('calendar.colDate'), t('calendar.colTopic'), t('calendar.colGoal'), t('calendar.colFormat'), t('calendar.colAction')].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...monthItems].sort((a, b) => a.date.localeCompare(b.date)).map((item, idx) => {
                  const FmtIcon = FORMAT_ICON[item.format] ?? FileText
                  const meta    = CHANNEL_MAP[item.channel]
                  const Icon    = meta?.icon
                  return (
                    <tr key={item.id} className={cn('border-b border-[var(--color-border)] group hover:bg-[var(--color-surface-alt)] transition-colors', idx % 2 === 0 ? '' : 'bg-[var(--color-surface-alt)]/30')}>
                      {/* Date */}
                      <td className="px-4 py-3 shrink-0">
                        <p className="text-[10px] font-bold text-indigo-500 uppercase">
                          {new Date(`${item.date}T12:00:00`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { month: 'short' })}
                        </p>
                        <p className="text-lg font-bold text-[var(--color-text)] leading-none">
                          {item.date.split('-')[2]}
                        </p>
                      </td>
                      {/* Topic */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-sm text-[var(--color-text)] leading-snug">{item.topic}</p>
                        {Icon && (
                          <span className="inline-flex items-center gap-1 mt-0.5">
                            <Icon style={{ color: meta.color, fontSize: 11 }} />
                            <span className="text-[11px] text-[var(--color-text-muted)]">{meta.label}</span>
                          </span>
                        )}
                      </td>
                      {/* Goal */}
                      <td className="px-4 py-3">
                        <div className="relative inline-block w-full max-w-[200px]">
                          <select 
                            value={item.goal} 
                            onChange={e => updateItem(item.id, 'goal', e.target.value)}
                            className="w-full appearance-none bg-[var(--color-surface-alt)] border border-[var(--color-border)] hover:border-indigo-400 rounded-lg px-3 py-1.5 text-xs text-[var(--color-text)] cursor-pointer pr-7 outline-none transition-colors shadow-xs font-medium"
                          >
                            <option value={item.goal} className="bg-[var(--color-surface)] text-[var(--color-text)] py-1 font-medium" style={{ color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}>{item.goal}</option>
                            {GOALS[lang].filter(g => g !== item.goal).map(g => (
                              <option key={g} value={g} className="bg-[var(--color-surface)] text-[var(--color-text)] py-1 font-medium" style={{ color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}>{g}</option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[var(--color-text-muted)]">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </td>
                      {/* Format */}
                      <td className="px-4 py-3">
                        <div className="relative inline-block">
                          <select 
                            value={item.format} 
                            onChange={e => updateItem(item.id, 'format', e.target.value)}
                            className={cn(
                              'appearance-none pl-7 pr-7 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer outline-none transition-colors shadow-xs',
                              FORMAT_STYLE[item.format] || 'bg-gray-50 text-gray-700 border-gray-200'
                            )}
                          >
                            {['Post', 'Carousel', 'Video', 'Story'].map(f => (
                              <option 
                                key={f} 
                                value={f} 
                                className="bg-[var(--color-surface)] text-[var(--color-text)] font-normal py-1"
                                style={{ color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' }}
                              >
                                {f}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 left-2 flex items-center" style={{ color: 'inherit' }}>
                            <FmtIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center" style={{ color: 'inherit' }}>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => cycleStatus(item.id)}
                            className={cn('text-[11px] px-2 py-1 rounded-full font-semibold transition-colors cursor-pointer hover:opacity-80', STATUS_STYLE[item.status])}
                          >
                            {STATUS_LABEL[item.status][lang]}
                          </button>
                          <button
                            onClick={() => goGenerate(item)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            <Zap className="w-3 h-3" />
                            {lang === 'fr' ? 'Générer' : 'Generate'}
                          </button>
                          <button onClick={() => removeItem(item.id)} className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* GRID VIEW */}
        {!loading && monthItems.length > 0 && view === 'grid' && (
          <div className="pb-4">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {(lang === 'fr'
                ? ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
                : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
              ).map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-[var(--color-text-muted)] uppercase py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: (firstDayOfWeek + 6) % 7 }).map((_, i) => <div key={`e-${i}`} className="min-h-[72px] rounded-lg" />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const dayItems = itemsByDay[day] ?? []
                const isToday  = isoDate(year, month, day) === new Date().toISOString().slice(0, 10)
                return (
                  <div key={day} className={cn('min-h-[72px] rounded-xl border p-1.5 transition-colors', isToday ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/20' : 'border-[var(--color-border)] bg-[var(--color-surface)]')}>
                    <div className="flex justify-between items-start mb-1.5">
                      <p className={cn('text-xs font-bold', isToday ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : 'text-[var(--color-text-muted)]')}>{day}</p>
                      <div className="flex items-center gap-1.5">
                        {Array.from(new Set(dayItems.map(i => i.channel))).map(ch => {
                          const CIcon = CHANNEL_MAP[ch]?.icon
                          if (!CIcon) return null
                          return <CIcon key={ch} style={{ color: CHANNEL_MAP[ch]?.color, fontSize: 13 }} title={CHANNEL_MAP[ch]?.label} />
                        })}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {dayItems.slice(0, 2).map(item => {
                        const FmtIcon = FORMAT_ICON[item.format] ?? FileText
                        return (
                          <button
                            key={item.id}
                            onClick={() => goGenerate(item)}
                            title={item.topic}
                            className={cn(
                              'w-full text-left rounded-lg px-2 py-1.5 text-[11px] font-medium leading-tight hover:opacity-90 flex items-center gap-1.5 border transition-colors shadow-xs',
                              FORMAT_STYLE[item.format] || 'bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-800'
                            )}
                          >
                            <FmtIcon className="shrink-0 w-3.5 h-3.5" />
                            <span className="truncate flex-1">{item.topic}</span>
                          </button>
                        )
                      })}
                      {dayItems.length > 2 && <p className="text-[10px] text-[var(--color-text-muted)] pl-1">+{dayItems.length - 2}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
