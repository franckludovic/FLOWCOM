import { describe, expect, it } from 'vitest'
import { buildModelError, validateModelJSON } from './model'

describe('validateModelJSON', () => {
  it('accepts a complete structured response', () => {
    expect(validateModelJSON({ content: 'A post', visualIdea: 'A product photo' }, ['content', 'visualIdea'])).toBe(true)
  })

  it('rejects missing required fields', () => {
    expect(validateModelJSON({ content: 'A post' }, ['content', 'visualIdea'])).toBe(false)
  })

  it('rejects arrays and primitive responses', () => {
    expect(validateModelJSON([], ['items'])).toBe(false)
    expect(validateModelJSON('not json object', [])).toBe(false)
  })

  it('rejects malformed nested values', () => {
    expect(validateModelJSON({ activities: [null] }, ['activities'])).toBe(false)
  })

  it('classifies deployed function and timeout failures', () => {
    expect(buildModelError(new Error('No API key configured'))).toBe('error.noKey')
    expect(buildModelError(new Error('AI request timed out'))).toBe('error.network')
  })
})
