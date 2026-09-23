import { DefaultAzureCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'
import { requiredSetting } from './config.js'

let client: SecretClient | undefined

function getClient(): SecretClient {
  client ??= new SecretClient(requiredSetting('KEY_VAULT_URL'), new DefaultAzureCredential())
  return client
}

export async function setProviderSecret(secretName: string, value: string): Promise<string> {
  await getClient().setSecret(secretName, value)
  return `keyvault:${secretName}`
}

export async function getProviderSecret(secretReference: string): Promise<string> {
  const prefix = 'keyvault:'
  const secretName = secretReference.startsWith(prefix) ? secretReference.slice(prefix.length) : secretReference
  const secret = await getClient().getSecret(secretName)
  if (!secret.value) throw new Error('Provider secret is empty or unavailable')
  return secret.value
}
