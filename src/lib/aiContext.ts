import type { AudienceSegment, Company, KeyMessage, Product } from '@/types'

interface AiContextInput {
  company: Company | null
  products: Product[]
  segments: AudienceSegment[]
  keyMessages: KeyMessage[]
}

export function buildAiContext({ company, products, segments, keyMessages }: AiContextInput): string {
  const lines: string[] = []

  if (company) {
    const companyFields: Array<[string, string | undefined]> = [
      ['Company', company.name],
      ['Industry', company.industry],
      ['Website', company.website],
      ['Location', company.location],
      ['Description', company.short_desc],
      ['Mission', company.mission],
      ['Vision', company.vision],
      ['Values', company.values],
      ['Tone of voice', company.tone],
      ['Objectives', company.targets],
      ['Channels', company.channels],
      ['Publishing frequency', company.frequency],
    ]

    for (const [label, value] of companyFields) {
      if (value?.trim()) lines.push(`${label}: ${value}`)
    }
  }

  if (products.length) {
    lines.push(`Products:\n${products.map(product => `- ${product.name}: ${product.description}`).join('\n')}`)
  }

  if (segments.length) {
    lines.push(`Target audience:\n${segments.map(segment => `- ${segment.name}; pain points: ${segment.pain_points}; interests: ${segment.interests}`).join('\n')}`)
  }

  if (keyMessages.length) {
    lines.push(`Key messages:\n${keyMessages.map(message => `- ${message.content}`).join('\n')}`)
  }

  return lines.join('\n') || 'No company context has been configured yet.'
}
