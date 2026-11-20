import { describe, expect, it } from 'vitest'
import { planUpscale, previewCrop, targetSize, TARGETS } from './upscalePlan'

const T = (id) => TARGETS.find((t) => t.id === id)

describe('upscale planning', () => {
  it('computes exact output sizes for scale and fit targets', () => {
    expect(targetSize(640, 360, T('x3'))).toEqual({ w: 1920, h: 1080 })
    expect(targetSize(640, 360, T('fit1080'))).toEqual({ w: 1920, h: 1080 })
    expect(targetSize(360, 640, T('fit1080'))).toEqual({ w: 1080, h: 1920 })
    expect(targetSize(3000, 2000, T('fit1080'))).toBeNull()
  })
  it('smart mode resizes once to the exact size, then sharpens', () => {
    const p = planUpscale({ width: 640, height: 360, method: 'smart', content: 'photo', target: T('x2') })
    expect(p.error).toBeNull()
    expect(p.ops.map((o) => o.op)).toEqual(['resize', 'cas', 'sharpen'])
    expect(p.ops[0]).toMatchObject({ width: 1280, height: 720 })
  })
  it('ai mode uses the nearest model factor and resizes to hit the exact target', () => {
    const p = planUpscale({ width: 640, height: 360, method: 'ai', content: 'photo', target: T('x3') })
    expect(p.ops[0]).toEqual({ op: 'aiUpscale', scale: 4 })
    expect(p.ops[1]).toMatchObject({ op: 'resize', width: 1920, height: 1080 })
    const exact = planUpscale({ width: 640, height: 360, method: 'ai', target: T('x2') })
    expect(exact.ops.some((o) => o.op === 'resize')).toBe(false)
  })
  it('cleans noise before enlarging for noisy sources', () => {
    const p = planUpscale({ width: 320, height: 240, method: 'smart', content: 'noisy', target: T('x2') })
    expect(p.ops[0].op).toBe('denoise')
  })
  it('warns about AI on UI content and rejects oversized or pointless targets', () => {
    expect(planUpscale({ width: 640, height: 360, method: 'ai', content: 'ui', target: T('x2') }).warnings.join(' ')).toMatch(/smear/)
    expect(planUpscale({ width: 5000, height: 4000, target: T('x4') }).error).toMatch(/megapixels/)
    expect(planUpscale({ width: 4000, height: 3000, target: T('fit1080') }).error).toMatch(/already/)
  })
  it('centers the preview crop', () => {
    expect(previewCrop(1000, 500, 100)).toEqual({ x: 450, y: 200, w: 100, h: 100 })
    expect(previewCrop(50, 40, 100)).toEqual({ x: 0, y: 0, w: 50, h: 40 })
  })
})
