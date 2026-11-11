import React, { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { canExportVideo, decodeAudio, exportVideo } from '../lib/videoExport'
import { defaultClips, framePlan, totalDuration } from '../lib/clips'
import { drawTitles } from '../lib/titles'
import { downloadBlob } from '../lib/download'
import { formatBytes, ls } from '../lib/storage'
import { formatClock } from '../lib/timecode'

const SIZES = [
  ['source', 'Same as source'],
  ['x2', 'Upscale 2×'],
  ['2160', '4K (2160p)'],
  ['1440', '1440p'],
  ['1080', '1080p'],
  ['720', '720p'],
  ['480', '480p'],
]
const QUALITY = { small: ['Smaller file', 0.05], balanced: ['Balanced', 0.1], high: ['High quality', 0.18], max: ['Near lossless', 0.3] }

/** Renders the edit (cuts, speed, color, crop, titles, fades) to an MP4 or WebM file, entirely in the browser. */
export default function ExportVideoPanel({ videoRef, source, edit, duration, fps: sourceFps, captureCanvas, filters, onOpenResult, live }) {
  const { toast, logError } = useApp()
  const [o, setO] = useState(() => ({ size: 'source', fps: 'source', quality: 'balanced', audio: true, sharpen: true, ...ls.get('fc.exportVideo', {}) }))
  const [status, setStatus] = useState(null)
  const [result, setResult] = useState(null)
  const cancelRef = useRef(false)
  const set = (p) => setO((prev) => ({ ...prev, ...p }))
  useEffect(() => ls.set('fc.exportVideo', o), [o])
  useEffect(() => () => result?.url && URL.revokeObjectURL(result.url), [result])

  if (live) return <p className="muted">Export needs a video file, not a live source.</p>
  if (!canExportVideo())
    return <p className="warn">This browser does not support WebCodecs video encoding. Use a current Chrome, Edge, Firefox or Safari to export video.</p>

  const v = videoRef.current
  const clips = edit.clips || defaultClips(duration)
  const outFps = o.fps === 'source' ? Math.min(60, Math.round(sourceFps)) : +o.fps
  const total = totalDuration(clips)
  const frames = duration ? framePlan(clips, outFps).length : 0

  function outputSize(w, h) {
    if (o.size === 'source') return [w, h]
    if (o.size === 'x2') return [w * 2, h * 2]
    const th = +o.size
    return [Math.round((w * th) / h), th]
  }

  async function run() {
    const el = videoRef.current
    if (!el?.videoWidth) return toast('Load a video first', { kind: 'warn' })
    cancelRef.current = false
    setResult(null)
    setStatus({ p: 0, stage: 'Preparing…' })
    const t0 = performance.now()
    try {
      const probe = captureCanvas(el, { burn: { enabled: false } })
      const [w, h] = outputSize(probe.width, probe.height)
      if (w * h > 3840 * 2160 * 1.1) throw new Error('Output is larger than 4K. Pick a smaller size.')
      const upscaling = w > probe.width * 1.05
      // A touch of extra sharpening when enlarging keeps upscaled video from looking soft.
      const exportFilters = upscaling && o.sharpen ? { ...filters, sharpen: Math.min(100, (filters.sharpen || 0) + 35) } : filters
      let audio = null
      if (o.audio && source?.file) {
        setStatus({ p: 0, stage: 'Decoding audio…' })
        if (source.file.size > 600 * 1024 * 1024) toast('Audio skipped: the file is too large to decode in memory', { kind: 'warn' })
        else audio = await decodeAudio(source.file)
      }
      const res = await exportVideo({
        video: el,
        clips,
        fps: outFps,
        width: w,
        height: h,
        bitrate: Math.round(w * h * outFps * QUALITY[o.quality][1]),
        audio,
        fadeIn: edit.fadeIn || 0,
        fadeOut: edit.fadeOut || 0,
        isCancelled: () => cancelRef.current,
        onProgress: (s) => {
          const el2 = (performance.now() - t0) / 1000
          setStatus({ ...s, eta: s.p > 0.02 ? (el2 / s.p) * (1 - s.p) : null })
        },
        renderFrame: (vid, time) => {
          const c = captureCanvas(vid, { burn: { enabled: false }, filters: exportFilters })
          if (edit.titles?.length) drawTitles(c.getContext('2d'), edit.titles, time)
          return c
        },
      })
      const name = `${(source?.name || 'video').replace(/\.[^.]+$/, '')}_edit.${res.container}`
      setResult({ ...res, url: URL.createObjectURL(res.blob), name, seconds: (performance.now() - t0) / 1000 })
      toast(`Video exported (${formatBytes(res.blob.size)})`)
    } catch (e) {
      if (e?.name !== 'AbortError') {
        toast(`Export failed: ${e.message}`, { kind: 'error', timeout: 8000 })
        logError(e, 'video export')
      }
    } finally {
      setStatus(null)
    }
  }

  return (
    <div className="stack">
      <p className="muted small">
        Exports your cuts, clip order and speed, color, crop/rotation, titles and fades as a new video file.{' '}
        {v?.videoWidth ? `${clips.length} clip${clips.length === 1 ? '' : 's'} · ${formatClock(total)} · ${frames} frames.` : ''}
      </p>
      <div className="grid2">
        <label className="field">
          Resolution
          <select value={o.size} onChange={(e) => set({ size: e.target.value })}>
            {SIZES.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Frame rate
          <select value={o.fps} onChange={(e) => set({ fps: e.target.value })}>
            <option value="source">Source ({Math.min(60, Math.round(sourceFps))} fps)</option>
            {[60, 30, 25, 24, 15, 12].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Quality
          <select value={o.quality} onChange={(e) => set({ quality: e.target.value })}>
            {Object.entries(QUALITY).map(([id, [l]]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="inline check">
        <input type="checkbox" checked={o.audio} onChange={(e) => set({ audio: e.target.checked })} /> Include audio
      </label>
      <label className="inline check">
        <input type="checkbox" checked={o.sharpen} onChange={(e) => set({ sharpen: e.target.checked })} /> Sharpen when upscaling
      </label>
      <small className="muted">
        MP4 (H.264 + AAC) where the browser can encode it, otherwise WebM (VP9 + Opus). Changing a clip’s speed also changes its audio pitch.
      </small>
      <div className="row wrap gap-s" aria-live="polite">
        <button className="btn" onClick={run} disabled={!!status || !v?.videoWidth}>
          Export video
        </button>
        {status && (
          <>
            <progress max="1" value={status.p} />
            <span className="muted small">
              {status.stage}
              {status.eta != null ? ` · ~${Math.ceil(status.eta)}s left` : ''}
            </span>
            <button className="btn secondary sm" onClick={() => (cancelRef.current = true)}>
              Cancel
            </button>
          </>
        )}
      </div>
      {result && (
        <div className="result">
          <video src={result.url} controls playsInline />
          <div className="row wrap gap-s">
            <span className="muted small">
              {result.width}×{result.height} · {result.container.toUpperCase()}
              {result.hasAudio ? ' + audio' : ' (no audio)'} · {formatBytes(result.blob.size)} · took {result.seconds.toFixed(1)}s
            </span>
            <button className="btn sm" onClick={() => downloadBlob(result.blob, result.name)}>
              Download
            </button>
            <button
              className="btn secondary sm"
              onClick={() => onOpenResult(new File([result.blob], result.name, { type: result.blob.type }))}
              title="Open the exported video as a new tab to capture frames from it"
            >
              Open in studio
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
