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
}) {
  const [visible, setVisible] = useState(true)
  const [flash, setFlash] = useState('')
  const timer = useRef(null)
  const hovering = useRef(false)
  const lastCount = useRef(shotCount)

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
      <div className="fs-top">
        <button className="btn icon secondary" onClick={onExit} aria-label="Exit fullscreen" title="Exit fullscreen (Esc or F)">
          ✕
        </button>
        <span className="spacer" />
        <span className="fs-badge">{shotCount} captured</span>
      </div>
      <div className="fs-bottom">
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
