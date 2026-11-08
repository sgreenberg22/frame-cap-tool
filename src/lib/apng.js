// Minimal APNG encoder: re-uses the browser PNG encoder per frame and stitches frames into an animated PNG.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function readChunks(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const chunks = []
  let off = 8
  while (off < buf.length) {
    const len = view.getUint32(off)
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7])
    chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) })
    off += 12 + len
  }
  return chunks
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/**
 * frames: array of PNG Uint8Arrays (same dimensions), delays in ms, loops (0 = infinite)
 */
export function assembleAPNG(pngs, delays, loops = 0) {
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]
  const first = readChunks(pngs[0])
  const ihdr = first.find((c) => c.type === 'IHDR')
  const iv = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength)
  const w = iv.getUint32(0)
  const h = iv.getUint32(4)
  parts.push(chunk('IHDR', ihdr.data))
  const actl = new Uint8Array(8)
  new DataView(actl.buffer).setUint32(0, pngs.length)
  new DataView(actl.buffer).setUint32(4, loops)
  parts.push(chunk('acTL', actl))
  let seq = 0
  pngs.forEach((png, i) => {
    const fctl = new Uint8Array(26)
    const fv = new DataView(fctl.buffer)
    fv.setUint32(0, seq++)
    fv.setUint32(4, w)
    fv.setUint32(8, h)
    fv.setUint32(12, 0)
    fv.setUint32(16, 0)
    fv.setUint16(20, Math.max(1, Math.round(delays[i] || 100)))
    fv.setUint16(22, 1000)
    fctl[24] = 0 // dispose none
    fctl[25] = 0 // blend source
    parts.push(chunk('fcTL', fctl))
    const idats = (i === 0 ? first : readChunks(png)).filter((c) => c.type === 'IDAT')
    for (const d of idats) {
      if (i === 0) parts.push(chunk('IDAT', d.data))
      else {
        const fd = new Uint8Array(4 + d.data.length)
        new DataView(fd.buffer).setUint32(0, seq++)
        fd.set(d.data, 4)
        parts.push(chunk('fdAT', fd))
      }
    }
  })
  parts.push(chunk('IEND', new Uint8Array(0)))
  return new Blob(parts, { type: 'image/apng' })
}

export async function encodeAPNG(canvases, delays, loops = 0, onProgress) {
  const pngs = []
  for (let i = 0; i < canvases.length; i++) {
    const blob = await new Promise((r) => canvases[i].toBlob(r, 'image/png'))
    pngs.push(new Uint8Array(await blob.arrayBuffer()))
    onProgress?.((i + 1) / canvases.length)
  }
  return assembleAPNG(pngs, delays, loops)
}
