import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Loader2, RefreshCw } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useAppSettings } from '@/contexts/AppSettingsContext'
import { callModelJSON, buildModelError } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'
import { listDataverseLibraryItems, listDataverseRoadmapMilestones, setDataverseRoadmapMilestone } from '@/lib/dataverse'
import { listReports } from '@/lib/reports'
import { Button, Card, CardBody, CardHeader, Spark } from '@/components/ui'
import type { LibraryItem } from '@/types'
import { cn } from '@/lib/utils'

type MilestoneId = `m${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15}`

// Where each milestone gets done. Marketing pages only exist when the module is on.
const MILESTONES: Array<{ id: MilestoneId; phase: 1 | 2 | 3 | 4; route: string; marketing?: boolean }> = [
  { id: 'm1', phase: 1, route: '/memory#entreprise' },
  { id: 'm2', phase: 1, route: '/memory#identite' },
  { id: 'm3', phase: 1, route: '/memory#produits' },
  { id: 'm4', phase: 1, route: '/memory#audiences' },
  { id: 'm5', phase: 1, route: '/memory#communication' },
  { id: 'm6', phase: 2, route: '/calendar', marketing: true },
  { id: 'm7', phase: 2, route: '/content', marketing: true },
  { id: 'm8', phase: 2, route: '/library', marketing: true },
  { id: 'm9', phase: 3, route: '/content', marketing: true },
  { id: 'm10', phase: 3, route: '/content', marketing: true },
  { id: 'm11', phase: 3, route: '/content', marketing: true },
  { id: 'm12', phase: 4, route: '/content', marketing: true },
  { id: 'm13', phase: 4, route: '/studio', marketing: true },
  { id: 'm14', phase: 4, route: '/report' },
  { id: 'm15', phase: 4, route: '/calendar', marketing: true },
]
const PHASES = [1, 2, 3, 4] as const

const COPY = {
  fr: {
    title: 'Feuille de route', subtitle: 'Les étapes pour installer une présence sociale qui fonctionne, cochées automatiquement quand FlowCom le constate.',
    progress: (d: number, t: number) => `${d} étape${d > 1 ? 's' : ''} sur ${t}`, done: 'Feuille de route terminée',
    auto: 'constaté', manual: 'coché à la main', doIt: 'Y aller', tick: 'Cocher', untick: 'Décocher',
    autoTitle: 'Cochée automatiquement à partir de vos données', manualTitle: 'Cliquez pour cocher ou décocher',
    next: 'Prochaine étape', allDone: 'Toutes les étapes sont faites. Continuez à publier et à analyser chaque semaine.',
    tips: 'Conseils', getTips: 'Des conseils pour cette étape', refresh: 'Autres conseils', thinking: 'Réflexion…',
    saveError: "L'étape n'a pas pu être enregistrée",
  },
  en: {
    title: 'Roadmap', subtitle: 'The steps to a social presence that works, ticked automatically when FlowCom sees them done.',
    progress: (d: number, t: number) => `${d} of ${t} step${t > 1 ? 's' : ''}`, done: 'Roadmap complete',
    auto: 'detected', manual: 'ticked by hand', doIt: 'Go', tick: 'Tick', untick: 'Untick',
    autoTitle: 'Ticked automatically from your data', manualTitle: 'Click to tick or untick',
    next: 'Next step', allDone: 'Every step is done. Keep publishing and reviewing every week.',
    tips: 'Tips', getTips: 'Tips for this step', refresh: 'Other tips', thinking: 'Thinking…',
    saveError: 'The step could not be saved',
  },
}

