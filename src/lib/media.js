import { LIMITS } from './config'

/** Convert SRT text to WebVTT. */
export function srtToVtt(srt) {
  const body = srt
    .replace(/\r/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/^\d+\s*\n(?=\d{2}:\d{2})/gm, '')
  return 'WEBVTT\n\n' + body.trim() + '\n'
}

export async function subtitleFileToUrl(file) {
  let text = await file.text()
  if (!/^WEBVTT/.test(text.trim())) text = srtToVtt(text)
  return URL.createObjectURL(new Blob([text], { type: 'text/vtt' }))
}

/** Decode audio locally and compute waveform peaks (0..1). */
export async function computePeaks(file, buckets = 1200) {
  if (file.size > LIMITS.waveformMaxBytes) throw new Error('File too large for waveform (limit 300 MB)')
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) throw new Error('Web Audio is not supported')
  const ctx = new AC()
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer())
    const ch = buf.getChannelData(0)
    const ch2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null
    const size = Math.max(1, Math.floor(ch.length / buckets))
    const peaks = new Float32Array(buckets)
    let max = 0
    for (let i = 0; i < buckets; i++) {
      let p = 0
      const start = i * size
      for (let j = 0; j < size; j += 4) {
        const v = Math.abs(ch[start + j] || 0) + (ch2 ? Math.abs(ch2[start + j] || 0) : 0)
        if (v > p) p = v
      }
      peaks[i] = p
      if (p > max) max = p
    }
    if (max > 0) for (let i = 0; i < buckets; i++) peaks[i] /= max
    return peaks
  } finally {
    ctx.close?.()
  }
}

/** Decode an image file into frames. Animated GIF/WebP/APNG need ImageDecoder (Chromium); else first frame. */
export async function decodeImageFrames(file, maxFrames = LIMITS.animatedImportMaxFrames) {
  const frames = []
  if (typeof ImageDecoder !== 'undefined' && /gif|webp|png|apng/.test(file.type)) {
    try {
      const supported = await ImageDecoder.isTypeSupported(file.type)
      if (supported) {
        const dec = new ImageDecoder({ data: file.stream(), type: file.type })
        await dec.tracks.ready
        const track = dec.tracks.selectedTrack
        await dec.completed.catch(() => {})
        const count = Math.min(maxFrames, track?.frameCount || 1)
        let t = 0
        for (let i = 0; i < count; i++) {
          const { image } = await dec.decode({ frameIndex: i })
          const c = document.createElement('canvas')
          c.width = image.displayWidth
          c.height = image.displayHeight
          c.getContext('2d').drawImage(image, 0, 0)
          const dur = (image.duration || 100000) / 1e6
          frames.push({ canvas: c, time: t, delay: Math.round(dur * 1000) })
          t += dur
          image.close()
        }
        dec.close()
        if (frames.length) return frames
      }
    } catch {
      /* fall back to single frame */
    }
  }
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d').drawImage(bmp, 0, 0)
  bmp.close?.()
  frames.push({ canvas: c, time: 0, delay: 100 })
  return frames
}

export function canRecordCanvas() {
  return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream
}

export function pickRecorderMime() {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4']
  return types.find((t) => MediaRecorder.isTypeSupported?.(t)) || ''
}

/** Generate a short local test clip (no network) using canvas + MediaRecorder. */
export async function generateSampleVideo(seconds = 4, fps = 30) {
  if (!canRecordCanvas()) throw new Error('This browser cannot record a sample clip')
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 360
  const ctx = c.getContext('2d')
  const stream = c.captureStream(fps)
  const mime = pickRecorderMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined)
  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise((r) => (rec.onstop = r))
  rec.start(250)
  const t0 = performance.now()
  await new Promise((resolve) => {
    const draw = () => {
      const t = (performance.now() - t0) / 1000
      const g = ctx.createLinearGradient(0, 0, 640, 360)
      g.addColorStop(0, `hsl(${(t * 60) % 360} 80% 60%)`)
      g.addColorStop(1, `hsl(${(t * 60 + 120) % 360} 80% 45%)`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 640, 360)
      ctx.fillStyle = '#fff'
      const x = 320 + Math.cos(t * 2.2) * 220
      const y = 180 + Math.sin(t * 3.1) * 120
      ctx.beginPath()
      ctx.arc(x, y, 34, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2a1509'
      ctx.fillRect(40 + ((t * 150) % 520), 300, 60, 24)
      ctx.font = '700 40px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,.92)'
      ctx.fillText(`FrameCapture sample  ${t.toFixed(2)}s`, 24, 56)
      if (t < seconds) requestAnimationFrame(draw)
      else resolve()
    }
    draw()
  })
  rec.stop()
  await done
  stream.getTracks().forEach((tr) => tr.stop())
  const type = (mime || 'video/webm').split(';')[0]
  return new File(chunks, `sample.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type })
}

/** Estimate a video's frame rate by watching presented frames (needs playback). */
export function measureFps(video, samples = 20) {
  return new Promise((resolve) => {
    if (!video.requestVideoFrameCallback) return resolve(null)
    const times = []
    let last = null
    const timer = setTimeout(() => resolve(null), 3000)
    const cb = (_now, meta) => {
      if (last != null && meta.mediaTime > last) times.push(meta.mediaTime - last)
      last = meta.mediaTime
      if (times.length >= samples) {
        clearTimeout(timer)
        times.sort((a, b) => a - b)
        const med = times[Math.floor(times.length / 2)]
        const fps = 1 / med
        const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120]
        const snap = common.reduce((best, c) => (Math.abs(c - fps) < Math.abs(best - fps) ? c : best), common[0])
        return resolve(Math.abs(snap - fps) < 1.5 ? snap : Math.round(fps))
      }
      video.requestVideoFrameCallback(cb)
    }
    video.requestVideoFrameCallback(cb)
  })
}
