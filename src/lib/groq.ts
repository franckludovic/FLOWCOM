import { supabase } from './supabase'

export type GroqMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type GroqOptions = {
  temperature?: number
  max_tokens?: number
  requiredKeys?: string[]
  json?: boolean
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateGroqJSON(value: unknown, requiredKeys: string[] = []): boolean {
  if (!isPlainRecord(value)) return false
  if (requiredKeys.some(key => !(key in value))) return false
  return Object.values(value).every(item => {
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) return true
    if (Array.isArray(item)) return item.every(entry => entry !== null && ['string', 'number', 'boolean'].includes(typeof entry) || isPlainRecord(entry))
    return isPlainRecord(item)
  })
}

export async function callGroq(
  _apiKey: string,
  messages: GroqMessage[],
  options?: GroqOptions
): Promise<string> {
  const { data } = await invokeGroq({ messages, options })
  return data?.content ?? ''
}

export async function callGroqJSON<T>(
  _apiKey: string,
  messages: GroqMessage[],
  options?: GroqOptions
): Promise<T> {
  const { data } = await invokeGroq({ messages, options: { ...options, json: true } })

  const raw = data?.content ?? '{}'
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!validateGroqJSON(parsed, options?.requiredKeys)) throw new Error('AI returned incomplete JSON')
    return parsed as T
  } catch {
    throw new Error('AI returned invalid or incomplete JSON')
  }
}

async function invokeGroq(body: { messages: GroqMessage[]; options?: GroqOptions }) {
  const request = supabase.functions.invoke<{ content?: string; error?: string }>('groq', { body })
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('AI request timed out')), 30000)
  })
  const result = await Promise.race([request, timeout])
  if (result.error) {
    const context = (result.error as { context?: { json?: () => Promise<{ error?: string }> } }).context
    const details = context?.json ? await context.json().catch(() => null) : null
    throw new Error(details?.error ?? result.error.message)
  }
  if (result.data?.error) throw new Error(result.data.error)
  return result
}

export function buildGroqError(err: unknown): string {
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
