import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Minus } from 'lucide-react'
import {
  FaLinkedinIn,
  FaInstagram,
  FaTiktok,
  FaFacebookF,
  FaYoutube,
  FaXTwitter,
  FaWhatsapp,
  FaEnvelope,
  FaWordpress,
  FaPodcast,
} from 'react-icons/fa6'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Product, AudienceSegment } from '@/types'

// ─── LocalStorage draft key ───────────────────────────────────
const DRAFT_KEY = 'flowcom:onboarding:draft'

// ─── Channel definitions ──────────────────────────────────────
const CHANNELS = [
  { id: 'linkedin',    label: 'LinkedIn',    Icon: FaLinkedinIn,  color: '#0A66C2' },
  { id: 'instagram',  label: 'Instagram',   Icon: FaInstagram,   color: '#E4405F' },
  { id: 'tiktok',     label: 'TikTok',      Icon: FaTiktok,      color: '#000000' },
  { id: 'facebook',   label: 'Facebook',    Icon: FaFacebookF,   color: '#1877F2' },
  { id: 'youtube',    label: 'YouTube',     Icon: FaYoutube,     color: '#FF0000' },
  { id: 'twitter',    label: 'X / Twitter', Icon: FaXTwitter,    color: '#000000' },
  { id: 'whatsapp',   label: 'WhatsApp',    Icon: FaWhatsapp,    color: '#25D366' },
  { id: 'newsletter', label: 'Newsletter',  Icon: FaEnvelope,    color: '#FF6719' },
  { id: 'blog',       label: 'Blog',        Icon: FaWordpress,   color: '#21759B' },
  { id: 'podcast',    label: 'Podcast',     Icon: FaPodcast,     color: '#872EC4' },
]

const TIMEFRAMES = ['day', 'week', 'month', 'year'] as const
type Timeframe = typeof TIMEFRAMES[number]

const TIMEFRAME_LABELS: Record<Timeframe, { fr: string; en: string }> = {
  day:   { fr: 'par jour',    en: 'per day'   },
  week:  { fr: 'par semaine', en: 'per week'  },
  month: { fr: 'par mois',    en: 'per month' },
  year:  { fr: 'par an',      en: 'per year'  },
}

// ─── Types ────────────────────────────────────────────────────
interface StepGeneralData {
  name: string; industry: string; website: string
  founded_year: string; team_size: string; location: string; short_desc: string
}
interface StepBrandData { mission: string; vision: string; values: string }
interface StepProductsData { products: Array<{ name: string; description: string }> }
interface StepAudienceData { segments: Array<{ name: string; pain_points: string; interests: string }> }
interface StepCommsData {
  tone: string; targets: string; channels: string; frequency: string
}

interface DraftState {
  step: number
  general: StepGeneralData
  brand: StepBrandData
  productsData: StepProductsData
  audienceData: StepAudienceData
  comms: StepCommsData
}

const TOTAL_STEPS = 5

// ─── Default values ───────────────────────────────────────────
const defaultGeneral: StepGeneralData = { name: '', industry: '', website: '', founded_year: '', team_size: '1', location: '', short_desc: '' }
const defaultBrand: StepBrandData = { mission: '', vision: '', values: '' }
const defaultProducts: StepProductsData = { products: [{ name: '', description: '' }] }
const defaultAudience: StepAudienceData = { segments: [{ name: '', pain_points: '', interests: '' }] }
const defaultComms: StepCommsData = { tone: '', targets: '', channels: '', frequency: '3x per week' }

function loadDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as DraftState) : null
  } catch { return null }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

// ─── Shared components ────────────────────────────────────────
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  )
}

const inputClass = "w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-[var(--color-text-muted)]"
const textareaClass = `${inputClass} resize-none`
const selectClass = "px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"

// ─── Team size stepper ────────────────────────────────────────
function TeamSizeStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const num = parseInt(value) || 1

  const step = (dir: 1 | -1) => {
    const next = Math.max(1, num + dir)
    onChange(String(next))
  }

  return (
    <div className="flex items-center gap-0">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={num <= 1}
        className="flex items-center justify-center w-9 h-10 rounded-l-xl border border-r-0 border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="number"
        min={1}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-20 h-10 text-center border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => step(1)}
        className="flex items-center justify-center w-9 h-10 rounded-r-xl border border-l-0 border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Step 1: General Info ─────────────────────────────────────
