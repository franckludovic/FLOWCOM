import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ALL_MODULES, enabledModules, type ModuleDefinition, type ModuleId } from '@/modules/registry'
import { loadInstallationSettings, saveInstallationSettings, type InstallationSettings } from '@/lib/appSettings'
import { normalizeTheme } from '@/theme/derive'
import type { ThemeSettings } from '@/theme/tokens'
import { useAuth } from './AuthContext'
import { useTheme } from './ThemeContext'

// Installation-wide settings: the enabled modules and the saved theme, from
// the installation's settings record. Until it loads (or when none exists)
// every module is enabled and the FlowCom theme applies.
interface AppSettingsValue {
  moduleIds: ModuleId[]
  modules: ModuleDefinition[]
  isEnabled: (id: ModuleId) => boolean
  // The theme as saved; ThemeContext may hold an unsaved preview.
  savedTheme: ThemeSettings
  saveTheme: (theme: ThemeSettings) => Promise<void>
  saveModules: (ids: ModuleId[]) => Promise<void>
  loaded: boolean
}

const AppSettingsContext = createContext<AppSettingsValue | null>(null)

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { setSettings } = useTheme()
  const [installation, setInstallation] = useState<InstallationSettings>({ id: null, theme: normalizeTheme(null), modules: ALL_MODULES })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    let alive = true
    loadInstallationSettings()
      .then(result => {
        if (!alive) return
        setInstallation(result)
        setSettings(result.theme)
      })
      .catch(err => console.warn('Could not load installation settings; using defaults', err))
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [user?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const saveTheme = useCallback(async (theme: ThemeSettings) => {
    const next = await saveInstallationSettings(installation, { theme: normalizeTheme(theme) })
    setInstallation(next)
    setSettings(next.theme)
  }, [installation, setSettings])

  const saveModules = useCallback(async (ids: ModuleId[]) => {
    setInstallation(await saveInstallationSettings(installation, { modules: ids }))
  }, [installation])

  const value = useMemo<AppSettingsValue>(() => {
    const modules = enabledModules(installation.modules)
    const ids = new Set(modules.map(m => m.id))
    return {
      moduleIds: installation.modules, modules, isEnabled: id => ids.has(id),
      savedTheme: installation.theme, saveTheme, saveModules, loaded,
    }
  }, [installation, saveTheme, saveModules, loaded])

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider')
  return ctx
}
