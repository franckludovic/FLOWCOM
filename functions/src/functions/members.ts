import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions'
import { body, json, options } from '../shared/http.js'
import { getEntraObjectId } from '../shared/auth.js'
import { assertCompanyAccess, createProfile, profileByEmail, updateProfileIdentity, upsertCompanyMembership, type CompanyRole } from '../shared/dataverse.js'
import { inviteEntraUser } from '../shared/graph.js'

type InviteRequest = { companyId?: unknown; email?: unknown; role?: unknown }

async function inviteMember(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') return options()
  try {
    const caller = getEntraObjectId(request)
    const input = await body<InviteRequest>(request)
    const companyId = typeof input.companyId === 'string' ? input.companyId : ''
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
    const role = input.role as CompanyRole
    if (!companyId || !email || !email.includes('@')) return json({ error: 'Company and valid email are required' }, 400)
    if (!['admin', 'editor', 'viewer'].includes(role)) return json({ error: 'Invalid member role' }, 400)
    await assertCompanyAccess(caller, companyId, true)

    const existing = await profileByEmail(email)
    const invited = existing?.entraObjectId ? { id: existing.entraObjectId, displayName: undefined } : await inviteEntraUser(email)
    let profileId: string
    if (existing?.id) {
      profileId = existing.id
      if (!existing.entraObjectId) await updateProfileIdentity(profileId, invited.id)
    } else {
      profileId = await createProfile({ entraObjectId: invited.id, name: invited.displayName ?? '', email })
    }
    await upsertCompanyMembership(companyId, profileId, role)
    return json({ invited: true, userId: invited.id, role })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invitation failed' }, 400)
  }
}

app.http('inviteMember', { methods: ['POST', 'OPTIONS'], authLevel: 'anonymous', route: 'members/invite', handler: inviteMember })
