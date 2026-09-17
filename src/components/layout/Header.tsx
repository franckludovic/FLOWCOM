import { useState } from 'react'
import {
  Sun, Moon, Key, Building2, ChevronDown, LogOut, Plus, Check, Menu, X, ExternalLink
} from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCompany } from '@/contexts/CompanyContext'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onToggleMobileMenu?: () => void
}

export default function Header({ onToggleMobileMenu }: HeaderProps) {
  const { t, lang, toggle: toggleLang } = useI18n()
  const { theme, toggle: toggleTheme } = useTheme()
  const { profile, signOut, updateApiKey } = useAuth()
  const { companies, activeCompany, setActiveCompany, createCompany } = useCompany()

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [apiKeyOpen, setApiKeyOpen] = useState(false)
  const [inputKey, setInputKey] = useState(profile?.api_key || '')
  const [keySavedToast, setKeySavedToast] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [creatingCompany, setCreatingCompany] = useState(false)

  const hasApiKey = !!profile?.api_key

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) return
    setCreatingCompany(true)
    const company = await createCompany(newCompanyName.trim())
    if (company) {
      await setActiveCompany(company)
      setNewCompanyName('')
      setCompanyMenuOpen(false)
    }
    setCreatingCompany(false)
  }

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputKey.trim()) return
    await updateApiKey(inputKey.trim())
    setKeySavedToast(true)
    setTimeout(() => {
      setKeySavedToast(false)
      setApiKeyOpen(false)
    }, 1200)
  }

  return (
    <header className="h-14 flex items-center justify-between px-3 sm:px-6 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
      {/* Left: Hamburger (mobile) + Active company selector */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Mobile Hamburger Toggle */}
        <button
          onClick={onToggleMobileMenu}
          className="p-2 -ml-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] md:hidden transition-colors"
          title="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Company Switcher */}
        <div className="relative">
          <button
            onClick={() => setCompanyMenuOpen(!companyMenuOpen)}
            className={cn(
              'flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors',
              'hover:bg-[var(--color-surface-alt)] text-[var(--color-text)]'
            )}
          >
            <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--color-text-muted)] shrink-0" />
            <span className="truncate max-w-[110px] sm:max-w-[200px]">
              {activeCompany?.name ?? t('header.noCompany')}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
          </button>

          {companyMenuOpen && (
            <div className="absolute top-full mt-1 left-0 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg z-50 py-1.5">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                {t('header.companies')}
              </div>
              {companies.map(company => (
                <button
                  key={company.id}
                  onClick={async () => { await setActiveCompany(company); setCompanyMenuOpen(false) }}
                  className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-[var(--color-surface-alt)] text-[var(--color-text)]"
                >
                  <span className="truncate">{company.name}</span>
                  {company.is_active && <Check className="w-4 h-4 text-indigo-500 shrink-0" />}
                </button>
              ))}
              <div className="border-t border-[var(--color-border)] mt-1 pt-2 px-3 pb-2">
                <div className="flex gap-2">
                  <input
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateCompany()}
                    placeholder={t('company.namePh')}
                    className="flex-1 text-xs sm:text-sm px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleCreateCompany}
                    disabled={creatingCompany || !newCompanyName.trim()}
                    className="px-2.5 py-1.5 bg-indigo-600 text-white text-xs sm:text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right controls: Lang, Theme, API key, Sign out */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Language switch */}
        <button
          onClick={toggleLang}
          className="px-2 py-1 rounded-lg text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors uppercase tracking-wider"
        >
          {lang === 'fr' ? 'EN' : 'FR'}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 sm:p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors"
          title={theme === 'light' ? t('header.themeDark') : t('header.themeLight')}
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        {/* API Key button */}
        <button
          onClick={() => {
            setInputKey(profile?.api_key || '')
            setApiKeyOpen(true)
          }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors',
            hasApiKey
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
          )}
        >
          <Key className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">
            {hasApiKey ? t('header.apiKeySet') : t('header.addApiKey')}
          </span>
        </button>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="p-1.5 sm:p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors"
          title={t('header.logout')}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Backdrop for company dropdown */}
      {companyMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setCompanyMenuOpen(false)} />
      )}

      {/* ─── API KEY MODAL ────────────────────────────────────────── */}
      {apiKeyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setApiKeyOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)] font-sans">
                  {t('apiKey.title')}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('apiKey.desc')}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveApiKey} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                  {t('apiKey.label')}
                </label>
                <input
                  type="password"
                  value={inputKey}
                  onChange={e => setInputKey(e.target.value)}
                  placeholder={t('apiKey.placeholder')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <span>{t('apiKey.getLink')}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {keySavedToast && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {t('apiKey.saved')}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApiKeyOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
                >
                  {t('apiKey.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
                >
                  {t('apiKey.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
