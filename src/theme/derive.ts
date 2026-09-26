import { contrast, ensureContrast, hexToOklch, isHexColor, readableOn, shiftLightness, tone } from './color'
import {
  CHART, DEFAULT_THEME, DENSITY, FLOWCOM_BRAND, FONT_OPTIONS, MONO_FONT, NEUTRALS, RADII, SHADOWS, STATUS,
  type ColorTokens, type Mode, type ThemeSettings,
} from './tokens'

// Turns an installation's brand inputs into the brand and accent token groups
// for light and dark. The FlowCom defaults return the design system's exact
// values; any other brand is derived, then contrast-corrected so text reaches
// 4.5:1 and the focus ring 3:1 on the surfaces they are used on.
export function deriveBrand(primary: string, accent: string): Record<Mode, ColorTokens> {
  const p = isHexColor(primary) ? primary : DEFAULT_THEME.primary
  const a = isHexColor(accent) ? accent : DEFAULT_THEME.accent
  if (p.toLowerCase() === DEFAULT_THEME.primary && a.toLowerCase() === DEFAULT_THEME.accent) return FLOWCOM_BRAND

  const L = NEUTRALS.light
  const D = NEUTRALS.dark
  const lightGrounds = [L['surface-card'], L['surface-page']]
  const darkGrounds = [D['surface-card'], D['surface-page']]

  // Light mode
  const brand = ensureContrast(p, lightGrounds, 4.5)
  const brandHover = ensureContrast(shiftLightness(brand, -0.07), lightGrounds, 4.5)
  const brandSoft = tone(brand, 0.95, 0.25)
  const accentSoft = tone(a, 0.95, 0.3)
  const light: ColorTokens = {
    brand,
    'brand-hover': brandHover,
    'brand-soft': brandSoft,
    'brand-ink': ensureContrast(brandHover, [brandSoft, L['surface-card']], 4.5),
    'on-brand': readableOn(brand, '#ffffff', tone(brand, 0.2, 0.6)),
    accent: a,
    'accent-soft': accentSoft,
    'accent-ink': ensureContrast(tone(a, 0.45), [accentSoft, L['surface-card']], 4.5),
    'on-accent': ensureContrast(readableOn(a, '#ffffff', tone(a, 0.2, 0.8)), [a], 4.5),
    focus: ensureContrast(brand, [...lightGrounds, L['surface-sunken']], 3),
  }

  // Dark mode: lighter steps of the same hues on dark grounds.
  const pl = hexToOklch(p)
  const al = hexToOklch(a)
  const brandDark = ensureContrast(tone(p, Math.max(pl.l, 0.72)), darkGrounds, 4.5)
  const brandSoftDark = tone(p, 0.3, 0.45)
  const accentDark = tone(a, Math.max(al.l, 0.78))
  const accentSoftDark = tone(a, 0.3, 0.4)
  const onBrandDark = readableOn(brandDark, '#ffffff', tone(p, 0.2, 0.6))
  const dark: ColorTokens = {
    brand: brandDark,
    'brand-hover': shiftLightness(brandDark, 0.07),
    'brand-soft': brandSoftDark,
    'brand-ink': ensureContrast(tone(p, 0.86, 0.7), [brandSoftDark, D['surface-card']], 4.5),
    'on-brand': ensureContrast(onBrandDark, [brandDark], 4.5),
    accent: accentDark,
    'accent-soft': accentSoftDark,
    'accent-ink': ensureContrast(tone(a, 0.86, 0.7), [accentSoftDark, D['surface-card']], 4.5),
    'on-accent': ensureContrast(readableOn(accentDark, '#ffffff', tone(a, 0.2, 0.8)), [accentDark], 4.5),
    focus: ensureContrast(shiftLightness(brandDark, 0.07), [...darkGrounds, D['surface-sunken']], 3),
  }
  // The hover fill must still carry on-brand text.
  if (contrast(dark['on-brand'], dark['brand-hover']) < 4.5) dark['brand-hover'] = brandDark
  return { light, dark }
}

export function normalizeTheme(input: Partial<ThemeSettings> | null | undefined): ThemeSettings {
  const t = { ...DEFAULT_THEME, ...(input ?? {}) }
  return {
    ...t,
    primary: isHexColor(t.primary) ? t.primary.toLowerCase() : DEFAULT_THEME.primary,
    accent: isHexColor(t.accent) ? t.accent.toLowerCase() : DEFAULT_THEME.accent,
    displayFont: t.displayFont in FONT_OPTIONS ? t.displayFont : DEFAULT_THEME.displayFont,
    bodyFont: t.bodyFont in FONT_OPTIONS ? t.bodyFont : DEFAULT_THEME.bodyFont,
    corners: t.corners in RADII ? t.corners : DEFAULT_THEME.corners,
    shadows: t.shadows === 'flat' ? 'flat' : 'soft',
    density: t.density in DENSITY ? t.density : DEFAULT_THEME.density,
  }
}

// Every token for one mode, as CSS custom property declarations.
export function themeVariables(settings: ThemeSettings, mode: Mode): Record<string, string> {
  const brand = deriveBrand(settings.primary, settings.accent)[mode]
  const vars: Record<string, string> = {
    ...NEUTRALS[mode],
    ...brand,
    ...STATUS[mode],
    ...SHADOWS[mode][settings.shadows],
    ...RADII[settings.corners],
    'radius-full': '9999px',
    ...DENSITY[settings.density],
    'font-display': FONT_OPTIONS[settings.displayFont],
    'font-body': FONT_OPTIONS[settings.bodyFont],
    'font-mono': MONO_FONT,
  }
  CHART[mode].forEach((value, i) => {
    vars[`chart-${i + 1}`] = value
    vars[`viz-${i + 1}`] = value
  })
  return vars
}

export function themeCss(settings: ThemeSettings): string {
  const block = (selector: string, mode: Mode) =>
    `${selector} {\n  color-scheme: ${mode};\n${Object.entries(themeVariables(settings, mode)).map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n}`
  return `${block(':root', 'light')}\n${block(':root.dark', 'dark')}\n`
}
