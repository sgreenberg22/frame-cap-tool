/**
 * HEIC / HEIF (iPhone photos) decoding. Safari decodes these natively; everywhere else
 * a small self-hosted libheif WebAssembly build is loaded on first use (nothing is uploaded).
 */
export const isHeic = (file) => /hei[cf]/i.test(file.type || '') || /\.(heic|heif|hif)$/i.test(file.name || '')

let libPromise

async function loadLib() {
  if (!libPromise) {
    libPromise = (async () => {
      const [mod, url] = await Promise.all([import('libheif-js/libheif-wasm/libheif.js'), import('libheif-js/libheif-wasm/libheif.wasm?url')])
      const factory = mod.default || mod
      const wasmBinary = await (await fetch(url.default)).arrayBuffer()
      return factory({ wasmBinary })
    })()
    libPromise.catch(() => (libPromise = null))
  }
  return libPromise
}

/** Decode a HEIC/HEIF file to a canvas. */
export async function decodeHeic(file) {
  // Native path (Safari, newer Chromium on some OSes).
  try {
    const bmp = await createImageBitmap(file)
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    c.getContext('2d').drawImage(bmp, 0, 0)
    bmp.close?.()
    return c
  } catch {
    /* fall through to WASM */
  }
  const lib = await loadLib()
  const decoder = new lib.HeifDecoder()
  const images = decoder.decode(new Uint8Array(await readBuffer(file)))
  if (!images?.length) throw new Error('This HEIC file has no readable image')
  const image = images[0]
  const w = image.get_width()
  const h = image.get_height()
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  const data = ctx.createImageData(w, h)
  await new Promise((resolve, reject) => image.display(data, (out) => (out ? resolve(out) : reject(new Error('HEIC decoding failed')))))
  ctx.putImageData(data, 0, 0)
  image.free?.()
  return c
}

const readBuffer = (file) =>
  file.arrayBuffer
    ? file.arrayBuffer()
    : new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result)
        r.onerror = () => rej(r.error)
        r.readAsArrayBuffer(file)
      })
