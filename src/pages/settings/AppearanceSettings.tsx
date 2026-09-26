import { useEffect, useRef, useState } from 'react'
import { Check, Moon, RotateCcw, Sun } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useAppSettings } from '@/contexts/AppSettingsContext'
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, Chip, InsightCard, KpiTile, SelectField, TextField } from '@/components/ui'
import { deriveBrand, normalizeTheme } from '@/theme/derive'
import { isHexColor } from '@/theme/color'
import { DEFAULT_THEME, FONT_OPTIONS, type FontOption, type ThemeSettings } from '@/theme/tokens'
import { cn } from '@/lib/utils'

const COPY = {
  fr: {
    title: 'Apparence', subtitle: 'Couleurs, logo, polices et style de cette installation. Les changements s\'appliquent à tous les utilisateurs une fois enregistrés.',
    brand: 'Identité', productName: 'Nom du produit', primary: 'Couleur principale', accent: 'Couleur d\'accent (IA)',
    logoLight: 'Logo, mode clair (URL)', logoDark: 'Logo, mode sombre (URL)', logoHint: 'Image https, par exemple hébergée sur Cloudinary.',
    type: 'Typographie', displayFont: 'Titres et chiffres', bodyFont: 'Texte',
    style: 'Style', corners: 'Angles', sharp: 'Nets', soft: 'Doux', round: 'Arrondis', shadows: 'Ombres', flat: 'Plates', softShadow: 'Douces',
    density: 'Densité', compact: 'Compacte', comfortable: 'Confortable',
    used: 'Couleurs utilisées', adjusted: 'ajustée pour la lisibilité', light: 'Clair', dark: 'Sombre',
    preview: 'Aperçu', previewNote: 'Toute l\'application affiche déjà vos changements.',
    save: 'Enregistrer', saving: 'Enregistrement…', saved: 'Enregistré', cancel: 'Annuler les changements', reset: 'Revenir à FlowCom',
    ownerOnly: 'Seuls les propriétaires et administrateurs peuvent modifier l\'apparence.',
    invalidColor: 'Saisissez une couleur au format #rrggbb.',
  },
  en: {
    title: 'Appearance', subtitle: 'Colours, logo, fonts and style of this installation. Changes apply to every user once saved.',
    brand: 'Identity', productName: 'Product name', primary: 'Primary colour', accent: 'Accent colour (AI)',
    logoLight: 'Logo, light mode (URL)', logoDark: 'Logo, dark mode (URL)', logoHint: 'An https image, for example hosted on Cloudinary.',
    type: 'Typography', displayFont: 'Headings and figures', bodyFont: 'Text',
    style: 'Style', corners: 'Corners', sharp: 'Sharp', soft: 'Soft', round: 'Round', shadows: 'Shadows', flat: 'Flat', softShadow: 'Soft',
    density: 'Density', compact: 'Compact', comfortable: 'Comfortable',
    used: 'Colours in use', adjusted: 'adjusted for readability', light: 'Light', dark: 'Dark',
    preview: 'Preview', previewNote: 'The whole app already shows your changes.',
    save: 'Save', saving: 'Saving…', saved: 'Saved', cancel: 'Discard changes', reset: 'Back to FlowCom',
    ownerOnly: 'Only owners and admins can change the appearance.',
    invalidColor: 'Enter a colour as #rrggbb.',
  },
}

