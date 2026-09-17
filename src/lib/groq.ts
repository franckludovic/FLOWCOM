import Groq from 'groq-sdk'

export type GroqMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function callGroq(
  apiKey: string,
  messages: GroqMessage[],
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const client = new Groq({ apiKey, dangerouslyAllowBrowser: true })

  const response = await client.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 2048,
  })

  return response.choices[0]?.message?.content ?? ''
}

export async function callGroqJSON<T>(
  apiKey: string,
  messages: GroqMessage[],
  options?: { temperature?: number; max_tokens?: number }
): Promise<T> {
  const client = new Groq({ apiKey, dangerouslyAllowBrowser: true })

  const response = await client.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages,
    temperature: options?.temperature ?? 0.5,
    max_tokens: options?.max_tokens ?? 4096,
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error('AI returned invalid JSON')
  }
}

export function buildGroqError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('429') || msg.includes('rate limit')) return 'error.429'
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key')) return 'error.invalidKey'
    if (msg.includes('network') || msg.includes('fetch')) return 'error.network'
    if (msg.includes('no such model') || msg.includes('model')) return 'error.noModel'
  }
  return 'error.generic'
}
