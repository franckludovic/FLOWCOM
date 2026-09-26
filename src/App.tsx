import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { I18nProvider } from '@/contexts/I18nContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { CompanyProvider } from '@/contexts/CompanyContext'
import { BufferProvider } from '@/contexts/BufferContext'
import { AppSettingsProvider, useAppSettings } from '@/contexts/AppSettingsContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import AuthPage from '@/pages/Auth'

// Pages come from the enabled modules (src/modules/registry.tsx).
function AppRoutes() {
  const { modules } = useAppSettings()
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          {modules.flatMap(m => m.routes).map(route => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <I18nProvider>
        <AppSettingsProvider>
          <BrowserRouter>
            <AuthProvider>
              <CompanyProvider>
                <BufferProvider>
                  <AppRoutes />
                </BufferProvider>
              </CompanyProvider>
            </AuthProvider>
          </BrowserRouter>
        </AppSettingsProvider>
      </I18nProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}
