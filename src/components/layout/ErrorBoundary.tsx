import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Optional smaller variant for section-level boundaries */
  inline?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    // Log to console in development; replace with a real error reporting
    // service (Sentry, LogRocket, etc.) before shipping to production.
    console.error('[FlowCom] Uncaught render error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.inline) {
      // Compact inline variant — used around individual page sections
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">Something went wrong in this section.</span>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 text-xs font-semibold hover:underline shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )
    }

    // Full-page fallback
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 text-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-xl font-bold text-[var(--color-text)]">
            Something went wrong
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            An unexpected error occurred in this part of the app. Your data is safe — this is a display error only.
          </p>
          {this.state.error && (
            <p className="text-xs font-mono text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg mt-2 text-left break-all">
              {this.state.error.message}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-bold text-white transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
