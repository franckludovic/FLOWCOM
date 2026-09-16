// Utility: merge Tailwind classes cleanly
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format a date to locale string
export function formatDate(date: string | Date, lang: string = 'fr'): string {
  return new Date(date).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Generate a UUID (fallback)
export function uuid(): string {
  return crypto.randomUUID()
}

// Truncate text
export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}
