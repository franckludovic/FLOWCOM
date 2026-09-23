import { Navigate } from 'react-router-dom'
import { ShieldCheck, Zap } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthPage() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">Loading FlowCom…</div>
  }

  if (user) return <Navigate to="/workspace" replace />

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6 text-white">
      <div className="max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600">
          <Zap className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold">FlowCom</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          FlowCom uses your Microsoft Entra account from Power Apps. Open this app from its Power Apps link; no separate FlowCom password is required.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-emerald-300">
          <ShieldCheck className="h-4 w-4" />
          <span>Authentication is managed by your organization</span>
        </div>
      </div>
    </div>
  )
}
