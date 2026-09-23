import { DefaultAzureCredential } from '@azure/identity'
import { requiredSetting } from './config.js'

type DataverseResponse<T> = { value?: T[] }

const providerValue = { buffer: 122370000, groq: 122370001 } as const
const statusValue = { connected: 122370000, disabled: 122370001, error: 122370002 } as const

let credential: DefaultAzureCredential | undefined

function escapeOData(value: string): string {
  return value.replace(/'/g, "''")
}

function assertGuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a valid Dataverse ID`)
  }
}

function dataverseUrl(): string {
  return requiredSetting('DATAVERSE_URL')
}

async function accessToken(): Promise<string> {
  credential ??= new DefaultAzureCredential()
  const token = await credential.getToken(`${dataverseUrl()}/.default`)
  if (!token?.token) throw new Error('Unable to obtain a Dataverse access token')
  return token.token
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${dataverseUrl()}/api/data/v9.2/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      Accept: 'application/json',
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) throw new Error(`Dataverse request failed (${response.status}): ${await response.text()}`)
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

async function profileIdForUser(objectId: string): Promise<string> {
  const filter = encodeURIComponent(`fc_entrauserid eq '${escapeOData(objectId)}'`)
  const result = await request<DataverseResponse<{ fc_flowcomprofileid: string }>>(`fc_flowcomprofiles?$select=fc_flowcomprofileid&$filter=${filter}&$top=1`)
  const profileId = result.value?.[0]?.fc_flowcomprofileid
  if (!profileId) throw new Error('No FlowCom profile exists for the signed-in Entra user')
  return profileId
}

export async function assertCompanyAccess(objectId: string, companyId: string, adminOnly = false): Promise<void> {
  assertGuid(companyId, 'Company ID')
  const profileId = await profileIdForUser(objectId)
  const filter = encodeURIComponent(`_fc_company_value eq ${companyId} and _fc_profile_value eq ${profileId}`)
  const result = await request<DataverseResponse<{ fc_role: number }>>(`fc_companymemberships?$select=fc_role&$filter=${filter}&$top=1`)
  const role = result.value?.[0]?.fc_role
  if (role === undefined || (adminOnly && role !== 122370000 && role !== 122370001)) {
    throw new Error(adminOnly ? 'Only company owners or admins can configure integrations' : 'You do not have access to this company')
  }
}

export async function profileByEmail(email: string): Promise<{ id: string; entraObjectId?: string } | null> {
  const filter = encodeURIComponent(`fc_email eq '${escapeOData(email)}'`)
  const result = await request<DataverseResponse<{ fc_flowcomprofileid: string; fc_entrauserid?: string }>>(
    `fc_flowcomprofiles?$select=fc_flowcomprofileid,fc_entrauserid&$filter=${filter}&$top=1`,
  )
  const profile = result.value?.[0]
  return profile?.fc_flowcomprofileid ? { id: profile.fc_flowcomprofileid, entraObjectId: profile.fc_entrauserid } : null
}

export async function createProfile(input: { entraObjectId: string; name: string; email: string }): Promise<string> {
  const created = await request<{ fc_flowcomprofileid?: string }>('fc_flowcomprofiles', {
    method: 'POST',
    body: JSON.stringify({ fc_entrauserid: input.entraObjectId, fc_name: input.name, fc_email: input.email, fc_language: 'fr' }),
  })
  if (!created?.fc_flowcomprofileid) throw new Error('Dataverse did not return the new profile ID')
  return created.fc_flowcomprofileid
}

export async function updateProfileIdentity(profileId: string, entraObjectId: string): Promise<void> {
  assertGuid(profileId, 'Profile ID')
  await request(`fc_flowcomprofiles(${profileId})`, {
    method: 'PATCH',
    body: JSON.stringify({ fc_entrauserid: entraObjectId }),
  })
}

const roleValue = { owner: 122370000, admin: 122370001, editor: 122370002, viewer: 122370003 } as const
export type CompanyRole = keyof typeof roleValue

export async function upsertCompanyMembership(companyId: string, profileId: string, role: CompanyRole): Promise<void> {
  assertGuid(companyId, 'Company ID')
  assertGuid(profileId, 'Profile ID')
  const filter = encodeURIComponent(`_fc_company_value eq ${companyId} and _fc_profile_value eq ${profileId}`)
  const existing = await request<DataverseResponse<{ fc_companymembershipid: string }>>(
    `fc_companymemberships?$select=fc_companymembershipid&$filter=${filter}&$top=1`,
  )
  const record = {
    'fc_Company@odata.bind': `/fc_companies(${companyId})`,
    'fc_Profile@odata.bind': `/fc_flowcomprofiles(${profileId})`,
    fc_role: roleValue[role],
  }
  const id = existing.value?.[0]?.fc_companymembershipid
  if (id) await request(`fc_companymemberships(${id})`, { method: 'PATCH', body: JSON.stringify(record) })
  else await request('fc_companymemberships', { method: 'POST', body: JSON.stringify(record) })
}

export async function saveIntegration(companyId: string, provider: keyof typeof providerValue, secretReference: string, externalAccountId?: string, externalAccountName?: string): Promise<void> {
  const providerChoice = providerValue[provider]
  const filter = encodeURIComponent(`_fc_company_value eq ${companyId} and fc_provider eq ${providerChoice}`)
  const existing = await request<DataverseResponse<{ fc_companyintegrationid: string }>>(`fc_companyintegrations?$select=fc_companyintegrationid&$filter=${filter}&$top=1`)
  const record = {
    'fc_Company@odata.bind': `/fc_companies(${companyId})`,
    fc_provider: providerChoice,
    fc_status: statusValue.connected,
    fc_secretreference: secretReference,
    fc_externalaccountid: externalAccountId,
    fc_externalaccountname: externalAccountName,
  }
  if (existing.value?.[0]?.fc_companyintegrationid) {
    await request(`fc_companyintegrations(${existing.value[0].fc_companyintegrationid})`, { method: 'PATCH', body: JSON.stringify(record) })
  } else {
    await request('fc_companyintegrations', { method: 'POST', body: JSON.stringify(record) })
  }
}

export async function integrationSecret(companyId: string, provider: keyof typeof providerValue): Promise<string> {
  const filter = encodeURIComponent(`_fc_company_value eq ${companyId} and fc_provider eq ${providerValue[provider]} and fc_status eq ${statusValue.connected}`)
  const result = await request<DataverseResponse<{ fc_secretreference?: string }>>(`fc_companyintegrations?$select=fc_secretreference&$filter=${filter}&$top=1`)
  const reference = result.value?.[0]?.fc_secretreference
  if (!reference) throw new Error(`${provider} is not connected for this company`)
  return reference
}
