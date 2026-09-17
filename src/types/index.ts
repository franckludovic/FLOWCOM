// ─── Auth ────────────────────────────────────────────────────────────────────
export interface Profile {
  id: string
  name: string
  email: string
  api_key: string | null
  lang: 'fr' | 'en'
  created_at: string
}

// ─── Company ─────────────────────────────────────────────────────────────────
export interface Company {
  id: string
  user_id: string
  name: string
  is_active: boolean
  // Step 1
  industry: string
  website: string
  founded_year: string
  team_size: string
  location: string
  short_desc: string
  logo_url?: string
  // Step 2
  mission: string
  vision: string
  values: string
  // Step 5
  tone: string
  targets: string
  channels: string
  frequency: string
  created_at: string
}

// ─── Products ────────────────────────────────────────────────────────────────
export interface Product {
  id: string
  company_id: string
  name: string
  description: string
  created_at: string
}

// ─── Audience Segments ───────────────────────────────────────────────────────
export interface AudienceSegment {
  id: string
  company_id: string
  name: string
  pain_points: string
  interests: string
  created_at: string
}

// ─── Key Messages ────────────────────────────────────────────────────────────
export interface KeyMessage {
  id: string
  company_id: string
  content: string
  created_at: string
}

// ─── Calendar ────────────────────────────────────────────────────────────────
export interface CalendarItem {
  id: string
  company_id: string
  month: string // e.g. "2026-10"
  post_date: string
  topic: string
  goal: string
  format: string
  created_at: string
}

// ─── Library ─────────────────────────────────────────────────────────────────
export type ContentStatus = 'Draft' | 'Validated' | 'Published' | 'Archived'
export type ContentTone = 'professional' | 'casual'
export type ContentFormat = 'post' | 'carousel' | 'video'

export interface LibraryItem {
  id: string
  company_id: string
  title: string
  hook: string
  episode_context: string
  body: string
  conclusion: string
  reward: string
  cta: string
  hashtags: string
  visual_idea: string
  video_script: string
  channel: string
  format: ContentFormat
  tone: ContentTone
  status: ContentStatus
  publish_date: string | null
  created_at: string
}

// ─── Roadmap ─────────────────────────────────────────────────────────────────
export type MilestoneId =
  | 'm1' | 'm2' | 'm3' | 'm4' | 'm5'
  | 'm6' | 'm7' | 'm8' | 'm9' | 'm10'
  | 'm11' | 'm12' | 'm13' | 'm14' | 'm15'

export interface RoadmapMilestone {
  id: string
  company_id: string
  milestone_id: MilestoneId
  completed: boolean
  updated_at: string
}

// ─── Reports ─────────────────────────────────────────────────────────────────
export interface PostMetrics {
  id: string
  title: string
  channel: string
  reach: number
  views_3s: number
  watch_time: string
  comments: number
  shares: number
  saves: number
  new_followers: number
  leads: number
}

export interface FlowComScore {
  hook: number       // /5
  retention: number  // /5
  shares: number     // /5
  saves: number      // /5
  engagement: number // /5
  growth: number     // /5
  conversion: number // /5
  total: number      // /35
}

export interface AIAnalysis {
  what_worked: string
  to_stop: string
  adjustments: string
  insights: string
}

export interface WeeklyReport {
  id: string
  company_id: string
  week_label: string
  posts: PostMetrics[]
  flowcom_score: number
  score_breakdown: FlowComScore | null
  ai_analysis: AIAnalysis | null
  created_at: string
}

// ─── i18n ────────────────────────────────────────────────────────────────────
export type Lang = 'fr' | 'en'
export type Theme = 'light' | 'dark'

// ─── Content Generation ──────────────────────────────────────────────────────
export interface GeneratedPost {
  hook: string
  episode_context: string
  body: string
  conclusion: string
  reward: string
  cta: string
  visual_idea: string
  hashtags: string
}

export interface GeneratedVideoScript {
  script: string
  visual_idea: string
  hashtags: string
}