function StepGeneral({ data, onChange }: { data: StepGeneralData; onChange: (d: StepGeneralData) => void }) {
  const { t, lang } = useI18n()
  const set = (k: keyof StepGeneralData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...data, [k]: e.target.value })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t('field.companyName')}>
          <input value={data.name} onChange={set('name')} placeholder={t('ph.companyName')} className={inputClass} />
        </Field>
        <Field label={t('field.industry')}>
          <input value={data.industry} onChange={set('industry')} placeholder={t('ph.industry')} className={inputClass} />
        </Field>
        <Field label={t('field.website')}>
          <input value={data.website} onChange={set('website')} placeholder="https://example.com" className={inputClass} />
        </Field>
        <Field label={t('field.location')}>
          <input value={data.location} onChange={set('location')} placeholder={lang === 'fr' ? 'Pays, Ville' : 'Country, City'} className={inputClass} />
        </Field>
        <Field label={t('field.foundedYear')}>
          <input value={data.founded_year} onChange={set('founded_year')} placeholder="2026" maxLength={4} className={inputClass} />
        </Field>
        <Field label={t('field.teamSize')}>
          <TeamSizeStepper value={data.team_size} onChange={v => onChange({ ...data, team_size: v })} />
        </Field>
      </div>
      <Field label={t('field.shortDescription')}>
        <textarea value={data.short_desc} onChange={set('short_desc')} placeholder={t('ph.shortDescription')} rows={3} className={textareaClass} />
      </Field>
    </div>
  )
}

// ─── Step 2: Brand Identity ───────────────────────────────────
function StepBrand({ data, onChange }: { data: StepBrandData; onChange: (d: StepBrandData) => void }) {
  const { t } = useI18n()
  const set = (k: keyof StepBrandData) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    onChange({ ...data, [k]: e.target.value })
  return (
    <div className="space-y-4">
      <Field label={t('field.mission')}>
        <textarea value={data.mission} onChange={set('mission')} placeholder={t('ph.mission')} rows={3} className={textareaClass} />
      </Field>
      <Field label={t('field.vision')}>
        <textarea value={data.vision} onChange={set('vision')} placeholder={t('ph.vision')} rows={3} className={textareaClass} />
      </Field>
      <Field label={t('field.values')} hint={t('ph.values')}>
        <input value={data.values} onChange={e => onChange({ ...data, values: e.target.value })} placeholder={t('ph.values')} className={inputClass} />
      </Field>
    </div>
  )
}

