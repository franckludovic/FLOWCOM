import { DefaultAzureCredential } from '@azure/identity'
import { requiredSetting } from './config.js'

let credential: DefaultAzureCredential | undefined

async function accessToken(): Promise<string> {
  credential ??= new DefaultAzureCredential()
  const token = await credential.getToken('https://graph.microsoft.com/.default')
  if (!token?.token) throw new Error('Unable to obtain a Microsoft Graph access token')
  return token.token
}

export async function inviteEntraUser(email: string): Promise<{ id: string; displayName?: string }> {
  const response = await fetch('https://graph.microsoft.com/v1.0/invitations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invitedUserEmailAddress: email,
      inviteRedirectUrl: requiredSetting('INVITATION_REDIRECT_URL'),
      sendInvitationMessage: true,
    }),
  })
  const result = await response.json() as { invitedUser?: { id?: string; displayName?: string }; error?: { message?: string } }
  if (!response.ok || !result.invitedUser?.id) throw new Error(result.error?.message ?? 'Unable to invite the user')
  return { id: result.invitedUser.id, displayName: result.invitedUser.displayName }
}
