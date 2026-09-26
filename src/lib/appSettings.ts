import { Fc_appsettingsService } from '@/generated'
import { unwrap } from './dataverse'
import { normalizeTheme } from '@/theme/derive'
import type { ThemeSettings } from '@/theme/tokens'
import { ALL_MODULES, type ModuleId } from '@/modules/registry'

// The installation's settings record (fc_appsetting, fc_key "installation"):
// its theme and its enabled modules, both stored as JSON.
const KEY = 'installation'

export interface InstallationSettings {
  id: string | null
  theme: ThemeSettings
  modules: ModuleId[]
}

function parseModules(json: string | undefined): ModuleId[] {
  try {
    const list = JSON.parse(json ?? 'null')
    const valid = Array.isArray(list) ? list.filter((m): m is ModuleId => (ALL_MODULES as string[]).includes(m)) : []
    return valid.length ? valid : ALL_MODULES
  } catch {
    return ALL_MODULES
  }
}

export async function loadInstallationSettings(): Promise<InstallationSettings> {
  const row = unwrap(await Fc_appsettingsService.getAll({ filter: `fc_key eq '${KEY}'`, top: 1 }), 'load installation settings')[0]
  if (!row) return { id: null, theme: normalizeTheme(null), modules: ALL_MODULES }
  let theme: Partial<ThemeSettings> | null = null
  try { theme = JSON.parse(row.fc_theme ?? 'null') } catch { theme = null }
  return { id: row.fc_appsettingid, theme: normalizeTheme(theme), modules: parseModules(row.fc_modules) }
}

export async function saveInstallationSettings(current: InstallationSettings, changes: { theme?: ThemeSettings; modules?: ModuleId[] }): Promise<InstallationSettings> {
  const next = { ...current, ...changes }
  const payload = { fc_theme: JSON.stringify(next.theme), fc_modules: JSON.stringify(next.modules) }
  if (current.id) {
    unwrap(await Fc_appsettingsService.update(current.id, payload), 'save installation settings')
    return next
  }
  const row = unwrap(await Fc_appsettingsService.create({ ...payload, fc_key: KEY, fc_name: 'Installation', statecode: 0 } as never), 'create installation settings')
  return { ...next, id: row.fc_appsettingid }
}
