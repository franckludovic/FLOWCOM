import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { buildAiContext } from '@/lib/aiContext'
import { listReports, recentLearnings } from '@/lib/reports'
import { CHANNELS, joinChannels, parseChannels } from '@/lib/channels'
import { Button, Card, CardBody, CardHeader, Chip } from '@/components/ui'
import type { Company } from '@/types'
import { cn } from '@/lib/utils'

type CompanyField = 'name' | 'industry' | 'location' | 'website' | 'founded_year' | 'team_size' | 'short_desc' | 'mission' | 'vision' | 'values' | 'tone' | 'targets' | 'channels' | 'frequency'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
const FIELDS: CompanyField[] = ['name', 'industry', 'location', 'website', 'founded_year', 'team_size', 'short_desc', 'mission', 'vision', 'values', 'tone', 'targets', 'channels', 'frequency']

const COPY = {
  fr: {
    title: "Mémoire de l'entreprise", subtitle: (n: string) => `Tout ce que l'IA sait de ${n}. Chaque modification est enregistrée automatiquement.`,
    saving: 'Enregistrement…', saved: 'Enregistré', error: "Une modification n'a pas pu être enregistrée", noCompany: 'Aucune entreprise active.',
    sections: { entreprise: 'Entreprise', identite: 'Identité', produits: 'Produits et services', audiences: 'Audiences', messages: 'Messages clés', communication: 'Communication' },
    hints: {
      entreprise: 'Les faits de base, repris dans chaque texte.',
      identite: 'Ce qui donne du sens à vos messages.',
      produits: 'Ce que vous vendez : l’IA en parle avec vos mots.',
      audiences: 'À qui vous parlez, ce qui les bloque et ce qui les intéresse.',
      messages: 'Des règles que l’IA respecte toujours, par exemple « Toujours citer la garantie ».',
      communication: 'Le ton et le rythme de vos publications.',
    },
    fields: {
      name: 'Nom', industry: 'Secteur', location: 'Localisation', website: 'Site web', founded_year: 'Année de création', team_size: "Taille de l'équipe",
      short_desc: 'Description courte', mission: 'Mission', vision: 'Vision', values: 'Valeurs', tone: 'Ton de voix', targets: 'Objectifs', channels: 'Réseaux utilisés', frequency: 'Fréquence de publication',
    } as Record<CompanyField, string>,
    placeholders: {
      location: 'Ville, pays', website: 'https://', short_desc: 'En quelques phrases : ce que vous faites, pour qui, et ce qui vous distingue.',
      mission: 'Pourquoi vous existez.', vision: 'Où vous voulez aller.', values: 'Par exemple : exigence, proximité, transparence',
      tone: 'Par exemple : chaleureux et expert, tutoiement', targets: 'Par exemple : 30 inscriptions par mois, notoriété à Douala',
    } as Partial<Record<CompanyField, string>>,
    frequencies: ['1 fois par semaine', '3 fois par semaine', '5 fois par semaine', 'Chaque jour'],
    productName: 'Nom du produit ou service', productDesc: 'Description', addProduct: 'Ajouter un produit',
    segmentName: "Nom de l'audience", pain: 'Ce qui les bloque', interests: 'Ce qui les intéresse', addSegment: 'Ajouter une audience',
    messagePh: 'Nouvelle règle, puis Entrée', addMessage: 'Ajouter', remove: 'Supprimer', cancel: 'Annuler',
    confirm: 'Supprimer cet élément de la mémoire ?',
    knows: "Ce que l'IA sait de vous", complete: (p: number) => `${p} % complète`, missing: 'À compléter', allGood: 'La mémoire est complète.',
    checks: {
      basics: 'Nom, secteur et description', mission: 'Mission', vision: 'Vision', values: 'Valeurs', products: 'Au moins 2 produits ou services',
      audience: 'Une audience avec ses blocages', messages: 'Au moins 1 message clé', tone: 'Ton de voix', channels: 'Réseaux utilisés',
    },
    lessons: 'Leçons des derniers rapports', lessonsHint: 'Tirées des rapports hebdo et transmises à l’IA avec la mémoire.',
    showSent: "Voir le texte exact transmis à l'IA", hideSent: 'Masquer le texte',
  },
  en: {
    title: 'Company memory', subtitle: (n: string) => `Everything the AI knows about ${n}. Every change is saved automatically.`,
    saving: 'Saving…', saved: 'Saved', error: 'A change could not be saved', noCompany: 'No active company.',
    sections: { entreprise: 'Company', identite: 'Identity', produits: 'Products and services', audiences: 'Audiences', messages: 'Key messages', communication: 'Communication' },
    hints: {
      entreprise: 'The basic facts, used in every text.',
      identite: 'What gives your messages meaning.',
      produits: 'What you sell: the AI talks about it in your words.',
      audiences: 'Who you talk to, what holds them back and what interests them.',
      messages: 'Rules the AI always follows, for example “Always mention the guarantee”.',
      communication: 'The tone and rhythm of your posts.',
    },
    fields: {
      name: 'Name', industry: 'Industry', location: 'Location', website: 'Website', founded_year: 'Founded', team_size: 'Team size',
      short_desc: 'Short description', mission: 'Mission', vision: 'Vision', values: 'Values', tone: 'Tone of voice', targets: 'Objectives', channels: 'Networks used', frequency: 'Posting frequency',
    } as Record<CompanyField, string>,
    placeholders: {
      location: 'City, country', website: 'https://', short_desc: 'In a few sentences: what you do, for whom, and what sets you apart.',
      mission: 'Why you exist.', vision: 'Where you want to go.', values: 'For example: excellence, closeness, transparency',
      tone: 'For example: warm and expert, informal', targets: 'For example: 30 sign-ups a month, awareness in Douala',
    } as Partial<Record<CompanyField, string>>,
    frequencies: ['Once a week', '3 times a week', '5 times a week', 'Every day'],
    productName: 'Product or service name', productDesc: 'Description', addProduct: 'Add a product',
    segmentName: 'Audience name', pain: 'What holds them back', interests: 'What interests them', addSegment: 'Add an audience',
    messagePh: 'New rule, then Enter', addMessage: 'Add', remove: 'Delete', cancel: 'Cancel',
    confirm: 'Delete this item from the memory?',
    knows: 'What the AI knows about you', complete: (p: number) => `${p}% complete`, missing: 'To complete', allGood: 'The memory is complete.',
    checks: {
      basics: 'Name, industry and description', mission: 'Mission', vision: 'Vision', values: 'Values', products: 'At least 2 products or services',
      audience: 'An audience with what holds it back', messages: 'At least 1 key message', tone: 'Tone of voice', channels: 'Networks used',
    },
    lessons: 'Lessons from recent reports', lessonsHint: 'Taken from the weekly reports and passed to the AI with the memory.',
    showSent: 'See the exact text passed to the AI', hideSent: 'Hide the text',
  },
}
type Copy = typeof COPY.fr
type SectionId = keyof Copy['sections']

