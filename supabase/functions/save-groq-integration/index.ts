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

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return jsonResponse({ error: 'Not authenticated' }, 401)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  )
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return jsonResponse({ error: 'Not authenticated' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let body: { companyId?: unknown; accessToken?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  const companyId = typeof body.companyId === 'string' ? body.companyId : ''
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : ''
  if (!companyId || !accessToken) return jsonResponse({ error: 'Company and Groq key are required' }, 400)

  const { data: membership } = await admin
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return jsonResponse({ error: 'Only company owners or admins can configure Groq' }, 403)
  }

  const now = new Date().toISOString()
  const { error: metadataError } = await admin
    .from('company_integrations')
    .upsert({
      company_id: companyId,
      provider: 'groq',
      status: 'connected',
      updated_at: now,
    }, { onConflict: 'company_id,provider' })
  if (metadataError) return jsonResponse({ error: metadataError.message }, 500)

  const { error: secretError } = await admin
    .from('company_integration_secrets')
    .upsert({
      company_id: companyId,
      provider: 'groq',
      access_token: accessToken,
      updated_at: now,
    }, { onConflict: 'company_id,provider' })
  if (secretError) return jsonResponse({ error: secretError.message }, 500)

  return jsonResponse({ connected: true })
})
