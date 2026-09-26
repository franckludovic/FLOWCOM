import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Brain, Check, ExternalLink, Send, ShieldCheck } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useBuffer, bufferQuery } from '@/contexts/BufferContext'
import {
  INTEGRATIONS,
  type IntegrationDefinition, type IntegrationId, type ProviderOption,
} from '@/lib/integrations'
import { saveBufferToken } from '@/lib/buffer'
import { useIsManager } from '@/lib/managers'
import { Badge, Button, Card, Tabs, type Tone } from '@/components/ui'
import { AppearanceSettings } from './settings/AppearanceSettings'
import { ModulesSettings } from './settings/ModulesSettings'

type IntegrationStatus = 'connected' | 'notConnected' | 'checking'

interface IntegrationHandler {
  status: IntegrationStatus
  save: (provider: ProviderOption, key: string) => Promise<void>
}

const icons: Record<IntegrationId, typeof Brain> = {
  model: Brain,
  publishing: Send,
}

const statusTone: Record<IntegrationStatus, Tone> = { connected: 'success', notConnected: 'warning', checking: 'neutral' }

const statusLabels = {
  connected: 'settings.status.connected',
  notConnected: 'settings.status.notConnected',
  checking: 'settings.status.checking',
} as const

type SettingsTab = 'integrations' | 'appearance' | 'modules'

export default function SettingsPage() {
  const { t, lang } = useI18n()
  const fr = lang === 'fr'
  const [params, setParams] = useSearchParams()
  const tab: SettingsTab = params.get('tab') === 'appearance' || params.get('tab') === 'modules' ? params.get('tab') as SettingsTab : 'integrations'
  const { apiKeyConfigured, updateApiKey } = useAuth()
  const { activeCompany } = useCompany()
  const buffer = useBuffer()
  // The page is reserved for FlowCom's team; its members manage every client
  // company, whatever their role in it.
  const manager = useIsManager()
  const canManage = manager || Boolean(activeCompany && ['owner', 'admin'].includes(activeCompany.role ?? ''))

  const handlers: Record<IntegrationId, IntegrationHandler> = {
    model: {
      status: apiKeyConfigured ? 'connected' : 'notConnected',
      save: (provider, key) => updateApiKey(key, activeCompany?.id, provider),
    },
    publishing: {
      status: buffer.loading ? 'checking' : buffer.orgId ? 'connected' : 'notConnected',
      save: async (_provider, key) => {
        if (!activeCompany) return
        await saveBufferToken(activeCompany.id, key)
        buffer.refreshChannels()
      },
    },
  }

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-3.5 px-4 py-5 sm:px-6">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{fr ? 'Paramètres' : 'Settings'}</h1>
          <p className="m-0 mt-0.5 text-sm text-ink-muted">
            {tab === 'integrations'
              ? <>{fr ? 'Services connectés de' : 'Connected services of'} <span className="font-semibold text-ink">{activeCompany?.name ?? '—'}</span> · {fr ? "réservé à l'équipe FlowCom" : 'FlowCom team only'}</>
              : fr ? "Réglages de toute l'installation · réservé à l'équipe FlowCom" : 'Settings for the whole installation · FlowCom team only'}
          </p>
        </div>

        <Tabs<SettingsTab> value={tab} onChange={next => setParams(next === 'integrations' ? {} : { tab: next })} tabs={[
          { id: 'integrations', label: fr ? 'Intégrations' : 'Integrations' },
          { id: 'appearance', label: fr ? 'Apparence' : 'Appearance' },
          { id: 'modules', label: 'Modules' },
        ]} />

        {tab === 'appearance' ? <AppearanceSettings canManage={canManage} />
        : tab === 'modules' ? <ModulesSettings canManage={canManage} />
        : !activeCompany ? (
          <p className="m-0 text-sm text-ink-muted">{t('settings.noCompany')}</p>
        ) : (
          <>
            {!canManage && <p className="m-0 rounded-[var(--radius-md)] bg-warning-soft px-3 py-2 text-[13px] text-ink">{t('settings.ownerOnly')}</p>}

            <Card className="overflow-hidden">
              {INTEGRATIONS.map(item => (
                <IntegrationRow key={`${activeCompany.id}:${item.id}`} integration={item} handler={handlers[item.id]} canManage={canManage} />
              ))}
            </Card>

            <p className="m-0 flex items-center gap-1.5 text-[12px] text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />
              {t('settings.secureNote')}
            </p>

            {buffer.orgId && <StatsCheck fr={fr} companyId={activeCompany.id} orgId={buffer.orgId} channels={buffer.channels} />}
          </>
        )}
      </div>
    </div>
  )
}

