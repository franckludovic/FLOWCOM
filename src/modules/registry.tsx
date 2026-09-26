// The module registry: the single source for what each FlowCom module brings
// (pages, sidebar entries and their section, assistant tools). The router, the
// sidebar and the assistant read it, filtered by the installation's enabled
// modules. See docs/product-brief.md, "How modules compose".
import { ManagerOnly } from '@/components/ManagerOnly'
import type { ReactNode } from 'react'
import {
  BarChart2, BookOpen, Brain, CalendarDays, FileText, History, LayoutDashboard, Map, Megaphone, Send, UserCircle,
  type LucideIcon,
} from 'lucide-react'
import type { TranslationKey } from '@/i18n/fr'
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
import CampaignsPage from '@/pages/Campaigns'

export type SectionId = 'pilotage' | 'marketing' | 'clients' | 'entreprise'
export type ModuleId = 'core' | 'marketing-studio' | 'campaigns' | 'pilotage' | 'assistant'

export const SECTIONS: Array<{ id: SectionId; labelKey: TranslationKey }> = [
  { id: 'pilotage', labelKey: 'nav.section.pilotage' },
  { id: 'marketing', labelKey: 'nav.section.marketing' },
  { id: 'clients', labelKey: 'nav.section.clients' },
  { id: 'entreprise', labelKey: 'nav.section.entreprise' },
]

export interface NavEntry {
  to: string
  labelKey: TranslationKey
  icon: LucideIcon
  section: SectionId
}

export interface ModuleDefinition {
  id: ModuleId
  labelKey: TranslationKey
  // Core is always enabled and cannot be switched off.
  core?: boolean
  nav: NavEntry[]
  routes: Array<{ path: string; element: ReactNode }>
  // Names of the assistant tools this module contributes.
  tools: string[]
}

export const MODULES: ModuleDefinition[] = [
  {
    id: 'core',
    labelKey: 'module.core',
    core: true,
    nav: [
      { to: '/workspace', labelKey: 'nav.workspace', icon: LayoutDashboard, section: 'pilotage' },
      { to: '/memory', labelKey: 'nav.memory', icon: Brain, section: 'entreprise' },
      { to: '/onboarding', labelKey: 'nav.profile', icon: UserCircle, section: 'entreprise' },
    ],
    routes: [
      { path: '/workspace', element: <WorkspacePage /> },
      { path: '/memory', element: <MemoryPage /> },
      { path: '/onboarding', element: <OnboardingPage /> },
      { path: '/settings', element: <ManagerOnly><SettingsPage /></ManagerOnly> },
    ],
    tools: ['get_company_context'],
  },
  {
    id: 'pilotage',
    labelKey: 'module.pilotage',
    nav: [
      { to: '/report', labelKey: 'nav.report', icon: BarChart2, section: 'pilotage' },
      { to: '/roadmap', labelKey: 'nav.roadmap', icon: Map, section: 'pilotage' },
    ],
    routes: [
      { path: '/report', element: <ReportPage /> },
      { path: '/roadmap', element: <RoadmapPage /> },
    ],
    tools: ['list_notes'],
  },
  {
    id: 'campaigns',
    labelKey: 'module.campaigns',
    nav: [
      { to: '/campaigns', labelKey: 'nav.campaigns', icon: Megaphone, section: 'marketing' },
    ],
    routes: [
      { path: '/campaigns', element: <CampaignsPage /> },
      { path: '/campaigns/:id', element: <CampaignsPage /> },
    ],
    tools: ['list_campaigns', 'get_campaign_performance', 'list_zones'],
  },
  {
    id: 'marketing-studio',
    labelKey: 'module.marketingStudio',
    nav: [
      { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays, section: 'marketing' },
      { to: '/content', labelKey: 'nav.content', icon: FileText, section: 'marketing' },
      { to: '/library', labelKey: 'nav.library', icon: BookOpen, section: 'marketing' },
      { to: '/studio', labelKey: 'nav.studio', icon: Send, section: 'marketing' },
      { to: '/publishing-history', labelKey: 'nav.publishingHistory', icon: History, section: 'marketing' },
    ],
    routes: [
      { path: '/calendar', element: <CalendarPage /> },
      { path: '/content', element: <ContentPage /> },
      { path: '/library', element: <LibraryPage /> },
      { path: '/studio', element: <StudioPage /> },
      { path: '/publishing-history', element: <PublishingHistoryPage /> },
    ],
    tools: ['list_content', 'get_recent_posts'],
  },
  {
    id: 'assistant',
    labelKey: 'module.assistant',
    nav: [],
    routes: [],
    // The display and proposal tools come with the assistant itself.
    tools: ['show_chart', 'show_table', 'show_images', 'propose_action', 'open_in_studio'],
  },
]

export const ALL_MODULES: ModuleId[] = MODULES.map(m => m.id)

export function enabledModules(ids: ModuleId[] | null | undefined): ModuleDefinition[] {
  const set = new Set<ModuleId>(ids?.length ? ids : ALL_MODULES)
  return MODULES.filter(m => m.core || set.has(m.id))
}

// Sidebar sections with their entries; empty sections are left out.
export function navigation(modules: ModuleDefinition[]): Array<{ id: SectionId; labelKey: TranslationKey; items: NavEntry[] }> {
  return SECTIONS
    .map(section => ({ ...section, items: modules.flatMap(m => m.nav.filter(n => n.section === section.id)) }))
    .filter(section => section.items.length > 0)
}

export function enabledTools(modules: ModuleDefinition[]): Set<string> {
  return new Set(modules.flatMap(m => m.tools))
}
