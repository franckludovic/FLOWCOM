/**
 * BufferContext
 * ─────────────
 * Fetches org ID + channels ONCE when the app mounts, caches for the session.
 *
 * All Buffer API calls go through the Supabase Edge Function `buffer` which
 * keeps BUFFER_API_KEY server-side. Works in dev AND production — no Vite proxy needed.
 */

import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode
} from 'react'
import { supabase } from '@/lib/supabase'

// ─── Shared Buffer query helper ───────────────────────────────────────────────
// _token param kept for call-site compatibility but is no longer used —
// the Edge Function reads the key from Supabase secrets.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function bufferQuery(_token: string, query: string, variables?: object): Promise<any> {
  const { data, error } = await supabase.functions.invoke('buffer', {
    body: { query, variables },
  })
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
    const details = ctx?.json ? await ctx.json().catch(() => null) : null
    throw new Error(details?.error ?? error.message)
  }
  if (!data) throw new Error('Empty response from Buffer proxy')
  if (data?.errors?.length) throw new Error(data.errors[0].message)
  return data?.data ?? data
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BufferChannel {
  id: string
  name: string
  service: string   // 'instagram' | 'facebook' | 'twitter' | 'linkedin' | etc.
  avatar: string | null
}

interface BufferContextValue {
  orgId: string | null
  channels: BufferChannel[]
  loading: boolean
  error: string
  refreshChannels: () => void
}

// ─── Context ──────────────────────────────────────────────────────────────────
const BufferContext = createContext<BufferContextValue | null>(null)

export function BufferProvider({ children }: { children: ReactNode }) {
  // Token is no longer needed client-side — kept only so existing call sites
  // that pass it as an argument don't need to change.
  const token = import.meta.env.VITE_BUFFER_API_KEY as string | undefined ?? ''

  const [orgId, setOrgId]       = useState<string | null>(null)
  const [channels, setChannels] = useState<BufferChannel[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [fetchKey, setFetchKey] = useState(0)

  const refreshChannels = useCallback(() => setFetchKey(k => k + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')

    ;(async () => {
      try {
        const acc = await bufferQuery(token, `{ account { organizations { id } } }`)
        const id: string | undefined = acc?.account?.organizations?.[0]?.id
        if (!id) throw new Error('No Buffer organization found.')
        if (!alive) return
        setOrgId(id)

        const cd = await bufferQuery(
          token,
          `query Channels($input: ChannelsInput!) {
            channels(input: $input) { id name service avatar }
          }`,
          { input: { organizationId: id } }
        )
        if (!alive) return
        setChannels(cd?.channels ?? [])
      } catch (e: any) {
        if (alive) setError(e.message ?? 'Buffer error')
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => { alive = false }
  }, [fetchKey]) // token intentionally omitted — it's static and the Edge Function owns it

  return (
    <BufferContext.Provider value={{ orgId, channels, loading, error, refreshChannels }}>
      {children}
    </BufferContext.Provider>
  )
}

export function useBuffer() {
  const ctx = useContext(BufferContext)
  if (!ctx) throw new Error('useBuffer must be used inside BufferProvider')
  return ctx
}
