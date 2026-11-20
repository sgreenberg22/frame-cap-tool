// Automatic cut helpers: silence removal and scene-change splitting. Pure parts are unit-tested.
import { cutRange, splitAt } from './clips'
import { seekVideo } from './capture'
import { signature, signatureDiff } from './analysis'

/**
 * Find silent stretches to remove.
 * peaks: Float32Array 0..1 over the whole file. Returns [{a, b}] in source seconds.
 * A silence must be at least minSilence long; `pad` of silence is kept on each side so speech is not clipped.
 */
export function detectSilences(peaks, duration, { threshold = 0.04, minSilence = 0.6, pad = 0.12 } = {}) {
  if (!peaks?.length || !(duration > 0)) return []
  const step = duration / peaks.length
  const out = []
  let start = -1
  const close = (endIdx) => {
    if (start < 0) return
    const a = start * step
    const b = endIdx * step
    if (b - a >= minSilence) {
      const ra = a + pad
      const rb = b - pad
      if (rb - ra > 0.05) out.push({ a: +ra.toFixed(3), b: +rb.toFixed(3) })
    }
    start = -1
  }
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i] < threshold) {
      if (start < 0) start = i
    } else close(i)
  }
  close(peaks.length)
  return out
}

/** Remove several source ranges from a clip list. */
export function applyCuts(clips, ranges) {
  return [...ranges].sort((x, y) => y.a - x.a).reduce((cs, r) => cutRange(cs, r.a, r.b), clips)
}

/** Split a clip list at several source times. */
export function splitAtTimes(clips, times) {
  return [...times].sort((x, y) => x - y).reduce((cs, t) => splitAt(cs, t), clips)
}

/** From time-ordered signatures, return the times where the picture changes by at least `threshold`, with a minimum gap. */
export function cutsFromSignatures(samples, threshold = 14, minGap = 1) {
  const cuts = []
  let last = -Infinity
  for (let i = 1; i < samples.length; i++) {
    const d = signatureDiff(samples[i - 1].sig, samples[i].sig)
    if (d >= threshold && samples[i].t - last >= minGap) {
      cuts.push(samples[i].t)
      last = samples[i].t
    }
  }
  return cuts
}

/** Seek through the video and find scene changes. Restores the playhead afterwards. */
export async function scanSceneCuts(video, { from = 0, to, step = 0.5, threshold = 14, minGap = 1, onProgress, isCancelled } = {}) {
  const end = to ?? video.duration
  const total = Math.max(1, Math.floor((end - from) / step))
  const restore = video.currentTime
  const samples = []
  try {
    for (let i = 0; i <= total; i++) {
      if (isCancelled?.()) break
      const t = Math.min(end - 0.01, from + i * step)
      await seekVideo(video, t)
      samples.push({ t, sig: signature(video, 48) })
      onProgress?.(i / total)
    }
  } finally {
    try {
      await seekVideo(video, restore)
    } catch {
      /* ignore */
    }
  }
  return cutsFromSignatures(samples, threshold, minGap)
}
