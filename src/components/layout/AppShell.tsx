import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { ErrorBoundary } from './ErrorBoundary'

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-surface-alt)]">
      {/* Sidebar (handles desktop + mobile drawer) */}
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header onToggleMobileMenu={() => setMobileOpen(prev => !prev)} />
        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto relative">
          {/* Error boundary per page — a crash here keeps the sidebar/header alive */}
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
