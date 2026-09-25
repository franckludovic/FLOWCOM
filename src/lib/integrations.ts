import type { TranslationKey } from '@/i18n/fr'
import { supabase } from './supabase'

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

export async function saveBufferToken(companyId: string, accessToken: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ connected?: boolean; error?: string }>('save-buffer-integration', {
    body: { companyId, accessToken },
  })
  if (error) {
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
    const details = context?.json ? await context.json().catch(() => null) : null
    throw new Error(details?.error ?? error.message)
  }
  if (data?.error || !data?.connected) throw new Error(data?.error ?? 'Buffer connection failed')
}
