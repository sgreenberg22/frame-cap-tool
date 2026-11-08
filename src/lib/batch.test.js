import { applyNameTemplate, planBatch, sampleTimes, sortByCapture, toInt } from './batch'

describe('batch planning', () => {
  it('plans interval shots without drift', () => {
    const t = planBatch({ mode: 'interval', start: 1, count: 4, intervalMs: 100, duration: 10 })
    expect(t).toEqual([1, 1.1, 1.2, 1.3000000000000003].map((x) => expect.closeTo(x, 9)))
    expect(t).toHaveLength(4)
  })
  it('stops at the duration', () => {
    expect(planBatch({ mode: 'interval', start: 0, count: 50, intervalMs: 1000, duration: 3 })).toHaveLength(4)
  })
  it('spreads evenly including both ends', () => {
    expect(planBatch({ mode: 'spread', start: 0, end: 10, count: 3, duration: 10 })).toEqual([0, 5, 10])
  })
  it('captures every N frames', () => {
    expect(planBatch({ mode: 'frames', start: 0, count: 3, everyFrames: 15, fps: 30, duration: 10 })).toEqual([0, 0.5, 1])
  })
  it('handles in/out range mode', () => {
    expect(planBatch({ mode: 'range', start: 2, end: 3, intervalMs: 500, duration: 10 })).toEqual([2, 2.5, 3])
  })
  it('clamps bad inputs', () => {
    expect(toInt('', 5, 1, 10)).toBe(5)
    expect(toInt('999', 5, 1, 10)).toBe(10)
    expect(planBatch({ mode: 'interval', count: NaN, duration: 5 })).toEqual([])
  })
  it('samples by index and caps frames', () => {
    const t = sampleTimes(0, 1, 10, 5)
    expect(t).toHaveLength(11)
    expect(t[10]).toBeCloseTo(1)
    expect(sampleTimes(0, 1000, 50, 1000).length).toBeLessThanOrEqual(600)
  })
  it('sorts shots by capture order (fixes reversed GIFs)', () => {
    expect(sortByCapture([{ seq: 3 }, { seq: 1 }, { seq: 2 }]).map((s) => s.seq)).toEqual([1, 2, 3])
  })
  it('fills name templates safely', () => {
    expect(applyNameTemplate('{video}_{index}', { video: 'my clip', index: '007' })).toBe('my_clip_007')
    expect(applyNameTemplate('a/b:c', {})).toBe('a-b-c')
  })
})
