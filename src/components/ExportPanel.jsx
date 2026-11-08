import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { useT } from '../lib/i18n'
import Slider from './Slider'
import { GIF_QUALITY_PRESETS, GIF_SIZE_PRESETS, LIMITS } from '../lib/config'
import { sampleTimes } from '../lib/batch'
import { blobToDrawable, drawLabel, seekVideo } from '../lib/capture'
import { arrangeFrames, estimateGifBytes } from '../lib/gifcore'
import { encodeAPNG } from '../lib/apng'
import { canRecordCanvas, pickRecorderMime } from '../lib/media'
import { canShareFiles, copyImageToClipboard, downloadBlob, shareFiles, zipBlobs } from '../lib/download'
import { formatBytes, ls } from '../lib/storage'
import { formatClock } from '../lib/timecode'

const ASPECTS = [
  ['source', 'Source'],
  ['1:1', '1:1'],
  ['16:9', '16:9'],
  ['9:16', '9:16'],
  ['4:3', '4:3'],
  ['4:5', '4:5'],
]
const DEFAULT_OPTS = {
  source: 'gallery',
  start: 0,
  end: 3,
  fps: 10,
  width: 480,
  sizePreset: 'slack',
  aspect: 'source',
  fitMode: 'fill',
  bg: '#000000',
  applyFilters: true,
  order: 'forward',
  speed: 1,
  loops: 0,
  loopCount: 3,
  colors: 256,
  dither: 'none',
  globalPalette: true,
  optimize: true,
  transparency: false,
  alphaThreshold: 128,
  crossfade: 0,
  caption: '',
  captionPos: 'bottom',
  captionFrom: 1,
  captionTo: 0,
  captionSize: 36,
  watermark: false,
  format: 'gif',
  targetMB: 0,
  allowUpscale: false,
  burnCaptions: false,
}
const uid = () => Math.random().toString(36).slice(2, 10)
const parseAspect = (a) =>
  a === 'source'
    ? null
    : a
        .split(':')
        .map(Number)
        .reduce((x, y) => x / y)

