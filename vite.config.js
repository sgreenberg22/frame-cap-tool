import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Ensure Web Crypto in Node (Codespaces sometimes defaults to a Node image without global crypto)
import { webcrypto as nodeCrypto } from 'node:crypto'
if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
  globalThis.crypto = nodeCrypto
}

export default defineConfig({
  plugins: [react()],
})
