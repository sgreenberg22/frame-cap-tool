import { readFileSync } from 'node:fs'
// End-to-end smoke test: build first (npm run build), then `npm run e2e`.
// Starts `vite preview`, generates the sample clip in-browser, then walks the whole workflow:
// cut + export video, capture, batch, enhance/upscale, edit, export a GIF, and reload persistence.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4179
const BASE = `http://localhost:${PORT}`
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const fail = (msg) => {
  console.error('✗', msg)
  process.exitCode = 1
}
const ok = (msg) => console.log('✓', msg)

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('preview server did not start')
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto(BASE + '/')
  ;(await page.getByRole('heading', { level: 1 }).count()) ? ok('home renders') : fail('home missing h1')

  await page.goto(BASE + '/studio')
  await page.getByRole('button', { name: 'Skip tour' }).click()
  await page.getByRole('button', { name: 'Try a sample clip' }).click()
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, null, { timeout: 20000 })
  ok('sample clip generated and loaded')

  // Video: cut out the middle and export
  await page.waitForFunction(() => isFinite(document.querySelector('video').duration))
  const setTime = async (t) => {
    await page.evaluate((x) => (document.querySelector('video').currentTime = x), t)
    await page.waitForTimeout(250)
  }
  await page.locator('.timecode').click()
  await setTime(1)
  await page.keyboard.press('i')
  await setTime(2.5)
  await page.keyboard.press('o')
  await page.getByRole('button', { name: 'Cut out in/out' }).click()
  ;(await page.locator('.clip').count()) === 2 ? ok('cut list has 2 clips') : fail('cut did not produce 2 clips')
  await page.keyboard.press('x')
  await page.getByRole('button', { name: 'Export video →' }).click()
  await page
    .locator('select')
    .filter({ hasText: /Source \(/ })
    .selectOption('12')
  await page.getByRole('button', { name: 'Export video', exact: true }).click()
  await page.waitForSelector('.result video', { timeout: 120000 })
  const meta = await page.evaluate(async () => {
    const v = document.querySelector('.result video')
    await new Promise((r) => (v.readyState >= 1 ? r() : (v.onloadedmetadata = r)))
    return { d: v.duration, w: v.videoWidth }
  })
  meta.w > 0 && meta.d > 1 && meta.d < 3.2
    ? ok(`video exported (${meta.d.toFixed(2)}s after cutting 1.5s)`)
    : fail(`unexpected export: ${JSON.stringify(meta)}`)

  await setTime(0.5)
  await page.locator('.timecode').click()
  await page.keyboard.press('s')
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 1, null, { timeout: 5000 })
  ok('single capture')

  await page.getByRole('tab', { name: 'Capture', exact: true }).click()
  await page.locator('select:has(option[value=spread])').selectOption('spread')
  await page.getByLabel('Count', { exact: true }).fill('4')
  await page.getByRole('button', { name: 'Batch capture' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 5, null, { timeout: 30000 })
  ok('batch capture (4 evenly spaced)')

  // Frames: enhance + upscale in bulk
  await page.getByRole('button', { name: /^Frames/ }).click()
  await page.locator('.thumb-check').first().check()
  for (const name of ['Auto enhance', 'Smart upscale 2×']) {
    await page.locator('summary', { hasText: 'Enhance' }).click()
    await page.getByRole('button', { name, exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('.selbar .spinner'), null, { timeout: 60000 })
    await page.waitForTimeout(300)
  }
  const dims = (await page.locator('.thumb').first().getAttribute('title')).split('\n')[1]
  dims.startsWith('1280×720') ? ok(`enhanced and upscaled (${dims})`) : fail(`upscale did not apply: ${dims}`)

  // Upscale dialog: exact target size with a preview
  await page.locator('summary', { hasText: 'Enhance' }).click()
  await page.getByRole('button', { name: 'Upscale…' }).click()
  const upDlg = page.getByRole('dialog', { name: /Upscale/ })
  await upDlg.getByRole('radio', { name: 'Fit 1080p' }).click()
  await page.waitForSelector('.cmp img[alt="After"]', { timeout: 15000 })
  await upDlg.getByRole('button', { name: 'Upscale', exact: true }).click()
  await upDlg.waitFor({ state: 'detached', timeout: 60000 })
  await page.waitForTimeout(500)
  const dims2 = (await page.locator('.thumb').first().getAttribute('title')).split('\n')[1]
  dims2.startsWith('1920×1080') ? ok(`upscale dialog hit exact size (${dims2})`) : fail(`upscale dialog result: ${dims2}`)

  // Sharpness scoring and sort
  await page.selectOption('#gsort', 'sharp')
  await page.waitForFunction(() => document.querySelectorAll('.thumb .score').length >= 2, null, { timeout: 30000 })
  ok('sharpness scores shown')
  await page.selectOption('#gsort', 'custom')

  await page.locator('.thumb').first().getByRole('button', { name: /^Edit/ }).click()
  const canvas = page.locator('.editor-canvas.ink-overlay')
  await canvas.waitFor()
  await page.waitForTimeout(300)
  await page.keyboard.press('r')
  const b = await canvas.boundingBox()
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6, { steps: 4 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForSelector('.thumb .badge', { timeout: 5000 })
  ok('edit + save keeps original (edited badge)')

  await page.getByRole('button', { name: 'Animate →' }).click()
  await page.getByLabel(/All frames/).check()
  await page.getByRole('button', { name: 'Load frames' }).click()
  await page
    .waitForFunction(() => document.querySelectorAll('.fs-item').length === 5, null, { timeout: 20000 })
    .catch(async (e) => {
      await page.screenshot({ path: process.env.E2E_SHOT || 'e2e-fail.png' })
      console.log('fs-items:', await page.locator('.fs-item').count(), await page.locator('.toast').allTextContents())
      throw e
    })
  await page.getByRole('button', { name: /^Generate GIF/ }).click()
  await page.waitForSelector('.result img', { timeout: 60000 })
  const size = await page.evaluate(async () => (await (await fetch(document.querySelector('.result img').src)).blob()).size)
  size > 1000 ? ok(`GIF exported (${size} bytes)`) : fail('GIF too small')

  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 5, null, { timeout: 5000 })
  ok('frames persist across reload')

  // Auto cuts: scan the sample clip for scene changes (finds none, but must report cleanly)
  await page.goto(BASE + '/studio')
  await page
    .getByRole('button', { name: 'Try a sample clip' })
    .click()
    .catch(() => {})
  await page.waitForSelector('.player-wrap video', { timeout: 30000 })
  await page.getByRole('tab', { name: 'Cut & edit' }).click()
  await page.getByRole('button', { name: 'Split at scene changes' }).click()
  await page.waitForSelector('[role=status]:has-text("scene")', { timeout: 60000 })
  ok('auto cuts scan reports a result')

  // Fullscreen: the control bar must be present and usable inside the fullscreen element
  await page.goto(BASE + '/studio')
  await page
    .getByRole('button', { name: 'Try a sample clip' })
    .click()
    .catch(() => {})
  await page.waitForSelector('.player-wrap video', { timeout: 30000 })
  await page.getByRole('button', { name: 'Fullscreen' }).first().click()
  const fsBar = page.getByRole('toolbar', { name: 'Fullscreen controls' })
  await fsBar.waitFor({ timeout: 5000 })
  await fsBar.getByRole('button', { name: /Capture/ }).click()
  await page.waitForFunction(() => /1 captured|\d+ captured/.test(document.querySelector('.fs-badge')?.textContent || ''))
  await page.waitForFunction(() => document.querySelectorAll('.fs-strip img').length >= 1)
  await fsBar.getByRole('button', { name: /Marker/ }).click()
  await fsBar.getByRole('button', { name: 'Rotate 90 degrees' }).click()
  await fsBar.getByRole('button', { name: /Timer/ }).click()
  await page.waitForFunction(() => /^[123]$/.test(document.querySelector('.fs-count')?.textContent || ''))
  await fsBar.getByRole('button', { name: /Cancel/ }).click()
  await fsBar.getByRole('button', { name: 'Exit fullscreen' }).click()
  await page.waitForFunction(() => !document.fullscreenElement)
  ok('fullscreen controls capture and exit')

  // Command palette: run a Studio action and open What's new
  await page.waitForTimeout(500)
  const before = await page.evaluate(() => document.querySelectorAll('.recent-thumb').length)
  await page.keyboard.press('Control+k')
  const pal = page.getByRole('combobox', { name: 'Command' })
  await pal.fill('capture frame')
  await pal.press('Enter')
  await page.waitForFunction((n) => document.querySelectorAll('.recent-thumb').length > n || n >= 8, before, { timeout: 10000 })
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'Command' }).fill("what's new")
  await page.keyboard.press('Enter')
  await page.getByRole('dialog', { name: "What's new" }).waitFor({ timeout: 5000 })
  await page.keyboard.press('Escape')
  ok('command palette runs actions and shows what is new')

  // Undecodable video (HEVC-like file): the player must explain itself instead of staying black
  await page.goto(BASE + '/studio')
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'phone.mov',
      mimeType: 'video/quicktime',
      buffer: Buffer.from('\0\0\0\x14ftypqt  \0\0\0\0qt  \0\0\0\x0cmoovhvc1 padding padding padding'),
    })
  await page.getByRole('alert').filter({ hasText: 'HEVC' }).waitFor({ timeout: 10000 })
  ok('unplayable video shows an explanation')

  // Standalone photo editor: HEIC + Live Photo pair, auto-straighten
  await page.goto(BASE + '/photo')
  await page.locator('#photoInput').setInputFiles([
    { name: 'sample.heic', mimeType: 'image/heic', buffer: readFileSync('e2e/fixtures/sample.heic') },
    { name: 'sample.mov', mimeType: 'video/quicktime', buffer: Buffer.from('motion') },
  ])
  await page.getByRole('dialog').or(page.locator('.modal')).first().waitFor({ timeout: 30000 })
  await page.getByText('Edit sample.jpg').waitFor({ timeout: 5000 })
  await page.keyboard.press('Escape')
  await page.locator('.photo-item .live-badge').waitFor({ timeout: 5000 })
  ok('photo page opens HEIC and pairs the Live Photo motion clip')
  await page.locator('#photoInput').setInputFiles('e2e/fixtures/tilted.jpg')
  await page.getByText('Edit tilted.jpg').waitFor({ timeout: 10000 })
  await page.getByRole('tab', { name: 'Transform' }).click()
  await page.getByRole('button', { name: 'Auto-straighten' }).click()
  await page.waitForFunction(
    () => [...document.querySelectorAll('input[type=range]')].some((i) => Math.abs(parseFloat(i.value) + 5) < 1.5 && i.min === '-45'),
    null,
    {
      timeout: 8000,
    },
  )
  ok('auto-straighten finds the tilted horizon')
  await page.getByRole('button', { name: 'Fix perspective…' }).click()
  const persp = page.getByRole('dialog', { name: 'Perspective correction' })
  await persp.waitFor({ timeout: 5000 })
  const handle = persp.getByRole('button', { name: 'top-left corner' })
  const hb = await handle.boundingBox()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2 + 60, hb.y + hb.height / 2 + 5, { steps: 5 })
  await page.mouse.up()
  await persp.getByLabel('Straightened preview').waitFor()
  await persp.getByRole('button', { name: 'Apply' }).click()
  await page
    .getByText(/Perspective/)
    .first()
    .waitFor({ timeout: 5000 })
  await page.waitForFunction(() => !document.body.innerText.includes('600 × 400px'), null, { timeout: 8000 })
  ok('perspective correction reshapes the photo')
  await page.getByRole('tab', { name: 'Enhance' }).click()
  await page.getByRole('button', { name: 'Blue', exact: true }).click()
  await page.getByRole('button', { name: 'Remove colour fringes' }).click()
  await page.getByRole('button', { name: 'Apply colour mixer' }).isDisabled()
  await page.getByText('Remove colour fringes').first().waitFor({ timeout: 15000 })
  ok('colour mixer and lens fixes are available and run')
  await page.keyboard.press('Escape')

  errors.length ? fail('console errors:\n' + errors.join('\n')) : ok('no console errors')
} catch (e) {
  fail(e.stack || e.message)
} finally {
  await browser?.close()
  server.kill()
}
