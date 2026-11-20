// Main-thread API for enhancement: worker for classic algorithms, lazy-loaded ESRGAN (TensorFlow.js) for AI upscaling.
let worker = null
let seq = 0
const pending = new Map()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../workers/enhance.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const job = pending.get(e.data.id)
    if (!job) return
    if (e.data.type === 'progress') job.onProgress?.(e.data.p)
    else {
      pending.delete(e.data.id)
      if (e.data.type === 'done') job.resolve(e.data.image)
      else job.reject(new Error(e.data.message))
    }
  }
  worker.onerror = (e) => {
    for (const job of pending.values()) job.reject(new Error(e.message || 'Enhancement worker failed'))
    pending.clear()
    worker = null
  }
  return worker
}

function call(msg, transfer, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject, onProgress })
    getWorker().postMessage({ ...msg, id }, transfer)
  })
}

function toImageData(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height)
}

function toCanvas(image) {
  const c = document.createElement('canvas')
  c.width = image.width
  c.height = image.height
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  return c
}

import { MAX_OUTPUT_PIXELS } from './upscalePlan'
export { MAX_OUTPUT_PIXELS }

let lastBackend = ''
/** Name of the TensorFlow.js backend used by the last AI upscale (webgl, cpu, ...), or ''. */
export const aiBackend = () => lastBackend

const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' })

let upscalers = {}
/** ESRGAN super-resolution. The model and TensorFlow.js are served from this site and loaded only on first use. */
export async function aiUpscale(canvas, scale = 2, onProgress, signal) {
  if (signal?.aborted) throw abortError()
  if (canvas.width * canvas.height * scale * scale > MAX_OUTPUT_PIXELS) throw new Error('Result would be too large. Use 2× or crop first.')
  if (!upscalers[scale]) {
    const [{ default: Upscaler }, def] = await Promise.all([
      import('upscaler'),
      scale === 4 ? import('@upscalerjs/esrgan-slim/4x') : import('@upscalerjs/esrgan-slim/2x'),
    ])
    upscalers[scale] = new Upscaler({ model: { ...def.default, path: `/models/esrgan-slim/x${scale}/model.json` } })
  }
  const hasAlpha = (() => {
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true
    return false
  })()
  let src
  try {
    src = await upscalers[scale].upscale(canvas, {
      output: 'base64',
      patchSize: 64,
      padding: 4,
      awaitNextFrame: true,
      signal,
      progress: (p) => onProgress?.(p),
    })
  } catch (e) {
    // UpscalerJS reports cancellation as a generic error; surface it as a normal abort.
    if (signal?.aborted) throw abortError()
    throw e
  }
  if (signal?.aborted) throw abortError()
  try {
    lastBackend = (await import('@tensorflow/tfjs')).getBackend() || ''
  } catch {
    lastBackend = ''
  }
  const img = new Image()
  await new Promise((res, rej) => {
    img.onload = res
    img.onerror = () => rej(new Error('AI upscale produced no image'))
    img.src = src
  })
  const out = document.createElement('canvas')
  out.width = img.naturalWidth
  out.height = img.naturalHeight
  const ctx = out.getContext('2d')
  ctx.drawImage(img, 0, 0)
  if (hasAlpha) {
    // The model works on RGB only. Carry the original transparency across, enlarged smoothly.
    const a = document.createElement('canvas')
    a.width = out.width
    a.height = out.height
    const actx = a.getContext('2d')
    actx.imageSmoothingQuality = 'high'
    actx.drawImage(canvas, 0, 0, out.width, out.height)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(a, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  }
  return out
}

/**
 * Apply ops to a canvas and return a new canvas.
 * ops: [{op:'autoEnhance', strength}, {op:'smartUpscale', scale}, {op:'aiUpscale', scale}, ...]
 */
export async function enhanceCanvas(canvas, ops, onProgress, signal) {
  let cur = canvas
  let batch = []
  const total = ops.length
  let done = 0
  const flush = async () => {
    if (!batch.length) return
    const up = batch.reduce((m, o) => (o.op === 'smartUpscale' ? m * (o.scale || 2) : m), 1)
    const resized = batch.filter((o) => o.op === 'resize').reduce((m, o) => Math.max(m, o.width * o.height), 0)
    if (Math.max(cur.width * cur.height * up * up, resized) > MAX_OUTPUT_PIXELS)
      throw new Error('Result would be too large. Use a smaller scale or crop first.')
    const img = toImageData(cur)
    const n = batch.length
    const base = done
    const out = await call({ type: 'ops', ops: batch, image: { data: img.data.buffer, width: img.width, height: img.height } }, [img.data.buffer], (p) =>
      onProgress?.((base + p * n) / total),
    )
    done += n
    batch = []
    cur = toCanvas(out)
  }
  for (const o of ops) {
    if (signal?.aborted) throw abortError()
    if (o.op === 'aiUpscale') {
      await flush()
      const base = done
      cur = await aiUpscale(cur, o.scale || 2, (p) => onProgress?.((base + p) / total), signal)
      done++
    } else batch.push(o)
  }
  await flush()
  if (signal?.aborted) throw abortError()
  onProgress?.(1)
  return cur
}

/** Median/mean stack of same-size canvases (temporal denoise for stills from video). */
export async function stackCanvases(canvases, mode = 'median') {
  const images = canvases.map((c) => {
    const img = toImageData(c)
    return { data: img.data.buffer, width: img.width, height: img.height }
  })
  const out = await call(
    { type: 'stack', mode, images },
    images.map((i) => i.data),
  )
  return toCanvas(out)
}

export const UPSCALE_CHOICES = [
  ['smart2', 'Smart upscale 2×', [{ op: 'smartUpscale', scale: 2 }], 'Lanczos + adaptive sharpening. Fast.'],
  ['smart4', 'Smart upscale 4×', [{ op: 'smartUpscale', scale: 4 }], 'Lanczos + adaptive sharpening. Fast.'],
  ['ai2', 'AI upscale 2×', [{ op: 'aiUpscale', scale: 2 }], 'ESRGAN neural network. Rebuilds detail; slower.'],
  ['ai4', 'AI upscale 4×', [{ op: 'aiUpscale', scale: 4 }], 'ESRGAN neural network. Best for small images; slowest.'],
]
