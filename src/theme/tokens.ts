// FlowCom's design tokens, mirrored from the FlowCom Design System
// (https://claude.ai/artifact/AbaiAxAHjdXab8h2WWP4p5). The default theme uses
// these exact values; a client brand replaces the brand and accent groups
// through derive.ts. Status and chart colours are never branded.

export type Mode = 'light' | 'dark'
export type ColorTokens = Record<string, string>

export const NEUTRALS: Record<Mode, ColorTokens> = {
  light: {
    'surface-page': '#f6f5f1', 'surface-card': '#ffffff', 'surface-sunken': '#eeece6', 'surface-overlay': '#ffffff',
    line: '#e2dfd7', 'line-strong': '#8a8f8a',
    ink: '#1b1f1d', 'ink-muted': '#565c58', 'ink-subtle': '#6b716d',
  },
  dark: {
    'surface-page': '#0e1312', 'surface-card': '#151c1b', 'surface-sunken': '#0a0e0d', 'surface-overlay': '#1b2322',
    line: '#27302e', 'line-strong': '#6c7773',
    ink: '#eef2f0', 'ink-muted': '#a9b3af', 'ink-subtle': '#8a9591',
  },
}

export const FLOWCOM_BRAND: Record<Mode, ColorTokens> = {
  light: {
    brand: '#135c69', 'brand-hover': '#0e4a55', 'brand-soft': '#e1eef0', 'brand-ink': '#0e4a55', 'on-brand': '#ffffff',
    accent: '#e9a23b', 'accent-soft': '#fcefd9', 'accent-ink': '#7d4f08', 'on-accent': '#2b1d05',
    focus: '#135c69',
  },
  dark: {
    brand: '#6cbac6', 'brand-hover': '#8acbd5', 'brand-soft': '#133a41', 'brand-ink': '#9dd6de', 'on-brand': '#062328',
    accent: '#f0b457', 'accent-soft': '#3a2b11', 'accent-ink': '#f6cb86', 'on-accent': '#2b1d05',
    focus: '#8acbd5',
  },
}

export const STATUS: Record<Mode, ColorTokens> = {
  light: {
    success: '#1f7544', 'success-soft': '#e3f2e8', warning: '#9a4d0c', 'warning-soft': '#fbe9d6',
    danger: '#b3261e', 'danger-soft': '#fbe4e2', info: '#1d5fa3', 'info-soft': '#e3edf8',
  },
  dark: {
    success: '#62c48d', 'success-soft': '#10301f', warning: '#f2a463', 'warning-soft': '#3a2413',
    danger: '#f28c84', 'danger-soft': '#3b1815', info: '#8ab8f0', 'info-soft': '#132a45',
  },
}

// Validated colour-blind-safe categorical order, with dark steps for dark cards.
export const CHART: Record<Mode, string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'],
}

export const SHADOWS: Record<Mode, Record<'flat' | 'soft', ColorTokens>> = {
  light: {
    soft: { 'shadow-sm': '0 1px 2px rgba(27, 31, 29, 0.06)', 'shadow-md': '0 2px 8px rgba(27, 31, 29, 0.08), 0 1px 2px rgba(27, 31, 29, 0.06)', 'shadow-lg': '0 12px 32px rgba(27, 31, 29, 0.14), 0 2px 6px rgba(27, 31, 29, 0.08)' },
    flat: { 'shadow-sm': 'none', 'shadow-md': '0 1px 3px rgba(27, 31, 29, 0.10)', 'shadow-lg': '0 8px 24px rgba(27, 31, 29, 0.14)' },
  },
  dark: {
    soft: { 'shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.4)', 'shadow-md': '0 2px 8px rgba(0, 0, 0, 0.45)', 'shadow-lg': '0 12px 32px rgba(0, 0, 0, 0.55)' },
    flat: { 'shadow-sm': 'none', 'shadow-md': '0 1px 3px rgba(0, 0, 0, 0.5)', 'shadow-lg': '0 8px 24px rgba(0, 0, 0, 0.6)' },
  },
}

export const RADII: Record<'sharp' | 'soft' | 'round', ColorTokens> = {
  sharp: { 'radius-sm': '2px', 'radius-md': '4px', 'radius-lg': '6px', 'radius-xl': '8px' },
  soft: { 'radius-sm': '6px', 'radius-md': '8px', 'radius-lg': '12px', 'radius-xl': '16px' },
  round: { 'radius-sm': '8px', 'radius-md': '12px', 'radius-lg': '18px', 'radius-xl': '24px' },
}

export const DENSITY: Record<'compact' | 'comfortable', ColorTokens> = {
  compact: { 'control-sm': '28px', 'control-md': '36px', 'control-lg': '44px', 'card-pad': '16px' },
  comfortable: { 'control-sm': '32px', 'control-md': '40px', 'control-lg': '48px', 'card-pad': '20px' },
}

// Fonts bundled with the app (loaded in main.tsx). A client can pick among these.
export const FONT_OPTIONS = {
  Manrope: '"Manrope", "Segoe UI", system-ui, sans-serif',
  'Public Sans': '"Public Sans", "Segoe UI", system-ui, sans-serif',
  Sora: '"Sora", "Segoe UI", system-ui, sans-serif',
  'DM Sans': '"DM Sans", "Segoe UI", system-ui, sans-serif',
  Lora: '"Lora", Georgia, serif',
  System: 'system-ui, "Segoe UI", Roboto, sans-serif',
} as const
export type FontOption = keyof typeof FONT_OPTIONS
export const MONO_FONT = '"IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace'

// What an installation can change.
export interface ThemeSettings {
  primary: string
  accent: string
  logoLight?: string
  logoDark?: string
  productName?: string
  displayFont: FontOption
  bodyFont: FontOption
  corners: keyof typeof RADII
  shadows: 'flat' | 'soft'
  density: keyof typeof DENSITY
}

export const DEFAULT_THEME: ThemeSettings = {
  primary: FLOWCOM_BRAND.light.brand,
  accent: FLOWCOM_BRAND.light.accent,
  productName: 'FlowCom',
  displayFont: 'Manrope',
  bodyFont: 'Public Sans',
  corners: 'soft',
  shadows: 'soft',
  density: 'compact',
}
