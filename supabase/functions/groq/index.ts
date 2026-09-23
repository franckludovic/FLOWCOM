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
  companyId?: string
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

  let body: RequestBody
  try {
    body = await request.json() as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  if ((body as RequestBody & { status?: boolean }).status) {
    let configured = Boolean(profile?.api_key)
    if (!configured) {
      const { data: memberships } = await admin
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
      const companyIds = (memberships ?? []).map(row => row.company_id)
      if (companyIds.length) {
        const { data: companySecrets } = await admin
          .from('company_integration_secrets')
          .select('company_id')
          .eq('provider', 'groq')
          .in('company_id', companyIds)
          .limit(1)
        configured = Boolean(companySecrets?.length)
      }
    }
    return jsonResponse({ configured })
  }

  let apiKey = profile?.api_key ?? null
  if (body.companyId) {
    const { data: membership } = await admin
      .from('company_members')
      .select('company_id')
      .eq('company_id', body.companyId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) return jsonResponse({ error: 'You do not have access to this company' }, 403)

    const { data: companySecret } = await admin
      .from('company_integration_secrets')
      .select('access_token')
      .eq('company_id', body.companyId)
      .eq('provider', 'groq')
      .maybeSingle()
    apiKey = companySecret?.access_token ?? apiKey
  }
  if (!apiKey) return jsonResponse({ error: 'No API key configured' }, 400)

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse({ error: 'Messages are required' }, 400)
  }

  const completion = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
