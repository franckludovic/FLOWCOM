import { describe, expect, it } from 'vitest'
import { contrast } from './color'
import { deriveBrand, normalizeTheme, themeVariables } from './derive'
import { FLOWCOM_BRAND, NEUTRALS } from './tokens'

// Brands chosen to stress the derivation: very light, very dark, saturated, grey.
const BRANDS: Array<[string, string]> = [
  ['#6b2d8c', '#1a9c8c'], // the design system's example client
  ['#f5d90a', '#e11d48'], // bright yellow primary
  ['#ffc0cb', '#b0e0e6'], // pastels
  ['#000000', '#ffffff'], // black and white
  ['#0057b8', '#ffd700'], // blue and gold
  ['#2e7d32', '#ff6f00'], // green and orange
  ['#777777', '#999999'], // greys
]

describe('deriveBrand', () => {
  it('returns the design system values for the FlowCom defaults', () => {
    expect(deriveBrand('#135c69', '#e9a23b')).toBe(FLOWCOM_BRAND)
  })

  it.each(BRANDS)('keeps every text and focus pair readable for %s / %s', (primary, accent) => {
    for (const mode of ['light', 'dark'] as const) {
      const b = deriveBrand(primary, accent)[mode]
      const n = NEUTRALS[mode]
      const checks: Array<[string, string, number]> = [
        [b.brand, n['surface-card'], 4.5],
        [b.brand, n['surface-page'], 4.5],
        [b['on-brand'], b.brand, 4.5],
        [b['on-brand'], b['brand-hover'], 4.5],
        [b['brand-ink'], b['brand-soft'], 4.5],
        [b['accent-ink'], b['accent-soft'], 4.5],
        [b['accent-ink'], n['surface-card'], 4.5],
        [b['on-accent'], b.accent, 4.5],
        [b.focus, n['surface-card'], 3],
        [b.focus, n['surface-page'], 3],
      ]
      for (const [fg, bg, min] of checks) expect(contrast(fg, bg), `${mode} ${fg} on ${bg}`).toBeGreaterThanOrEqual(min)
    }
  })
})

describe('normalizeTheme', () => {
  it('falls back to defaults for invalid input', () => {
    const t = normalizeTheme({ primary: 'red', displayFont: 'Comic Sans' as never, corners: 'wild' as never })
    expect(t.primary).toBe('#135c69')
    expect(t.displayFont).toBe('Manrope')
    expect(t.corners).toBe('soft')
  })

  it('produces a complete variable set per mode', () => {
    const vars = themeVariables(normalizeTheme({}), 'dark')
    for (const key of ['surface-card', 'ink', 'brand', 'on-brand', 'accent-ink', 'success', 'chart-1', 'radius-lg', 'control-md', 'font-display']) {
      expect(vars[key], key).toBeTruthy()
    }
  })
})
