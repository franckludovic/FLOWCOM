import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { I18nProvider } from '@/contexts/I18nContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { CompanyProvider } from '@/contexts/CompanyContext'
import { BufferProvider } from '@/contexts/BufferContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import AuthPage from '@/pages/Auth'
import WorkspacePage from '@/pages/Workspace'
import OnboardingPage from '@/pages/Onboarding'
import MemoryPage from '@/pages/Memory'
import CalendarPage from '@/pages/Calendar'
import ContentPage from '@/pages/ContentGenerator'
import LibraryPage from '@/pages/Library'
import RoadmapPage from '@/pages/Roadmap'
import ReportPage from '@/pages/Report'
import StudioPage from '@/pages/Studio'
import PublishingHistoryPage from '@/pages/PublishingHistory'
import SettingsPage from '@/pages/Settings'

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <I18nProvider>
        <BrowserRouter>
          <AuthProvider>
            <CompanyProvider>
              <BufferProvider>
                <Routes>
                  <Route path="/auth" element={<AuthPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppShell />}>
                      <Route path="/workspace"          element={<WorkspacePage />} />
                      <Route path="/onboarding"         element={<OnboardingPage />} />
                      <Route path="/memory"             element={<MemoryPage />} />
                      <Route path="/calendar"           element={<CalendarPage />} />
                      <Route path="/content"            element={<ContentPage />} />
                      <Route path="/library"            element={<LibraryPage />} />
                      <Route path="/studio"             element={<StudioPage />} />
                      <Route path="/roadmap"            element={<RoadmapPage />} />
                      <Route path="/report"             element={<ReportPage />} />
                      <Route path="/publishing-history" element={<PublishingHistoryPage />} />
                      <Route path="/settings"           element={<SettingsPage />} />
                    </Route>
                  </Route>
                  <Route path="*" element={<Navigate to="/workspace" replace />} />
                </Routes>
              </BufferProvider>
            </CompanyProvider>
          </AuthProvider>
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}
