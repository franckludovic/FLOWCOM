import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { ErrorBoundary } from './ErrorBoundary'
import { AssistantPanel } from '@/components/assistant/AssistantPanel'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  return (
    <div className="fc-print-root flex h-screen overflow-hidden bg-surface-page">
      {/* Sidebar (handles desktop + mobile drawer) */}
      <div className="fc-no-print contents">
        <Sidebar
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
      </div>

      {/* Main content area */}
      <div className="fc-print-root flex flex-col flex-1 min-w-0">
        <div className="fc-no-print contents"><Header onToggleMobileMenu={() => setMobileOpen(prev => !prev)} onToggleAssistant={() => setAssistantOpen(prev => !prev)} assistantOpen={assistantOpen} /></div>
        <main className="fc-print-root flex-1 flex flex-col min-h-0 overflow-y-auto relative">
          {/* Error boundary per page - a crash here keeps the sidebar/header alive */}
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Stays mounted so the conversation survives page changes */}
      <div className="fc-no-print contents"><AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} /></div>
    </div>
  )
}
