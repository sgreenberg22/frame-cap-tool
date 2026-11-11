// Fails CI if the gzipped JavaScript in dist/ grows past the budget.
// The TensorFlow.js runtime for AI upscaling is a separate lazy chunk that only loads on first use; it has its own budget.
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = { app: 330, entry: 110, ai: 600 }
const dir = 'dist/assets'
let app = 0
let entry = 0
let ai = 0
const rows = readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => {
    const gz = gzipSync(readFileSync(`${dir}/${f}`)).length
    const isAi = gz > 250 * 1024
    if (isAi) ai += gz
    else app += gz
    if (/^index-/.test(f) && !isAi) entry = Math.max(entry, gz)
    return [f + (isAi ? '  (lazy AI runtime)' : ''), gz / 1024]
  })
rows.sort((a, b) => b[1] - a[1]).forEach(([f, kb]) => console.log(`${kb.toFixed(1).padStart(7)} KB  ${f}`))
const kb = (n) => (n / 1024).toFixed(1)
console.log(
  `App ${kb(app)} KB gz (budget ${BUDGET_KB.app}), entry ${kb(entry)} KB (budget ${BUDGET_KB.entry}), lazy AI runtime ${kb(ai)} KB (budget ${BUDGET_KB.ai})`,
)
if (app / 1024 > BUDGET_KB.app || entry / 1024 > BUDGET_KB.entry || ai / 1024 > BUDGET_KB.ai) {
  console.error('Bundle size budget exceeded')
  process.exit(1)
}
