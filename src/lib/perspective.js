/** Perspective (keystone) correction: map a quadrilateral in the photo onto a straight rectangle. */

/** Solve the 3×3 homography taking src[i] → dst[i] for four point pairs ([x,y]). Returns 9 numbers, h33 = 1. */
export function solveHomography(src, dst) {
  const A = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let c = 0; c < 8; c++) {
    let p = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    if (Math.abs(A[p][c]) < 1e-12) return null // degenerate (collinear points)
    ;[A[c], A[p]] = [A[p], A[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1]
}

export const project = (H, x, y) => {
  const w = H[6] * x + H[7] * y + H[8]
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]
}

/** Is the quad (TL, TR, BR, BL) convex and not tiny? Needed for a sensible result. */
export function isValidQuad(q) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i]
    const [bx, by] = q[(i + 1) % 4]
    const [cx, cy] = q[(i + 2) % 4]
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
    if (Math.abs(cross) < 1e-9) return false
    const s = Math.sign(cross)
    if (sign && s !== sign) return false
    sign = s
  }
  return true
}

/** Natural output size of a quad: average of opposite edge lengths. */
export function quadSize(q) {
  const d = (a, b) => Math.hypot(q[a][0] - q[b][0], q[a][1] - q[b][1])
  return [Math.max(1, Math.round((d(0, 1) + d(3, 2)) / 2)), Math.max(1, Math.round((d(0, 3) + d(1, 2)) / 2))]
}

/** Warp RGBA image data so quad (pixels, TL TR BR BL) fills an outW×outH rectangle (bilinear). */
export function warpPerspective(img, quad, outW, outH) {
  const rect = [
    [0, 0],
    [outW, 0],
    [outW, outH],
    [0, outH],
  ]
  const H = solveHomography(rect, quad) // output → source
  if (!H) throw new Error('The four corners must form a proper four-sided shape')
  const { data: src, width: w, height: h } = img
  const out = new Uint8ClampedArray(outW * outH * 4)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = project(H, x + 0.5, y + 0.5)
      const o = (y * outW + x) * 4
      const fx = sx - 0.5
      const fy = sy - 0.5
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const tx = fx - x0
      const ty = fy - y0
      for (let c = 0; c < 4; c++) {
        const px = (xx, yy) => src[((yy < 0 ? 0 : yy >= h ? h - 1 : yy) * w + (xx < 0 ? 0 : xx >= w ? w - 1 : xx)) * 4 + c]
        out[o + c] = (px(x0, y0) * (1 - tx) + px(x0 + 1, y0) * tx) * (1 - ty) + (px(x0, y0 + 1) * (1 - tx) + px(x0 + 1, y0 + 1) * tx) * ty
      }
    }
  }
  return { data: out, width: outW, height: outH }
}

/** Canvas wrapper. quadN is normalised (0..1) TL TR BR BL. Returns { canvas, forward } where forward maps source px → output px. */
export function perspectiveCanvas(canvas, quadN, size) {
  const W = canvas.width
  const H = canvas.height
  const quad = quadN.map(([x, y]) => [x * W, y * H])
  const [outW, outH] = size || quadSize(quad)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const res = warpPerspective(ctx.getImageData(0, 0, W, H), quad, outW, outH)
  const c = document.createElement('canvas')
  c.width = outW
  c.height = outH
  c.getContext('2d').putImageData(new ImageData(res.data, outW, outH), 0, 0)
  const fwd = solveHomography(quad, [
    [0, 0],
    [outW, 0],
    [outW, outH],
    [0, outH],
  ])
  return { canvas: c, forward: (x, y) => project(fwd, x, y) }
}
