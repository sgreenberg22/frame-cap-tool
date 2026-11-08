import React, { useState } from 'react'
import { LIMITS, SPEED_PRESETS } from '../lib/config'
import { formatClock, formatTimecode, parseTime, secondsToFrames } from '../lib/timecode'
import { useT } from '../lib/i18n'

export default function Transport({
  v,
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
  preservePitch,
  togglePitch,
  onPlayPause,
  onStep,
  onJump,
  onSeek,
  inPoint,
  outPoint,
  setIn,
  setOut,
  clearRange,
  loopRange,
  toggleLoop,
  onFullscreen,
  onPip,
  pipSupported,
  onCapture,
  onBatch,
  batchRunning,
  live,
  timeUnit,
}) {
  const t = useT()
  const [jump, setJump] = useState('')
  const [jumpErr, setJumpErr] = useState(false)
  const disabled = !v

  function submitJump(e) {
    e.preventDefault()
    const s = parseTime(jump, fps)
    if (!Number.isFinite(s)) return setJumpErr(true)
    setJumpErr(false)
    onSeek(s)
    setJump('')
  }

  return (
    <div className="transport">
      <div className="row wrap gap-s">
        <button
          className="btn icon secondary"
          onClick={() => onJump(-5)}
          disabled={disabled || live}
          title="Back 5 seconds (Shift+←)"
          aria-label="Back 5 seconds"
        >
          «5
        </button>
        <button
          className="btn icon secondary"
          onClick={() => onStep(-1)}
          disabled={disabled || live}
          title="Previous frame (← or ,)"
          aria-label="Previous frame"
        >
          ◀︎|
        </button>
        <button
          className="btn play"
          onClick={onPlayPause}
          disabled={disabled}
          title="Play/pause (Space or K)"
          aria-label={playing ? t('studio.pause') : t('studio.play')}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="btn icon secondary" onClick={() => onStep(1)} disabled={disabled || live} title="Next frame (→ or .)" aria-label="Next frame">
          |▶︎
        </button>
        <button
          className="btn icon secondary"
          onClick={() => onJump(5)}
          disabled={disabled || live}
          title="Forward 5 seconds (Shift+→)"
          aria-label="Forward 5 seconds"
        >
          5»
        </button>
        <div className="timecode" aria-live="off" title="Timecode HH:MM:SS:FF">
          <strong>{timeUnit === 'frames' ? `f${secondsToFrames(time, fps)}` : formatTimecode(time, fps)}</strong>
          <span className="muted"> / {timeUnit === 'frames' ? `f${secondsToFrames(duration || 0, fps)}` : formatClock(duration || 0, { ms: false })}</span>
        </div>
        <span className="spacer" />
        <button className="btn capture" onClick={onCapture} disabled={disabled} title="Capture frame (S). Hold S for burst." aria-label={t('studio.capture')}>
          <span aria-hidden="true">◉</span> <span className="hide-sm">{t('studio.capture')}</span>
        </button>
        <button
          className={`btn secondary ${batchRunning ? 'active' : ''}`}
          onClick={onBatch}
          disabled={disabled}
          title="Run batch capture with the current batch settings (B)"
        >
          {batchRunning ? 'Stop batch' : t('studio.batch')}
        </button>
      </div>
      <div className="row wrap gap-s" style={{ marginTop: 8 }}>
        <div className="seg" role="group" aria-label="Speed presets">
          {SPEED_PRESETS.map((s) => (
            <button
              key={s}
              className={`seg-btn ${Math.abs(speed - s) < 1e-3 ? 'on' : ''}`}
              onClick={() => setSpeed(s)}
              disabled={disabled || live}
              aria-pressed={Math.abs(speed - s) < 1e-3}
            >
              {s}×
            </button>
          ))}
        </div>
        <label className="inline" title="Playback speed ([ and ] to change)">
          <span className="sr-only">Custom speed</span>
          <input
            type="number"
            className="num"
            min={LIMITS.speedMin}
            max={LIMITS.speedMax}
            step="0.05"
            value={speed}
            disabled={disabled || live}
            onChange={(e) => {
              const n = parseFloat(e.target.value)
              if (Number.isFinite(n)) setSpeed(n)
            }}
            aria-label="Custom speed"
          />
          ×
        </label>
        <label className="inline check" title="Keep audio pitch when slowed or sped up">
          <input type="checkbox" checked={preservePitch} onChange={togglePitch} /> Keep pitch
        </label>
        <span className="divider" />
        <button className="btn icon secondary" onClick={toggleMute} disabled={disabled} aria-label={muted ? 'Unmute' : 'Mute'} title="Mute (U)">
          {muted || volume === 0 ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          aria-label="Volume"
          className="vol"
          disabled={disabled}
        />
        <span className="divider" />
        <button className="btn secondary sm" onClick={setIn} disabled={disabled || live} title="Set in point (I)">
          In{inPoint != null ? ` ${formatClock(inPoint)}` : ''}
        </button>
        <button className="btn secondary sm" onClick={setOut} disabled={disabled || live} title="Set out point (O)">
          Out{outPoint != null ? ` ${formatClock(outPoint)}` : ''}
        </button>
        <button
          className={`btn secondary sm ${loopRange ? 'active' : ''}`}
          onClick={toggleLoop}
          disabled={disabled || live}
          aria-pressed={loopRange}
          title="Loop between in and out (A)"
        >
          A-B loop
        </button>
        {(inPoint != null || outPoint != null) && (
          <button className="btn secondary sm" onClick={clearRange} title="Clear in/out (X)">
            Clear
          </button>
        )}
        <span className="spacer" />
        <form onSubmit={submitJump} className="inline">
          <label className="sr-only" htmlFor="jumpto">
            Jump to time
          </label>
          <input
            id="jumpto"
            className={`num wide ${jumpErr ? 'invalid' : ''}`}
            placeholder="Go to 1:23.5 / f120"
            value={jump}
            onChange={(e) => {
              setJump(e.target.value)
              setJumpErr(false)
            }}
            disabled={disabled || live}
            aria-invalid={jumpErr}
            title="Accepts seconds, m:ss, h:mm:ss.ms, HH:MM:SS:FF or frame numbers like f120"
          />
        </form>
        {pipSupported && (
          <button className="btn icon secondary" onClick={onPip} disabled={disabled} title="Picture-in-picture" aria-label="Picture in picture">
            ⧉
          </button>
        )}
        <button className="btn icon secondary" onClick={onFullscreen} disabled={disabled} title="Fullscreen (F)" aria-label="Fullscreen">
          ⛶
        </button>
      </div>
    </div>
  )
}
