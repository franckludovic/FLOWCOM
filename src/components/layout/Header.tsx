import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Sun, Moon, Building2, ChevronDown, LogOut, Check, Menu, X, Users, Settings
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
  const { pathname } = useLocation()
  const { theme, toggle: toggleTheme } = useTheme()
  const { signOut } = useAuth()
  const { companies, activeCompany, setActiveCompany } = useCompany()

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [members, setMembers] = useState<Array<{ user_id: string; role: string; name: string; email: string }>>([])
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState<'admin' | 'editor' | 'viewer'>('editor')
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSaving, setMemberSaving] = useState(false)
  const [memberError, setMemberError] = useState('')
  const [memberSaved, setMemberSaved] = useState(false)

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

      {/* Right controls: Lang, Theme, Settings, Sign out */}
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

        {/* Settings */}
        <button
          onClick={() => navigate('/settings')}
          className={cn(
            'p-1.5 sm:p-2 rounded-lg transition-colors',
            pathname === '/settings'
              ? 'bg-indigo-600 text-white'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]'
          )}
          title={t('nav.settings')}
          aria-label={t('nav.settings')}
        >
          <Settings className="w-4 h-4" />
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
