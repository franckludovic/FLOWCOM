import { describe, expect, it } from 'vitest'
import { extractInlineToolCalls } from './assistant'

describe('extractInlineToolCalls', () => {
  it('turns a proposal written as a JSON code block into a tool call and removes it from the text', () => {
    const text = [
      'Aucune campagne n’a encore de performances mesurées.',
      '',
      'Proposez d’ajouter un premier post :',
      '',
      '```json',
      '{ "campaign_id": "f16a0465", "title": "Créer un post de lancement LinkedIn", "kind": "create_calendar_item", "items": [{ "date": "2026-09-26", "topic": "Lancement" }] }',
      '```',
    ].join('\n')
    const result = extractInlineToolCalls(text)
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0].name).toBe('propose_action')
    expect(result.calls[0].args.kind).toBe('create_calendar_item')
    expect(result.text).not.toContain('{')
    expect(result.text).toContain('Proposez d’ajouter un premier post')
  })

  it('handles a bare JSON object and the {name, arguments} shape', () => {
    const text = 'Here is the chart.\n{"name": "show_chart", "arguments": {"type": "bar", "title": "Reach", "labels": ["A"], "series": [{"name": "Reach", "values": [3]}]}}'
    const result = extractInlineToolCalls(text)
    expect(result.calls.map(c => c.name)).toEqual(['show_chart'])
    expect(result.text).toBe('Here is the chart.')
  })

  it('leaves ordinary answers and unrelated JSON alone', () => {
    const plain = 'Nothing to propose.'
    expect(extractInlineToolCalls(plain)).toEqual({ text: plain, calls: [] })
    const other = 'Example:\n```json\n{"foo": 1}\n```'
    expect(extractInlineToolCalls(other)).toEqual({ text: other, calls: [] })
  })
})
