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

  let body: { companyId?: unknown; email?: unknown; role?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  const companyId = typeof body.companyId === 'string' ? body.companyId : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body.role === 'string' ? body.role : 'editor'
  if (!companyId || !email || !email.includes('@')) return jsonResponse({ error: 'Company and valid email are required' }, 400)
  if (!['admin', 'editor', 'viewer'].includes(role)) return jsonResponse({ error: 'Invalid member role' }, 400)

  const { data: callerMembership } = await admin
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
    return jsonResponse({ error: 'Only company owners or admins can invite members' }, 403)
  }

  let memberId: string | undefined
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingProfile?.id) {
    memberId = existingProfile.id
  } else {
    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email)
    if (inviteError || !invitation.user) {
      return jsonResponse({ error: inviteError?.message ?? 'Unable to send invitation' }, 400)
    }
    memberId = invitation.user.id
    await admin.from('profiles').upsert({
      id: memberId,
      name: '',
      email,
      lang: 'fr',
    }, { onConflict: 'id' })
  }

  const { error: membershipError } = await admin
    .from('company_members')
    .upsert({ company_id: companyId, user_id: memberId, role }, { onConflict: 'company_id,user_id' })
  if (membershipError) return jsonResponse({ error: membershipError.message }, 400)

  return jsonResponse({ invited: true, userId: memberId, role })
})
