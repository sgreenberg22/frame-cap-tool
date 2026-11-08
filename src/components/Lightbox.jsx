import React, { useState } from 'react'
import Modal from './Modal'
import { formatClock } from '../lib/timecode'

export default function Lightbox({ shots, index, onIndex, onClose, onEdit, compare = false }) {
  const [zoom, setZoom] = useState(1)
  const [mode, setMode] = useState('slider')
  const [pos, setPos] = useState(50)
  const s = shots[index]
  if (!s) return null

  function onKeyDown(e) {
    if (compare) return
    if (e.key === 'ArrowRight' && index < shots.length - 1) {
      onIndex(index + 1)
      setZoom(1)
      e.preventDefault()
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      onIndex(index - 1)
      setZoom(1)
      e.preventDefault()
    }
    if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(8, z * 1.5))
    if (e.key === '-') setZoom((z) => Math.max(1, z / 1.5))
  }

  if (compare) {
    const [a, b] = shots
    return (
      <Modal title={`Compare ${formatClock(a.time)} and ${formatClock(b.time)}`} onClose={onClose} size="xl">
        <div className="seg" role="group" aria-label="Compare mode">
          <button className={`seg-btn ${mode === 'slider' ? 'on' : ''}`} onClick={() => setMode('slider')}>
            Slider
          </button>
          <button className={`seg-btn ${mode === 'side' ? 'on' : ''}`} onClick={() => setMode('side')}>
            Side by side
          </button>
        </div>
        {mode === 'side' ? (
          <div className="compare-side">
            <img src={a.url} alt={`Frame at ${formatClock(a.time)}`} />
            <img src={b.url} alt={`Frame at ${formatClock(b.time)}`} />
          </div>
        ) : (
          <div className="compare-slider">
            <img src={b.url} alt={`Frame at ${formatClock(b.time)}`} />
            <img src={a.url} alt={`Frame at ${formatClock(a.time)}`} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} className="top" />
            <div className="compare-line" style={{ left: `${pos}%` }} />
            <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(+e.target.value)} aria-label="Compare position" />
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal title={`${s.name} · ${index + 1} of ${shots.length}`} onClose={onClose} size="xl" onKeyDown={onKeyDown}>
      <div className="lightbox" onWheel={(e) => setZoom((z) => Math.min(8, Math.max(1, z * Math.exp(-e.deltaY * 0.002))))}>
        <img
          src={s.url}
          alt={`Frame at ${formatClock(s.time)}${s.caption ? `: ${s.caption}` : ''}`}
          style={{ transform: `scale(${zoom})`, cursor: zoom > 1 ? 'zoom-out' : 'zoom-in' }}
          onClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
        />
      </div>
      <div className="row between wrap gap-s">
        <button className="btn secondary" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous frame">
          ← Prev
        </button>
        <span className="muted">
          {formatClock(s.time)} · {s.width}×{s.height}
          {s.caption ? ` · ${s.caption}` : ''} · {Math.round(zoom * 100)}%
        </span>
        <div className="row gap-s">
          {onEdit && (
            <button className="btn sm" onClick={() => onEdit(s.id)}>
              Edit
            </button>
          )}
          <button className="btn secondary" onClick={() => onIndex(index + 1)} disabled={index === shots.length - 1} aria-label="Next frame">
            Next →
          </button>
        </div>
      </div>
    </Modal>
  )
}
