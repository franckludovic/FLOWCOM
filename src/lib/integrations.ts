import type { TranslationKey } from '@/i18n/fr'
import { SaveCompanySecretService } from '@/generated/services/SaveCompanySecretService'

// Registry of every external service a company can connect. The UI is built
// around roles (AI model, social publishing); providers are interchangeable
// options inside a role. To add a provider, append it to the role's
// `providers` list. To add a role, add an entry here, its translations, and a
// status/save handler in the Settings page.

export type IntegrationId = 'model' | 'publishing'
export type ProviderId = 'groq' | 'buffer'

export interface ProviderOption {
  id: ProviderId
  label: string
  // Provider name as stored in the Company Secrets "Provider" choice.
  secretName: string
  placeholder: string
  helpUrl?: string
  // Returns true when the key has the shape this provider issues.
  validate?: (key: string) => boolean
}

export interface IntegrationDefinition {
  id: IntegrationId
  nameKey: TranslationKey
  descKey: TranslationKey
  providers: ProviderOption[]
}

export const MODEL_PROVIDERS: ProviderOption[] = [
  {
    id: 'groq',
    label: 'Groq',
    secretName: 'Groq',
    placeholder: 'gsk_…',
    helpUrl: 'https://console.groq.com/keys',
    validate: key => key.startsWith('gsk_'),
  },
]

export const DEFAULT_MODEL_PROVIDER = MODEL_PROVIDERS[0]

// Model the assistant uses for multi-step tool calling. Chosen for reliable
// tool use on the current provider; change it here (or add a provider branch
// in the ModelCall flow, e.g. for Claude) to upgrade the assistant.
export const ASSISTANT_MODEL = 'openai/gpt-oss-120b'

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: 'model',
    nameKey: 'settings.model.name',
    descKey: 'settings.model.desc',
    providers: MODEL_PROVIDERS,
  },
  {
    id: 'publishing',
    nameKey: 'settings.publishing.name',
    descKey: 'settings.publishing.desc',
    providers: [
      { id: 'buffer', label: 'Buffer', secretName: 'Buffer', placeholder: '••••••••' },
    ],
  },
]

// Sends a provider secret to the SaveCompanySecret flow, which stores it in the
// column-secured Company Secrets table. `providerName` must match a Provider choice.
export async function saveCompanySecret(companyId: string, providerName: string, secret: string): Promise<void> {
  const result = await SaveCompanySecretService.Run({ text: companyId, text_1: providerName, text_2: secret })
  if (!result.success) {
    const message = result.error instanceof Error
      ? result.error.message
      : result.error
        ? String(result.error)
        : 'Unable to save the company secret'
    throw new Error(message)
  }
}
