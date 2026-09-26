import { Navigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useTheme } from '@/contexts/ThemeContext'

// Shown only when Power Apps did not pass a Microsoft Entra identity, for
// example when the app's address is opened outside Power Apps.
export default function AuthPage() {
  const { user, loading } = useAuth()
  const { lang } = useI18n()
  const fr = lang === 'fr'

  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/workspace" replace />

  return (
    <div className="grid min-h-screen place-items-center bg-surface-page px-4">
      <div className="fc-card w-full max-w-md px-6 py-8 text-center">
        <BrandMark />
        <p className="m-0 mt-4 text-sm leading-6 text-ink-muted">
          {fr
            ? 'Cette application utilise votre compte professionnel Microsoft. Ouvrez-la depuis le lien Power Apps que vous avez reçu : aucun mot de passe supplémentaire n’est nécessaire.'
            : 'This app uses your Microsoft work account. Open it from the Power Apps link you received: no extra password is needed.'}
        </p>
        <p className="m-0 mt-5 inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
          <ShieldCheck className="h-4 w-4 text-success" />
          {fr ? 'Connexion gérée par votre organisation (Microsoft Entra ID)' : 'Sign-in managed by your organisation (Microsoft Entra ID)'}
        </p>
      </div>
    </div>
  )
}

export function BrandMark() {
  const { settings, theme } = useTheme()
  const logo = theme === 'dark' ? settings.logoDark || settings.logoLight : settings.logoLight
  const name = settings.productName || 'FlowCom'
  return logo
    ? <img src={logo} alt={name} className="mx-auto h-10 max-w-[200px] object-contain" />
    : (
      <span className="inline-flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-brand text-lg font-bold text-on-brand" style={{ fontFamily: 'var(--font-display)' }}>{name.charAt(0)}</span>
        <span className="text-xl font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{name}</span>
      </span>
    )
}

export function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-page">
      <div className="flex flex-col items-center gap-4">
        <BrandMark />
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-label="…" role="status" />
      </div>
    </div>
  )
}
