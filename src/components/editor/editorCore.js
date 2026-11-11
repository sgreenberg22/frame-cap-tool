// Editor document model. Geometry ops transform the base image AND remap object coordinates,
// so annotations stay put and adjustments are never baked in until export.
import { renderFiltered } from '../../lib/capture'
import { DEFAULT_FILTERS } from '../../lib/filters'

export const DEFAULT_ADJ = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  exposure: 0,
  temperature: 0,
  sharpen: 0,
  vibrance: 0,
  highlights: 0,
  shadows: 0,
  gamma: 1,
  tint: 0,
  vignette: 0,
  grain: 0,
  blur: 0,
  levelsBlack: 0,
  levelsWhite: 255,
  levelsMid: 1,
  curve: null,
}
export const BLEND_MODES = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'soft-light',
  'hard-light',
  'difference',
  'luminosity',
  'color',
]
export const blendOf = (o) => o.blend || (o.type === 'stroke' && o.mode === 'highlighter' ? 'multiply' : 'source-over')
export const DEFAULT_FRAME = { border: 0, borderColor: '#ffffff', radius: 0, shadow: 0, shadowColor: '#000000', background: '#ffffff' }

export function canvasFrom(src, w = src.width || src.naturalWidth, h = src.height || src.naturalHeight) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height)
  return c
}

export function blankCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** Adjusted base (GPU when available, CPU fallback for Safari). */
export function adjustBase(base, adj) {
  const isDefault = Object.keys(DEFAULT_ADJ).every((k) => adj[k] === DEFAULT_ADJ[k])
  if (isDefault) return base
  return renderFiltered(base, { ...DEFAULT_FILTERS, ...adj })
}

const isBox = (o) => ['rect', 'ellipse', 'line', 'arrow', 'pixelate', 'blur', 'spotlight'].includes(o.type)

export function bounds(o, ctx) {
  if (isBox(o)) return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) }
  if (o.type === 'stroke' || o.type === 'polygon') {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity
    for (const [x, y] of o.points) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
    const pad = (o.size || 4) / 2
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }
  }
  if (o.type === 'image') return { x: o.x, y: o.y, w: o.w, h: o.h }
  if (o.type === 'step') return { x: o.x - o.size, y: o.y - o.size, w: o.size * 2, h: o.size * 2 }
  if (o.type === 'emoji') return { x: o.x - o.size / 2, y: o.y - o.size / 2, w: o.size, h: o.size }
  if (o.type === 'text') {
    const lines = String(o.text).split('\n')
    let w = o.size * 0.6 * Math.max(...lines.map((l) => l.length), 1)
    if (ctx) {
      ctx.save()
      ctx.font = fontOf(o)
      w = Math.max(...lines.map((l) => ctx.measureText(l).width), 4)
      ctx.restore()
    }
    const h = lines.length * o.size * 1.25
    const x = o.align === 'center' ? o.x - w / 2 : o.align === 'right' ? o.x - w : o.x
    return { x: x - 6, y: o.y - 4, w: w + 12, h: h + 8 }
  }
  return { x: 0, y: 0, w: 0, h: 0 }
}

export const fontOf = (o) => `${o.weight || 700} ${o.size}px ${o.font || 'system-ui, sans-serif'}`

export function hitTest(objects, x, y, ctx) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i]
    if ((o.type === 'stroke' && o.mode === 'erase') || o.hidden || o.locked) continue
    const b = bounds(o, ctx)
    const tol = 6
    if (x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol) return o.id
  }
  return null
}

/** Apply a point mapping (and size scale) to an object. */
export function mapObject(o, fn, s = 1) {
  const m = { ...o }
  if (isBox(o)) {
    const [a, b] = fn(o.x1, o.y1)
    const [c, d] = fn(o.x2, o.y2)
    if (o.type === 'line' || o.type === 'arrow') Object.assign(m, { x1: a, y1: b, x2: c, y2: d })
    else Object.assign(m, { x1: Math.min(a, c), y1: Math.min(b, d), x2: Math.max(a, c), y2: Math.max(b, d) })
  } else if (o.points) m.points = o.points.map(([x, y, p]) => [...fn(x, y), p])
  else if (o.type === 'image') {
    const [a, b] = fn(o.x, o.y)
    const [c, d] = fn(o.x + o.w, o.y + o.h)
    Object.assign(m, { x: Math.min(a, c), y: Math.min(b, d), w: Math.abs(c - a), h: Math.abs(d - b) })
  } else {
    const [a, b] = fn(o.x, o.y)
    m.x = a
    m.y = b
  }
  if (o.size) m.size = o.size * s
  return m
}

