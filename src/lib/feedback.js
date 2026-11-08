let ctx = null
export function shutterSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = ctx || new AC()
    const t = ctx.currentTime
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.35, t)
    src.connect(g).connect(ctx.destination)
    src.start(t)
  } catch {
    /* ignore */
  }
}
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* ignore */
  }
}
