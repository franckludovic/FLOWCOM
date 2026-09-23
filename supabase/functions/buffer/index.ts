/**
 * Supabase Edge Function - Buffer GraphQL proxy
 *
 * Forwards authenticated GraphQL requests to api.buffer.com so the
 * VITE_BUFFER_API_KEY never needs to be exposed in the browser bundle
 * and the Vite dev proxy is not needed in production.
 *
 * The Buffer token is stored per company in company_integration_secrets.
 */

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
  // CORS preflight
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  // Verify the caller is an authenticated FlowCom user
  const authorization = request.headers.get('Authorization')
  if (!authorization) return jsonResponse({ error: 'Not authenticated' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  )
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return jsonResponse({ error: 'Not authenticated' }, 401)

  // Parse and validate the incoming GraphQL body
  let body: { companyId?: unknown; query: string; variables?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }
  if (!body.query || typeof body.query !== 'string') {
    return jsonResponse({ error: 'Missing GraphQL query' }, 400)
  }
  if (typeof body.companyId !== 'string' || !body.companyId) {
    return jsonResponse({ error: 'Missing company ID' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const { data: membership } = await admin
    .from('company_members')
    .select('company_id')
    .eq('company_id', body.companyId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return jsonResponse({ error: 'You do not have access to this company' }, 403)

  const { data: integration } = await admin
    .from('company_integrations')
    .select('external_account_id, status')
    .eq('company_id', body.companyId)
    .eq('provider', 'buffer')
    .maybeSingle()
  const { data: secret } = await admin
    .from('company_integration_secrets')
    .select('access_token')
    .eq('company_id', body.companyId)
    .eq('provider', 'buffer')
    .maybeSingle()
  if (!integration || integration.status !== 'connected' || !secret?.access_token) {
    return jsonResponse({ error: 'Buffer is not connected for this company' }, 409)
  }

  const requestedOrganizationId = body.variables?.input && typeof body.variables.input === 'object'
    ? (body.variables.input as { organizationId?: unknown }).organizationId
    : undefined
  if (requestedOrganizationId && requestedOrganizationId !== integration.external_account_id) {
    return jsonResponse({ error: 'Buffer organization does not belong to this company' }, 403)
  }

  // Forward to Buffer's GraphQL API
  const bufferResponse = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: body.query, variables: body.variables }),
  })

  const result = await bufferResponse.json()
  return jsonResponse(result, bufferResponse.ok ? 200 : bufferResponse.status)
})
