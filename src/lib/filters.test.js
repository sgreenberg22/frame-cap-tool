import {
  DEFAULT_FILTERS,
  applyFiltersToImageData,
  autoLevelsFromHistogram,
  curveToLut,
  isDefaultFilters,
  makeGrader,
  parseCube,
  toCssFilter,
  whiteBalanceFrom,
} from './filters'

const img = (pixels) => ({ width: pixels.length, height: 1, data: new Uint8ClampedArray(pixels.flat()) })

describe('filters', () => {
  it('detects defaults', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS })).toBe(true)
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, contrast: 120 })).toBe(false)
    expect(
      isDefaultFilters({
        ...DEFAULT_FILTERS,
        curve: [
          [0, 0],
          [255, 255],
        ],
      }),
    ).toBe(true)
  })
  it('identity grader leaves pixels unchanged', () => {
    const g = makeGrader(DEFAULT_FILTERS)
    const [r, gg, b, a] = g(0.2, 0.5, 0.8, 0.5, 0.5, 0.5)
    expect(r).toBeCloseTo(0.2)
    expect(gg).toBeCloseTo(0.5)
    expect(b).toBeCloseTo(0.8)
    expect(a).toBe(1)
  })
  it('grayscale makes channels equal', () => {
    const im = applyFiltersToImageData(img([[255, 0, 0, 255]]), { ...DEFAULT_FILTERS, grayscale: 100 })
    expect(im.data[0]).toBe(im.data[1])
    expect(im.data[1]).toBe(im.data[2])
  })
  it('invert flips values', () => {
    const im = applyFiltersToImageData(img([[10, 100, 200, 255]]), { ...DEFAULT_FILTERS, invert: 100 })
    expect([...im.data.slice(0, 3)]).toEqual([245, 155, 55])
  })
  it('chroma key makes the key color transparent', () => {
    const im = applyFiltersToImageData(
      img([
        [0, 255, 0, 255],
        [255, 0, 0, 255],
      ]),
      { ...DEFAULT_FILTERS, chromaEnabled: true, chromaColor: '#00ff00' },
    )
    expect(im.data[3]).toBe(0)
    expect(im.data[7]).toBe(255)
  })
  it('builds a monotone curve LUT', () => {
    const lut = curveToLut([
      [0, 0],
      [128, 180],
      [255, 255],
    ])
    expect(lut[0]).toBe(0)
    expect(lut[255]).toBe(255)
    expect(lut[128]).toBe(180)
    for (let i = 1; i < 256; i++) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1])
  })
  it('parses a .cube LUT', () => {
    const text = 'TITLE "id"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n'
    const lut = parseCube(text)
    expect(lut.size).toBe(2)
    expect(lut.title).toBe('id')
    expect(lut.data.length).toBe(24)
    expect(() => parseCube('LUT_3D_SIZE 2\n0 0 0\n')).toThrow()
  })
  it('makes a CSS fallback string', () => {
    expect(toCssFilter({ ...DEFAULT_FILTERS, exposure: 1, sepia: 50 })).toContain('brightness(200.0%)')
    expect(toCssFilter({ ...DEFAULT_FILTERS, sepia: 50 })).toContain('sepia(50%)')
  })
  it('computes white balance and auto levels', () => {
    const wb = whiteBalanceFrom([200, 180, 150])
    expect(wb.temperature).toBeLessThan(0)
    const hist = new Array(256).fill(0)
    for (let i = 30; i <= 200; i++) hist[i] = 10
    const lv = autoLevelsFromHistogram(hist)
    expect(lv.levelsBlack).toBeGreaterThanOrEqual(30)
    expect(lv.levelsWhite).toBeLessThanOrEqual(200)
  })
})
