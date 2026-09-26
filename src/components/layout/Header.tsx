import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Building2, Check, ChevronDown, Menu, Moon, Plus, Settings, Sun, Users, X } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAppSettings } from '@/contexts/AppSettingsContext'
import { listDataverseCompanyMembers } from '@/lib/dataverse'
import { Badge, Button, Spark } from '@/components/ui'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onToggleMobileMenu?: () => void
  onToggleAssistant?: () => void
  assistantOpen?: boolean
}

export default function Header({ onToggleMobileMenu, onToggleAssistant, assistantOpen }: HeaderProps) {
  const { t, lang, toggle: toggleLang } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { theme, toggle: toggleTheme } = useTheme()
  const { companies, activeCompany, setActiveCompany } = useCompany()
  const { isEnabled } = useAppSettings()
  const fr = lang === 'fr'

  const [companyMenuOpen, setCompanyMenuOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [members, setMembers] = useState<Array<{ user_id: string; role: string; name: string; email: string }>>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberError, setMemberError] = useState('')

  const openMembers = async () => {
    if (!activeCompany) return
    setMembersOpen(true)
    setMembersLoading(true)
    setMemberError('')
    try {
      setMembers(await listDataverseCompanyMembers(activeCompany.id))
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : 'Unable to load members')
    }
    setMembersLoading(false)
  }

  return (
    <header className="flex h-[var(--topbar-height)] shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-card px-3 sm:px-5">
      {/* Left: menu (phone), company switcher */}
      <div className="flex min-w-0 items-center gap-1">
        <Button variant="ghost" iconOnly icon={<Menu />} onClick={onToggleMobileMenu} className="md:hidden" aria-label={fr ? 'Ouvrir le menu' : 'Open menu'} />

        {activeCompany || companies.length > 0 ? (
          <div className="relative min-w-0">
            <button onClick={() => setCompanyMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={companyMenuOpen}
              className="flex h-9 min-w-0 items-center gap-2 rounded-[var(--radius-md)] px-2.5 text-sm font-semibold text-ink hover:bg-surface-sunken">
              <Building2 className="h-4 w-4 shrink-0 text-ink-muted" />
              <span className="truncate max-w-[140px] sm:max-w-[240px]">{activeCompany?.name ?? t('header.noCompany')}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
            </button>
            {companyMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCompanyMenuOpen(false)} aria-hidden="true" />
                <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface-overlay py-1 shadow-[var(--shadow-md)]">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">{t('header.companies')}</p>
                  {companies.map(company => (
                    <button key={company.id} role="menuitem" onClick={async () => { await setActiveCompany(company); setCompanyMenuOpen(false) }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken">
                      <span className="truncate">{company.name}</span>
                      {company.is_active && <Check className="h-4 w-4 shrink-0 text-brand" />}
                    </button>
                  ))}
                  <div className="mt-1 border-t border-line p-2">
                    <Button size="sm" variant="ghost" icon={<Plus />} className="w-full justify-start" onClick={() => { setCompanyMenuOpen(false); navigate('/onboarding') }}>
                      {t('header.createCompany')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => navigate('/onboarding')}>{t('header.createCompany')}</Button>
        )}
      </div>

      {/* Right: team, language, theme, assistant, settings */}
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" icon={<Users />} onClick={openMembers} disabled={!activeCompany} className="hidden sm:inline-flex">
          {fr ? 'Équipe' : 'Team'}
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleLang} aria-label={fr ? 'Passer en anglais' : 'Switch to French'} className="font-bold uppercase tracking-wider">
          {fr ? 'EN' : 'FR'}
        </Button>
        <Button variant="ghost" iconOnly size="sm" icon={theme === 'light' ? <Moon /> : <Sun />} onClick={toggleTheme}
          aria-label={theme === 'light' ? t('header.themeDark') : t('header.themeLight')} />
        {isEnabled('assistant') && (
          <button onClick={onToggleAssistant} aria-pressed={assistantOpen}
            className={cn('fc-btn fc-btn--sm', assistantOpen ? 'fc-btn--ai' : 'fc-btn--secondary')}>
            <Spark />
            <span className="hidden sm:inline">Assistant</span>
          </button>
        )}
        <Button variant="ghost" iconOnly size="sm" icon={<Settings />} onClick={() => navigate('/settings')} aria-label={t('nav.settings')}
          className={cn(pathname === '/settings' && 'bg-brand-soft text-brand-ink')} />
      </div>

      {/* Team */}
      {membersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="team-title">
          <div className="w-full max-w-lg rounded-[var(--radius-xl)] border border-line bg-surface-overlay shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-3 border-b border-line p-4">
              <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-brand-soft text-brand-ink"><Users className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="team-title" className="text-[15px] font-bold text-ink">{fr ? 'Équipe' : 'Team'}</h2>
                <p className="truncate text-[13px] text-ink-muted">{activeCompany?.name}</p>
              </div>
              <Button variant="ghost" iconOnly size="sm" icon={<X />} onClick={() => setMembersOpen(false)} aria-label={fr ? 'Fermer' : 'Close'} />
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto p-3">
              {memberError && <p className="px-1 text-sm text-danger">{memberError}</p>}
              {membersLoading
                ? <p className="px-1 py-2 text-sm text-ink-muted">{fr ? 'Chargement…' : 'Loading…'}</p>
                : members.map(member => (
                  <div key={member.user_id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 hover:bg-surface-sunken">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{member.name || member.email}</p>
                      {member.name && <p className="truncate text-[13px] text-ink-muted">{member.email}</p>}
                    </div>
                    <Badge tone={member.role === 'owner' ? 'brand' : 'neutral'}>{member.role}</Badge>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
