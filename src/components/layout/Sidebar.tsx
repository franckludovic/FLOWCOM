import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Building2, ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useAppSettings } from '@/contexts/AppSettingsContext'
import { navigation } from '@/modules/registry'
import { cn } from '@/lib/utils'

const COLLAPSED_KEY = 'flowcom:sidebar_collapsed'

interface SidebarProps {
  mobileOpen: boolean
  onCloseMobile: () => void
}

// The installation's logo for the current mode, else its product name.
function Brand({ compact }: { compact: boolean }) {
  const { settings, theme } = useTheme()
  const logo = theme === 'dark' ? settings.logoDark || settings.logoLight : settings.logoLight
  const name = settings.productName || 'FlowCom'
  if (logo) return <img src={logo} alt={name} className={cn('object-contain', compact ? 'h-7 w-7' : 'h-7 max-w-[160px]')} />
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        {name.charAt(0)}
      </span>
      {!compact && <span className="truncate text-[15px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{name}</span>}
    </span>
  )
}

export default function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useI18n()
  const { activeCompany } = useCompany()
  const { modules } = useAppSettings()
  const sections = navigation(modules)

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, String(collapsed)) } catch { /* storage blocked */ }
  }, [collapsed])

  const content = (compact: boolean, onNavigate?: () => void) => (
    <>
      <div className={cn('flex h-[var(--topbar-height)] shrink-0 items-center border-b border-line', compact ? 'justify-center px-2' : 'justify-between px-4')}>
        <Brand compact={compact} />
        {onNavigate && (
          <button onClick={onCloseMobile} aria-label="Fermer le menu" className="fc-btn fc-btn--ghost fc-btn--icon fc-btn--sm"><X /></button>
        )}
      </div>

      {activeCompany && (
        <div className={cn('shrink-0 pt-3', compact ? 'px-2' : 'px-3')}>
          <div title={compact ? activeCompany.name : undefined}
            className={cn('flex items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface-page', compact ? 'justify-center p-2' : 'px-3 py-2')}>
            {activeCompany.logo_url
              ? <img src={activeCompany.logo_url} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
              : <Building2 className="h-4 w-4 shrink-0 text-ink-muted" />}
            {!compact && (
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-muted">{t('nav.company')}</span>
                <span className="block truncate text-[13px] font-semibold text-ink">{activeCompany.name}</span>
              </span>
            )}
          </div>
        </div>
      )}

      <nav aria-label="Navigation" className={cn('flex-1 overflow-y-auto pb-4', compact ? 'px-2' : 'px-3')}>
        {sections.map(section => (
          <div key={section.id} className="mt-4">
            {compact
              ? <div className="mx-auto mb-1 h-px w-6 bg-line" aria-hidden="true" />
              : <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">{t(section.labelKey)}</p>}
            <ul className="space-y-0.5">
              {section.items.map(({ to, labelKey, icon: Icon }) => {
                const label = t(labelKey)
                return (
                  <li key={to}>
                    <NavLink to={to} onClick={onNavigate} title={compact ? label : undefined}
                      className={({ isActive }) => cn(
                        'flex h-9 items-center rounded-[var(--radius-md)] text-sm transition-colors',
                        compact ? 'justify-center' : 'gap-3 px-3',
                        isActive ? 'bg-brand-soft font-semibold text-brand-ink' : 'font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink',
                      )}>
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      {!compact && <span className="truncate">{label}</span>}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  )

  return (
    <>
      {/* Phone and tablet portrait: drawer */}
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onCloseMobile} aria-hidden="true" />}
      <aside aria-hidden={!mobileOpen}
        className={cn('fixed inset-y-0 left-0 z-50 flex w-[min(85vw,var(--sidebar-width))] flex-col bg-surface-card shadow-[var(--shadow-lg)] transition-transform duration-300 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
        {content(false, onCloseMobile)}
      </aside>

      {/* Desktop: collapsible sidebar */}
      <aside className={cn('relative hidden h-full shrink-0 flex-col border-r border-line bg-surface-card transition-[width] duration-300 md:flex',
        collapsed ? 'w-[var(--sidebar-collapsed)]' : 'w-[var(--sidebar-width)]')}>
        {content(collapsed)}
        <div className={cn('shrink-0 border-t border-line p-2', collapsed ? 'flex justify-center' : '')}>
          <button onClick={() => setCollapsed(c => !c)} className={cn('fc-btn fc-btn--ghost fc-btn--sm', !collapsed && 'w-full justify-start')}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}>
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            {!collapsed && <span>{t('nav.collapse')}</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
