import React, { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../Modal'
import { isValidQuad, perspectiveCanvas, quadSize } from '../../lib/perspective'

const INSET = [
  [0.1, 0.1],
  [0.9, 0.1],
  [0.9, 0.9],
  [0.1, 0.9],
]
const NAMES = ['top-left', 'top-right', 'bottom-right', 'bottom-left']

/** Drag four corners onto a slanted rectangle (a page, sign, building face) to straighten it. */
export default function PerspectiveDialog({ canvas, onApply, onClose }) {
  const [quad, setQuad] = useState(INSET)
  const stage = useRef(null)
  const view = useRef(null)
  const prev = useRef(null)
  const drag = useRef(-1)

  // A small copy keeps the live preview fast on big photos.
  const small = useMemo(() => {
    const s = Math.min(1, 420 / Math.max(canvas.width, canvas.height))
    const c = document.createElement('canvas')
    c.width = Math.max(2, Math.round(canvas.width * s))
    c.height = Math.max(2, Math.round(canvas.height * s))
    c.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0, c.width, c.height)
    return c
  }, [canvas])

  const valid = isValidQuad(quad)
  const [outW, outH] = quadSize(quad.map(([x, y]) => [x * canvas.width, y * canvas.height]))

  useEffect(() => {
    const v = view.current
    if (!v) return
    v.width = small.width
    v.height = small.height
    v.getContext('2d').drawImage(small, 0, 0)
  }, [small])

  useEffect(() => {
    const p = prev.current
    if (!p || !valid) return
    const id = setTimeout(() => {
      const { canvas: out } = perspectiveCanvas(small, quad)
      p.width = out.width
      p.height = out.height
      p.getContext('2d').drawImage(out, 0, 0)
    }, 30)
    return () => clearTimeout(id)
  }, [quad, small, valid])

  const move = (e) => {
    if (drag.current < 0) return
    const r = stage.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    setQuad((q) => q.map((p, i) => (i === drag.current ? [x, y] : p)))
  }
  const nudge = (i, dx, dy) => setQuad((q) => q.map((p, k) => (k === i ? [Math.min(1, Math.max(0, p[0] + dx)), Math.min(1, Math.max(0, p[1] + dy))] : p)))

  return (
    <Modal title="Perspective correction" onClose={onClose} size="lg">
      <p className="muted">Drag the four corners onto the corners of the thing that should be rectangular. The preview shows the straightened result.</p>
      <div className="persp-wrap">
        <div
          className="persp-stage"
          ref={stage}
          onPointerMove={move}
          onPointerUp={() => (drag.current = -1)}
          onPointerCancel={() => (drag.current = -1)}
          style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
        >
          <canvas ref={view} aria-label="Photo" />
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="persp-lines" aria-hidden="true">
            <polygon points={quad.map((p) => p.join(',')).join(' ')} className={valid ? '' : 'bad'} />
          </svg>
          {quad.map(([x, y], i) => (
            <button
              key={i}
              className="persp-handle"
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              aria-label={`${NAMES[i]} corner`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                drag.current = i
              }}
              onKeyDown={(e) => {
                const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
                if (k) {
                  e.preventDefault()
                  nudge(i, (k[0] * (e.shiftKey ? 10 : 1)) / 500, (k[1] * (e.shiftKey ? 10 : 1)) / 500)
                }
              }}
            />
          ))}
        </div>
        <div className="persp-preview">
          {valid ? (
            <canvas ref={prev} aria-label="Straightened preview" />
          ) : (
            <p role="alert">The corners cross over. Move them so they form a four-sided shape.</p>
          )}
        </div>
      </div>
      <div className="row wrap gap-s" style={{ marginTop: 12, alignItems: 'center' }}>
        <span className="muted">
          Result {outW} × {outH}px
        </span>
        <span className="spacer" />
        <button className="btn secondary" onClick={() => setQuad(INSET)}>
          Reset
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn" disabled={!valid} onClick={() => onApply(quad)}>
          Apply
        </button>
      </div>
    </Modal>
  )
}
