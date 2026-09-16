import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-surface-alt)]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
