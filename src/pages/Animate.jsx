import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import Modal from '../components/Modal'
import { useApp } from '../state/store'
import { decodeImageFrames } from '../lib/media'
import { decodeHeic, isHeic } from '../lib/heic'
import { seekVideo } from '../lib/capture'
import { encodeAPNG } from '../lib/apng'
import { encodeGifFrames } from '../lib/gifClient'
import { estimateGifBytes } from '../lib/gifcore'
import { downloadBlob } from '../lib/download'
import { formatBytes } from '../lib/storage'
import {
  ANIM_SIZES,
  MAX_FRAMES,
  clampDelay,
  floodFillData,
  fitRect,
  fpsToDelay,
  frameAtTime,
  hexToRgba,
  moveItem,
  pingPong,
  totalDuration,
  videoSampleTimes,
} from '../lib/anim'

const uid = () => Math.random().toString(36).slice(2, 10)
const mk = (w, h) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const SWATCHES = ['#111111', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#af52de', '#ff2d95']
const TOOLS = [
  ['pen', 'Pen', '✎'],
  ['eraser', 'Eraser', '⌫'],
  ['line', 'Line', '╱'],
  ['rect', 'Rectangle', '▭'],
  ['ellipse', 'Ellipse', '◯'],
  ['fill', 'Fill', '◧'],
]

// Survives navigating to another page and back (frames are canvases, so this is memory only).
const kept = { frames: [], cur: 0, size: [640, 360], bg: '#ffffff', fps: 10 }

const Thumb = memo(function Thumb({ frame }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const k = 96 / Math.max(frame.canvas.width, frame.canvas.height)
    c.width = Math.max(1, Math.round(frame.canvas.width * k))
    c.height = Math.max(1, Math.round(frame.canvas.height * k))
    c.getContext('2d').drawImage(frame.canvas, 0, 0, c.width, c.height)
  }, [frame.v, frame.canvas])
  return <canvas ref={ref} aria-hidden="true" />
})