export function translateObject(o, dx, dy) {
  return mapObject(o, (x, y) => [x + dx, y + dy])
}

export function scaleObject(o, sx, sy, ox, oy) {
  return mapObject(o, (x, y) => [ox + (x - ox) * sx, oy + (y - oy) * sy], Math.sqrt(Math.abs(sx * sy)))
}

/** Geometry operations: return { base, objects } */
export const geometry = {
  crop(doc, r) {
    const x = Math.round(Math.max(0, r.x)),
      y = Math.round(Math.max(0, r.y))
    const w = Math.round(Math.min(doc.base.width - x, r.w)),
      h = Math.round(Math.min(doc.base.height - y, r.h))
    const c = blankCanvas(w, h)
    c.getContext('2d').drawImage(doc.base, x, y, w, h, 0, 0, w, h)
    return { base: c, objects: doc.objects.map((o) => translateObject(o, -x, -y)) }
  },
  rotate90(doc, dir = 1) {
    const { width: W, height: H } = doc.base
    const c = blankCanvas(H, W)
    const ctx = c.getContext('2d')
    ctx.translate(H / 2, W / 2)
    ctx.rotate((dir * Math.PI) / 2)
    ctx.drawImage(doc.base, -W / 2, -H / 2)
    const fn = dir > 0 ? (x, y) => [H - y, x] : (x, y) => [y, W - x]
    return { base: c, objects: doc.objects.map((o) => mapObject(o, fn)) }
  },
  flip(doc, axis) {
    const { width: W, height: H } = doc.base
    const c = blankCanvas(W, H)
    const ctx = c.getContext('2d')
    ctx.translate(axis === 'h' ? W : 0, axis === 'v' ? H : 0)
    ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1)
    ctx.drawImage(doc.base, 0, 0)
    const fn = axis === 'h' ? (x, y) => [W - x, y] : (x, y) => [x, H - y]
    return { base: c, objects: doc.objects.map((o) => mapObject(o, fn)) }
  },
  resize(doc, w, h, quality = 'high') {
    const sx = w / doc.base.width,
      sy = h / doc.base.height
    const c = blankCanvas(w, h)
    const ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = quality !== 'pixelated'
    ctx.imageSmoothingQuality = quality === 'pixelated' ? 'low' : quality
    ctx.drawImage(doc.base, 0, 0, c.width, c.height)
    return { base: c, objects: doc.objects.map((o) => mapObject(o, (x, y) => [x * sx, y * sy], Math.sqrt(sx * sy))) }
  },
  pad(doc, px, color) {
    const { width: W, height: H } = doc.base
    const c = blankCanvas(W + px * 2, H + px * 2)
    const ctx = c.getContext('2d')
    if (color && color !== 'transparent') {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, c.width, c.height)
    }
    ctx.drawImage(doc.base, px, px)
    return { base: c, objects: doc.objects.map((o) => translateObject(o, px, px)) }
  },
  straighten(doc, deg) {
    const { width: W, height: H } = doc.base
    const a = (deg * Math.PI) / 180
    const [cw, ch] = rotatedRectWithMaxArea(W, H, a)
    const c = blankCanvas(cw, ch)
    const ctx = c.getContext('2d')
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate(a)
    ctx.drawImage(doc.base, -W / 2, -H / 2)
    const cos = Math.cos(a),
      sin = Math.sin(a)
    const fn = (x, y) => {
      const dx = x - W / 2,
        dy = y - H / 2
      return [dx * cos - dy * sin + c.width / 2, dx * sin + dy * cos + c.height / 2]
    }
    return { base: c, objects: doc.objects.map((o) => mapObject(o, fn)) }
  },
}

export function rotatedRectWithMaxArea(w, h, angle) {
  const sinA = Math.abs(Math.sin(angle)),
    cosA = Math.abs(Math.cos(angle))
  if (sinA < 1e-6) return [w, h]
  const long = Math.max(w, h),
    short = Math.min(w, h)
  if (short <= 2 * sinA * cosA * long || Math.abs(sinA - cosA) < 1e-10) {
    const x = 0.5 * short
    return w >= h ? [x / sinA, x / cosA] : [x / cosA, x / sinA]
  }
  const cos2a = cosA * cosA - sinA * sinA
  return [(w * cosA - h * sinA) / cos2a, (h * cosA - w * sinA) / cos2a]
}