// ─── Step 3: Products ─────────────────────────────────────────
function StepProducts({ data, onChange }: { data: StepProductsData; onChange: (d: StepProductsData) => void }) {
  const { t } = useI18n()
  const add = () => onChange({ products: [...data.products, { name: '', description: '' }] })
  const remove = (i: number) => onChange({ products: data.products.filter((_, idx) => idx !== i) })
  const update = (i: number, k: 'name' | 'description', v: string) =>
    onChange({ products: data.products.map((p, idx) => idx === i ? { ...p, [k]: v } : p) })
  return (
    <div className="space-y-4">
      {data.products.map((p, i) => (
        <div key={i} className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-text)]">#{i + 1}</span>
            {data.products.length > 1 && (
              <button onClick={() => remove(i)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input value={p.name} onChange={e => update(i, 'name', e.target.value)} placeholder={t('ph.productName')} className={inputClass} />
          <textarea value={p.description} onChange={e => update(i, 'description', e.target.value)} placeholder={t('ph.productDesc')} rows={2} className={textareaClass} />
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-2 px-4 py-2.5 w-full justify-center border-2 border-dashed border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-muted)] hover:border-indigo-400 hover:text-indigo-500 transition-colors">
        <Plus className="w-4 h-4" /> {t('action.addProduct')}
      </button>
    </div>
  )
}

// ─── Step 4: Audience ─────────────────────────────────────────
function StepAudience({ data, onChange }: { data: StepAudienceData; onChange: (d: StepAudienceData) => void }) {
  const { t } = useI18n()
  const add = () => onChange({ segments: [...data.segments, { name: '', pain_points: '', interests: '' }] })
  const remove = (i: number) => onChange({ segments: data.segments.filter((_, idx) => idx !== i) })
  const update = (i: number, k: keyof typeof data.segments[0], v: string) =>
    onChange({ segments: data.segments.map((s, idx) => idx === i ? { ...s, [k]: v } : s) })
  return (
    <div className="space-y-4">
      {data.segments.map((s, i) => (
        <div key={i} className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-text)]">Segment #{i + 1}</span>
            {data.segments.length > 1 && (
              <button onClick={() => remove(i)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input value={s.name} onChange={e => update(i, 'name', e.target.value)} placeholder={t('ph.segmentName')} className={inputClass} />
          <textarea value={s.pain_points} onChange={e => update(i, 'pain_points', e.target.value)} placeholder={t('ph.painPoints')} rows={2} className={textareaClass} />
          <textarea value={s.interests} onChange={e => update(i, 'interests', e.target.value)} placeholder={t('ph.interests')} rows={2} className={textareaClass} />
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-2 px-4 py-2.5 w-full justify-center border-2 border-dashed border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-muted)] hover:border-indigo-400 hover:text-indigo-500 transition-colors">
        <Plus className="w-4 h-4" /> {t('action.addSegment')}
      </button>
    </div>
  )
}

// ─── Step 5: Communication ────────────────────────────────────
function StepComms({ data, onChange }: { data: StepCommsData; onChange: (d: StepCommsData) => void }) {
  const { t, lang } = useI18n()

  const selectedChannels = new Set(
    data.channels ? data.channels.split(',').map(s => s.trim()).filter(Boolean) : []
  )
  const toggleChannel = (id: string) => {
    const next = new Set(selectedChannels)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange({ ...data, channels: Array.from(next).join(', ') })
  }

  const [freqCount, setFreqCount] = useState('3')
  const [freqTimeframe, setFreqTimeframe] = useState<Timeframe>('week')
  const [useCustomFreq, setUseCustomFreq] = useState(false)
  const [customFreq, setCustomFreq] = useState('')

  const buildFrequency = (count: string, tf: Timeframe) =>
    `${count}x ${TIMEFRAME_LABELS[tf][lang]}`

  const handleFreqCount = (v: string) => {
    setFreqCount(v)
    if (!useCustomFreq) onChange({ ...data, frequency: buildFrequency(v, freqTimeframe) })
  }
  const handleFreqTimeframe = (v: Timeframe) => {
    setFreqTimeframe(v)
    if (!useCustomFreq) onChange({ ...data, frequency: buildFrequency(freqCount, v) })
  }
  const handleCustomFreq = (v: string) => {
    setCustomFreq(v)
    onChange({ ...data, frequency: v })
  }
  const toggleCustomFreq = () => {
    setUseCustomFreq(prev => {
      const next = !prev
      if (!next) onChange({ ...data, frequency: buildFrequency(freqCount, freqTimeframe) })
      else onChange({ ...data, frequency: customFreq })
      return next
    })
  }

  return (
    <div className="space-y-5">
      <Field label={t('field.tone')}>
        <input
          value={data.tone}
          onChange={e => onChange({ ...data, tone: e.target.value })}
          placeholder={lang === 'fr' ? 'ex: Professionnel mais accessible, inspirant...' : 'e.g. Professional but approachable, inspiring...'}
          className={inputClass}
        />
      </Field>

      <Field label={t('field.targets')}>
        <input
          value={data.targets}
          onChange={e => onChange({ ...data, targets: e.target.value })}
          placeholder={lang === 'fr' ? 'ex: Notoriété, Génération de leads, Fidélisation...' : 'e.g. Brand awareness, Lead generation, Retention...'}
          className={inputClass}
        />
      </Field>

      {/* Channels — compact multi-select cards */}
      {/* Channels — compact multi-select cards with official brand icons */}
      <Field label={t('field.channels')}>
        <div className="flex flex-wrap gap-2 mt-1">
          {CHANNELS.map(({ id, label, Icon, color }) => {
            const selected = selectedChannels.has(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleChannel(id)}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                  selected
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] hover:border-indigo-300'
                )}
              >
                <Icon
                  className="w-3.5 h-3.5 shrink-0 transition-transform"
                  style={{ color: selected ? 'currentColor' : color }}
                />
                <span>{label}</span>
                {selected && <Check className="w-3 h-3 text-indigo-500 shrink-0" />}
              </button>
            )
          })}
        </div>
        {selectedChannels.size > 0 && (
          <p className="text-xs text-indigo-500 mt-2 font-medium">
            {selectedChannels.size} {lang === 'fr' ? 'sélectionné(s)' : 'selected'}
          </p>
        )}
      </Field>

      {/* Frequency */}
      <Field label={t('field.frequency')}>
        {!useCustomFreq ? (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={freqCount}
              onChange={e => handleFreqCount(e.target.value)}
              className={cn(selectClass, 'w-20')}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n}x</option>
              ))}
            </select>
            <select
              value={freqTimeframe}
              onChange={e => handleFreqTimeframe(e.target.value as Timeframe)}
              className={cn(selectClass, 'flex-1 min-w-[120px]')}
            >
              {TIMEFRAMES.map(tf => (
                <option key={tf} value={tf}>{TIMEFRAME_LABELS[tf][lang]}</option>
              ))}
            </select>
            {data.frequency && (
              <span className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 rounded-lg whitespace-nowrap">
                → {data.frequency}
              </span>
            )}
          </div>
        ) : (
          <input
            value={customFreq}
            onChange={e => handleCustomFreq(e.target.value)}
            placeholder={lang === 'fr' ? 'ex: 1 live par semaine + 2 stories par jour' : 'e.g. 1 live/week + 2 stories/day'}
            className={inputClass}
          />
        )}
        <button
          type="button"
          onClick={toggleCustomFreq}
          className="mt-1.5 text-xs text-[var(--color-text-muted)] hover:text-indigo-500 underline underline-offset-2 transition-colors"
        >
          {useCustomFreq
            ? (lang === 'fr' ? '← Utiliser le sélecteur' : '← Use the selector')
            : (lang === 'fr' ? 'Valeur personnalisée...' : 'Custom value...')}
        </button>
      </Field>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────
