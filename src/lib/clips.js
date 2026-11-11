// Clip list model for the video editor. A clip is a kept segment of the source: { id, in, out, speed, volume }.
let counter = 0
const cid = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`
const MIN = 0.04

export function defaultClips(duration) {
  return [{ id: cid(), in: 0, out: duration, speed: 1, volume: 1 }]
}

export const clipLength = (c) => Math.max(0, (c.out - c.in) / (c.speed || 1))
export const totalDuration = (clips) => clips.reduce((a, c) => a + clipLength(c), 0)

export function clipAt(clips, t) {
  return clips.findIndex((c) => t >= c.in - 1e-6 && t < c.out - 1e-6)
}

/** Split the clip under source time t into two. */
export function splitAt(clips, t) {
  const i = clipAt(clips, t)
  if (i < 0) return clips
  const c = clips[i]
  if (t - c.in < MIN || c.out - t < MIN) return clips
  return [...clips.slice(0, i), { ...c, out: t }, { ...c, id: cid(), in: t }, ...clips.slice(i + 1)]
}

/** Remove source range [a,b] from every clip (ripple delete). */
export function cutRange(clips, a, b) {
  if (b < a) [a, b] = [b, a]
  const out = []
  for (const c of clips) {
    if (b <= c.in || a >= c.out) out.push(c)
    else {
      if (a - c.in >= MIN) out.push({ ...c, out: a })
      if (c.out - b >= MIN) out.push({ ...c, id: cid(), in: b })
    }
  }
  return out
}

/** Keep only source range [a,b]. */
export function keepRange(clips, a, b) {
  if (b < a) [a, b] = [b, a]
  const out = []
  for (const c of clips) {
    const s = Math.max(c.in, a),
      e = Math.min(c.out, b)
    if (e - s >= MIN) out.push({ ...c, in: s, out: e })
  }
  return out
}

export function moveClip(clips, index, dir) {
  const j = index + dir
  if (j < 0 || j >= clips.length) return clips
  const next = [...clips]
  ;[next[index], next[j]] = [next[j], next[index]]
  return next
}

export const isEdited = (clips, duration) =>
  !!clips && !(clips.length === 1 && clips[0].in < 0.001 && Math.abs(clips[0].out - duration) < 0.001 && clips[0].speed === 1 && clips[0].volume === 1)

/** Frame plan for export: [{ time (source seconds), clip index, t (output seconds) }] */
export function framePlan(clips, fps) {
  const plan = []
  let outFrames = 0
  for (let ci = 0; ci < clips.length; ci++) {
    const c = clips[ci]
    const n = Math.max(1, Math.round(clipLength(c) * fps))
    for (let i = 0; i < n; i++) plan.push({ time: Math.min(c.out - 1e-4, c.in + (i * c.speed) / fps), clip: ci, t: (outFrames + i) / fps })
    outFrames += n
  }
  return plan
}

/** Map an output-timeline time to { clip index, source time }. */
export function outputToSource(clips, t) {
  let acc = 0
  for (let i = 0; i < clips.length; i++) {
    const len = clipLength(clips[i])
    if (t < acc + len || i === clips.length - 1) return { clip: i, time: Math.min(clips[i].out, clips[i].in + (t - acc) * clips[i].speed) }
    acc += len
  }
  return { clip: 0, time: 0 }
}

/**
 * Render the edited audio: resample each clip (speed changes pitch, like a tape), apply volume and fades.
 * channels: Float32Array[] of the source at sampleRate. Returns Float32Array[] of the output.
 */
export function renderAudio(channels, sampleRate, clips, { fadeIn = 0, fadeOut = 0 } = {}) {
  const total = Math.round(totalDuration(clips) * sampleRate)
  const out = channels.map(() => new Float32Array(total))
  let pos = 0
  for (const c of clips) {
    const n = Math.min(total - pos, Math.round(clipLength(c) * sampleRate))
    const start = c.in * sampleRate
    for (let ch = 0; ch < channels.length; ch++) {
      const src = channels[ch]
      const dst = out[ch]
      for (let i = 0; i < n; i++) {
        const s = start + i * c.speed
        const i0 = Math.floor(s)
        const f = s - i0
        const a = src[i0] || 0
        const b = src[i0 + 1] ?? a
        dst[pos + i] = (a + (b - a) * f) * c.volume
      }
    }
    pos += n
  }
  const fi = Math.min(total, Math.round(fadeIn * sampleRate))
  const fo = Math.min(total, Math.round(fadeOut * sampleRate))
  for (const dst of out) {
    for (let i = 0; i < fi; i++) dst[i] *= i / fi
    for (let i = 0; i < fo; i++) dst[total - 1 - i] *= i / fo
  }
  return out
}
