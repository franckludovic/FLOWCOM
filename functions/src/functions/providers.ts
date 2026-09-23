import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { body, json, options } from '../shared/http.js'
import { getEntraObjectId } from '../shared/auth.js'
import { assertCompanyAccess, saveIntegration } from '../shared/dataverse.js'
import { setProviderSecret } from '../shared/keyVault.js'

type IntegrationRequest = { companyId?: string; accessToken?: string }

async function connectGroq(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options()
  try {
    const caller = getEntraObjectId(request)
    const input = await body<IntegrationRequest>(request)
    if (!input.companyId || !input.accessToken?.startsWith('gsk_')) return json({ error: 'Company and a valid Groq key are required' }, 400)
    await assertCompanyAccess(caller, input.companyId, true)
    const reference = await setProviderSecret(`flowcom-${input.companyId}-groq`, input.accessToken)
    await saveIntegration(input.companyId, 'groq', reference)
    return json({ connected: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to connect Groq' }, 400)
  }
}

async function connectBuffer(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options()
  try {
    const caller = getEntraObjectId(request)
    const input = await body<IntegrationRequest>(request)
    if (!input.companyId || !input.accessToken) return json({ error: 'Company and Buffer token are required' }, 400)
    await assertCompanyAccess(caller, input.companyId, true)

    const response = await fetch('https://api.buffer.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ account { organizations { id name } } }' }),
    })
    const result = await response.json() as { data?: { account?: { organizations?: Array<{ id?: string; name?: string }> } }; errors?: Array<{ message?: string }> }
    const organization = result.data?.account?.organizations?.[0]
    if (!response.ok || result.errors?.length || !organization?.id) return json({ error: result.errors?.[0]?.message ?? 'No Buffer organization found for this token' }, 400)

    const reference = await setProviderSecret(`flowcom-${input.companyId}-buffer`, input.accessToken)
    await saveIntegration(input.companyId, 'buffer', reference, organization.id, organization.name)
    return json({ connected: true, organizationId: organization.id, organizationName: organization.name ?? null })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unable to connect Buffer' }, 400)
  }
}

app.http('connectGroq', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'integrations/groq', handler: connectGroq })
app.http('connectBuffer', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'integrations/buffer', handler: connectBuffer })
