import { useState, useEffect } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useBuffer, bufferQuery } from '@/contexts/BufferContext'
import { Plus, Trash2, Save, BarChart2, Brain, Check, Loader2, History, AlertCircle, Sparkles, RefreshCw, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { callModelJSON, buildModelError } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'

interface AnalyzedPost {
  id: string
  title: string
  channel: string
  reach: string
  views3s: string
  watchTime: string
  comments: string
  shares: string
  saves: string
  newFollowers: string
  leads: string
}

interface ReportAnalysis {
  whatWorked: string[]
  whatToStop: string[]
  adjustments: string[]
  insights: string[]
}

interface WeeklyReport {
  id: string
  weekLabel: string
  posts: AnalyzedPost[]
  analysis: ReportAnalysis | null
  scores: {
    hook: number
    retention: number
    shares: number
    saves: number
    engagement: number
    growth: number
    conversion: number
    total: number
  }
  createdAt: number
}

const emptyPost = (): AnalyzedPost => ({
  id: crypto.randomUUID(),
  title: '',
  channel: 'Facebook',
  reach: '',
  views3s: '',
  watchTime: '',
  comments: '',
  shares: '',
  saves: '',
  newFollowers: '',
  leads: ''
})

export default function ReportPage() {
  const { t, lang } = useI18n()
  const { activeCompany, products, segments, keyMessages, addKeyMessage } = useCompany()
  const { orgId, channels: bufferChannels } = useBuffer()
  const [history, setHistory] = useState<WeeklyReport[]>([])
  
  // Current editing state
  const [reportId, setReportId] = useState<string>(crypto.randomUUID())
  const [weekLabel, setWeekLabel] = useState('')
  const [posts, setPosts] = useState<AnalyzedPost[]>([emptyPost()])
  const [analysis, setAnalysis] = useState<ReportAnalysis | null>(null)
  
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedToMemory, setSavedToMemory] = useState(false)

  // Load history
  useEffect(() => {
    const raw = localStorage.getItem(`flowcom:reports:${activeCompany?.id || 'default'}`)
    if (raw) {
      try {
        setHistory(JSON.parse(raw))
      } catch {}
    }
  }, [activeCompany?.id])

  const saveHistory = (newHistory: WeeklyReport[]) => {
    setHistory(newHistory)
    localStorage.setItem(`flowcom:reports:${activeCompany?.id || 'default'}`, JSON.stringify(newHistory))
  }

  const addPost = () => setPosts([...posts, emptyPost()])
  
  const removePost = (id: string) => setPosts(posts.filter(p => p.id !== id))
  
  const updatePost = (id: string, field: keyof AnalyzedPost, value: string) => {
    setPosts(posts.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  // Calculate scores (heuristic based)
  const scores = (() => {
    const s = { hook: 0, retention: 0, shares: 0, saves: 0, engagement: 0, growth: 0, conversion: 0, total: 0 }
    if (posts.length === 0) return s

    let totalReach = 0, total3s = 0, totalShares = 0, totalSaves = 0, totalComments = 0, totalFollowers = 0, totalLeads = 0
    let videoCount = 0

    posts.forEach(p => {
      const r = parseInt(p.reach) || 0
      totalReach += r
      total3s += parseInt(p.views3s) || 0
      totalShares += parseInt(p.shares) || 0
      totalSaves += parseInt(p.saves) || 0
      totalComments += parseInt(p.comments) || 0
      totalFollowers += parseInt(p.newFollowers) || 0
      totalLeads += parseInt(p.leads) || 0
      if (p.watchTime) videoCount++
    })

    if (totalReach === 0) return s

    // Hook: 3s views / reach (Excellent > 30%)
    const hookRate = total3s / totalReach
    s.hook = hookRate > 0.3 ? 5 : hookRate > 0.2 ? 4 : hookRate > 0.1 ? 3 : hookRate > 0.05 ? 2 : 1

    // Retention: if no video, max 3. If video, use watch time heuristic or default to 3.
    s.retention = videoCount > 0 ? 4 : 3

    // Shares: shares / reach (Excellent > 1%)
    const shareRate = totalShares / totalReach
    s.shares = shareRate > 0.01 ? 5 : shareRate > 0.005 ? 4 : shareRate > 0.002 ? 3 : shareRate > 0.001 ? 2 : 1

    // Saves: saves / reach (Excellent > 2%)
    const saveRate = totalSaves / totalReach
    s.saves = saveRate > 0.02 ? 5 : saveRate > 0.01 ? 4 : saveRate > 0.005 ? 3 : saveRate > 0.002 ? 2 : 1

    // Engagement: comments / reach (Excellent > 3%)
    const engRate = totalComments / totalReach
    s.engagement = engRate > 0.03 ? 5 : engRate > 0.015 ? 4 : engRate > 0.005 ? 3 : engRate > 0.001 ? 2 : 1

    // Growth: followers / reach (Excellent > 1%)
    const growRate = totalFollowers / totalReach
    s.growth = growRate > 0.01 ? 5 : growRate > 0.005 ? 4 : growRate > 0.001 ? 3 : growRate > 0.0005 ? 2 : 1

    // Conversion: leads / reach (Excellent > 0.5%)
    const convRate = totalLeads / totalReach
    s.conversion = convRate > 0.005 ? 5 : convRate > 0.002 ? 4 : convRate > 0.001 ? 3 : convRate > 0.0005 ? 2 : 1

    s.total = s.hook + s.retention + s.shares + s.saves + s.engagement + s.growth + s.conversion
    return s
  })()

  const runAnalysis = async () => {
    // Check if we have data
    const validPosts = posts.filter(p => parseInt(p.reach) > 0)
    if (validPosts.length === 0) {
      setError(t('report.noPosts' as any))
      return
    }

    setAnalyzing(true)
    setError(null)

    const context = `${buildAiContext({ company: activeCompany, products, segments, keyMessages })}
Total Score: ${scores.total}/35 (Hook:${scores.hook}, Ret:${scores.retention}, Shares:${scores.shares}, Saves:${scores.saves}, Eng:${scores.engagement}, Gro:${scores.growth}, Conv:${scores.conversion})

Posts Data:
${validPosts.map(p => `- ${p.title} (${p.channel}): Reach=${p.reach}, 3sViews=${p.views3s}, WatchTime=${p.watchTime}, Comments=${p.comments}, Shares=${p.shares}, Saves=${p.saves}, Followers=${p.newFollowers}, Leads=${p.leads}`).join('\n')}
    `

    const prompt = lang === 'fr'
      ? `Agis comme un analyste Social Media expert. Analyse ces métriques hebdomadaires et fournis un rapport JSON strict structuré avec : "whatWorked" (liste de points), "whatToStop" (liste de points), "adjustments" (liste de points pour la semaine pro), et "insights" (apprentissages profonds sur l'audience à retenir). Sois concret et très spécifique.`
      : `Act as an expert Social Media analyst. Analyze these weekly metrics and provide a strict JSON report structured with: "whatWorked" (array of bullet points), "whatToStop" (array of bullet points), "adjustments" (array of tweaks for next week), and "insights" (deep audience learnings to memorize). Be concrete and highly specific.`

    try {
      const res = await callModelJSON<ReportAnalysis>(activeCompany?.id ?? '', [
        { role: 'system', content: prompt },
        { role: 'user', content: context }
      ], { temperature: 0.4, requiredKeys: ['whatWorked', 'whatToStop', 'adjustments', 'insights'] })
      
      setAnalysis(res)
      setSavedToMemory(false)
    } catch (e: any) {
      setError(t(buildModelError(e) as any))
    } finally {
      setAnalyzing(false)
    }
  }

  const importFromBuffer = async () => {
    if (!activeCompany || !orgId) {
      alert(lang === 'fr' ? 'Buffer non connecté.' : 'Buffer not connected yet.')
      return
    }
    setImporting(true)
    setError(null)
    try {
      // org + channels already in context - only fetch posts
      const postsData = await bufferQuery(activeCompany.id, `
        query GetPostsWithMetrics($orgId: OrganizationId!) {
          posts(
            first: 10
            input: {
              organizationId: $orgId
              filter: { status: [sent] }
            }
          ) {
            edges {
              node {
                id
                text
                channelId
                metrics {
                  type
                  name
                  value
                }
              }
            }
          }
        }
      `, { orgId })

      const edges = postsData?.posts?.edges || []
      const importedPosts: AnalyzedPost[] = edges.map((edge: any) => {
        const node = edge.node
        const ch = bufferChannels.find((c: any) => c.id === node.channelId)
        
        let reach = 0, comments = 0, shares = 0, saves = 0, views3s = 0, likes = 0, follows = 0
        ;(node.metrics || []).forEach((m: any) => {
          const val = parseInt(m.value) || 0
          // Use m.type (stable enum) for programmatic matching, not m.name (display label)
          // reactions: Instagram likes, Twitter likes, Mastodon favorites, all Facebook reaction types combined
          // likes: Facebook Like subcount only (distinct from reactions which sums all FB reaction types)
          // reposts: Twitter retweets, Mastodon reblogs, Threads reposts
          // shares: explicit share/forward actions (distinct from reposts)
          // views: normalized video view count (replaces deprecated video_views)
          // follows: new followers attributed to the post (Instagram)
          if (m.type === 'impressions' || m.type === 'reach') reach = Math.max(reach, val)
          if (m.type === 'reactions' || m.type === 'likes') likes += val
          if (m.type === 'comments') comments += val
          if (m.type === 'reposts' || m.type === 'shares') shares += val
          if (m.type === 'saves') saves += val
          if (m.type === 'views' || m.type === 'video_views') views3s += val
          if (m.type === 'follows') follows += val
        })

        const title = (node.text || '').substring(0, 30) + '...'
        
        return {
          id: crypto.randomUUID(),
          title: title,
          channel: ch?.service ? ch.service.charAt(0).toUpperCase() + ch.service.slice(1) : 'Facebook',
          reach: reach.toString(),
          views3s: views3s ? views3s.toString() : '',
          watchTime: '',
          comments: comments.toString(),
          shares: shares.toString(),
          saves: saves.toString(),
          newFollowers: follows ? follows.toString() : '',
          leads: ''
        }
      })

      if (importedPosts.length === 0) {
        alert(lang === 'fr' ? 'Aucun post publié trouvé.' : 'No sent posts found.')
        return
      }

      // Check if metrics came back empty (app token limitation)
      const hasMetrics = importedPosts.some(p => parseInt(p.reach) > 0 || parseInt(p.comments) > 0)
      if (!hasMetrics) {
        setError(lang === 'fr'
          ? 'Posts importés sans métriques. Les métriques nécessitent une clé API personnelle Buffer (pas un token d\'application).'
          : 'Posts imported but without metrics. Metrics require a Buffer personal API key - app tokens only return post text.')
      }

      setPosts(importedPosts)
      
    } catch (e: any) {
      console.error(e)
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const saveReport = () => {
    if (!weekLabel) return
    const report: WeeklyReport = {
      id: reportId,
      weekLabel,
      posts,
      analysis,
      scores,
      createdAt: Date.now()
    }
    
    const existing = history.findIndex(h => h.id === reportId)
    const newHistory = [...history]
    if (existing >= 0) newHistory[existing] = report
    else newHistory.unshift(report)
    
    saveHistory(newHistory)
    alert(t('report.saved' as any))
  }

  const loadReport = (report: WeeklyReport) => {
    setReportId(report.id)
    setWeekLabel(report.weekLabel)
    setPosts(report.posts)
    setAnalysis(report.analysis)
    setSavedToMemory(false)
    setError(null)
  }

  const startNew = () => {
    setReportId(crypto.randomUUID())
    setWeekLabel('')
    setPosts([emptyPost()])
    setAnalysis(null)
    setSavedToMemory(false)
    setError(null)
  }

  const saveToMemory = async () => {
    if (!analysis?.insights || analysis.insights.length === 0) return
    try {
      const content = `Weekly Report Insights (${weekLabel}):\n` + analysis.insights.map(i => `- ${i}`).join('\n')
      await addKeyMessage(content)
      setSavedToMemory(true)
    } catch (e) {
      alert('Error saving to memory')
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--color-bg)]">
      {/* Header */}
      <div className="flex-none p-6 border-b border-[var(--color-border)] flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 rounded-md">
              {t('report.badge' as any)}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">{t('report.title' as any)}</h1>
          <p className="text-[var(--color-text-muted)] max-w-3xl">
            {t('report.subtitle' as any)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <button className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] rounded-lg font-medium hover:bg-[var(--color-surface-hover)] flex items-center gap-2 transition-colors">
              <History className="w-4 h-4" />
              {t('report.history' as any)}
            </button>
            {/* History Dropdown */}
            <div className="absolute right-0 mt-2 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 p-2 max-h-96 overflow-y-auto">
              <button onClick={startNew} className="w-full text-left px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg mb-2">
                + {t('report.newReport' as any)}
              </button>
              {history.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">
                  {t('report.empty' as any)}
                </div>
              )}
              {history.map(h => (
                <button
                  key={h.id}
                  onClick={() => loadReport(h)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[var(--color-bg)] transition-colors mb-1 truncate",
                    h.id === reportId ? "bg-[var(--color-bg)] font-bold" : "text-[var(--color-text)]"
                  )}
                >
                  {h.weekLabel || 'Untitled'} - {h.scores.total}/35
                </button>
              ))}
            </div>
          </div>
          <button 
            onClick={saveReport}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            {t('report.save' as any)}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8">
          
          {/* Left Column: Data Entry */}
          <div className="xl:col-span-7 space-y-6">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] p-5 rounded-xl shadow-sm">
              <label className="block text-sm font-semibold text-[var(--color-text)] mb-2">
                {t('report.weekLabel' as any)}
              </label>
              <input 
                type="text" 
                value={weekLabel}
                onChange={e => setWeekLabel(e.target.value)}
                placeholder={t('report.weekPh' as any)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[var(--color-text)] outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            <div className="space-y-4">
              {posts.map((post, index) => (
                <div key={post.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] flex justify-between items-center">
                    <span className="font-bold text-[var(--color-text)] text-sm">Post #{index + 1}</span>
                    {posts.length > 1 && (
                      <button onClick={() => removePost(post.id)} className="text-red-500 hover:text-red-600 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">{t('report.postTitle' as any)}</label>
                        <input type="text" value={post.title} onChange={e => updatePost(post.id, 'title', e.target.value)} placeholder={t('report.postTitlePh' as any)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                      </div>
                      <div className="w-1/3">
                        <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1">{t('report.channel' as any)}</label>
                        <select value={post.channel} onChange={e => updatePost(post.id, 'channel', e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-500">
                          <option>Facebook</option><option>Instagram</option><option>LinkedIn</option><option>TikTok</option>
                        </select>
                      </div>
                    </div>
                    {/* Metrics Grid */}
                    {[
                      { key: 'reach', label: t('report.reach' as any) },
                      { key: 'views3s', label: t('report.views3s' as any) },
                      { key: 'watchTime', label: t('report.watchTime' as any), ph: t('report.watchTimePh' as any) },
                      { key: 'comments', label: t('report.comments' as any) },
                      { key: 'shares', label: t('report.shares' as any) },
                      { key: 'saves', label: t('report.saves' as any) },
                      { key: 'newFollowers', label: t('report.newFollowers' as any) },
                      { key: 'leads', label: t('report.leads' as any) },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1 truncate">{field.label}</label>
                        <input type={field.key === 'watchTime' ? 'text' : 'number'} value={(post as any)[field.key]} onChange={e => updatePost(post.id, field.key as keyof AnalyzedPost, e.target.value)} placeholder={field.ph || '0'} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex gap-4">
              <button onClick={addPost} className="flex-1 py-3 border-2 border-dashed border-[var(--color-border)] rounded-xl text-[var(--color-text-muted)] font-medium hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-5 h-5" />
                {t('report.addPost' as any)}
              </button>
              <button 
                onClick={importFromBuffer}
                disabled={importing}
                className="flex-1 py-3 border-2 border-dashed border-[var(--color-border)] rounded-xl text-[var(--color-text-muted)] font-medium hover:text-blue-600 hover:border-blue-300 dark:hover:border-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {lang === 'fr' ? 'Auto-importer depuis Buffer' : 'Auto-import from Buffer'}
              </button>
            </div>
            {/* Personal key notice */}
            <p className="text-[10px] text-[var(--color-text-muted)] flex items-start gap-1.5 leading-relaxed">
              <span className="shrink-0 mt-0.5">ℹ️</span>
              {lang === 'fr'
                ? 'L\'import automatique nécessite une clé API personnelle Buffer (pas un token d\'application). Les métriques (likes, portée…) ne sont disponibles qu\'avec une clé personnelle.'
                : 'Auto-import requires a Buffer personal API key (not an app token). Metrics (likes, reach…) are only available with a personal key - app tokens return posts without metric data.'}
            </p>
          </div>

          {/* Right Column: Score & AI */}
          <div className="xl:col-span-5 space-y-6">
            
            {/* FlowCom Score Card */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
              <div className="p-6 border-b border-[var(--color-border)] bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex justify-between items-end">
                <div>
                  <p className="text-indigo-100 font-semibold mb-1 uppercase tracking-wider text-sm">{t('report.score' as any)}</p>
                  <div className="text-5xl font-black">{scores.total}<span className="text-2xl text-indigo-200 font-bold">{t('report.scoreTotal' as any)}</span></div>
                </div>
                <BarChart2 className="w-12 h-12 opacity-50" />
              </div>
              <div className="p-4 grid grid-cols-2 gap-y-4 gap-x-2">
                {[
                  { label: t('report.scHook' as any), val: scores.hook },
                  { label: t('report.scRetention' as any), val: scores.retention },
                  { label: t('report.scShares' as any), val: scores.shares },
                  { label: t('report.scSaves' as any), val: scores.saves },
                  { label: t('report.scEngagement' as any), val: scores.engagement },
                  { label: t('report.scGrowth' as any), val: scores.growth },
                  { label: t('report.scConversion' as any), val: scores.conversion },
                ].map((s, i) => (
                  <div key={i} className="flex flex-col">
                    <span className="text-xs text-[var(--color-text-muted)] font-semibold uppercase truncate">{s.label}</span>
                    <div className="flex items-center gap-1 mt-1">
                      {[1,2,3,4,5].map(star => (
                        <div key={star} className={cn("h-1.5 flex-1 rounded-full", star <= s.val ? "bg-indigo-600" : "bg-[var(--color-border)]")} />
                      ))}
                      <span className="text-xs font-bold w-4 text-right text-[var(--color-text)]">{s.val}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Analysis Panel */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg)]">
                <div className="flex items-center gap-2 font-bold text-[var(--color-text)]">
                  <Brain className="w-5 h-5 text-indigo-600" />
                  Diagnostic IA
                </div>
                <button 
                  onClick={runAnalysis}
                  disabled={analyzing}
                  className="px-3 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 text-sm font-semibold rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {t('report.analyze' as any)}
                </button>
              </div>

              {error && (
                <div className="p-4 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm border-b border-red-100 dark:border-red-900/50 flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="p-5">
                {analyzing ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-[var(--color-border)] rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-[var(--color-border)] rounded w-full"></div>
                    <div className="h-3 bg-[var(--color-border)] rounded w-5/6"></div>
                    <div className="h-3 bg-[var(--color-border)] rounded w-4/6 mb-4"></div>
                  </div>
                ) : analysis ? (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-bold text-green-600 dark:text-green-400 uppercase mb-2 flex items-center gap-2">
                        <Check className="w-4 h-4" /> {t('report.aiWhatWorked' as any)}
                      </h4>
                      <ul className="list-disc list-inside text-sm text-[var(--color-text)] space-y-1">
                        {analysis.whatWorked.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-red-500 uppercase mb-2 flex items-center gap-2">
                        <Trash2 className="w-4 h-4" /> {t('report.aiWhatToStop' as any)}
                      </h4>
                      <ul className="list-disc list-inside text-sm text-[var(--color-text)] space-y-1">
                        {analysis.whatToStop.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-500 uppercase mb-2 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" /> {t('report.aiAdjustments' as any)}
                      </h4>
                      <ul className="list-disc list-inside text-sm text-[var(--color-text)] space-y-1">
                        {analysis.adjustments.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                    
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                      <h4 className="text-sm font-bold text-indigo-700 dark:text-indigo-400 uppercase mb-2 flex items-center gap-2">
                        <Brain className="w-4 h-4" /> {t('report.aiInsights' as any)}
                      </h4>
                      <ul className="list-disc list-inside text-sm text-indigo-900 dark:text-indigo-200 space-y-1 mb-4">
                        {analysis.insights.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                      <button 
                        onClick={saveToMemory}
                        disabled={savedToMemory}
                        className="w-full py-2 bg-white dark:bg-[var(--color-surface)] border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 font-medium rounded-md text-sm hover:bg-indigo-50 dark:hover:bg-[var(--color-bg)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savedToMemory ? t('report.aiSavedToMemory' as any) : "Save Insights to AI Memory"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-[var(--color-text-muted)]">
                    <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm max-w-[250px] mx-auto">
                      {t('report.empty' as any)}
                    </p>
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
