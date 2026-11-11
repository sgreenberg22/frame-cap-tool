import React, { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { useT } from '../lib/i18n'
import { formatClock } from '../lib/timecode'
import { formatBytes } from '../lib/storage'
import { canShareFiles, copyImageToClipboard, downloadBlob, downloadText, shareFiles, zipBlobs } from '../lib/download'
import Lightbox from './Lightbox'
import Modal from './Modal'
import { blobToDrawable, canvasToBlob, makeThumb } from '../lib/capture'
import { enhanceCanvas, stackCanvases, UPSCALE_CHOICES } from '../lib/enhanceClient'
import { ENHANCE_TOOLS } from '../lib/enhance'

const SORTS = [
  ['custom', 'Custom order'],
  ['capture', 'Capture order'],
  ['time', 'Video time'],
  ['size', 'File size'],
]

export default function Gallery({ selected, setSelected, onEdit, onSeek, onAnimate }) {
  const t = useT()
  const app = useApp()
  const { shots, removeShots, updateShot, reorderShot, duplicateShot, revertShot, toast, confirm, addShotRecords, clearShots, addShotsFromCanvases, settings } =
    app
  const [sort, setSort] = useState('custom')
  const [onlyFav, setOnlyFav] = useState(false)
  const [tagFilter, setTagFilter] = useState('')
  const [query, setQuery] = useState('')
  const [range, setRange] = useState({ min: '', max: '' })
  const [layout, setLayout] = useState('grid')
  const [size, setSize] = useState(150)
  const [lightbox, setLightbox] = useState(null)
  const [compare, setCompare] = useState(null)
  const [meta, setMeta] = useState(null)
  const [busy, setBusy] = useState('')
  const anchor = useRef(null)
  const dragId = useRef(null)

  const allTags = useMemo(() => [...new Set(shots.flatMap((s) => s.tags || []))].sort(), [shots])
  const visible = useMemo(() => {
    let list = shots
    if (onlyFav) list = list.filter((s) => s.favorite)
    if (tagFilter) list = list.filter((s) => s.tags?.includes(tagFilter))
    if (query) {
      const q = query.toLowerCase()
      list = list.filter((s) => s.caption?.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.video?.toLowerCase().includes(q))
    }
    const mn = parseFloat(range.min),
      mx = parseFloat(range.max)
    if (Number.isFinite(mn)) list = list.filter((s) => s.time >= mn)
    if (Number.isFinite(mx)) list = list.filter((s) => s.time <= mx)
    if (sort === 'capture') list = [...list].sort((a, b) => a.seq - b.seq)
    if (sort === 'time') list = [...list].sort((a, b) => a.time - b.time || a.seq - b.seq)
    if (sort === 'size') list = [...list].sort((a, b) => b.size - a.size)
    return list
  }, [shots, onlyFav, tagFilter, query, range, sort])

  const selectedShots = useMemo(() => visible.filter((s) => selected.has(s.id)), [visible, selected])

  const onSelect = useCallback(
    (id, e) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (e?.shiftKey && anchor.current) {
          const ids = visible.map((s) => s.id)
          const a = ids.indexOf(anchor.current),
            b = ids.indexOf(id)
          if (a >= 0 && b >= 0) ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => next.add(x))
        } else if (e?.ctrlKey || e?.metaKey || e?.type === 'change' || e?.toggle) {
          next.has(id) ? next.delete(id) : next.add(id)
          anchor.current = id
        } else {
          const only = next.size === 1 && next.has(id)
          next.clear()
          if (!only) next.add(id)
          anchor.current = id
        }
        return next
      })
    },
    [visible, setSelected],
  )

  const selectAll = () => setSelected(new Set(visible.map((s) => s.id)))
  const selectNone = () => setSelected(new Set())

  async function downloadSelected(list = selectedShots) {
    if (!list.length) return
    if (list.length === 1) return downloadBlob(list[0].blob, list[0].name)
    setBusy('Zipping…')
    try {
      const zip = await zipBlobs(
        list.map((s) => ({ name: s.name, blob: s.blob })),
        (p) => setBusy(`Zipping ${Math.round(p * 100)}%`),
      )
      downloadBlob(zip, `frames_${new Date().toISOString().slice(0, 10)}.zip`)
    } finally {
      setBusy('')
    }
  }

  const toCanvas = async (shot) => {
    const d = await blobToDrawable(shot.blob)
    const c = document.createElement('canvas')
    c.width = d.width
    c.height = d.height
    c.getContext('2d').drawImage(d, 0, 0)
    d.close?.()
    return c
  }

  /** Run enhancement ops over every selected frame. Originals are kept, so each frame can be reverted. */
  async function enhanceSelected(ops, label) {
    const list = selectedShots
    if (!list.length) return toast('Select one or more frames first', { kind: 'warn' })
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy(`${label} ${i + 1}/${list.length}…`)
        const out = await enhanceCanvas(await toCanvas(list[i]), ops, (p) => setBusy(`${label} ${i + 1}/${list.length} · ${Math.round(p * 100)}%`))
        const blob = await canvasToBlob(out, list[i].type || 'image/png', settings.imageQuality)
        await updateShot(list[i].id, { blob, thumbBlob: await makeThumb(out), width: out.width, height: out.height })
      }
      toast(`${label}: ${list.length} frame${list.length > 1 ? 's' : ''} updated. Use ⋯ → Revert to undo.`)
    } catch (e) {
      toast(`${label} failed: ${e.message}`, { kind: 'error', timeout: 7000 })
    } finally {
      setBusy('')
    }
  }

  async function stackSelected() {
    const list = selectedShots
    if (list.length < 2) return toast('Select at least two frames of the same shot', { kind: 'warn' })
    if (list.some((s) => s.width !== list[0].width || s.height !== list[0].height)) return toast('Frames must be the same size to stack', { kind: 'warn' })
    setBusy('Stacking…')
    try {
      const out = await stackCanvases(await Promise.all(list.map(toCanvas)), 'median')
      await addShotsFromCanvases([{ canvas: out, time: list[0].time, video: list[0].video, videoId: list[0].videoId, note: `Stack of ${list.length} frames` }])
      toast('Stacked frame added')
    } catch (e) {
      toast(`Stack failed: ${e.message}`, { kind: 'error' })
    } finally {
      setBusy('')
    }
  }

  async function deleteSelected() {
    if (!selectedShots.length) return
    if (
      selectedShots.length > 10 &&
      !(await confirm(`Delete ${selectedShots.length} frames? You can undo for a few seconds.`, { danger: true, confirmLabel: 'Delete' }))
    )
      return
    removeShots(selectedShots.map((s) => s.id))
    selectNone()
  }

  function favoriteSelected() {
    const allFav = selectedShots.every((s) => s.favorite)
    selectedShots.forEach((s) => updateShot(s.id, { favorite: !allFav }))
  }

  function tagSelected() {
    const tag = window.prompt('Add a tag to the selected frames')?.trim()
    if (!tag) return
    selectedShots.forEach((s) => updateShot(s.id, { tags: [...new Set([...(s.tags || []), tag])] }))
  }

  async function copyShot(s) {
    try {
      await copyImageToClipboard(s.blob)
      toast('Copied image to clipboard')
    } catch (e) {
      toast(e.message, { kind: 'warn' })
    }
  }

  async function share(list = selectedShots) {
    try {
      await shareFiles(list.map((s) => ({ blob: s.blob, name: s.name })))
    } catch (e) {
      if (e?.name !== 'AbortError') toast(e.message, { kind: 'warn' })
    }
  }

  function exportMetadata(kind) {
    const list = selectedShots.length ? selectedShots : visible
    const rows = list.map((s, i) => ({
      index: i + 1,
      name: s.name,
      video: s.video,
      time: +s.time.toFixed(3),
      timecode: formatClock(s.time),
      width: s.width,
      height: s.height,
      bytes: s.size,
      type: s.type,
      favorite: s.favorite,
      caption: s.caption || '',
      tags: (s.tags || []).join('|'),
      captured: new Date(s.createdAt).toISOString(),
      filters: s.filters ? JSON.stringify(s.filters) : '',
    }))
    if (kind === 'json') return downloadText(JSON.stringify(rows, null, 2), 'frames-metadata.json', 'application/json')
    const head = Object.keys(rows[0] || { name: '' })
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    downloadText([head.join(','), ...rows.map((r) => head.map((h) => esc(r[h])).join(','))].join('\n'), 'frames-metadata.csv', 'text/csv')
  }

  async function exportProject() {
    const list = selectedShots.length ? selectedShots : shots
    if (!list.length) return
    setBusy('Packing project…')
    try {
      const manifest = {
        app: 'framecapture',
        version: 1,
        exported: new Date().toISOString(),
        shots: list.map((s, i) => ({
          file: `images/${String(i + 1).padStart(4, '0')}_${s.name}`,
          name: s.name,
          time: s.time,
          video: s.video,
          caption: s.caption,
          tags: s.tags,
          favorite: s.favorite,
          filters: s.filters,
          delay: s.delay,
          width: s.width,
          height: s.height,
          createdAt: s.createdAt,
        })),
      }
      const files = [
        { name: 'project.json', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }) },
        ...list.map((s, i) => ({ name: manifest.shots[i].file, blob: s.blob })),
      ]
      downloadBlob(await zipBlobs(files), `framecapture-project_${new Date().toISOString().slice(0, 10)}.zip`)
    } finally {
      setBusy('')
    }
  }

  async function importProject(file) {
    if (!file) return
    setBusy('Importing…')
    try {
      const { unzipSync } = await import('fflate')
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
      const manifest = JSON.parse(new TextDecoder().decode(entries['project.json']))
      if (manifest.app !== 'framecapture') throw new Error('Not a FrameCapture project')
      const recs = manifest.shots
        .filter((m) => entries[m.file])
        .map((m) => {
          const ext = m.file.split('.').pop().toLowerCase()
          const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
          return { ...m, blob: new Blob([entries[m.file]], { type }), originalBlob: null }
        })
      await addShotRecords(recs)
      toast(`Imported ${recs.length} frames`)
    } catch (e) {
      toast(`Import failed: ${e.message}`, { kind: 'error' })
    } finally {
      setBusy('')
    }
  }

  function printSheet() {
    document.body.classList.add('print-gallery')
    const done = () => {
      document.body.classList.remove('print-gallery')
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    setTimeout(() => window.print(), 50)
  }

  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      selectAll()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShots.length && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
      e.preventDefault()
      deleteSelected()
    }
  }

  const onDrop = (targetId) => {
    const id = dragId.current
    dragId.current = null
    if (!id || id === targetId) return
    const to = shots.findIndex((s) => s.id === targetId)
    reorderShot(id, to)
  }

  const move = (s, dir) => {
    const i = shots.findIndex((x) => x.id === s.id)
    reorderShot(s.id, Math.max(0, i + dir))
  }

  const lbIndex = lightbox ? visible.findIndex((s) => s.id === lightbox) : -1

  return (
    <div className="card gallery-card" onKeyDown={onKeyDown}>
      <div className="row between wrap gap-s">
        <h2 className="h">
          {t('gallery.title')} <span className="muted">({shots.length})</span>
        </h2>
        <div className="row gap-s wrap">
          <label className="file btn secondary sm" title="Import a FrameCapture project .zip">
            Import project
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                importProject(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <details className="menu">
            <summary className="btn secondary sm">Export ▾</summary>
            <div className="menu-list right">
              <button onClick={exportProject} disabled={!shots.length}>
                Project (.zip with metadata)
              </button>
              <button onClick={() => exportMetadata('csv')} disabled={!shots.length}>
                Metadata CSV
              </button>
              <button onClick={() => exportMetadata('json')} disabled={!shots.length}>
                Metadata JSON
              </button>
              <button onClick={printSheet} disabled={!shots.length}>
                Print / save as PDF
              </button>
              <button
                onClick={async () => {
                  if (await confirm('Delete every frame in the gallery? This cannot be undone.', { danger: true, confirmLabel: 'Delete all' })) {
                    clearShots()
                    selectNone()
                  }
                }}
                disabled={!shots.length}
              >
                Delete all frames…
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="gallery-tools">
        <div className="row wrap gap-s">
          <label className="sr-only" htmlFor="gsort">
            Sort
          </label>
          <select id="gsort" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
          <input
            className="text grow"
            type="search"
            placeholder="Search captions/names"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search frames"
          />
          <button
            className={`btn secondary sm ${onlyFav ? 'active' : ''}`}
            aria-pressed={onlyFav}
            onClick={() => setOnlyFav(!onlyFav)}
            title="Show favorites only"
          >
            ★
          </button>
          {allTags.length > 0 && (
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filter by tag">
              <option value="">All tags</option>
              {allTags.map((tg) => (
                <option key={tg}>{tg}</option>
              ))}
            </select>
          )}
        </div>
        <details>
          <summary className="muted small">More view options</summary>
          <div className="row wrap gap-s" style={{ marginTop: 6 }}>
            <div className="seg" role="group" aria-label="Layout">
              {['grid', 'list', 'strip'].map((l) => (
                <button key={l} className={`seg-btn ${layout === l ? 'on' : ''}`} aria-pressed={layout === l} onClick={() => setLayout(l)}>
                  {l === 'strip' ? 'Filmstrip' : l[0].toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
            {layout === 'grid' && (
              <label className="inline">
                Size <input type="range" min="90" max="320" value={size} onChange={(e) => setSize(+e.target.value)} aria-label="Thumbnail size" />
              </label>
            )}
            <label className="inline">
              Time from{' '}
              <input
                className="num"
                type="number"
                min="0"
                step="0.1"
                value={range.min}
                onChange={(e) => setRange((r) => ({ ...r, min: e.target.value }))}
                aria-label="Minimum time (s)"
              />
            </label>
            <label className="inline">
              to{' '}
              <input
                className="num"
                type="number"
                min="0"
                step="0.1"
                value={range.max}
                onChange={(e) => setRange((r) => ({ ...r, max: e.target.value }))}
                aria-label="Maximum time (s)"
              />
            </label>
          </div>
        </details>
      </div>

      <div className={`selbar ${selectedShots.length ? 'on' : ''}`} role="toolbar" aria-label="Selection actions">
        <span>
          <strong>{selectedShots.length}</strong> selected
        </span>
        <button className="btn secondary sm" onClick={selectAll} disabled={!visible.length}>
          All
        </button>
        <button className="btn secondary sm" onClick={selectNone} disabled={!selectedShots.length}>
          None
        </button>
        <details className="menu">
          <summary className={`btn sm ${selectedShots.length ? '' : 'secondary'}`} title="Improve or upscale the selected frames">
            ✨ Enhance ▾
          </summary>
          <div className="menu-list wide">
            <span className="menu-head">Improve</span>
            {ENHANCE_TOOLS.map(([op, label, hint]) => (
              <button
                key={op}
                title={hint}
                onClick={(e) => {
                  e.currentTarget.closest('details').open = false
                  enhanceSelected([{ op }], label)
                }}
              >
                {label}
              </button>
            ))}
            <span className="menu-head">Upscale</span>
            {UPSCALE_CHOICES.map(([id, label, ops, hint]) => (
              <button
                key={id}
                title={hint}
                onClick={(e) => {
                  e.currentTarget.closest('details').open = false
                  enhanceSelected(ops, label)
                }}
              >
                {label}
              </button>
            ))}
            <span className="menu-head">Combine</span>
            <button
              title="Median of the selected frames: removes noise and moving specks from a static shot"
              onClick={(e) => {
                e.currentTarget.closest('details').open = false
                stackSelected()
              }}
            >
              Stack frames (denoise)
            </button>
          </div>
        </details>
        {onAnimate && (
          <button className="btn secondary sm" onClick={onAnimate} disabled={!shots.length} title="Build a GIF or animation from the selected frames">
            Animate →
          </button>
        )}
        <button className="btn secondary sm" onClick={() => downloadSelected()} disabled={!selectedShots.length}>
          {selectedShots.length > 1 ? 'Download ZIP' : 'Download'}
        </button>
        <button className="btn secondary sm" onClick={favoriteSelected} disabled={!selectedShots.length}>
          ★
        </button>
        <button className="btn secondary sm" onClick={tagSelected} disabled={!selectedShots.length}>
          Tag
        </button>
        {selectedShots.length === 1 && (
          <button className="btn secondary sm" onClick={() => copyShot(selectedShots[0])}>
            Copy
          </button>
        )}
        {selectedShots.length === 2 && (
          <button className="btn secondary sm" onClick={() => setCompare(selectedShots.map((s) => s.id))}>
            Compare
          </button>
        )}
        {canShareFiles() && (
          <button className="btn secondary sm" onClick={() => share()} disabled={!selectedShots.length}>
            Share
          </button>
        )}
        <button className="btn secondary sm danger-text" onClick={deleteSelected} disabled={!selectedShots.length}>
          Delete
        </button>
        {busy && (
          <span className="muted" aria-live="polite">
            <span className="spinner sm" /> {busy}
          </span>
        )}
      </div>
      <small className="muted hint">
        {sort === 'custom' ? 'Drag frames (or use ◀ ▶) to reorder. Export uses this order.' : 'Switch to “Custom order” to reorder by dragging.'}
      </small>

      {!shots.length ? (
        <div className="gallery-empty">
          <div aria-hidden="true" className="empty-icon">
            🖼️
          </div>
          <p>{t('gallery.empty')}</p>
          <ul className="tips">
            <li>Batch capture grabs many frames at once (B).</li>
            <li>Drop images or an animated GIF here to edit them.</li>
            <li>Frames are saved in this browser until you delete them.</li>
          </ul>
        </div>
      ) : (
        <div className={`gallery layout-${layout}`} style={{ '--thumb': `${size}px` }} role="list">
          {visible.map((s, i) => (
            <Thumb
              key={s.id}
              s={s}
              index={i}
              selected={selected.has(s.id)}
              onSelect={onSelect}
              onOpen={setLightbox}
              onEdit={onEdit}
              onSeek={onSeek}
              draggable={sort === 'custom'}
              onDragStart={() => (dragId.current = s.id)}
              onDropOn={() => onDrop(s.id)}
              onMove={sort === 'custom' ? move : null}
              onMenu={setMeta}
            />
          ))}
        </div>
      )}

      {lightbox && lbIndex >= 0 && (
        <Lightbox
          shots={visible}
          index={lbIndex}
          onIndex={(i) => setLightbox(visible[i]?.id)}
          onClose={() => setLightbox(null)}
          onEdit={(id) => {
            setLightbox(null)
            onEdit(id)
          }}
        />
      )}
      {compare && <Lightbox compare shots={shots.filter((s) => compare.includes(s.id))} index={0} onClose={() => setCompare(null)} />}
      {meta && (
        <ShotDetails
          s={shots.find((x) => x.id === meta)}
          onClose={() => setMeta(null)}
          actions={{
            edit: (s) => {
              setMeta(null)
              onEdit(s.id)
            },
            download: (s) => downloadBlob(s.blob, s.name),
            duplicate: (s) => duplicateShot(s.id),
            copy: copyShot,
            share: canShareFiles() ? (s) => share([s]) : null,
            revert: async (s) => {
              await revertShot(s.id)
              toast('Reverted to the original capture')
            },
            remove: (s) => {
              setMeta(null)
              removeShots([s.id])
            },
            update: (s, patch) => updateShot(s.id, patch),
          }}
        />
      )}
    </div>
  )
}

const Thumb = memo(function Thumb({ s, index, selected, onSelect, onOpen, onEdit, onSeek, draggable, onDragStart, onDropOn, onMove, onMenu }) {
  const [over, setOver] = useState(false)
  const label = `Frame ${index + 1} at ${formatClock(s.time)}${s.caption ? `: ${s.caption}` : ''}`
  return (
    <figure
      role="listitem"
      className={`thumb ${selected ? 'sel' : ''} ${over ? 'over' : ''}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', s.id)
        onDragStart()
      }}
      onDragOver={(e) => {
        if (draggable) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onDropOn()
      }}
      title={`${s.name}\n${s.width}×${s.height} · ${formatBytes(s.size)}${s.filters ? '\nFilters saved with frame' : ''}`}
    >
      <button
        className="thumb-img"
        onClick={(e) => onSelect(s.id, e)}
        onDoubleClick={() => onOpen(s.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onOpen(s.id)
          }
        }}
        aria-pressed={selected}
        aria-label={label}
      >
        <img src={s.thumbUrl || s.url} alt={label} loading="lazy" decoding="async" />
        {s.favorite && (
          <span className="star" aria-hidden="true">
            ★
          </span>
        )}
        {s.originalBlob && (
          <span className="badge" title="Edited">
            edited
          </span>
        )}
      </button>
      <input type="checkbox" className="thumb-check" checked={selected} onChange={(e) => onSelect(s.id, e)} aria-label={`Select ${label}`} />
      <figcaption>
        <button className="link mono" onClick={() => onSeek(s)} title="Seek the video to this frame">
          {formatClock(s.time)}
        </button>
        {s.caption && <span className="cap">{s.caption}</span>}
        <span className="thumb-actions">
          {onMove && (
            <button className="mini" onClick={() => onMove(s, -1)} aria-label="Move earlier">
              ◀
            </button>
          )}
          {onMove && (
            <button className="mini" onClick={() => onMove(s, 1)} aria-label="Move later">
              ▶
            </button>
          )}
          <button className="mini" onClick={() => onEdit(s.id)} aria-label={`Edit ${label}`} title="Edit">
            ✎
          </button>
          <button className="mini" onClick={() => onMenu(s.id)} aria-label={`Details and actions for ${label}`} title="Details">
            ⋯
          </button>
        </span>
      </figcaption>
    </figure>
  )
})

function ShotDetails({ s, onClose, actions }) {
  const [caption, setCaption] = useState(s?.caption || '')
  const [tags, setTags] = useState((s?.tags || []).join(', '))
  if (!s) return null
  const save = () =>
    actions.update(s, {
      caption: caption.trim(),
      tags: tags
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    })
  return (
    <Modal
      title={s.name}
      onClose={() => {
        save()
        onClose()
      }}
      size="md"
    >
      <div className="details-grid">
        <img src={s.url} alt={`Frame at ${formatClock(s.time)}`} className="details-img" />
        <div className="stack">
          <dl className="info">
            <dt>Video</dt>
            <dd>{s.video || '—'}</dd>
            <dt>Time</dt>
            <dd>{formatClock(s.time)}</dd>
            <dt>Size</dt>
            <dd>
              {s.width}×{s.height} · {formatBytes(s.size)} · {s.type.replace('image/', '').toUpperCase()}
            </dd>
            <dt>Captured</dt>
            <dd>{new Date(s.createdAt).toLocaleString()}</dd>
            {s.filters && (
              <>
                <dt>Filters</dt>
                <dd className="small">
                  {Object.entries(s.filters)
                    .filter(([k, v]) => v && !['curve', 'chromaColor'].includes(k) && typeof v !== 'object')
                    .map(([k, v]) => `${k} ${v}`)
                    .join(', ')}
                </dd>
              </>
            )}
          </dl>
          <label className="field">
            Caption / note <textarea className="text" rows="2" value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={save} maxLength={300} />
          </label>
          <label className="field">
            Tags (comma separated) <input className="text" value={tags} onChange={(e) => setTags(e.target.value)} onBlur={save} />
          </label>
          <label className="inline check">
            <input type="checkbox" checked={!!s.favorite} onChange={(e) => actions.update(s, { favorite: e.target.checked })} /> Favorite
          </label>
          <div className="row wrap gap-s">
            <button className="btn sm" onClick={() => actions.edit(s)}>
              Edit
            </button>
            <button className="btn secondary sm" onClick={() => actions.download(s)}>
              Download
            </button>
            <button className="btn secondary sm" onClick={() => actions.copy(s)}>
              Copy
            </button>
            {actions.share && (
              <button className="btn secondary sm" onClick={() => actions.share(s)}>
                Share
              </button>
            )}
            <button className="btn secondary sm" onClick={() => actions.duplicate(s)}>
              Duplicate
            </button>
            {s.originalBlob && (
              <button className="btn secondary sm" onClick={() => actions.revert(s)}>
                Revert to original
              </button>
            )}
            <button className="btn secondary sm danger-text" onClick={() => actions.remove(s)}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
