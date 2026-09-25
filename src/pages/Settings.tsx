import { useState } from 'react'
import { Brain, Check, ExternalLink, Loader2, Send, ShieldCheck } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useBuffer } from '@/contexts/BufferContext'
import {
  INTEGRATIONS, saveBufferToken,
  type IntegrationDefinition, type IntegrationId, type ProviderOption,
} from '@/lib/integrations'
import { cn } from '@/lib/utils'

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

export default function SettingsPage() {
  const { t } = useI18n()
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
    <div className="h-full overflow-y-auto bg-[var(--color-bg)]">
      <div className="max-w-3xl px-6 py-5 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">{t('settings.title')}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {t('settings.subtitle')}
            {activeCompany && <span className="font-medium text-[var(--color-text)]"> {activeCompany.name}</span>}
          </p>
        </div>

        {!activeCompany ? (
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
