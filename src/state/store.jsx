import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { DEFAULT_SETTINGS } from '../lib/config'
import { db, ls } from '../lib/storage'
import { canvasToBlob, makeThumb } from '../lib/capture'
import { applyNameTemplate } from '../lib/batch'
import { fileTimecode } from '../lib/timecode'
import { extFor } from '../lib/download'
import Modal from '../components/Modal'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

function toRecord(s) {
  // eslint-disable-next-line no-unused-vars
  const { url, thumbUrl, originalUrl, ...rec } = s
  return rec
}

function withUrls(rec) {
  return {
    ...rec,
    url: URL.createObjectURL(rec.blob),
    thumbUrl: rec.thumbBlob ? URL.createObjectURL(rec.thumbBlob) : null,
    originalUrl: rec.originalBlob ? URL.createObjectURL(rec.originalBlob) : null,
  }
}

function revoke(s) {
  if (!s) return
  s.url && URL.revokeObjectURL(s.url)
  s.thumbUrl && URL.revokeObjectURL(s.thumbUrl)
  s.originalUrl && URL.revokeObjectURL(s.originalUrl)
}

function shotsReducer(state, action) {
  switch (action.type) {
    case 'hydrate':
      return action.shots
    case 'add':
      return [...state, ...action.shots]
    case 'update':
      return state.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s))
    case 'remove':
      return state.filter((s) => !action.ids.includes(s.id))
    case 'insert': {
      const next = [...state]
      for (const { shot, index } of action.items.sort((a, b) => a.index - b.index)) next.splice(Math.min(index, next.length), 0, shot)
      return next
    }
    case 'reorder': {
      const next = [...state]
      const from = next.findIndex((s) => s.id === action.id)
      if (from < 0) return state
      const [item] = next.splice(from, 1)
      next.splice(Math.max(0, Math.min(next.length, action.to)), 0, item)
      return next
    }
    case 'clear':
      return []
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [settings, setSettingsState] = useState(() => ({ ...DEFAULT_SETTINGS, ...ls.get('fc.settings', {}) }))
  const [shots, dispatch] = useReducer(shotsReducer, [])
  const shotsRef = useRef(shots)
  shotsRef.current = shots
  const [hydrated, setHydrated] = useState(false)
  const [toasts, setToasts] = useState([])
  const [confirmState, setConfirmState] = useState(null)
  const [errors, setErrors] = useState([])
  const seqRef = useRef(0)

  const setSettings = useCallback((patch) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }
      ls.set('fc.settings', next)
      return next
    })
  }, [])

  // Hydrate saved shots from IndexedDB
  useEffect(() => {
    let alive = true
    db.allShots().then((recs) => {
      if (!alive) return
      recs.sort((a, b) => (a.order ?? a.seq) - (b.order ?? b.seq))
      seqRef.current = recs.reduce((m, r) => Math.max(m, r.seq || 0), 0)
      dispatch({ type: 'hydrate', shots: recs.map(withUrls) })
      setHydrated(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // Persist display order whenever it changes
  const orderKey = shots.map((s) => s.id).join(',')
  useEffect(() => {
    if (!hydrated) return
    const t = setTimeout(() => {
      const current = shotsRef.current
      db.putShots(current.map((s, i) => toRecord({ ...s, order: i })))
    }, 400)
    return () => clearTimeout(t)
  }, [orderKey, hydrated])

  const toast = useCallback((message, opts = {}) => {
    const id = uid()
    const t = { id, message, kind: opts.kind || 'info', action: opts.action, timeout: opts.timeout ?? (opts.action ? 6000 : 3500) }
    setToasts((prev) => [...prev.slice(-4), t])
    if (t.timeout > 0) setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.timeout)
    return id
  }, [])
  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((x) => x.id !== id)), [])

  const confirm = useCallback(
    (message, { title = 'Are you sure?', confirmLabel = 'Confirm', danger = false } = {}) =>
      new Promise((resolve) => setConfirmState({ message, title, confirmLabel, danger, resolve })),
    [],
  )

  const logError = useCallback((err, context = '') => {
    const entry = { time: new Date().toISOString(), message: String(err?.message || err), context, stack: err?.stack ? String(err.stack).slice(0, 800) : '' }
    setErrors((prev) => [...prev.slice(-49), entry])
  }, [])

  useEffect(() => {
    const onErr = (e) => logError(e.error || e.message, 'window.onerror')
    const onRej = (e) => logError(e.reason, 'unhandledrejection')
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
    }
  }, [logError])

  /** Create shots from canvases. items: [{canvas, time, video, filters, note, delay}] */
  const addShotsFromCanvases = useCallback(
    async (items, { format, quality } = {}) => {
      const type = format || settings.imageFormat
      const q = quality ?? settings.imageQuality
      const created = []
      for (const it of items) {
        const blob = await canvasToBlob(it.canvas, type, q)
        const thumbBlob = await makeThumb(it.canvas)
        const seq = ++seqRef.current
        const name =
          applyNameTemplate(settings.nameTemplate, {
            video: (it.video || 'frame').replace(/\.[^.]+$/, ''),
            index: String(seq).padStart(3, '0'),
            timecode: fileTimecode(it.time || 0),
            time: (it.time || 0).toFixed(3),
            date: new Date().toISOString().slice(0, 10),
          }) +
          '.' +
          extFor(type)
        const rec = {
          id: uid(),
          seq,
          blob,
          thumbBlob,
          originalBlob: null,
          time: it.time || 0,
          width: it.canvas.width,
          height: it.canvas.height,
          size: blob.size,
          type,
          name,
          video: it.video || '',
          videoId: it.videoId || null,
          favorite: false,
          caption: it.note || '',
          tags: [],
          filters: it.filters || null,
          delay: it.delay || null,
          createdAt: Date.now(),
        }
        created.push(withUrls(rec))
      }
      dispatch({ type: 'add', shots: created })
      db.putShots(created.map((s, i) => toRecord({ ...s, order: shotsRef.current.length + i })))
      return created
    },
    [settings.imageFormat, settings.imageQuality, settings.nameTemplate],
  )

  /** Insert existing records (project import). Keeps metadata, assigns fresh ids. */
  const addShotRecords = useCallback(async (recs) => {
    const created = []
    for (const r of recs) {
      const seq = ++seqRef.current
      let thumbBlob = r.thumbBlob
      if (!thumbBlob) thumbBlob = await makeThumb(await createImageBitmap(r.blob))
      created.push(
        withUrls({
          favorite: false,
          caption: '',
          tags: [],
          filters: null,
          ...r,
          thumbBlob,
          id: uid(),
          seq,
          size: r.blob.size,
          type: r.blob.type || r.type,
          createdAt: r.createdAt || Date.now(),
        }),
      )
    }
    dispatch({ type: 'add', shots: created })
    db.putShots(created.map((s, i) => toRecord({ ...s, order: shotsRef.current.length + i })))
    return created
  }, [])

  const updateShot = useCallback(async (id, patch) => {
    const cur = shotsRef.current.find((s) => s.id === id)
    if (!cur) return
    const next = { ...cur, ...patch }
    if (patch.blob) {
      if (!cur.originalBlob && !patch.keepNoOriginal) next.originalBlob = cur.blob
      next.size = patch.blob.size
      next.type = patch.blob.type || cur.type
      URL.revokeObjectURL(cur.url)
      next.url = URL.createObjectURL(patch.blob)
      if (patch.thumbBlob) {
        cur.thumbUrl && URL.revokeObjectURL(cur.thumbUrl)
        next.thumbUrl = URL.createObjectURL(patch.thumbBlob)
      }
      if (next.originalBlob && !cur.originalUrl) next.originalUrl = URL.createObjectURL(next.originalBlob)
    }
    if (patch.originalBlob === null && cur.originalUrl) {
      URL.revokeObjectURL(cur.originalUrl)
      next.originalUrl = null
    }
    delete next.keepNoOriginal
    dispatch({ type: 'update', id, patch: next })
    db.putShot(toRecord({ ...next, order: shotsRef.current.findIndex((s) => s.id === id) }))
  }, [])

  const revertShot = useCallback(
    async (id) => {
      const cur = shotsRef.current.find((s) => s.id === id)
      if (!cur?.originalBlob) return
      const thumbBlob = await makeThumb(await createImageBitmap(cur.originalBlob))
      const bmp = await createImageBitmap(cur.originalBlob)
      await updateShot(id, { blob: cur.originalBlob, thumbBlob, originalBlob: null, keepNoOriginal: true, width: bmp.width, height: bmp.height })
    },
    [updateShot],
  )

  const removeShots = useCallback(
    (ids, { undo = true } = {}) => {
      const current = shotsRef.current
      const removed = current.map((s, index) => ({ shot: s, index })).filter((x) => ids.includes(x.shot.id))
      if (!removed.length) return
      dispatch({ type: 'remove', ids })
      let undone = false
      const finalize = () => {
        if (undone) return
        removed.forEach(({ shot }) => {
          db.deleteShot(shot.id)
          revoke(shot)
        })
      }
      if (undo) {
        const timer = setTimeout(finalize, 6500)
        toast(`Deleted ${removed.length} frame${removed.length > 1 ? 's' : ''}`, {
          action: {
            label: 'Undo',
            fn: () => {
              undone = true
              clearTimeout(timer)
              dispatch({ type: 'insert', items: removed })
            },
          },
        })
      } else finalize()
    },
    [toast],
  )

  const reorderShot = useCallback((id, to) => dispatch({ type: 'reorder', id, to }), [])

  const duplicateShot = useCallback(async (id) => {
    const cur = shotsRef.current.find((s) => s.id === id)
    if (!cur) return
    const seq = ++seqRef.current
    const rec = { ...toRecord(cur), id: uid(), seq, name: cur.name.replace(/(\.\w+)$/, '_copy$1'), createdAt: Date.now() }
    const shot = withUrls(rec)
    const index = shotsRef.current.findIndex((s) => s.id === id) + 1
    dispatch({ type: 'insert', items: [{ shot, index }] })
    db.putShot({ ...rec, order: index })
  }, [])

  const clearShots = useCallback(() => {
    shotsRef.current.forEach(revoke)
    dispatch({ type: 'clear' })
    db.clearShots()
  }, [])

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      shots,
      hydrated,
      toast,
      dismissToast,
      toasts,
      confirm,
      addShotsFromCanvases,
      addShotRecords,
      updateShot,
      revertShot,
      removeShots,
      reorderShot,
      duplicateShot,
      clearShots,
      errors,
      logError,
      clearErrors: () => setErrors([]),
    }),
    [
      settings,
      setSettings,
      shots,
      hydrated,
      toast,
      dismissToast,
      toasts,
      confirm,
      addShotsFromCanvases,
      addShotRecords,
      updateShot,
      revertShot,
      removeShots,
      reorderShot,
      duplicateShot,
      clearShots,
      errors,
      logError,
    ],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {confirmState && (
        <Modal
          title={confirmState.title}
          onClose={() => {
            confirmState.resolve(false)
            setConfirmState(null)
          }}
          size="sm"
        >
          <p>{confirmState.message}</p>
          <div className="row end" style={{ marginTop: 16 }}>
            <button
              className="btn secondary"
              onClick={() => {
                confirmState.resolve(false)
                setConfirmState(null)
              }}
            >
              Cancel
            </button>
            <button
              className={`btn ${confirmState.danger ? 'danger' : ''}`}
              data-autofocus
              onClick={() => {
                confirmState.resolve(true)
                setConfirmState(null)
              }}
            >
              {confirmState.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}
