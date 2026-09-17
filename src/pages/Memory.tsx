import { useState, useMemo, useCallback } from 'react'
import {
  Brain, Copy, Check, Plus, Trash2, RefreshCw,
  ChevronDown, ChevronRight, Sparkles, Shield,
  Users, Package, MessageSquare, Megaphone, Eye,
  Upload, Image as ImageIcon
} from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { cn } from '@/lib/utils'

// ─── Build system prompt from company data ─────────────────────
function buildSystemPrompt(
  company: ReturnType<typeof useCompany>['activeCompany'],
  products: ReturnType<typeof useCompany>['products'],
  segments: ReturnType<typeof useCompany>['segments'],
  keyMessages: ReturnType<typeof useCompany>['keyMessages'],
): string {
  if (!company) return ''
  const lines: string[] = [
    `# Brand Identity — ${company.name}`,
    '',
    `## Company Overview`,
    `- **Name**: ${company.name}`,
    company.industry   ? `- **Industry**: ${company.industry}`       : '',
    company.location   ? `- **Location**: ${company.location}`       : '',
    company.short_desc ? `- **Description**: ${company.short_desc}`  : '',
    '',
    `## Mission, Vision & Values`,
    company.mission ? `- **Mission**: ${company.mission}` : '',
    company.vision  ? `- **Vision**: ${company.vision}`   : '',
    company.values  ? `- **Values**: ${company.values}`   : '',
  ]
  if (products.length) {
    lines.push('', '## Products & Services')
    products.forEach(p => lines.push(`- **${p.name}**: ${p.description}`))
  }
  if (segments.length) {
    lines.push('', '## Target Audience')
    segments.forEach(s => {
      lines.push(`### ${s.name}`)
      if (s.pain_points) lines.push(`  - Pain points: ${s.pain_points}`)
      if (s.interests)   lines.push(`  - Interests: ${s.interests}`)
    })
  }
  if (keyMessages.length) {
    lines.push('', '## Key Messaging Rules')
    keyMessages.forEach(m => lines.push(`- ${m.content}`))
  }
  lines.push('', '## Communication Style')
  if (company.tone)      lines.push(`- **Tone**: ${company.tone}`)
  if (company.targets)   lines.push(`- **Objectives**: ${company.targets}`)
  if (company.channels)  lines.push(`- **Channels**: ${company.channels}`)
  if (company.frequency) lines.push(`- **Posting frequency**: ${company.frequency}`)
  if (company.logo_url)  lines.push(`- **Visual Branding**: Official logo configured. Recommend visual hooks and branding consistency.`)
  lines.push('', '---', '_Always write in the brand voice above. Stay consistent with the values and objectives._')
  return lines.filter(Boolean).join('\n')
}

// ─── Collapsible section ───────────────────────────────────────
const colorMap = {
  indigo:  'text-indigo-600  dark:text-indigo-400  bg-indigo-50  dark:bg-indigo-950/50',
  violet:  'text-violet-600  dark:text-violet-400  bg-violet-50  dark:bg-violet-950/50',
  blue:    'text-blue-600    dark:text-blue-400    bg-blue-50    dark:bg-blue-950/50',
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
  amber:   'text-amber-600   dark:text-amber-400   bg-amber-50   dark:bg-amber-950/50',
  rose:    'text-rose-600    dark:text-rose-400    bg-rose-50    dark:bg-rose-950/50',
}

