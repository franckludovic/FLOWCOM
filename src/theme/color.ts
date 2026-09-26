// Colour maths for the theme engine: sRGB <-> OKLCH conversion, WCAG contrast,
// and lightness adjustment until a contrast target is met.

type Rgb = [number, number, number]
export interface Oklch { l: number; c: number; h: number }

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v))

export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Invalid colour ${hex}`)
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('')}`
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map(toGamma) as Rgb
}

const inGamut = (rgb: Rgb) => rgb.every(v => v >= -0.0005 && v <= 1.0005)

// OKLCH to hex, reducing chroma until the colour fits in sRGB.
export function oklchToHex(color: Oklch): string {
  let c = color.c
  let rgb = oklchToRgb({ ...color, c })
  while (!inGamut(rgb) && c > 0) {
    c = Math.max(0, c - 0.005)
    rgb = oklchToRgb({ ...color, c })
  }
  return rgbToHex(rgb)
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// Moves a colour's OKLCH lightness (keeping its hue) until it reaches `min`
// contrast against every background. Direction follows the backgrounds:
// darker on light grounds, lighter on dark grounds.
export function ensureContrast(hex: string, backgrounds: string[], min: number): string {
  const passes = (candidate: string) => backgrounds.every(bg => contrast(candidate, bg) >= min)
  if (passes(hex)) return hex
  const base = hexToOklch(hex)
  const darken = backgrounds.every(bg => luminance(bg) > 0.18)
  for (let step = 1; step <= 100; step++) {
    const l = clamp(base.l + (darken ? -step : step) * 0.01)
    const candidate = oklchToHex({ ...base, l })
    if (passes(candidate)) return candidate
    if (l === 0 || l === 1) break
  }
  return darken ? '#000000' : '#ffffff'
}

// The more readable of two text colours on a fill.
export function readableOn(fill: string, light = '#ffffff', dark: string): string {
  return contrast(light, fill) >= contrast(dark, fill) ? light : dark
}

// Same hue at a given lightness and chroma share, for soft backgrounds and hover steps.
export function tone(hex: string, l: number, chromaFactor = 1): string {
  const base = hexToOklch(hex)
  return oklchToHex({ l: clamp(l), c: base.c * chromaFactor, h: base.h })
}

export function shiftLightness(hex: string, delta: number): string {
  const base = hexToOklch(hex)
  return oklchToHex({ ...base, l: clamp(base.l + delta) })
}
