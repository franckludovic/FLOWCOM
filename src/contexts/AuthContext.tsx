import {
  createContext, useContext, useState, useEffect,
  useCallback, type ReactNode
} from 'react'
import { getContext } from '@microsoft/power-apps/app'
import type { Profile } from '@/types'
import { getOrCreateDataverseProfile, isIntegrationConnected, markIntegrationConnected, updateDataverseProfile } from '@/lib/dataverse'
import { DEFAULT_MODEL_PROVIDER, MODEL_PROVIDERS, saveCompanySecret, type ProviderOption } from '@/lib/integrations'

export interface AppUser {
  id: string
  email?: string
  user_metadata?: { name?: string; full_name?: string }
}

interface AuthContextValue {
  user: AppUser | null
  profile: Profile | null
  loading: boolean
  apiKeyConfigured: boolean
  updateApiKey: (key: string, companyId?: string, provider?: ProviderOption) => Promise<void>
  refreshApiKeyStatus: (companyId: string | null) => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Identity comes from the Power Apps host (Microsoft Entra); FlowCom has no
// sign-in of its own. Sign-out happens through the Microsoft account menu.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        const context = await getContext()
        const objectId = context.user.objectId
        if (!objectId) throw new Error('Power Apps did not provide a user identity')

        const hostUser: AppUser = {
          id: objectId,
          email: context.user.userPrincipalName,
          user_metadata: { name: context.user.fullName },
        }
        if (cancelled) return
        setUser(hostUser)
        const profileData = await getOrCreateDataverseProfile(hostUser)
        if (!cancelled) setProfile(profileData)
      } catch (err) {
        console.error('Could not load the Power Apps user', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => { cancelled = true }
  }, [])

  const updateApiKey = async (key: string, companyId?: string, provider: ProviderOption = DEFAULT_MODEL_PROVIDER) => {
    if (!user) return
    if (!companyId) {
      throw new Error('Select a company and use an owner or admin account before saving the company AI key.')
    }

    await saveCompanySecret(companyId, provider.secretName, key)
    // Record non-secret status so the key is recognised after a reload.
    // The secret is already saved, so a failure here must not fail the save.
    try {
      await markIntegrationConnected(companyId, provider.id, provider.label)
    } catch (err) {
      console.warn('Saved the AI key but could not record its status', err)
    }
    setApiKeyConfigured(true)
  }

  const refreshApiKeyStatus = useCallback(async (companyId: string | null) => {
    if (!companyId) {
      setApiKeyConfigured(false)
      return
    }
    try {
      const checks = await Promise.all(MODEL_PROVIDERS.map(p => isIntegrationConnected(companyId, p.id)))
      setApiKeyConfigured(checks.some(Boolean))
    } catch {
      setApiKeyConfigured(false)
    }
  }, [])

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!profile) return
    await updateDataverseProfile(profile.id, updates)
    setProfile(prev => prev ? { ...prev, ...updates } : prev)
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading, apiKeyConfigured,
      updateApiKey, refreshApiKeyStatus, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
