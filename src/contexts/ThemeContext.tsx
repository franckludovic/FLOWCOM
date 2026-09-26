import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Theme } from '@/types'
import { normalizeTheme, themeCss } from '@/theme/derive'
import type { ThemeSettings } from '@/theme/tokens'

const MODE_KEY = 'flowcom:theme'
// Last installation theme, so the next visit paints in the right brand at once.
const SETTINGS_KEY = 'flowcom:theme-settings'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
  // The installation's brand (colours, fonts, corners, density, logo).
  settings: ThemeSettings
  setSettings: (settings: Partial<ThemeSettings>) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getInitialMode(): Theme {
  try {
    const stored = localStorage.getItem(MODE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* storage blocked */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialSettings(): ThemeSettings {
  try {
    return normalizeTheme(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'))
  } catch {
    return normalizeTheme(null)
  }
}

// Writes the theme's CSS variables into one <style> element in <head>.
function applySettings(settings: ThemeSettings) {
  let el = document.getElementById('fc-theme') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'fc-theme'
    document.head.prepend(el)
  }
  el.textContent = themeCss(settings)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialMode)
  const [settings, setSettingsState] = useState<ThemeSettings>(() => {
    const initial = getInitialSettings()
    applySettings(initial)
    return initial
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem(MODE_KEY, theme) } catch { /* storage blocked */ }
  }, [theme])

  useEffect(() => {
    applySettings(settings)
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage blocked */ }
  }, [settings])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggle = () => setThemeState(t => t === 'light' ? 'dark' : 'light')
  const setSettings = (next: Partial<ThemeSettings>) => setSettingsState(prev => normalizeTheme({ ...prev, ...next }))

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme, settings, setSettings }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
