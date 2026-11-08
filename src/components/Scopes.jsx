import React, { useEffect, useRef } from 'react'
import { histogram } from '../lib/analysis'

/** RGB histogram + luma waveform of the current (filtered) frame, refreshed ~4×/s. */
export default function Scopes({ getSource }) {
  const histRef = useRef(null)
  const waveRef = useRef(null)
  useEffect(() => {
    let alive = true
    const tick = () => {
      if (!alive) return
      const src = getSource()
      if (src && (src.videoWidth || src.width) && histRef.current && waveRef.current) {
        try {
          drawScopes(histogram(src, 256), histRef.current, waveRef.current)
        } catch {
          /* tainted or not ready */
        }
      }
      setTimeout(() => alive && requestAnimationFrame(tick), 250)
    }
    tick()
    return () => {
      alive = false
    }
  }, [getSource])
  return (
    <div className="scopes">
      <figure>
        <canvas ref={histRef} width="256" height="100" aria-label="RGB histogram" role="img" />
        <figcaption>Histogram</figcaption>
      </figure>
      <figure>
        <canvas ref={waveRef} width="256" height="100" aria-label="Luma waveform" role="img" />
        <figcaption>Waveform</figcaption>
      </figure>
    </div>
  )
}

function drawScopes(h, hc, wc) {
  const ctx = hc.getContext('2d')
  ctx.clearRect(0, 0, 256, 100)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, 256, 100)
  let max = 1
  for (let i = 1; i < 255; i++) max = Math.max(max, h.r[i], h.g[i], h.b[i])
  ctx.globalCompositeOperation = 'lighter'
  ;[
    ['r', '#ff3b3b'],
    ['g', '#3bff6b'],
    ['b', '#3b8bff'],
  ].forEach(([k, col]) => {
    ctx.fillStyle = col
    ctx.globalAlpha = 0.7
    for (let i = 0; i < 256; i++) {
      const v = Math.min(100, (h[k][i] / max) * 100)
      ctx.fillRect(i, 100 - v, 1, v)
    }
  })
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  const w = wc.getContext('2d')
  const img = w.createImageData(256, 100)
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i + 3] = 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 17
  }
  let wmax = 1
  for (let i = 0; i < h.wave.length; i++) wmax = Math.max(wmax, h.wave[i])
  for (let x = 0; x < h.w; x++) {
    const px = Math.floor((x / h.w) * 256)
    for (let b = 0; b < 64; b++) {
      const c = h.wave[x * 64 + b]
      if (!c) continue
      const v = Math.min(255, 60 + (c / wmax) * 800)
      const y0 = 99 - Math.floor((b / 64) * 100)
      for (let dy = 0; dy < 2; dy++) {
        const y = Math.max(0, y0 - dy)
        const i = (y * 256 + px) * 4
        img.data[i] = Math.max(img.data[i], v * 0.6)
        img.data[i + 1] = Math.max(img.data[i + 1], v)
        img.data[i + 2] = Math.max(img.data[i + 2], v * 0.6)
      }
    }
  }
  w.putImageData(img, 0, 0)
}
