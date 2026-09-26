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
  const attempt = async (maxTokens: number | undefined): Promise<T | null> => {
    const { data } = await invokeModel({ companyId, messages, options: { ...options, max_tokens: maxTokens, json: true } })
    try {
      const parsed: unknown = JSON.parse(data?.content ?? '{}')
      return validateModelJSON(parsed, options?.requiredKeys) ? parsed as T : null
    } catch {
      return null
    }
  }
  // Reasoning models spend part of the budget thinking, so an answer can come
  // back cut off. Try once more with twice the room before giving up.
  const first = await attempt(options?.max_tokens)
  if (first) return first
  const second = await attempt(Math.min(8192, (options?.max_tokens ?? 2048) * 2))
  if (second) return second
  throw new Error('AI returned invalid or incomplete JSON')
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

// ─── Tool calling (assistant) ─────────────────────────────────────────────────
// OpenAI-compatible chat messages, as sent to and returned by the provider.

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolDefinition {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

// One model turn with tools available. Returns the assistant message, which
// holds either text or tool calls for the caller to run.
export async function callModelWithTools(
  companyId: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  options: { model?: string; temperature?: number; max_tokens?: number; reasoning_effort?: 'low' | 'medium' | 'high' } = {},
): Promise<{ content: string; tool_calls: ToolCall[] }> {
  try {
    return await runToolTurn(companyId, messages, tools, options)
  } catch (err) {
    // Not every model accepts reasoning_effort; retry once without it.
    if (options.reasoning_effort && /reasoning/i.test(err instanceof Error ? err.message : String(err))) {
      return runToolTurn(companyId, messages, tools, { ...options, reasoning_effort: undefined })
    }
    throw err
  }
}

async function runToolTurn(
  companyId: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  options: { model?: string; temperature?: number; max_tokens?: number; reasoning_effort?: 'low' | 'medium' | 'high' },
): Promise<{ content: string; tool_calls: ToolCall[] }> {
  const request = ModelCallService.Run({
    text: companyId,
    text_1: DEFAULT_MODEL_PROVIDER.secretName,
    text_2: options.model ?? 'openai/gpt-oss-120b',
    text_3: JSON.stringify(messages),
    text_4: String(options.temperature ?? 0.3),
    text_5: String(options.max_tokens ?? 3000),
    text_6: JSON.stringify({ tools, tool_choice: 'auto', ...(options.reasoning_effort ? { reasoning_effort: options.reasoning_effort } : {}) }),
  })
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('AI request timed out')), 60000)
  })
  const result = await Promise.race([request, timeout])
  if (!result.success) {
    throw new Error(result.error instanceof Error ? result.error.message : String(result.error ?? 'AI request failed'))
  }
  const data = result.data ?? {}
  if (data.content === 'No API key was found for this company and provider.') throw new Error('No API key configured')
  if (data.error) throw new Error(data.error)
  let message: { content?: string | null; tool_calls?: ToolCall[] } = {}
  try {
    message = data.message ? JSON.parse(data.message) : {}
  } catch {
    message = {}
  }
  return { content: message.content ?? data.content ?? '', tool_calls: message.tool_calls ?? [] }
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
