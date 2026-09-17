import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, UserCircle, Brain, CalendarDays,
  FileText, BookOpen, Map, BarChart2, Zap,
  ChevronLeft, ChevronRight, Building2, X, Send
} from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { cn } from '@/lib/utils'

const SIDEBAR_STORAGE_KEY = 'flowcom:sidebar_collapsed'

const navItems = [
  { to: '/workspace',   icon: LayoutDashboard, labelKey: 'nav.workspace' },
  { to: '/memory',      icon: Brain,           labelKey: 'nav.memory' },
  { to: '/calendar',    icon: CalendarDays,    labelKey: 'nav.calendar' },
  { to: '/content',     icon: FileText,        labelKey: 'nav.content' },
  { to: '/library',     icon: BookOpen,        labelKey: 'nav.library' },
  { to: '/studio',      icon: Send,            labelKey: 'nav.studio' },
  { to: '/roadmap',     icon: Map,             labelKey: 'nav.roadmap' },
  { to: '/report',      icon: BarChart2,       labelKey: 'nav.report' },
] as const

interface SidebarProps {
  mobileOpen: boolean
  onCloseMobile: () => void
}

export default function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useI18n()
  const { activeCompany } = useCompany()

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed))
  }, [collapsed])

  const toggleSidebar = () => setCollapsed(prev => !prev)

  // Navigation link content
  const renderNavContent = (isMobileView: boolean) => (
    <>
      {/* Header Logo area */}
      <div
        className={cn(
          'flex items-center border-b border-[var(--color-border)] py-2.5 transition-all',
          !isMobileView && collapsed ? 'justify-center px-2' : 'justify-between px-5'
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200 dark:shadow-none">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {(isMobileView || !collapsed) && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="font-bold text-sm text-[var(--color-text)] leading-tight font-sans tracking-tight">
                FlowCom
              </p>
            </div>
          )}
        </div>

        {/* Mobile close X button */}
        {isMobileView && (
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Active Workspace / Company badge */}
      {activeCompany && (
        <div className={cn('mx-2 mt-3 transition-all', !isMobileView && collapsed ? 'px-0' : 'mx-3')}>
          {!isMobileView && collapsed ? (
            <div
              className="flex justify-center p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900"
              title={`${activeCompany.name} (Workspace)`}
            >
              {activeCompany.logo_url ? (
                <img src={activeCompany.logo_url} alt="" className="w-4 h-4 object-contain rounded" />
              ) : (
                <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900">
              {activeCompany.logo_url ? (
                <div className="w-6 h-6 rounded bg-white dark:bg-gray-800 p-0.5 border border-indigo-200 dark:border-indigo-800 shrink-0 flex items-center justify-center overflow-hidden">
                  <img src={activeCompany.logo_url} alt="" className="w-full h-full object-contain" />
                </div>
              ) : (
                <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider leading-none">
                  Workspace
                </p>
                <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 truncate mt-0.5">
                  {activeCompany.name}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nav links */}
      <nav className={cn('flex-1 overflow-y-auto py-3 space-y-1', !isMobileView && collapsed ? 'px-2' : 'px-3')}>
        {navItems.map(({ to, icon: Icon, labelKey }) => {
          const label = t(labelKey as Parameters<typeof t>[0])
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => isMobileView && onCloseMobile()}
              title={!isMobileView && collapsed ? label : undefined}
              className={({ isActive }) => cn(
                'flex items-center rounded-xl text-sm font-medium transition-colors',
                !isMobileView && collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {(isMobileView || !collapsed) && <span className="truncate">{label}</span>}
            </NavLink>
          )
        })}

        {/* Divider + Profile link */}
        <div className="pt-2 mt-2 border-t border-[var(--color-border)]">
          <NavLink
            to="/onboarding"
            onClick={() => isMobileView && onCloseMobile()}
            title={!isMobileView && collapsed ? t('nav.profile') : undefined}
            className={({ isActive }) => cn(
              'flex items-center rounded-xl text-sm font-medium transition-colors',
              !isMobileView && collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
              isActive
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]'
            )}
          >
            <UserCircle className="w-4 h-4 shrink-0" />
            {(isMobileView || !collapsed) && <span className="truncate">{t('nav.profile')}</span>}
          </NavLink>
        </div>
      </nav>

      {/* Footer */}
      {(isMobileView || !collapsed) && (
        <div className="px-4 py-3 border-t border-[var(--color-border)]">
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            {t('sidebar.offlineTitle')} · {t('sidebar.offlineDesc')}
          </p>
        </div>
      )}
    </>
  )

  return (
    <>
      {/* ─── MOBILE DRAWER (hidden on md and above) ────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)] shadow-2xl transition-transform duration-300 ease-in-out md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {renderNavContent(true)}
      </aside>

      {/* ─── DESKTOP SIDEBAR (hidden on mobile, visible on md+) ─────── */}
      <aside
        className={cn(
          'relative hidden md:flex flex-col h-full border-r border-[var(--color-border)] bg-[var(--color-surface)] shrink-0 transition-all duration-300 ease-in-out',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Toggle button on border edge */}
        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-6 z-20 flex items-center justify-center w-6 h-6 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-indigo-600 hover:border-indigo-400 shadow-sm transition-all"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>

        {renderNavContent(false)}
      </aside>
    </>
  )
}
