import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Minus, Plus, Trash2 } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { CHANNELS, joinChannels, parseChannels } from '@/lib/channels'
import { Button, Card, Chip, TextAreaField, TextField } from '@/components/ui'
import type { AudienceSegment, Product } from '@/types'
import { cn } from '@/lib/utils'

// The wizard sets up a NEW company. Editing an existing one happens in Mémoire.
const DRAFT_KEY = 'flowcom:onboarding:draft:new-company'

interface Draft {
  step: number
  general: { name: string; industry: string; website: string; founded_year: string; team_size: string; location: string; short_desc: string }
  brand: { mission: string; vision: string; values: string }
  products: Array<{ name: string; description: string }>
  segments: Array<{ name: string; pain_points: string; interests: string }>
  comms: { tone: string; targets: string; channels: string; frequency: string }
}

const EMPTY: Draft = {
  step: 1,
  general: { name: '', industry: '', website: '', founded_year: '', team_size: '1', location: '', short_desc: '' },
  brand: { mission: '', vision: '', values: '' },
  products: [{ name: '', description: '' }],
  segments: [{ name: '', pain_points: '', interests: '' }],
  comms: { tone: '', targets: '', channels: '', frequency: '' },
}

const COPY = {
  fr: {
    title: 'Nouvelle entreprise', subtitle: 'Cinq étapes pour que l’IA écrive comme vous. Tout reste modifiable ensuite dans Mémoire.',
    steps: ['Entreprise', 'Identité', 'Produits', 'Audiences', 'Communication'],
    stepOf: (n: number) => `Étape ${n} sur 5`,
    intro: [
      'Les faits de base : ils reviennent dans chaque texte.',
      'Ce qui donne du sens à vos messages. Vous pouvez passer et y revenir.',
      'Ce que vous vendez, avec vos mots.',
      'À qui vous parlez, ce qui les bloque et ce qui les intéresse.',
      'Le ton et le rythme de vos publications.',
    ],
    name: "Nom de l'entreprise", namePh: 'Par exemple : Centre de formation Akwa', industry: 'Secteur', industryPh: 'Par exemple : formation professionnelle',
    website: 'Site web', location: 'Localisation', locationPh: 'Ville, pays', founded: 'Année de création', team: "Taille de l'équipe", teamLess: 'Moins', teamMore: 'Plus',
    desc: 'Description courte', descPh: 'En quelques phrases : ce que vous faites, pour qui, et ce qui vous distingue.',
    mission: 'Mission', missionPh: 'Pourquoi vous existez.', vision: 'Vision', visionPh: 'Où vous voulez aller.', values: 'Valeurs', valuesPh: 'Par exemple : exigence, proximité, transparence',
    productName: 'Nom du produit ou service', productDesc: 'Description', addProduct: 'Ajouter un produit',
    segmentName: "Nom de l'audience", pain: 'Ce qui les bloque', interests: 'Ce qui les intéresse', addSegment: 'Ajouter une audience', remove: 'Retirer',
    tone: 'Ton de voix', tonePh: 'Par exemple : chaleureux et expert', targets: 'Objectifs', targetsPh: 'Par exemple : 30 inscriptions par mois',
    channels: 'Réseaux utilisés', frequency: 'Fréquence de publication', frequencies: ['1 fois par semaine', '3 fois par semaine', '5 fois par semaine', 'Chaque jour'],
    back: 'Retour', next: 'Continuer', skip: 'Passer cette étape', finish: "Créer l'entreprise", creating: 'Création…',
    needName: 'Le nom de l’entreprise est nécessaire pour continuer.', failed: "L'entreprise n'a pas pu être créée",
  },
  en: {
    title: 'New company', subtitle: 'Five steps so the AI writes like you. Everything stays editable later in Memory.',
    steps: ['Company', 'Identity', 'Products', 'Audiences', 'Communication'],
    stepOf: (n: number) => `Step ${n} of 5`,
    intro: [
      'The basic facts: they come back in every text.',
      'What gives your messages meaning. You can skip and come back.',
      'What you sell, in your words.',
      'Who you talk to, what holds them back and what interests them.',
      'The tone and rhythm of your posts.',
    ],
    name: 'Company name', namePh: 'For example: Akwa training centre', industry: 'Industry', industryPh: 'For example: vocational training',
    website: 'Website', location: 'Location', locationPh: 'City, country', founded: 'Founded', team: 'Team size', teamLess: 'Fewer', teamMore: 'More',
    desc: 'Short description', descPh: 'In a few sentences: what you do, for whom, and what sets you apart.',
    mission: 'Mission', missionPh: 'Why you exist.', vision: 'Vision', visionPh: 'Where you want to go.', values: 'Values', valuesPh: 'For example: excellence, closeness, transparency',
    productName: 'Product or service name', productDesc: 'Description', addProduct: 'Add a product',
    segmentName: 'Audience name', pain: 'What holds them back', interests: 'What interests them', addSegment: 'Add an audience', remove: 'Remove',
    tone: 'Tone of voice', tonePh: 'For example: warm and expert', targets: 'Objectives', targetsPh: 'For example: 30 sign-ups a month',
    channels: 'Networks used', frequency: 'Posting frequency', frequencies: ['Once a week', '3 times a week', '5 times a week', 'Every day'],
    back: 'Back', next: 'Continue', skip: 'Skip this step', finish: 'Create the company', creating: 'Creating…',
    needName: 'The company name is needed to continue.', failed: 'The company could not be created',
  },
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY
  } catch { return EMPTY }
}

