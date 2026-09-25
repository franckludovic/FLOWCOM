import { describe, expect, it } from 'vitest'
import { addUtm, campaignWarnings } from './campaignContext'
import type { Campaign } from './campaigns'

const utm = 'utm_source=facebook&utm_medium=social&utm_campaign=rentree-2026'

describe('addUtm', () => {
  it('tags plain links', () => {
    expect(addUtm('Visit https://example.com/offre now', 'rentree-2026', 'facebook'))
      .toBe(`Visit https://example.com/offre?${utm} now`)
  })

  it('appends to existing query strings and keeps fragments and trailing punctuation', () => {
    expect(addUtm('See https://example.com/p?id=3#top.', 'rentree-2026', 'facebook'))
      .toBe(`See https://example.com/p?id=3&${utm}#top.`)
  })

  it('leaves links that already carry a campaign tag', () => {
    const text = 'https://example.com/?utm_campaign=other'
    expect(addUtm(text, 'rentree-2026', 'facebook')).toBe(text)
  })

  it('does nothing without a tracking code', () => {
    expect(addUtm('https://example.com', '  ', 'facebook')).toBe('https://example.com')
  })
})

describe('campaignWarnings', () => {
  const base = { status: 'active', start_date: '2026-09-01', end_date: '2026-09-30' } as Campaign

  it('is quiet for an active campaign within its dates', () => {
    expect(campaignWarnings(base, 'en', '2026-09-15')).toEqual([])
  })

  it('flags paused campaigns and dates outside the period', () => {
    expect(campaignWarnings({ ...base, status: 'paused' }, 'en', '2026-10-02')).toEqual([
      'This campaign is paused.',
      'The campaign ended on 2026-09-30.',
    ])
    expect(campaignWarnings(base, 'en', '2026-08-20')).toEqual(['The campaign starts on 2026-09-01.'])
  })
})
