// Tiny IndexedDB wrapper. Everything stays in this browser.
const DB_NAME = 'framecapture'
const DB_VERSION = 1
let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('shots')) db.createObjectStore('shots', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbPromise.catch(() => (dbPromise = null))
  return dbPromise
}

async function tx(store, mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    let result
    Promise.resolve(fn(s)).then((r) => (result = r))
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

const reqP = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })

export const db = {
  async putShot(record) {
    return tx('shots', 'readwrite', (s) => s.put(record)).catch(() => {})
  },
  async putShots(records) {
    return tx('shots', 'readwrite', (s) => records.forEach((r) => s.put(r))).catch(() => {})
  },
  async deleteShot(id) {
    return tx('shots', 'readwrite', (s) => s.delete(id)).catch(() => {})
  },
  async allShots() {
    try {
      const d = await openDb()
      return await reqP(d.transaction('shots').objectStore('shots').getAll())
    } catch {
      return []
    }
  },
  async clearShots() {
    return tx('shots', 'readwrite', (s) => s.clear()).catch(() => {})
  },
  async get(key) {
    try {
      const d = await openDb()
      return await reqP(d.transaction('kv').objectStore('kv').get(key))
    } catch {
      return undefined
    }
  },
  async set(key, value) {
    return tx('kv', 'readwrite', (s) => s.put(value, key)).catch(() => {})
  },
  async del(key) {
    return tx('kv', 'readwrite', (s) => s.delete(key)).catch(() => {})
  },
}

/** localStorage helpers that never throw (private mode, blocked storage). */
export const ls = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key)
      return v == null ? fallback : JSON.parse(v)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

/** Wipe every trace of local data: IndexedDB, localStorage, caches, service workers. */
export async function clearAllLocalData() {
  try {
    const d = await dbPromise
    d?.close()
  } catch {
    /* ignore */
  }
  dbPromise = null
  await new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME)
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    /* ignore */
  }
  try {
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k)
  } catch {
    /* ignore */
  }
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
    for (const r of regs) await r.unregister()
  } catch {
    /* ignore */
  }
}

export async function storageEstimate() {
  try {
    const e = await navigator.storage?.estimate?.()
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null
  } catch {
    return null
  }
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
