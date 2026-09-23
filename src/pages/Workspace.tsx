import { useEffect, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Zap, ArrowRight, Brain, CalendarDays, FileText, BookOpen, Sparkles, RefreshCw } from 'lucide-react'
import { callGroqJSON, buildGroqError } from '@/lib/groq'
import { buildAiContext } from '@/lib/aiContext'
import { getDataverseWorkspaceCounts } from '@/lib/dataverse'

interface WorkspaceActivity {
  title_fr: string
  title_en: string
  reason_fr: string
  reason_en: string
  action_fr: string
  action_en: string
  route: string
  step?: number
  priority: 'high' | 'medium' | 'low'
}

const ACTIVITY_TTL = 24 * 60 * 60 * 1000

export default function WorkspacePage() {
  const { t, lang } = useI18n()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [activities, setActivities] = useState<WorkspaceActivity[]>([])
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState('')
  const [workspaceCounts, setWorkspaceCounts] = useState({ calendar: 0, library: 0, roadmap: 0, publishedLast30: 0, staleDrafts: 0, hasReportThisWeek: false })

  useEffect(() => {
    let cancelled = false
    const loadCounts = async () => {
      if (!activeCompany) return
      const counts = await getDataverseWorkspaceCounts(activeCompany.id)
      if (!cancelled) setWorkspaceCounts({
        ...counts,
      })
    }
    loadCounts()
    return () => { cancelled = true }
  }, [activeCompany?.id])

  const loadActivities = async (force = false) => {
    if (!activeCompany) return
    const calendarCount    = workspaceCounts.calendar
    const libraryCount     = workspaceCounts.library
    const roadmapCount     = workspaceCounts.roadmap
    const publishedLast30  = workspaceCounts.publishedLast30
    const staleDrafts      = workspaceCounts.staleDrafts
    const hasReportThisWeek = workspaceCounts.hasReportThisWeek
    const fingerprint = [products.length, segments.length, keyMessages.length, calendarCount, libraryCount, roadmapCount, publishedLast30, staleDrafts, hasReportThisWeek ? '1' : '0'].join('-')
    const cacheKey = `flowcom:workspace_activity:v2:${activeCompany.id}:${fingerprint}`
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as { createdAt: number; activities: WorkspaceActivity[] } | null
        if (cached && Date.now() - cached.createdAt < ACTIVITY_TTL) {
          setActivities(cached.activities)
          return
        }
      } catch {
        localStorage.removeItem(cacheKey)
      }
    }

    setBriefLoading(true)
    setBriefError('')
    try {
      const signals = [
        `Products configured: ${products.length}`,
        `Audience segments configured: ${segments.length}`,
        `Key messages configured: ${keyMessages.length}`,
        `Calendar ideas saved: ${calendarCount}`,
        `Library posts saved: ${libraryCount}`,
        `Roadmap milestones completed: ${roadmapCount}`,
        `Posts published in last 30 days: ${publishedLast30}`,
        `Draft posts sitting untouched for more than 7 days: ${staleDrafts}`,
        `Weekly performance report filed this week: ${hasReportThisWeek ? 'yes' : 'no'}`,
      ].join('\n')
      const result = await callGroqJSON<{ activities: WorkspaceActivity[] }>(activeCompany?.id ?? '', [
        {
          role: 'system',
          content: `You are FlowCom's proactive communication strategist. Turn the live workspace signals into three useful, non-duplicated next actions. Prioritize missing foundations before optimization. Return only JSON matching this exact schema - every string field must be provided in BOTH French and English: {"activities":[{"title_fr":"string","title_en":"string","reason_fr":"one sentence in French","reason_en":"one sentence in English","action_fr":"short button label in French","action_en":"short button label in English","route":"/content or /calendar or /roadmap or /memory or /onboarding or /studio or /library or /publishing-history or /report","step":"number required only when route is /onboarding: 1 for company info, 2 for brand identity, 3 for products, 4 for audience, 5 for communication","priority":"high or medium or low"}]}. For onboarding actions, always include the exact step. Use the publishing and draft signals to suggest concrete actions. Do not invent facts.\nCompany context:\n${buildAiContext({ company: activeCompany, products, segments, keyMessages })}\nLive signals:\n${signals}`
        },
        { role: 'user', content: 'What are the three most useful next actions right now?' }
      ], { temperature: 0.4, max_tokens: 900, requiredKeys: ['activities'] })
      const validRoutes = ['/content', '/calendar', '/roadmap', '/memory', '/onboarding', '/studio', '/library', '/publishing-history', '/report']
      const safeActivities = (result.activities ?? []).filter(activity =>
        activity.title_fr && activity.title_en && activity.reason_fr && activity.reason_en &&
        activity.action_fr && activity.action_en &&
        validRoutes.includes(activity.route) &&
        (activity.route !== '/onboarding' || Number.isInteger(activity.step) && activity.step! >= 1 && activity.step! <= 5)
      ).slice(0, 3).map(activity => ({
        ...activity,
        route: activity.route === '/onboarding' ? `/onboarding?step=${activity.step}` : activity.route,
      }))
      setActivities(safeActivities)
      localStorage.setItem(cacheKey, JSON.stringify({ createdAt: Date.now(), activities: safeActivities }))
    } catch (error) {
      setBriefError(buildGroqError(error))
    } finally {
      setBriefLoading(false)
    }
  }

  useEffect(() => {
    loadActivities()
  }, [activeCompany?.id, profile?.id, products.length, segments.length, keyMessages.length, workspaceCounts])

  const quickActions = [
    { icon: CalendarDays, label: t('nav.calendar'), desc: t('nav.calendarDesc'), to: '/calendar', color: 'bg-blue-500' },
    { icon: FileText, label: t('nav.content'), desc: t('nav.contentDesc'), to: '/content', color: 'bg-violet-500' },
    { icon: BookOpen, label: t('nav.library'), desc: t('nav.libraryDesc'), to: '/library', color: 'bg-emerald-500' },
    { icon: Brain, label: t('nav.memory'), desc: t('nav.memoryDesc'), to: '/memory', color: 'bg-amber-500' },
  ]

  return (
    <div className="w-full p-8 max-w-7xl mx-auto">
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

      {activeCompany && (activities.length > 0 || briefLoading || briefError) && (
        <section className="mb-8 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/30 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{lang === 'fr' ? 'Prochaine étape IA' : 'AI next move'}</p>
                {briefLoading ? (
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{lang === 'fr' ? 'Préparation des recommandations…' : 'Preparing a recommendation...'}</p>
                ) : activities.length > 0 ? (
                  <h2 className="mt-1 text-lg font-bold text-[var(--color-text)]">{lang === 'fr' ? 'Vos prochaines actions prioritaires' : 'Your next best moves'}</h2>
                ) : briefError ? (
                  <p className="mt-1 text-sm text-red-500">{briefError}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadActivities(true)}
              disabled={briefLoading}
              title="Refresh AI recommendation"
              className="p-2 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${briefLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {activities.length > 0 && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
              {activities.map((activity, index) => (
                <button
                  key={`${activity.title_en}-${index}`}
                  type="button"
                  onClick={() => navigate(activity.route)}
                  className="flex flex-col items-start gap-3 p-4 rounded-xl bg-[var(--color-surface)] border border-indigo-100 dark:border-indigo-900 text-left hover:border-indigo-400 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${activity.priority === 'high' ? 'text-rose-500' : activity.priority === 'medium' ? 'text-amber-500' : 'text-indigo-500'}`}>
                      {lang === 'fr' ? (activity.priority === 'high' ? 'Priorité haute' : activity.priority === 'medium' ? 'Priorité moyenne' : 'Priorité basse') : `${activity.priority} priority`}
                    </span>
                    <ArrowRight className="w-4 h-4 text-indigo-500 shrink-0" />
                  </div>
                  <span className="font-semibold text-sm text-[var(--color-text)]">{lang === 'fr' ? activity.title_fr : activity.title_en}</span>
                  <span className="text-xs leading-relaxed text-[var(--color-text-muted)]">{lang === 'fr' ? activity.reason_fr : activity.reason_en}</span>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{lang === 'fr' ? activity.action_fr : activity.action_en}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {quickActions.map(({ icon: Icon, label, desc, to, color }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex items-start gap-5 p-7 min-h-36 bg-white dark:bg-gray-900 border border-[var(--color-border)] rounded-2xl text-left hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all group"
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
