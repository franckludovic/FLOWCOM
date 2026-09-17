/**
 * BufferContext
 * ─────────────
 * Fetches org ID + channels ONCE when the app mounts (inside ProtectedRoute),
 * then caches them for the lifetime of the session.
 *
 * Pages that need Buffer data (Studio, PublishingHistory, …) consume this
 * context instead of each making their own init requests.
 *
 * The only time a network call is made:
 *  • First mount (when token is present)
 *  • Explicit call to refreshChannels() by the user
 */

import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode
} from 'react'

// ─── Shared Buffer query helper ───────────────────────────────────────────────
const BUFFER_ENDPOINT = '/buffer-api/graphql'

export async function bufferQuery(token: string, query: string, variables?: object) {
  const res = await fetch(BUFFER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BufferChannel {
  id: string
  name: string
  service: string   // 'instagram' | 'facebook' | 'twitter' | 'linkedin' | etc.
  avatar: string | null
}

interface BufferContextValue {
  /** Resolved org ID — null until first fetch completes */
  orgId: string | null
  /** All connected Buffer channels */
  channels: BufferChannel[]
  /** True while the initial fetch is running */
  loading: boolean
  /** Non-empty string if the fetch failed */
  error: string
  /** Re-fetch org + channels (e.g. after connecting a new channel) */
  refreshChannels: () => void
}

// ─── Context ──────────────────────────────────────────────────────────────────
const BufferContext = createContext<BufferContextValue | null>(null)

export function BufferProvider({ children }: { children: ReactNode }) {
  const token = import.meta.env.VITE_BUFFER_API_KEY as string | undefined

  const [orgId, setOrgId]       = useState<string | null>(null)
  const [channels, setChannels] = useState<BufferChannel[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [fetchKey, setFetchKey] = useState(0)  // increment to trigger a re-fetch

  const refreshChannels = useCallback(() => setFetchKey(k => k + 1), [])

  useEffect(() => {
    if (!token) {
      setError('Missing VITE_BUFFER_API_KEY in .env.local')
      return
    }

    let alive = true
    setLoading(true)
    setError('')

    ;(async () => {
      try {
        // Step 1 — resolve org ID
        const acc = await bufferQuery(token, `{ account { organizations { id } } }`)
        const id: string | undefined = acc?.account?.organizations?.[0]?.id
        if (!id) throw new Error('No Buffer organization found.')
        if (!alive) return
        setOrgId(id)

        // Step 2 — fetch channels
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
  }, [token, fetchKey])  // fetchKey lets refreshChannels() retrigger this

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
