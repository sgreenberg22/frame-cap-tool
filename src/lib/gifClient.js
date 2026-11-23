/** Encode canvases to a GIF in a worker. frames: [{ canvas, delay (ms) }]. */
export function encodeGifFrames(
  frames,
  { colors = 256, dither = 'none', loops = 0, optimize = false, globalPalette = false, transparency = false } = {},
  onProgress,
  signal,
) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/gif.worker.js', import.meta.url), { type: 'module' })
    const stop = (err) => {
      worker.terminate()
      reject(err)
    }
    if (signal) {
      if (signal.aborted) return stop(new DOMException('Cancelled', 'AbortError'))
      signal.addEventListener('abort', () => stop(new DOMException('Cancelled', 'AbortError')), { once: true })
    }
    worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'progress') onProgress?.(m.p, m.stage)
      else if (m.type === 'done') {
        worker.terminate()
        resolve(new Blob([m.buffer], { type: 'image/gif' }))
      } else if (m.type === 'error') stop(new Error(m.message))
    }
    worker.onerror = (e) => stop(new Error(e.message || 'GIF encoder failed'))
    worker.postMessage({
      type: 'start',
      count: frames.length,
      options: { colors, dither, globalPalette, optimize, loops, transparency: { enabled: transparency, threshold: 128 } },
    })
    ;(async () => {
      for (const f of frames) {
        if (signal?.aborted) return
        const img = f.canvas.getContext('2d').getImageData(0, 0, f.canvas.width, f.canvas.height)
        worker.postMessage({ type: 'frame', data: img.data.buffer, width: img.width, height: img.height, delay: f.delay }, [img.data.buffer])
        await new Promise((r) => setTimeout(r))
      }
      worker.postMessage({ type: 'finish' })
    })()
  })
}
