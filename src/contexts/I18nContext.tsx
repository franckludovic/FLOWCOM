import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import fr, { type TranslationKey } from '@/i18n/fr'
import en from '@/i18n/en'
import type { Lang } from '@/types'

const STORAGE_KEY = 'flowcom:lang'

interface I18nContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  toggle: () => void
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'en' ? 'en' : 'fr'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (l: Lang) => setLangState(l)
  const toggle = () => setLangState(l => l === 'fr' ? 'en' : 'fr')
  const t = (key: TranslationKey): string => {
    const dict = lang === 'fr' ? fr : en
    return dict[key] ?? key
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, toggle, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