export default function OnboardingPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { activeCompany, createCompany, updateCompany, setActiveCompany, saveProducts, saveSegments } = useCompany()

  const initialDraft = loadDraft()
  const requestedStep = Number(searchParams.get('step'))
  const initialStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= TOTAL_STEPS
    ? requestedStep
    : initialDraft?.step ?? 1
  const [step, setStep] = useState(initialStep)
  const [saving, setSaving] = useState(false)
  const [general, setGeneral] = useState<StepGeneralData>(initialDraft?.general ?? defaultGeneral)
  const [brand, setBrand] = useState<StepBrandData>(initialDraft?.brand ?? defaultBrand)
  const [productsData, setProductsData] = useState<StepProductsData>(initialDraft?.productsData ?? defaultProducts)
  const [audienceData, setAudienceData] = useState<StepAudienceData>(initialDraft?.audienceData ?? defaultAudience)
  const [comms, setComms] = useState<StepCommsData>(initialDraft?.comms ?? defaultComms)

  useEffect(() => {
    let cancelled = false

    const hydrateFromCompany = async () => {
      let company = activeCompany
      if (!company && user) {
        const { data } = await supabase
          .from('companies')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at')
          .limit(1)
          .maybeSingle()
        company = data as typeof activeCompany
      }
      if (!company || cancelled) return

      const nextGeneral = {
        name: company.name ?? '',
        industry: company.industry ?? '',
        website: company.website ?? '',
        founded_year: company.founded_year ?? '',
        team_size: company.team_size ?? '1',
        location: company.location ?? '',
        short_desc: company.short_desc ?? '',
      }
      const nextBrand = {
        mission: company.mission ?? '',
        vision: company.vision ?? '',
        values: company.values ?? '',
      }
      const nextComms = {
        tone: company.tone ?? '',
        targets: company.targets ?? '',
        channels: company.channels ?? '',
        frequency: company.frequency ?? '3x per week',
      }
      const keepDraftValue = (savedValue: string, draftValue: string) =>
        draftValue.trim() ? draftValue : savedValue
      const hydratedGeneral = Object.fromEntries(
        Object.entries(nextGeneral).map(([key, value]) => [key, keepDraftValue(value, general[key as keyof StepGeneralData])])
      ) as unknown as StepGeneralData
      const hydratedBrand = Object.fromEntries(
        Object.entries(nextBrand).map(([key, value]) => [key, keepDraftValue(value, brand[key as keyof StepBrandData])])
      ) as unknown as StepBrandData
      const hydratedComms = Object.fromEntries(
        Object.entries(nextComms).map(([key, value]) => [key, keepDraftValue(value, comms[key as keyof StepCommsData])])
      ) as unknown as StepCommsData

      setGeneral(hydratedGeneral)
      setBrand(hydratedBrand)
      setComms(hydratedComms)

      const [{ data: products }, { data: segments }] = await Promise.all([
        supabase.from('products').select('*').eq('company_id', company.id),
        supabase.from('audience_segments').select('*').eq('company_id', company.id),
      ])
      if (cancelled) return

      const hydratedProducts = products?.length
        ? { products: products.map(product => ({ name: product.name, description: product.description })) }
        : productsData
      const hydratedAudience = segments?.length
        ? { segments: segments.map(segment => ({ name: segment.name, pain_points: segment.pain_points, interests: segment.interests })) }
        : audienceData
      setProductsData(hydratedProducts)
      setAudienceData(hydratedAudience)

      const nextDraft: DraftState = {
        step,
        general: hydratedGeneral,
        brand: hydratedBrand,
        productsData: hydratedProducts,
        audienceData: hydratedAudience,
        comms: hydratedComms,
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(nextDraft))
    }

    hydrateFromCompany()
    return () => { cancelled = true }
  }, [activeCompany, user])

  // Auto-save to localStorage on every change
  const persistDraft = useCallback(() => {
    const state: DraftState = { step, general, brand, productsData, audienceData, comms }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state))
  }, [step, general, brand, productsData, audienceData, comms])

  useEffect(() => { persistDraft() }, [persistDraft])

  const stepTitles = [
    t('onboarding.stepGeneral'),
    t('onboarding.stepBrand'),
    t('onboarding.stepProducts'),
    t('onboarding.stepAudience'),
    t('onboarding.stepComms'),
  ]

  const handleComplete = async () => {
    setSaving(true)
    try {
      const company = activeCompany ?? await createCompany(general.name || 'My Company')
      if (!company) throw new Error('Failed to create company')

      const companyUpdates = {
        industry: general.industry,
        website: general.website,
        founded_year: general.founded_year,
        team_size: general.team_size,
        location: general.location,
        short_desc: general.short_desc,
        mission: brand.mission,
        vision: brand.vision,
        values: brand.values,
        tone: comms.tone,
        targets: comms.targets,
        channels: comms.channels,
        frequency: comms.frequency,
      }
      await updateCompany(company.id, companyUpdates)

      await saveProducts(
        company.id,
        productsData.products.filter(p => p.name.trim()) as Omit<Product, 'id' | 'company_id' | 'created_at'>[]
      )
      await saveSegments(
        company.id,
        audienceData.segments.filter(s => s.name.trim()) as Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>[]
      )

      await setActiveCompany({ ...company, ...companyUpdates })
      clearDraft() // ← wipe draft on success
      navigate('/workspace')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full p-6 flex flex-col items-center">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text)] font-sans">{t('onboarding.title')}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-md mx-auto">{t('onboarding.subtitle')}</p>
          {initialDraft && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
              ✓ {t('sidebar.offlineTitle')} — {t('sidebar.offlineDesc')}
            </p>
          )}
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} className="flex items-center flex-1">
              <button
                onClick={() => setStep(i + 1)}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all',
                  i + 1 < step  ? 'bg-indigo-600 text-white cursor-pointer hover:bg-indigo-700' :
                  i + 1 === step ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900' :
                  'bg-[var(--color-surface-alt)] border-2 border-[var(--color-border)] text-[var(--color-text-muted)] cursor-default'
                )}
              >
                {i + 1 < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </button>
              {i < TOTAL_STEPS - 1 && (
                <div className={cn('flex-1 h-0.5 mx-1', i + 1 < step ? 'bg-indigo-600' : 'bg-[var(--color-border)]')} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="mb-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm">
          <div className="px-6 py-5 border-b border-[var(--color-border)]">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-1">
              {t('onboarding.step')} {step} {t('onboarding.of')} {TOTAL_STEPS}
            </p>
            <h2 className="text-lg font-bold text-[var(--color-text)] font-sans">{stepTitles[step - 1]}</h2>
          </div>

          <div className="p-6">
            {step === 1 && <StepGeneral data={general} onChange={setGeneral} />}
            {step === 2 && <StepBrand data={brand} onChange={setBrand} />}
            {step === 3 && <StepProducts data={productsData} onChange={setProductsData} />}
            {step === 4 && <StepAudience data={audienceData} onChange={setAudienceData} />}
            {step === 5 && <StepComms data={comms} onChange={setComms} />}
          </div>

          <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between">
            <button
              onClick={() => {
                persistDraft()
                setStep(s => Math.max(1, s - 1))
              }}
              disabled={step === 1}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] disabled:opacity-0 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> {t('onboarding.back')}
            </button>

            {step < TOTAL_STEPS ? (
              <button
                onClick={() => {
                  persistDraft()
                  setStep(s => s + 1)
                }}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {t('onboarding.continue')} <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={async () => {
                  persistDraft()
                  await handleComplete()
                }}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {saving ? '...' : <><Check className="w-4 h-4" /> {t('onboarding.complete')}</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
