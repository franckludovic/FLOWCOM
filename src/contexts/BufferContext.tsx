/**
 * BufferContext
 * ─────────────
 * Fetches org ID + channels ONCE when the app mounts, caches for the session.
 *
 * All Buffer API calls go through the Supabase Edge Function `buffer` which
 * keeps each company's Buffer credential server-side. Works in dev AND
 * production - no Vite proxy needed.
 */

import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode
} from 'react'
import { supabase } from '@/lib/supabase'
import { useCompany } from './CompanyContext'

// ─── Shared Buffer query helper ───────────────────────────────────────────────
// The Edge Function reads the Buffer key from Supabase secrets. No provider
// credential is accepted from or bundled into the browser application.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function bufferQuery(companyId: string, query: string, variables?: object): Promise<any> {
  const { data, error } = await supabase.functions.invoke('buffer', {
    body: { companyId, query, variables },
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
  const { activeCompany } = useCompany()
  const [orgId, setOrgId]       = useState<string | null>(null)
  const [channels, setChannels] = useState<BufferChannel[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [fetchKey, setFetchKey] = useState(0)

  const refreshChannels = useCallback(() => setFetchKey(k => k + 1), [])

  useEffect(() => {
    let alive = true
    if (!activeCompany) {
      setOrgId(null)
      setChannels([])
      setError('')
      setLoading(false)
      return () => { alive = false }
    }
    setLoading(true)
    setError('')

    ;(async () => {
      try {
        const acc = await bufferQuery(activeCompany.id, `{ account { organizations { id } } }`)
        const id: string | undefined = acc?.account?.organizations?.[0]?.id
        if (!id) throw new Error('No Buffer organization found.')
        if (!alive) return
        setOrgId(id)

        const cd = await bufferQuery(
          activeCompany.id,
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
  }, [fetchKey, activeCompany?.id])

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