export default function OnboardingPage() {
  const { lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const navigate = useNavigate()
  const { createCompany, updateCompany, setActiveCompany, saveProducts, saveSegments } = useCompany()
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const step = Math.min(5, Math.max(1, draft.step))

  // The draft survives a reload until the company is created.
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* storage unavailable */ }
  }, [draft])

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }))
  const go = (n: number) => { setError(''); setDraft(d => ({ ...d, step: n })); window.scrollTo({ top: 0 }) }
  const next = () => {
    if (step === 1 && !draft.general.name.trim()) { setError(c.needName); return }
    go(step + 1)
  }

  const finish = async () => {
    if (!draft.general.name.trim()) { go(1); setError(c.needName); return }
    setSaving(true)
    setError('')
    try {
      const company = await createCompany(draft.general.name.trim())
      if (!company) throw new Error('createCompany returned nothing')
      const g = draft.general
      const updates = { industry: g.industry, website: g.website, founded_year: g.founded_year, team_size: g.team_size, location: g.location, short_desc: g.short_desc, ...draft.brand, ...draft.comms }
      await updateCompany(company.id, updates)
      await saveProducts(company.id, draft.products.filter(p => p.name.trim()) as Omit<Product, 'id' | 'company_id' | 'created_at'>[])
      await saveSegments(company.id, draft.segments.filter(s => s.name.trim()) as Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>[])
      await setActiveCompany({ ...company, ...updates })
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* storage unavailable */ }
      navigate('/workspace')
    } catch (err) {
      setError(`${c.failed} : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const g = draft.general
  const channels = parseChannels(draft.comms.channels)
  const team = Math.max(1, parseInt(g.team_size) || 1)

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div>
          <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
          <p className="m-0 mt-0.5 text-sm text-ink-muted">{c.subtitle}</p>
        </div>

        <ol className="m-0 flex list-none gap-1.5 p-0" aria-label={c.stepOf(step)}>
          {c.steps.map((label, i) => {
            const n = i + 1
            const done = n < step
            return (
              <li key={label} className="min-w-0 flex-1">
                <button type="button" disabled={n > step && !g.name.trim()} onClick={() => (n <= step || g.name.trim()) && go(n)} aria-current={n === step ? 'step' : undefined}
                  className="flex w-full flex-col gap-1.5 text-left disabled:cursor-not-allowed">
                  <span className={cn('block h-1 rounded-full', n <= step ? 'bg-brand' : 'bg-line')} aria-hidden="true" />
                  <span className={cn('flex items-center gap-1 truncate text-[12px] font-semibold', n === step ? 'text-ink' : 'text-ink-muted')}>
                    {done && <Check className="h-3 w-3 shrink-0 text-success" />}<span className="truncate">{label}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <Card className="flex flex-col">
          <div className="border-b border-line px-5 py-4">
            <p className="m-0 text-[12px] font-semibold text-ink-muted">{c.stepOf(step)}</p>
            <h2 className="m-0 text-[18px] font-bold leading-6 text-ink" style={{ fontFamily: 'var(--font-display)' }}>{c.steps[step - 1]}</h2>
            <p className="m-0 mt-0.5 text-[13px] text-ink-muted">{c.intro[step - 1]}</p>
          </div>

          <div className="flex flex-col gap-3.5 px-5 py-4">
            {step === 1 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label={c.name} value={g.name} placeholder={c.namePh} autoFocus onChange={e => patch('general', { ...g, name: e.target.value })} />
                  <TextField label={c.industry} value={g.industry} placeholder={c.industryPh} onChange={e => patch('general', { ...g, industry: e.target.value })} />
                  <TextField label={c.website} type="url" value={g.website} placeholder="https://" onChange={e => patch('general', { ...g, website: e.target.value })} />
                  <TextField label={c.location} value={g.location} placeholder={c.locationPh} onChange={e => patch('general', { ...g, location: e.target.value })} />
                  <TextField label={c.founded} type="number" value={g.founded_year} placeholder="2020" onChange={e => patch('general', { ...g, founded_year: e.target.value.slice(0, 4) })} />
                  <div className="fc-field">
                    <span className="fc-label">{c.team}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" iconOnly icon={<Minus />} aria-label={c.teamLess} disabled={team <= 1} onClick={() => patch('general', { ...g, team_size: String(team - 1) })} />
                      <input className="fc-input w-20 text-center tabular-nums" inputMode="numeric" aria-label={c.team} value={g.team_size}
                        onChange={e => patch('general', { ...g, team_size: e.target.value.replace(/\D/g, '') })} />
                      <Button variant="secondary" size="sm" iconOnly icon={<Plus />} aria-label={c.teamMore} onClick={() => patch('general', { ...g, team_size: String(team + 1) })} />
                    </div>
                  </div>
                </div>
                <TextAreaField label={c.desc} rows={4} value={g.short_desc} placeholder={c.descPh} onChange={e => patch('general', { ...g, short_desc: e.target.value })} />
              </>
            )}

            {step === 2 && (
              <>
                <TextAreaField label={c.mission} rows={2} value={draft.brand.mission} placeholder={c.missionPh} onChange={e => patch('brand', { ...draft.brand, mission: e.target.value })} />
                <TextAreaField label={c.vision} rows={2} value={draft.brand.vision} placeholder={c.visionPh} onChange={e => patch('brand', { ...draft.brand, vision: e.target.value })} />
                <TextField label={c.values} value={draft.brand.values} placeholder={c.valuesPh} onChange={e => patch('brand', { ...draft.brand, values: e.target.value })} />
              </>
            )}

            {step === 3 && (
              <Rows
                rows={draft.products} removeLabel={c.remove} addLabel={c.addProduct} empty={{ name: '', description: '' }}
                fields={[{ key: 'name', label: c.productName }, { key: 'description', label: c.productDesc, multiline: true }]}
                onChange={rows => patch('products', rows)} />
            )}

            {step === 4 && (
              <Rows
                rows={draft.segments} removeLabel={c.remove} addLabel={c.addSegment} empty={{ name: '', pain_points: '', interests: '' }}
                fields={[{ key: 'name', label: c.segmentName }, { key: 'pain_points', label: c.pain, multiline: true }, { key: 'interests', label: c.interests, multiline: true }]}
                onChange={rows => patch('segments', rows)} />
            )}

            {step === 5 && (
              <>
                <TextField label={c.tone} value={draft.comms.tone} placeholder={c.tonePh} onChange={e => patch('comms', { ...draft.comms, tone: e.target.value })} />
                <TextAreaField label={c.targets} rows={2} value={draft.comms.targets} placeholder={c.targetsPh} onChange={e => patch('comms', { ...draft.comms, targets: e.target.value })} />
                <div className="fc-field">
                  <span className="fc-label">{c.channels}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {CHANNELS.slice(0, 7).map(ch => {
                      const on = channels.includes(ch.value)
                      return <Chip key={ch.value} pressed={on} icon={<ch.icon className="h-3.5 w-3.5" style={{ color: ch.color }} />}
                        onClick={() => patch('comms', { ...draft.comms, channels: joinChannels(on ? channels.filter(x => x !== ch.value) : [...channels, ch.value]) })}>{ch.label}</Chip>
                    })}
                  </div>
                </div>
                <div className="fc-field">
                  <span className="fc-label">{c.frequency}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {c.frequencies.map(fq => <Chip key={fq} pressed={draft.comms.frequency === fq} onClick={() => patch('comms', { ...draft.comms, frequency: fq })}>{fq}</Chip>)}
                  </div>
                </div>
              </>
            )}

            {error && <p className="m-0 text-[13px] text-danger">{error}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-sunken px-5 py-3">
            <Button variant="ghost" icon={<ArrowLeft />} disabled={step === 1 || saving} onClick={() => go(step - 1)}>{c.back}</Button>
            <span className="flex-1" />
            {step > 1 && step < 5 && <Button variant="ghost" onClick={() => go(step + 1)}>{c.skip}</Button>}
            {step < 5
              ? <Button variant="primary" onClick={next}>{c.next}<ArrowRight /></Button>
              : <Button variant="primary" icon={<Check />} loading={saving} onClick={() => void finish()}>{saving ? c.creating : c.finish}</Button>}
          </div>
        </Card>
      </div>
    </div>
  )
}

function Rows<K extends string>({ rows, fields, empty, addLabel, removeLabel, onChange }: {
  rows: Array<Record<K, string>>
  fields: Array<{ key: K; label: string; multiline?: boolean }>
  empty: Record<K, string>
  addLabel: string
  removeLabel: string
  onChange: (rows: Array<Record<K, string>>) => void
}) {
  const update = (i: number, key: K, value: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[var(--radius-md)] border border-line p-3">
          <div className="grid gap-2">
            {fields.map(f => f.multiline
              ? <TextAreaField key={f.key} label={f.label} rows={2} value={row[f.key]} onChange={e => update(i, f.key, e.target.value)} />
              : <TextField key={f.key} label={f.label} value={row[f.key]} onChange={e => update(i, f.key, e.target.value)} />)}
          </div>
          {rows.length > 1 && <Button variant="ghost" size="sm" iconOnly icon={<Trash2 />} aria-label={removeLabel} className="mt-5 text-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))} />}
        </div>
      ))}
      <Button variant="secondary" size="sm" icon={<Plus />} className="self-start" onClick={() => onChange([...rows, { ...empty }])}>{addLabel}</Button>
    </div>
  )
}
