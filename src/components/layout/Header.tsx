import { useState } from 'react'
import { Sun, Moon, Key, Building2, ChevronDown, LogOut, Plus, Check } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCompany } from '@/contexts/CompanyContext'
import { cn } from '@/lib/utils'

export default function Header() {
  const { t, lang, toggle: toggleLang } = useI18n()
  const { theme, toggle: toggleTheme } = useTheme()
  const { profile, signOut } = useAuth()
  const { companies, activeCompany, setActiveCompany, createCompany } = useCompany()

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [apiKeyOpen, setApiKeyOpen] = useState(false)
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

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
      {/* Left: active company */}
      <div className="relative">
        <button
          onClick={() => setCompanyMenuOpen(!companyMenuOpen)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            'hover:bg-[var(--color-surface-alt)] text-[var(--color-text)]'
          )}
        >
          <Building2 className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span>{activeCompany?.name ?? t('header.noCompany')}</span>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        </button>

        {companyMenuOpen && (
          <div className="absolute top-full mt-1 left-0 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg z-50 py-1.5">
            {companies.map(company => (
              <button
                key={company.id}
                onClick={async () => { await setActiveCompany(company); setCompanyMenuOpen(false) }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-[var(--color-surface-alt)] text-[var(--color-text)]"
              >
                <span className="truncate">{company.name}</span>
                {company.is_active && <Check className="w-4 h-4 text-indigo-500 shrink-0" />}
              </button>
            ))}
            <div className="border-t border-[var(--color-border)] mt-1 pt-1 px-3 pb-2">
              <div className="flex gap-2 mt-1">
                <input
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateCompany()}
                  placeholder={t('company.namePh')}
                  className="flex-1 text-sm px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleCreateCompany}
                  disabled={creatingCompany || !newCompanyName.trim()}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {/* Lang toggle */}
        <button
          onClick={toggleLang}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors uppercase tracking-wider"
        >
          {lang === 'fr' ? 'EN' : 'FR'}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors"
          title={theme === 'light' ? t('header.themeDark') : t('header.themeLight')}
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        {/* API Key */}
        <button
          onClick={() => setApiKeyOpen(!apiKeyOpen)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            hasApiKey
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
          )}
        >
          <Key className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{hasApiKey ? t('header.apiKeySet') : t('header.addApiKey')}</span>
        </button>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="p-2 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors"
          title={t('header.logout')}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Click outside overlay */}
      {companyMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setCompanyMenuOpen(false)} />
      )}
    </header>
  )
}
