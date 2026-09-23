import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sun, Moon, Key, Building2, ChevronDown, LogOut, Check, Menu, X, ExternalLink, Plug2, Users
} from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCompany } from '@/contexts/CompanyContext'
import { supabase } from '@/lib/supabase'
import { listDataverseCompanyMembers } from '@/lib/dataverse'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onToggleMobileMenu?: () => void
}

export default function Header({ onToggleMobileMenu }: HeaderProps) {
  const { t, lang, toggle: toggleLang } = useI18n()
  const navigate = useNavigate()
  const { theme, toggle: toggleTheme } = useTheme()
  const { profile, apiKeyConfigured, signOut, updateApiKey } = useAuth()
  const { companies, activeCompany, setActiveCompany } = useCompany()

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [apiKeyOpen, setApiKeyOpen] = useState(false)
  const [inputKey, setInputKey] = useState(profile?.api_key || '')
  const [keySavedToast, setKeySavedToast] = useState(false)
  const [bufferOpen, setBufferOpen] = useState(false)
  const [bufferToken, setBufferToken] = useState('')
  const [bufferSaving, setBufferSaving] = useState(false)
  const [bufferSavedToast, setBufferSavedToast] = useState(false)
  const [bufferError, setBufferError] = useState('')
  const [membersOpen, setMembersOpen] = useState(false)
  const [members, setMembers] = useState<Array<{ user_id: string; role: string; name: string; email: string }>>([])
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<'admin' | 'editor' | 'viewer'>('editor')
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSaving, setMemberSaving] = useState(false)
  const [memberError, setMemberError] = useState('')
  const [memberSaved, setMemberSaved] = useState(false)

  const hasApiKey = apiKeyConfigured
  const canManageCompany = Boolean(activeCompany && ['owner', 'admin'].includes(activeCompany.role ?? ''))

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputKey.trim()) return
    await updateApiKey(inputKey.trim(), canManageCompany ? activeCompany?.id : undefined)
    setKeySavedToast(true)
    setTimeout(() => {
      setKeySavedToast(false)
      setApiKeyOpen(false)
    }, 1200)
  }

  const handleSaveBuffer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeCompany || !bufferToken.trim()) return
    setBufferSaving(true)
    setBufferError('')
    try {
      const { data, error } = await supabase.functions.invoke<{ connected?: boolean; error?: string }>('save-buffer-integration', {
        body: { companyId: activeCompany.id, accessToken: bufferToken.trim() },
      })
      if (error) {
        const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
        const details = context?.json ? await context.json().catch(() => null) : null
        throw new Error(details?.error ?? error.message)
      }
      if (data?.error || !data?.connected) throw new Error(data?.error ?? 'Buffer connection failed')
      setBufferSavedToast(true)
      setBufferToken('')
      setTimeout(() => {
        setBufferSavedToast(false)
        setBufferOpen(false)
      }, 1200)
    } catch (error) {
      setBufferError(error instanceof Error ? error.message : 'Buffer connection failed')
    } finally {
      setBufferSaving(false)
    }
  }

  const loadMembers = async () => {
    if (!activeCompany) return
    setMembersLoading(true)
    setMemberError('')
    try {
      setMembers(await listDataverseCompanyMembers(activeCompany.id))
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : 'Unable to load members')
    }
    setMembersLoading(false)
  }

  const openMembers = async () => {
    setMembersOpen(true)
    setMemberEmail('')
    setMemberError('')
    await loadMembers()
  }

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeCompany || !memberEmail.trim()) return
    setMemberSaving(true)
    setMemberError('')
    setMemberSaved(false)
    try {
      const { data, error } = await supabase.functions.invoke<{ invited?: boolean; error?: string }>('invite-company-member', {
        body: { companyId: activeCompany.id, email: memberEmail.trim(), role: memberRole },
      })
      if (error) {
        const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
        const details = context?.json ? await context.json().catch(() => null) : null
        throw new Error(details?.error ?? error.message)
      }
      if (data?.error || !data?.invited) throw new Error(data?.error ?? 'Invitation failed')
      setMemberEmail('')
      setMemberSaved(true)
      await loadMembers()
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : 'Invitation failed')
    } finally {
      setMemberSaving(false)
    }
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

        {/* Company Buffer connection */}
        <button
          onClick={() => { setBufferError(''); setBufferToken(''); setBufferOpen(true) }}
          disabled={!canManageCompany}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800 disabled:opacity-50"
          title="Connect Buffer for this company"
        >
          <Plug2 className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Buffer</span>
        </button>

        {/* Company members */}
        <button
          onClick={openMembers}
          disabled={!activeCompany}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 disabled:opacity-50"
          title="Manage company members"
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Team</span>
        </button>

        {/* Company Switcher */}
        {activeCompany || companies.length > 0 ? <div className="relative">
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
              <button
                onClick={() => { setCompanyMenuOpen(false); navigate('/onboarding') }}
                className="w-full border-t border-[var(--color-border)] mt-1 pt-2 px-3 pb-2 text-left text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {t('header.createCompany')}
              </button>
            </div>
          )}
        </div> : (
          <button
            onClick={() => navigate('/onboarding')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{t('header.createCompany')}</span>
          </button>
        )}
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
            setInputKey('')
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

      {/* ─── BUFFER CONNECTION MODAL ─────────────────────────────── */}
      {bufferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setBufferOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                <Plug2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)] font-sans">Connect Buffer</h3>
                <p className="text-xs text-[var(--color-text-muted)]">Connect Buffer for {activeCompany?.name ?? 'this company'}.</p>
              </div>
            </div>

            <form onSubmit={handleSaveBuffer} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                  Buffer access token
                </label>
                <input
                  type="password"
                  value={bufferToken}
                  onChange={e => setBufferToken(e.target.value)}
                  placeholder="Paste your Buffer token"
                  autoComplete="off"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                />
                <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
                  The token is sent to the secure server and is not stored in the browser.
                </p>
              </div>

              {bufferError && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
                  {bufferError}
                </p>
              )}
              {bufferSavedToast && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Buffer connected
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBufferOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bufferSaving || !bufferToken.trim()}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {bufferSaving ? 'Connecting…' : 'Connect Buffer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── COMPANY MEMBERS MODAL ───────────────────────────────── */}
      {membersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setMembersOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)]">Company team</h3>
                <p className="text-xs text-[var(--color-text-muted)]">{activeCompany?.name}</p>
              </div>
            </div>

            {membersLoading ? (
              <p className="text-sm text-[var(--color-text-muted)]">Loading members…</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto mb-5">
                {members.map(member => (
                  <div key={member.user_id} className="flex items-center justify-between rounded-xl bg-[var(--color-surface-alt)] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">{member.name || member.email}</p>
                      {member.name && <p className="text-xs text-[var(--color-text-muted)] truncate">{member.email}</p>}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400">{member.role}</span>
                  </div>
                ))}
              </div>
            )}

            {(activeCompany?.role === 'owner' || activeCompany?.role === 'admin') && (
              <form onSubmit={handleInviteMember} className="border-t border-[var(--color-border)] pt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Invite a member</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={e => setMemberEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select
                    value={memberRole}
                    onChange={e => setMemberRole(e.target.value as typeof memberRole)}
                    className="w-28 px-2 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm outline-none"
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                {memberError && <p className="text-xs text-red-600 dark:text-red-400">{memberError}</p>}
                {memberSaved && <p className="text-xs text-emerald-600 dark:text-emerald-400">Member invited.</p>}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={memberSaving || !memberEmail.trim()}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {memberSaving ? 'Inviting…' : 'Invite member'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
