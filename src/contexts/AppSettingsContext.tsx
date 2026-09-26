import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { ALL_MODULES, enabledModules, type ModuleDefinition, type ModuleId } from '@/modules/registry'

// Installation-wide settings: which modules this installation has. The theme
// lives in ThemeContext. Both are loaded from the installation's settings
// record once it exists (scripts/dataverse/create-settings-table.mjs); until
// then every module is enabled.
interface AppSettingsValue {
  moduleIds: ModuleId[]
  modules: ModuleDefinition[]
  isEnabled: (id: ModuleId) => boolean
  setModuleIds: (ids: ModuleId[]) => void
}

const AppSettingsContext = createContext<AppSettingsValue | null>(null)

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [moduleIds, setModuleIds] = useState<ModuleId[]>(ALL_MODULES)
  const value = useMemo<AppSettingsValue>(() => {
    const modules = enabledModules(moduleIds)
    const ids = new Set(modules.map(m => m.id))
    return { moduleIds, modules, isEnabled: id => ids.has(id), setModuleIds }
  }, [moduleIds])
  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider')
  return ctx
}
