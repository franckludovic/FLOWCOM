import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Settings, Brain, CalendarDays,
  FileText, BookOpen, Map, BarChart2, Zap
} from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/workspace',   icon: LayoutDashboard, labelKey: 'nav.workspace' },
  { to: '/onboarding', icon: Settings,         labelKey: 'nav.onboarding' },
  { to: '/memory',     icon: Brain,            labelKey: 'nav.memory' },
  { to: '/calendar',   icon: CalendarDays,     labelKey: 'nav.calendar' },
  { to: '/content',    icon: FileText,         labelKey: 'nav.content' },
  { to: '/library',    icon: BookOpen,         labelKey: 'nav.library' },
  { to: '/roadmap',    icon: Map,              labelKey: 'nav.roadmap' },
  { to: '/report',     icon: BarChart2,        labelKey: 'nav.report' },
] as const

export default function Sidebar() {
  const { t } = useI18n()
  const { activeCompany } = useCompany()

  return (
    <aside className="w-64 flex flex-col h-full border-r border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[var(--color-border)]">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm text-[var(--color-text)] leading-tight font-sans">FlowCom</p>
          <p className="text-[11px] text-[var(--color-text-muted)] truncate">{t('sidebar.tagline')}</p>
        </div>
      </div>

      {/* Company badge */}
      {activeCompany && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900">
          <p className="text-[11px] font-medium text-indigo-500 uppercase tracking-wider">Workspace</p>
          <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 truncate">{activeCompany.name}</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{t(labelKey as Parameters<typeof t>[0])}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[var(--color-border)]">
        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
          {t('sidebar.offlineTitle')} · {t('sidebar.offlineDesc')}
        </p>
      </div>
    </aside>
  )
}
