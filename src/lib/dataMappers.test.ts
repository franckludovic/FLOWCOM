import { describe, expect, it } from 'vitest'
import { mapCalendarRow, toLibraryInsert } from './dataMappers'

describe('Supabase persistence mappers', () => {
  it('maps a calendar row into the calendar view model', () => {
    expect(mapCalendarRow({
      id: 'calendar-1',
      post_date: '2026-09-20',
      topic: 'Launch',
      goal: 'Leads',
      format: 'Post',
      channel: 'linkedin',
      status: 'idea',
    })).toEqual({
      id: 'calendar-1',
      date: '2026-09-20',
      topic: 'Launch',
      goal: 'Leads',
      format: 'Post',
      channel: 'linkedin',
      status: 'idea',
    })
  })

  it('always includes company ownership and database defaults', () => {
    expect(toLibraryInsert({ title: 'Draft', body: 'Text' }, 'company-1')).toMatchObject({
      company_id: 'company-1',
      title: 'Draft',
      body: 'Text',
      format: 'post',
      tone: 'professional',
      status: 'Draft',
      publish_date: null,
    })
  })
})
