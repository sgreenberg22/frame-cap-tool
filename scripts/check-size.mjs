// Fails CI if the gzipped JavaScript in dist/ grows past the budget.
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = { total: 260, entry: 110 }
const dir = 'dist/assets'
const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
let total = 0
let entry = 0
const rows = files.map((f) => {
  const gz = gzipSync(readFileSync(`${dir}/${f}`)).length
  total += gz
  if (/^index-/.test(f)) entry += gz
  return [f, (gz / 1024).toFixed(1)]
})
rows.sort((a, b) => b[1] - a[1]).forEach(([f, kb]) => console.log(`${kb.padStart(7)} KB  ${f}`))
console.log(`Total ${(total / 1024).toFixed(1)} KB gz (budget ${BUDGET_KB.total}), entry ${(entry / 1024).toFixed(1)} KB (budget ${BUDGET_KB.entry})`)
if (total / 1024 > BUDGET_KB.total || entry / 1024 > BUDGET_KB.entry) {
  console.error('Bundle size budget exceeded')
  process.exit(1)
}
