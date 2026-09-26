// Weekly reports, stored in Dataverse (fc_weeklyreport) so every device and
// team member sees the same history. The long-text columns come from
// scripts/dataverse/upgrade-weekly-reports.mjs.
import { Fc_weeklyreportsService } from '@/generated/services/Fc_weeklyreportsService'
import { createdAt, lookup, unwrap } from './dataverse'

export const REPORT_METRICS = ['reach', 'views3s', 'likes', 'comments', 'shares', 'saves', 'followers', 'leads'] as const
export type ReportMetric = typeof REPORT_METRICS[number]

export interface ReportPost {
  id: string
  // The publishing service's post id, when the post came from there.
  sourceId?: string
  title: string
  network: string
  date: string
  hasVideo?: boolean
  // null means "not entered yet".
  values: Record<ReportMetric, number | null>
}

export interface ReportAnalysis {
  whatWorked: string[]
  whatToStop: string[]
  nextWeek: string[]
  learnings: string[]
}

export const SCORE_AXES = ['hook', 'shares', 'saves', 'engagement', 'growth', 'conversion'] as const
export type ScoreAxis = typeof SCORE_AXES[number]
export type ScoreBreakdown = Record<ScoreAxis, number>

export interface WeeklyReport {
  id: string
  weekStart: string
  posts: ReportPost[]
  analysis: ReportAnalysis | null
  score: number | null
  breakdown: ScoreBreakdown | null
  createdAt: string
}

const parse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

function fromRow(row: Record<string, unknown>): WeeklyReport {
  return {
    id: String(row.fc_weeklyreportid),
    weekStart: String(row.fc_weekstart ?? '').slice(0, 10),
    posts: parse<ReportPost[]>(row.fc_postsdata, []),
    analysis: parse<ReportAnalysis | null>(row.fc_analysisdata, null),
    score: typeof row.fc_flowcomscore === 'number' ? row.fc_flowcomscore : null,
    breakdown: parse<ScoreBreakdown | null>(row.fc_scoresdata, null),
    createdAt: createdAt(row as never),
  }
}

export async function listReports(companyId: string): Promise<WeeklyReport[]> {
  const rows = unwrap(await Fc_weeklyreportsService.getAll({ filter: `_fc_company_value eq ${companyId}`, orderBy: ['createdon desc'], top: 60 }), 'load weekly reports')
  // Reports saved before the upgrade have no week start and cannot be shown.
  return rows.map(r => fromRow(r as unknown as Record<string, unknown>)).filter(r => r.weekStart)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

const payload = (report: Omit<WeeklyReport, 'id' | 'createdAt'>) => ({
  fc_name: `Semaine du ${report.weekStart}`,
  fc_weekstart: report.weekStart,
  fc_postsdata: JSON.stringify(report.posts),
  fc_analysisdata: report.analysis ? JSON.stringify(report.analysis) : '',
  fc_scoresdata: report.breakdown ? JSON.stringify(report.breakdown) : '',
  fc_flowcomscore: report.score ?? undefined,
})

export async function createReport(companyId: string, report: Omit<WeeklyReport, 'id' | 'createdAt'>): Promise<WeeklyReport> {
  const row = unwrap(await Fc_weeklyreportsService.create({
    ...payload(report),
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
  } as never), 'create weekly report')
  return { ...report, id: String((row as unknown as Record<string, unknown>).fc_weeklyreportid), createdAt: new Date().toISOString() }
}

export async function updateReport(id: string, report: Omit<WeeklyReport, 'id' | 'createdAt'>): Promise<void> {
  unwrap(await Fc_weeklyreportsService.update(id, payload(report) as never), 'update weekly report')
}

// ─── Score ────────────────────────────────────────────────────────────────────
// Six axes scored 1 to 5 from the week's totals, so the maximum is 30. Each
// rate compares to the week's reach; an axis without data is left out rather
// than guessed.

const band = (rate: number, steps: [number, number, number, number]) =>
  rate > steps[0] ? 5 : rate > steps[1] ? 4 : rate > steps[2] ? 3 : rate > steps[3] ? 2 : 1

export function scoreWeek(posts: ReportPost[]): { total: number; max: number; breakdown: Partial<ScoreBreakdown> } {
  const sum = (metric: ReportMetric) => posts.reduce((t, p) => t + (p.values[metric] ?? 0), 0)
  const has = (metric: ReportMetric) => posts.some(p => p.values[metric] !== null)
  const reach = sum('reach')
  if (!reach) return { total: 0, max: 0, breakdown: {} }
  const breakdown: Partial<ScoreBreakdown> = {}
  if (has('views3s')) breakdown.hook = band(sum('views3s') / reach, [0.3, 0.2, 0.1, 0.05])
  if (has('shares')) breakdown.shares = band(sum('shares') / reach, [0.01, 0.005, 0.002, 0.001])
  if (has('saves')) breakdown.saves = band(sum('saves') / reach, [0.02, 0.01, 0.005, 0.002])
  if (has('comments')) breakdown.engagement = band(sum('comments') / reach, [0.03, 0.015, 0.005, 0.001])
  if (has('followers')) breakdown.growth = band(sum('followers') / reach, [0.01, 0.005, 0.001, 0.0005])
  if (has('leads')) breakdown.conversion = band(sum('leads') / reach, [0.005, 0.002, 0.001, 0.0005])
  const values = Object.values(breakdown)
  return { total: values.reduce((a, b) => a + b, 0), max: values.length * 5, breakdown }
}

// ─── Lessons for the AI ───────────────────────────────────────────────────────

export function recentLearnings(reports: WeeklyReport[], limit = 6): string[] {
  return reports.flatMap(r => r.analysis?.learnings ?? []).filter(Boolean).slice(0, limit)
}
