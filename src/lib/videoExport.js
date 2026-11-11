// Frame-accurate video export with WebCodecs. Frames are rendered through the same pipeline as captures
// (filters, crop, rotation), encoded off the main thread by the browser, and muxed to MP4 or WebM in memory.
import { framePlan, renderAudio, totalDuration } from './clips'
import { seekVideo } from './capture'

export function canExportVideo() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2)

async function pickVideoCodec(width, height, fps, bitrate) {
  const candidates = [
    { container: 'mp4', mux: 'avc', codec: width * height > 1920 * 1088 ? 'avc1.640033' : 'avc1.640028', avc: { format: 'avc' } },
    { container: 'mp4', mux: 'avc', codec: 'avc1.42002a', avc: { format: 'avc' } },
    { container: 'webm', mux: 'V_VP9', codec: 'vp09.00.40.08' },
    { container: 'webm', mux: 'V_VP8', codec: 'vp8' },
  ]
  for (const c of candidates) {
    const config = { codec: c.codec, width, height, bitrate, framerate: fps, ...(c.avc ? { avc: c.avc } : {}) }
    try {
      const res = await VideoEncoder.isConfigSupported(config)
      if (res.supported) return { ...c, config }
    } catch {
      /* try next */
    }
  }
  throw new Error('This browser has no usable video encoder')
}

async function pickAudioCodec(container, sampleRate, numberOfChannels) {
  if (typeof AudioEncoder === 'undefined') return null
  const options =
    container === 'mp4'
      ? [
          ['aac', 'mp4a.40.2'],
          ['opus', 'opus'],
        ]
      : [['A_OPUS', 'opus']]
  for (const [mux, codec] of options) {
    const config = { codec, sampleRate, numberOfChannels, bitrate: 160000 }
    try {
      if ((await AudioEncoder.isConfigSupported(config)).supported) return { mux, config }
    } catch {
      /* try next */
    }
  }
  return null
}

/** Decode a media file's audio at 48 kHz. Returns { channels, sampleRate } or null if there is no audio. */
export async function decodeAudio(file) {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC || !file) return null
  const ctx = new AC({ sampleRate: 48000 })
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer())
    const n = Math.min(2, buf.numberOfChannels)
    return { channels: Array.from({ length: n }, (_, i) => buf.getChannelData(i)), sampleRate: buf.sampleRate }
  } catch {
    return null
  } finally {
    ctx.close?.()
  }
}

/**
 * opts: { video, clips, fps, width, height, bitrate, renderFrame(video, sourceTime, outputTime) -> canvas,
 *         audio: {channels, sampleRate}|null, fadeIn, fadeOut, onProgress({p, stage}), isCancelled() }
 * Returns { blob, container, width, height, hasAudio }
 */
export async function exportVideo(opts) {
  const { video, clips, fps, renderFrame, onProgress, isCancelled, fadeIn = 0, fadeOut = 0 } = opts
  const width = even(opts.width)
  const height = even(opts.height)
  const bitrate = opts.bitrate || Math.round(width * height * fps * 0.11)
  const vc = await pickVideoCodec(width, height, fps, bitrate)
  const audioSrc = opts.audio
  const ac = audioSrc ? await pickAudioCodec(vc.container, audioSrc.sampleRate, audioSrc.channels.length) : null

  const lib = vc.container === 'mp4' ? await import('mp4-muxer') : await import('webm-muxer')
  const target = new lib.ArrayBufferTarget()
  const muxer = new lib.Muxer({
    target,
    video: { codec: vc.mux, width, height, frameRate: fps },
    ...(ac ? { audio: { codec: ac.mux, sampleRate: audioSrc.sampleRate, numberOfChannels: audioSrc.channels.length } } : {}),
    ...(vc.container === 'mp4' ? { fastStart: 'in-memory' } : {}),
    firstTimestampBehavior: 'offset',
  })

  let failure = null
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failure = e),
  })
  venc.configure(vc.config)

  const plan = framePlan(clips, fps)
  const total = totalDuration(clips)
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d', { alpha: false })
  ctx.imageSmoothingQuality = 'high'
  const wasTime = video.currentTime
  const wasPaused = video.paused
  video.pause()
  const frameDur = 1e6 / fps

  try {
    for (let i = 0; i < plan.length; i++) {
      if (failure) throw failure
      if (isCancelled?.()) throw new DOMException('Export cancelled', 'AbortError')
      const f = plan[i]
      await seekVideo(video, f.time)
      const frame = renderFrame(video, f.time, f.t)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      // letterbox to keep the aspect ratio
      const s = Math.min(width / frame.width, height / frame.height)
      const dw = frame.width * s,
        dh = frame.height * s
      ctx.drawImage(frame, (width - dw) / 2, (height - dh) / 2, dw, dh)
      let dim = 0
      if (fadeIn > 0 && f.t < fadeIn) dim = 1 - f.t / fadeIn
      if (fadeOut > 0 && total - f.t < fadeOut) dim = Math.max(dim, 1 - (total - f.t) / fadeOut)
      if (dim > 0) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, dim)})`
        ctx.fillRect(0, 0, width, height)
      }
      const vf = new VideoFrame(out, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) })
      venc.encode(vf, { keyFrame: i % Math.max(1, Math.round(fps * 2)) === 0 })
      vf.close()
      while (venc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 4))
      onProgress?.({ p: ((i + 1) / plan.length) * (ac ? 0.92 : 0.98), stage: `Rendering frame ${i + 1} of ${plan.length}` })
    }
    await venc.flush()
    venc.close()

    if (ac) {
      onProgress?.({ p: 0.94, stage: 'Encoding audio' })
      const pcm = renderAudio(audioSrc.channels, audioSrc.sampleRate, clips, { fadeIn, fadeOut })
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e) })
      aenc.configure(ac.config)
      const block = 4800
      const nch = pcm.length
      for (let pos = 0; pos < pcm[0].length; pos += block) {
        if (failure) throw failure
        const n = Math.min(block, pcm[0].length - pos)
        const data = new Float32Array(n * nch)
        for (let ch = 0; ch < nch; ch++) data.set(pcm[ch].subarray(pos, pos + n), ch * n)
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate: audioSrc.sampleRate,
          numberOfFrames: n,
          numberOfChannels: nch,
          timestamp: Math.round((pos / audioSrc.sampleRate) * 1e6),
          data,
        })
        aenc.encode(ad)
        ad.close()
        if (aenc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 2))
      }
      await aenc.flush()
      aenc.close()
    }
    if (failure) throw failure
    muxer.finalize()
    onProgress?.({ p: 1, stage: 'Done' })
    const type = vc.container === 'mp4' ? 'video/mp4' : 'video/webm'
    return { blob: new Blob([target.buffer], { type }), container: vc.container, width, height, hasAudio: !!ac, codec: vc.codec }
  } finally {
    try {
      if (venc.state !== 'closed') venc.close()
    } catch {
      /* already closed */
    }
    await seekVideo(video, wasTime).catch(() => {})
    if (!wasPaused) video.play().catch(() => {})
  }
}
