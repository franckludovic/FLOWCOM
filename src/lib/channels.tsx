// Social networks and content formats: labels, icons and how a post's networks
// are stored. A calendar item's channel column holds one network or several,
// comma-separated ("facebook,instagram"); older single-network items still read.
import type { ComponentType, CSSProperties } from 'react'
import { Clapperboard, Image, Layers, Smartphone, type LucideIcon } from 'lucide-react'
import {
  FaEnvelope, FaFacebookF, FaInstagram, FaLinkedinIn, FaPodcast, FaTiktok, FaWhatsapp, FaWordpress, FaXTwitter, FaYoutube,
} from 'react-icons/fa6'

export interface ChannelDefinition {
  value: string
  label: string
  icon: ComponentType<{ className?: string; title?: string; style?: CSSProperties }>
  // Brand colour; black logos (TikTok, X) use the ink colour so they stay visible in dark mode.
  color: string
}

export const CHANNELS: ChannelDefinition[] = [
  { value: 'linkedin', label: 'LinkedIn', icon: FaLinkedinIn, color: '#0A66C2' },
  { value: 'facebook', label: 'Facebook', icon: FaFacebookF, color: '#1877F2' },
  { value: 'instagram', label: 'Instagram', icon: FaInstagram, color: '#E4405F' },
  { value: 'tiktok', label: 'TikTok', icon: FaTiktok, color: 'var(--ink)' },
  { value: 'whatsapp', label: 'WhatsApp', icon: FaWhatsapp, color: '#25D366' },
  { value: 'youtube', label: 'YouTube', icon: FaYoutube, color: '#FF0000' },
  { value: 'twitter', label: 'X', icon: FaXTwitter, color: 'var(--ink)' },
  { value: 'newsletter', label: 'Newsletter', icon: FaEnvelope, color: 'var(--ink-muted)' },
  { value: 'blog', label: 'Blog', icon: FaWordpress, color: '#21759B' },
  { value: 'podcast', label: 'Podcast', icon: FaPodcast, color: '#9933CC' },
]

export const CHANNEL_MAP: Record<string, ChannelDefinition> = Object.fromEntries(CHANNELS.map(c => [c.value, c]))

export function parseChannels(value: string | null | undefined): string[] {
  const list = (value ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  return [...new Set(list)]
}

// A post goes to one network. Older items may list several; the first one counts.
export function networkOf(value: string | null | undefined): string {
  return parseChannels(value)[0] ?? ''
}

export function joinChannels(values: string[]): string {
  return [...new Set(values.map(v => v.trim().toLowerCase()).filter(Boolean))].join(',')
}

export type ContentFormat = 'Post' | 'Carousel' | 'Video' | 'Story'

export const FORMATS: Array<{ value: ContentFormat; label: { fr: string; en: string }; icon: LucideIcon }> = [
  { value: 'Post', label: { fr: 'Image', en: 'Image' }, icon: Image },
  { value: 'Carousel', label: { fr: 'Carrousel', en: 'Carousel' }, icon: Layers },
  { value: 'Video', label: { fr: 'Vidéo', en: 'Video' }, icon: Clapperboard },
  { value: 'Story', label: { fr: 'Story', en: 'Story' }, icon: Smartphone },
]

export const FORMAT_MAP = Object.fromEntries(FORMATS.map(f => [f.value, f])) as Record<ContentFormat, typeof FORMATS[number]>

// The format that suits a network, keeping the current one when it already fits.
const NETWORK_FORMATS: Record<string, ContentFormat[]> = {
  tiktok: ['Video'], youtube: ['Video'], instagram: ['Carousel', 'Story', 'Video', 'Post'],
  linkedin: ['Post', 'Carousel', 'Video'], whatsapp: ['Story', 'Post', 'Video'],
}

export function suggestedFormat(network: string, current: ContentFormat): ContentFormat {
  const fits = NETWORK_FORMATS[network]
  return !fits || fits.includes(current) ? current : fits[0]
}

// Small row of network icons, with "+n" past `max`.
export function ChannelIcons({ channels, max = 3, className }: { channels: string[]; max?: number; className?: string }) {
  const known = channels.map(c => CHANNEL_MAP[c]).filter((c): c is ChannelDefinition => Boolean(c))
  const shown = known.slice(0, max)
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      {shown.map(c => <c.icon key={c.value} className="h-3 w-3 shrink-0" title={c.label} style={{ color: c.color }} />)}
      {known.length > max && <span className="text-[10px] font-bold leading-none">+{known.length - max}</span>}
    </span>
  )
}
