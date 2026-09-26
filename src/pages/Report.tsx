import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBuffer, bufferQuery } from '@/contexts/BufferContext'
import { callModelJSON, buildModelError } from '@/lib/model'
import { buildAiContext, setReportLearnings } from '@/lib/aiContext'
import {
  REPORT_METRICS, SCORE_AXES, createReport, listReports, recentLearnings, scoreWeek, updateReport,
  type ReportAnalysis, type ReportMetric, type ReportPost, type WeeklyReport,
} from '@/lib/reports'
import { CHANNELS, CHANNEL_MAP } from '@/lib/channels'
import { Button, Card, CardBody, CardHeader, Spark } from '@/components/ui'
import { cn } from '@/lib/utils'

const DAY = 86400000
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const mondayOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const shiftWeek = (weekStart: string, weeks: number) => iso(new Date(new Date(`${weekStart}T00:00:00`).getTime() + weeks * 7 * DAY))
const emptyValues = (): ReportPost['values'] => Object.fromEntries(REPORT_METRICS.map(m => [m, null])) as ReportPost['values']

const COPY = {
  fr: {
    title: 'Rapport de la semaine', week: (a: string, b: string) => `Semaine du ${a} au ${b}`, prevWeek: 'Semaine précédente', nextWeek: 'Semaine suivante',
    previous: (n: number) => `Rapports précédents (${n})`, jump: 'Aller à un rapport',
    saved: 'Enregistré', saving: 'Enregistrement…', unsaved: 'Pas encore enregistré', saveError: "Le rapport n'a pas pu être enregistré",
    learningsNote: "les leçons sont transmises à l'IA pour les prochains contenus",
    posts: 'Posts de la semaine', complete: (n: number, t: number) => (t === 0 ? 'aucun post pour cette semaine' : n === t ? `${t} post${t > 1 ? 's' : ''}, tous complétés` : `${t} post${t > 1 ? 's' : ''} · ${t - n} à compléter`),
    fetch: 'Actualiser la liste', add: 'Ajouter', remove: 'Retirer ce post', titlePh: 'Titre du post',
    metrics: { reach: 'Portée', views3s: 'Vues 3 s', likes: "J'aime", comments: 'Comm.', shares: 'Partages', saves: 'Enreg.', followers: 'Abonnés', leads: 'Prosp.' } as Record<ReportMetric, string>,
    metricsFull: { reach: 'Portée', views3s: 'Vues de 3 secondes', likes: "J'aime", comments: 'Commentaires', shares: 'Partages', saves: 'Enregistrements', followers: 'Nouveaux abonnés', leads: 'Prospects' } as Record<ReportMetric, string>,
    fillHint: 'Recopiez les chiffres depuis les statistiques de chaque réseau. Les cases orange sont encore vides ; le rapport s’enregistre à chaque modification.',
    noPosts: 'Aucun post publié cette semaine. Ajoutez-en un à la main si besoin.',
    score: 'Score FlowCom', noScore: 'Saisissez au moins la portée d’un post pour calculer le score.', prevScore: (n: number, m: number) => `semaine précédente ${n}/${m}`,
    axes: { hook: 'Accroche', shares: 'Partages', saves: 'Enregistrements', engagement: 'Engagement', growth: 'Croissance', conversion: 'Conversion' } as Record<string, string>,
    notMeasured: 'non mesuré',
    diagnostic: 'Diagnostic', analyze: 'Analyser', reanalyze: 'Réanalyser', analyzing: 'Analyse…', noDiagnostic: "L'IA analyse la semaine à partir des chiffres saisis, et le dit quand les données manquent.",
    needReach: 'Saisissez la portée d’au moins un post avant l’analyse.',
    sections: { whatWorked: 'Ce qui a marché', whatToStop: 'À arrêter', nextWeek: 'La semaine prochaine', learnings: 'À retenir' } as Record<keyof ReportAnalysis, string>,
    loading: 'Chargement des posts…', network: 'Réseau', video: 'vidéo',
    exportPdf: 'Exporter en PDF', exportHint: 'Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ».',
    needScored: 'Ajoutez aussi les commentaires, partages ou enregistrements pour calculer le score.', printedOn: 'Rapport établi le', total: 'Total',
  },
  en: {
    title: 'Weekly report', week: (a: string, b: string) => `Week of ${a} to ${b}`, prevWeek: 'Previous week', nextWeek: 'Next week',
    previous: (n: number) => `Earlier reports (${n})`, jump: 'Go to a report',
    saved: 'Saved', saving: 'Saving…', unsaved: 'Not saved yet', saveError: 'The report could not be saved',
    learningsNote: 'lessons are passed to the AI for the next content',
    posts: 'Posts of the week', complete: (n: number, t: number) => (t === 0 ? 'no post this week' : n === t ? `${t} post${t > 1 ? 's' : ''}, all complete` : `${t} post${t > 1 ? 's' : ''} · ${t - n} to complete`),
    fetch: 'Refresh the list', add: 'Add', remove: 'Remove this post', titlePh: 'Post title',
    metrics: { reach: 'Reach', views3s: '3s views', likes: 'Likes', comments: 'Comm.', shares: 'Shares', saves: 'Saves', followers: 'Followers', leads: 'Leads' } as Record<ReportMetric, string>,
    metricsFull: { reach: 'Reach', views3s: '3-second views', likes: 'Likes', comments: 'Comments', shares: 'Shares', saves: 'Saves', followers: 'New followers', leads: 'Leads' } as Record<ReportMetric, string>,
    fillHint: "Copy the figures from each network's statistics. Orange boxes are still empty; the report saves at every change.",
    noPosts: 'No post published this week. Add one by hand if needed.',
    score: 'FlowCom score', noScore: "Enter at least one post's reach to compute the score.", prevScore: (n: number, m: number) => `previous week ${n}/${m}`,
    axes: { hook: 'Hook', shares: 'Shares', saves: 'Saves', engagement: 'Engagement', growth: 'Growth', conversion: 'Conversion' } as Record<string, string>,
    notMeasured: 'not measured',
    diagnostic: 'Diagnostic', analyze: 'Analyse', reanalyze: 'Analyse again', analyzing: 'Analysing…', noDiagnostic: 'The AI analyses the week from the figures entered, and says so when data is missing.',
    needReach: "Enter at least one post's reach before the analysis.",
    sections: { whatWorked: 'What worked', whatToStop: 'What to stop', nextWeek: 'Next week', learnings: 'Keep in mind' } as Record<keyof ReportAnalysis, string>,
    loading: 'Loading posts…', network: 'Network', video: 'video',
    exportPdf: 'Export as PDF', exportHint: 'In the print window, choose “Save as PDF”.',
    needScored: 'Also enter comments, shares or saves to compute the score.', printedOn: 'Report produced on', total: 'Total',
  },
}
const SECTION_DOT: Record<keyof ReportAnalysis, string> = { whatWorked: 'var(--success)', whatToStop: 'var(--danger)', nextWeek: 'var(--info)', learnings: 'var(--accent)' }