/** Replay recorded ops (normalized) on another document, used for batch edits. */
export function replayOps(doc, ops) {
  let d = doc
  for (const op of ops) {
    const W = d.base.width,
      H = d.base.height
    let g
    if (op.type === 'crop') g = geometry.crop(d, { x: op.x * W, y: op.y * H, w: op.w * W, h: op.h * H })
    else if (op.type === 'rotate90') g = geometry.rotate90(d, op.dir)
    else if (op.type === 'flip') g = geometry.flip(d, op.axis)
    else if (op.type === 'resize') g = geometry.resize(d, Math.round(W * op.sx), Math.round(H * op.sy), op.quality)
    else if (op.type === 'pad') g = geometry.pad(d, Math.round(op.frac * Math.max(W, H)), op.color)
    else if (op.type === 'straighten') g = geometry.straighten(d, op.deg)
    if (g) d = { ...d, ...g }
  }
  return d
}

function drawArrowHead(ctx, x1, y1, x2, y2, size) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.max(10, size * 4)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - len * Math.cos(a - Math.PI / 7), y2 - len * Math.sin(a - Math.PI / 7))
  ctx.lineTo(x2 - len * Math.cos(a + Math.PI / 7), y2 - len * Math.sin(a + Math.PI / 7))
  ctx.closePath()
  ctx.fill()
}

function strokePath(ctx, o) {
  const pts = o.points
  if (!pts.length) return
  const pressure = o.pressure
  const base = o.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0][0], pts[0][1], (base * (pressure ? 0.4 + (pts[0][2] ?? 0.5) * 1.2 : 1)) / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  if (!pressure) {
    ctx.lineWidth = base
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2,
        my = (pts[i][1] + pts[i + 1][1]) / 2
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last[0], last[1])
    ctx.stroke()
    return
  }
  for (let i = 1; i < pts.length; i++) {
    const p = ((pts[i][2] ?? 0.5) + (pts[i - 1][2] ?? 0.5)) / 2
    ctx.lineWidth = base * (0.4 + p * 1.2)
    ctx.beginPath()
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1])
    ctx.lineTo(pts[i][0], pts[i][1])
    ctx.stroke()
  }
}

export function drawObject(ctx, o, source) {
  ctx.save()
  ctx.globalAlpha = o.opacity ?? 1
  ctx.strokeStyle = o.color
  ctx.fillStyle = o.color
  ctx.lineWidth = o.size || 4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  switch (o.type) {
    case 'stroke':
      if (o.mode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.globalAlpha = 1
        ctx.strokeStyle = ctx.fillStyle = '#000'
      } else if (o.mode === 'highlighter') {
        ctx.globalAlpha = o.opacity ?? 0.4
        ctx.lineCap = 'square'
      }
      if (o.hardness != null && o.hardness < 1 && o.mode !== 'erase') {
        ctx.shadowColor = o.color
        ctx.shadowBlur = o.size * (1 - o.hardness)
      }
      strokePath(ctx, o)
      break
    case 'rect':
    case 'ellipse': {
      const b = bounds(o)
      ctx.beginPath()
      if (o.type === 'rect') ctx.rect(b.x, b.y, b.w, b.h)
      else ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2)
      if (o.fill) {
        ctx.fillStyle = o.fill
        ctx.fill()
      }
      if (o.size > 0) ctx.stroke()
      break
    }
    case 'line':
    case 'arrow':
      ctx.beginPath()
      ctx.moveTo(o.x1, o.y1)
      ctx.lineTo(o.x2, o.y2)
      ctx.stroke()
      if (o.type === 'arrow') drawArrowHead(ctx, o.x1, o.y1, o.x2, o.y2, o.size)
      break
    case 'polygon':
      ctx.beginPath()
      o.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      if (o.closed !== false) ctx.closePath()
      if (o.fill) {
        ctx.fillStyle = o.fill
        ctx.fill()
      }
      ctx.stroke()
      break
    case 'text': {
      ctx.font = fontOf(o)
      ctx.textBaseline = 'top'
      ctx.textAlign = o.align || 'left'
      const lines = String(o.text).split('\n')
      if (o.bg) {
        const b = bounds(o, ctx)
        ctx.fillStyle = o.bg
        ctx.fillRect(b.x, b.y, b.w, b.h)
      }
      lines.forEach((line, i) => {
        const y = o.y + i * o.size * 1.25
        if (o.outline) {
          ctx.strokeStyle = o.outline
          ctx.lineWidth = Math.max(2, o.size / 8)
          ctx.strokeText(line, o.x, y)
        }
        ctx.fillStyle = o.color
        ctx.fillText(line, o.x, y)
      })
      break
    }
    case 'step':
      ctx.beginPath()
      ctx.arc(o.x, o.y, o.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = Math.max(2, o.size / 8)
      ctx.strokeStyle = '#fff'
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = `800 ${Math.round(o.size * 1.1)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(o.n), o.x, o.y + o.size * 0.05)
      break
    case 'emoji':
      ctx.font = `${o.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(o.char, o.x, o.y)
      break
    case 'image':
      ctx.drawImage(o.canvas, o.x, o.y, o.w, o.h)
      break
    case 'pixelate':
    case 'blur': {
      const b = bounds(o)
      if (b.w < 2 || b.h < 2 || !source) break
      ctx.globalAlpha = 1
      if (o.type === 'pixelate') {
        const block = Math.max(2, o.amount || 12)
        const sw = Math.max(1, Math.round(b.w / block)),
          sh = Math.max(1, Math.round(b.h / block))
        const tmp = blankCanvas(sw, sh)
        tmp.getContext('2d').drawImage(source, b.x, b.y, b.w, b.h, 0, 0, sw, sh)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(tmp, 0, 0, sw, sh, b.x, b.y, b.w, b.h)
      } else {
        // Strong blur via repeated downscale (works without ctx.filter)
        let cur = blankCanvas(b.w, b.h)
        cur.getContext('2d').drawImage(source, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h)
        const factor = Math.max(2, (o.amount || 12) / 2)
        const small = blankCanvas(b.w / factor, b.h / factor)
        const sctx = small.getContext('2d')
        sctx.imageSmoothingQuality = 'high'
        sctx.drawImage(cur, 0, 0, small.width, small.height)
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(small, b.x, b.y, b.w, b.h)
      }
      break
    }
    default:
      break
  }
  ctx.restore()
}

export function drawSpotlight(ctx, o) {
  const b = bounds(o)
  const { width: W, height: H } = ctx.canvas
  ctx.save()
  ctx.fillStyle = `rgba(0,0,0,${o.opacity ?? 0.6})`
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  if (o.shape === 'ellipse') ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2, true)
  else {
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x, b.y + b.h)
    ctx.lineTo(b.x + b.w, b.y + b.h)
    ctx.lineTo(b.x + b.w, b.y)
    ctx.closePath()
  }
  ctx.fill('evenodd')
  ctx.restore()
}

