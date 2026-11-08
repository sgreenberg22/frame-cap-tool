// GIF encoding off the main thread. Frames stream in one at a time; they are only buffered
// when a shared palette or frame-difference optimization needs to see every frame first.
import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { mapToPalette, samplePixels, diffOptimize } from '../lib/gifcore'

let job = null

self.onmessage = (e) => {
  const msg = e.data
  try {
    if (msg.type === 'start') job = start(msg.options, msg.count)
    else if (msg.type === 'frame') job.push(new Uint8ClampedArray(msg.data), msg.width, msg.height, msg.delay)
    else if (msg.type === 'finish') {
      const out = job.finish()
      job = null
      self.postMessage({ type: 'done', buffer: out.buffer }, [out.buffer])
    }
  } catch (err) {
    job = null
    self.postMessage({ type: 'error', message: err?.message || String(err) })
  }
}

function start(o, count) {
  const transparency = !!o.transparency?.enabled
  const optimize = !!o.optimize && !transparency
  const reserve = transparency || optimize
  const colors = Math.max(2, Math.min(reserve ? 255 : 256, o.colors || 256))
  const useGlobal = !!o.globalPalette || optimize
  const alphaThreshold = o.transparency?.threshold ?? 128
  const repeat = o.loops === 0 ? 0 : o.loops === 1 ? -1 : Math.max(0, (o.loops || 1) - 1)
  const enc = GIFEncoder()
  const buffered = []
  let written = 0
  let prev = null
  let globalPalette = null
  let tIndex = -1

  function write(rgba, width, height, delay) {
    let palette = globalPalette
    let ti = tIndex
    if (!useGlobal) {
      palette = quantize(rgba, colors)
      if (transparency) {
        ti = palette.length
        palette.push([0, 0, 0])
      }
    }
    const candidates = ti >= 0 ? ti : palette.length
    let idx =
      (o.dither && o.dither !== 'none') || transparency
        ? mapToPalette(rgba, width, height, palette, {
            dither: o.dither || 'none',
            transparentIndex: transparency ? ti : -1,
            alphaThreshold,
            paletteSize: candidates,
          })
        : applyPalette(rgba, ti >= 0 ? palette.slice(0, ti) : palette)
    let dispose = transparency ? 2 : -1
    let isTransparent = transparency
    if (optimize) {
      if (prev) idx = diffOptimize(idx, prev, ti)
      else prev = new Uint8Array(idx.length)
      for (let p = 0; p < idx.length; p++) if (idx[p] !== ti) prev[p] = idx[p]
      dispose = 1
      isTransparent = written > 0
    }
    const opts = { delay: Math.max(20, delay || 100), dispose, transparent: isTransparent, transparentIndex: Math.max(0, ti) }
    if (written === 0) {
      opts.palette = palette
      opts.repeat = repeat
    } else if (!useGlobal) opts.palette = palette
    enc.writeFrame(idx, width, height, opts)
    written++
    self.postMessage({ type: 'progress', p: written / count })
  }

  return {
    push(rgba, width, height, delay) {
      if (useGlobal) {
        buffered.push({ rgba, width, height, delay })
        self.postMessage({ type: 'progress', p: (buffered.length / count) * 0.3, stage: 'collect' })
      } else write(rgba, width, height, delay)
    },
    finish() {
      if (useGlobal) {
        if (!buffered.length) throw new Error('No frames to encode')
        globalPalette = quantize(
          samplePixels(
            buffered.map((f) => f.rgba),
            1_200_000,
          ),
          colors,
        )
        if (reserve) {
          tIndex = globalPalette.length
          globalPalette.push([0, 0, 0])
        }
        while (buffered.length) {
          const f = buffered.shift()
          write(f.rgba, f.width, f.height, f.delay)
        }
      }
      if (!written) throw new Error('No frames to encode')
      enc.finish()
      return enc.bytes()
    },
  }
}
