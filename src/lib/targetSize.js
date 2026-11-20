/**
 * Video bitrate (bits per second) that should land a file near `targetBytes`.
 * Reserves room for audio and container overhead; never returns less than `min`.
 */
export function bitrateForTarget(targetBytes, seconds, { audioBps = 128000, hasAudio = true, overhead = 0.04, min = 150000 } = {}) {
  if (!(targetBytes > 0) || !(seconds > 0)) return null
  const totalBits = targetBytes * 8 * (1 - overhead)
  const audioBits = hasAudio ? audioBps * seconds : 0
  return Math.max(min, Math.floor((totalBits - audioBits) / seconds))
}

/** Rough size estimate in bytes for a given video bitrate. */
export function estimateBytes(videoBps, seconds, { audioBps = 128000, hasAudio = true, overhead = 0.04 } = {}) {
  return Math.round(((videoBps + (hasAudio ? audioBps : 0)) * seconds) / 8 / (1 - overhead))
}

export const SIZE_PRESETS = [
  ['Discord (8 MB)', 8],
  ['Email (20 MB)', 20],
  ['WhatsApp (16 MB)', 16],
  ['X / Twitter (512 MB)', 512],
]
