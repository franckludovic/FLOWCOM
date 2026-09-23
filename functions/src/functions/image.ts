import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions'
import { body, json, options } from '../shared/http.js'
import { getEntraObjectId } from '../shared/auth.js'
import { getProviderSecret } from '../shared/keyVault.js'

type ImageRequest = { prompt?: unknown; seed?: unknown }

async function generateImage(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options()
  try {
    getEntraObjectId(request)
    const input = await body<ImageRequest>(request)
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
    if (!prompt) return json({ error: 'A prompt is required' }, 400)
    if (prompt.length > 2000) return json({ error: 'Prompt is too long' }, 400)

    const token = await getProviderSecret('keyvault:flowcom-huggingface')
    const seed = Number.isInteger(input.seed) ? input.seed : undefined
    const response = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4, ...(seed === undefined ? {} : { seed }) } }),
    })
    if (!response.ok) {
      const details = await response.text()
      let message = 'Image generation failed'
      try { message = (JSON.parse(details) as { error?: string }).error ?? message } catch { if (details) message = details.slice(0, 300) }
      return json({ error: message }, response.status)
    }
    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    return { status: 200, body: await response.arrayBuffer(), headers: { 'content-type': 'application/octet-stream', 'x-image-content-type': contentType, 'cache-control': 'no-store' } }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Image generation failed' }, 400)
  }
}

app.http('generateImage', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'providers/image', handler: generateImage })
