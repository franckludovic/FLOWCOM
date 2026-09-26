import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Brain, Check, ExternalLink, Loader2, Send, ShieldCheck } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useBuffer, bufferQuery } from '@/contexts/BufferContext'
import {
  INTEGRATIONS,
  type IntegrationDefinition, type IntegrationId, type ProviderOption,
} from '@/lib/integrations'
import { saveBufferToken } from '@/lib/buffer'
import { cn } from '@/lib/utils'
import { Button, Tabs } from '@/components/ui'
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

const statusStyles: Record<IntegrationStatus, string> = {
  connected: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
  notConnected: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40',
  checking: 'text-[var(--color-text-muted)] bg-[var(--color-surface-alt)]',
}

const statusLabels = {
  connected: 'settings.status.connected',
  notConnected: 'settings.status.notConnected',
  checking: 'settings.status.checking',
} as const

const inputClass = 'px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)] text-sm outline-none focus:ring-2 focus:ring-indigo-500'

type SettingsTab = 'integrations' | 'appearance' | 'modules'

export default function SettingsPage() {
  const { t, lang } = useI18n()
  const fr = lang === 'fr'
  const [params, setParams] = useSearchParams()
  const tab: SettingsTab = params.get('tab') === 'appearance' || params.get('tab') === 'modules' ? params.get('tab') as SettingsTab : 'integrations'
  const { apiKeyConfigured, updateApiKey } = useAuth()
  const { activeCompany } = useCompany()
  const buffer = useBuffer()

  const canManage = Boolean(activeCompany && ['owner', 'admin'].includes(activeCompany.role ?? ''))

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
    <div className="h-full overflow-y-auto bg-surface-page">
      <div className="mx-auto max-w-[var(--content-max)] px-4 py-5 sm:px-6 space-y-4">
        <div>
          <h1 className="text-[24px] leading-[30px] font-bold text-ink">{fr ? 'Paramètres' : 'Settings'}</h1>
          <p className="text-sm text-ink-muted">
            {tab === 'integrations' ? <>{t('settings.subtitle')}{activeCompany && <span className="font-medium text-ink"> {activeCompany.name}</span>}</>
              : fr ? "Réglages de toute l'installation." : 'Settings for the whole installation.'}
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
          <p className="text-sm text-[var(--color-text-muted)]">{t('settings.noCompany')}</p>
        ) : (
          <>
            {!canManage && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
                {t('settings.ownerOnly')}
              </p>
            )}

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
              {INTEGRATIONS.map(item => (
                <IntegrationRow
                  key={`${activeCompany.id}:${item.id}`}
                  integration={item}
                  handler={handlers[item.id]}
                  canManage={canManage}
                />
              ))}
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
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

  const close = () => {
    setEditing(false)
    setValue('')
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const key = value.trim()
    if (!key) return
    if (provider.validate && !provider.validate(key)) {
      setError(t('settings.invalidFormat'))
      return
    }
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
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-indigo-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)]">{t(integration.nameKey)}</p>
          <p className="text-xs text-[var(--color-text-muted)] truncate">{t(integration.descKey)}</p>
        </div>
        {saved && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
        <span className={cn('shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium', statusStyles[handler.status])}>
          {handler.status === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
          {t(statusLabels[handler.status])}
        </span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            disabled={!canManage}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-colors disabled:opacity-50"
          >
            {handler.status === 'connected' ? t('settings.replaceKey') : t('settings.connect')}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSubmit} className="mt-3 pl-7 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={providerId}
              onChange={e => setProviderId(e.target.value as typeof providerId)}
              aria-label={t('settings.provider')}
              className={cn(inputClass, 'sm:w-36')}
            >
              {integration.providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <input
              type="password"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={provider.placeholder}
              aria-label={t('settings.keyLabel')}
              autoComplete="off"
              autoFocus
              className={cn(inputClass, 'flex-1 min-w-0 font-mono')}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)]"
              >
                {t('settings.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving || !value.trim()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? t('settings.saving') : t('settings.save')}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {provider.helpUrl && (
            <a
              href={provider.helpUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {t('settings.getKey')}
              <ExternalLink className="w-3 h-3" />
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