/** Animation studio: build frames from photos, clips and drawings, then export a GIF or APNG. */
export default function Animate() {
  const { shots, toast } = useApp()
  const [frames, setFramesState] = useState(kept.frames)
  const [cur, setCur] = useState(Math.min(kept.cur, Math.max(0, kept.frames.length - 1)))
  const [size, setSize] = useState(kept.size)
  const [bg, setBg] = useState(kept.bg)
  const [fps, setFps] = useState(kept.fps)
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#111111')
  const [brush, setBrush] = useState(6)
  const [onion, setOnion] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [fit, setFit] = useState('contain')
  const [video, setVideo] = useState(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [pick, setPick] = useState(new Set())
  const [busy, setBusy] = useState('')
  const [canUndo, setCanUndo] = useState(false)
  const [xo, setXo] = useState({ format: 'gif', scale: 100, colors: 256, dither: 'none', loops: 0, optimize: true })
  const [result, setResult] = useState(null)
  const stage = useRef(null)
  const framesRef = useRef(frames)
  const undo = useRef(new Map())
  const gesture = useRef(null)
  const abort = useRef(null)
  const inputRef = useRef(null)
  const [W, H] = size
  const transparentBg = bg === 'transparent'

  const setFrames = useCallback((next) => {
    const v = typeof next === 'function' ? next(framesRef.current) : next
    framesRef.current = v
    kept.frames = v
    setFramesState(v)
  }, [])
  useEffect(() => {
    kept.cur = cur
    kept.size = size
    kept.bg = bg
    kept.fps = fps
  }, [cur, size, bg, fps])
  useEffect(() => () => result && URL.revokeObjectURL(result.url), [result])

  const frame = frames[cur]
  const touch = (id) => setFrames((fs) => fs.map((f) => (f.id === id ? { ...f, v: f.v + 1 } : f)))

  // ---- stage rendering (frame + light-table ghost of the previous frame) ----
  useEffect(() => {
    const c = stage.current
    if (!c) return
    if (c.width !== W || c.height !== H) {
      c.width = W
      c.height = H
    }
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    if (!frame) return
    ctx.drawImage(frame.canvas, 0, 0)
    if (onion && !playing && cur > 0) {
      ctx.globalAlpha = 0.28
      ctx.drawImage(frames[cur - 1].canvas, 0, 0)
      ctx.globalAlpha = 1
    }
  }, [frame, frame?.v, cur, onion, playing, W, H, frames])

  // ---- playback ----
  useEffect(() => {
    if (!playing || frames.length < 2) return
    const t0 = performance.now()
    let raf
    let shown = -1
    const loop = (now) => {
      const i = frameAtTime(framesRef.current, now - t0)
      if (i !== shown) {
        shown = i
        setCur(i)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, frames.length])
  useEffect(() => {
    if (frames.length < 2) setPlaying(false)
  }, [frames.length])

  // ---- frame operations ----
  const blank = useCallback(() => {
    const c = mk(W, H)
    if (!transparentBg) {
      const ctx = c.getContext('2d')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
    }
    return c
  }, [W, H, bg, transparentBg])

  const insertCanvases = useCallback(
    (items, at) => {
      const room = MAX_FRAMES - framesRef.current.length
      if (room <= 0) return toast(`The animation is full (${MAX_FRAMES} frames).`, { kind: 'warn' })
      const use = items.slice(0, room)
      if (use.length < items.length) toast(`Added ${use.length} of ${items.length} frames (limit ${MAX_FRAMES}).`, { kind: 'warn' })
      const add = use.map((it) => ({ id: uid(), canvas: it.canvas, delay: clampDelay(it.delay ?? fpsToDelay(fps)), v: 0 }))
      const pos = at ?? framesRef.current.length
      setFrames((fs) => [...fs.slice(0, pos), ...add, ...fs.slice(pos)])
      setCur(pos + add.length - 1)
    },
    [fps, setFrames, toast],
  )

  const fitInto = useCallback(
    (drawable, sw, sh) => {
      const c = blank()
      const r = fitRect(sw, sh, W, H, fit)
      c.getContext('2d').drawImage(drawable, r.x, r.y, r.w, r.h)
      return c
    },
    [blank, W, H, fit],
  )

  const addBlank = () => insertCanvases([{ canvas: blank() }], frames.length ? cur + 1 : 0)
  const duplicate = () => {
    if (!frame) return
    const c = mk(W, H)
    c.getContext('2d').drawImage(frame.canvas, 0, 0)
    insertCanvases([{ canvas: c, delay: frame.delay }], cur + 1)
  }
  const remove = () => {
    if (!frame) return
    undo.current.delete(frame.id)
    setFrames((fs) => fs.filter((f) => f.id !== frame.id))
    setCur((i) => Math.max(0, Math.min(i, frames.length - 2)))
  }
  const move = (d) => {
    const to = cur + d
    if (to < 0 || to >= frames.length) return
    setFrames((fs) => moveItem(fs, cur, to))
    setCur(to)
  }
  const reverseAll = () => setFrames((fs) => [...fs].reverse())
  const doPingPong = () =>
    setFrames((fs) =>
      pingPong(fs).map((f, i) => {
        if (i < fs.length) return f
        const c = mk(W, H) // later copies need their own canvas so edits don't affect both
        c.getContext('2d').drawImage(f.canvas, 0, 0)
        return { ...f, id: uid(), canvas: c }
      }),
    )
  const setDelay = (ms) => setFrames((fs) => fs.map((f, i) => (i === cur ? { ...f, delay: clampDelay(ms) } : f)))
  const applyFpsToAll = () => setFrames((fs) => fs.map((f) => ({ ...f, delay: fpsToDelay(fps) })))
  const clearAll = () => {
    if (frames.length && !window.confirm('Remove all frames?')) return
    undo.current.clear()
    setFrames([])
    setCur(0)
    setPlaying(false)
  }
  const resize = (key) => {
    const s = ANIM_SIZES.find((x) => x[0] === key)
    if (!s) return
    const [, , nw, nh] = s
    setFrames((fs) =>
      fs.map((f) => {
        const c = mk(nw, nh)
        const ctx = c.getContext('2d')
        if (!transparentBg) {
          ctx.fillStyle = bg
          ctx.fillRect(0, 0, nw, nh)
        }
        const r = fitRect(f.canvas.width, f.canvas.height, nw, nh, 'contain')
        ctx.drawImage(f.canvas, r.x, r.y, r.w, r.h)
        return { ...f, canvas: c, v: f.v + 1 }
      }),
    )
    undo.current.clear()
    setSize([nw, nh])
  }

  // ---- importing ----
  const importFiles = async (list) => {
    const files = [...list]
    const vids = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name))
    const imgs = files.filter((f) => !vids.includes(f) && (f.type.startsWith('image/') || /\.(heic|heif|hif|jpe?g|png|gif|webp|avif)$/i.test(f.name)))
    if (!vids.length && !imgs.length) return toast('Add images, GIFs or a video clip.', { kind: 'warn' })
    setPlaying(false)
    if (imgs.length) {
      setBusy('Adding images…')
      const out = []
      for (const f of imgs) {
        try {
          if (isHeic(f)) {
            const c = await decodeHeic(f)
            out.push({ canvas: fitInto(c, c.width, c.height) })
          } else {
            for (const fr of await decodeImageFrames(f, MAX_FRAMES))
              out.push({ canvas: fitInto(fr.canvas, fr.canvas.width, fr.canvas.height), delay: fr.delay > 0 ? fr.delay : undefined })
          }
        } catch (e) {
          toast(`Could not read ${f.name}: ${e.message}`, { kind: 'error' })
        }
      }
      setBusy('')
      if (out.length) insertCanvases(out, frames.length ? cur + 1 : 0)
    }
    if (vids.length) {
      const url = URL.createObjectURL(vids[0])
      const v = document.createElement('video')
      v.muted = true
      v.preload = 'auto'
      v.playsInline = true
      v.src = url
      v.onloadedmetadata = () => {
        if (!v.videoWidth) {
          URL.revokeObjectURL(url)
          return toast("This browser can't show that video's picture (often iPhone HEVC). Try a different file or convert it to H.264 first.", {
            kind: 'error',
            timeout: 9000,
          })
        }
        setVideo({ name: vids[0].name, url, el: v, duration: v.duration, start: 0, len: Math.min(3, v.duration), fps: 10 })
      }
      v.onerror = () => {
        URL.revokeObjectURL(url)
        toast("Couldn't open that video.", { kind: 'error' })
      }
    }
  }

  const extractVideo = async () => {
    const { el, start, len, fps: vf, duration } = video
    const times = videoSampleTimes({ start, end: start + len, duration, fps: vf, maxFrames: MAX_FRAMES - framesRef.current.length })
    setVideo(null)
    setPlaying(false)
    const ctrl = new AbortController()
    abort.current = ctrl
    const out = []
    try {
      for (let i = 0; i < times.length; i++) {
        if (ctrl.signal.aborted) break
        setBusy(`Reading video frame ${i + 1} of ${times.length}…`)
        await seekVideo(el, times[i])
        out.push({ canvas: fitInto(el, el.videoWidth, el.videoHeight), delay: fpsToDelay(vf) })
      }
    } catch (e) {
      toast(`Could not read the video: ${e.message}`, { kind: 'error' })
    } finally {
      setBusy('')
      URL.revokeObjectURL(el.src)
      abort.current = null
    }
    if (out.length) insertCanvases(out, frames.length ? cur + 1 : 0)
  }

  const addFromGallery = async () => {
    const chosen = shots.filter((s) => pick.has(s.id))
    setGalleryOpen(false)
    setPick(new Set())
    setBusy('Adding frames…')
    const out = []
    for (const s of chosen) {
      try {
        const bmp = await createImageBitmap(s.blob)
        out.push({ canvas: fitInto(bmp, bmp.width, bmp.height) })
        bmp.close?.()
      } catch {
        /* skip unreadable */
      }
    }
    setBusy('')
    if (out.length) insertCanvases(out, frames.length ? cur + 1 : 0)
  }

  // ---- drawing ----
  const pos = (e) => {
    const r = stage.current.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }
  const pushUndo = () => {
    const f = framesRef.current[cur]
    if (!f) return
    const list = undo.current.get(f.id) || []
    list.push(f.canvas.getContext('2d').getImageData(0, 0, W, H))
    if (list.length > 15) list.shift()
    undo.current.set(f.id, list)
    setCanUndo(true)
  }
  const doUndo = useCallback(() => {
    const f = framesRef.current[cur]
    const list = f && undo.current.get(f.id)
    const prev = list?.pop()
    if (prev) {
      f.canvas.getContext('2d').putImageData(prev, 0, 0)
      touch(f.id)
    }
    setCanUndo(!!list?.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur])
  useEffect(() => setCanUndo(!!(frame && undo.current.get(frame.id)?.length)), [frame])

  const paint = (ctx, a, b, mode) => {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = brush
    if (mode === 'erase') {
      if (transparentBg) ctx.globalCompositeOperation = 'destination-out'
      else ctx.strokeStyle = bg
    }
    if (mode !== 'erase') ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  const down = (e) => {
    if (!frame || playing) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pos(e)
    const ctx = frame.canvas.getContext('2d', { willReadFrequently: true })
    pushUndo()
    if (tool === 'fill') {
      const img = ctx.getImageData(0, 0, W, H)
      if (floodFillData(img.data, W, H, p[0], p[1], hexToRgba(color), 28)) ctx.putImageData(img, 0, 0)
      touch(frame.id)
      gesture.current = null
      return
    }
    if (tool === 'pen' || tool === 'eraser') {
      paint(ctx, p, [p[0] + 0.01, p[1]], tool === 'eraser' ? 'erase' : 'pen')
      gesture.current = { last: p }
    } else gesture.current = { p0: p, snap: ctx.getImageData(0, 0, W, H) }
    touch(frame.id)
  }
  const move_ = (e) => {
    const g = gesture.current
    if (!g || !frame) return
    const p = pos(e)
    const ctx = frame.canvas.getContext('2d', { willReadFrequently: true })
    if (g.last) {
      paint(ctx, g.last, p, tool === 'eraser' ? 'erase' : 'pen')
      g.last = p
    } else {
      ctx.putImageData(g.snap, 0, 0)
      ctx.strokeStyle = color
      ctx.lineWidth = brush
      ctx.lineCap = 'round'
      ctx.beginPath()
      if (tool === 'line') {
        ctx.moveTo(g.p0[0], g.p0[1])
        ctx.lineTo(p[0], p[1])
      } else if (tool === 'rect') ctx.rect(g.p0[0], g.p0[1], p[0] - g.p0[0], p[1] - g.p0[1])
      else ctx.ellipse((g.p0[0] + p[0]) / 2, (g.p0[1] + p[1]) / 2, Math.abs(p[0] - g.p0[0]) / 2, Math.abs(p[1] - g.p0[1]) / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    touch(frame.id)
  }
  const up = () => {
    gesture.current = null
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, select, textarea, [role=dialog]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        doUndo()
      } else if (e.key === 'ArrowLeft') setCur((i) => Math.max(0, i - 1))
      else if (e.key === 'ArrowRight') setCur((i) => Math.min(framesRef.current.length - 1, i + 1))
      else if (e.key === ' ' && framesRef.current.length > 1) {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doUndo])

  // ---- export ----
  const outW = Math.max(16, Math.round((W * xo.scale) / 100))
  const outH = Math.max(16, Math.round((H * xo.scale) / 100))
  const estimate = estimateGifBytes({ width: outW, height: outH, frames: frames.length, colors: xo.colors, optimize: xo.optimize, dither: xo.dither })
  const exportAnim = async () => {
    if (!frames.length) return
    setPlaying(false)
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy('Preparing…')
    try {
      const list = frames.map((f) => {
        if (xo.scale === 100) return { canvas: f.canvas, delay: f.delay }
        const c = mk(outW, outH)
        const ctx = c.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(f.canvas, 0, 0, outW, outH)
        return { canvas: c, delay: f.delay }
      })
      let blob
      if (xo.format === 'gif') {
        blob = await encodeGifFrames(
          list,
          { colors: xo.colors, dither: xo.dither, loops: xo.loops, optimize: xo.optimize && !transparentBg, transparency: transparentBg },
          (p, stage_) => setBusy(stage_ === 'collect' ? 'Choosing colours…' : `Encoding ${Math.round(p * 100)}%`),
          ctrl.signal,
        )
      } else {
        blob = await encodeAPNG(
          list.map((l) => l.canvas),
          list.map((l) => l.delay),
          xo.loops,
          (p) => setBusy(`Encoding ${Math.round(p * 100)}%`),
        )
      }
      setResult((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return { url: URL.createObjectURL(blob), blob, format: xo.format, size: blob.size }
      })
    } catch (e) {
      if (e?.name !== 'AbortError') toast(`Export failed: ${e.message}`, { kind: 'error' })
    } finally {
      setBusy('')
      abort.current = null
    }
  }

  const total = totalDuration(frames)
  const cursor = tool === 'fill' ? 'cell' : 'crosshair'

  return (
    <main
      id="main"
      className="container anim-page"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files)
      }}
    >
      <div className="row wrap gap-s" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1>Animation studio</h1>
          <p className="muted">Draw frames, add photos, GIFs or video clips, then export an animated GIF or APNG. Everything stays on your device.</p>
        </div>
      </div>

      <section className="card anim-bar" aria-label="Add frames">
        <button className="btn" onClick={addBlank}>
          ＋ Blank frame
        </button>
        <button className="btn secondary" onClick={() => inputRef.current?.click()}>
          Add photos, GIFs or a video…
        </button>
        <input
          ref={inputRef}
          id="animInput"
          type="file"
          multiple
          hidden
          accept="image/*,.heic,.heif,.hif,video/*,.mov"
          onChange={(e) => {
            importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          className="btn secondary"
          onClick={() => setGalleryOpen(true)}
          disabled={!shots.length}
          title={shots.length ? '' : 'Capture frames in the Studio first'}
        >
          From my captured frames ({shots.length})
        </button>
        <span className="spacer" />
        <label className="small">
          Canvas{' '}
          <select value={`${W}x${H}`} onChange={(e) => resize(e.target.value)} aria-label="Canvas size">
            {ANIM_SIZES.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="small">
          Background{' '}
          <select
            value={bg === 'transparent' ? 'transparent' : 'custom'}
            onChange={(e) => setBg(e.target.value === 'transparent' ? 'transparent' : '#ffffff')}
            aria-label="Background type"
          >
            <option value="custom">Colour</option>
            <option value="transparent">Transparent</option>
          </select>
        </label>
        {!transparentBg && <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Background colour" />}
        <label className="small">
          Photos{' '}
          <select value={fit} onChange={(e) => setFit(e.target.value)} aria-label="How photos fit the canvas">
            <option value="contain">Fit inside</option>
            <option value="cover">Fill and crop</option>
            <option value="stretch">Stretch</option>
          </select>
        </label>
      </section>

      <div className="anim-main">
        <section className="card anim-stage-card" aria-label="Canvas">
          <div className="row wrap gap-s anim-tools" role="toolbar" aria-label="Drawing tools">
            {TOOLS.map(([id, label, icon]) => (
              <button
                key={id}
                className={`btn secondary sm ${tool === id ? 'active' : ''}`}
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
                title={label}
              >
                <span aria-hidden="true">{icon}</span> {label}
              </button>
            ))}
            <span className="divider" />
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`swatch ${color === c ? 'on' : ''}`}
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Custom colour" />
            <label className="small row gap-s">
              Size
              <input type="range" min="1" max="60" value={brush} onChange={(e) => setBrush(+e.target.value)} aria-label="Brush size" />
            </label>
            <button className="btn secondary sm" onClick={doUndo} disabled={!canUndo}>
              Undo
            </button>
            <label className="small row gap-s">
              <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} /> Ghost of previous frame
            </label>
          </div>
          <div className={`anim-stage ${transparentBg ? 'checker' : ''}`} style={{ aspectRatio: `${W} / ${H}`, cursor }}>
            {!frame && (
              <div className="anim-empty">
                <p>
                  <strong>No frames yet.</strong>
                </p>
                <p className="muted">Add a blank frame to start drawing, or drop photos, GIFs or a video clip here.</p>
              </div>
            )}
            <canvas
              ref={stage}
              onPointerDown={down}
              onPointerMove={move_}
              onPointerUp={up}
              onPointerCancel={up}
              role="img"
              aria-label={frame ? `Frame ${cur + 1} of ${frames.length}` : 'Empty canvas'}
            />
          </div>
          <div className="row wrap gap-s" style={{ alignItems: 'center', marginTop: 8 }}>
            <button className="btn" onClick={() => setPlaying((p) => !p)} disabled={frames.length < 2} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
            <button className="btn secondary sm" onClick={() => setCur((i) => Math.max(0, i - 1))} disabled={cur <= 0 || playing} aria-label="Previous frame">
              ◀︎
            </button>
            <button
              className="btn secondary sm"
              onClick={() => setCur((i) => Math.min(frames.length - 1, i + 1))}
              disabled={cur >= frames.length - 1 || playing}
              aria-label="Next frame"
            >
              ▶︎
            </button>
            <span className="mono small" aria-live="polite">
              {frames.length ? `${cur + 1} / ${frames.length}` : '0 / 0'} · {(total / 1000).toFixed(1)} s
            </span>
            <span className="spacer" />
            <label className="small">
              Speed{' '}
              <input
                type="number"
                className="num"
                min="1"
                max="50"
                value={fps}
                onChange={(e) => setFps(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 10)))}
                aria-label="Frames per second"
              />{' '}
              fps
            </label>
            <button className="btn secondary sm" onClick={applyFpsToAll} disabled={!frames.length} title="Give every frame this speed">
              Apply to all frames
            </button>
          </div>
        </section>

        <aside className="card anim-side" aria-label="Export">
          <h2>Export</h2>
          <label className="field small">
            Format{' '}
            <select value={xo.format} onChange={(e) => setXo({ ...xo, format: e.target.value })}>
              <option value="gif">GIF (works everywhere)</option>
              <option value="apng">APNG (better colours)</option>
            </select>
          </label>
          <label className="field small">
            Size{' '}
            <select value={xo.scale} onChange={(e) => setXo({ ...xo, scale: +e.target.value })}>
              {[100, 75, 50, 25].map((s) => (
                <option key={s} value={s}>
                  {s}% ({Math.max(16, Math.round((W * s) / 100))} × {Math.max(16, Math.round((H * s) / 100))})
                </option>
              ))}
            </select>
          </label>
          {xo.format === 'gif' && (
            <>
              <label className="field small">
                Colours{' '}
                <select value={xo.colors} onChange={(e) => setXo({ ...xo, colors: +e.target.value })}>
                  {[256, 128, 64, 32, 16].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field small">
                Dithering{' '}
                <select value={xo.dither} onChange={(e) => setXo({ ...xo, dither: e.target.value })}>
                  <option value="none">None (smallest)</option>
                  <option value="floyd">Floyd–Steinberg</option>
                  <option value="ordered">Ordered (Bayer)</option>
                </select>
              </label>
              <label className="inline check small">
                <input type="checkbox" checked={xo.optimize} onChange={(e) => setXo({ ...xo, optimize: e.target.checked })} /> Optimise (smaller file)
              </label>
            </>
          )}
          <label className="field small">
            Repeat{' '}
            <select value={xo.loops} onChange={(e) => setXo({ ...xo, loops: +e.target.value })}>
              <option value={0}>Forever</option>
              <option value={1}>Once</option>
              <option value={3}>3 times</option>
            </select>
          </label>
          <p className="muted small">
            {frames.length} frame{frames.length === 1 ? '' : 's'} · {(total / 1000).toFixed(1)} s
            {xo.format === 'gif' && frames.length ? ` · about ${formatBytes(estimate)}` : ''}
          </p>
          <div className="row gap-s">
            <button className="btn" onClick={exportAnim} disabled={!frames.length || !!busy}>
              Make {xo.format === 'gif' ? 'GIF' : 'APNG'}
            </button>
            {busy && abort.current && (
              <button className="btn secondary" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            )}
          </div>
          {result && (
            <div className="anim-result">
              <img src={result.url} alt="Your animation" />
              <div className="row wrap gap-s" style={{ alignItems: 'center' }}>
                <span className="small muted">{formatBytes(result.size)}</span>
                <button className="btn sm" onClick={() => downloadBlob(result.blob, `animation.${result.format === 'gif' ? 'gif' : 'png'}`)}>
                  Download
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <section className="card" aria-label="Frames">
        <div className="row wrap gap-s" style={{ alignItems: 'center', marginBottom: 8 }}>
          <strong>Frames</strong>
          <span className="spacer" />
          <button className="btn secondary sm" onClick={duplicate} disabled={!frame}>
            Duplicate
          </button>
          <button className="btn secondary sm" onClick={() => move(-1)} disabled={cur <= 0} aria-label="Move frame earlier">
            ← Move
          </button>
          <button className="btn secondary sm" onClick={() => move(1)} disabled={!frame || cur >= frames.length - 1} aria-label="Move frame later">
            Move →
          </button>
          <button className="btn secondary sm" onClick={reverseAll} disabled={frames.length < 2}>
            Reverse
          </button>
          <button className="btn secondary sm" onClick={doPingPong} disabled={frames.length < 3} title="Play forwards then backwards">
            Ping-pong
          </button>
          <button className="btn secondary sm" onClick={remove} disabled={!frame}>
            Delete
          </button>
          <button className="btn secondary sm" onClick={clearAll} disabled={!frames.length}>
            Clear all
          </button>
          {frame && (
            <label className="small">
              This frame{' '}
              <input
                type="number"
                className="num"
                min="20"
                max="10000"
                step="10"
                value={frame.delay}
                onChange={(e) => setDelay(e.target.value)}
                aria-label="Frame duration in milliseconds"
              />{' '}
              ms
            </label>
          )}
        </div>
        <ol className="anim-strip" aria-label="Frame list">
          {frames.map((f, i) => (
            <li key={f.id}>
              <button
                className={`anim-thumb ${i === cur ? 'on' : ''}`}
                onClick={() => !playing && setCur(i)}
                aria-label={`Frame ${i + 1}, ${f.delay} milliseconds`}
                aria-current={i === cur ? 'true' : undefined}
              >
                <Thumb frame={f} />
                <span className="anim-num">{i + 1}</span>
              </button>
            </li>
          ))}
          {!frames.length && <li className="muted small">Your frames will appear here.</li>}
        </ol>
      </section>

      {busy && (
        <div className="anim-busy" role="status">
          <span className="spinner" /> {busy}
          {abort.current && (
            <button className="btn secondary sm" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          )}
        </div>
      )}

      {video && (
        <Modal title="Use part of this video" onClose={() => (URL.revokeObjectURL(video.url), setVideo(null))} size="sm">
          <p className="muted small">{video.name}</p>
          <label className="field small">
            Start at {video.start.toFixed(1)} s
            <input
              type="range"
              min="0"
              max={Math.max(0, video.duration - 0.1)}
              step="0.1"
              value={video.start}
              onChange={(e) => setVideo({ ...video, start: +e.target.value, len: Math.min(video.len, video.duration - +e.target.value) })}
            />
          </label>
          <label className="field small">
            Length {video.len.toFixed(1)} s
            <input
              type="range"
              min="0.2"
              max={Math.max(0.2, Math.min(10, video.duration - video.start))}
              step="0.1"
              value={video.len}
              onChange={(e) => setVideo({ ...video, len: +e.target.value })}
            />
          </label>
          <label className="field small">
            Frames per second {video.fps}
            <input type="range" min="2" max="24" value={video.fps} onChange={(e) => setVideo({ ...video, fps: +e.target.value })} />
          </label>
          <p className="muted small">That makes about {Math.min(MAX_FRAMES, Math.floor(video.len * video.fps))} frames.</p>
          <div className="row gap-s" style={{ justifyContent: 'flex-end' }}>
            <button className="btn secondary" onClick={() => (URL.revokeObjectURL(video.url), setVideo(null))}>
              Cancel
            </button>
            <button className="btn" onClick={extractVideo}>
              Add frames
            </button>
          </div>
        </Modal>
      )}

      {galleryOpen && (
        <Modal title="Add captured frames" onClose={() => setGalleryOpen(false)} size="lg">
          <div className="anim-gallery">
            {shots.map((s) => (
              <label key={s.id} className={`anim-pick ${pick.has(s.id) ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={pick.has(s.id)}
                  onChange={() =>
                    setPick((p) => {
                      const n = new Set(p)
                      n.has(s.id) ? n.delete(s.id) : n.add(s.id)
                      return n
                    })
                  }
                />
                <img src={s.thumbUrl || s.url} alt={s.name} />
              </label>
            ))}
          </div>
          <div className="row gap-s" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn secondary" onClick={() => setPick(new Set(shots.map((s) => s.id)))}>
              Select all
            </button>
            <button className="btn" disabled={!pick.size} onClick={addFromGallery}>
              Add {pick.size || ''} frame{pick.size === 1 ? '' : 's'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}