export default function RoadmapPage() {
  const { t, lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const { isEnabled } = useAppSettings()
  const marketing = isEnabled('marketing-studio')

  const [manual, setManual] = useState<string[]>([])
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [analysedReports, setAnalysedReports] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [tips, setTips] = useState<string[]>([])
  const [tipsFor, setTipsFor] = useState('')
  const [loadingTips, setLoadingTips] = useState(false)

  useEffect(() => {
    let alive = true
    if (!activeCompany) return
    setLoaded(false)
    Promise.all([
      listDataverseRoadmapMilestones(activeCompany.id).catch(() => [] as string[]),
      marketing ? listDataverseLibraryItems(activeCompany.id).catch(() => [] as LibraryItem[]) : Promise.resolve([] as LibraryItem[]),
      listReports(activeCompany.id).catch(() => []),
    ]).then(([ticked, items, reports]) => {
      if (!alive) return
      setManual(ticked)
      setLibrary(items)
      setAnalysedReports(reports.filter(r => r.analysis).length)
      setLoaded(true)
    })
    return () => { alive = false }
  }, [activeCompany?.id, marketing])

  const milestones = MILESTONES.filter(m => !m.marketing || marketing)

  // What FlowCom can see for itself, with progress where it can be counted.
  const detected = useMemo(() => {
    const co = activeCompany
    const kept = library.filter(i => i.status === 'Validated' || i.status === 'Published')
    const published = library.filter(i => i.status === 'Published')
    const formats = new Set(library.map(i => i.format).filter(Boolean))
    const hooks = library.filter(i => (i.hook || '').trim()).length
    const counts: Partial<Record<MilestoneId, { current: number; target: number }>> = {
      m3: { current: products.length, target: 2 },
      m4: { current: segments.length, target: 1 },
      m7: { current: library.length, target: 4 },
      m8: { current: kept.length, target: 4 },
      m9: { current: hooks, target: 3 },
      m10: { current: library.filter(i => i.format === 'video').length, target: 1 },
      m11: { current: formats.size, target: 2 },
      m13: { current: published.length, target: 5 },
      m14: { current: analysedReports, target: 4 },
    }
    const done = new Set<MilestoneId>()
    if (co?.name && co.industry && co.short_desc) done.add('m1')
    if (co?.mission && co.vision && co.values) done.add('m2')
    if (co?.tone && co.channels) done.add('m5')
    for (const [id, n] of Object.entries(counts) as Array<[MilestoneId, { current: number; target: number }]>) if (n.current >= n.target) done.add(id)
    return { done, counts }
  }, [activeCompany, products, segments, library, analysedReports])

  const isDone = (id: MilestoneId) => detected.done.has(id) || manual.includes(id)
  const doneCount = milestones.filter(m => isDone(m.id)).length
  const next = milestones.find(m => !isDone(m.id))

  const toggle = async (id: MilestoneId) => {
    if (!activeCompany || detected.done.has(id)) return
    const on = !manual.includes(id)
    setManual(prev => (on ? [...prev, id] : prev.filter(x => x !== id)))
    setError('')
    try {
      await setDataverseRoadmapMilestone(activeCompany.id, id, on)
      window.dispatchEvent(new Event('flowcom:data-updated'))
    } catch (err) {
      setManual(prev => (on ? prev.filter(x => x !== id) : [...prev, id]))
      setError(`${c.saveError} : ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const getTips = async () => {
    if (!activeCompany || !next) return
    setLoadingTips(true)
    setError('')
    const step = t(`roadmap.${next.id}` as Parameters<typeof t>[0])
    try {
      const result = await callModelJSON<{ tips: string[] }>(activeCompany.id, [
        { role: 'system', content: `You are FlowCom's strategy coach. Give 2 very short, concrete, encouraging tips (max 30 words each) to complete the step below, tailored to the company. Plain text only, no markdown. Return JSON {"tips":["...","..."]}. Write in ${L === 'fr' ? 'French' : 'English'}.\nCompany context:\n${buildAiContext({ company: activeCompany, products, segments, keyMessages })}` },
        { role: 'user', content: `Completed ${doneCount} of ${milestones.length} steps. Next step: "${step}".` },
      ], { temperature: 0.6, max_tokens: 400, requiredKeys: ['tips'] })
      // Shown as plain text: model output is never inserted as HTML.
      setTips((Array.isArray(result.tips) ? result.tips : []).filter((s): s is string => typeof s === 'string').map(s => s.replace(/\*\*/g, '')).slice(0, 3))
      setTipsFor(next.id)
    } catch (err) {
      setError(t(buildModelError(err) as Parameters<typeof t>[0]))
    } finally {
      setLoadingTips(false)
    }
  }

  const pct = milestones.length ? Math.round((doneCount / milestones.length) * 100) : 0

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-3.5 px-4 py-5 sm:px-6">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
          <p className="m-0 mt-0.5 max-w-2xl text-sm text-ink-muted">{c.subtitle}</p>
        </div>

        <Card className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[22px] font-bold leading-7 text-ink tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{pct} %</span>
            <span className={cn('text-[13px]', pct === 100 ? 'font-semibold text-success' : 'text-ink-muted')}>{pct === 100 ? c.done : c.progress(doneCount, milestones.length)}</span>
          </div>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
            <span className="block h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </span>
        </Card>

        {error && <p className="m-0 rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3.5">
            {PHASES.map(phase => {
              const items = milestones.filter(m => m.phase === phase)
              if (!items.length) return null
              const inPhase = items.filter(m => isDone(m.id)).length
              return (
                <Card key={phase}>
                  <CardHeader title={t(`roadmap.phase${phase}Title` as Parameters<typeof t>[0])} subtitle={t(`roadmap.phase${phase}Desc` as Parameters<typeof t>[0])}
                    actions={<span className={cn('text-[12px] font-semibold tabular-nums', inPhase === items.length ? 'text-success' : 'text-ink-muted')}>{inPhase}/{items.length}</span>} />
                  <CardBody className="flex flex-col pt-1.5">
                    {items.map(m => {
                      const done = isDone(m.id)
                      const auto = detected.done.has(m.id)
                      const count = detected.counts[m.id]
                      return (
                        <div key={m.id} className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
                          <button type="button" onClick={() => void toggle(m.id)} disabled={auto || !loaded}
                            aria-pressed={done} aria-label={`${done ? c.untick : c.tick} : ${t(`roadmap.${m.id}` as Parameters<typeof t>[0])}`}
                            title={auto ? c.autoTitle : c.manualTitle}
                            className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
                              done ? 'border-success bg-success text-surface-card' : 'border-line-strong hover:border-brand', auto && 'cursor-default')}>
                            {done && <Check className="h-3 w-3" strokeWidth={3} />}
                          </button>
                          <span className={cn('min-w-0 flex-1 text-[13px]', done ? 'text-ink-muted' : 'text-ink')}>
                            {t(`roadmap.${m.id}` as Parameters<typeof t>[0])}
                            {done && <span className="ml-1.5 text-[11px] text-ink-subtle">· {auto ? c.auto : c.manual}</span>}
                          </span>
                          {count && !done && <span className="shrink-0 text-[12px] text-ink-muted tabular-nums">{Math.min(count.current, count.target)}/{count.target}</span>}
                          {!done && <Link to={m.route} className="fc-btn fc-btn--ghost fc-btn--sm shrink-0">{c.doIt}</Link>}
                        </div>
                      )
                    })}
                  </CardBody>
                </Card>
              )
            })}
          </div>

          <Card className="lg:sticky lg:top-4">
            <CardHeader title={c.next} />
            <CardBody className="flex flex-col gap-3">
              {!loaded ? <Loader2 className="h-4 w-4 animate-spin text-ink-muted" /> : !next ? (
                <p className="m-0 text-[13px] text-ink-muted">{c.allDone}</p>
              ) : (
                <>
                  <p className="m-0 text-[15px] font-semibold leading-5 text-ink">{t(`roadmap.${next.id}` as Parameters<typeof t>[0])}</p>
                  <Link to={next.route} className="fc-btn fc-btn--primary fc-btn--sm self-start">{c.doIt}<ArrowRight /></Link>
                  {apiKeyConfigured && (
                    <div className="border-t border-line pt-3">
                      {tips.length > 0 && tipsFor === next.id ? (
                        <>
                          <p className="m-0 mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-ink"><Spark className="h-3.5 w-3.5" />{c.tips}</p>
                          <ul className="m-0 flex flex-col gap-1.5 pl-[18px] text-[13px] leading-[19px] text-ink-muted">{tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
                          <Button variant="ghost" size="sm" className="mt-2" icon={<RefreshCw className={cn(loadingTips && 'animate-spin')} />} disabled={loadingTips} onClick={() => void getTips()}>{c.refresh}</Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" icon={<Spark />} loading={loadingTips} onClick={() => void getTips()}>{loadingTips ? c.thinking : c.getTips}</Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
