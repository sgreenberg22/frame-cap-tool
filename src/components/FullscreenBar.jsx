import React, { useCallback, useEffect, useRef, useState } from 'react'
import { SPEED_PRESETS } from '../lib/config'
import { formatClock, formatTimecode } from '../lib/timecode'

const HIDE_AFTER_MS = 3000

/**
 * Controls shown on top of the player while it is fullscreen. Only the player
 * element goes fullscreen, so without this the transport, capture and editing
 * buttons would all be hidden. Auto-hides when the pointer is idle.
 */
export default function FullscreenBar({
  time,
  duration,
  fps,
  playing,
  speed,
  setSpeed,
  volume,
  muted,
  setVolume,
  toggleMute,
  onPlayPause,
  onStep,
  onJump,
  onSeek,
  onCapture,
  onBatch,
  batchRunning,
  onMarker,
  onSplit,
  inPoint,
  outPoint,
  setIn,
  setOut,
  loopRange,
  toggleLoop,
  onPip,
  pipSupported,
  onExit,
  shotCount,
  live,
  canSplit,
  recent = [],
  onOpenShot,
  markers = [],
  onSeekMarker,
  overlays,
  setOverlays,
  setRotate,
  flipH,
  setFlipH,
  flipV,
  setFlipV,
}) {
  const [visible, setVisible] = useState(true)
  const [flash, setFlash] = useState('')
  const timer = useRef(null)
  const hovering = useRef(false)
  const lastCount = useRef(shotCount)
  const root = useRef(null)
  const [drawer, setDrawer] = useState(false)
  const [count, setCount] = useState(0)
  const [hint, setHint] = useState(true)
  const [ripple, setRipple] = useState(null)
  const live_ = useRef(live)
  live_.current = live
  const fn = useRef({})
  fn.current = { onPlayPause, onJump }

  const wake = useCallback(() => {
    setVisible(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!hovering.current) setVisible(false)
    }, HIDE_AFTER_MS)
  }, [])

  useEffect(() => {
    wake()
    const evs = ['mousemove', 'pointerdown', 'touchstart', 'keydown']
    evs.forEach((e) => document.addEventListener(e, wake, { passive: true }))
    return () => {
      evs.forEach((e) => document.removeEventListener(e, wake))
      clearTimeout(timer.current)
    }
  }, [wake])

  // Double-click / double-tap on the video: centre toggles play, edges skip 5 s.
  useEffect(() => {
    const host = root.current?.parentElement
    if (!host) return
    const onDbl = (e) => {
      if (e.target.closest?.('.fs-bar button, .fs-bar input, .fs-drawer, .fs-strip')) return
      const r = host.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      let kind = 'play'
      if (x < 0.3 && !live_.current) kind = 'back'
      else if (x > 0.7 && !live_.current) kind = 'fwd'
      if (kind === 'play') fn.current.onPlayPause()
      else fn.current.onJump(kind === 'back' ? -5 : 5)
      setRipple({ kind, key: Date.now() })
      setTimeout(() => setRipple(null), 600)
    }
    host.addEventListener('dblclick', onDbl)
    return () => host.removeEventListener('dblclick', onDbl)
  }, [])

  useEffect(() => {
    const id = setTimeout(() => setHint(false), 2500)
    return () => clearTimeout(id)
  }, [])

  // Self-timer capture
  useEffect(() => {
    if (!count) return
    const id = setTimeout(() => {
      if (count === 1) onCapture()
      setCount(count - 1)
    }, 1000)
    return () => clearTimeout(id)
  }, [count, onCapture])

  // Fullscreen has no toast layer, so confirm captures inline.
  useEffect(() => {
    if (shotCount > lastCount.current) {
      setFlash(`Captured · ${shotCount} frame${shotCount === 1 ? '' : 's'}`)
      const id = setTimeout(() => setFlash(''), 1800)
      lastCount.current = shotCount
      return () => clearTimeout(id)
    }
    lastCount.current = shotCount
  }, [shotCount])

  const idx = Math.max(
    0,
    SPEED_PRESETS.findIndex((s) => Math.abs(s - speed) < 1e-3),
  )
  const cycleSpeed = () => setSpeed(SPEED_PRESETS[(idx + 1) % SPEED_PRESETS.length])

  return (
    <div
      className={`fs-bar ${visible ? 'show' : ''}`}
      role="toolbar"
      aria-label="Fullscreen controls"
      ref={root}
      onFocus={() => {
        hovering.current = true
        wake()
      }}
      onBlur={() => {
        hovering.current = false
        wake()
      }}
      onMouseEnter={() => {
        hovering.current = true
        wake()
      }}
      onMouseLeave={() => {
        hovering.current = false
        wake()
      }}
    >
      {flash && (
        <div className="fs-flash" role="status">
          {flash}
        </div>
      )}
      {hint && (
        <div className="fs-hint" role="note">
          Space play · ←/→ frame · S capture · M marker · double-click to play, double-tap edges to skip · Esc exit
        </div>
      )}
      {count > 0 && (
        <div className="fs-count" role="status" aria-live="assertive">
          {count}
        </div>
      )}
      {ripple && (
        <div className={`fs-ripple ${ripple.kind}`} key={ripple.key} aria-hidden="true">
          {ripple.kind === 'play' ? (playing ? '▶' : '❚❚') : ripple.kind === 'back' ? '«5' : '5»'}
        </div>
      )}
      <div className="fs-top">
        <button className="btn icon secondary" onClick={onExit} aria-label="Exit fullscreen" title="Exit fullscreen (Esc or F)">
          ✕
        </button>
        <span className="spacer" />
        <button className={`btn secondary sm ${drawer ? 'active' : ''}`} onClick={() => setDrawer((d) => !d)} aria-pressed={drawer} title="Markers">
          ⚑ {markers.length}
        </button>
        <span className="fs-badge">{shotCount} captured</span>
      </div>
      {drawer && (
        <aside className="fs-drawer" aria-label="Markers">
          <strong>Markers</strong>
          {markers.length === 0 && <p className="muted">No markers yet. Press M to add one.</p>}
          <ul>
            {markers.map((m) => (
              <li key={m.id}>
                <button onClick={() => onSeekMarker(m)}>
                  {m.label} · {formatClock(m.time, { ms: false })}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="fs-bottom">
        {recent.length > 0 && (
          <div className="fs-strip" aria-label="Recent captures">
            {recent.map((r) => (
              <button key={r.id} onClick={() => onOpenShot(r.id)} title={`Open frame at ${formatClock(r.time)}`}>
                <img src={r.thumbUrl || r.url} alt={`Frame at ${formatClock(r.time)}`} />
              </button>
            ))}
          </div>
        )}
        <input
          className="fs-scrub"
          type="range"
          min="0"
          max={duration || 0}
          step={1 / (fps || 30)}
          value={Math.min(time, duration || 0)}
          disabled={live || !duration}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          aria-label="Seek"
          style={{ '--p': `${duration ? (time / duration) * 100 : 0}%` }}
        />
        <div className="fs-row">
          <button className="btn icon secondary" onClick={() => onJump(-5)} disabled={live} aria-label="Back 5 seconds" title="Back 5 seconds">
            «5
          </button>
          <button className="btn icon secondary" onClick={() => onStep(-1)} disabled={live} aria-label="Previous frame" title="Previous frame (←)">
            ◀︎|
          </button>
          <button className="btn play" onClick={onPlayPause} aria-label={playing ? 'Pause' : 'Play'} title="Play/pause (Space)">
            {playing ? '❚❚' : '▶'}
          </button>
          <button className="btn icon secondary" onClick={() => onStep(1)} disabled={live} aria-label="Next frame" title="Next frame (→)">
            |▶︎
          </button>
          <button className="btn icon secondary" onClick={() => onJump(5)} disabled={live} aria-label="Forward 5 seconds" title="Forward 5 seconds">
            5»
          </button>
          <span className="fs-time">
            <strong>{formatTimecode(time, fps)}</strong>
            <span className="muted"> / {formatClock(duration || 0, { ms: false })}</span>
          </span>
          <span className="spacer" />
          <button className="btn secondary sm" onClick={cycleSpeed} disabled={live} title="Cycle playback speed">
            {speed}×
          </button>
          <button className="btn icon secondary" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title="Mute (U)">
            {muted || volume === 0 ? '🔇' : '🔊'}
          </button>
          <input
            type="range"
            className="vol"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Volume"
          />
        </div>
        <div className="fs-row">
          <button className="btn capture" onClick={onCapture} title="Capture frame (S)">
            <span aria-hidden="true">◉</span> Capture
          </button>
          <button className="btn secondary sm" onClick={() => setCount(count ? 0 : 3)} title="Capture after a 3-2-1 countdown">
            ⏱ {count ? 'Cancel' : 'Timer'}
          </button>
          <button className={`btn secondary sm ${batchRunning ? 'active' : ''}`} onClick={onBatch} title="Run batch capture (B)">
            {batchRunning ? 'Stop batch' : 'Batch'}
          </button>
          <button className="btn secondary sm" onClick={onMarker} title="Add marker (M)">
            ⚑ Marker
          </button>
          <span className="divider" />
          <button className="btn secondary sm" onClick={setIn} disabled={live} title="Set in point (I)">
            In{inPoint != null ? ` ${formatClock(inPoint)}` : ''}
          </button>
          <button className="btn secondary sm" onClick={setOut} disabled={live} title="Set out point (O)">
            Out{outPoint != null ? ` ${formatClock(outPoint)}` : ''}
          </button>
          <button
            className={`btn secondary sm ${loopRange ? 'active' : ''}`}
            onClick={toggleLoop}
            disabled={live}
            aria-pressed={loopRange}
            title="Loop between in and out (A)"
          >
            A-B loop
          </button>
          {canSplit && (
            <button className="btn secondary sm" onClick={onSplit} disabled={live} title="Split clip at playhead (C)">
              ✂ Split
            </button>
          )}
          <span className="spacer" />
          <button
            className={`btn secondary sm ${overlays.thirds || overlays.safe ? 'active' : ''}`}
            onClick={() =>
              setOverlays((o) => (!o.thirds && !o.safe ? { ...o, thirds: true } : o.thirds ? { ...o, thirds: false, safe: true } : { ...o, safe: false }))
            }
            title="Cycle guides: thirds, safe area, off"
          >
            ▦ Guides
          </button>
          <button className="btn icon secondary" onClick={() => setRotate((r) => (r + 90) % 360)} aria-label="Rotate 90 degrees" title="Rotate 90°">
            ↻
          </button>
          <button
            className={`btn icon secondary ${flipH ? 'active' : ''}`}
            onClick={() => setFlipH((f) => !f)}
            aria-label="Flip horizontally"
            title="Flip horizontally"
          >
            ⇆
          </button>
          <button
            className={`btn icon secondary ${flipV ? 'active' : ''}`}
            onClick={() => setFlipV((f) => !f)}
            aria-label="Flip vertically"
            title="Flip vertically"
          >
            ⇅
          </button>
          {pipSupported && (
            <button className="btn icon secondary" onClick={onPip} aria-label="Picture in picture" title="Picture-in-picture">
              ⧉
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
