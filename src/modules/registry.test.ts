import { describe, expect, it } from 'vitest'
import { enabledModules, enabledTools, navigation } from './registry'

describe('module registry', () => {
  it('enables every module when none are configured', () => {
    expect(enabledModules(null).map(m => m.id)).toEqual(['core', 'pilotage', 'campaigns', 'marketing-studio', 'assistant'])
  })

  it('always keeps the core module', () => {
    expect(enabledModules(['campaigns']).map(m => m.id)).toEqual(['core', 'campaigns'])
  })

  it('builds sidebar sections from the enabled modules and drops empty ones', () => {
    const sections = navigation(enabledModules(['marketing-studio']))
    expect(sections.map(s => s.id)).toEqual(['pilotage', 'marketing', 'entreprise'])
    expect(sections.find(s => s.id === 'marketing')!.items.map(i => i.to)).toEqual(['/calendar', '/content', '/library', '/studio', '/publishing-history'])
    expect(sections.some(s => s.id === 'clients')).toBe(false)
  })

  it('gives the assistant only the tools of the enabled modules', () => {
    const tools = enabledTools(enabledModules(['campaigns', 'assistant']))
    expect(tools.has('list_campaigns')).toBe(true)
    expect(tools.has('show_chart')).toBe(true)
    expect(tools.has('get_recent_posts')).toBe(false)
  })
})
