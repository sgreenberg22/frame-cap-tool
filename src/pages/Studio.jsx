import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Player from '../components/Player'
import Timeline from '../components/Timeline'
import Transport from '../components/Transport'
import FilterPanel from '../components/FilterPanel'
import CapturePanel from '../components/CapturePanel'
import ViewPanel from '../components/ViewPanel'
import VideoInfo from '../components/VideoInfo'
import Scopes from '../components/Scopes'
import Gallery from '../components/Gallery'
import Modal from '../components/Modal'
import ShortcutsHelp from '../components/ShortcutsHelp'
import Tour from '../components/Tour'
import ErrorBoundary from '../components/ErrorBoundary'
import useMediaTime from '../hooks/useMediaTime'
import { useApp } from '../state/store'
import { useT } from '../lib/i18n'
import { DEFAULT_FPS, LIMITS } from '../lib/config'
import { DEFAULT_FILTERS, autoLevelsFromHistogram, parseCube, whiteBalanceFrom, rgbToHex } from '../lib/filters'
import { planBatch, sampleTimes } from '../lib/batch'
import { renderCapture, seekVideo, drawLabel, getWatermarkImage } from '../lib/capture'
import { detectBars, histogram, sharpness, signature, signatureDiff } from '../lib/analysis'
import { computePeaks, decodeImageFrames, generateSampleVideo, measureFps, subtitleFileToUrl, canRecordCanvas } from '../lib/media'
import { db, ls, formatBytes, storageEstimate } from '../lib/storage'
import { formatClock } from '../lib/timecode'
import { shutterSound, haptic } from '../lib/feedback'

const EditorModal = lazy(() => import('../components/editor/EditorModal'))
const ExportPanel = lazy(() => import('../components/ExportPanel'))

const uid = () => Math.random().toString(36).slice(2, 10)
const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
const DEFAULT_BATCH = { mode: 'interval', count: 10, intervalMs: 500, everyFrames: 10, sceneThreshold: 12, skipDuplicates: false, dupThreshold: 1.5 }

function videoErrorMessage(err, source) {
  if (!err) return 'The video could not be played.'
  if (source?.kind === 'url') return 'Could not load that URL. The server may block cross-origin use (CORS), or the format is unsupported.'
  if (err.code === 4) return 'This format or codec is not supported by your browser. Try MP4 (H.264/AAC) or WebM (VP9/Opus).'
  if (err.code === 3) return 'The video is corrupted or uses features your browser cannot decode.'
  if (err.code === 2) return 'A network error interrupted loading.'
  return err.message || 'The video could not be played.'
}