export default function ReportPage() {
  const { t, lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const locale = L === 'fr' ? 'fr-FR' : 'en-GB'
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const { orgId, channels } = useBuffer()

  // The last finished week by default.
  const [weekStart, setWeekStart] = useState(() => shiftWeek(iso(mondayOf(new Date())), -1))
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [reportId, setReportId] = useState<string | null>(null)
  const [posts, setPosts] = useState<ReportPost[]>([])
  const [analysis, setAnalysis] = useState<ReportAnalysis | null>(null)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const dirty = useRef(false)
  const loadedWeek = useRef('')

  const weekEnd = shiftWeek(weekStart, 1)
  const fmt = (value: string, withMonth = true) => new Date(`${value}T00:00:00`).toLocaleDateString(locale, withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' })
  const lastDay = iso(new Date(new Date(`${weekEnd}T00:00:00`).getTime() - DAY))
  const currentMonday = iso(mondayOf(new Date()))

  useEffect(() => {
    if (!activeCompany) return
    listReports(activeCompany.id).then(setReports).catch(() => setReports([]))
  }, [activeCompany?.id])

  // Posts the publishing service sent during the week. Its figures are used
  // only when above zero: it returns zeros it does not really have.
  const fetchWeekPosts = useCallback(async (): Promise<ReportPost[]> => {
    if (!activeCompany || !orgId || !channels.length) return []
    const data = await bufferQuery(activeCompany.id, `query WeekPosts($input: PostsInput!) {
      posts(first: 100, input: $input) { edges { node { id text sentAt channelId assets { mimeType } metrics { type value } } } }
    }`, { input: { organizationId: orgId, filter: { status: ['sent'], channelIds: channels.map(ch => ch.id) } } })
    type Node = { id: string; text?: string; sentAt?: string; channelId: string; assets?: Array<{ mimeType?: string }>; metrics?: Array<{ type: string; value: number | string }> }
    const edges: Array<{ node: Node }> = data?.posts?.edges ?? []
    return edges
      .filter(({ node }) => node.sentAt && node.sentAt.slice(0, 10) >= weekStart && node.sentAt.slice(0, 10) < weekEnd)
      .map(({ node }) => {
        const service = channels.find(ch => ch.id === node.channelId)?.service.toLowerCase() ?? ''
        const values = emptyValues()
        const put = (metric: ReportMetric, value: number) => { if (value > 0) values[metric] = Math.max(values[metric] ?? 0, value) }
        for (const m of node.metrics ?? []) {
          const v = Number(m.value) || 0
          if (m.type === 'reach' || m.type === 'impressions') put('reach', v)
          if (m.type === 'reactions' || m.type === 'likes') put('likes', v)
          if (m.type === 'comments') put('comments', v)
          if (m.type === 'shares' || m.type === 'reposts') put('shares', v)
          if (m.type === 'saves') put('saves', v)
          if (m.type === 'views' || m.type === 'video_views') put('views3s', v)
          if (m.type === 'follows') put('followers', v)
        }
        return {
          id: node.id, sourceId: node.id,
          title: (node.text ?? '').split('\n').find(l => l.trim())?.slice(0, 80) ?? '',
          network: service === 'x' ? 'twitter' : service,
          date: node.sentAt!.slice(0, 10),
          hasVideo: (node.assets ?? []).some(a => a.mimeType?.startsWith('video')),
          values,
        }
      })
  }, [activeCompany, orgId, channels, weekStart, weekEnd])

  // Merge fetched posts into what was already typed, keeping every figure entered.
  const mergePosts = (saved: ReportPost[], fetched: ReportPost[]) => {
    const bySource = new Map(saved.filter(p => p.sourceId).map(p => [p.sourceId!, p]))
    const merged = fetched.map(f => {
      const old = bySource.get(f.sourceId!)
      if (!old) return f
      const values = { ...old.values }
      for (const m of REPORT_METRICS) if (values[m] === null && f.values[m] !== null) values[m] = f.values[m]
      return { ...old, values }
    })
    const manual = saved.filter(p => !p.sourceId || !fetched.some(f => f.sourceId === p.sourceId))
    return [...merged, ...manual].sort((a, b) => b.date.localeCompare(a.date))
  }

  // Opening a week: its saved report, refreshed with the week's posts.
  useEffect(() => {
    if (!activeCompany) return
    let alive = true
    const saved = reports.find(r => r.weekStart === weekStart)
    // Re-run once the connected accounts are known, so the week's posts come in.
    const key = `${weekStart}:${orgId && channels.length ? 'ready' : 'waiting'}`
    if (loadedWeek.current === key && saved?.id === reportId) return
    loadedWeek.current = key
    dirty.current = false
    setReportId(saved?.id ?? null)
    setPosts(saved?.posts ?? [])
    setAnalysis(saved?.analysis ?? null)
    setSaveState(saved ? 'saved' : 'idle')
    setError('')
    setLoadingPosts(true)
    fetchWeekPosts()
      .then(fetched => {
        if (!alive) return
        const next = mergePosts(saved?.posts ?? [], fetched)
        setPosts(next)
        if (next.length !== (saved?.posts.length ?? 0)) dirty.current = true
      })
      .catch(err => { if (alive) { console.warn('Publishing service:', err); } })
      .finally(() => { if (alive) setLoadingPosts(false) })
    return () => { alive = false }
  }, [weekStart, reports, activeCompany?.id, fetchWeekPosts]) // eslint-disable-line react-hooks/exhaustive-deps

  const score = useMemo(() => scoreWeek(posts), [posts])
  const previous = reports.find(r => r.weekStart === shiftWeek(weekStart, -1))
  const previousScore = previous ? scoreWeek(previous.posts) : null

  // Saves a second after the last change.
  useEffect(() => {
    if (!dirty.current || !activeCompany) return
    const timer = setTimeout(async () => {
      dirty.current = false
      setSaveState('saving')
      const body = { weekStart, posts, analysis, score: score.max ? score.total : null, breakdown: score.max ? { ...Object.fromEntries(SCORE_AXES.map(a => [a, 0])), ...score.breakdown } as WeeklyReport['breakdown'] : null }
      try {
        if (reportId) {
          await updateReport(reportId, body)
          setReports(prev => prev.map(r => (r.id === reportId ? { ...r, ...body } : r)))
        } else {
          const created = await createReport(activeCompany.id, body)
          setReportId(created.id)
          setReports(prev => [created, ...prev])
        }
        setSaveState('saved')
        window.dispatchEvent(new Event('flowcom:data-updated'))
      } catch (err) {
        console.warn('Weekly report save failed', err)
        setSaveState('error')
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [posts, analysis]) // eslint-disable-line react-hooks/exhaustive-deps

  const change = (id: string, patch: Partial<ReportPost>) => {
    dirty.current = true
    setPosts(prev => prev.map(p => (p.id === id ? { ...p, ...patch, values: { ...p.values, ...(patch.values ?? {}) } } : p)))
  }
  const setValue = (id: string, metric: ReportMetric, raw: string) => {
    const n = raw.trim() === '' ? null : Math.max(0, Math.round(Number(raw.replace(/\s/g, ''))) || 0)
    const post = posts.find(p => p.id === id)
    if (post) change(id, { values: { ...post.values, [metric]: n } })
  }
  const addPost = () => {
    dirty.current = true
    setPosts(prev => [{ id: crypto.randomUUID(), title: '', network: 'facebook', date: weekStart, values: emptyValues() }, ...prev])
  }
  const removePost = (id: string) => { dirty.current = true; setPosts(prev => prev.filter(p => p.id !== id)) }

  const refreshList = async () => {
    setLoadingPosts(true)
    try {
      const fetched = await fetchWeekPosts()
      dirty.current = true
      setPosts(prev => mergePosts(prev, fetched))
    } catch (err) {
      console.warn('Publishing service:', err)
    } finally {
      setLoadingPosts(false)
    }
  }

  const analyze = async () => {
    if (!activeCompany) return
    const withReach = posts.filter(p => (p.values.reach ?? 0) > 0)
    if (!withReach.length) { setError(c.needReach); return }
    setAnalyzing(true)
    setError('')
    const rows = posts.map(p => `- ${p.date} · ${p.network}${p.hasVideo ? ' (video)' : ''} · "${p.title}": ${REPORT_METRICS.map(m => `${m}=${p.values[m] ?? 'not entered'}`).join(', ')}`).join('\n')
    const scoreLine = score.max ? `Score ${score.total}/${score.max} (${Object.entries(score.breakdown).map(([k, v]) => `${k} ${v}/5`).join(', ')})` : 'No score'
    try {
      const result = await callModelJSON<ReportAnalysis>(activeCompany.id, [
        { role: 'system', content: `You are a social media analyst reviewing one week of organic posts. Use ONLY the figures given; "not entered" means unknown, not zero. Return JSON {"whatWorked":["..."],"whatToStop":["..."],"nextWeek":["..."],"learnings":["..."]}, 1 to 3 short points each (max 20 words), each citing the figure or post it comes from. "learnings" are durable lessons about this audience that should guide future content. If the data is too thin to judge, say so in whatWorked and keep the other lists short. Write in ${L === 'fr' ? 'French' : 'English'}, never quote field names like "reach=".\nCompany context:\n${buildAiContext({ company: activeCompany, products, segments, keyMessages })}` },
        { role: 'user', content: `Week ${weekStart} to ${lastDay}\n${scoreLine}\nPosts:\n${rows}` },
      ], { temperature: 0.3, max_tokens: 2400, requiredKeys: ['whatWorked', 'whatToStop', 'nextWeek', 'learnings'] })
      const clean = (list: unknown) => (Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string' && Boolean(s.trim())).slice(0, 3) : [])
      const next = { whatWorked: clean(result.whatWorked), whatToStop: clean(result.whatToStop), nextWeek: clean(result.nextWeek), learnings: clean(result.learnings) }
      dirty.current = true
      setAnalysis(next)
      setReportLearnings(recentLearnings([{ weekStart, analysis: next } as WeeklyReport, ...reports.filter(r => r.weekStart !== weekStart)]))
    } catch (err) {
      setError(t(buildModelError(err) as Parameters<typeof t>[0]))
    } finally {
      setAnalyzing(false)
    }
  }

  const exportPdf = () => {
    const previousTitle = document.title
    document.title = `${activeCompany?.name ?? 'FlowCom'} · ${c.week(fmt(weekStart), fmt(lastDay))}`
    window.addEventListener('afterprint', () => { document.title = previousTitle }, { once: true })
    window.print()
  }

  const completeCount = posts.filter(p => p.values.reach !== null).length
  const reachEntered = posts.some(p => (p.values.reach ?? 0) > 0)
  const saveLabel = saveState === 'saving' ? c.saving : saveState === 'saved' ? c.saved : saveState === 'error' ? c.saveError : c.unsaved
  const others = reports.filter(r => r.weekStart !== weekStart)

  return (
    <div className="min-h-full bg-surface-page print:bg-white">
      <ReportPrint c={c} company={activeCompany?.name ?? ''} week={c.week(fmt(weekStart), fmt(lastDay))} posts={posts} score={score} analysis={analysis}
        printedOn={new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })} dateLabel={fmt} />
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-3.5 px-4 py-5 sm:px-6 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
            <p className={cn('m-0 mt-0.5 text-sm', saveState === 'error' ? 'text-danger' : 'text-ink-muted')}>
              {saveLabel}{saveState === 'saved' && analysis?.learnings.length ? ` · ${c.learningsNote}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-line-strong bg-surface-card p-0.5">
              <Button variant="ghost" size="sm" iconOnly icon={<ChevronLeft />} aria-label={c.prevWeek} onClick={() => setWeekStart(w => shiftWeek(w, -1))} />
              <span className="min-w-[180px] text-center text-[13px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{c.week(fmt(weekStart, weekStart.slice(5, 7) !== lastDay.slice(5, 7)), fmt(lastDay))}</span>
              <Button variant="ghost" size="sm" iconOnly icon={<ChevronRight />} aria-label={c.nextWeek} disabled={weekStart >= currentMonday} onClick={() => setWeekStart(w => shiftWeek(w, 1))} />
            </div>
            <Button variant="secondary" size="sm" onClick={exportPdf} disabled={!posts.length} title={c.exportHint}>{c.exportPdf}</Button>
            {others.length > 0 && (
              <select className="fc-input h-8 w-auto" aria-label={c.jump} value="" onChange={e => e.target.value && setWeekStart(e.target.value)}>
                <option value="">{c.previous(others.length)}</option>
                {others.map(r => <option key={r.id} value={r.weekStart}>{c.week(fmt(r.weekStart), fmt(iso(new Date(new Date(`${r.weekStart}T00:00:00`).getTime() + 6 * DAY))))}{r.score !== null ? ` · ${r.score}` : ''}</option>)}
              </select>
            )}
          </div>
        </div>

        {error && <p className="m-0 rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div className="grid gap-3.5 2xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <Card className="min-w-0">
            <CardHeader title={c.posts} subtitle={loadingPosts ? c.loading : c.complete(completeCount, posts.length)} actions={<>
              <Button variant="ghost" size="sm" icon={<RefreshCw className={cn(loadingPosts && 'animate-spin')} />} disabled={loadingPosts || !orgId} onClick={() => void refreshList()}>{c.fetch}</Button>
              <Button variant="ghost" size="sm" icon={<Plus />} onClick={addPost}>{c.add}</Button>
            </>} />
            <CardBody className="pt-2">
              {loadingPosts && !posts.length ? (
                <p className="m-0 flex items-center gap-2 py-6 text-[13px] text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />{c.loading}</p>
              ) : !posts.length ? (
                <p className="m-0 py-6 text-center text-[13px] text-ink-muted">{c.noPosts}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-line text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">
                        <th className="py-1.5 pr-2 text-left">Post</th>
                        {REPORT_METRICS.map(m => <th key={m} className="w-[58px] px-0.5 py-1.5 text-right leading-[13px]" title={c.metricsFull[m]}>{c.metrics[m]}</th>)}
                        <th className="w-8" aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody>
                      {posts.map(post => {
                        const def = CHANNEL_MAP[post.network]
                        return (
                          <tr key={post.id} className="border-b border-line last:border-b-0">
                            <td className="py-1.5 pr-2">
                              <div className="flex min-w-0 items-center gap-2">
                                {post.sourceId ? (def && <def.icon className="h-3.5 w-3.5 shrink-0" style={{ color: def.color }} />) : (
                                  <select aria-label={c.network} className="fc-input h-7 w-[92px] shrink-0 px-1.5 text-[12px]" value={post.network} onChange={e => change(post.id, { network: e.target.value })}>
                                    {CHANNELS.slice(0, 7).map(ch => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
                                  </select>
                                )}
                                <div className="min-w-0 flex-1">
                                  {post.sourceId ? <span className="block truncate text-ink">{post.title || '—'}</span>
                                    : <input className="fc-input h-7 text-[12px]" aria-label={c.titlePh} placeholder={c.titlePh} value={post.title} onChange={e => change(post.id, { title: e.target.value })} />}
                                  {post.sourceId && <span className="block text-[11px] text-ink-muted">{fmt(post.date)}{post.hasVideo ? ` · ${c.video}` : ''}</span>}
                                </div>
                              </div>
                            </td>
                            {REPORT_METRICS.map(m => {
                              const empty = post.values[m] === null
                              const optional = m === 'views3s' && !post.hasVideo
                              return (
                                <td key={m} className="px-0.5 py-1.5">
                                  <input inputMode="numeric" aria-label={`${c.metricsFull[m]} · ${post.title || c.titlePh}`}
                                    className={cn('fc-input tabular-nums', empty && !optional && 'border-warning bg-warning-soft')}
                                    style={{ height: 30, padding: '0 6px', textAlign: 'right', ...(empty && !optional ? { borderColor: 'var(--warning)', background: 'var(--warning-soft)' } : {}) }}
                                    value={post.values[m] ?? ''} placeholder="—" onChange={e => setValue(post.id, m, e.target.value)} />
                                </td>
                              )
                            })}
                            <td className="py-1.5 pl-0.5">
                              <Button variant="ghost" size="sm" iconOnly icon={<Trash2 />} aria-label={c.remove} onClick={() => removePost(post.id)} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {posts.length > 0 && <p className="m-0 mt-2.5 text-[12px] text-ink-muted">{c.fillHint}</p>}
            </CardBody>
          </Card>

          <div className="grid min-w-0 content-start gap-3.5 md:grid-cols-2 2xl:grid-cols-1">
            <Card>
              <CardHeader title={c.score} actions={previousScore?.max ? <span className="text-[12px] text-ink-muted">{c.prevScore(previousScore.total, previousScore.max)}</span> : undefined} />
              <CardBody>
                {!score.max ? <p className="m-0 text-[13px] text-ink-muted">{reachEntered ? c.needScored : c.noScore}</p> : (
                  <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3.5">
                    <div>
                      <span className="text-[36px] font-bold leading-10 text-ink" style={{ fontFamily: 'var(--font-display)' }}>{score.total}</span>
                      <span className="text-base font-bold text-ink-muted" style={{ fontFamily: 'var(--font-display)' }}>/{score.max}</span>
                      {previousScore?.max ? (() => {
                        const diff = Math.round((score.total / score.max - previousScore.total / previousScore.max) * 30)
                        return <span className={cn('block text-[12px] font-semibold', diff >= 0 ? 'text-success' : 'text-danger')}>{diff >= 0 ? '+' : '−'}{Math.abs(diff)}</span>
                      })() : null}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {SCORE_AXES.map(axis => {
                        const v = score.breakdown[axis]
                        return (
                          <div key={axis} className="grid grid-cols-[100px_minmax(0,1fr)_28px] items-center gap-2 text-[12px]">
                            <span className="text-ink-muted">{c.axes[axis]}</span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true"><span className="block h-full rounded-full bg-brand" style={{ width: `${(v ?? 0) * 20}%` }} /></span>
                            <span className={cn('text-right', v ? 'font-bold text-ink' : 'text-[11px] text-ink-subtle')}>{v ?? '—'}</span>
                          </div>
                        )
                      })}
                      {Object.keys(score.breakdown).length < SCORE_AXES.length && <span className="text-[11px] text-ink-subtle">— {c.notMeasured}</span>}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={c.diagnostic} actions={apiKeyConfigured && (
                <Button variant="ghost" size="sm" icon={<Spark />} loading={analyzing} disabled={analyzing || !posts.length} onClick={() => void analyze()}>
                  {analyzing ? c.analyzing : analysis ? c.reanalyze : c.analyze}
                </Button>
              )} />
              <CardBody className="flex flex-col gap-3 text-[13px] leading-[19px]">
                {!analysis ? <p className="m-0 text-ink-muted">{c.noDiagnostic}</p> : (Object.keys(c.sections) as Array<keyof ReportAnalysis>).map(key => analysis[key].length > 0 && (
                  <div key={key}>
                    <p className="m-0 mb-1 flex items-center gap-1.5 font-bold text-ink"><span className="h-2 w-2 rounded-full" style={{ background: SECTION_DOT[key] }} aria-hidden="true" />{c.sections[key]}</p>
                    <ul className="m-0 flex flex-col gap-0.5 pl-[18px] text-ink-muted">{analysis[key].map(item => <li key={item}>{item}</li>)}</ul>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

// The printable report: hidden on screen, the only thing printed.
function ReportPrint({ c, company, week, posts, score, analysis, printedOn, dateLabel }: {
  c: typeof COPY.fr; company: string; week: string; posts: ReportPost[]
  score: ReturnType<typeof scoreWeek>; analysis: ReportAnalysis | null; printedOn: string; dateLabel: (d: string) => string
}) {
  const total = (m: ReportMetric) => posts.some(p => p.values[m] !== null) ? posts.reduce((t, p) => t + (p.values[m] ?? 0), 0).toLocaleString() : '—'
  return (
    <div className="hidden bg-white text-[10pt] leading-snug text-black print:block">
      <header className="mb-4 border-b border-black/20 pb-3">
        <p className="m-0 text-[9pt] uppercase tracking-wide text-black/60">{company}</p>
        <h1 className="m-0 text-[18pt] font-bold" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
        <p className="m-0 text-[11pt]">{week}</p>
      </header>

      {score.max > 0 && (
        <section className="mb-4 flex items-start gap-8">
          <div><p className="m-0 text-[9pt] text-black/60">{c.score}</p><p className="m-0 text-[20pt] font-bold">{score.total}<span className="text-[12pt] text-black/60">/{score.max}</span></p></div>
          <table className="border-collapse text-[9pt]"><tbody>
            {SCORE_AXES.map(axis => <tr key={axis}><td className="pr-4 text-black/70">{c.axes[axis]}</td><td className="font-bold">{score.breakdown[axis] ?? '—'}{score.breakdown[axis] ? '/5' : ''}</td></tr>)}
          </tbody></table>
        </section>
      )}

      <table className="mb-4 w-full border-collapse text-[9pt]">
        <thead>
          <tr className="border-b border-black/40 text-left">
            <th className="py-1 pr-2">Post</th>
            {REPORT_METRICS.map(m => <th key={m} className="px-1 py-1 text-right">{c.metricsFull[m]}</th>)}
          </tr>
        </thead>
        <tbody>
          {posts.map(p => (
            <tr key={p.id} className="border-b border-black/10 align-top" style={{ breakInside: 'avoid' }}>
              <td className="py-1 pr-2">{p.title || '—'}<br /><span className="text-black/60">{CHANNEL_MAP[p.network]?.label ?? p.network} · {dateLabel(p.date)}</span></td>
              {REPORT_METRICS.map(m => <td key={m} className="px-1 py-1 text-right tabular-nums">{p.values[m] ?? '—'}</td>)}
            </tr>
          ))}
          <tr className="border-t border-black/40 font-bold">
            <td className="py-1 pr-2">{c.total}</td>
            {REPORT_METRICS.map(m => <td key={m} className="px-1 py-1 text-right tabular-nums">{total(m)}</td>)}
          </tr>
        </tbody>
      </table>

      {analysis && (
        <section className="grid grid-cols-2 gap-x-8 gap-y-3">
          {(Object.keys(c.sections) as Array<keyof ReportAnalysis>).map(key => analysis[key].length > 0 && (
            <div key={key} style={{ breakInside: 'avoid' }}>
              <h2 className="m-0 mb-1 text-[11pt] font-bold">{c.sections[key]}</h2>
              <ul className="m-0 pl-4">{analysis[key].map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          ))}
        </section>
      )}

      <p className="m-0 mt-6 text-[8pt] text-black/50">{c.printedOn} {printedOn} · FlowCom</p>
    </div>
  )
}
