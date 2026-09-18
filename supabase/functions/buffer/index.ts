/**
 * Supabase Edge Function — Buffer GraphQL proxy
 *
 * Forwards authenticated GraphQL requests to api.buffer.com so the
 * VITE_BUFFER_API_KEY never needs to be exposed in the browser bundle
 * and the Vite dev proxy is not needed in production.
 *
 * Required Supabase secret (set via `supabase secrets set`):
 *   BUFFER_API_KEY=<your Buffer personal or app token>
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

  // Read Buffer API key from Supabase secrets (never exposed to the browser)
  const bufferToken = Deno.env.get('BUFFER_API_KEY')
  if (!bufferToken) return jsonResponse({ error: 'Buffer API key not configured on server' }, 500)

  // Parse and validate the incoming GraphQL body
  let body: { query: string; variables?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }
  if (!body.query || typeof body.query !== 'string') {
    return jsonResponse({ error: 'Missing GraphQL query' }, 400)
  }

  // Forward to Buffer's GraphQL API
  const bufferResponse = await fetch('https://api.buffer.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bufferToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: body.query, variables: body.variables }),
  })

  const result = await bufferResponse.json()
  return jsonResponse(result, bufferResponse.ok ? 200 : bufferResponse.status)
})
