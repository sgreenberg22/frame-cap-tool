import { describe, expect, it } from 'vitest'
import { enhanceCanvas } from './enhanceClient'

describe('enhanceCanvas cancellation', () => {
  it('rejects with AbortError before doing any work when already cancelled', async () => {
    const ac = new AbortController()
    ac.abort()
    const canvas = { width: 8, height: 8, getContext: () => ({}) }
    await expect(enhanceCanvas(canvas, [{ op: 'aiUpscale', scale: 2 }], undefined, ac.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
