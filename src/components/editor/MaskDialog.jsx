import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../Modal'
import { cloneImage, localAdjust } from '../../lib/enhance'

const TOOLS = [
  ['brush', 'Brush', 'Paint the area to adjust'],
  ['erase', 'Erase', 'Remove parts of the mask'],
  ['linear', 'Gradient', 'Drag from where the effect is full to where it fades out'],
  ['radial', 'Circle', 'Drag from the centre outwards; softness sets the feathering'],
  ['colour', 'Similar colour', 'Click a colour to select everything like it'],
]
const SLIDERS = [
  ['exposure', 'Exposure', -3, 3, 0.05],
  ['contrast', 'Contrast', -100, 100, 1],
  ['saturation', 'Saturation', -100, 100, 1],
  ['warmth', 'Warmth', -100, 100, 1],
  ['highlights', 'Highlights', -100, 100, 1],
  ['shadows', 'Shadows', -100, 100, 1],
  ['sharpen', 'Sharpen', 0, 100, 1],
  ['blur', 'Blur', 0, 100, 1],
]
const MAX_PREVIEW = 900

const mk = (w, h) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/**
 * Local adjustments. Paint, gradient or colour-select the part of the photo to change, then
 * set the adjustments; they only apply where the mask is. The preview is live.
 */
