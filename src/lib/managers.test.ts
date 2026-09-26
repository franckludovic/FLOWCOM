import { describe, expect, it } from 'vitest'
import { isManager } from './managers'

describe('isManager', () => {
  const domains = ['africauniv.tech']
  const emails = ['partner@gmail.com']

  it('accepts the team domain and its subdomains', () => {
    expect(isManager('tankeu.frank@africauniv.tech', domains, emails)).toBe(true)
    expect(isManager('Someone@Mail.AfricaUniv.Tech', domains, emails)).toBe(true)
  })

  it('accepts listed addresses', () => {
    expect(isManager('partner@gmail.com', domains, emails)).toBe(true)
  })

  it('refuses clients and look-alike domains', () => {
    expect(isManager('client@company.cm', domains, emails)).toBe(false)
    expect(isManager('x@notafricauniv.tech', domains, emails)).toBe(false)
    expect(isManager('africauniv.tech', domains, emails)).toBe(false)
    expect(isManager(undefined, domains, emails)).toBe(false)
  })

  it('refuses everyone when no team is configured', () => {
    expect(isManager('tankeu.frank@africauniv.tech', [], [])).toBe(false)
  })
})