/** Composite the whole document into ctx (size = base size). */
export function composite(ctx, adjusted, objects, inkCanvas) {
  const { width: W, height: H } = ctx.canvas
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(adjusted, 0, 0)
  for (const o of objects) if (!o.hidden && (o.type === 'pixelate' || o.type === 'blur')) drawObject(ctx, o, adjusted)
  const ink = inkCanvas || blankCanvas(W, H)
  if (ink.width !== W || ink.height !== H) {
    ink.width = W
    ink.height = H
  }
  const ictx = ink.getContext('2d')
  ictx.clearRect(0, 0, W, H)
  let dirty = false
  const flush = (mode = 'source-over') => {
    if (!dirty) return
    ctx.save()
    ctx.globalCompositeOperation = mode
    ctx.drawImage(ink, 0, 0)
    ctx.restore()
    ictx.clearRect(0, 0, W, H)
    dirty = false
  }
  // Normal objects share one ink layer (so the eraser can remove them); blended objects composite on their own.
  for (const o of objects) {
    if (o.hidden || ['pixelate', 'blur', 'spotlight'].includes(o.type)) continue
    const mode = blendOf(o)
    if (mode !== 'source-over') {
      flush()
      drawObject(ictx, o)
      dirty = true
      flush(mode)
    } else {
      drawObject(ictx, o)
      dirty = true
    }
  }
  flush()
  for (const o of objects) if (!o.hidden && o.type === 'spotlight') drawSpotlight(ctx, o)
}

