// FlowCom shared components: thin React wrappers over the design system's
// fc-* classes (src/styles/fc.css). Pages build from these instead of styling
// buttons, cards and badges themselves.
import {
  forwardRef, useEffect, useId, useState,
  type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Database, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Spark: the AI's mark ─────────────────────────────────────────────────────

export function Spark({ className }: { className?: string }) {
  return (
    <svg className={cn('fc-spark', className)} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" transform="translate(0 2)" d="M8 0c.5 3.9 2.1 5.5 6 6-3.9.5-5.5 2.1-6 6-.5-3.9-2.1-5.5-6-6 3.9-.5 5.5-2.1 6-6Z" />
    </svg>
  )
}

// ─── Button ───────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  loading?: boolean
  // Icon-only buttons must pass `aria-label`.
  iconOnly?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, iconOnly, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading}
      className={cn('fc-btn', `fc-btn--${variant}`, size !== 'md' && `fc-btn--${size}`, iconOnly && 'fc-btn--icon', className)}
      title={iconOnly ? rest['aria-label'] : undefined} {...rest}>
      {loading ? <Loader2 className="animate-spin" /> : variant === 'ai' && !icon ? <Spark /> : icon}
      {!iconOnly && children}
    </button>
  )
})

// ─── Badge ────────────────────────────────────────────────────────────────────

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'ai'

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <span className={cn('fc-badge', tone !== 'neutral' && `fc-badge--${tone}`, className)}>{icon}{children}</span>
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({ pressed, icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed ?? false} className={cn('fc-chip', className)} {...rest}>
      {icon}{children}
    </button>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────

interface FieldFrame {
  label: string
  hint?: string
  error?: string
  className?: string
}

function Frame({ label, hint, error, className, id, children }: FieldFrame & { id: string; children: ReactNode }) {
  return (
    <div className={cn('fc-field', error && 'fc-field--error', className)}>
      <label className="fc-label" htmlFor={id}>{label}</label>
      {children}
      {(error || hint) && <span className="fc-hint" id={`${id}-hint`}>{error || hint}</span>}
    </div>
  )
}

export function TextField({ label, hint, error, className, ...input }: FieldFrame & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <Frame label={label} hint={hint} error={error} className={className} id={id}>
      <input id={id} className="fc-input" aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-hint` : undefined} {...input} />
    </Frame>
  )
}

export function SelectField({ label, hint, error, className, children, ...select }: FieldFrame & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <Frame label={label} hint={hint} error={error} className={className} id={id}>
      <select id={id} className="fc-input" aria-invalid={Boolean(error)} {...select}>{children}</select>
    </Frame>
  )
}

export function TextAreaField({ label, hint, error, className, ...area }: FieldFrame & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <Frame label={label} hint={hint} error={error} className={className} id={id}>
      <textarea id={id} className="fc-input" aria-invalid={Boolean(error)} {...area} />
    </Frame>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('fc-card', className)} {...rest}>{children}</section>
}

export function CardHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="fc-card__head">
      <div className="min-w-0">
        <h3 className="fc-card__title">{title}</h3>
        {subtitle && <p className="fc-card__sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('fc-card__body', className)}>{children}</div>
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <footer className="fc-card__foot">{children}</footer>
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

const numberFormat = new Intl.NumberFormat('fr-FR')

export function KpiTile({ label, value, target, trend, meta, className }: {
  label: string
  value: number | string
  // Progress toward a target, shown as a meter with "62 % sur 20 000".
  target?: number | null
  // Change versus the previous period, in percent.
  trend?: number | null
  meta?: ReactNode
  className?: string
}) {
  const numeric = typeof value === 'number' ? value : Number.NaN
  const share = target && !Number.isNaN(numeric) ? Math.min(100, Math.round((numeric / target) * 100)) : null
  return (
    <div className={cn('fc-card fc-kpi', className)}>
      <p className="fc-kpi__label">{label}</p>
      <p className="fc-kpi__value">{typeof value === 'number' ? numberFormat.format(value) : value}</p>
      {share !== null && <div className="fc-meter" role="progressbar" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${share}%` }} /></div>}
      {(share !== null || trend != null || meta) && (
        <div className="fc-kpi__meta">
          {trend != null && (
            <span className={cn('fc-trend', trend >= 0 ? 'fc-trend--up' : 'fc-trend--down')}>
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {trend >= 0 ? '+' : '−'}{Math.abs(trend)} %
            </span>
          )}
          {share !== null && target && <span>{share} % sur {numberFormat.format(target)}</span>}
          {meta}
        </div>
      )}
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({ tabs, value, onChange, className }: {
  tabs: Array<{ id: T; label: ReactNode }>
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  return (
    <div className={cn('fc-tabs', className)} role="tablist">
      {tabs.map(tab => (
        <button key={tab.id} type="button" role="tab" aria-selected={tab.id === value} className="fc-tab" onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ─── Evidence, insight and approval (the AI signature) ────────────────────────

export function EvidenceChip({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const content = <><Database />{children}</>
  return onClick
    ? <button type="button" className="fc-evidence" onClick={onClick}>{content}</button>
    : <span className="fc-evidence">{content}</span>
}

export function InsightCard({ kind = 'Suggestion IA', title, children, evidence, action, className }: {
  kind?: string
  title: ReactNode
  children?: ReactNode
  evidence?: string[]
  action?: ReactNode
  className?: string
}) {
  return (
    <article className={cn('fc-insight', className)}>
      <header className="fc-insight__head"><Spark />{kind}</header>
      <div className="fc-insight__body">
        <h3 className="fc-insight__title">{title}</h3>
        {children && <div className="fc-insight__text">{children}</div>}
      </div>
      {(evidence?.length || action) && (
        <footer className="fc-insight__foot">
          {evidence?.map(source => <EvidenceChip key={source}>{source}</EvidenceChip>)}
          <span className="flex-1" />
          {action}
        </footer>
      )}
    </article>
  )
}

export function ApprovalCardFrame({ icon, title, status, children, actions, result, className }: {
  icon: ReactNode
  title: ReactNode
  status: { tone: Tone; label: string }
  children?: ReactNode
  // Refuse / Approve buttons while pending; replaced by `result` once decided.
  actions?: ReactNode
  result?: ReactNode
  className?: string
}) {
  return (
    <article className={cn('fc-proposal', className)}>
      <header className="fc-proposal__head">
        <span className="fc-proposal__icon">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="fc-kpi__label" style={{ color: 'var(--accent-ink)' }}>Proposition</p>
          <h3 className="fc-proposal__title">{title}</h3>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>
      {children && <div className="fc-proposal__items">{children}</div>}
      {actions ? <footer className="fc-proposal__actions">{actions}</footer> : result ? <p className="px-4 pb-4 text-sm text-ink-muted">{result}</p> : null}
    </article>
  )
}

// ─── Sheet: a side panel over the page (full screen on phones) ───────────────

export function Sheet({ open, onClose, title, subtitle, icon, children, footer, closeLabel = 'Fermer' }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  closeLabel?: string
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-surface-overlay shadow-[var(--shadow-lg)]">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-[18px] font-bold leading-6 text-ink" style={{ fontFamily: 'var(--font-display)' }}>{title}</h2>
            {subtitle && <p className="m-0 mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" iconOnly icon={<X />} onClick={onClose} aria-label={closeLabel} />
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-line bg-surface-sunken px-5 py-3">{footer}</div>}
      </aside>
    </div>
  )
}

// ─── Pager: ‹ 1 2 3 … 9 › under a long list ──────────────────────────────────

export function Pager({ page, pageCount, onChange, label = 'Pages', previousLabel = 'Page précédente', nextLabel = 'Page suivante' }: {
  page: number
  pageCount: number
  onChange: (page: number) => void
  label?: string
  previousLabel?: string
  nextLabel?: string
}) {
  if (pageCount <= 1) return null
  // First, last, and the pages around the current one; gaps become "…".
  const shown = [...new Set([1, pageCount, page - 1, page, page + 1])].filter(n => n >= 1 && n <= pageCount).sort((a, b) => a - b)
  const items: Array<number | 'gap'> = []
  shown.forEach((n, i) => { if (i && n - shown[i - 1] > 1) items.push('gap'); items.push(n) })
  return (
    <nav aria-label={label} className="flex items-center justify-center gap-1">
      <Button variant="ghost" size="sm" iconOnly icon={<ChevronLeft />} aria-label={previousLabel} disabled={page <= 1} onClick={() => onChange(page - 1)} />
      {items.map((item, i) => item === 'gap'
        ? <span key={`gap-${i}`} className="px-1 text-[13px] text-ink-subtle" aria-hidden="true">…</span>
        : (
          <button key={item} type="button" onClick={() => onChange(item)} aria-current={item === page ? 'page' : undefined}
            className={cn('fc-btn fc-btn--sm min-w-[var(--control-sm)] px-2 tabular-nums', item === page ? 'fc-btn--primary' : 'fc-btn--ghost')}>
            {item}
          </button>
        ))}
      <Button variant="ghost" size="sm" iconOnly icon={<ChevronRight />} aria-label={nextLabel} disabled={page >= pageCount} onClick={() => onChange(page + 1)} />
    </nav>
  )
}

// ─── Paging a list: ten at a time, the pager only once there are more ────────

export const PAGE_SIZE = 10

export function usePaged<T>(items: T[], resetKey?: string, size = PAGE_SIZE) {
  const [page, setPage] = useState(1)
  // Back to the first page when the list's filters change.
  useEffect(() => { setPage(1) }, [resetKey])
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, pageCount)
  return {
    page: current, setPage, pageCount, total: items.length,
    from: items.length ? (current - 1) * size + 1 : 0,
    to: Math.min(current * size, items.length),
    items: items.slice((current - 1) * size, current * size),
  }
}

export function PagerBar({ paged, lang = 'fr', className }: { paged: ReturnType<typeof usePaged>; lang?: 'fr' | 'en'; className?: string }) {
  if (paged.pageCount <= 1) return null
  const fr = lang === 'fr'
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <span className="text-[12px] text-ink-muted tabular-nums">{paged.from}–{paged.to} {fr ? 'sur' : 'of'} {paged.total}</span>
      <Pager page={paged.page} pageCount={paged.pageCount} onChange={paged.setPage}
        label={fr ? 'Pages' : 'Pages'} previousLabel={fr ? 'Page précédente' : 'Previous page'} nextLabel={fr ? 'Page suivante' : 'Next page'} />
    </div>
  )
}
