/**
 * BufferContext
 * ─────────────
 * Fetches org ID + channels ONCE when the app mounts, caches for the session.
 *
 * All Buffer API calls go through bufferQuery (lib/buffer), which runs them
 * through the BufferCall flow so each company's Buffer token stays server-side.
 */

import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode
} from 'react'
import { bufferQuery } from '@/lib/buffer'
import { useCompany } from './CompanyContext'

export { bufferQuery }

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