/** Final export: composite + optional border, rounded corners and drop shadow. */
export function exportCanvas(adjusted, objects, frame = DEFAULT_FRAME) {
  const W = adjusted.width,
    H = adjusted.height
  const c = blankCanvas(W, H)
  composite(c.getContext('2d'), adjusted, objects)
  const { border = 0, radius = 0, shadow = 0 } = frame
  if (!border && !radius && !shadow) return c
  const pad = shadow ? Math.round(shadow * 1.5) : 0
  const out = blankCanvas(W + border * 2 + pad * 2, H + border * 2 + pad * 2)
  const ctx = out.getContext('2d')
  if (shadow && frame.background && frame.background !== 'transparent') {
    ctx.fillStyle = frame.background
    ctx.fillRect(0, 0, out.width, out.height)
  }
  const x = pad,
    y = pad,
    w = W + border * 2,
    h = H + border * 2
  const r = Math.min(radius, w / 2, h / 2)
  const path = () => {
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
    else ctx.rect(x, y, w, h)
  }
  if (shadow) {
    ctx.save()
    ctx.shadowColor = frame.shadowColor || 'rgba(0,0,0,.5)'
    ctx.shadowBlur = shadow
    ctx.shadowOffsetY = shadow / 3
    ctx.fillStyle = border ? frame.borderColor : '#000'
    path()
    ctx.fill()
    ctx.restore()
  }
  ctx.save()
  path()
  ctx.clip()
  if (border) {
    ctx.fillStyle = frame.borderColor
    ctx.fillRect(x, y, w, h)
  }
  const ir = Math.max(0, r - border)
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x + border, y + border, W, H, ir)
  else ctx.rect(x + border, y + border, W, H)
  ctx.clip()
  ctx.drawImage(c, x + border, y + border)
  ctx.restore()
  return out
}

/** Scanline flood fill on composite pixels -> canvas mask filled with color. */
export function floodFill(srcCanvas, sx, sy, color, tolerance = 32) {
  const W = srcCanvas.width,
    H = srcCanvas.height
  const data = srcCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data
  sx = Math.floor(sx)
  sy = Math.floor(sy)
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null
  const i0 = (sy * W + sx) * 4
  const t = [data[i0], data[i0 + 1], data[i0 + 2], data[i0 + 3]]
  const tol2 = tolerance * tolerance * 3
  const match = (i) => {
    const dr = data[i] - t[0],
      dg = data[i + 1] - t[1],
      db = data[i + 2] - t[2]
    return dr * dr + dg * dg + db * db <= tol2
  }
  const mask = new Uint8Array(W * H)
  const stack = [[sx, sy]]
  while (stack.length) {
    const [x, y] = stack.pop()
    let lx = x
    while (lx >= 0 && !mask[y * W + lx] && match((y * W + lx) * 4)) lx--
    lx++
    let rx = x
    while (rx < W && !mask[y * W + rx] && match((y * W + rx) * 4)) rx++
    rx--
    for (let k = lx; k <= rx; k++) {
      mask[y * W + k] = 1
      if (y > 0 && !mask[(y - 1) * W + k] && match(((y - 1) * W + k) * 4)) stack.push([k, y - 1])
      if (y < H - 1 && !mask[(y + 1) * W + k] && match(((y + 1) * W + k) * 4)) stack.push([k, y + 1])
    }
    if (stack.length > 4_000_000) break
  }
  const out = blankCanvas(W, H)
  const octx = out.getContext('2d')
  const img = octx.createImageData(W, H)
  const m = /^#?([0-9a-f]{6})$/i.exec(color)
  const n = m ? parseInt(m[1], 16) : 0
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    img.data[p * 4] = r
    img.data[p * 4 + 1] = g
    img.data[p * 4 + 2] = b
    img.data[p * 4 + 3] = 255
  }
  octx.putImageData(img, 0, 0)
  return out
}

export const EMOJIS = [
  '👍',
  '👎',
  '❤️',
  '🔥',
  '⭐',
  '✅',
  '❌',
  '⚠️',
  '❓',
  '❗',
  '👀',
  '👉',
  '👈',
  '👆',
  '👇',
  '😂',
  '😮',
  '😎',
  '🎉',
  '💡',
  '📌',
  '🎯',
  '🚀',
  '💯',
]

/** Clone-stamp patch: pixels from `source` shifted by (dx, dy), masked by a soft brush stroke along `points`. */
export function clonePatch(source, points, size, dx, dy, hardness = 0.6) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  for (const [x, y] of points) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  const pad = size
  x0 = Math.floor(x0 - pad)
  y0 = Math.floor(y0 - pad)
  const w = Math.ceil(x1 + pad) - x0,
    h = Math.ceil(y1 + pad) - y0
  const c = blankCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.translate(-x0, -y0)
  drawObject(ctx, { type: 'stroke', mode: 'pen', color: '#000', size, opacity: 1, hardness, points })
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.drawImage(source, -(x0 - dx), -(y0 - dy))
  return { canvas: c, x: x0, y: y0, w, h }
}

export const LAYER_NAMES = {
  stroke: 'Brush stroke',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  polygon: 'Polygon',
  text: 'Text',
  step: 'Step',
  emoji: 'Sticker',
  image: 'Image patch',
  pixelate: 'Pixelate',
  blur: 'Blur',
  spotlight: 'Spotlight',
}
