import { describe, expect, it } from 'vitest'
import { encodeWav } from './wav'

describe('encodeWav', () => {
  it('writes a valid header and clamps samples', async () => {
    const blob = encodeWav([new Float32Array([0, 1, -1, 2]), new Float32Array([0, 0.5, -0.5, -2])], 48000)
    expect(blob.size).toBe(44 + 4 * 2 * 2)
    const ab = await new Promise((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.readAsArrayBuffer(blob)
    })
    const v = new DataView(ab)
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF')
    expect(v.getUint16(22, true)).toBe(2)
    expect(v.getUint32(24, true)).toBe(48000)
    expect(v.getInt16(44 + 4, true)).toBe(0x7fff) // ch0 sample 1 = +1
    expect(v.getInt16(44 + 8, true)).toBe(-0x8000) // ch0 sample 2 = -1
    expect(v.getInt16(44 + 12, true)).toBe(0x7fff) // clamped 2 -> 1
  })
})
