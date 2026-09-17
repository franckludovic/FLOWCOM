import { describe, expect, it } from 'vitest'
import { buildGroqError, validateGroqJSON } from './groq'

describe('validateGroqJSON', () => {
  it('accepts a complete structured response', () => {
    expect(validateGroqJSON({ content: 'A post', visualIdea: 'A product photo' }, ['content', 'visualIdea'])).toBe(true)
  })

  it('rejects missing required fields', () => {
    expect(validateGroqJSON({ content: 'A post' }, ['content', 'visualIdea'])).toBe(false)
  })

  it('rejects arrays and primitive responses', () => {
    expect(validateGroqJSON([], ['items'])).toBe(false)
    expect(validateGroqJSON('not json object', [])).toBe(false)
  })

  it('rejects malformed nested values', () => {
    expect(validateGroqJSON({ activities: [null] }, ['activities'])).toBe(false)
  })

  it('classifies deployed function and timeout failures', () => {
    expect(buildGroqError(new Error('No API key configured'))).toBe('error.noKey')
    expect(buildGroqError(new Error('AI request timed out'))).toBe('error.network')
  })
})