function ColorField({ label, value, onChange, disabled, error }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; error?: string }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <div className="fc-field">
      <span className="fc-label">{label}</span>
      <div className="flex gap-2">
        <input type="color" value={isHexColor(value) ? value : '#000000'} disabled={disabled} aria-label={label}
          onChange={e => onChange(e.target.value)}
          className="h-[var(--control-md)] w-12 shrink-0 cursor-pointer rounded-[var(--radius-md)] border border-line-strong bg-surface-card p-1" />
        <input className="fc-input font-mono" value={text} disabled={disabled} aria-label={`${label} (hex)`} maxLength={7}
          onChange={e => { setText(e.target.value); if (isHexColor(e.target.value)) onChange(e.target.value.toLowerCase()) }} />
      </div>
      {error && !isHexColor(text) && <span className="fc-hint" style={{ color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="h-6 w-6 shrink-0 rounded-[var(--radius-sm)] border border-line" style={{ background: color }} />
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold text-ink">{label}</span>
        <span className="block font-mono text-[11px] text-ink-muted">{color}</span>
      </span>
    </div>
  )
}

export function AppearanceSettings({ canManage }: { canManage: boolean }) {
  const { lang } = useI18n()
  const c = COPY[lang === 'fr' ? 'fr' : 'en']
  const { settings, setSettings, theme: mode, setTheme } = useTheme()
  const { savedTheme, saveTheme } = useAppSettings()
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState('')

  // Leaving the page without saving restores the saved theme.
  const savedRef = useRef(savedTheme)
  savedRef.current = savedTheme
  useEffect(() => () => setSettings(savedRef.current), [setSettings])

  const dirty = JSON.stringify(normalizeTheme(settings)) !== JSON.stringify(normalizeTheme(savedTheme))
  const update = (change: Partial<ThemeSettings>) => { setJustSaved(false); setSettings(change) }
  const derived = deriveBrand(settings.primary, settings.accent)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await saveTheme(settings)
      setJustSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const option = <T extends string>(value: T, current: T, label: string, set: (v: T) => void) => (
    <Chip key={value} pressed={current === value} onClick={() => set(value)} disabled={!canManage}>{label}</Chip>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4 min-w-0">
        {!canManage && <p className="rounded-[var(--radius-md)] bg-warning-soft px-3 py-2 text-[13px] text-warning">{c.ownerOnly}</p>}

        <Card>
          <CardHeader title={c.brand} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <TextField label={c.productName} value={settings.productName ?? ''} disabled={!canManage} maxLength={40}
              onChange={e => update({ productName: e.target.value })} className="sm:col-span-2" />
            <ColorField label={c.primary} value={settings.primary} disabled={!canManage} error={c.invalidColor} onChange={v => update({ primary: v })} />
            <ColorField label={c.accent} value={settings.accent} disabled={!canManage} error={c.invalidColor} onChange={v => update({ accent: v })} />
            <TextField label={c.logoLight} value={settings.logoLight ?? ''} disabled={!canManage} placeholder="https://…" hint={c.logoHint}
              onChange={e => update({ logoLight: e.target.value.trim() || undefined })} />
            <TextField label={c.logoDark} value={settings.logoDark ?? ''} disabled={!canManage} placeholder="https://…"
              onChange={e => update({ logoDark: e.target.value.trim() || undefined })} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={c.type} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {(['displayFont', 'bodyFont'] as const).map(key => (
              <SelectField key={key} label={key === 'displayFont' ? c.displayFont : c.bodyFont} value={settings[key]} disabled={!canManage}
                onChange={e => update({ [key]: e.target.value as FontOption })}>
                {(Object.keys(FONT_OPTIONS) as FontOption[]).map(font => <option key={font} value={font} style={{ fontFamily: FONT_OPTIONS[font] }}>{font}</option>)}
              </SelectField>
            ))}
            <p className="sm:col-span-2 text-[15px] text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Campagne Rentrée 2026 · 12 480
              <span className="block text-sm font-normal text-ink-muted" style={{ fontFamily: 'var(--font-body)' }}>La campagne a atteint 62 % de son objectif de portée.</span>
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={c.style} />
          <CardBody className="space-y-4">
            <div className="fc-field"><span className="fc-label">{c.corners}</span><div className="flex flex-wrap gap-2">
              {option('sharp', settings.corners, c.sharp, v => update({ corners: v }))}
              {option('soft', settings.corners, c.soft, v => update({ corners: v }))}
              {option('round', settings.corners, c.round, v => update({ corners: v }))}
            </div></div>
            <div className="fc-field"><span className="fc-label">{c.shadows}</span><div className="flex flex-wrap gap-2">
              {option('flat', settings.shadows, c.flat, v => update({ shadows: v }))}
              {option('soft', settings.shadows, c.softShadow, v => update({ shadows: v }))}
            </div></div>
            <div className="fc-field"><span className="fc-label">{c.density}</span><div className="flex flex-wrap gap-2">
              {option('compact', settings.density, c.compact, v => update({ density: v }))}
              {option('comfortable', settings.density, c.comfortable, v => update({ density: v }))}
            </div></div>
          </CardBody>
          <CardFooter>
            {error && <p className="mr-auto self-center text-[13px] text-danger">{error}</p>}
            {justSaved && !dirty && <span className="mr-auto inline-flex items-center gap-1 self-center text-[13px] font-semibold text-success"><Check className="h-4 w-4" />{c.saved}</span>}
            <Button variant="ghost" size="sm" icon={<RotateCcw />} disabled={!canManage} onClick={() => update(DEFAULT_THEME)}>{c.reset}</Button>
            <Button variant="secondary" size="sm" disabled={!dirty || saving} onClick={() => setSettings(savedTheme)}>{c.cancel}</Button>
            <Button variant="primary" size="sm" disabled={!canManage || !dirty} loading={saving} onClick={() => void save()}>{saving ? c.saving : c.save}</Button>
          </CardFooter>
        </Card>
      </div>

      <div className="space-y-4 min-w-0 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader title={c.preview} subtitle={c.previewNote} actions={
            <div className="flex gap-1">
              <Button variant={mode === 'light' ? 'primary' : 'ghost'} size="sm" iconOnly icon={<Sun />} aria-label={c.light} onClick={() => setTheme('light')} />
              <Button variant={mode === 'dark' ? 'primary' : 'ghost'} size="sm" iconOnly icon={<Moon />} aria-label={c.dark} onClick={() => setTheme('dark')} />
            </div>
          } />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm">Publier</Button>
              <Button variant="secondary" size="sm">Modifier</Button>
              <Button variant="ai" size="sm">Générer</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="brand">Vous</Badge><Badge tone="success">Active</Badge><Badge tone="warning">En attente</Badge><Badge tone="ai">IA</Badge>
            </div>
            <KpiTile label="Portée" value={12480} target={20000} />
            <InsightCard title="Rentrée 2026 est en retard sur son objectif" evidence={['Résultats (18 jours)']}>
              42 prospects sur 120 au jour 18/30.
            </InsightCard>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={c.used} />
          <CardBody className="grid grid-cols-2 gap-3">
            {(['light', 'dark'] as const).map(m => (
              <div key={m} className="space-y-2 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">{m === 'light' ? c.light : c.dark}</p>
                <Swatch color={derived[m].brand} label="brand" />
                <Swatch color={derived[m]['brand-soft']} label="brand-soft" />
                <Swatch color={derived[m].accent} label="accent" />
                <Swatch color={derived[m]['accent-ink']} label="accent-ink" />
              </div>
            ))}
            {derived.light.brand !== settings.primary && (
              <p className={cn('col-span-2 text-[12px] text-ink-muted')}>{c.primary} : {settings.primary} → {derived.light.brand}, {c.adjusted}.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
