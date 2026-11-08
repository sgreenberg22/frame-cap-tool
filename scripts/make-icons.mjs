// Renders PNG icons and the social preview image from public/favicon.svg (run: node scripts/make-icons.mjs)
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg', 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()
async function shot(html, w, h, out) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<html><body style="margin:0">${html}</body></html>`)
  writeFileSync(out, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } }))
}
const icon = (s, pad = 0, bg = 'transparent') =>
  `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;background:${bg}"><div style="width:${s - pad * 2}px;height:${s - pad * 2}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>`
await shot(icon(192), 192, 192, 'public/icons/icon-192.png')
await shot(icon(512), 512, 512, 'public/icons/icon-512.png')
await shot(icon(512, 64, '#FF8A3D'), 512, 512, 'public/icons/maskable-512.png')
await shot(icon(180, 0, '#FF8A3D'), 180, 180, 'public/icons/apple-touch-icon.png')
await shot(
  `
<div style="width:1200px;height:630px;box-sizing:border-box;padding:70px 80px;font-family:system-ui,sans-serif;color:#22272a;
  background:radial-gradient(900px 500px at 0% 0%,#FFE6D1,transparent 60%),radial-gradient(800px 500px at 100% 20%,#FFEFE0,transparent 60%),#FFF7F0;display:flex;flex-direction:column;justify-content:center;gap:26px">
  <div style="display:flex;align-items:center;gap:24px"><div style="width:120px;height:120px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
  <div style="font-size:72px;font-weight:850;letter-spacing:-2px">FrameCapture</div></div>
  <div style="font-size:44px;font-weight:700;line-height:1.15;max-width:960px">Grab perfect frames, grade and annotate them, and make GIFs.</div>
  <div style="font-size:30px;color:#1f6b40;background:rgba(31,138,76,.12);border:2px solid rgba(31,138,76,.35);border-radius:16px;padding:12px 20px;align-self:flex-start">🔒 Runs entirely in your browser. Nothing is uploaded.</div>
</div>`,
  1200,
  630,
  'public/og-image.png',
)
await browser.close()
console.log('icons written')
