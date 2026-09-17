export interface CalendarViewItem {
  id: string
  date: string
  topic: string
  goal: string
  format: 'Post' | 'Carousel' | 'Video' | 'Story'
  channel: string
  status: 'idea' | 'scheduled' | 'published'
}

export function mapCalendarRow(row: Record<string, any>): CalendarViewItem {
  return {
    id: row.id,
    date: row.post_date,
    topic: row.topic,
    goal: row.goal,
    format: row.format,
    channel: row.channel,
    status: row.status,
  }
}

export function toLibraryInsert(item: Record<string, any>, companyId: string) {
  return {
    company_id: companyId,
    title: item.title ?? '',
    hook: item.hook ?? '',
    episode_context: item.episode_context ?? '',
    body: item.body ?? '',
    conclusion: item.conclusion ?? '',
    reward: item.reward ?? '',
    cta: item.cta ?? '',
    hashtags: item.hashtags ?? '',
    visual_idea: item.visual_idea ?? '',
    video_script: item.video_script ?? '',
    channel: item.channel ?? '',
    format: item.format ?? 'post',
    tone: item.tone ?? 'professional',
    status: item.status ?? 'Draft',
    publish_date: item.publish_date ?? null,
  }
}
