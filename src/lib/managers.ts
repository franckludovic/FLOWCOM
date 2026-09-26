// FlowCom's own team runs each installation: its appearance, integrations
// (Buffer, AI provider) and modules. Clients use the app but never see those
// settings. Who counts as the team is part of each installation's build:
//
//   VITE_MANAGER_DOMAINS=africauniv.tech        (email domains, comma-separated)
//   VITE_MANAGER_EMAILS=someone@example.com     (single addresses, comma-separated)
//
// This only decides what the screens show. The data itself is protected in
// Dataverse (column security on secrets, security roles on settings).
import { useAuth } from '@/contexts/AuthContext'

const parseList = (value: string | undefined) =>
  (value ?? '').split(',').map(v => v.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)

export function isManager(email: string | null | undefined, domains: string[], emails: string[]): boolean {
  const address = (email ?? '').trim().toLowerCase()
  if (!address.includes('@')) return false
  if (emails.includes(address)) return true
  const domain = address.split('@').pop()!
  return domains.some(d => domain === d || domain.endsWith(`.${d}`))
}

const DOMAINS = parseList(import.meta.env.VITE_MANAGER_DOMAINS as string | undefined)
const EMAILS = parseList(import.meta.env.VITE_MANAGER_EMAILS as string | undefined)

export function useIsManager(): boolean {
  const { user } = useAuth()
  return isManager(user?.email, DOMAINS, EMAILS)
}
