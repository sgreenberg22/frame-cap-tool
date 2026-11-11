import { clipAt, cutRange, defaultClips, framePlan, isEdited, keepRange, moveClip, outputToSource, renderAudio, splitAt, totalDuration } from './clips'

describe('clips', () => {
  it('splits, cuts and keeps ranges', () => {
    let c = defaultClips(10)
    expect(isEdited(c, 10)).toBe(false)
    c = splitAt(c, 4)
    expect(c.map((x) => [x.in, x.out])).toEqual([
      [0, 4],
      [4, 10],
    ])
    c = cutRange(c, 3, 6)
    expect(c.map((x) => [x.in, x.out])).toEqual([
      [0, 3],
      [6, 10],
    ])
    expect(totalDuration(c)).toBe(7)
    expect(isEdited(c, 10)).toBe(true)
    expect(keepRange(c, 2, 7).map((x) => [x.in, x.out])).toEqual([
      [2, 3],
      [6, 7],
    ])
    expect(clipAt(c, 4)).toBe(-1)
    expect(splitAt(c, 4)).toBe(c)
  })
  it('accounts for speed and reordering', () => {
    const c = [
      { id: 'a', in: 0, out: 4, speed: 2, volume: 1 },
      { id: 'b', in: 6, out: 8, speed: 0.5, volume: 1 },
    ]
    expect(totalDuration(c)).toBe(6)
    expect(outputToSource(c, 1)).toEqual({ clip: 0, time: 2 })
    expect(outputToSource(c, 3)).toEqual({ clip: 1, time: 6.5 })
    expect(moveClip(c, 0, 1).map((x) => x.id)).toEqual(['b', 'a'])
    const plan = framePlan(c, 10)
    expect(plan).toHaveLength(60)
    expect(plan[1].time).toBeCloseTo(0.2)
    expect(plan[20]).toMatchObject({ clip: 1, time: 6 })
    expect(plan[59].t).toBeCloseTo(5.9)
  })
  it('renders audio with speed, volume and fades', () => {
    const sr = 100
    const src = new Float32Array(1000).fill(1)
    const [out] = renderAudio(
      [src],
      sr,
      [
        { in: 0, out: 4, speed: 2, volume: 0.5 },
        { in: 5, out: 6, speed: 1, volume: 1 },
      ],
      { fadeIn: 0.1 },
    )
    expect(out.length).toBe(300)
    expect(out[0]).toBe(0)
    expect(out[50]).toBeCloseTo(0.5)
    expect(out[250]).toBeCloseTo(1)
  })
})
