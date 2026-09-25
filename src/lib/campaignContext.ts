import { useEffect, useState } from 'react'
import type { AudienceSegment, KeyMessage } from '@/types'
import { listCampaigns, type Campaign, type CampaignChannel } from './campaigns'
import { describeZone, listPlaces, listZones, type Place, type Zone } from './geo'

// Shared campaign logic for the screens that produce content (Studio, Content
// Generator, Calendar), so a chosen campaign steers them all the same way.

const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', x: 'X', whatsapp: 'WhatsApp', google: 'Google',
}

// Campaign channel → channel value used by the Content Generator and Calendar.
export const CONTENT_CHANNEL: Partial<Record<CampaignChannel, string>> = {
  facebook: 'facebook', instagram: 'instagram', linkedin: 'linkedin', tiktok: 'tiktok', x: 'twitter', whatsapp: 'whatsapp',
}

// Campaign channel → Buffer channel services.
const BUFFER_SERVICES: Record<CampaignChannel, string[]> = {
  facebook: ['facebook'], instagram: ['instagram'], linkedin: ['linkedin'], tiktok: ['tiktok'],
  x: ['twitter', 'x'], whatsapp: [], google: ['googlebusiness', 'google'],
}

export function bufferChannelMatchesCampaign(service: string, campaign: Campaign): boolean {
  const s = service.toLowerCase()
  return campaign.channels.some(ch => BUFFER_SERVICES[ch].includes(s))
}

// Campaigns that content can still be produced for, plus a zone description per campaign.
export function useCampaignOptions(companyId: string | undefined) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [places, setPlaces] = useState<Place[]>([])

  useEffect(() => {
    if (!companyId) { setCampaigns([]); return }
    let alive = true
    Promise.all([listCampaigns(companyId), listZones(companyId), listPlaces(companyId)])
      .then(([list, zoneList, placeList]) => {
        if (!alive) return
        setCampaigns(list.filter(c => !['completed', 'cancelled'].includes(c.status)))
        setZones(zoneList)
        setPlaces(placeList)
      })
      .catch(() => { if (alive) setCampaigns([]) })
    return () => { alive = false }
  }, [companyId])

  const zoneLabel = (campaign: Campaign | undefined) => {
    const zone = campaign?.zone_id ? zones.find(z => z.id === campaign.zone_id) : undefined
    return zone ? `${zone.name}: ${describeZone(zone, places)}` : ''
  }

  return { campaigns, zoneLabel }
}

// Campaign facts for AI prompts. Every screen passes the same block, so the
// brief, generated posts and pre-publish checks all follow the campaign.
export function buildCampaignContext(campaign: Campaign, { segments, keyMessages, zoneLabel }: {
  segments: AudienceSegment[]
  keyMessages: KeyMessage[]
  zoneLabel: string
}): string {
  const segment = segments.find(s => s.id === campaign.segment_id)
  const keyMessage = keyMessages.find(k => k.id === campaign.key_message_id)
  return [
    `Campaign: ${campaign.name}`,
    `Objective: ${campaign.objective}`,
    `Period: ${campaign.start_date || 'not set'} to ${campaign.end_date || 'not set'}`,
    `Channels: ${campaign.channels.map(ch => CHANNEL_LABELS[ch]).join(', ') || 'not set'}`,
    `Target audience: ${segment ? `${segment.name} (pain points: ${segment.pain_points}; interests: ${segment.interests})` : 'not set'}`,
    `Key message: ${keyMessage?.content ?? 'not set'}`,
    `Target zone: ${zoneLabel || 'not set (no geographic restriction)'}`,
    `Targets: reach ${campaign.target_reach ?? 'not set'}, leads ${campaign.target_leads ?? 'not set'}`,
    'Type: organic (no paid advertising)',
    campaign.brief.trim() ? `Campaign brief:\n${campaign.brief.trim()}` : '',
  ].filter(Boolean).join('\n')
}

// Reasons to double-check before producing content for a campaign.
export function campaignWarnings(campaign: Campaign, lang: 'fr' | 'en', onDate = new Date().toISOString().slice(0, 10)): string[] {
  const fr = lang === 'fr'
  const warnings: string[] = []
  if (campaign.status === 'paused') warnings.push(fr ? 'Cette campagne est en pause.' : 'This campaign is paused.')
  if (campaign.status === 'draft') warnings.push(fr ? 'Cette campagne est encore un brouillon.' : 'This campaign is still a draft.')
  if (campaign.start_date && onDate < campaign.start_date) warnings.push(fr ? `La campagne commence le ${campaign.start_date}.` : `The campaign starts on ${campaign.start_date}.`)
  if (campaign.end_date && onDate > campaign.end_date) warnings.push(fr ? `La campagne s'est terminée le ${campaign.end_date}.` : `The campaign ended on ${campaign.end_date}.`)
  return warnings
}

// Adds UTM parameters to every link in a post so visits (and later CRM leads)
// can be attributed to the campaign. Links that already carry utm_campaign are left alone.
export function addUtm(text: string, trackingCode: string, source: string): string {
  if (!trackingCode.trim()) return text
  return text.replace(/https?:\/\/[^\s<>"')\]]+/g, url => {
    const trailing = url.match(/[.,;:!?]+$/)?.[0] ?? ''
    const clean = trailing ? url.slice(0, -trailing.length) : url
    if (/[?&]utm_campaign=/.test(clean)) return url
    const [base, hash] = clean.split('#')
    const params = `utm_source=${encodeURIComponent(source)}&utm_medium=social&utm_campaign=${encodeURIComponent(trackingCode.trim())}`
    return `${base}${base.includes('?') ? '&' : '?'}${params}${hash !== undefined ? `#${hash}` : ''}${trailing}`
  })
}
