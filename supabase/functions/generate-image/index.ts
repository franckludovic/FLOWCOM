import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const getAuthenticatedUser = async (request: Request) => {
  const authorization = request.headers.get('Authorization')
  if (!authorization) return null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401)

    const hfToken = Deno.env.get('HF_ACCESS_TOKEN')
    if (!hfToken) return jsonResponse({ error: 'Image generation is not configured' }, 503)

    const body = await request.json() as { prompt?: unknown; seed?: unknown }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) return jsonResponse({ error: 'A prompt is required' }, 400)
    if (prompt.length > 2000) return jsonResponse({ error: 'Prompt is too long' }, 400)

    const seed = Number.isInteger(body.seed) ? body.seed : undefined
    const response = await fetch(
      'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            num_inference_steps: 4,
            ...(seed === undefined ? {} : { seed }),
          },
        }),
      },
    )

    if (!response.ok) {
      const details = await response.text()
      let message = 'Image generation failed'
      try {
        const parsed = JSON.parse(details) as { error?: string }
        message = parsed.error ?? message
      } catch {
        if (details) message = details.slice(0, 300)
      }
      return jsonResponse({ error: message }, response.status)
    }

    const contentType = response.headers.get('Content-Type') ?? 'image/jpeg'
    return new Response(await response.arrayBuffer(), {
      status: 200,
      headers: {
        ...corsHeaders,
        // Supabase's client parses application/octet-stream responses as Blobs.
        'Content-Type': 'application/octet-stream',
        'X-Image-Content-Type': contentType,
        'Access-Control-Expose-Headers': 'X-Image-Content-Type',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected image generation error'
    return jsonResponse({ error: message }, 500)
  }
})
