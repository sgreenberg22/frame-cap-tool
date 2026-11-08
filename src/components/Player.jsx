import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createRenderer, supportsWebGL2 } from '../lib/gl'
import { rgbToHex, toCssFilter } from '../lib/filters'
import { readPixel } from '../lib/analysis'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * The video stage. Renders the <video> plus a WebGL canvas with the live filter stack,
 * and overlays (grid, ROI, measurement, onion skin, captions, inspector).
 */
const Player = forwardRef(function Player(
  {
    source,
    filters,
    lut,
    view,
    split,
    compareHold,
    overlays,
    roi,
    setRoi,
    tool,
    setTool,
    rotate,
    flipH,
    flipV,
    onionUrl,
    onionOpacity,
    measure,
    setMeasure,
    onPick,
    onGesture,
    captionsUrl,
    onVideoEvent,
    onVideoError,
    flashKey,
  },
  ref,
) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const frameRef = useRef(null)
  const rendererRef = useRef(null)
  const [glOk] = useState(() => supportsWebGL2())
  const [glReady, setGlReady] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 })
  const [aspect, setAspect] = useState(16 / 9)
  const [readout, setReadout] = useState(null)
  const [cue, setCue] = useState('')
  const [draft, setDraft] = useState(null)
  const [flash, setFlash] = useState(false)
  const stateRef = useRef({})
  stateRef.current = { filters, lut, view, split: compareHold ? 1 : split, zoom, pan, rotate, flipH, flipV }

  useImperativeHandle(
    ref,
    () => ({
      video: () => videoRef.current,
      canvas: () => (glReady ? canvasRef.current : null),
      stage: () => stageRef.current,
      resetView: () => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
      },
      setZoom: (z) => setZoom(clamp(z, 0.25, 16)),
      zoom,
    }),
    [glReady, zoom],
  )

  // Renderer lifecycle
  useEffect(() => {
    if (!glOk || !canvasRef.current) return
    try {
      rendererRef.current = createRenderer(canvasRef.current, { preserve: true })
      setGlReady(!!rendererRef.current)
    } catch (e) {
      console.warn('WebGL renderer failed, using CSS filters', e)
      rendererRef.current = null
    }
    return () => {
      rendererRef.current?.destroy()
      rendererRef.current = null
      setGlReady(false)
    }
  }, [glOk])

  const draw = useCallback((newFrame = true) => {
    const v = videoRef.current
    const r = rendererRef.current
    if (!v || !r || !v.videoWidth || v.readyState < 2) return
    const { filters: f, lut: l, view: vw, split: sp } = stateRef.current
    const fs = frameRef.current
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const dispW = (fs?.offsetWidth || v.videoWidth) * dpr * stateRef.current.zoom
    const scale = Math.min(1, dispW / v.videoWidth)
    const w = Math.max(2, Math.round(v.videoWidth * scale))
    const h = Math.max(2, Math.round(v.videoHeight * scale))
    r.render(v, f, {
      width: w,
      height: h,
      sourceWidth: v.videoWidth,
      sourceHeight: v.videoHeight,
      view: vw,
      split: sp,
      lut: l,
      newFrame,
      seed: newFrame ? Math.random() : 0.5,
    })
  }, [])

  // Render loop: every presented frame while playing, plus on seek/filter changes
  useEffect(() => {
    const v = videoRef.current
    if (!v || !glReady) return
    let handle = 0
    let raf = 0
    let stopped = false
    const useRvfc = 'requestVideoFrameCallback' in v
    const loop = () => {
      if (stopped) return
      draw(true)
      if (!v.paused) {
        if (useRvfc) handle = v.requestVideoFrameCallback(loop)
        else raf = requestAnimationFrame(loop)
      }
    }
    const kick = () => loop()
    const redrawOnce = () => draw(true)
    v.addEventListener('play', kick)
    v.addEventListener('seeked', redrawOnce)
    v.addEventListener('loadeddata', redrawOnce)
    v.addEventListener('resize', redrawOnce)
    if (!v.paused) kick()
    return () => {
      stopped = true
      if (useRvfc && handle) v.cancelVideoFrameCallback?.(handle)
      cancelAnimationFrame(raf)
      v.removeEventListener('play', kick)
      v.removeEventListener('seeked', redrawOnce)
      v.removeEventListener('loadeddata', redrawOnce)
      v.removeEventListener('resize', redrawOnce)
    }
  }, [source?.id, glReady, draw])

  useEffect(() => {
    const id = requestAnimationFrame(() => draw(false))
    return () => cancelAnimationFrame(id)
  }, [filters, lut, view, split, compareHold, zoom, frameSize, draw])

  // Source binding (file URL, remote URL, or live stream)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    setZoom(1)
    setPan({ x: 0, y: 0 })
    if (!source) {
      v.removeAttribute('src')
      v.srcObject = null
      v.load()
      return
    }
    if (source.stream) {
      v.srcObject = source.stream
      v.play().catch(() => {})
    } else {
      v.srcObject = null
      if (source.kind === 'url') v.crossOrigin = 'anonymous'
      else v.removeAttribute('crossorigin')
      v.src = source.url
    }
  }, [source])

  // Aspect ratio + layout sizing
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onMeta = () => {
      if (v.videoWidth) setAspect(v.videoWidth / v.videoHeight)
      // MediaRecorder WebM files report Infinity until the end is scanned; force the browser to find it.
      if (v.duration === Infinity && !v.srcObject) {
        const fix = () => {
          if (!Number.isFinite(v.duration)) return
          v.removeEventListener('durationchange', fix)
          v.currentTime = 0
          onVideoEvent?.('durationchange')
        }
        v.addEventListener('durationchange', fix)
        v.currentTime = 1e101
      }
    }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('resize', onMeta)
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('resize', onMeta)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const ro = new ResizeObserver(() => {
      const swap = rotate % 180 !== 0
      const sw = st.clientWidth
      const sh = st.clientHeight
      const a = swap ? 1 / aspect : aspect
      let w = sw,
        h = sw / a
      if (h > sh) {
        h = sh
        w = sh * a
      }
      setFrameSize(swap ? { w: h, h: w } : { w, h })
    })
    ro.observe(st)
    return () => ro.disconnect()
  }, [aspect, rotate])

  // Captions (rendered by us, since the video itself sits under the GL canvas)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    setCue('')
    ;[...v.querySelectorAll('track')].forEach((t) => t.remove())
    if (!captionsUrl) return
    const track = document.createElement('track')
    track.kind = 'subtitles'
    track.src = captionsUrl
    track.default = true
    v.appendChild(track)
    const tt = track.track
    tt.mode = 'hidden'
    const onCue = () => setCue([...(tt.activeCues || [])].map((c) => c.text).join('\n'))
    tt.addEventListener('cuechange', onCue)
    return () => tt.removeEventListener('cuechange', onCue)
  }, [captionsUrl, source?.id])

  useEffect(() => {
    if (!flashKey) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 140)
    return () => clearTimeout(t)
  }, [flashKey])

  /** Client point -> normalized source coords (0..1), accounting for zoom, pan, rotation and flips. */
  const toNorm = useCallback(
    (clientX, clientY) => {
      const st = stageRef.current
      const fr = frameRef.current
      if (!st || !fr) return null
      const r = st.getBoundingClientRect()
      let dx = clientX - (r.left + r.width / 2) - pan.x
      let dy = clientY - (r.top + r.height / 2) - pan.y
      dx /= zoom
      dy /= zoom
      const a = (-rotate * Math.PI) / 180
      const rx = dx * Math.cos(a) - dy * Math.sin(a)
      const ry = dx * Math.sin(a) + dy * Math.cos(a)
      let x = rx / fr.offsetWidth + 0.5
      let y = ry / fr.offsetHeight + 0.5
      if (flipH) x = 1 - x
      if (flipV) y = 1 - y
      return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 }
    },
    [pan, zoom, rotate, flipH, flipV],
  )

  const pickPixel = useCallback(
    (n) => {
      const src = (glReady && canvasRef.current) || videoRef.current
      if (!src || !n?.inside) return null
      try {
        return readPixel(src, n.x, n.y)
      } catch {
        return null
      }
    },
    [glReady],
  )

  // Pointer handling: tools, pan, pinch-zoom and touch gestures
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const lastTap = useRef(0)
  const longPress = useRef(0)

  function onPointerDown(e) {
    stageRef.current.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const n = toNorm(e.clientX, e.clientY)
    if (pointers.current.size === 2) {
      clearTimeout(longPress.current)
      const [a, b] = [...pointers.current.values()]
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), zoom, pan: { ...pan }, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
      return
    }
    if (tool === 'roi' && n) {
      gesture.current = { type: 'roi', start: n }
      setDraft({ x: n.x, y: n.y, w: 0, h: 0 })
      return
    }
    if ((tool === 'measure' || tool === 'calibrate') && n) {
      gesture.current = { type: 'measure', start: n }
      setDraft({ x1: n.x, y1: n.y, x2: n.x, y2: n.y })
      return
    }
    if (tool === 'inspect' || tool === 'wb') {
      const px = pickPixel(n)
      if (px) onPick?.(tool, px, n)
      if (tool === 'wb') setTool('none')
      return
    }
    if (zoom > 1 || (e.pointerType === 'mouse' && e.button === 1)) {
      gesture.current = { type: 'pan', x: e.clientX, y: e.clientY, pan: { ...pan } }
      return
    }
    if (e.pointerType === 'touch') {
      const now = Date.now()
      const r = stageRef.current.getBoundingClientRect()
      if (now - lastTap.current < 300) {
        onGesture?.(e.clientX - r.left < r.width / 2 ? 'seek-back' : 'seek-forward')
        lastTap.current = 0
      } else lastTap.current = now
      gesture.current = { type: 'swipe', x: e.clientX, y: e.clientY, moved: false }
      longPress.current = setTimeout(() => {
        if (gesture.current?.type === 'swipe' && !gesture.current.moved) {
          onGesture?.('capture')
          gesture.current = null
        }
      }, 550)
    }
  }

  function onPointerMove(e) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (tool === 'inspect' && !g) {
      const n = toNorm(e.clientX, e.clientY)
      const px = pickPixel(n)
      setReadout(px ? { px, x: e.clientX, y: e.clientY, n } : null)
    }
    if (!g) return
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      setZoom(clamp((g.zoom * d) / (g.dist || 1), 1, 16))
      setPan({ x: g.pan.x + mid.x - g.mid.x, y: g.pan.y + mid.y - g.mid.y })
    } else if (g.type === 'pan') {
      setPan({ x: g.pan.x + e.clientX - g.x, y: g.pan.y + e.clientY - g.y })
    } else if (g.type === 'roi') {
      const n = toNorm(e.clientX, e.clientY)
      if (!n) return
      const x = clamp(Math.min(n.x, g.start.x), 0, 1),
        y = clamp(Math.min(n.y, g.start.y), 0, 1)
      setDraft({ x, y, w: clamp(Math.max(n.x, g.start.x), 0, 1) - x, h: clamp(Math.max(n.y, g.start.y), 0, 1) - y })
    } else if (g.type === 'measure') {
      const n = toNorm(e.clientX, e.clientY)
      if (n) setDraft({ x1: g.start.x, y1: g.start.y, x2: clamp(n.x, 0, 1), y2: clamp(n.y, 0, 1) })
    } else if (g.type === 'swipe') {
      const dx = e.clientX - g.x
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - g.y)) {
        g.moved = true
        clearTimeout(longPress.current)
        onGesture?.('scrub', dx / (stageRef.current.clientWidth || 1))
        g.x = e.clientX
      }
    }
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId)
    clearTimeout(longPress.current)
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.type === 'roi' && draft && draft.w > 0.01 && draft.h > 0.01) {
      setRoi(draft)
      setTool('none')
    }
    if (g.type === 'measure' && draft) {
      setMeasure?.(tool, draft)
    }
    setDraft(null)
  }

  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return
    e.preventDefault()
    const factor = Math.exp(-e.deltaY * 0.0025)
    const nz = clamp(zoom * factor, 1, 16)
    const r = stageRef.current.getBoundingClientRect()
    const cx = e.clientX - (r.left + r.width / 2)
    const cy = e.clientY - (r.top + r.height / 2)
    // Keep the point under the cursor fixed
    setPan((p) => (nz === 1 ? { x: 0, y: 0 } : { x: cx - ((cx - p.x) * nz) / zoom, y: cy - ((cy - p.y) * nz) / zoom }))
    setZoom(nz)
  }

  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    st.addEventListener('wheel', onWheel, { passive: false })
    return () => st.removeEventListener('wheel', onWheel)
  })

  const swap = rotate % 180 !== 0
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotate}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`
  const fallbackCss = !glReady ? toCssFilter(filters) : 'none'
  const shownRoi = draft && 'w' in draft ? draft : roi
  const shownMeasure = draft && 'x1' in draft ? draft : null
  const cursor =
    tool === 'roi' || tool === 'measure' || tool === 'calibrate' ? 'crosshair' : tool === 'inspect' || tool === 'wb' ? 'copy' : zoom > 1 ? 'grab' : 'default'

  return (
    <div
      ref={stageRef}
      className={`stage ${source ? '' : 'empty'}`}
      style={{ aspectRatio: swap ? 1 / aspect : aspect, cursor, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setReadout(null)}
      onDoubleClick={() => {
        if (zoom !== 1) {
          setZoom(1)
          setPan({ x: 0, y: 0 })
        }
      }}
    >
      <div ref={frameRef} className="frame" style={{ width: frameSize.w || '100%', height: frameSize.h || '100%', transform }}>
        <video
          ref={videoRef}
          playsInline
          preload="auto"
          style={{ filter: fallbackCss, opacity: glReady ? 0.001 : 1 }}
          onError={() => onVideoError?.(videoRef.current?.error)}
          onPlay={() => onVideoEvent?.('play')}
          onPause={() => onVideoEvent?.('pause')}
          onLoadedMetadata={() => onVideoEvent?.('loadedmetadata')}
          onRateChange={() => onVideoEvent?.('ratechange')}
          onVolumeChange={() => onVideoEvent?.('volumechange')}
          onEnded={() => onVideoEvent?.('ended')}
          onDurationChange={() => onVideoEvent?.('durationchange')}
        />
        {glOk && <canvas ref={canvasRef} className="glcanvas" aria-hidden="true" style={{ display: glReady ? 'block' : 'none' }} />}
        {onionUrl && <img className="onion" src={onionUrl} alt="" style={{ opacity: onionOpacity }} />}
        <svg className="overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {overlays.thirds &&
            [33.333, 66.666].map((p) => (
              <g key={p}>
                <line x1={p} y1="0" x2={p} y2="100" />
                <line x1="0" y1={p} x2="100" y2={p} />
              </g>
            ))}
          {overlays.grid > 0 &&
            Array.from({ length: overlays.grid - 1 }, (_, i) => ((i + 1) * 100) / overlays.grid).map((p) => (
              <g key={'g' + p} className="thin">
                <line x1={p} y1="0" x2={p} y2="100" />
                <line x1="0" y1={p} x2="100" y2={p} />
              </g>
            ))}
          {overlays.crosshair && (
            <g>
              <line x1="48" y1="50" x2="52" y2="50" />
              <line x1="50" y1="47" x2="50" y2="53" />
            </g>
          )}
          {overlays.safe && (
            <g className="safe">
              <rect x="5" y="5" width="90" height="90" />
              <rect x="10" y="10" width="80" height="80" />
            </g>
          )}
          {shownRoi && shownRoi.w > 0 && (
            <g className="roi">
              <path
                d={`M0 0H100V100H0Z M${shownRoi.x * 100} ${shownRoi.y * 100}V${(shownRoi.y + shownRoi.h) * 100}H${(shownRoi.x + shownRoi.w) * 100}V${shownRoi.y * 100}Z`}
                fillRule="evenodd"
              />
              <rect x={shownRoi.x * 100} y={shownRoi.y * 100} width={shownRoi.w * 100} height={shownRoi.h * 100} />
            </g>
          )}
          {[...(measure?.lines || []), ...(shownMeasure ? [shownMeasure] : [])].map((l, i) => (
            <line key={'m' + i} className={`measure ${l.ref ? 'ref' : ''}`} x1={l.x1 * 100} y1={l.y1 * 100} x2={l.x2 * 100} y2={l.y2 * 100} />
          ))}
        </svg>
        {cue && (
          <div className="cue" style={{ transform: `rotate(${-rotate}deg)` }}>
            {cue}
          </div>
        )}
      </div>
      {flash && <div className="flash" />}
      {readout && (
        <div
          className="readout"
          style={{ left: readout.x - stageRef.current.getBoundingClientRect().left + 14, top: readout.y - stageRef.current.getBoundingClientRect().top + 14 }}
        >
          <span className="sw" style={{ background: rgbToHex(...readout.px) }} />
          {rgbToHex(...readout.px)} · {readout.px.join(', ')}
        </div>
      )}
      {zoom !== 1 && <div className="zoom-chip">{Math.round(zoom * 100)}% · double-click to reset</div>}
    </div>
  )
})

export default Player