export default function ExportPanel({ videoRef, captureCanvas, selected, range, fps: videoFps, live }) {
  const t = useT()
  const { shots, settings, toast } = useApp()
  const [o, setO] = useState(() => ({ ...DEFAULT_OPTS, ...ls.get('fc.export', {}) }))
  const [frames, setFrames] = useState([]) // {id, canvas, delay, label}
  const [trim, setTrim] = useState([0, 0])
  const [status, setStatus] = useState({ busy: false, p: 0, label: '' })
  const [result, setResult] = useState(null) // {blob, url, kind, name}
  const [warn, setWarn] = useState('')
  const workerRef = useRef(null)
  const cancelRef = useRef(false)
  const dragFrom = useRef(null)
  const set = (patch) => setO((prev) => ({ ...prev, ...patch }))

  useEffect(() => ls.set('fc.export', o), [o])
  useEffect(() => () => result?.url && URL.revokeObjectURL(result.url), [result])
  useEffect(() => () => workerRef.current?.terminate(), [])
  useEffect(() => setTrim([0, Math.max(0, frames.length - 1)]), [frames.length])

  const chosen = useMemo(() => shots.filter((s) => selected.has(s.id)), [shots, selected])
  const active = frames.slice(trim[0], trim[1] + 1)
  const arranged = useMemo(() => arrangeFrames(active, { order: o.order, speed: o.speed }), [active, o.order, o.speed])
  const outW = frames[0]?.canvas.width || 0
  const outH = frames[0]?.canvas.height || 0
  const loopsValue = o.loops === 'n' ? o.loopCount : o.loops
  const totalFrames = arranged.length + (o.crossfade > 0 ? Math.max(0, arranged.length - 1) * o.crossfade : 0)
  const estimate = outW ? estimateGifBytes({ width: outW, height: outH, frames: totalFrames, colors: o.colors, optimize: o.optimize, dither: o.dither }) : 0
  const memBytes = outW * outH * 4 * totalFrames * 2
  const totalMs = arranged.reduce((a, f) => a + f.delay, 0)

  function outputSize(srcW, srcH) {
    let w = Math.round(o.width || srcW)
    if (!o.allowUpscale && w > srcW) w = srcW
    w = Math.max(LIMITS.gifMinWidth, Math.min(LIMITS.gifMaxWidth, w))
    const ar = parseAspect(o.aspect) || srcW / srcH
    w -= w % 2
    return { w, h: Math.max(2, Math.round(w / ar)) }
  }

  function fitInto(drawable, w, h) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    const sw = drawable.width || drawable.videoWidth,
      sh = drawable.height || drawable.videoHeight
    if (o.aspect === 'source' || o.fitMode === 'stretch') {
      ctx.drawImage(drawable, 0, 0, w, h)
      return c
    }
    const s = o.fitMode === 'fill' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh)
    if (o.fitMode === 'fit' && !o.transparency) {
      ctx.fillStyle = o.bg
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(drawable, (w - sw * s) / 2, (h - sh * s) / 2, sw * s, sh * s)
    return c
  }

  async function loadFrames() {
    setResult(null)
    setWarn('')
    cancelRef.current = false
    setStatus({ busy: true, p: 0, label: 'Preparing frames…' })
    const list = []
    try {
      if (o.source === 'video') {
        const v = videoRef.current
        if (!v?.videoWidth) throw new Error('Load a video first')
        if (live) throw new Error('Sampling needs a file, not a live source')
        const times = sampleTimes(o.start, o.end, o.fps, v.duration)
        if (times.length >= LIMITS.gifMaxFrames) setWarn(`Capped at ${LIMITS.gifMaxFrames} frames. Lower the FPS or shorten the range.`)
        const was = v.currentTime
        const wasPlaying = !v.paused
        v.pause()
        let size = null
        for (let i = 0; i < times.length && !cancelRef.current; i++) {
          await seekVideo(v, times[i])
          const raw = captureCanvas(v, { bake: o.applyFilters, burn: { enabled: false }, watermark: null })
          size = size || outputSize(raw.width, raw.height)
          if (i === 0 && (o.width || 0) > raw.width && !o.allowUpscale) setWarn(`Width limited to the source width (${raw.width}px) to avoid upscaling.`)
          list.push({ id: uid(), canvas: fitInto(raw, size.w, size.h), delay: Math.round(1000 / o.fps), label: formatClock(times[i]) })
          setStatus({ busy: true, p: (i + 1) / times.length, label: `Sampling ${i + 1}/${times.length}` })
        }
        await seekVideo(v, was)
        if (wasPlaying) v.play().catch(() => {})
      } else {
        const src = o.source === 'all' ? shots : chosen
        if (!src.length) throw new Error(o.source === 'all' ? 'The gallery is empty' : 'Select frames in the gallery first')
        const items = src.slice(0, LIMITS.gifMaxFrames)
        if (src.length > items.length) setWarn(`Capped at ${LIMITS.gifMaxFrames} frames.`)
        let size = null
        for (let i = 0; i < items.length && !cancelRef.current; i++) {
          // Shots already have filters baked in; never apply them twice.
          const d = await blobToDrawable(items[i].blob)
          size = size || outputSize(d.width, d.height)
          if (i === 0 && (o.width || 0) > d.width && !o.allowUpscale) setWarn(`Width limited to the source width (${d.width}px) to avoid upscaling.`)
          const fitted = fitInto(d, size.w, size.h)
          if (o.burnCaptions && items[i].caption)
            drawLabel(fitted.getContext('2d'), items[i].caption, { position: 'bottom-right', size: Math.max(10, Math.round(size.w / 28)) })
          list.push({ id: uid(), canvas: fitted, delay: items[i].delay || Math.round(1000 / o.fps), label: formatClock(items[i].time) })
          d.close?.()
          setStatus({ busy: true, p: (i + 1) / items.length, label: `Loading ${i + 1}/${items.length}` })
        }
      }
      setFrames(list)
      if (!list.length) toast('No frames were loaded', { kind: 'warn' })
    } catch (e) {
      toast(e.message, { kind: 'error' })
    } finally {
      setStatus({ busy: false, p: 0, label: '' })
    }
  }

  /** Produce final canvases: crossfades, caption, watermark, optional downscale. */
  function* finalFrames(scale = 1) {
    const w = Math.max(2, Math.round(outW * scale)),
      h = Math.max(2, Math.round(outH * scale))
    const make = () => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    }
    const decorate = (c, i) => {
      const ctx = c.getContext('2d')
      const from = Math.max(1, o.captionFrom) - 1
      const to = o.captionTo > 0 ? o.captionTo - 1 : Infinity
      if (o.caption && i >= from && i <= to) {
        ctx.save()
        const size = Math.max(10, Math.round((o.captionSize * w) / 480))
        ctx.font = `900 ${size}px Impact, "Arial Black", system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = o.captionPos === 'top' ? 'top' : 'bottom'
        ctx.lineWidth = Math.max(2, size / 7)
        ctx.strokeStyle = '#000'
        ctx.fillStyle = '#fff'
        ctx.lineJoin = 'round'
        const y = o.captionPos === 'top' ? size * 0.3 : h - size * 0.3
        String(o.caption)
          .split('\n')
          .forEach((line, k, arr) => {
            const yy = o.captionPos === 'top' ? y + k * size * 1.1 : y - (arr.length - 1 - k) * size * 1.1
            ctx.strokeText(line, w / 2, yy)
            ctx.fillText(line, w / 2, yy)
          })
        ctx.restore()
      }
      if (o.watermark && settings.watermarkText)
        drawLabel(ctx, settings.watermarkText, {
          position: settings.watermarkPosition,
          size: Math.max(10, Math.round(w / 30)),
          opacity: settings.watermarkOpacity,
          box: false,
        })
      return c
    }
    let idx = 0
    for (let i = 0; i < arranged.length; i++) {
      const f = arranged[i]
      const c = make()
      c.getContext('2d').drawImage(f.canvas, 0, 0, w, h)
      yield { canvas: decorate(c, idx++), delay: f.delay }
      const next = arranged[i + 1]
      if (next && o.crossfade > 0) {
        for (let k = 1; k <= o.crossfade; k++) {
          const m = make()
          const ctx = m.getContext('2d')
          ctx.drawImage(f.canvas, 0, 0, w, h)
          ctx.globalAlpha = k / (o.crossfade + 1)
          ctx.drawImage(next.canvas, 0, 0, w, h)
          yield { canvas: decorate(m, idx++), delay: Math.max(20, Math.round(f.delay / (o.crossfade + 1))) }
        }
      }
    }
  }

  function encodeGif(scale = 1) {
    return new Promise((resolve, reject) => {
      workerRef.current?.terminate()
      const worker = new Worker(new URL('../workers/gif.worker.js', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.onmessage = (e) => {
        const m = e.data
        if (m.type === 'progress')
          setStatus((s) => ({ ...s, p: m.p, label: m.stage === 'collect' ? 'Analyzing colors…' : `Encoding ${Math.round(m.p * 100)}%` }))
        else if (m.type === 'done') {
          worker.terminate()
          workerRef.current = null
          resolve(new Blob([m.buffer], { type: 'image/gif' }))
        } else if (m.type === 'error') {
          worker.terminate()
          reject(new Error(m.message))
        }
      }
      worker.onerror = (e) => reject(new Error(e.message || 'Worker failed'))
      worker.postMessage({
        type: 'start',
        count: totalFrames,
        options: {
          colors: o.colors,
          dither: o.dither,
          globalPalette: o.globalPalette,
          optimize: o.optimize,
          loops: loopsValue,
          transparency: { enabled: o.transparency, threshold: o.alphaThreshold },
        },
      })
      // Stream frames: ImageData buffers are transferred, so the main thread keeps no copies.
      ;(async () => {
        for (const f of finalFrames(scale)) {
          if (cancelRef.current) {
            worker.terminate()
            return reject(new Error('Cancelled'))
          }
          const img = f.canvas.getContext('2d').getImageData(0, 0, f.canvas.width, f.canvas.height)
          worker.postMessage({ type: 'frame', data: img.data.buffer, width: img.width, height: img.height, delay: f.delay }, [img.data.buffer])
          await new Promise((r) => setTimeout(r))
        }
        worker.postMessage({ type: 'finish' })
      })()
    })
  }

  async function encodeVideo() {
    const mime = pickRecorderMime()
    const c = document.createElement('canvas')
    c.width = outW
    c.height = outH
    const ctx = c.getContext('2d')
    const stream = c.captureStream(0)
    const track = stream.getVideoTracks()[0]
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined)
    const chunks = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const stopped = new Promise((r) => (rec.onstop = r))
    rec.start()
    const all = [...finalFrames(1)]
    const plays = loopsValue === 0 ? 1 : loopsValue
    let n = 0
    for (let p = 0; p < plays; p++) {
      for (const f of all) {
        if (cancelRef.current) break
        ctx.drawImage(f.canvas, 0, 0)
        track.requestFrame?.()
        setStatus((s) => ({ ...s, p: ++n / (all.length * plays), label: 'Recording (real time)…' }))
        await new Promise((r) => setTimeout(r, f.delay))
      }
    }
    rec.stop()
    await stopped
    track.stop()
    if (cancelRef.current) throw new Error('Cancelled')
    return new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] })
  }

  async function encodeSprite() {
    const all = [...finalFrames(1)]
    const cols = Math.ceil(Math.sqrt(all.length))
    const rows = Math.ceil(all.length / cols)
    const sheet = document.createElement('canvas')
    sheet.width = cols * outW
    sheet.height = rows * outH
    if (sheet.width > 16384 || sheet.height > 16384) throw new Error('Sprite sheet would be too large; reduce width or frames')
    const ctx = sheet.getContext('2d')
    const meta = { frameWidth: outW, frameHeight: outH, columns: cols, rows, frames: [] }
    all.forEach((f, i) => {
      const x = (i % cols) * outW,
        y = Math.floor(i / cols) * outH
      ctx.drawImage(f.canvas, x, y)
      meta.frames.push({ index: i, x, y, w: outW, h: outH, duration: f.delay })
    })
    const png = await new Promise((r) => sheet.toBlob(r, 'image/png'))
    return zipBlobs([
      { name: 'spritesheet.png', blob: png },
      { name: 'spritesheet.json', blob: new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }) },
    ])
  }

  async function generate() {
    if (!arranged.length) return toast('Load frames first', { kind: 'warn' })
    if (memBytes > LIMITS.gifMemoryWarnBytes)
      setWarn(`This needs about ${formatBytes(memBytes)} of memory. If the tab crashes, lower the width, FPS or frame count.`)
    cancelRef.current = false
    setResult(null)
    setStatus({ busy: true, p: 0, label: 'Starting…' })
    try {
      let blob
      let kind = o.format
      if (o.format === 'gif') {
        blob = await encodeGif(1)
        const target = (o.targetMB || 0) * 1024 * 1024
        let scale = 1
        for (let attempt = 0; target && blob.size > target && attempt < 6; attempt++) {
          scale *= Math.max(0.5, Math.sqrt(target / blob.size) * 0.95)
          setStatus({ busy: true, p: 0, label: `Too big (${formatBytes(blob.size)}), retrying at ${Math.round(scale * 100)}%…` })
          blob = await encodeGif(scale)
        }
        if (target && blob.size > target) setWarn(`Could not get under ${o.targetMB} MB; try fewer frames or colors.`)
      } else if (o.format === 'apng') {
        const all = [...finalFrames(1)]
        blob = await encodeAPNG(
          all.map((f) => f.canvas),
          all.map((f) => f.delay),
          loopsValue === 0 ? 0 : loopsValue,
          (p) => setStatus((s) => ({ ...s, p, label: `Encoding ${Math.round(p * 100)}%` })),
        )
      } else if (o.format === 'video') {
        blob = await encodeVideo()
        kind = blob.type.includes('mp4') ? 'mp4' : 'webm'
      } else {
        blob = await encodeSprite()
        kind = 'sprite'
      }
      const ext = { gif: 'gif', apng: 'png', mp4: 'mp4', webm: 'webm', sprite: 'zip' }[kind]
      setResult({ blob, url: URL.createObjectURL(blob), kind, name: `animation_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}` })
    } catch (e) {
      if (e.message !== 'Cancelled') toast(`Export failed: ${e.message}`, { kind: 'error' })
    } finally {
      setStatus({ busy: false, p: 0, label: '' })
    }
  }

  function cancel() {
    cancelRef.current = true
    workerRef.current?.terminate()
    workerRef.current = null
    setStatus({ busy: false, p: 0, label: '' })
  }

  function applyPreset(id) {
    const p = GIF_QUALITY_PRESETS[id]
    set({ width: p.width, fps: p.fps, colors: p.colors, dither: p.dither, globalPalette: p.globalPalette, optimize: p.optimize, sizePreset: 'custom' })
  }

  const updateFrame = (id, patch) => setFrames((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const moveFrame = (from, to) =>
    setFrames((fs) => {
      const next = [...fs]
      const [x] = next.splice(from, 1)
      next.splice(Math.max(0, Math.min(next.length, to)), 0, x)
      return next
    })

  const suggestFps = o.source === 'video' && (o.end - o.start) * o.fps > 200

  return (
    <div className="export">
      <div className="row between wrap gap-s">
        <h2 className="h">{t('export.title')}</h2>
        <div className="seg" role="group" aria-label="Quality presets">
          {Object.entries(GIF_QUALITY_PRESETS).map(([id, p]) => (
            <button key={id} className="seg-btn" onClick={() => applyPreset(id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="export-grid">
        <div className="stack">
          <fieldset>
            <legend>1 · Frames</legend>
            <div className="row wrap gap">
              <label className="inline check">
                <input type="radio" name="gsrc" checked={o.source === 'gallery'} onChange={() => set({ source: 'gallery' })} /> Selected frames ({chosen.length}
                )
              </label>
              <label className="inline check">
                <input type="radio" name="gsrc" checked={o.source === 'all'} onChange={() => set({ source: 'all' })} /> All frames ({shots.length})
              </label>
              <label className="inline check">
                <input type="radio" name="gsrc" checked={o.source === 'video'} onChange={() => set({ source: 'video' })} disabled={live} /> Sample the video
              </label>
            </div>
            {o.source === 'video' && (
              <>
                <div className="grid3">
                  <label className="field">
                    Start (s){' '}
                    <input
                      type="number"
                      className="num"
                      min="0"
                      step="0.01"
                      value={o.start}
                      onChange={(e) => set({ start: Math.max(0, parseFloat(e.target.value) || 0) })}
                    />
                  </label>
                  <label className="field">
                    End (s){' '}
                    <input
                      type="number"
                      className="num"
                      min="0"
                      step="0.01"
                      value={o.end}
                      onChange={(e) => set({ end: Math.max(0, parseFloat(e.target.value) || 0) })}
                    />
                  </label>
                  <label className="field">
                    FPS{' '}
                    <input
                      type="number"
                      className="num"
                      min="1"
                      max={LIMITS.gifMaxFps}
                      value={o.fps}
                      onChange={(e) => set({ fps: Math.min(LIMITS.gifMaxFps, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                    />
                  </label>
                </div>
                <div className="row wrap gap-s">
                  <button
                    className="btn secondary sm"
                    onClick={() => set({ start: range.in ?? 0, end: range.out ?? videoRef.current?.duration ?? o.end })}
                    disabled={range.in == null && range.out == null}
                  >
                    Use in/out range
                  </button>
                  <label className="inline check">
                    <input type="checkbox" checked={o.applyFilters} onChange={(e) => set({ applyFilters: e.target.checked })} /> Apply current filters
                  </label>
                  <span className="muted small">
                    {Math.max(0, Math.floor((o.end - o.start) * o.fps) + 1)} frames · source {videoFps} fps
                  </span>
                </div>
                {suggestFps && (
                  <p className="warn small">
                    That is a lot of frames. Try {Math.max(5, Math.floor(200 / Math.max(0.1, o.end - o.start)))} fps for a smaller file.
                  </p>
                )}
              </>
            )}
            <div className="grid2">
              <label className="field">
                Size
                <select
                  value={o.sizePreset}
                  onChange={(e) => {
                    const p = GIF_SIZE_PRESETS.find((x) => x.id === e.target.value)
                    set({ sizePreset: e.target.value, width: p?.width ?? (p ? 99999 : o.width) })
                  }}
                >
                  {GIF_SIZE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">Custom width</option>
                </select>
              </label>
              <label className="field">
                Width (px){' '}
                <input
                  type="number"
                  className="num"
                  min={LIMITS.gifMinWidth}
                  max={LIMITS.gifMaxWidth}
                  step="2"
                  value={Math.min(o.width, LIMITS.gifMaxWidth)}
                  onChange={(e) => set({ width: parseInt(e.target.value, 10) || 480, sizePreset: 'custom' })}
                />
              </label>
              <label className="field">
                Aspect{' '}
                <select value={o.aspect} onChange={(e) => set({ aspect: e.target.value })}>
                  {ASPECTS.map(([id, l]) => (
                    <option key={id} value={id}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {o.aspect !== 'source' && (
                <label className="field">
                  Resize mode{' '}
                  <select value={o.fitMode} onChange={(e) => set({ fitMode: e.target.value })}>
                    <option value="fill">Fill (crop)</option>
                    <option value="fit">Fit (letterbox)</option>
                    <option value="stretch">Stretch</option>
                  </select>
                </label>
              )}
              {o.aspect !== 'source' && o.fitMode === 'fit' && (
                <label className="field">
                  Bars <input type="color" value={o.bg} onChange={(e) => set({ bg: e.target.value })} />
                </label>
              )}
            </div>
            <label className="inline check">
              <input type="checkbox" checked={o.allowUpscale} onChange={(e) => set({ allowUpscale: e.target.checked })} /> Allow upscaling beyond the source
            </label>
            {o.source !== 'video' && (
              <label className="inline check">
                <input type="checkbox" checked={o.burnCaptions} onChange={(e) => set({ burnCaptions: e.target.checked })} /> Burn in frame captions
              </label>
            )}
            <div className="row gap-s">
              <button className="btn" onClick={loadFrames} disabled={status.busy}>
                Load frames
              </button>
              {frames.length > 0 && (
                <button className="btn secondary sm" onClick={() => setFrames([])}>
                  Clear
                </button>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend>2 · Timing & look</legend>
            <div className="grid2">
              <label className="field">
                Order{' '}
                <select value={o.order} onChange={(e) => set({ order: e.target.value })}>
                  <option value="forward">Forward</option>
                  <option value="reverse">Reverse</option>
                  <option value="pingpong">Ping-pong (boomerang)</option>
                </select>
              </label>
              <label className="field">
                Loop{' '}
                <select value={o.loops} onChange={(e) => set({ loops: e.target.value === 'n' ? 'n' : +e.target.value })}>
                  <option value={0}>Forever</option>
                  <option value={1}>Play once</option>
                  <option value="n">N times</option>
                </select>
              </label>
              {o.loops === 'n' && (
                <label className="field">
                  Times{' '}
                  <input
                    type="number"
                    className="num"
                    min="2"
                    max="100"
                    value={o.loopCount}
                    onChange={(e) => set({ loopCount: Math.max(2, Math.min(100, +e.target.value || 2)) })}
                  />
                </label>
              )}
            </div>
            <Slider label="Speed" value={o.speed} min={0.25} max={4} step={0.05} unit="×" def={1} onChange={(v) => set({ speed: v })} />
            <Slider
              label="Crossfade frames"
              value={o.crossfade}
              min={0}
              max={6}
              def={0}
              onChange={(v) => set({ crossfade: v })}
              hint="Blended in-between frames"
            />
            <label className="field">
              Caption (meme style)
              <textarea
                className="text"
                rows="2"
                value={o.caption}
                onChange={(e) => set({ caption: e.target.value })}
                placeholder="Optional text over the animation"
                maxLength={160}
              />
            </label>
            {o.caption && (
              <div className="grid3">
                <label className="field">
                  Position{' '}
                  <select value={o.captionPos} onChange={(e) => set({ captionPos: e.target.value })}>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
                <label className="field">
                  From frame{' '}
                  <input
                    type="number"
                    className="num"
                    min="1"
                    value={o.captionFrom}
                    onChange={(e) => set({ captionFrom: Math.max(1, +e.target.value || 1) })}
                  />
                </label>
                <label className="field">
                  To frame (0 = end){' '}
                  <input type="number" className="num" min="0" value={o.captionTo} onChange={(e) => set({ captionTo: Math.max(0, +e.target.value || 0) })} />
                </label>
                <Slider label="Text size" value={o.captionSize} min={12} max={96} def={36} onChange={(v) => set({ captionSize: v })} />
              </div>
            )}
            <label className="inline check" title={settings.watermarkText ? '' : 'Set watermark text in Capture settings first'}>
              <input type="checkbox" checked={o.watermark} disabled={!settings.watermarkText} onChange={(e) => set({ watermark: e.target.checked })} /> Add
              watermark{settings.watermarkText ? ` (“${settings.watermarkText}”)` : ' (set it in Capture settings)'}
            </label>
          </fieldset>

          <fieldset>
            <legend>3 · Format</legend>
            <div className="seg" role="group" aria-label="Output format">
              {[['gif', 'GIF'], ['apng', 'APNG'], ...(canRecordCanvas() ? [['video', 'Video (WebM/MP4)']] : []), ['sprite', 'Sprite sheet']].map(([id, l]) => (
                <button key={id} className={`seg-btn ${o.format === id ? 'on' : ''}`} aria-pressed={o.format === id} onClick={() => set({ format: id })}>
                  {l}
                </button>
              ))}
            </div>
            {o.format === 'gif' && (
              <>
                <Slider label="Colors" value={o.colors} min={2} max={256} def={256} onChange={(v) => set({ colors: v })} />
                <div className="grid2">
                  <label className="field">
                    Dithering{' '}
                    <select value={o.dither} onChange={(e) => set({ dither: e.target.value })}>
                      <option value="none">None (smallest)</option>
                      <option value="floyd">Floyd–Steinberg</option>
                      <option value="ordered">Ordered (Bayer)</option>
                    </select>
                  </label>
                  <label className="field">
                    Target size (MB, 0 = off){' '}
                    <input
                      type="number"
                      className="num"
                      min="0"
                      step="0.5"
                      value={o.targetMB}
                      onChange={(e) => set({ targetMB: Math.max(0, parseFloat(e.target.value) || 0) })}
                    />
                  </label>
                </div>
                <label className="inline check">
                  <input type="checkbox" checked={o.globalPalette} onChange={(e) => set({ globalPalette: e.target.checked })} /> Shared palette (smaller, no
                  flicker)
                </label>
                <label className="inline check">
                  <input type="checkbox" checked={o.optimize} disabled={o.transparency} onChange={(e) => set({ optimize: e.target.checked })} /> Only store
                  changed pixels between frames
                </label>
                <label className="inline check">
                  <input type="checkbox" checked={o.transparency} onChange={(e) => set({ transparency: e.target.checked })} /> Keep transparency (from chroma
                  key or PNG frames)
                </label>
                {o.transparency && (
                  <Slider label="Alpha threshold" value={o.alphaThreshold} min={1} max={254} def={128} onChange={(v) => set({ alphaThreshold: v })} />
                )}
              </>
            )}
            {o.format === 'video' && (
              <small className="muted">
                Recorded in real time with MediaRecorder ({totalMs ? `${(totalMs / 1000).toFixed(1)}s` : '—'}
                {loopsValue > 1 ? ` × ${loopsValue}` : ''}).
              </small>
            )}
            {o.format === 'sprite' && <small className="muted">A PNG grid plus JSON frame metadata, zipped together.</small>}
            {o.format === 'apng' && <small className="muted">Full color, supports transparency, plays in all modern browsers.</small>}
          </fieldset>
        </div>

        <div className="stack">
          <FramePreview frames={arranged} />
          {frames.length > 0 && (
            <>
              <div className="row between wrap small">
                <span>
                  {arranged.length} frames · {outW}×{outH} · {(totalMs / 1000).toFixed(2)}s
                </span>
                {o.format === 'gif' && <span className="muted">≈ {formatBytes(estimate)} (estimate)</span>}
              </div>
              {frames.length > 1 && (
                <div className="trim">
                  <label className="field">
                    Trim start{' '}
                    <input
                      type="range"
                      min="0"
                      max={frames.length - 1}
                      value={trim[0]}
                      onChange={(e) => setTrim(([, b]) => [Math.min(+e.target.value, b), b])}
                      aria-label="Trim start frame"
                    />
                  </label>
                  <label className="field">
                    Trim end{' '}
                    <input
                      type="range"
                      min="0"
                      max={frames.length - 1}
                      value={trim[1]}
                      onChange={(e) => setTrim(([a]) => [a, Math.max(+e.target.value, a)])}
                      aria-label="Trim end frame"
                    />
                  </label>
                  <small className="muted">
                    Frames {trim[0] + 1}–{trim[1] + 1} of {frames.length}
                  </small>
                </div>
              )}
              <div className="frame-strip" role="list" aria-label="Animation frames">
                {frames.map((f, i) => (
                  <div
                    key={f.id}
                    role="listitem"
                    className={`fs-item ${i < trim[0] || i > trim[1] ? 'trimmed' : ''}`}
                    draggable
                    onDragStart={() => (dragFrom.current = i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragFrom.current != null) moveFrame(dragFrom.current, i)
                      dragFrom.current = null
                    }}
                  >
                    <FrameThumb canvas={f.canvas} label={`Frame ${i + 1}`} />
                    <span className="mono small">{i + 1}</span>
                    <label className="sr-only" htmlFor={`d-${f.id}`}>
                      Frame {i + 1} delay in ms
                    </label>
                    <input
                      id={`d-${f.id}`}
                      type="number"
                      className="num tiny"
                      min="20"
                      step="10"
                      value={f.delay}
                      onChange={(e) => updateFrame(f.id, { delay: Math.max(20, parseInt(e.target.value, 10) || 20) })}
                      title="Delay (ms)"
                    />
                    <div className="row gap-xs">
                      <button className="mini" onClick={() => moveFrame(i, i - 1)} aria-label={`Move frame ${i + 1} earlier`}>
                        ◀
                      </button>
                      <button
                        className="mini"
                        onClick={() => setFrames((fs) => [...fs.slice(0, i + 1), { ...f, id: uid() }, ...fs.slice(i + 1)])}
                        aria-label={`Duplicate frame ${i + 1}`}
                      >
                        ⧉
                      </button>
                      <button className="mini" onClick={() => setFrames((fs) => fs.filter((x) => x.id !== f.id))} aria-label={`Remove frame ${i + 1}`}>
                        ✕
                      </button>
                      <button className="mini" onClick={() => moveFrame(i, i + 1)} aria-label={`Move frame ${i + 1} later`}>
                        ▶
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="btn secondary sm"
                onClick={() => {
                  const d = Math.round(1000 / o.fps)
                  setFrames((fs) => fs.map((f) => ({ ...f, delay: d })))
                }}
              >
                Set all delays to {Math.round(1000 / o.fps)} ms
              </button>
            </>
          )}
          {warn && (
            <p className="warn small" role="status">
              {warn}
            </p>
          )}
          {memBytes > LIMITS.gifMemoryWarnBytes && (
            <p className="warn small">High memory use (~{formatBytes(memBytes)}). Reduce width or frames if the tab struggles.</p>
          )}
          <div className="row gap-s wrap" aria-live="polite">
            <button className="btn" onClick={generate} disabled={status.busy || !arranged.length}>
              Generate {o.format === 'video' ? 'video' : o.format === 'sprite' ? 'sprite sheet' : o.format.toUpperCase()}
            </button>
            {status.busy && (
              <>
                <progress max="1" value={status.p} />
                <span className="muted small">{status.label}</span>
                <button className="btn secondary sm" onClick={cancel}>
                  Cancel
                </button>
              </>
            )}
          </div>
          {result && (
            <div className="result">
              {result.kind === 'gif' || result.kind === 'apng' ? (
                <img src={result.url} alt="Exported animation preview" />
              ) : result.kind === 'sprite' ? (
                <p>Sprite sheet ready.</p>
              ) : (
                <video src={result.url} controls loop autoPlay muted playsInline />
              )}
              <div className="row wrap gap-s">
                <span className="muted small">{formatBytes(result.blob.size)}</span>
                <button className="btn sm" onClick={() => downloadBlob(result.blob, result.name)}>
                  Download
                </button>
                {result.kind !== 'sprite' && (
                  <button
                    className="btn secondary sm"
                    onClick={async () => {
                      try {
                        await copyImageToClipboard(result.blob)
                        toast('Copied (as a still image: browsers cannot copy animations)')
                      } catch (e) {
                        toast(e.message, { kind: 'warn' })
                      }
                    }}
                  >
                    Copy
                  </button>
                )}
                {canShareFiles() && (
                  <button
                    className="btn secondary sm"
                    onClick={() =>
                      shareFiles([{ blob: result.blob, name: result.name }]).catch((e) => e?.name !== 'AbortError' && toast(e.message, { kind: 'warn' }))
                    }
                  >
                    Share
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FrameThumb({ canvas, label }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = 96
    c.height = Math.round((96 * canvas.height) / canvas.width)
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height)
  }, [canvas])
  return <canvas ref={ref} className="fs-thumb" aria-label={label} role="img" />
}

/** Plays prepared frames with their delays, with play/pause and a scrubber. */
function FramePreview({ frames }) {
  const ref = useRef(null)
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  useEffect(() => setI(0), [frames.length])
  useEffect(() => {
    const c = ref.current
    const f = frames[i]
    if (!c || !f) return
    c.width = f.canvas.width
    c.height = f.canvas.height
    c.getContext('2d').drawImage(f.canvas, 0, 0)
    if (!playing || frames.length < 2) return
    const tm = setTimeout(() => setI((x) => (x + 1) % frames.length), f.delay)
    return () => clearTimeout(tm)
  }, [i, frames, playing])
  if (!frames.length) return <div className="preview-empty muted">Load frames to preview the animation here.</div>
  return (
    <div className="frame-preview">
      <canvas ref={ref} aria-label="Animation preview" role="img" />
      <div className="row gap-s">
        <button className="btn icon secondary sm" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause preview' : 'Play preview'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min="0"
          max={frames.length - 1}
          value={Math.min(i, frames.length - 1)}
          onChange={(e) => {
            setPlaying(false)
            setI(+e.target.value)
          }}
          aria-label="Preview frame"
          className="grow"
        />
        <span className="mono small">
          {Math.min(i, frames.length - 1) + 1}/{frames.length}
        </span>
      </div>
    </div>
  )
}