export default function Studio() {
  const t = useT()
  const app = useApp()
  const { settings, setSettings, shots, toast, addShotsFromCanvases, logError } = app
  const playerRef = useRef(null)
  const [sources, setSources] = useState([])
  const [activeId, setActiveId] = useState(null)
  const source = sources.find((s) => s.id === activeId) || null
  const [, force] = useState(0)
  const v = playerRef.current?.video?.() || null
  const time = useMediaTime(
    {
      get current() {
        return playerRef.current?.video?.()
      },
    },
    [activeId, v],
  )

  const [lut, setLut] = useState(null)
  const [view, setView] = useState('normal')
  const [split, setSplit] = useState(0)
  const [hold, setHold] = useState(false)
  const [overlays, setOverlays] = useState(() => ls.get('fc.overlays', { thirds: false, grid: 0, crosshair: false, safe: false }))
  const [roi, setRoi] = useState(null)
  const [tool, setTool] = useState('none')
  const [rotate, setRotate] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [onion, setOnion] = useState({ enabled: false, opacity: 0.4 })
  const [measure, setMeasure] = useState({ lines: [], pxPerUnit: null, unit: '', results: [] })
  const [range, setRange] = useState({ in: null, out: null })
  const [loopRange, setLoopRange] = useState(false)
  const [markers, setMarkers] = useState({})
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeedState] = useState(1)
  const [volume, setVolumeState] = useState(() => ls.get('fc.volume', 1))
  const [muted, setMuted] = useState(false)
  const [fpsMap, setFpsMap] = useState({})
  const [batch, setBatch] = useState(() => ({ ...DEFAULT_BATCH, ...ls.get('fc.batch', {}) }))
  const [batchProgress, setBatchProgress] = useState(null)
  const batchCtl = useRef({ running: false, cancel: false })
  const [peaks, setPeaks] = useState({})
  const [audioTrigger, setAudioTrigger] = useState({ enabled: false, threshold: 40 })
  const [audioLevel, setAudioLevel] = useState(0)
  const [compare, setCompare] = useState(null)
  const [showScopes, setShowScopes] = useState(false)
  const [panel, setPanel] = useState(() => ls.get('fc.panel', 'filters'))
  const [mobileTab, setMobileTab] = useState('video')
  const [dragOver, setDragOver] = useState(false)
  const [modal, setModal] = useState(null) // 'url' | 'shortcuts' | 'contact'
  const [editorId, setEditorId] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [flashKey, setFlashKey] = useState(0)
  const [recent, setRecent] = useState([])
  const [storage, setStorage] = useState(null)
  const [splitPct, setSplitPct] = useState(() => ls.get('fc.split', 60))
  const [sampleBusy, setSampleBusy] = useState(false)
  const [loading, setLoading] = useState(false)

  const fps = fpsMap[activeId] || DEFAULT_FPS
  const filters = source?.filters || DEFAULT_FILTERS
  const live = !!source?.stream
  const duration = v && Number.isFinite(v.duration) ? v.duration : 0
  const sourceMarkers = useMemo(() => markers[activeId] || [], [markers, activeId])
  const nowTime = useCallback(() => playerRef.current?.video?.()?.currentTime ?? time, [time])

  useEffect(() => ls.set('fc.overlays', overlays), [overlays])
  useEffect(() => void getWatermarkImage(settings.watermarkImage), [settings.watermarkImage])
  useEffect(() => ls.set('fc.batch', batch), [batch])
  useEffect(() => ls.set('fc.panel', panel), [panel])
  useEffect(() => ls.set('fc.split', splitPct), [splitPct])
  useEffect(() => {
    db.get('recent').then((r) => setRecent(Array.isArray(r) ? r : []))
  }, [])
  useEffect(() => {
    storageEstimate().then(setStorage)
  }, [shots.length])

  const setFilters = useCallback(
    (upd) => {
      setSources((prev) =>
        prev.map((s) => {
          if (s.id !== activeId) return s
          const next = typeof upd === 'function' ? upd(s.filters) : upd
          ls.set('fc.filters', next)
          return { ...s, filters: next }
        }),
      )
    },
    [activeId],
  )

  // ---------- Sources ----------
  const addSource = useCallback((src) => {
    const lastFilters = { ...DEFAULT_FILTERS, ...ls.get('fc.filters', {}) }
    const s = { id: uid(), filters: lastFilters, ...src }
    setSources((prev) => [...prev, s])
    setActiveId(s.id)
    setRange({ in: null, out: null })
    setRoi(null)
    setMobileTab('video')
    return s
  }, [])

  const rememberRecent = useCallback(
    async (file, handle) => {
      const entry = { name: file.name, size: file.size, type: file.type, at: Date.now(), handle: handle || null }
      const next = [entry, ...recent.filter((r) => r.name !== file.name)].slice(0, 8)
      setRecent(next)
      try {
        await db.set('recent', next)
      } catch {
        await db.set(
          'recent',
          next.map((r) => ({ ...r, handle: null })),
        )
      }
    },
    [recent],
  )

  const openVideoFile = useCallback(
    (file, handle) => {
      if (!file) return
      addSource({ name: file.name, url: URL.createObjectURL(file), file, kind: 'file' })
      rememberRecent(file, handle)
    },
    [addSource, rememberRecent],
  )

  const importImages = useCallback(
    async (files) => {
      setLoading(true)
      try {
        let n = 0
        for (const f of files) {
          const frames = await decodeImageFrames(f)
          await addShotsFromCanvases(frames.map((fr) => ({ canvas: fr.canvas, time: fr.time, video: f.name, delay: fr.delay })))
          n += frames.length
        }
        toast(`Imported ${n} frame${n === 1 ? '' : 's'} into the gallery`)
        setMobileTab('frames')
      } catch (e) {
        toast(`Could not import images: ${e.message}`, { kind: 'error' })
      } finally {
        setLoading(false)
      }
    },
    [addShotsFromCanvases, toast],
  )

  const handleFiles = useCallback(
    async (list) => {
      const files = [...(list || [])]
      if (!files.length) return
      const videos = files.filter((f) => f.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|ogv|avi)$/i.test(f.name))
      const images = files.filter((f) => f.type.startsWith('image/'))
      const subs = files.filter((f) => /\.(vtt|srt)$/i.test(f.name))
      const luts = files.filter((f) => /\.cube$/i.test(f.name))
      videos.forEach((f) => openVideoFile(f))
      if (images.length) importImages(images)
      if (subs.length && (source || videos.length)) loadCaptions(subs[0])
      if (luts.length) {
        try {
          const parsed = parseCube(await luts[0].text())
          setLut({ ...parsed, name: parsed.title || luts[0].name })
          toast(`Loaded LUT ${parsed.title || luts[0].name}`)
        } catch (e) {
          toast(`Could not read LUT: ${e.message}`, { kind: 'error' })
        }
      }
      const unknown = files.length - videos.length - images.length - subs.length - luts.length
      if (unknown > 0) toast(`${unknown} file${unknown > 1 ? 's' : ''} skipped: not a video, image, subtitle or LUT`, { kind: 'warn' })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openVideoFile, importImages, source],
  )

  async function pickFile() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.ogv'] } }],
        })
        openVideoFile(await handle.getFile(), handle)
      } catch (e) {
        if (e?.name !== 'AbortError') document.getElementById('fileInput')?.click()
      }
    } else document.getElementById('fileInput')?.click()
  }

  async function reopenRecent(r) {
    if (!r.handle) {
      toast(`Choose “${r.name}” again to reopen it`)
      return pickFile()
    }
    try {
      let perm = await r.handle.queryPermission?.({ mode: 'read' })
      if (perm !== 'granted') perm = await r.handle.requestPermission?.({ mode: 'read' })
      if (perm !== 'granted') throw new Error('Permission denied')
      openVideoFile(await r.handle.getFile(), r.handle)
    } catch (e) {
      toast(`Could not reopen ${r.name}: ${e.message}`, { kind: 'error' })
    }
  }

  async function openStream(kind) {
    try {
      const stream =
        kind === 'screen'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 } }, audio: true })
      const s = addSource({ name: kind === 'screen' ? 'Screen share' : 'Camera', stream, kind: 'stream' })
      stream.getVideoTracks()[0]?.addEventListener('ended', () => closeSource(s.id))
    } catch (e) {
      if (e?.name !== 'NotAllowedError') toast(`Could not start ${kind}: ${e.message}`, { kind: 'error' })
    }
  }

  async function closeSource(id) {
    const s = sources.find((x) => x.id === id)
    if (!s) return
    s.stream?.getTracks().forEach((tr) => tr.stop())
    if (s.kind === 'file') setTimeout(() => URL.revokeObjectURL(s.url), 500)
    if (s.captionsUrl) URL.revokeObjectURL(s.captionsUrl)
    setSources((prev) => {
      const next = prev.filter((x) => x.id !== id)
      if (id === activeId) setActiveId(next[next.length - 1]?.id || null)
      return next
    })
  }

  async function loadSample() {
    setSampleBusy(true)
    try {
      const file = await generateSampleVideo(4)
      openVideoFile(file)
    } catch (e) {
      toast(e.message, { kind: 'error' })
    } finally {
      setSampleBusy(false)
    }
  }

  async function loadCaptions(file) {
    if (!file || !activeId) return
    const url = await subtitleFileToUrl(file)
    setSources((prev) => prev.map((s) => (s.id === activeId ? { ...s, captionsUrl: url, captionsName: file.name } : s)))
  }

  // Drag and drop + paste anywhere on the page
  useEffect(() => {
    let depth = 0
    const enter = (e) => {
      if ([...(e.dataTransfer?.types || [])].includes('Files')) {
        depth++
        setDragOver(true)
        e.preventDefault()
      }
    }
    const over = (e) => {
      if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault()
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragOver(false)
    }
    const drop = (e) => {
      if (!e.dataTransfer?.files?.length) return
      e.preventDefault()
      depth = 0
      setDragOver(false)
      handleFiles(e.dataTransfer.files)
    }
    const paste = (e) => {
      if (isTyping(e.target)) return
      const files = [...(e.clipboardData?.files || [])]
      if (files.length) {
        e.preventDefault()
        handleFiles(files)
      }
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('paste', paste)
    }
  }, [handleFiles])

  // ---------- Playback ----------
  const applyPlaybackProps = useCallback(() => {
    const el = playerRef.current?.video?.()
    if (!el) return
    if (!el.srcObject) el.playbackRate = speed
    el.volume = volume
    el.muted = muted
    el.preservesPitch = settings.preservePitch
    el.webkitPreservesPitch = settings.preservePitch
  }, [speed, volume, muted, settings.preservePitch])
  useEffect(applyPlaybackProps, [applyPlaybackProps])

  const onVideoEvent = useCallback(
    (type) => {
      const el = playerRef.current?.video?.()
      if (!el) return
      if (type === 'play') setPlaying(true)
      if (type === 'pause' || type === 'ended') setPlaying(false)
      if (type === 'loadedmetadata') {
        applyPlaybackProps() // newly loaded videos keep the chosen speed
        force((n) => n + 1)
      }
      if (type === 'durationchange') force((n) => n + 1)
      if (type === 'ratechange' && !el.srcObject) setSpeedState(el.playbackRate)
    },
    [applyPlaybackProps],
  )

  const onVideoError = useCallback(
    (err) => {
      toast(videoErrorMessage(err, source), { kind: 'error', timeout: 8000 })
      logError(err?.message || `Media error ${err?.code}`, 'video')
    },
    [source, toast, logError],
  )

  const play = useCallback(() => {
    const el = playerRef.current?.video?.()
    el?.play().catch((e) => {
      if (e?.name !== 'AbortError')
        toast(e?.name === 'NotAllowedError' ? 'The browser blocked playback. Press play again.' : `Playback failed: ${e.message}`, { kind: 'warn' })
    })
  }, [toast])
  const togglePlay = useCallback(() => {
    const el = playerRef.current?.video?.()
    if (!el) return
    if (el.paused) play()
    else el.pause()
  }, [play])

  const seek = useCallback((tt) => {
    const el = playerRef.current?.video?.()
    if (!el || el.srcObject) return
    const d = Number.isFinite(el.duration) ? el.duration : tt
    el.currentTime = Math.min(Math.max(0, tt), d)
  }, [])
  const step = useCallback(
    (n) => {
      const el = playerRef.current?.video?.()
      if (!el) return
      el.pause()
      seek(Math.round(el.currentTime * fps + n) / fps + 0.0001)
    },
    [fps, seek],
  )
  const jump = useCallback(
    (s) => {
      const el = playerRef.current?.video?.()
      if (el) seek(el.currentTime + s)
    },
    [seek],
  )
  const setSpeed = useCallback((s) => setSpeedState(Math.min(LIMITS.speedMax, Math.max(LIMITS.speedMin, Math.round(s * 100) / 100))), [])
  const setVolume = useCallback((val) => {
    setVolumeState(val)
    ls.set('fc.volume', val)
    if (val > 0) setMuted(false)
  }, [])

  // Measure FPS once per source when it starts playing
  useEffect(() => {
    if (!playing || !activeId || fpsMap[activeId] || live) return
    const el = playerRef.current?.video?.()
    measureFps(el).then((f) => f && setFpsMap((m) => ({ ...m, [activeId]: f })))
  }, [playing, activeId, fpsMap, live])

  // A-B loop
  useEffect(() => {
    if (!loopRange || !playing) return
    const out = range.out ?? duration
    if (out && time >= out - 0.01) seek(range.in ?? 0)
  }, [time, loopRange, playing, range, duration, seek])

  // ---------- Capture ----------
  const captureCanvas = useCallback(
    (el, extra = {}) => {
      const s = settings
      let scale = 1
      if (s.captureScale === 'custom') scale = s.captureCustomScale
      if (s.captureScale === 'display') {
        const fw = playerRef.current?.stage?.()?.querySelector('.frame')?.offsetWidth
        if (fw && el.videoWidth) scale = Math.min(1, (fw * (window.devicePixelRatio || 1)) / el.videoWidth)
      }
      return renderCapture(el, {
        filters,
        bake: s.bakeFilters,
        lut,
        roi,
        rotate,
        flipH,
        flipV,
        scale,
        time: el.currentTime,
        burn: { enabled: s.burnTimestamp, position: s.burnPosition, size: s.burnSize, color: s.burnColor },
        watermark: {
          text: s.watermarkText,
          image: s.watermarkImage,
          imageScale: s.watermarkImageScale,
          opacity: s.watermarkOpacity,
          position: s.watermarkPosition,
        },
        ...extra,
      })
    },
    [settings, filters, lut, roi, rotate, flipH, flipV],
  )

  const feedback = useCallback(() => {
    if (settings.flash) setFlashKey((k) => k + 1)
    if (settings.shutterSound) shutterSound()
    if (settings.haptics) haptic()
  }, [settings.flash, settings.shutterSound, settings.haptics])

  const capture = useCallback(
    async ({ silent = false } = {}) => {
      const el = playerRef.current?.video?.()
      if (!el || !el.videoWidth) return toast('Load a video first', { kind: 'warn' })
      try {
        const canvas = captureCanvas(el)
        feedback()
        const [shot] = await addShotsFromCanvases([{ canvas, time: el.currentTime, video: source?.name, videoId: source?.id, filters }])
        if (!silent)
          toast(`Captured ${formatClock(shot.time)}`, { action: { label: 'Undo', fn: () => app.removeShots([shot.id], { undo: false }) }, timeout: 3000 })
        return shot
      } catch (e) {
        if (e?.name === 'SecurityError')
          toast('This video’s server does not allow frame capture (CORS). Download the file and open it locally instead.', { kind: 'error', timeout: 8000 })
        else toast(`Capture failed: ${e.message}`, { kind: 'error' })
        logError(e, 'capture')
      }
    },
    [captureCanvas, feedback, addShotsFromCanvases, source, filters, toast, app, logError],
  )

  const runBatch = useCallback(async () => {
    const ctl = batchCtl.current
    if (ctl.running) {
      ctl.cancel = true
      return
    }
    const el = playerRef.current?.video?.()
    if (!el || !el.videoWidth) return toast('Load a video first', { kind: 'warn' })
    ctl.running = true
    ctl.cancel = false
    const wasPlaying = !el.paused
    const startTime = el.currentTime
    const rs = range.in ?? 0
    const re = range.out ?? (Number.isFinite(el.duration) ? el.duration : 0)
    let captured = 0
    let lastSig = null
    const t0 = performance.now()
    const report = (i, n, label) => {
      const el2 = (performance.now() - t0) / 1000
      setBatchProgress({ p: n ? i / n : 0, label, eta: i > 0 ? (el2 / i) * (n - i) : null })
    }
    const take = async (tt) => {
      if (batch.skipDuplicates) {
        const sig = signature(el)
        if (lastSig && signatureDiff(sig, lastSig) < batch.dupThreshold) return false
        lastSig = sig
      }
      const canvas = captureCanvas(el)
      await addShotsFromCanvases([{ canvas, time: tt ?? el.currentTime, video: source?.name, videoId: source?.id, filters }])
      captured++
      return true
    }
    try {
      if (live) {
        for (let i = 0; i < batch.count && !ctl.cancel; i++) {
          await take()
          report(i + 1, batch.count, `Captured ${captured}`)
          if (i < batch.count - 1) await new Promise((r) => setTimeout(r, batch.intervalMs))
        }
      } else {
        el.pause()
        if (batch.mode === 'sharpest') {
          const times = sampleTimes(rs, re, Math.min(fps, 120 / Math.max(0.1, re - rs)), el.duration)
          let best = { t: rs, s: -1 }
          for (let i = 0; i < times.length && !ctl.cancel; i++) {
            await seekVideo(el, times[i])
            const sc = sharpness(el)
            if (sc > best.s) best = { t: times[i], s: sc }
            report(i + 1, times.length, `Scanning ${i + 1}/${times.length}`)
          }
          if (!ctl.cancel) {
            await seekVideo(el, best.t)
            await take(best.t)
            toast(`Sharpest frame: ${formatClock(best.t)}`)
          }
        } else if (batch.mode === 'scene') {
          const stepS = Math.max(1 / fps, (re - rs) / 600)
          const total = Math.floor((re - rs) / stepS) + 1
          let prev = null
          for (let i = 0; i < total && !ctl.cancel && captured < batch.count; i++) {
            const tt = rs + i * stepS
            await seekVideo(el, tt)
            const sig = signature(el)
            if (!prev || signatureDiff(sig, prev) >= batch.sceneThreshold) await take(tt)
            prev = sig
            report(i + 1, total, `Scanning · ${captured} scene${captured === 1 ? '' : 's'}`)
          }
        } else {
          const start = batch.mode === 'range' || batch.mode === 'spread' ? (range.in ?? (batch.mode === 'spread' ? 0 : startTime)) : startTime
          const end = batch.mode === 'range' || batch.mode === 'spread' ? re : undefined
          const times = planBatch({ ...batch, start, end, duration: el.duration, fps })
          for (let i = 0; i < times.length && !ctl.cancel; i++) {
            await seekVideo(el, times[i])
            await take(times[i])
            report(i + 1, times.length, `Captured ${captured}/${times.length}`)
          }
        }
        await seekVideo(el, startTime)
        if (wasPlaying) play()
      }
      feedback()
      toast(ctl.cancel ? `Batch stopped · ${captured} captured` : `Batch done · ${captured} captured`)
    } catch (e) {
      toast(`Batch failed: ${e.message}`, { kind: 'error' })
      logError(e, 'batch')
    } finally {
      ctl.running = false
      ctl.cancel = false
      setBatchProgress(null)
    }
  }, [range, batch, fps, live, captureCanvas, addShotsFromCanvases, source, filters, play, feedback, toast, logError])

  async function makeContactSheet({ cols, rows, width, header }) {
    const el = playerRef.current?.video?.()
    if (!el?.videoWidth) return
    const n = cols * rows
    const rs = range.in ?? 0
    const re = range.out ?? el.duration
    const times = planBatch({ mode: 'spread', start: rs, end: re, count: n, duration: el.duration })
    const was = el.currentTime
    const cellW = Math.floor(width / cols)
    const cellH = Math.round((cellW * el.videoHeight) / el.videoWidth)
    const head = header ? 60 : 0
    const sheet = document.createElement('canvas')
    sheet.width = cellW * cols
    sheet.height = cellH * rows + head
    const ctx = sheet.getContext('2d')
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, sheet.width, sheet.height)
    if (header) {
      ctx.fillStyle = '#fff'
      ctx.font = '700 24px system-ui, sans-serif'
      ctx.fillText(`${source?.name || 'Video'} · ${formatClock(el.duration)} · ${el.videoWidth}×${el.videoHeight}`, 16, 38)
    }
    el.pause()
    for (let i = 0; i < times.length; i++) {
      setBatchProgress({ p: i / times.length, label: `Contact sheet ${i + 1}/${times.length}` })
      await seekVideo(el, times[i])
      const frame = captureCanvas(el, { burn: { enabled: false }, watermark: null })
      const x = (i % cols) * cellW
      const y = head + Math.floor(i / cols) * cellH
      ctx.drawImage(frame, x + 2, y + 2, cellW - 4, cellH - 4)
      const cell = document.createElement('canvas')
      cell.width = cellW
      cell.height = cellH
      const cctx = cell.getContext('2d')
      drawLabel(cctx, formatClock(times[i], { ms: false }), { position: 'bottom-right', size: Math.max(11, Math.round(cellW / 14)) })
      ctx.drawImage(cell, x, y)
    }
    setBatchProgress(null)
    await seekVideo(el, was)
    await addShotsFromCanvases([{ canvas: sheet, time: rs, video: `${source?.name || 'video'}_contact-sheet`, note: '' }], {
      format: 'image/jpeg',
      quality: 0.9,
    })
    toast('Contact sheet added to the gallery')
    setModal(null)
  }

  // Audio-reactive capture
  const audioRef = useRef(null)
  useEffect(() => {
    if (!audioTrigger.enabled) return
    const el = playerRef.current?.video?.()
    if (!el) return
    let raf = 0
    let last = 0
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!audioRef.current || audioRef.current.el !== el) {
        const ctx = new AC()
        const src = el.srcObject ? ctx.createMediaStreamSource(el.srcObject) : ctx.createMediaElementSource(el)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        src.connect(analyser)
        if (!el.srcObject) analyser.connect(ctx.destination)
        audioRef.current = { el, ctx, analyser }
      }
      const { ctx, analyser } = audioRef.current
      ctx.resume?.()
      const buf = new Float32Array(analyser.fftSize)
      const loop = () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const level = Math.min(100, Math.sqrt(sum / buf.length) * 300)
        setAudioLevel(Math.round(level))
        const now = performance.now()
        if (level >= audioTrigger.threshold && now - last > 1000 && !el.paused) {
          last = now
          capture({ silent: true })
        }
        raf = requestAnimationFrame(loop)
      }
      loop()
    } catch (e) {
      toast(`Audio trigger unavailable: ${e.message}`, { kind: 'error' })
      setAudioTrigger((a) => ({ ...a, enabled: false }))
    }
    return () => cancelAnimationFrame(raf)
  }, [audioTrigger.enabled, audioTrigger.threshold, activeId, capture, toast])

  // ---------- Tools ----------
  const onPick = useCallback(
    (kind, px) => {
      if (kind === 'wb') {
        setFilters((f) => ({ ...f, ...whiteBalanceFrom(px, f) }))
        toast('White balance set from picked color')
      } else if (kind === 'inspect') {
        const hex = rgbToHex(...px)
        navigator.clipboard?.writeText(hex).then(
          () => toast(`Copied ${hex}`),
          () => toast(hex),
        )
      }
    },
    [setFilters, toast],
  )

  const onMeasure = useCallback((kind, line) => {
    const el = playerRef.current?.video?.()
    if (!el) return
    const px = Math.hypot((line.x2 - line.x1) * el.videoWidth, (line.y2 - line.y1) * el.videoHeight)
    if (px < 2) return
    if (kind === 'calibrate') {
      const answer = window.prompt(`Reference line is ${px.toFixed(1)} px. How long is it in real units? (e.g. "30 cm")`, '')
      const m = answer && answer.trim().match(/^([\d.]+)\s*(\S*)$/)
      if (!m) return
      const pxPerUnit = px / parseFloat(m[1])
      setMeasure((s) => ({
        ...s,
        pxPerUnit,
        unit: m[2] || 'units',
        lines: [...s.lines.filter((l) => !l.ref), { ...line, ref: true }],
        results: [`Scale: ${pxPerUnit.toFixed(2)} px per ${m[2] || 'unit'}`, ...s.results.filter((r) => !r.startsWith('Scale:'))],
      }))
      setTool('measure')
    } else {
      setMeasure((s) => {
        const real = s.pxPerUnit ? ` ≈ ${(px / s.pxPerUnit).toFixed(2)} ${s.unit}` : ''
        const ang = (Math.atan2(-(line.y2 - line.y1) * el.videoHeight, (line.x2 - line.x1) * el.videoWidth) * 180) / Math.PI
        return {
          ...s,
          lines: [...s.lines, line],
          results: [...s.results, `Line ${s.lines.filter((l) => !l.ref).length + 1}: ${px.toFixed(1)} px${real} · ${ang.toFixed(1)}°`],
        }
      })
    }
  }, [])

  function autoEnhance() {
    const el = playerRef.current?.video?.()
    if (!el?.videoWidth) return
    const h = histogram(el, 256)
    setFilters((f) => ({ ...f, ...autoLevelsFromHistogram(h.l), saturate: Math.max(f.saturate, 110), vibrance: Math.max(f.vibrance, 10) }))
    toast('Auto-enhanced')
  }

  function trimBars() {
    const el = playerRef.current?.video?.()
    if (!el?.videoWidth) return
    const r = detectBars(el)
    if (r) {
      setRoi(r)
      toast('Black bars trimmed via crop region')
    } else toast('No black bars detected on this frame')
  }

  async function toggleWaveform() {
    if (peaks[activeId]) return setPeaks((p) => ({ ...p, [activeId]: null }))
    if (!source?.file) return toast('Waveforms need a local file', { kind: 'warn' })
    setLoading(true)
    try {
      const pk = await computePeaks(source.file)
      setPeaks((p) => ({ ...p, [activeId]: pk }))
    } catch (e) {
      toast(`No waveform: ${e.message}`, { kind: 'warn' })
    } finally {
      setLoading(false)
    }
  }

  const addMarker = useCallback(() => {
    if (!activeId || live) return
    setMarkers((m) => {
      const list = m[activeId] || []
      return { ...m, [activeId]: [...list, { id: uid(), time: nowTime(), label: `M${list.length + 1}` }].sort((a, b) => a.time - b.time) }
    })
  }, [activeId, live, nowTime])
  const jumpMarker = useCallback(
    (dir) => {
      const list = sourceMarkers
      if (!list.length) return
      const target = dir > 0 ? list.find((m) => m.time > time + 0.01) : [...list].reverse().find((m) => m.time < time - 0.01)
      if (target) seek(target.time)
    },
    [sourceMarkers, time, seek],
  )

  const fullscreen = useCallback(() => {
    const el = document.querySelector('.player-wrap')
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen?.()
    else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
  }, [])
  const pip = useCallback(async () => {
    const el = playerRef.current?.video?.()
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await el?.requestPictureInPicture()
    } catch (e) {
      toast(`Picture-in-picture failed: ${e.message}`, { kind: 'warn' })
    }
  }, [toast])

  // ---------- Keyboard shortcuts ----------
  const lastBurst = useRef(0)
  useEffect(() => {
    const down = (e) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('.modal')) return
      const k = e.key
      const has = !!playerRef.current?.video?.()?.videoWidth
      const handled = () => e.preventDefault()
      if (k === '?') {
        setModal('shortcuts')
        return handled()
      }
      if (k === '1') {
        setMobileTab('video')
        return
      }
      if (k === '2') {
        setMobileTab('frames')
        return
      }
      if (k === '3') {
        setMobileTab('export')
        return
      }
      if (!has) return
      if (k === ' ' || k === 'k' || k === 'K') {
        if (e.target.tagName === 'BUTTON' && k === ' ') return
        togglePlay()
        return handled()
      }
      if (k === 'ArrowLeft' || k === ',') {
        e.shiftKey ? jump(-5) : step(-1)
        return handled()
      }
      if (k === 'ArrowRight' || k === '.') {
        e.shiftKey ? jump(5) : step(1)
        return handled()
      }
      if (k === 'j' || k === 'J') {
        setSpeed(Math.max(LIMITS.speedMin, speed / 2))
        return handled()
      }
      if (k === 'l' || k === 'L') {
        setSpeed(Math.min(LIMITS.speedMax, speed * 2))
        if (playerRef.current.video().paused) play()
        return handled()
      }
      if (k === '[') {
        setSpeed(speed - 0.25 > 0 ? speed - 0.25 : speed / 2)
        return handled()
      }
      if (k === ']') {
        setSpeed(speed + 0.25)
        return handled()
      }
      if (k === 'Home') {
        seek(0)
        return handled()
      }
      if (k === 'End') {
        seek(duration)
        return handled()
      }
      if (k === 's' || k === 'S') {
        if (e.repeat) {
          const now = performance.now()
          if (now - lastBurst.current > 120) {
            lastBurst.current = now
            capture({ silent: true })
          }
        } else capture()
        return handled()
      }
      if (k === 'b' || k === 'B') {
        runBatch()
        return handled()
      }
      if (k === 'i' || k === 'I') {
        setRange((r) => ({ ...r, in: nowTime() }))
        return handled()
      }
      if (k === 'o' || k === 'O') {
        setRange((r) => ({ ...r, out: nowTime() }))
        return handled()
      }
      if (k === 'x' || k === 'X') {
        setRange({ in: null, out: null })
        return handled()
      }
      if (k === 'a' || k === 'A') {
        setLoopRange((x) => !x)
        return handled()
      }
      if (k === 'm' || k === 'M') {
        addMarker()
        return handled()
      }
      if (k === 'n' || k === 'N') {
        jumpMarker(1)
        return handled()
      }
      if (k === 'p' || k === 'P') {
        jumpMarker(-1)
        return handled()
      }
      if (k === 'u' || k === 'U') {
        setMuted((m) => !m)
        return handled()
      }
      if (k === 'f' || k === 'F') {
        fullscreen()
        return handled()
      }
      if (k === 'g' || k === 'G') {
        setOverlays((o) => ({ ...o, thirds: !o.thirds }))
        return handled()
      }
      if (k === 'h' || k === 'H') {
        setHold(true)
        return handled()
      }
      if (k === '0') {
        playerRef.current?.resetView()
        return handled()
      }
      if (k === 'Escape' && tool !== 'none') {
        setTool('none')
        return handled()
      }
    }
    const up = (e) => {
      if (e.key === 'h' || e.key === 'H') setHold(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [togglePlay, jump, step, setSpeed, speed, play, seek, duration, capture, runBatch, time, addMarker, jumpMarker, fullscreen, tool, nowTime])

  const onGesture = useCallback(
    (g, amount) => {
      if (g === 'seek-back') jump(-5)
      else if (g === 'seek-forward') jump(5)
      else if (g === 'capture') capture()
      else if (g === 'scrub') jump(amount * Math.min(30, duration || 30))
    },
    [jump, capture, duration],
  )

  // ---------- Derived ----------
  const shotTimes = useMemo(() => shots.filter((s) => s.videoId === activeId).map((s) => ({ id: s.id, time: s.time })), [shots, activeId])
  const lastShot = useMemo(() => shots.filter((s) => s.videoId === activeId).sort((a, b) => b.seq - a.seq)[0], [shots, activeId])
  const memory = useMemo(() => shots.reduce((a, s) => a + (s.size || 0) + (s.originalBlob?.size || 0), 0), [shots])
  const getScopeSource = useCallback(() => playerRef.current?.canvas?.() || playerRef.current?.video?.(), [])
  const editorShot = shots.find((s) => s.id === editorId)

  // Resizable split between player and gallery (desktop)
  function startResize(e) {
    const wrap = e.currentTarget.parentElement
    const r = wrap.getBoundingClientRect()
    const move = (ev) => setSplitPct(Math.min(75, Math.max(40, ((ev.clientX - r.left) / r.width) * 100)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const panelTabs = [
    ['filters', 'Filters'],
    ['capture', 'Capture & batch'],
    ['view', 'View & tools'],
    ['info', 'Info'],
  ]

  return (
    <main id="main" className="studio" data-tab={mobileTab}>
      <input
        id="fileInput"
        type="file"
        accept="video/*,image/*,.vtt,.srt,.cube"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {dragOver && (
        <div className="drop-overlay" aria-hidden="true">
          <div>Drop videos, images, subtitles or LUTs</div>
        </div>
      )}

      <div className="source-bar" role="tablist" aria-label="Open videos">
        {sources.map((s) => (
          <div key={s.id} className={`source-tab ${s.id === activeId ? 'on' : ''}`}>
            <button role="tab" aria-selected={s.id === activeId} onClick={() => setActiveId(s.id)} title={s.name}>
              {s.stream ? '● ' : ''}
              {s.name}
            </button>
            <button className="x" aria-label={`Close ${s.name}`} onClick={() => closeSource(s.id)}>
              ✕
            </button>
          </div>
        ))}
        <div className="source-actions">
          <button className="btn sm" onClick={pickFile}>
            ＋ {t('studio.choose')}
          </button>
          <details className="menu">
            <summary className="btn secondary sm">More sources ▾</summary>
            <div className="menu-list">
              <button
                onClick={(e) => {
                  e.currentTarget.closest('details').open = false
                  setModal('url')
                }}
              >
                Open from URL…
              </button>
              {navigator.mediaDevices?.getUserMedia && (
                <button
                  onClick={(e) => {
                    e.currentTarget.closest('details').open = false
                    openStream('camera')
                  }}
                >
                  Use camera
                </button>
              )}
              {navigator.mediaDevices?.getDisplayMedia && (
                <button
                  onClick={(e) => {
                    e.currentTarget.closest('details').open = false
                    openStream('screen')
                  }}
                >
                  Share screen
                </button>
              )}
              <label className="menu-file">
                Import images / GIF
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    importImages([...e.target.files])
                    e.target.value = ''
                  }}
                />
              </label>
              {canRecordCanvas() && (
                <button
                  onClick={(e) => {
                    e.currentTarget.closest('details').open = false
                    loadSample()
                  }}
                >
                  Generate sample clip
                </button>
              )}
            </div>
          </details>
          <button className="btn icon secondary sm" onClick={() => setModal('shortcuts')} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            ⌨
          </button>
        </div>
      </div>

      <div className="studio-grid" style={{ '--split': `${splitPct}%` }}>
        <section className="col-player" aria-label="Video">
          <div className="card player-card">
            <div className="player-wrap">
              <ErrorBoundary label="video player">
                <Player
                  ref={playerRef}
                  source={source}
                  filters={filters}
                  lut={lut}
                  view={view}
                  split={split}
                  compareHold={hold}
                  overlays={overlays}
                  roi={roi}
                  setRoi={setRoi}
                  tool={tool}
                  setTool={setTool}
                  rotate={rotate}
                  flipH={flipH}
                  flipV={flipV}
                  onionUrl={onion.enabled ? lastShot?.url : null}
                  onionOpacity={onion.opacity}
                  measure={measure}
                  setMeasure={onMeasure}
                  onPick={onPick}
                  onGesture={onGesture}
                  captionsUrl={source?.captionsUrl}
                  onVideoEvent={onVideoEvent}
                  onVideoError={onVideoError}
                  flashKey={flashKey}
                />
              </ErrorBoundary>
              {!source && (
                <div className="empty-state">
                  <div className="empty-icon" aria-hidden="true">
                    🎞️
                  </div>
                  <p>
                    <strong>{t('studio.empty')}</strong>
                  </p>
                  <div className="row wrap center gap-s">
                    <button className="btn" onClick={pickFile}>
                      {t('studio.choose')}
                    </button>
                    {canRecordCanvas() && (
                      <button className="btn secondary" onClick={loadSample} disabled={sampleBusy}>
                        {sampleBusy ? 'Generating…' : t('studio.sample')}
                      </button>
                    )}
                    <button className="btn secondary" onClick={() => setModal('url')}>
                      Open URL
                    </button>
                  </div>
                  <small className="muted">MP4, WebM and MOV work in most browsers. You can also paste or drop images to build GIFs.</small>
                  {recent.length > 0 && (
                    <div className="recent">
                      <h3>Recent</h3>
                      <ul>
                        {recent.map((r) => (
                          <li key={r.name + r.at}>
                            <button className="link" onClick={() => reopenRecent(r)}>
                              {r.name}
                            </button>{' '}
                            <small className="muted">{formatBytes(r.size)}</small>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {loading && (
                <div className="busy">
                  <span className="spinner" /> Working…
                </div>
              )}
            </div>
            {source && (
              <>
                <Timeline
                  duration={duration}
                  time={time}
                  fps={fps}
                  inPoint={range.in}
                  outPoint={range.out}
                  markers={sourceMarkers}
                  shotTimes={shotTimes}
                  peaks={peaks[activeId]}
                  onSeek={seek}
                  previewSrc={source.kind === 'file' ? source.url : null}
                  onMarkerClick={(m) => seek(m.time)}
                />
                {sourceMarkers.length > 0 && (
                  <div className="markers" aria-label="Markers">
                    {sourceMarkers.map((m) => (
                      <span key={m.id} className="chip">
                        <button
                          onClick={() => seek(m.time)}
                          onDoubleClick={() => {
                            const label = window.prompt('Rename marker', m.label)
                            if (label) setMarkers((all) => ({ ...all, [activeId]: all[activeId].map((x) => (x.id === m.id ? { ...x, label } : x)) }))
                          }}
                          title="Click to jump, double-click to rename"
                        >
                          {m.label} · {formatClock(m.time, { ms: false })}
                        </button>
                        <button
                          aria-label={`Delete marker ${m.label}`}
                          onClick={() => setMarkers((all) => ({ ...all, [activeId]: all[activeId].filter((x) => x.id !== m.id) }))}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Transport
                  v={v}
                  time={time}
                  duration={duration}
                  fps={fps}
                  playing={playing}
                  speed={speed}
                  setSpeed={setSpeed}
                  volume={volume}
                  muted={muted}
                  setVolume={setVolume}
                  toggleMute={() => setMuted((m) => !m)}
                  preservePitch={settings.preservePitch}
                  togglePitch={() => setSettings({ preservePitch: !settings.preservePitch })}
                  onPlayPause={togglePlay}
                  onStep={step}
                  onJump={jump}
                  onSeek={seek}
                  inPoint={range.in}
                  outPoint={range.out}
                  setIn={() => setRange((r) => ({ ...r, in: nowTime() }))}
                  setOut={() => setRange((r) => ({ ...r, out: nowTime() }))}
                  clearRange={() => setRange({ in: null, out: null })}
                  loopRange={loopRange}
                  toggleLoop={() => setLoopRange((x) => !x)}
                  onFullscreen={fullscreen}
                  onPip={pip}
                  pipSupported={!!document.pictureInPictureEnabled}
                  onCapture={() => capture()}
                  onBatch={runBatch}
                  batchRunning={!!batchProgress}
                  live={live}
                  timeUnit={settings.timeUnit}
                />
                {batchProgress && (
                  <div className="progress-wrap" aria-live="polite">
                    <progress max="1" value={batchProgress.p} />
                    <span className="muted">
                      {batchProgress.label}
                      {batchProgress.eta != null ? ` · ~${Math.ceil(batchProgress.eta)}s left` : ''}
                    </span>
                    <button className="btn secondary sm" onClick={() => (batchCtl.current.cancel = true)}>
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}
            {compare && (
              <CompareVideo
                compare={compare}
                mainRef={playerRef}
                onClose={() => {
                  URL.revokeObjectURL(compare.url)
                  setCompare(null)
                }}
              />
            )}
            {showScopes && source && <Scopes getSource={getScopeSource} />}
          </div>

          <div className="card panel-card">
            <div className="tabs" role="tablist" aria-label="Studio panels">
              {panelTabs.map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  id={`tab-${id}`}
                  aria-controls={`panel-${id}`}
                  aria-selected={panel === id}
                  className={`tab ${panel === id ? 'on' : ''}`}
                  onClick={() => setPanel(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`panel-${panel}`} aria-labelledby={`tab-${panel}`} className="tabpanel">
              {panel === 'filters' && (
                <FilterPanel
                  filters={filters}
                  setFilters={setFilters}
                  lut={lut}
                  setLut={setLut}
                  onAuto={autoEnhance}
                  onPickWB={() => setTool('wb')}
                  onHold={setHold}
                  split={split}
                  setSplit={setSplit}
                  disabled={!source}
                />
              )}
              {panel === 'capture' && (
                <CapturePanel
                  batch={batch}
                  setBatch={setBatch}
                  duration={duration}
                  time={time}
                  fps={fps}
                  inPoint={range.in}
                  outPoint={range.out}
                  progress={batchProgress}
                  onContactSheet={() => setModal('contact')}
                  audioTrigger={audioTrigger}
                  setAudioTrigger={setAudioTrigger}
                  audioLevel={audioLevel}
                  live={live}
                  disabled={!source}
                />
              )}
              {panel === 'view' && (
                <ViewPanel
                  view={view}
                  setView={setView}
                  overlays={overlays}
                  setOverlays={setOverlays}
                  rotate={rotate}
                  setRotate={setRotate}
                  flipH={flipH}
                  setFlipH={setFlipH}
                  flipV={flipV}
                  setFlipV={setFlipV}
                  roi={roi}
                  setRoi={setRoi}
                  tool={tool}
                  setTool={setTool}
                  onDetectBars={trimBars}
                  onion={onion}
                  setOnion={setOnion}
                  measure={measure}
                  clearMeasure={() => setMeasure({ lines: [], pxPerUnit: null, unit: '', results: [] })}
                  onCaptions={loadCaptions}
                  captionsName={source?.captionsName}
                  clearCaptions={() => setSources((p) => p.map((s) => (s.id === activeId ? { ...s, captionsUrl: null, captionsName: null } : s)))}
                  onCompare={(f) => f && setCompare({ url: URL.createObjectURL(f), name: f.name, offset: 0 })}
                  comparing={!!compare}
                  stopCompare={() => setCompare(null)}
                  onZoomReset={() => playerRef.current?.resetView()}
                  onActualPixels={() => {
                    const el = playerRef.current?.video?.()
                    const fw = playerRef.current?.stage?.()?.querySelector('.frame')?.offsetWidth
                    if (el?.videoWidth && fw) playerRef.current.setZoom(el.videoWidth / (fw * (window.devicePixelRatio || 1)))
                  }}
                  showScopes={showScopes}
                  setShowScopes={setShowScopes}
                  disabled={!source}
                  live={live}
                />
              )}
              {panel === 'info' && (
                <div className="stack">
                  <VideoInfo
                    source={source}
                    v={v}
                    fps={fps}
                    fpsMeasured={!!fpsMap[activeId]}
                    time={time}
                    onMeasureFps={async () => {
                      const el = playerRef.current?.video?.()
                      if (!el) return
                      const was = el.paused
                      play()
                      const f = await measureFps(el)
                      if (was) el.pause()
                      if (f) {
                        setFpsMap((m) => ({ ...m, [activeId]: f }))
                        toast(`Measured ${f} fps`)
                      } else toast('Could not measure the frame rate in this browser', { kind: 'warn' })
                    }}
                  />
                  {source?.file && (
                    <button className="btn secondary sm" onClick={toggleWaveform}>
                      {peaks[activeId] ? 'Hide audio waveform' : 'Show audio waveform'}
                    </button>
                  )}
                  <label className="field">
                    Override frame rate
                    <input
                      type="number"
                      className="num"
                      min="1"
                      max="240"
                      step="0.001"
                      value={fps}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value)
                        if (n > 0) setFpsMap((m) => ({ ...m, [activeId]: n }))
                      }}
                      disabled={!source}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </section>

        <div
          className="resizer hide-sm"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setSplitPct((p) => Math.max(40, p - 2))
            if (e.key === 'ArrowRight') setSplitPct((p) => Math.min(75, p + 2))
          }}
        />

        <section className="col-gallery" aria-label={t('gallery.title')}>
          <ErrorBoundary label="gallery">
            <Gallery
              selected={selected}
              setSelected={setSelected}
              onEdit={setEditorId}
              onSeek={(s) => {
                if (s.videoId && s.videoId !== activeId && sources.some((x) => x.id === s.videoId)) setActiveId(s.videoId)
                setTimeout(() => seek(s.time), 50)
                setMobileTab('video')
              }}
            />
          </ErrorBoundary>
        </section>
      </div>

      <section className="card export-card col-export" aria-label={t('export.title')}>
        <ErrorBoundary label="exporter">
          <Suspense fallback={<div className="skeleton" style={{ height: 160 }} />}>
            <ExportPanel
              videoRef={{
                get current() {
                  return playerRef.current?.video?.()
                },
              }}
              captureCanvas={captureCanvas}
              selected={selected}
              range={range}
              fps={fps}
              live={live}
            />
          </Suspense>
        </ErrorBoundary>
      </section>

      <footer className="statusbar" aria-label="Status">
        <span>{v?.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : 'No video'}</span>
        <span>{fps} fps</span>
        {(range.in != null || range.out != null) && (
          <span>
            Range {formatClock(range.in ?? 0)} → {formatClock(range.out ?? duration)}
          </span>
        )}
        <span>
          {shots.length} frame{shots.length === 1 ? '' : 's'} · {formatBytes(memory)}
        </span>
        {storage && (
          <span title="Browser storage used by this site">
            Storage {formatBytes(storage.usage)}
            {storage.quota ? ` of ${formatBytes(storage.quota)}` : ''}
          </span>
        )}
        {tool !== 'none' && <span className="pill">Tool: {tool} · Esc to exit</span>}
      </footer>

      <nav className="quickbar only-mobile" aria-label="Studio sections">
        {[
          ['video', t('tabs.video')],
          ['frames', `${t('tabs.frames')} (${shots.length})`],
          ['export', t('tabs.export')],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`qtab ${mobileTab === id ? 'on' : ''}`}
            aria-current={mobileTab === id ? 'page' : undefined}
            onClick={() => setMobileTab(id)}
          >
            {label}
          </button>
        ))}
        {mobileTab === 'video' && source && (
          <>
            <button className="btn icon secondary" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '❚❚' : '▶'}
            </button>
            <button className="btn icon capture" onClick={() => capture()} aria-label="Capture frame">
              ◉
            </button>
          </>
        )}
      </nav>

      {modal === 'shortcuts' && <ShortcutsHelp onClose={() => setModal(null)} />}
      {modal === 'url' && (
        <UrlModal
          onClose={() => setModal(null)}
          onOpen={(url) => {
            addSource({ name: url.split('/').pop()?.split('?')[0] || 'Remote video', url, kind: 'url' })
            setModal(null)
          }}
        />
      )}
      {modal === 'contact' && <ContactSheetModal onClose={() => setModal(null)} onMake={makeContactSheet} busy={!!batchProgress} />}
      {editorShot && (
        <Suspense
          fallback={
            <div className="modal">
              <div className="panel">
                <span className="spinner" /> Loading editor…
              </div>
            </div>
          }
        >
          <EditorModal shot={editorShot} onClose={() => setEditorId(null)} selected={selected} />
        </Suspense>
      )}
      {!settings.tourDone && <Tour onDone={() => setSettings({ tourDone: true })} />}
    </main>
  )
}

function UrlModal({ onClose, onOpen }) {
  const [url, setUrl] = useState('')
  const valid = /^https?:\/\/.+/i.test(url.trim())
  return (
    <Modal title="Open a video from a URL" onClose={onClose} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onOpen(url.trim())
        }}
        className="stack"
      >
        <label className="field">
          Direct link to a video file
          <input
            className="text"
            type="url"
            data-autofocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/clip.mp4"
            required
          />
        </label>
        <p className="muted small">
          Your browser fetches the video directly from that server. Frame capture only works when the server allows cross-origin access (CORS).
        </p>
        <div className="row end">
          <button className="btn secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!valid}>
            Open
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ContactSheetModal({ onClose, onMake, busy }) {
  const [cfg, setCfg] = useState({ cols: 4, rows: 4, width: 1600, header: true })
  return (
    <Modal title="Contact sheet" onClose={onClose} size="sm">
      <div className="stack">
        <p className="muted">Evenly spaced frames from the in/out range (or the whole video), laid out in a grid with timestamps.</p>
        <div className="grid2">
          <label className="field">
            Columns{' '}
            <input
              type="number"
              className="num"
              min="1"
              max="12"
              value={cfg.cols}
              onChange={(e) => setCfg((c) => ({ ...c, cols: Math.min(12, Math.max(1, +e.target.value || 1)) }))}
            />
          </label>
          <label className="field">
            Rows{' '}
            <input
              type="number"
              className="num"
              min="1"
              max="20"
              value={cfg.rows}
              onChange={(e) => setCfg((c) => ({ ...c, rows: Math.min(20, Math.max(1, +e.target.value || 1)) }))}
            />
          </label>
          <label className="field">
            Width (px){' '}
            <input
              type="number"
              className="num"
              min="320"
              max="6000"
              step="10"
              value={cfg.width}
              onChange={(e) => setCfg((c) => ({ ...c, width: Math.min(6000, Math.max(320, +e.target.value || 1600)) }))}
            />
          </label>
          <label className="inline check">
            <input type="checkbox" checked={cfg.header} onChange={(e) => setCfg((c) => ({ ...c, header: e.target.checked }))} /> Header with file info
          </label>
        </div>
        <div className="row end">
          <button className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={busy} onClick={() => onMake(cfg)}>
            Make {cfg.cols * cfg.rows}-frame sheet
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Second video that follows the main player's time, rate and play state. */
function CompareVideo({ compare, mainRef, onClose }) {
  const ref = useRef(null)
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const main = mainRef.current?.video?.()
    const other = ref.current
    if (!main || !other) return
    const sync = () => {
      const target = main.currentTime + offset
      if (Math.abs(other.currentTime - target) > 0.08) other.currentTime = Math.max(0, target)
      other.playbackRate = main.playbackRate
    }
    const onPlay = () => {
      sync()
      other.play().catch(() => {})
    }
    const onPause = () => {
      other.pause()
      sync()
    }
    main.addEventListener('play', onPlay)
    main.addEventListener('pause', onPause)
    main.addEventListener('seeked', sync)
    main.addEventListener('ratechange', sync)
    const iv = setInterval(() => !main.paused && sync(), 1000)
    sync()
    return () => {
      main.removeEventListener('play', onPlay)
      main.removeEventListener('pause', onPause)
      main.removeEventListener('seeked', sync)
      main.removeEventListener('ratechange', sync)
      clearInterval(iv)
    }
  }, [mainRef, offset])
  return (
    <div className="compare">
      <div className="row between">
        <strong>Compare: {compare.name}</strong>
        <button className="btn secondary sm" onClick={onClose}>
          Close
        </button>
      </div>
      <video ref={ref} src={compare.url} muted playsInline preload="auto" />
      <label className="field">
        Offset (s) <input type="number" className="num" step="0.04" value={offset} onChange={(e) => setOffset(parseFloat(e.target.value) || 0)} />
      </label>
    </div>
  )
}
