import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Message = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type RequestBody = {
  messages: Message[]
  options?: {
    temperature?: number
    max_tokens?: number
    json?: boolean
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return jsonResponse({ error: 'Not authenticated' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return jsonResponse({ error: 'Not authenticated' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('api_key')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.api_key) return jsonResponse({ error: 'No API key configured' }, 400)

  let body: RequestBody
  try {
    body = await request.json() as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  if ((body as RequestBody & { status?: boolean }).status) {
    return jsonResponse({ configured: Boolean(profile.api_key) })
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse({ error: 'Messages are required' }, 400)
  }

  const completion = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${profile.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: body.messages,
      temperature: body.options?.temperature ?? 0.7,
      max_tokens: body.options?.max_tokens ?? 2048,
      ...(body.options?.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  const result = await completion.json()
  if (!completion.ok) return jsonResponse({ error: result?.error?.message ?? 'Groq request failed' }, completion.status)

  return jsonResponse({ content: result.choices?.[0]?.message?.content ?? '' })
})
