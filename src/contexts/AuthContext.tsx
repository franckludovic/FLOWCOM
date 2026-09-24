import {
  createContext, useContext, useState, useEffect,
  useCallback, type ReactNode
} from 'react'
import { getContext } from '@microsoft/power-apps/app'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/types'
import { getOrCreateDataverseProfile, updateDataverseProfile } from '@/lib/dataverse'
import { SaveCompanySecretService } from '@/generated/services/SaveCompanySecretService'

export interface AppUser {
  id: string
  email?: string
  user_metadata?: { name?: string; full_name?: string }
}

interface AuthContextValue {
  user: AppUser | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  apiKeyConfigured: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (name: string, email: string, password: string) => Promise<string | null>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  updateApiKey: (key: string, companyId?: string) => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)

  const fetchProfile = useCallback(async (authUser: AppUser, checkSupabaseKey = false) => {
    const profileData = await getOrCreateDataverseProfile(authUser)
    setProfile(profileData)
    if (checkSupabaseKey) try {
      const { data: keyStatus } = await supabase.functions.invoke<{ configured?: boolean }>('groq', {
        body: { status: true },
      })
      setApiKeyConfigured(Boolean(keyStatus?.configured))
    } catch {
      setApiKeyConfigured(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let subscription: { unsubscribe: () => void } | undefined

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
        if (!cancelled) setUser(hostUser)
        await fetchProfile(hostUser)
      } catch {
        // Keep Supabase authentication available only for local development.
        // Power Apps production runs on the Entra identity supplied by getContext().
        if (!import.meta.env.DEV) return
        const initial = await supabase.auth.getSession()
        if (cancelled) return
        setSession(initial.data.session)
        setUser(initial.data.session?.user ?? null)
        if (initial.data.session?.user) await fetchProfile(initial.data.session.user, true)

        const authState = supabase.auth.onAuthStateChange((_event, nextSession) => {
          setSession(nextSession)
          setUser(nextSession?.user ?? null)
          if (nextSession?.user) {
            void fetchProfile(nextSession.user, true)
          } else {
            setProfile(null)
            setApiKeyConfigured(false)
          }
        })
        subscription = authState.data.subscription
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Invalid login')) return 'auth.invalidCredentials'
      return 'auth.error'
    }
    return null
  }

  const signUp = async (name: string, email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
    if (error) {
      if (error.message.includes('already registered')) return 'auth.emailExists'
      return 'auth.error'
    }
    return null
  }

  const signInWithGoogle = async () => {
    if (!import.meta.env.DEV) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/workspace` },
    })
  }

  const signOut = async () => {
    setApiKeyConfigured(false)
    if (session) await supabase.auth.signOut()
  }

  const updateApiKey = async (key: string, companyId?: string) => {
    if (!user) return

    if (!import.meta.env.DEV) {
      if (!companyId) {
        throw new Error('Select a company and use an owner or admin account before saving the company AI key.')
      }

      const result = await SaveCompanySecretService.Run({
        text: companyId,
        text_1: 'Groq',
        text_2: key,
      })
      if (!result.success) {
        const message = result.error instanceof Error
          ? result.error.message
          : result.error
            ? String(result.error)
            : 'Unable to save company AI key'
        throw new Error(message)
      }
    } else {
      if (!session) throw new Error('AI integrations must be connected through the Power Platform backend.')
      if (companyId) {
        const { data, error } = await supabase.functions.invoke<{ connected?: boolean; error?: string }>('save-groq-integration', {
          body: { companyId, accessToken: key },
        })
        if (error || !data?.connected) throw new Error(data?.error ?? error?.message ?? 'Unable to save company AI key')
      }
    }

    setApiKeyConfigured(Boolean(key))
    // In Power Apps, do not copy the secret into React/profile state.
    // Local development keeps the existing profile behavior for the local-only UI.
    if (import.meta.env.DEV) setProfile(prev => prev ? { ...prev, api_key: key } : prev)
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!profile) return
    await updateDataverseProfile(profile.id, updates)
    setProfile(prev => prev ? { ...prev, ...updates } : prev)
  }

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading, apiKeyConfigured,
      signIn, signUp, signInWithGoogle, signOut,
      updateApiKey, updateProfile,
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
