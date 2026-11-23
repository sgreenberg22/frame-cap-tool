import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/store'
import { decodeImageFrames } from '../lib/media'
import { decodeHeic, isHeic } from '../lib/heic'
import { groupPhotoFiles } from '../lib/livePhoto'
import { forgetMotion, motionFor, rememberMotion, setPendingVideo } from '../lib/handoff'
import { downloadBlob } from '../lib/download'

const EditorModal = lazy(() => import('../components/editor/EditorModal'))

const ACCEPT = 'image/*,.heic,.heif,.hif,video/quicktime,.mov'

async function decodePhoto(file) {
  if (isHeic(file)) return decodeHeic(file)
  const frames = await decodeImageFrames(file, 1)
  return frames[0].canvas
}

/** A standalone place to edit pictures: no video needed. */
export default function Photo() {
  const { shots, addShotsFromCanvases, removeShots, toast } = useApp()
  const navigate = useNavigate()
  const [busy, setBusy] = useState('')
  const [over, setOver] = useState(false)
  const [editorId, setEditorId] = useState(null)
  const input = useRef(null)
  const photos = shots.filter((s) => s.origin === 'photo')
  const editorShot = photos.find((s) => s.id === editorId)

  const importFiles = useCallback(
    async (list) => {
      const { photos: items, motionOnly, skipped } = groupPhotoFiles(list || [])
      if (!items.length && !motionOnly.length) {
        if (skipped.length) toast('Those files are not photos. Try JPG, PNG, WebP, GIF or HEIC.', { kind: 'warn' })
        return
      }
      const created = []
      let failed = 0
      for (const { still, motion } of items) {
        setBusy(`Opening ${still.name}…`)
        try {
          const canvas = await decodePhoto(still)
          const lossless = /png|gif/i.test(still.type) || /\.(png|gif)$/i.test(still.name)
          const [shot] = await addShotsFromCanvases([{ canvas, time: 0, video: still.name, name: still.name, origin: 'photo' }], {
            format: lossless ? 'image/png' : 'image/jpeg',
            quality: 0.95,
          })
          if (motion) rememberMotion(shot.id, motion)
          created.push(shot)
        } catch (e) {
          failed++
          toast(`Could not open ${still.name}: ${e.message}`, { kind: 'error' })
        }
      }
      setBusy('')
      if (motionOnly.length) {
        setPendingVideo(motionOnly[0])
        toast(`${motionOnly[0].name} is a video. Opening it in the Studio.`)
        navigate('/studio')
        return
      }
      if (created.length === 1) setEditorId(created[0].id)
      else if (created.length) toast(`Added ${created.length} photos${failed ? ` (${failed} failed)` : ''}`)
    },
    [addShotsFromCanvases, navigate, toast],
  )

  // Paste an image from the clipboard.
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])]
      if (files.length) {
        e.preventDefault()
        importFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [importFiles])

  const openMotion = (shot) => {
    setPendingVideo(motionFor(shot.id))
    navigate('/studio')
  }

  return (
    <main
      id="main"
      className="container photo-page"
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        importFiles(e.dataTransfer.files)
      }}
    >
      <h1>Photo editor</h1>
      <p className="muted">Edit any picture on its own. Nothing is uploaded; everything stays on this device.</p>
      <section className={`card photo-drop ${over ? 'over' : ''}`} aria-label="Add photos">
        <div className="photo-drop-icon" aria-hidden="true">
          🖼️
        </div>
        <h2>Drop a photo here</h2>
        <p className="muted">JPG, PNG, WebP, GIF, AVIF or iPhone HEIC. You can also paste from the clipboard (Ctrl/⌘ V).</p>
        <div className="row wrap gap-s center">
          <button className="btn lg" onClick={() => input.current?.click()} disabled={!!busy}>
            {busy ? <span className="spinner" /> : null} Choose photos
          </button>
        </div>
        <input
          ref={input}
          id="photoInput"
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {busy && (
          <p role="status" className="muted">
            {busy}
          </p>
        )}
        <details className="photo-live">
          <summary>Live Photos (iPhone)</summary>
          <p>
            A Live Photo is a still picture plus a short video clip. Select <strong>both files together</strong> (for example IMG_1234.HEIC and IMG_1234.MOV)
            and they are paired automatically: you edit the still here, and can open its motion clip in the Studio to pick a different frame or make a GIF.
          </p>
          <p className="muted">
            Picking from the Photos app on an iPhone only shares the still. To keep the motion, AirDrop it to a Mac, or save it to Files first, and choose both.
          </p>
        </details>
      </section>

      {photos.length > 0 && (
        <section aria-label="Your photos">
          <div className="row wrap gap-s" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <h2>Your photos ({photos.length})</h2>
            <button
              className="btn secondary sm"
              onClick={() => {
                photos.forEach((p) => forgetMotion(p.id))
                removeShots(photos.map((p) => p.id))
              }}
            >
              Remove all
            </button>
          </div>
          <ul className="photo-grid">
            {photos.map((p) => (
              <li key={p.id} className="card photo-item">
                <button className="photo-thumb" onClick={() => setEditorId(p.id)} aria-label={`Edit ${p.name}`}>
                  <img src={p.thumbUrl || p.url} alt={p.name} />
                  {motionFor(p.id) && <span className="live-badge">LIVE</span>}
                </button>
                <div className="photo-meta">
                  <span className="ellipsis" title={p.name}>
                    {p.name}
                  </span>
                  <span className="muted">
                    {p.width}×{p.height}
                  </span>
                </div>
                <div className="row gap-s">
                  <button className="btn sm" onClick={() => setEditorId(p.id)}>
                    Edit
                  </button>
                  <button className="btn secondary sm" onClick={() => downloadBlob(p.blob, p.name)}>
                    Save
                  </button>
                  {motionFor(p.id) && (
                    <button className="btn secondary sm" onClick={() => openMotion(p)} title="Open the motion clip in the Studio">
                      Motion
                    </button>
                  )}
                  <button
                    className="btn secondary sm"
                    onClick={() => {
                      forgetMotion(p.id)
                      removeShots([p.id])
                    }}
                    aria-label={`Remove ${p.name}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editorShot && (
        <Suspense
          fallback={
            <div className="modal">
              <div className="panel">
                <span className="spinner" /> Loading editor…
              </div>
            </div>
          }
        >
          <EditorModal shot={editorShot} onClose={() => setEditorId(null)} selected={new Set()} />
        </Suspense>
      )}
    </main>
  )
}
