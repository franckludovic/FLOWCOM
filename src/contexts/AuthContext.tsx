import {
  createContext, useContext, useState, useEffect,
  useCallback, type ReactNode
} from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile } from '@/types'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (name: string, email: string, password: string) => Promise<string | null>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  updateApiKey: (key: string) => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) {
      const profileData = data as unknown as Profile
      setProfile(profileData)
      if (profileData.api_key) {
        localStorage.setItem('flowcom:groq_key', profileData.api_key)
      } else {
        localStorage.removeItem('flowcom:groq_key')
      }
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
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
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
    if (error) {
      if (error.message.includes('already registered')) return 'auth.emailExists'
      return 'auth.error'
    }
    // Create profile row
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        name,
        email,
        api_key: null,
        lang: 'fr',
      })
    }
    return null
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/workspace` },
    })
  }

  const signOut = async () => {
    localStorage.removeItem('flowcom:groq_key')
    await supabase.auth.signOut()
  }

  const updateApiKey = async (key: string) => {
    if (!user) return
    await supabase.from('profiles').update({ api_key: key }).eq('id', user.id)
    setProfile(prev => prev ? { ...prev, api_key: key } : prev)
    localStorage.setItem('flowcom:groq_key', key)
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return
    await supabase.from('profiles').update(updates).eq('id', user.id)
    setProfile(prev => prev ? { ...prev, ...updates } : prev)
  }

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading,
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
