// End-to-end smoke test: build first (npm run build), then `npm run e2e`.
// Starts `vite preview`, generates the sample clip in-browser, captures, batches, edits and exports a GIF.
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

  await page.keyboard.press('s')
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 1, null, { timeout: 5000 })
  ok('single capture')

  await page.getByRole('tab', { name: 'Capture & batch' }).click()
  await page.locator('select:has(option[value=spread])').selectOption('spread')
  await page.getByLabel('Count', { exact: true }).fill('4')
  await page.getByRole('button', { name: 'Batch capture' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 5, null, { timeout: 30000 })
  ok('batch capture (4 evenly spaced)')

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

  errors.length ? fail('console errors:\n' + errors.join('\n')) : ok('no console errors')
} catch (e) {
  fail(e.stack || e.message)
} finally {
  await browser?.close()
  server.kill()
}
