// Runs enhancement ops off the main thread.
import { runOps, stackFrames } from '../lib/enhance'

self.onmessage = (e) => {
  const { id, type } = e.data
  try {
    let out
    if (type === 'stack') {
      out = stackFrames(
        e.data.images.map((im) => ({ data: new Uint8ClampedArray(im.data), width: im.width, height: im.height })),
        e.data.mode,
      )
    } else {
      const img = { data: new Uint8ClampedArray(e.data.image.data), width: e.data.image.width, height: e.data.image.height }
      out = runOps(img, e.data.ops, (p) => self.postMessage({ id, type: 'progress', p }))
    }
    self.postMessage({ id, type: 'done', image: { data: out.data.buffer, width: out.width, height: out.height } }, [out.data.buffer])
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || String(err) })
  }
}
