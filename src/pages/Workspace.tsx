import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Zap, ArrowRight, Brain, CalendarDays, FileText, BookOpen } from 'lucide-react'

export default function WorkspacePage() {
  const { t } = useI18n()
  const { activeCompany } = useCompany()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const quickActions = [
    { icon: CalendarDays, label: t('nav.calendar'), desc: t('nav.calendarDesc'), to: '/calendar', color: 'bg-blue-500' },
    { icon: FileText, label: t('nav.content'), desc: t('nav.contentDesc'), to: '/content', color: 'bg-violet-500' },
    { icon: BookOpen, label: t('nav.library'), desc: t('nav.libraryDesc'), to: '/library', color: 'bg-emerald-500' },
    { icon: Brain, label: t('nav.memory'), desc: t('nav.memoryDesc'), to: '/memory', color: 'bg-amber-500' },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Welcome */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">FlowCom</span>
        </div>
        <h1 className="text-3xl font-bold text-[var(--color-text)] font-sans">
          {t('auth.welcome')}{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="text-[var(--color-text-muted)] mt-1">
          {activeCompany ? activeCompany.name : t('empty.noCompany')}
        </p>
      </div>

      {!activeCompany ? (
        <div className="bg-white dark:bg-gray-900 border border-[var(--color-border)] rounded-2xl p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-indigo-500" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text)] font-sans mb-2">{t('empty.noCompany')}</h2>
          <p className="text-[var(--color-text-muted)] text-sm mb-6">
            {t('onboarding.subtitle')}
          </p>
          <button
            onClick={() => navigate('/onboarding')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            {t('empty.startSetup')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {quickActions.map(({ icon: Icon, label, desc, to, color }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex items-start gap-4 p-5 bg-white dark:bg-gray-900 border border-[var(--color-border)] rounded-2xl text-left hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all group"
            >
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[var(--color-text)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{label}</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)] shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
