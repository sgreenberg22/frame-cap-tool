import React, { useEffect, useRef, useState } from 'react'
import { formatClock, formatTimecode } from '../lib/timecode'

/** Custom scrubber with in/out range, markers, captured-shot ticks, waveform and hover thumbnails. */
export default function Timeline({ duration, time, fps, inPoint, outPoint, markers, shotTimes, peaks, onSeek, previewSrc, onMarkerClick }) {
  const barRef = useRef(null)
  const waveRef = useRef(null)
  const thumbVideo = useRef(null)
  const thumbCanvas = useRef(null)
  const [hover, setHover] = useState(null)
  const [dragging, setDragging] = useState(false)
  const pending = useRef(null)
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0
  const pct = (t) => (dur ? `${(Math.min(dur, Math.max(0, t)) / dur) * 100}%` : '0%')

  function timeAt(clientX) {
    const r = barRef.current.getBoundingClientRect()
    return Math.min(dur, Math.max(0, ((clientX - r.left) / r.width) * dur))
  }

  function onDown(e) {
    if (!dur) return
    barRef.current.setPointerCapture?.(e.pointerId)
    setDragging(true)
    onSeek(timeAt(e.clientX))
  }
  function onMove(e) {
    if (!dur) return
    const t = timeAt(e.clientX)
    const r = barRef.current.getBoundingClientRect()
    setHover({ t, x: e.clientX - r.left })
    if (dragging) onSeek(t)
  }

  // Hover thumbnails via a hidden second video element (throttled seeks)
  useEffect(() => {
    const v = thumbVideo.current
    if (!v || !hover || !previewSrc) return
    pending.current = hover.t
    if (v.seeking) return
    const go = () => {
      if (pending.current == null) return
      const t = pending.current
      pending.current = null
      v.currentTime = t
    }
    const onSeeked = () => {
      const c = thumbCanvas.current
      if (c && v.videoWidth) {
        c.width = 160
        c.height = Math.round((160 * v.videoHeight) / v.videoWidth)
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
      }
      go()
    }
    v.addEventListener('seeked', onSeeked, { once: true })
    go()
    return () => v.removeEventListener('seeked', onSeeked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover?.t, previewSrc])

  useEffect(() => {
    const c = waveRef.current
    if (!c || !peaks) return
    const w = (c.width = c.clientWidth * (window.devicePixelRatio || 1))
    const h = (c.height = c.clientHeight * (window.devicePixelRatio || 1))
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = getComputedStyle(c).color
    const n = peaks.length
    for (let x = 0; x < w; x++) {
      const p = peaks[Math.floor((x / w) * n)] || 0
      const ph = Math.max(1, p * h)
      ctx.fillRect(x, (h - ph) / 2, 1, ph)
    }
  }, [peaks])

  function onKey(e) {
    if (!dur) return
    const big = e.shiftKey ? 10 : 1
    let t = null
    if (e.key === 'ArrowLeft') t = time - big
    else if (e.key === 'ArrowRight') t = time + big
    else if (e.key === 'PageDown') t = time - 10
    else if (e.key === 'PageUp') t = time + 10
    else if (e.key === 'Home') t = 0
    else if (e.key === 'End') t = dur
    if (t != null) {
      e.preventDefault()
      e.stopPropagation()
      onSeek(Math.min(dur, Math.max(0, t)))
    }
  }

  const hasRange = inPoint != null || outPoint != null
  const rs = inPoint ?? 0
  const re = outPoint ?? dur

  return (
    <div className="timeline">
      {previewSrc && <video ref={thumbVideo} src={previewSrc} muted preload="auto" style={{ display: 'none' }} aria-hidden="true" />}
      <div
        ref={barRef}
        className="tl-bar"
        role="slider"
        tabIndex={0}
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur * 1000) / 1000}
        aria-valuenow={Math.round(time * 1000) / 1000}
        aria-valuetext={`${formatClock(time)} of ${formatClock(dur)}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onPointerLeave={() => !dragging && setHover(null)}
        onKeyDown={onKey}
      >
        {peaks && <canvas ref={waveRef} className="tl-wave" aria-hidden="true" />}
        {hasRange && <div className="tl-range" style={{ left: pct(rs), width: dur ? `${((re - rs) / dur) * 100}%` : 0 }} />}
        <div className="tl-fill" style={{ width: pct(time) }} />
        {shotTimes.map((s) => (
          <div key={s.id} className="tl-shot" style={{ left: pct(s.time) }} title={`Frame at ${formatClock(s.time)}`} />
        ))}
        {markers.map((m) => (
          <button
            key={m.id}
            className="tl-marker"
            style={{ left: pct(m.time) }}
            title={`${m.label} · ${formatClock(m.time)}`}
            aria-label={`Marker ${m.label} at ${formatClock(m.time)}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onMarkerClick?.(m)
            }}
          />
        ))}
        <div className="tl-head" style={{ left: pct(time) }} />
        {hover && (
          <div className="tl-hover" style={{ left: Math.max(50, Math.min(hover.x, (barRef.current?.clientWidth || 0) - 50)) }}>
            {previewSrc && <canvas ref={thumbCanvas} className="tl-thumb" width="160" height="90" />}
            <span>{formatTimecode(hover.t, fps)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
