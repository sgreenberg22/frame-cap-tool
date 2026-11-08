import React, { useEffect, useRef, useState } from 'react'
import { curveToLut } from '../lib/filters'

/** Draggable master tone curve. Click to add a point, drag to move, double-click a point to remove it. */
export default function CurveEditor({ value, onChange }) {
  const pts =
    value && value.length >= 2
      ? value
      : [
          [0, 0],
          [255, 255],
        ]
  const svgRef = useRef(null)
  const [drag, setDrag] = useState(-1)
  const [path, setPath] = useState('')

  useEffect(() => {
    const lut = curveToLut(pts)
    let d = ''
    for (let x = 0; x < 256; x += 2) d += `${x === 0 ? 'M' : 'L'}${x} ${255 - lut[x]}`
    setPath(d + `L255 ${255 - lut[255]}`)
  }, [JSON.stringify(pts)]) // eslint-disable-line react-hooks/exhaustive-deps

  const toPt = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return [
      Math.round(Math.min(255, Math.max(0, ((e.clientX - r.left) / r.width) * 255))),
      Math.round(Math.min(255, Math.max(0, 255 - ((e.clientY - r.top) / r.height) * 255))),
    ]
  }

  function down(e) {
    const p = toPt(e)
    let idx = pts.findIndex(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 14)
    let next = pts
    if (idx < 0) {
      next = [...pts, p].sort((a, b) => a[0] - b[0])
      idx = next.findIndex((q) => q === p)
      onChange(next)
    }
    setDrag(idx)
    svgRef.current.setPointerCapture?.(e.pointerId)
  }
  function move(e) {
    if (drag < 0) return
    const p = toPt(e)
    const next = pts.map((q, i) =>
      i === drag
        ? [
            i === 0
              ? Math.min(p[0], pts[1][0] - 1)
              : i === pts.length - 1
                ? Math.max(p[0], pts[i - 1][0] + 1)
                : Math.min(Math.max(p[0], pts[i - 1][0] + 1), pts[i + 1][0] - 1),
            p[1],
          ]
        : q,
    )
    onChange(next)
  }
  function remove(i) {
    if (i === 0 || i === pts.length - 1) return
    onChange(pts.filter((_, k) => k !== i))
  }

  return (
    <div className="curve">
      <svg
        ref={svgRef}
        viewBox="0 0 255 255"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => setDrag(-1)}
        role="img"
        aria-label="Tone curve editor"
      >
        {[64, 128, 192].map((g) => (
          <g key={g} className="grid">
            <line x1={g} y1="0" x2={g} y2="255" />
            <line x1="0" y1={g} x2="255" y2={g} />
          </g>
        ))}
        <line className="diag" x1="0" y1="255" x2="255" y2="0" />
        <path d={path} className="line" />
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={255 - y}
            r="6"
            className="pt"
            onDoubleClick={(e) => {
              e.stopPropagation()
              remove(i)
            }}
          />
        ))}
      </svg>
      <div className="row between">
        <small className="muted">Click to add, drag to shape, double-click to remove.</small>
        <button className="btn secondary sm" onClick={() => onChange(null)}>
          Reset curve
        </button>
      </div>
    </div>
  )
}
