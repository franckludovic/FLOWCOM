import { ModelCallService } from '@/generated/services/ModelCallService'
import { DEFAULT_MODEL_PROVIDER } from './integrations'

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ModelOptions = {
  model?: string
  temperature?: number
  max_tokens?: number
  requiredKeys?: string[]
  json?: boolean
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateModelJSON(value: unknown, requiredKeys: string[] = []): boolean {
  if (!isPlainRecord(value)) return false
  if (requiredKeys.some(key => !(key in value))) return false
  return Object.values(value).every(item => {
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) return true
    if (Array.isArray(item)) return item.every(entry => entry !== null && ['string', 'number', 'boolean'].includes(typeof entry) || isPlainRecord(entry))
    return isPlainRecord(item)
  })
}

export async function callModel(
  companyId: string,
  messages: ModelMessage[],
  options?: ModelOptions
): Promise<string> {
  const { data } = await invokeModel({ companyId, messages, options })
  return data?.content ?? ''
}

export async function callModelJSON<T>(
  companyId: string,
  messages: ModelMessage[],
  options?: ModelOptions
): Promise<T> {
  const { data } = await invokeModel({ companyId, messages, options: { ...options, json: true } })

  const raw = data?.content ?? '{}'
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!validateModelJSON(parsed, options?.requiredKeys)) throw new Error('AI returned incomplete JSON')
    return parsed as T
  } catch {
    throw new Error('AI returned invalid or incomplete JSON')
  }
}

async function invokeModel(body: { companyId: string; messages: ModelMessage[]; options?: ModelOptions }) {
  const options = body.options ?? {}
  const request = ModelCallService.Run({
    text: body.companyId,
    text_1: DEFAULT_MODEL_PROVIDER.secretName,
    text_2: options.model ?? 'openai/gpt-oss-120b',
    text_3: JSON.stringify(body.messages),
    text_4: String(options.temperature ?? 0.7),
    text_5: String(options.max_tokens ?? 2048),
  })
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('AI request timed out')), 30000)
  })
  const result = await Promise.race([request, timeout])
  if (!result.success) {
    const message = result.error instanceof Error
      ? result.error.message
      : result.error
        ? String(result.error)
        : 'AI request failed'
    throw new Error(message)
  }

  const content = result.data?.content ?? ''
  if (content === 'No API key was found for this company and provider.') {
    throw new Error('No API key configured')
  }
  return { data: { content } }
}

export function buildModelError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('429') || msg.includes('rate limit')) return 'error.429'
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key')) return 'error.invalidKey'
    if (msg.includes('no api key configured')) return 'error.noKey'
    if (msg.includes('timed out') || msg.includes('timeout')) return 'error.network'
    if (msg.includes('invalid or incomplete json')) return 'error.generic'
    if (msg.includes('network') || msg.includes('fetch')) return 'error.network'
    if (msg.includes('no such model') || msg.includes('model')) return 'error.noModel'
  }
  return 'error.generic'
}
