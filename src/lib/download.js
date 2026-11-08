export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function downloadText(text, filename, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), filename)
}

export const extFor = (type) =>
  ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/apng': 'png', 'video/webm': 'webm', 'video/mp4': 'mp4' })[
    type
  ] || 'bin'

/** Zip files in the browser (images are already compressed, so store-only). */
export async function zipBlobs(files, onProgress) {
  const { zip } = await import('fflate')
  const entries = {}
  const used = new Set()
  let i = 0
  for (const f of files) {
    let name = f.name
    let k = 1
    while (used.has(name)) name = f.name.replace(/(\.\w+)?$/, `_${k++}$1`)
    used.add(name)
    entries[name] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }]
    onProgress?.(++i / files.length)
  }
  return new Promise((resolve, reject) =>
    zip(entries, { level: 0 }, (err, data) => (err ? reject(err) : resolve(new Blob([data], { type: 'application/zip' })))),
  )
}

export async function copyImageToClipboard(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard images are not supported in this browser')
  let png = blob
  if (blob.type !== 'image/png') {
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    c.getContext('2d').drawImage(bmp, 0, 0)
    png = await new Promise((r) => c.toBlob(r, 'image/png'))
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

export async function shareFiles(files, title = 'FrameCapture') {
  const fileObjs = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }))
  if (!navigator.canShare?.({ files: fileObjs })) throw new Error('Sharing files is not supported on this device')
  await navigator.share({ files: fileObjs, title })
}

export function canShareFiles() {
  try {
    return !!navigator.canShare?.({ files: [new File([new Blob(['x'])], 'x.png', { type: 'image/png' })] })
  } catch {
    return false
  }
}
