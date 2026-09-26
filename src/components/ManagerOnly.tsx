import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useIsManager } from '@/lib/managers'

// Screens reserved for FlowCom's team; anyone else is sent back to the app.
export function ManagerOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const manager = useIsManager()
  if (!user) return null
  return manager ? <>{children}</> : <Navigate to="/" replace />
}