function IntegrationRow({ integration, handler, canManage }: {
  integration: IntegrationDefinition
  handler: IntegrationHandler
  canManage: boolean
}) {
  const { t } = useI18n()
  const Icon = icons[integration.id]
  const [editing, setEditing] = useState(false)
  const [providerId, setProviderId] = useState(integration.providers[0].id)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const provider = integration.providers.find(p => p.id === providerId) ?? integration.providers[0]

  const close = () => { setEditing(false); setValue(''); setError('') }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const key = value.trim()
    if (!key) return
    if (provider.validate && !provider.validate(key)) { setError(t('settings.invalidFormat')); return }
    setSaving(true)
    setError('')
    try {
      await handler.save(provider, key)
      close()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.error.generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-sunken text-ink-muted"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-ink">{t(integration.nameKey)}</p>
          <p className="m-0 truncate text-[12px] text-ink-muted">{t(integration.descKey)}</p>
        </div>
        {saved && <Check className="h-4 w-4 shrink-0 text-success" />}
        <Badge tone={statusTone[handler.status]}>{t(statusLabels[handler.status])}</Badge>
        {!editing && (
          <Button variant="secondary" size="sm" disabled={!canManage} onClick={() => setEditing(true)}>
            {handler.status === 'connected' ? t('settings.replaceKey') : t('settings.connect')}
          </Button>
        )}
      </div>

      {editing && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:pl-11">
          <div className="flex flex-col gap-2 sm:flex-row">
            {integration.providers.length > 1 && (
              <select className="fc-input sm:w-36" aria-label={t('settings.provider')} value={providerId} onChange={e => setProviderId(e.target.value as typeof providerId)}>
                {integration.providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            )}
            <input type="password" className="fc-input min-w-0 flex-1" style={{ fontFamily: 'var(--font-mono, monospace)' }} value={value}
              placeholder={provider.placeholder} aria-label={t('settings.keyLabel')} autoComplete="off" autoFocus onChange={e => setValue(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={close}>{t('settings.cancel')}</Button>
              <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!value.trim()}>{saving ? t('settings.saving') : t('settings.save')}</Button>
            </div>
          </div>
          {error && <p className="m-0 text-[12px] text-danger">{error}</p>}
          {provider.helpUrl && (
            <a href={provider.helpUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 self-start text-[12px] font-semibold text-brand hover:underline">
              {t('settings.getKey')} ({provider.label})<ExternalLink className="h-3 w-3" />
            </a>
          )}
        </form>
      )}
    </div>
  )
}

// Team tool: shows which figures the publishing service really returns for
// the last published posts, before the weekly report relies on them.
function StatsCheck({ fr, companyId, orgId, channels }: {
  fr: boolean; companyId: string; orgId: string; channels: Array<{ id: string; name: string; service: string }>
}) {
  type Metric = { type: string; name: string; value: number | string }
  type Checked = { id: string; text: string; sentAt: string | null; channel: string; metrics: Metric[] }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [posts, setPosts] = useState<Checked[] | null>(null)

  const run = async () => {
    setBusy(true)
    setError('')
    setPosts(null)
    try {
      const data = await bufferQuery(companyId, `query StatsCheck($input: PostsInput!) {
        posts(first: 5, input: $input) { edges { node { id text sentAt channelId metrics { type name value } } } }
      }`, { input: { organizationId: orgId, filter: { status: ['sent'], channelIds: channels.map(c => c.id) } } })
      type Node = { id: string; text?: string; sentAt?: string; channelId: string; metrics?: Metric[] }
      const edges: Array<{ node: Node }> = data?.posts?.edges ?? []
      setPosts(edges.map(({ node }) => {
        const ch = channels.find(c => c.id === node.channelId)
        return { id: node.id, text: node.text ?? '', sentAt: node.sentAt ?? null, channel: ch ? `${ch.name} (${ch.service})` : node.channelId, metrics: node.metrics ?? [] }
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const withFigures = posts?.filter(p => p.metrics.some(m => Number(m.value) > 0)).length ?? 0
  const summary = !posts ? ''
    : !posts.length ? (fr ? 'Aucun post publié trouvé.' : 'No published post found.')
    : withFigures ? (fr ? `Des chiffres reviennent pour ${withFigures} post(s) sur ${posts.length}.` : `Figures come back for ${withFigures} of ${posts.length} post(s).`)
    : (fr ? `Aucun chiffre ne revient pour ces ${posts.length} posts.` : `No figures come back for these ${posts.length} posts.`)

  return (
    <section className="fc-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold text-ink">{fr ? 'Tester les statistiques des posts' : 'Test post statistics'}</p>
          <p className="m-0 text-xs text-ink-muted">{fr ? 'Demande à Buffer les chiffres de vos 5 derniers posts publiés et affiche ce qui revient.' : 'Asks Buffer for the figures of your last 5 published posts and shows what comes back.'}</p>
        </div>
        <Button variant="secondary" size="sm" loading={busy} onClick={() => void run()}>{fr ? 'Tester' : 'Test'}</Button>
      </div>
      {(error || posts) && (
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 text-[13px]">
          {error && <p className="m-0 text-danger">{fr ? 'Buffer a refusé la demande : ' : 'Buffer refused the request: '}{error}</p>}
          {summary && <p className="m-0 font-semibold text-ink">{summary}</p>}
          {posts?.map(p => (
            <div key={p.id} className="rounded-[var(--radius-md)] bg-surface-sunken px-3 py-2">
              <p className="m-0 truncate text-ink">{p.text.slice(0, 90) || '—'}</p>
              <p className="m-0 text-[12px] text-ink-muted">{p.channel}{p.sentAt ? ` · ${p.sentAt.slice(0, 10)}` : ''}</p>
              <p className="m-0 mt-1 text-[12px] text-ink">
                {p.metrics.length ? p.metrics.map(m => `${m.name || m.type} : ${m.value}`).join(' · ') : (fr ? 'aucun chiffre' : 'no figures')}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
