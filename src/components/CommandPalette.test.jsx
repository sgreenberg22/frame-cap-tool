import { describe, expect, it } from 'vitest'
import { parseChangelog, rank } from './CommandPalette'

const cmds = [
  { id: 'a', label: 'Capture frame', group: 'Studio' },
  { id: 'b', label: 'Go to Settings', group: 'Navigate' },
  { id: 'c', label: 'Theme: midnight', group: 'Appearance' },
]

describe('command palette', () => {
  it('requires every word and ranks earlier matches first', () => {
    expect(rank(cmds, 'set').map((c) => c.id)).toEqual(['b'])
    expect(rank(cmds, 'theme mid').map((c) => c.id)).toEqual(['c'])
    expect(rank(cmds, 'zzz')).toEqual([])
  })
  it('puts recently used commands first when the query is empty', () => {
    expect(rank(cmds, '', ['c', 'a'])[0].id).toBe('c')
  })
  it('parses the top changelog sections and strips markdown', () => {
    const out = parseChangelog('# Changelog\n\n## 2.0.0\n\n- **Bold** and `code`\n- plain\n\n## 1.0.0\n\n- old\n', 1)
    expect(out).toEqual([{ title: '2.0.0', items: ['Bold and code', 'plain'] }])
  })
})
