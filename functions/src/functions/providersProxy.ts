import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions'
import { body, json, options } from '../shared/http.js'
import { getEntraObjectId } from '../shared/auth.js'
import { assertCompanyAccess, integrationSecret } from '../shared/dataverse.js'
import { getProviderSecret } from '../shared/keyVault.js'

type GroqRequest = { companyId?: string; messages?: unknown[]; options?: { temperature?: number; max_tokens?: number; json?: boolean }; status?: boolean }
type BufferRequest = { companyId?: string; query?: string; variables?: Record<string, unknown> }

async function groq(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options()
  try {
    const caller = getEntraObjectId(request)
    const input = await body<GroqRequest>(request)
    if (!input.companyId) return json({ error: 'Company ID is required' }, 400)
    await assertCompanyAccess(caller, input.companyId)
    if (input.status) return json({ configured: true })
    if (!Array.isArray(input.messages) || !input.messages.length) return json({ error: 'Messages are required' }, 400)
    const reference = await integrationSecret(input.companyId, 'groq')
    const apiKey = await getProviderSecret(reference)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: input.messages, temperature: input.options?.temperature ?? 0.7, max_tokens: input.options?.max_tokens ?? 2048, ...(input.options?.json ? { response_format: { type: 'json_object' } } : {}) }),
    })
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    if (!response.ok) return json({ error: result.error?.message ?? 'Groq request failed' }, response.status)
    return json({ content: result.choices?.[0]?.message?.content ?? '' })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Groq request failed' }, 400)
  }
}

async function buffer(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options()
  try {
    const caller = getEntraObjectId(request)
    const input = await body<BufferRequest>(request)
    if (!input.companyId || !input.query) return json({ error: 'Company ID and GraphQL query are required' }, 400)
    await assertCompanyAccess(caller, input.companyId)
    const reference = await integrationSecret(input.companyId, 'buffer')
    const token = await getProviderSecret(reference)
    const response = await fetch('https://api.buffer.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input.query, variables: input.variables }),
    })
    return json(await response.json(), response.status)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Buffer request failed' }, 400)
  }
}

app.http('groqProxy', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'providers/groq', handler: groq })
app.http('bufferProxy', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'providers/buffer', handler: buffer })
