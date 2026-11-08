import { bounds, mapObject, rotatedRectWithMaxArea, scaleObject, translateObject, hitTest } from './editorCore'

describe('editor core', () => {
  it('computes bounds for shapes and strokes', () => {
    expect(bounds({ type: 'rect', x1: 10, y1: 20, x2: 0, y2: 0 })).toEqual({ x: 0, y: 0, w: 10, h: 20 })
    const b = bounds({
      type: 'stroke',
      size: 4,
      points: [
        [10, 10],
        [20, 30],
      ],
    })
    expect(b).toEqual({ x: 8, y: 8, w: 14, h: 24 })
  })
  it('translates and scales objects', () => {
    expect(translateObject({ type: 'step', x: 1, y: 2, size: 10 }, 5, 5)).toMatchObject({ x: 6, y: 7 })
    const s = scaleObject({ type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10, size: 4 }, 2, 2, 0, 0)
    expect(s).toMatchObject({ x2: 20, y2: 20, size: 8 })
  })
  it('maps points through a rotation (keeps annotations aligned after rotate 90)', () => {
    const W = 100,
      H = 50
    const o = mapObject({ type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 50 }, (x, y) => [H - y, x])
    expect(o).toMatchObject({ x1: 50, y1: 0, x2: 0, y2: 100 })
    expect(W).toBe(100)
  })
  it('finds the largest inscribed rectangle', () => {
    expect(rotatedRectWithMaxArea(100, 50, 0)).toEqual([100, 50])
    const [w, h] = rotatedRectWithMaxArea(100, 50, (10 * Math.PI) / 180)
    expect(w).toBeLessThan(100)
    expect(h).toBeLessThan(50)
  })
  it('hit-tests topmost first and skips erasers', () => {
    const objs = [
      { id: 'a', type: 'rect', x1: 0, y1: 0, x2: 50, y2: 50 },
      { id: 'b', type: 'rect', x1: 10, y1: 10, x2: 30, y2: 30 },
      { id: 'e', type: 'stroke', mode: 'erase', size: 10, points: [[20, 20]] },
    ]
    expect(hitTest(objs, 20, 20)).toBe('b')
    expect(hitTest(objs, 45, 45)).toBe('a')
    expect(hitTest(objs, 200, 200)).toBe(null)
  })
})
