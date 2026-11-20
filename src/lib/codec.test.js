import { describe, expect, it } from 'vitest'
import { explainDecodeFailure, sniffCodecBytes } from './codec'

const bytes = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))

describe('codec sniffing', () => {
  it('finds HEVC and H.264 markers', () => {
    expect(sniffCodecBytes(bytes('....ftypqt  ....moov....hvc1....'))).toEqual(['hevc'])
    expect(sniffCodecBytes(bytes('xxavc1xxhev1'))).toEqual(expect.arrayContaining(['h264', 'hevc']))
  })
  it('returns nothing for unrelated bytes', () => {
    expect(sniffCodecBytes(bytes('hello world'))).toEqual([])
  })
  it('explains HEVC with fix steps, but not when H.264 is also present', () => {
    expect(explainDecodeFailure(['hevc']).title).toMatch(/HEVC/)
    expect(explainDecodeFailure(['hevc']).steps.length).toBeGreaterThan(1)
    expect(explainDecodeFailure(['hevc', 'h264']).title).toMatch(/could not be played/)
  })
  it('falls back to a generic message', () => {
    expect(explainDecodeFailure([], 'x.avi').title).toMatch(/not supported/)
    expect(explainDecodeFailure([], 'x.mp4').title).toMatch(/could not be played/)
  })
})
