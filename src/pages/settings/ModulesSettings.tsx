import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useAppSettings } from '@/contexts/AppSettingsContext'
import { Badge, Button, Card, CardFooter, CardHeader } from '@/components/ui'
import { MODULES, type ModuleId } from '@/modules/registry'
import type { TranslationKey } from '@/i18n/fr'

const DESCRIPTIONS: Record<ModuleId, { fr: string; en: string }> = {
  core: { fr: 'Entreprises, mémoire, utilisateurs, intégrations et apparence. Toujours actif.', en: 'Companies, memory, users, integrations and appearance. Always on.' },
  pilotage: { fr: 'Rapport hebdomadaire et feuille de route.', en: 'Weekly report and roadmap.' },
  campaigns: { fr: 'Campagnes, zones cibles, résultats, brief et analyse IA.', en: 'Campaigns, target zones, results, AI brief and analysis.' },
  'marketing-studio': { fr: 'Calendrier, générateur de contenu, bibliothèque, Studio et historique des publications.', en: 'Calendar, content generator, library, Studio and publishing history.' },
  assistant: { fr: 'L\'assistant IA, qui utilise les données de tous les modules actifs.', en: 'The AI assistant, using the data of every enabled module.' },
}

export function ModulesSettings({ canManage }: { canManage: boolean }) {
  const { lang, t } = useI18n()
  const fr = lang === 'fr'
  const { moduleIds, saveModules } = useAppSettings()
  const [draft, setDraft] = useState<ModuleId[]>(moduleIds)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setDraft(moduleIds), [moduleIds])

  const dirty = [...draft].sort().join() !== [...moduleIds].sort().join()
  const toggle = (id: ModuleId) => { setSaved(false); setDraft(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id]) }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await saveModules(draft.includes('core') ? draft : ['core', ...draft])
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader title={fr ? 'Modules' : 'Modules'} subtitle={fr
        ? 'Les modules actifs de cette installation. Un module désactivé disparaît du menu et de l\'assistant.'
        : 'This installation\'s enabled modules. A disabled module disappears from the menu and the assistant.'} />
      <ul className="divide-y divide-line">
        {MODULES.map(module => {
          const on = module.core || draft.includes(module.id)
          return (
            <li key={module.id} className="flex items-start gap-3 px-4 py-3">
              <input type="checkbox" id={`module-${module.id}`} checked={on} disabled={module.core || !canManage} onChange={() => toggle(module.id)}
                className="mt-1 h-4 w-4 accent-[var(--brand)]" />
              <label htmlFor={`module-${module.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {t(module.labelKey as TranslationKey)}
                  {module.core && <Badge>{fr ? 'Toujours actif' : 'Always on'}</Badge>}
                </span>
                <span className="block text-[13px] text-ink-muted">{DESCRIPTIONS[module.id][fr ? 'fr' : 'en']}</span>
              </label>
            </li>
          )
        })}
      </ul>
      <CardFooter>
        {error && <p className="mr-auto self-center text-[13px] text-danger">{error}</p>}
        {saved && !dirty && <span className="mr-auto inline-flex items-center gap-1 self-center text-[13px] font-semibold text-success"><Check className="h-4 w-4" />{fr ? 'Enregistré' : 'Saved'}</span>}
        <Button variant="primary" size="sm" disabled={!canManage || !dirty} loading={saving} onClick={() => void save()}>{fr ? 'Enregistrer' : 'Save'}</Button>
      </CardFooter>
    </Card>
  )
}