function Section({
  icon: Icon, title, badge, color = 'indigo', children, defaultOpen = true,
}: {
  icon: React.ElementType; title: string; badge?: string | number
  color?: keyof typeof colorMap; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[var(--color-surface-alt)] transition-colors"
      >
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', colorMap[color])}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="font-semibold text-sm text-[var(--color-text)] flex-1 font-sans">{title}</span>
        {badge !== undefined && (
          <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-alt)] border border-[var(--color-border)] px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        {open ? <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
               : <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />}
      </button>
      {open && (
        <div className="px-5 pb-4 pt-1 border-t border-[var(--color-border)]">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Inline editable field ─────────────────────────────────────
function EditField({
  label, value, onChange, multiline = false, placeholder = '—',
}: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const cls = "w-full px-3 py-2 text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-[var(--color-text-muted)] resize-none"
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{label}</label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={placeholder} className={cls} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />}
    </div>
  )
}

// ─── Toast ─────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2200) }, [])
  return { msg, show }
}

// ─── Page ──────────────────────────────────────────────────────
export default function MemoryPage() {
  const { t, lang } = useI18n()
  const {
    activeCompany, products, segments, keyMessages,
    updateCompany, addProduct, removeProduct,
    addSegment, removeSegment, addKeyMessage, removeKeyMessage,
  } = useCompany()
  const toast = useToast()

  const [form, setForm] = useState({
    name:       activeCompany?.name        ?? '',
    industry:   activeCompany?.industry    ?? '',
    location:   activeCompany?.location    ?? '',
    website:    activeCompany?.website     ?? '',
    short_desc: activeCompany?.short_desc  ?? '',
    logo_url:   activeCompany?.logo_url    ?? '',
    mission:    activeCompany?.mission     ?? '',
    vision:     activeCompany?.vision      ?? '',
    values:     activeCompany?.values      ?? '',
    tone:       activeCompany?.tone        ?? '',
    targets:    activeCompany?.targets     ?? '',
    channels:   activeCompany?.channels    ?? '',
    frequency:  activeCompany?.frequency   ?? '',
  })
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  const [newProduct, setNewProduct]   = useState({ name: '', description: '' })
  const [newSegment, setNewSegment]   = useState({ name: '', pain_points: '', interests: '' })
  const [newMessage, setNewMessage]   = useState('')
  const [copied, setCopied]           = useState(false)

  const systemPrompt = useMemo(() =>
    buildSystemPrompt(activeCompany ? { ...activeCompany, ...form } : null, products, segments, keyMessages),
    [activeCompany, form, products, segments, keyMessages]
  )

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.show(lang === 'fr' ? 'Fichier trop lourd (max 2 Mo)' : 'File too large (max 2MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        set('logo_url')(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!activeCompany) return
    await updateCompany(activeCompany.id, form)
    toast.show(lang === 'fr' ? '✓ Mémoire sauvegardée' : '✓ Memory saved')
  }

  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) return
    await addProduct(newProduct); setNewProduct({ name: '', description: '' })
  }
  const handleAddSegment = async () => {
    if (!newSegment.name.trim()) return
    await addSegment(newSegment); setNewSegment({ name: '', pain_points: '', interests: '' })
  }
  const handleAddMessage = async () => {
    if (!newMessage.trim()) return
    await addKeyMessage(newMessage.trim()); setNewMessage('')
  }
  const handleCopy = async () => {
    await navigator.clipboard.writeText(systemPrompt)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }

  if (!activeCompany) return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <Brain className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
      <h2 className="text-xl font-bold text-[var(--color-text)] font-sans mb-2">
        {lang === 'fr' ? 'Aucune entreprise active' : 'No active company'}
      </h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        {lang === 'fr' ? 'Créez ou sélectionnez une entreprise d\'abord.' : 'Create or select a company first.'}
      </p>
    </div>
  )

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 gap-4 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
            <Brain className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--color-text)] font-sans leading-tight">{t('nav.memory')}</h1>
            <p className="text-xs text-[var(--color-text-muted)] truncate">
              {lang === 'fr' ? 'Contexte injecté dans chaque génération IA' : 'Context injected into every AI generation'}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="shrink-0 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {lang === 'fr' ? 'Sauvegarder' : 'Save'}
        </button>
      </div>

      {/* ── Body: 2 columns ── */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">

        {/* LEFT col — editable sections */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-6 min-w-0">

          {/* 1. Company Profile */}
          <Section icon={Shield} title={lang === 'fr' ? 'Profil Entreprise' : 'Company Profile'} color="indigo">
            {/* Logo Uploader */}
            <div className="mt-3 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] flex flex-wrap items-center gap-4">
              <div className="w-16 h-16 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Company Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-[var(--color-text-muted)]" />
                )}
              </div>
              <div className="flex-1 min-w-[200px] space-y-1.5">
                <p className="text-xs font-semibold text-[var(--color-text)]">
                  {lang === 'fr' ? 'Logo de l\'entreprise' : 'Company Logo'}
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {lang === 'fr' ? 'PNG, JPG ou SVG (max 2 Mo). Utilisé dans votre espace de travail.' : 'PNG, JPG, or SVG (max 2MB). Used across your workspace.'}
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{lang === 'fr' ? 'Importer un logo' : 'Upload Logo'}</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                  {form.logo_url && (
                    <button
                      type="button"
                      onClick={() => set('logo_url')('')}
                      className="text-xs text-rose-500 hover:underline px-2 py-1"
                    >
                      {lang === 'fr' ? 'Supprimer' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <EditField label={lang === 'fr' ? 'Nom' : 'Name'} value={form.name} onChange={set('name')} />
              <EditField label={lang === 'fr' ? 'Secteur' : 'Industry'} value={form.industry} onChange={set('industry')} />
              <EditField label={lang === 'fr' ? 'Localisation' : 'Location'} value={form.location} onChange={set('location')} placeholder="Country, City" />
              <EditField label="Website" value={form.website} onChange={set('website')} placeholder="https://" />
              <div className="sm:col-span-2">
                <EditField label={lang === 'fr' ? 'Description courte' : 'Short Description'} value={form.short_desc} onChange={set('short_desc')} multiline placeholder={lang === 'fr' ? 'En quoi consiste votre activité ?' : 'What does your business do?'} />
              </div>
            </div>
          </Section>

          {/* 2. Brand Identity */}
          <Section icon={Sparkles} title={lang === 'fr' ? 'Identité de Marque' : 'Brand Identity'} color="violet">
            <div className="space-y-3 mt-3">
              <EditField label="Mission" value={form.mission} onChange={set('mission')} multiline placeholder={lang === 'fr' ? 'Pourquoi existez-vous ?' : 'Why do you exist?'} />
              <EditField label="Vision" value={form.vision} onChange={set('vision')} multiline placeholder={lang === 'fr' ? 'Où voulez-vous aller ?' : 'Where do you want to go?'} />
              <EditField label={lang === 'fr' ? 'Valeurs' : 'Values'} value={form.values} onChange={set('values')} placeholder="Innovation, Transparence, Impact..." />
            </div>
          </Section>

          {/* 3. Products */}
          <Section icon={Package} title={lang === 'fr' ? 'Produits & Services' : 'Products & Services'} badge={products.length} color="blue">
            <div className="mt-3 space-y-2">
              {products.map(p => (
                <div key={p.id} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[var(--color-text)]">{p.name}</p>
                    {p.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{p.description}</p>}
                  </div>
                  <button onClick={() => removeProduct(p.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-3 space-y-2">
                <input value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                  placeholder={lang === 'fr' ? 'Nom du produit / service' : 'Product / service name'}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-indigo-500" />
                <input value={newProduct.description} onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))}
                  placeholder={lang === 'fr' ? 'Description courte' : 'Short description'}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-indigo-500" />
                <button onClick={handleAddProduct} disabled={!newProduct.name.trim()} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40">
                  <Plus className="w-3.5 h-3.5" /> {lang === 'fr' ? 'Ajouter' : 'Add'}
                </button>
              </div>
            </div>
          </Section>

          {/* 4. Audience */}
          <Section icon={Users} title={lang === 'fr' ? 'Audience Cible' : 'Target Audience'} badge={segments.length} color="emerald">
            <div className="mt-3 space-y-2">
              {segments.map(s => (
                <div key={s.id} className="p-3 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-sm text-[var(--color-text)]">{s.name}</p>
                    <button onClick={() => removeSegment(s.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {s.pain_points && <p className="text-xs text-[var(--color-text-muted)]"><span className="text-rose-500 font-medium">⚡ </span>{s.pain_points}</p>}
                  {s.interests   && <p className="text-xs text-[var(--color-text-muted)] mt-0.5"><span className="text-emerald-500 font-medium">✦ </span>{s.interests}</p>}
                </div>
              ))}
              <div className="border-2 border-dashed border-[var(--color-border)] rounded-xl p-3 space-y-2">
                {(['name', 'pain_points', 'interests'] as const).map(k => (
                  <input key={k} value={newSegment[k]} onChange={e => setNewSegment(s => ({ ...s, [k]: e.target.value }))}
                    placeholder={k === 'name' ? (lang === 'fr' ? 'Nom du segment' : 'Segment name') : k === 'pain_points' ? (lang === 'fr' ? 'Points de douleur' : 'Pain points') : (lang === 'fr' ? 'Intérêts & aspirations' : 'Interests & aspirations')}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-indigo-500" />
                ))}
                <button onClick={handleAddSegment} disabled={!newSegment.name.trim()} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40">
                  <Plus className="w-3.5 h-3.5" /> {lang === 'fr' ? 'Ajouter' : 'Add'}
                </button>
              </div>
            </div>
          </Section>

          {/* 5. Key Messaging Rules */}
          <Section icon={MessageSquare} title={lang === 'fr' ? 'Règles de Messagerie' : 'Key Messaging Rules'} badge={keyMessages.length} color="amber">
            <p className="text-xs text-[var(--color-text-muted)] mt-2 mb-3">
              {lang === 'fr' ? 'Instructions que l\'IA doit toujours respecter.' : 'Instructions the AI must always follow.'}
            </p>
            <div className="space-y-2">
              {keyMessages.map(m => (
                <div key={m.id} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                  <span className="text-amber-500 text-sm mt-0.5">›</span>
                  <p className="flex-1 text-sm text-[var(--color-text)]">{m.content}</p>
                  <button onClick={() => removeKeyMessage(m.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddMessage()}
                  placeholder={lang === 'fr' ? 'Ex: Toujours mentionner la garantie satisfait ou remboursé' : 'E.g. Always mention the money-back guarantee'}
                  className="flex-1 text-sm px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-indigo-500" />
                <button onClick={handleAddMessage} disabled={!newMessage.trim()} className="p-2.5 bg-indigo-600 text-white rounded-xl disabled:opacity-40 hover:bg-indigo-700">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Section>

          {/* 6. Communication Style */}
          <Section icon={Megaphone} title={lang === 'fr' ? 'Style de Communication' : 'Communication Style'} color="rose" defaultOpen={false}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <EditField label={lang === 'fr' ? 'Ton de voix' : 'Tone of voice'} value={form.tone} onChange={set('tone')} />
              <EditField label={lang === 'fr' ? 'Objectifs' : 'Objectives'} value={form.targets} onChange={set('targets')} />
              <EditField label={lang === 'fr' ? 'Canaux' : 'Channels'} value={form.channels} onChange={set('channels')} />
              <EditField label={lang === 'fr' ? 'Fréquence' : 'Frequency'} value={form.frequency} onChange={set('frequency')} />
            </div>
          </Section>

        </div>{/* end left col */}

        {/* RIGHT col — sticky AI Prompt Preview */}
        <div className="hidden lg:flex w-80 xl:w-96 shrink-0 flex-col gap-3">
          <div className="flex-1 bg-gradient-to-br from-indigo-950 to-violet-950 rounded-2xl border border-indigo-800 overflow-hidden flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-indigo-800/60">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-300" />
                <div>
                  <p className="text-xs font-bold text-white">
                    {lang === 'fr' ? 'Aperçu Prompt IA' : 'AI Prompt Preview'}
                  </p>

                </div>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 text-xs font-medium rounded-lg transition-colors shrink-0"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? (lang === 'fr' ? 'Copié !' : 'Copied!') : (lang === 'fr' ? 'Copier' : 'Copy')}
              </button>
            </div>

            {/* Prompt text — scrollable */}
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-xs text-indigo-100 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {systemPrompt || (lang === 'fr' ? '(Remplissez les sections pour voir le prompt)' : '(Fill in sections to see the prompt)')}
              </pre>
            </div>

            {/* Stats footer */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-t border-indigo-800/60 text-[10px] text-indigo-400 font-medium">
              <span>{systemPrompt.split(/\s+/).filter(Boolean).length} {lang === 'fr' ? 'mots' : 'words'}</span>
              <span className="text-indigo-700">·</span>
              <span>~{Math.ceil(systemPrompt.length / 4)} tokens</span>
              <span className="text-indigo-700">·</span>
              <span className={systemPrompt.length > 3000 ? 'text-amber-400' : 'text-emerald-400'}>
                {systemPrompt.length > 3000 ? (lang === 'fr' ? 'Long' : 'Long') : (lang === 'fr' ? 'Optimal' : 'Optimal')}
              </span>
            </div>
          </div>
        </div>

      </div>{/* end body */}

      {/* Toast */}
      {toast.msg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-2xl shadow-xl">
          {toast.msg}
        </div>
      )}

    </div>
  )
}