export default function MaskDialog({ canvas, onApply, onClose }) {
  const [tool, setTool] = useState('brush')
  const [size, setSize] = useState(8)
  const [soft, setSoft] = useState(60)
  const [tol, setTol] = useState(30)
  const [adj, setAdj] = useState({})
  const [showMask, setShowMask] = useState(true)
  const [version, setVersion] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [hasM, setHasM] = useState(false)
  const stage = useRef(null)
  const view = useRef(null)
  const tint = useRef(null)
  const gesture = useRef(null)
  const undo = useRef([])

  const small = useMemo(() => {
    const s = Math.min(1, MAX_PREVIEW / Math.max(canvas.width, canvas.height))
    const c = mk(Math.max(2, Math.round(canvas.width * s)), Math.max(2, Math.round(canvas.height * s)))
    c.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0, c.width, c.height)
    return c
  }, [canvas])
  const w = small.width
  const h = small.height
  const mask = useMemo(() => mk(w, h), [w, h])
  const smallPixels = useMemo(() => small.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h), [small, w, h])

  const changed = useCallback(() => setVersion((v) => v + 1), [])
  const pushUndo = () => {
    undo.current.push(mask.getContext('2d').getImageData(0, 0, w, h))
    if (undo.current.length > 20) undo.current.shift()
    setCanUndo(true)
  }
  const doUndo = () => {
    const prev = undo.current.pop()
    if (prev) mask.getContext('2d').putImageData(prev, 0, 0)
    setCanUndo(undo.current.length > 0)
    changed()
  }

  // Live preview: adjusted pixels blended through the mask, plus a red tint showing the mask.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const v = view.current
      const t = tint.current
      if (!v || !t) return
      const m = mask.getContext('2d').getImageData(0, 0, w, h).data
      const alpha = new Uint8ClampedArray(w * h)
      let any = false
      for (let i = 0; i < alpha.length; i++) {
        alpha[i] = m[i * 4 + 3]
        if (alpha[i] > 2) any = true
      }
      setHasM(any)
      const out = cloneImage(smallPixels)
      localAdjust(out, { adj, mask: { data: alpha, width: w, height: h } })
      v.width = w
      v.height = h
      v.getContext('2d').putImageData(new ImageData(out.data, w, h), 0, 0)
      t.width = w
      t.height = h
      const tc = t.getContext('2d')
      if (showMask) {
        tc.drawImage(mask, 0, 0)
        tc.globalCompositeOperation = 'source-in'
        tc.fillStyle = 'rgba(255, 40, 80, 0.5)'
        tc.fillRect(0, 0, w, h)
        tc.globalCompositeOperation = 'source-over'
      }
    })
    return () => cancelAnimationFrame(id)
  }, [adj, version, showMask, mask, smallPixels, w, h])

  const pos = (e) => {
    const r = stage.current.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * h]
  }
  const radius = () => (Math.max(w, h) * size) / 200

  const stamp = (x, y, erase) => {
    const ctx = mask.getContext('2d')
    const r = radius()
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const inner = Math.max(0, 1 - soft / 100)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(Math.min(0.99, inner), 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    ctx.globalCompositeOperation = 'source-over'
  }
  const stroke = (a, b, erase) => {
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1])
    const step = Math.max(1, radius() * 0.25)
    const n = Math.max(1, Math.ceil(dist / step))
    for (let i = 1; i <= n; i++) stamp(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, erase)
  }

  const drawGradient = (g0, p0, p1) => {
    const ctx = mask.getContext('2d')
    ctx.putImageData(g0, 0, 0)
    let grad
    if (tool === 'linear') {
      grad = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1])
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
    } else {
      const r = Math.max(2, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]))
      grad = ctx.createRadialGradient(p0[0], p0[1], 0, p0[0], p0[1], r)
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(Math.min(0.99, Math.max(0, 1 - soft / 100)), 'rgba(255,255,255,1)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
    }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }

  const selectColour = (x, y) => {
    const d = smallPixels.data
    const i0 = (Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))) * 4
    const [r0, g0, b0] = [d[i0], d[i0 + 1], d[i0 + 2]]
    const limit = (tol / 100) * 160 + 8
    const out = new ImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      const dist = Math.hypot(d[i * 4] - r0, d[i * 4 + 1] - g0, d[i * 4 + 2] - b0)
      const a = dist <= limit ? 1 : dist >= limit * 1.4 ? 0 : 1 - (dist - limit) / (limit * 0.4)
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = 255
      out.data[i * 4 + 3] = a * 255
    }
    const tmp = mk(w, h)
    tmp.getContext('2d').putImageData(out, 0, 0)
    mask.getContext('2d').drawImage(tmp, 0, 0)
  }

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pushUndo()
    const p = pos(e)
    if (tool === 'brush' || tool === 'erase') {
      stamp(p[0], p[1], tool === 'erase')
      gesture.current = { last: p }
    } else if (tool === 'colour') {
      selectColour(p[0], p[1])
      gesture.current = null
    } else gesture.current = { p0: p, g0: mask.getContext('2d').getImageData(0, 0, w, h) }
    changed()
  }
  const move = (e) => {
    const g = gesture.current
    if (!g) return
    const p = pos(e)
    if (g.last) {
      stroke(g.last, p, tool === 'erase')
      g.last = p
    } else drawGradient(g.g0, g.p0, p)
    changed()
  }
  const up = () => {
    gesture.current = null
  }

  const clear = () => {
    pushUndo()
    mask.getContext('2d').clearRect(0, 0, w, h)
    changed()
  }
  const fill = () => {
    pushUndo()
    const ctx = mask.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    changed()
  }
  const invert = () => {
    pushUndo()
    const t = mk(w, h)
    const tc = t.getContext('2d')
    tc.fillStyle = '#fff'
    tc.fillRect(0, 0, w, h)
    tc.globalCompositeOperation = 'destination-out'
    tc.drawImage(mask, 0, 0)
    const ctx = mask.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(t, 0, 0)
    changed()
  }

  const hasAdj = Object.values(adj).some((v) => v)

  const apply = () => {
    // Scale the mask up to the full-size photo (smooth, so feathering survives).
    const full = mk(canvas.width, canvas.height)
    const fc = full.getContext('2d', { willReadFrequently: true })
    fc.imageSmoothingQuality = 'high'
    fc.drawImage(mask, 0, 0, full.width, full.height)
    const px = fc.getImageData(0, 0, full.width, full.height).data
    const alpha = new Uint8ClampedArray(full.width * full.height)
    for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3]
    onApply({ adj, mask: { data: alpha, width: full.width, height: full.height } })
  }

  const cur = TOOLS.find((t) => t[0] === tool)

  return (
    <Modal title="Local adjustments" onClose={onClose} size="xl">
      <div className="mask-layout">
        <div>
          <div className="row wrap gap-s" role="toolbar" aria-label="Mask tools" style={{ marginBottom: 8 }}>
            {TOOLS.map(([id, label, hint]) => (
              <button
                key={id}
                className={`btn secondary sm ${tool === id ? 'active' : ''}`}
                aria-pressed={tool === id}
                title={hint}
                onClick={() => setTool(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="mask-stage"
            ref={stage}
            style={{ aspectRatio: `${w} / ${h}` }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            role="application"
            aria-label="Photo. Paint the area to adjust."
          >
            <canvas ref={view} />
            <canvas ref={tint} className="mask-tint" />
          </div>
          <p className="muted small">{cur[2]}.</p>
          <div className="row wrap gap-s" style={{ alignItems: 'center' }}>
            <button className="btn secondary sm" onClick={doUndo} disabled={!canUndo}>
              Undo
            </button>
            <button className="btn secondary sm" onClick={fill}>
              Select all
            </button>
            <button className="btn secondary sm" onClick={clear}>
              Clear
            </button>
            <button className="btn secondary sm" onClick={invert}>
              Invert
            </button>
            <label className="row gap-s small">
              <input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} /> Show mask
            </label>
          </div>
        </div>
        <div className="stack">
          {(tool === 'brush' || tool === 'erase') && (
            <>
              <label className="field small">
                Brush size {size}%
                <input type="range" min="1" max="40" value={size} onChange={(e) => setSize(+e.target.value)} />
              </label>
              <label className="field small">
                Softness {soft}%
                <input type="range" min="0" max="100" value={soft} onChange={(e) => setSoft(+e.target.value)} />
              </label>
            </>
          )}
          {tool === 'radial' && (
            <label className="field small">
              Softness {soft}%
              <input type="range" min="0" max="100" value={soft} onChange={(e) => setSoft(+e.target.value)} />
            </label>
          )}
          {tool === 'colour' && (
            <label className="field small">
              Tolerance {tol}%
              <input type="range" min="0" max="100" value={tol} onChange={(e) => setTol(+e.target.value)} />
            </label>
          )}
          <strong>Adjust the masked area</strong>
          {SLIDERS.map(([k, label, min, max, step]) => (
            <label key={k} className="field small">
              <span className="row" style={{ justifyContent: 'space-between' }}>
                <span>{label}</span>
                <span className="mono">{adj[k] || 0}</span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={adj[k] || 0}
                onChange={(e) => setAdj((a) => ({ ...a, [k]: +e.target.value }))}
                onDoubleClick={() => setAdj((a) => ({ ...a, [k]: 0 }))}
                aria-label={label}
              />
            </label>
          ))}
          <div className="row gap-s">
            <button className="btn secondary sm" onClick={() => setAdj({})} disabled={!hasAdj}>
              Reset sliders
            </button>
            <span className="spacer" />
            <button className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" disabled={!hasAdj || !hasM} onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
