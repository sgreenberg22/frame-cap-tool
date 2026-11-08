// @vitest-environment node
import { assembleAPNG, crc32, readChunks } from './apng'

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}
function fakePng() {
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, 4)
  new DataView(ihdr.buffer).setUint32(4, 3)
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array([1, 2, 3])),
    chunk('IEND', new Uint8Array()),
  ]
  const total = parts.reduce((a, p) => a + p.length, 0)
  const buf = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    buf.set(p, o)
    o += p.length
  }
  return buf
}

describe('apng', () => {
  it('computes the standard CRC32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('assembles animation chunks in order', async () => {
    const blob = assembleAPNG([fakePng(), fakePng()], [100, 200], 0)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const types = readChunks(bytes).map((c) => c.type)
    expect(types).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'IEND'])
    const actl = readChunks(bytes).find((c) => c.type === 'acTL').data
    expect(new DataView(actl.buffer, actl.byteOffset).getUint32(0)).toBe(2)
  })
})
