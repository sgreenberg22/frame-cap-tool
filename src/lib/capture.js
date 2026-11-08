// Frame rendering pipeline used for screenshots and GIF frames.
import { createRenderer, supportsWebGL2 } from './gl'
import { applyFiltersToImageData, isDefaultFilters } from './filters'
import { formatClock } from './timecode'

let captureRenderer = null
function getCaptureRenderer() {
  if (captureRenderer !== null) return captureRenderer || null
  if (!supportsWebGL2()) {
    captureRenderer = false
    return null
  }
  try {
    const c = document.createElement('canvas')
    captureRenderer = createRenderer(c, { preserve: true }) || false
  } catch {
    captureRenderer = false
  }
  return captureRenderer || null
}

export function sourceSize(src) {
  return {
    w: src.videoWidth || src.naturalWidth || src.width || 0,
    h: src.videoHeight || src.naturalHeight || src.height || 0,
  }
}

function make2d(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** Draw the source with filters applied at full source resolution. Returns a canvas-like drawable. */
export function renderFiltered(src, filters, { lut } = {}) {
  const { w, h } = sourceSize(src)
  if (!filters || isDefaultFilters(filters)) {
    const c = make2d(w, h)
    c.getContext('2d').drawImage(src, 0, 0, w, h)
    return c
  }
  const r = getCaptureRenderer()
  if (r) {
    r.render(src, filters, { width: w, height: h, sourceWidth: w, sourceHeight: h, lut, seed: 0.5 })
    const c = make2d(w, h)
    c.getContext('2d').drawImage(r.canvas, 0, 0)
    return c
  }
  // CPU fallback: works where neither WebGL2 nor ctx.filter are available (older Safari).
  const c = make2d(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(src, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  applyFiltersToImageData(img, filters, { lut3d: lut })
  ctx.putImageData(img, 0, 0)
  return c
}

const POS = {
  'top-left': [0, 0],
  'top-right': [1, 0],
  'bottom-left': [0, 1],
  'bottom-right': [1, 1],
  center: [0.5, 0.5],
}

export function drawLabel(ctx, text, { position = 'bottom-right', size = 24, color = '#ffffff', opacity = 1, box = true }) {
  const { width: W, height: H } = ctx.canvas
  const pad = Math.round(size * 0.6)
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  const tw = ctx.measureText(text).width
  const [px, py] = POS[position] || POS['bottom-right']
  const bw = tw + pad * 2
  const bh = size + pad
  const x = px * (W - bw) + (px === 0 ? pad : px === 1 ? -pad : 0)
  const y = py * (H - bh) + (py === 0 ? pad : py === 1 ? -pad : 0)
  if (box) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(x, y, bw, bh)
  }
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(2, size / 8)
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  if (!box) ctx.strokeText(text, x + pad, y + bh / 2)
  ctx.fillText(text, x + pad, y + bh / 2)
  ctx.restore()
}

/**
 * Full capture pipeline.
 * opts: { filters, bake, lut, roi:{x,y,w,h} normalized, rotate:0|90|180|270, flipH, flipV,
 *         scale, maxWidth, time, burn:{...}, watermark:{text,opacity,position}, caption }
 */
export function renderCapture(src, opts = {}) {
  const base = opts.bake === false ? renderFiltered(src, null) : renderFiltered(src, opts.filters, { lut: opts.lut })
  let sx = 0,
    sy = 0,
    sw = base.width,
    sh = base.height
  if (opts.roi && opts.roi.w > 0.001 && opts.roi.h > 0.001) {
    sx = Math.round(opts.roi.x * base.width)
    sy = Math.round(opts.roi.y * base.height)
    sw = Math.max(1, Math.round(opts.roi.w * base.width))
    sh = Math.max(1, Math.round(opts.roi.h * base.height))
  }
  const rot = (((opts.rotate || 0) % 360) + 360) % 360
  const swap = rot === 90 || rot === 270
  let scale = opts.scale || 1
  const outW0 = swap ? sh : sw
  if (opts.maxWidth && outW0 * scale > opts.maxWidth) scale = opts.maxWidth / outW0
  const ow = Math.max(1, Math.round((swap ? sh : sw) * scale))
  const oh = Math.max(1, Math.round((swap ? sw : sh) * scale))
  const out = make2d(ow, oh)
  const ctx = out.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.save()
  ctx.translate(ow / 2, oh / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.scale(opts.flipH ? -1 : 1, opts.flipV ? -1 : 1)
  const dw = sw * scale,
    dh = sh * scale
  ctx.drawImage(base, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
  const unit = Math.max(ow, oh) / 1280
  if (opts.burn?.enabled) {
    drawLabel(ctx, formatClock(opts.time || 0), {
      position: opts.burn.position,
      size: Math.max(10, Math.round((opts.burn.size || 24) * unit)),
      color: opts.burn.color,
    })
  }
  if (opts.watermark?.text) {
    drawLabel(ctx, opts.watermark.text, {
      position: opts.watermark.position,
      size: Math.max(10, Math.round(22 * unit)),
      opacity: opts.watermark.opacity ?? 0.5,
      box: false,
    })
  }
  if (opts.caption) {
    drawLabel(ctx, opts.caption, { position: 'center', size: Math.max(12, Math.round(28 * unit)) })
  }
  return out
}

export function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
  return new Promise((resolve, reject) => {
    if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality }).then(resolve, reject)
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality)
  })
}

/** Make a small JPEG thumbnail for the gallery grid. */
export async function makeThumb(drawable, width = 320) {
  const { w, h } = sourceSize(drawable)
  const s = Math.min(1, width / (w || 1))
  const c = make2d(w * s, h * s)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(drawable, 0, 0, c.width, c.height)
  return canvasToBlob(c, 'image/jpeg', 0.8)
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })
}

export async function blobToDrawable(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    return await loadImage(url)
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Seek a media element reliably: resolves on seeked, same-time, or timeout. */
export function seekVideo(video, time, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (!video) return reject(new Error('No video loaded'))
    const dur = Number.isFinite(video.duration) ? video.duration : time
    const target = Math.min(Math.max(0, time), dur)
    if (Math.abs(video.currentTime - target) < 1e-4 && video.readyState >= 2) return resolve()
    let done = false
    const finish = (err) => {
      if (done) return
      done = true
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      err ? reject(err) : resolve()
    }
    const onSeeked = () => {
      // Wait for the frame to actually be presented when the API is available.
      if (video.requestVideoFrameCallback) {
        let settled = false
        const fallback = setTimeout(() => !settled && finish(), 120)
        video.requestVideoFrameCallback(() => {
          settled = true
          clearTimeout(fallback)
          finish()
        })
      } else requestAnimationFrame(() => requestAnimationFrame(() => finish()))
    }
    const onError = () => finish(new Error('Video error while seeking'))
    const timer = setTimeout(() => finish(), timeoutMs)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = target
  })
}