const pick = (company: Company | null) => Object.fromEntries(FIELDS.map(f => [f, (company?.[f] as string | undefined) ?? ''])) as Record<CompanyField, string>

// Tracks saves across the page so the header can say "Saved" or report a failure.
function useSaves() {
  const [state, setState] = useState<SaveState>('idle')
  const pending = useRef(0)
  const run = async (action: () => Promise<void>) => {
    pending.current += 1
    setState('saving')
    try {
      await action()
      pending.current -= 1
      if (!pending.current) setState('saved')
    } catch (err) {
      pending.current -= 1
      console.warn('Memory save failed', err)
      setState('error')
    }
  }
  return { state, run }
}

export default function MemoryPage() {
  const { lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const {
    activeCompany, products, segments, keyMessages, updateCompany,
    addProduct, updateProduct, removeProduct, addSegment, updateSegment, removeSegment,
    addKeyMessage, updateKeyMessage, removeKeyMessage,
  } = useCompany()
  const { hash } = useLocation()
  const saves = useSaves()
  const [form, setForm] = useState(() => pick(activeCompany))
  const [lessons, setLessons] = useState<string[]>([])
  const [showSent, setShowSent] = useState(false)
  const timers = useRef<Partial<Record<CompanyField, number>>>({})

  // Load the saved values when the company changes (not on every save).
  useEffect(() => { setForm(pick(activeCompany)) }, [activeCompany?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeCompany) return
    listReports(activeCompany.id).then(r => setLessons(recentLearnings(r))).catch(() => setLessons([]))
  }, [activeCompany?.id])

  // Links like /memory#produits land on their section.
  useEffect(() => {
    const id = hash.replace('#', '')
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [hash])

  // A company field saves itself shortly after typing stops.
  const setField = (field: CompanyField, value: string, delay = 700) => {
    setForm(f => ({ ...f, [field]: value }))
    if (!activeCompany) return
    window.clearTimeout(timers.current[field])
    timers.current[field] = window.setTimeout(() => {
      if (field === 'name' && !value.trim()) return
      void saves.run(() => updateCompany(activeCompany.id, { [field]: field === 'name' ? value.trim() : value }))
    }, delay)
  }

  const checks = useMemo(() => {
    const f = form
    const list: Array<{ key: keyof Copy['checks']; done: boolean; section: SectionId }> = [
      { key: 'basics', done: Boolean(f.name.trim() && f.industry.trim() && f.short_desc.trim()), section: 'entreprise' },
      { key: 'mission', done: Boolean(f.mission.trim()), section: 'identite' },
      { key: 'vision', done: Boolean(f.vision.trim()), section: 'identite' },
      { key: 'values', done: Boolean(f.values.trim()), section: 'identite' },
      { key: 'products', done: products.length >= 2, section: 'produits' },
      { key: 'audience', done: segments.some(s => s.pain_points.trim()), section: 'audiences' },
      { key: 'messages', done: keyMessages.length >= 1, section: 'messages' },
      { key: 'tone', done: Boolean(f.tone.trim()), section: 'communication' },
      { key: 'channels', done: parseChannels(f.channels).length > 0, section: 'communication' },
    ]
    return list
  }, [form, products, segments, keyMessages])
  const pct = Math.round((checks.filter(x => x.done).length / checks.length) * 100)

  if (!activeCompany) return <div className="p-6 text-sm text-ink-muted">{c.noCompany}</div>

  const sent = buildAiContext({ company: { ...activeCompany, ...form }, products, segments, keyMessages })
  const field = (key: CompanyField, opts: { multiline?: boolean; rows?: number; className?: string; type?: string } = {}) => (
    <label className={cn('fc-field', opts.className)}>
      <span className="fc-label">{c.fields[key]}</span>
      {opts.multiline
        ? <textarea className="fc-input" rows={opts.rows ?? 3} value={form[key]} placeholder={c.placeholders[key]} onChange={e => setField(key, e.target.value)} />
        : <input className="fc-input" type={opts.type ?? 'text'} value={form[key]} placeholder={c.placeholders[key]} onChange={e => setField(key, e.target.value)} />}
    </label>
  )
  const channels = parseChannels(form.channels)

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-3.5 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
            <p className="m-0 mt-0.5 text-sm text-ink-muted">{c.subtitle(activeCompany.name)}</p>
          </div>
          {saves.state !== 'idle' && (
            <span className={cn('inline-flex items-center gap-1.5 text-[13px]', saves.state === 'error' ? 'text-danger' : 'text-ink-muted')}>
              {saves.state === 'saved' && <Check className="h-3.5 w-3.5 text-success" />}
              {saves.state === 'saving' ? c.saving : saves.state === 'saved' ? c.saved : c.error}
            </span>
          )}
        </div>

        <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-3.5">
            <Section id="entreprise" c={c}>
              <div className="grid gap-3 sm:grid-cols-2">
                {field('name')}
                {field('industry')}
                {field('location')}
                {field('website', { type: 'url' })}
                {field('founded_year', { type: 'number' })}
                {field('team_size')}
                {field('short_desc', { multiline: true, rows: 4, className: 'sm:col-span-2' })}
              </div>
            </Section>

            <Section id="identite" c={c}>
              <div className="grid gap-3">
                {field('mission', { multiline: true, rows: 2 })}
                {field('vision', { multiline: true, rows: 2 })}
                {field('values')}
              </div>
            </Section>

            <Section id="produits" c={c} count={products.length}>
              <EditableList
                items={products.map(p => ({ id: p.id, values: { name: p.name, description: p.description } }))}
                fields={[{ key: 'name', label: c.productName }, { key: 'description', label: c.productDesc, multiline: true }]}
                addLabel={c.addProduct} removeLabel={c.remove} cancelLabel={c.cancel} confirm={c.confirm}
                onAdd={values => saves.run(() => addProduct({ name: values.name, description: values.description ?? '' }))}
                onChange={(id, values) => saves.run(() => updateProduct(id, values))}
                onRemove={id => saves.run(() => removeProduct(id))} />
            </Section>

            <Section id="audiences" c={c} count={segments.length}>
              <EditableList
                items={segments.map(s => ({ id: s.id, values: { name: s.name, pain_points: s.pain_points, interests: s.interests } }))}
                fields={[{ key: 'name', label: c.segmentName }, { key: 'pain_points', label: c.pain, multiline: true }, { key: 'interests', label: c.interests, multiline: true }]}
                addLabel={c.addSegment} removeLabel={c.remove} cancelLabel={c.cancel} confirm={c.confirm}
                onAdd={values => saves.run(() => addSegment({ name: values.name, pain_points: values.pain_points ?? '', interests: values.interests ?? '' }))}
                onChange={(id, values) => saves.run(() => updateSegment(id, values))}
                onRemove={id => saves.run(() => removeSegment(id))} />
            </Section>

            <Section id="messages" c={c} count={keyMessages.length}>
              <Messages items={keyMessages.map(k => ({ id: k.id, content: k.content }))} c={c}
                onAdd={content => saves.run(() => addKeyMessage(content))}
                onChange={(id, content) => saves.run(() => updateKeyMessage(id, content))}
                onRemove={id => saves.run(() => removeKeyMessage(id))} />
            </Section>

            <Section id="communication" c={c}>
              <div className="grid gap-3">
                {field('tone')}
                {field('targets', { multiline: true, rows: 2 })}
                <div className="fc-field">
                  <span className="fc-label">{c.fields.channels}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {CHANNELS.slice(0, 7).map(ch => {
                      const on = channels.includes(ch.value)
                      return <Chip key={ch.value} pressed={on} icon={<ch.icon className="h-3.5 w-3.5" style={{ color: ch.color }} />}
                        onClick={() => setField('channels', joinChannels(on ? channels.filter(x => x !== ch.value) : [...channels, ch.value]), 300)}>{ch.label}</Chip>
                    })}
                  </div>
                </div>
                <div className="fc-field">
                  <span className="fc-label">{c.fields.frequency}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {c.frequencies.map(fq => <Chip key={fq} pressed={form.frequency === fq} onClick={() => setField('frequency', fq, 300)}>{fq}</Chip>)}
                  </div>
                </div>
              </div>
            </Section>
          </div>

          <Card className="lg:sticky lg:top-4">
            <CardHeader title={c.knows} />
            <CardBody className="flex flex-col gap-3.5">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[20px] font-bold text-ink tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{pct} %</span>
                  <span className="text-[12px] text-ink-muted">{c.complete(pct)}</span>
                </div>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true"><span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                {checks.map(item => (
                  <li key={item.key} className="flex items-center gap-2">
                    <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded-full', item.done ? 'bg-success text-surface-card' : 'border border-line-strong')} aria-hidden="true">
                      {item.done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    {item.done ? <span className="text-ink-muted">{c.checks[item.key]}</span>
                      : <a href={`#${item.section}`} className="text-ink hover:text-brand hover:underline">{c.checks[item.key]}</a>}
                  </li>
                ))}
              </ul>
              {lessons.length > 0 && (
                <div className="border-t border-line pt-3">
                  <p className="m-0 text-[13px] font-bold text-ink">{c.lessons}</p>
                  <p className="m-0 mb-1.5 text-[12px] text-ink-muted">{c.lessonsHint}</p>
                  <ul className="m-0 flex flex-col gap-1 pl-4 text-[13px] leading-[19px] text-ink-muted">{lessons.map(l => <li key={l}>{l}</li>)}</ul>
                </div>
              )}
              <div className="border-t border-line pt-2.5">
                <button type="button" onClick={() => setShowSent(s => !s)} aria-expanded={showSent} className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted hover:text-ink">
                  {showSent ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{showSent ? c.hideSent : c.showSent}
                </button>
                {showSent && <pre className="m-0 mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-surface-sunken p-3 text-[11px] leading-4 text-ink-muted">{sent}</pre>}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Section({ id, c, count, children }: { id: SectionId; c: Copy; count?: number; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader title={<>{c.sections[id]}{count !== undefined && <span className="ml-1.5 font-semibold text-ink-muted">{count}</span>}</>} subtitle={c.hints[id]} />
      <CardBody>{children}</CardBody>
    </Card>
  )
}

// Rows edited in place: each field saves when it loses focus.
function EditableList<K extends string>({ items, fields, addLabel, removeLabel, cancelLabel, confirm, onAdd, onChange, onRemove }: {
  items: Array<{ id: string; values: Record<K, string> }>
  fields: Array<{ key: K; label: string; multiline?: boolean }>
  addLabel: string; removeLabel: string; cancelLabel: string; confirm: string
  onAdd: (values: Record<K, string>) => Promise<void>
  onChange: (id: string, values: Partial<Record<K, string>>) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const empty = () => Object.fromEntries(fields.map(f => [f.key, ''])) as Record<K, string>
  const [draft, setDraft] = useState<Record<K, string> | null>(null)
  const nameKey = fields[0].key

  return (
    <div className="flex flex-col gap-2">
      {items.map(item => <ListRow key={item.id} item={item} fields={fields} removeLabel={removeLabel}
        onChange={values => onChange(item.id, values)} onRemove={() => { if (window.confirm(confirm)) void onRemove(item.id) }} />)}
      {draft ? (
        <div className="grid gap-2 rounded-[var(--radius-md)] border border-dashed border-line-strong p-3 sm:grid-cols-2">
          {fields.map(f => (
            <label key={f.key} className={cn('fc-field', f.multiline && fields.length === 2 && 'sm:col-span-1')}>
              <span className="fc-label">{f.label}</span>
              {f.multiline
                ? <textarea className="fc-input" rows={2} value={draft[f.key]} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
                : <input className="fc-input" autoFocus={f.key === nameKey} value={draft[f.key]} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />}
            </label>
          ))}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>{cancelLabel}</Button>
            <Button variant="primary" size="sm" disabled={!draft[nameKey].trim()} onClick={() => { void onAdd({ ...draft, [nameKey]: draft[nameKey].trim() }); setDraft(null) }}>{addLabel}</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" icon={<Plus />} className="self-start" onClick={() => setDraft(empty())}>{addLabel}</Button>
      )}
    </div>
  )
}

function ListRow<K extends string>({ item, fields, removeLabel, onChange, onRemove }: {
  item: { id: string; values: Record<K, string> }
  fields: Array<{ key: K; label: string; multiline?: boolean }>
  removeLabel: string
  onChange: (values: Partial<Record<K, string>>) => Promise<void>
  onRemove: () => void
}) {
  const [values, setValues] = useState(item.values)
  const commit = (key: K) => {
    if (values[key] === item.values[key] || (key === fields[0].key && !values[key].trim())) return
    void onChange({ [key]: values[key] } as Partial<Record<K, string>>)
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[var(--radius-md)] border border-line p-3">
      <div className={cn('grid gap-2', fields.length === 2 ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' : 'sm:grid-cols-3')}>
        {fields.map(f => (
          <label key={f.key} className="fc-field">
            <span className="fc-label">{f.label}</span>
            {f.multiline
              ? <textarea className="fc-input" rows={2} value={values[f.key]} onChange={e => setValues({ ...values, [f.key]: e.target.value })} onBlur={() => commit(f.key)} />
              : <input className="fc-input font-semibold" value={values[f.key]} onChange={e => setValues({ ...values, [f.key]: e.target.value })} onBlur={() => commit(f.key)} />}
          </label>
        ))}
      </div>
      <Button variant="ghost" size="sm" iconOnly icon={<Trash2 />} aria-label={removeLabel} className="mt-5 text-danger" onClick={onRemove} />
    </div>
  )
}

function Messages({ items, c, onAdd, onChange, onRemove }: {
  items: Array<{ id: string; content: string }>; c: Copy
  onAdd: (content: string) => Promise<void>; onChange: (id: string, content: string) => Promise<void>; onRemove: (id: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const add = () => { if (text.trim()) { void onAdd(text.trim()); setText('') } }
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => <MessageRow key={item.id} item={item} c={c} onChange={content => onChange(item.id, content)} onRemove={() => { if (window.confirm(c.confirm)) void onRemove(item.id) }} />)}
      <div className="flex gap-2">
        <input className="fc-input flex-1" value={text} placeholder={c.messagePh} aria-label={c.messagePh}
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button variant="secondary" icon={<Plus />} disabled={!text.trim()} onClick={add}>{c.addMessage}</Button>
      </div>
    </div>
  )
}

function MessageRow({ item, c, onChange, onRemove }: { item: { id: string; content: string }; c: Copy; onChange: (content: string) => Promise<void>; onRemove: () => void }) {
  const [value, setValue] = useState(item.content)
  return (
    <div className="flex items-start gap-2">
      <textarea className="fc-input flex-1" rows={1} value={value} aria-label={c.sections.messages} style={{ minHeight: 34, paddingTop: 7, paddingBottom: 7 }}
        onChange={e => setValue(e.target.value)} onBlur={() => { if (value.trim() && value !== item.content) void onChange(value.trim()) }} />
      <Button variant="ghost" size="sm" iconOnly icon={<Trash2 />} aria-label={c.remove} className="mt-0.5 text-danger" onClick={onRemove} />
    </div>
  )
}
