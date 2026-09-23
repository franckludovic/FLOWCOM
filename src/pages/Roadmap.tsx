import { useState, useEffect, useMemo } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { Check, Target, Zap, Bot, RefreshCw, AlertCircle, Calendar, Flag, BookOpen, Loader2, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { callGroq, buildGroqError } from '@/lib/groq'
import { buildAiContext } from '@/lib/aiContext'
import {
  listDataverseLibraryItems,
  listDataverseRoadmapMilestones,
  replaceDataverseRoadmapMilestones,
} from '@/lib/dataverse'

const MILESTONES = [
  { id: 'm1', phase: 1 },
  { id: 'm2', phase: 1 },
  { id: 'm3', phase: 1 },
  { id: 'm4', phase: 1 },
  { id: 'm5', phase: 1 },
  { id: 'm6', phase: 2 },
  { id: 'm7', phase: 2 },
  { id: 'm8', phase: 2 },
  { id: 'm9', phase: 3 },
  { id: 'm10', phase: 3 },
  { id: 'm11', phase: 3 },
  { id: 'm12', phase: 4 },
  { id: 'm13', phase: 4 },
  { id: 'm14', phase: 4 },
  { id: 'm15', phase: 4 },
] as const

const PHASES = [
  { id: 1, icon: Target },
  { id: 2, icon: Calendar },
  { id: 3, icon: Zap },
  { id: 4, icon: Flag },
]

export default function RoadmapPage() {
  const { t, lang } = useI18n()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  
  // Manual overrides stored in localStorage (user can still toggle manually)
  const [manualChecked, setManualChecked] = useState<string[]>([])
  const [libraryItems, setLibraryItems] = useState<Array<{ status: string; format?: string; contentType?: string; hook?: string }>>([])
  const [dataVersion, setDataVersion] = useState(0)
  const [advice, setAdvice] = useState<string>('')
  const [loadingAdvice, setLoadingAdvice] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onDataChange = () => setDataVersion(v => v + 1)
    window.addEventListener('storage', onDataChange)
    window.addEventListener('flowcom:data-updated', onDataChange)
    return () => {
      window.removeEventListener('storage', onDataChange)
      window.removeEventListener('flowcom:data-updated', onDataChange)
    }
  }, [])

  // Load saved roadmap progress and library data for this company.
  useEffect(() => {
    let cancelled = false
    const loadRoadmapData = async () => {
      if (!activeCompany) return
      const [milestones, library] = await Promise.all([
        listDataverseRoadmapMilestones(activeCompany.id),
        listDataverseLibraryItems(activeCompany.id),
      ])
      if (cancelled) return
      setManualChecked(milestones)
      setLibraryItems(library)
    }
    loadRoadmapData()
    return () => { cancelled = true }
  }, [activeCompany?.id])

  const milestoneProgress = useMemo<Record<string, { current: number; target: number }>>(() => {
    const library = libraryItems
    const validated = library.filter((i: any) => i.status === 'Validated' || i.status === 'Published')
    const published = library.filter((i: any) => i.status === 'Published')
    const videoCount = library.filter((i: any) => i.format?.toLowerCase() === 'video' || i.contentType?.toLowerCase() === 'video').length
    const formats = new Set(library.map((i: any) => i.format || i.contentType).filter(Boolean))

    return {
      m3: { current: Math.min(products.length, 2), target: 2 },
      m4: { current: Math.min(segments.length, 1), target: 1 },
      m7: { current: Math.min(library.length, 4), target: 4 },
      m8: { current: Math.min(validated.length, 4), target: 4 },
      m9: { current: Math.min(Math.max(0, library.filter((i: any) => (i.hook || '').trim().length > 0).length), 3), target: 3 },
      m10: { current: Math.min(videoCount, 1), target: 1 },
      m11: { current: Math.min(formats.size, 2), target: 2 },
      m13: { current: Math.min(published.length, 5), target: 5 },
    }
  }, [activeCompany, products, segments, libraryItems, dataVersion])

  // Auto-detect which milestones are completed from real app data
  const autoDetected = useMemo<string[]>(() => {
    const detected: string[] = []
    const c = activeCompany
    const library = libraryItems

    // Phase 1 - Foundations
    // M1: Company profile complete (name + industry + description)
    if (c?.name && c?.industry && c?.short_desc) detected.push('m1')
    // M2: Mission, vision, values defined
    if (c?.mission && c?.vision && c?.values) detected.push('m2')
    // M3: At least 2 products/services
    if (products.length >= 2) detected.push('m3')
    // M4: At least 1 audience segment
    if (segments.length >= 1) detected.push('m4')
    // M5: Tone and channels defined
    if (c?.tone && c?.channels) detected.push('m5')

    // Phase 2-4 - based on Library
    // M7: 4+ posts generated and saved (any status)
    if (library.length >= 4) detected.push('m7')
    // M8: 4+ posts saved to library (Validated or Published)
    const validated = library.filter((i: any) => i.status === 'Validated' || i.status === 'Published')
    if (validated.length >= 4) detected.push('m8')
    // M10: At least 1 video script
    const hasVideo = library.some((i: any) => i.format?.toLowerCase() === 'video' || i.contentType?.toLowerCase() === 'video')
    if (hasVideo) detected.push('m10')
    // M11: 2+ different formats used
    const formats = new Set(library.map((i: any) => i.format || i.contentType).filter(Boolean))
    if (formats.size >= 2) detected.push('m11')
    // M13: 5+ posts published
    const published = library.filter((i: any) => i.status === 'Published')
    if (published.length >= 5) detected.push('m13')

    return detected
  }, [activeCompany, products, segments, libraryItems, dataVersion])

  // Merge: auto-detected + manually checked (user can add manual ones for items we can't auto-detect)
  const completed = useMemo(() => {
    return Array.from(new Set([...autoDetected, ...manualChecked]))
  }, [autoDetected, manualChecked])

  // Save manual overrides
  useEffect(() => {
    if (!activeCompany) return
    const saveProgress = async () => {
      await replaceDataverseRoadmapMilestones(activeCompany.id, manualChecked)
    }
    saveProgress()
  }, [activeCompany?.id, manualChecked])

  const toggleMilestone = (id: string) => {
    // If auto-detected, can't uncheck; otherwise toggle manually
    if (autoDetected.includes(id)) return // auto-managed, ignore click
    setManualChecked(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )
  }

  const progress = Math.round((completed.length / MILESTONES.length) * 100)

  const generateAdvice = async () => {
    setLoadingAdvice(true)
    setError(null)

    const incomplete = MILESTONES.filter(m => !completed.includes(m.id))
    const nextMilestone = incomplete.length > 0 ? incomplete[0] : null
    
    let nextStepText = nextMilestone ? t(`roadmap.${nextMilestone.id}` as any) : (lang === 'fr' ? 'Terminé !' : 'All done!')
    
    const context = `${buildAiContext({ company: activeCompany, products, segments, keyMessages })}
  Completed ${completed.length}/${MILESTONES.length} milestones.
  Next target milestone: ${nextStepText}`

    const prompt = lang === 'fr' 
      ? `Tu es le Coach IA stratégique de FlowCom. L'utilisateur a complété ${completed.length} sur ${MILESTONES.length} étapes. La prochaine étape est : "${nextStepText}". Donne 2 conseils très courts, ultra-pratiques et encourageants pour réussir cette étape. Ne liste pas d'autres étapes. Format Markdown. Garde un ton direct et pro.`
      : `You are FlowCom's AI Strategic Coach. The user has completed ${completed.length} of ${MILESTONES.length} milestones. The next milestone is: "${nextStepText}". Give 2 very short, highly practical, and encouraging tips to achieve this milestone. Do not list other milestones. Use Markdown format. Keep it direct and professional.`

    try {
      const res = await callGroq(activeCompany?.id ?? '', [
        { role: 'system', content: prompt },
        { role: 'user', content: context }
      ], { temperature: 0.6 })
      setAdvice(res)
    } catch (e) {
      setError(t(buildGroqError(e) as any))
    } finally {
      setLoadingAdvice(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--color-bg)]">
      <div className="flex-none p-6 border-b border-[var(--color-border)]">
        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">{t('roadmap.title')}</h1>
        <p className="text-[var(--color-text-muted)] max-w-3xl mb-6">
          {t('roadmap.subtitle')}
        </p>

        {/* Progress Bar */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                {t('roadmap.progress')}
              </p>
              <p className="text-2xl font-bold text-[var(--color-text)]">
                {progress}% <span className="text-sm font-normal text-[var(--color-text-muted)] ml-1">({completed.length}/{MILESTONES.length} {t('roadmap.completed' as any)})</span>
              </p>
            </div>
            {progress === 100 && (
              <div className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                {lang === 'fr' ? 'Feuille de route terminée' : 'Roadmap complete'}
              </div>
            )}
          </div>
          <div className="h-3 w-full bg-[var(--color-bg)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Phases Column */}
          <div className="lg:col-span-2 space-y-6">
            {PHASES.map((phase) => {
              const phaseMilestones = MILESTONES.filter(m => m.phase === phase.id)
              const completedInPhase = phaseMilestones.filter(m => completed.includes(m.id)).length
              const isPhaseComplete = completedInPhase === phaseMilestones.length
              const Icon = phase.icon

              return (
                <div key={phase.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg)] flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                        isPhaseComplete 
                          ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
                          : "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
                      )}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-[var(--color-text)]">
                          {t(`roadmap.phase${phase.id}Title` as any)}
                        </h3>
                        <p className="text-sm text-[var(--color-text-muted)]">
                          {t(`roadmap.phase${phase.id}Desc` as any)}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-[var(--color-text-muted)] bg-[var(--color-surface)] px-2.5 py-1 rounded-md border border-[var(--color-border)]">
                      {completedInPhase} / {phaseMilestones.length}
                    </div>
                  </div>
                  <div className="p-2">
                    {phaseMilestones.map((m) => {
                      const isDone = completed.includes(m.id)
                      const isAuto = autoDetected.includes(m.id)
                      const quantity = milestoneProgress[m.id]
                      const quantityLabel = quantity ? `${Math.min(quantity.current, quantity.target)}/${quantity.target}` : null
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleMilestone(m.id)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left group",
                            isAuto ? "cursor-default" : "hover:bg-[var(--color-bg)]"
                          )}
                          title={isAuto ? (lang === 'fr' ? 'Détecté automatiquement' : 'Auto-detected from your data') : undefined}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded-md flex items-center justify-center border transition-colors shrink-0",
                            isDone && isAuto
                              ? "bg-green-500 border-green-500 text-white"
                              : isDone
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "border-[var(--color-border)] group-hover:border-indigo-400"
                          )}>
                            {isDone && <Check className="w-3.5 h-3.5" />}
                          </div>
                          <span className={cn(
                            "text-sm font-medium transition-colors flex-1",
                            isDone ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text)]"
                          )}>
                            {t(`roadmap.${m.id}` as any)}
                          </span>
                          {quantityLabel && (
                            <span className="text-[10px] font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 rounded-full shrink-0">
                              {quantityLabel}
                            </span>
                          )}
                          {isAuto && (
                            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full shrink-0">
                              <Cpu className="w-3 h-3" />
                              {lang === 'fr' ? 'Auto' : 'Auto'}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* AI Coach Column */}
          <div className="lg:col-span-1">
            <div className="sticky top-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold">
                  <Bot className="w-5 h-5" />
                  {t('roadmap.coachTitle' as any)}
                </div>
                <button 
                  onClick={generateAdvice}
                  disabled={loadingAdvice}
                  className="p-1.5 rounded-lg hover:bg-[var(--color-bg)] text-[var(--color-text-muted)] transition-colors"
                  title={t('roadmap.coachRefresh' as any)}
                >
                  <RefreshCw className={cn("w-4 h-4", loadingAdvice && "animate-spin")} />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="prose prose-sm dark:prose-invert">
                {loadingAdvice ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('roadmap.coachLoading' as any)}
                    </div>
                    <div className="h-4 bg-[var(--color-border)] rounded w-3/4"></div>
                    <div className="h-4 bg-[var(--color-border)] rounded w-full"></div>
                    <div className="h-4 bg-[var(--color-border)] rounded w-5/6"></div>
                    <div className="h-4 bg-[var(--color-border)] rounded w-full mt-4"></div>
                    <div className="h-4 bg-[var(--color-border)] rounded w-2/3"></div>
                  </div>
                ) : advice ? (
                  <div className="text-[var(--color-text)] whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: advice.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                ) : (
                  <div className="text-center py-6 text-[var(--color-text-muted)]">
                    <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p>{t('roadmap.coachEmpty' as any)}</p>
                    <button
                      onClick={generateAdvice}
                      className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      {t('roadmap.coachRefresh' as any)}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
