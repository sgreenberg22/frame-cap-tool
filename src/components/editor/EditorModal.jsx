import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../Modal'
import Slider from '../Slider'
import { useApp } from '../../state/store'
import { blobToDrawable, canvasToBlob, makeThumb } from '../../lib/capture'
import { copyImageToClipboard, downloadBlob, extFor } from '../../lib/download'
import { db, ls } from '../../lib/storage'
import { rgbToHex } from '../../lib/filters'
import { LIMITS } from '../../lib/config'
import {
  DEFAULT_ADJ,
  DEFAULT_FRAME,
  EMOJIS,
  adjustBase,
  blankCanvas,
  bounds,
  canvasFrom,
  composite,
  drawObject,
  exportCanvas,
  floodFill,
  fontOf,
  geometry,
  hitTest,
  replayOps,
  scaleObject,
  translateObject,
} from './editorCore'

const TOOLS = [
  ['select', 'Select / move', 'V', '⬚'],
  ['pen', 'Pen', 'P', '✎'],
  ['highlighter', 'Highlighter', 'H', '▮'],
  ['eraser', 'Eraser', 'E', '⌫'],
  ['line', 'Line', 'L', '╱'],
  ['arrow', 'Arrow', 'A', '➚'],
  ['rect', 'Rectangle', 'R', '▭'],
  ['ellipse', 'Ellipse', 'O', '◯'],
  ['polygon', 'Polygon', 'G', '⬠'],
  ['text', 'Text', 'T', 'T'],
  ['step', 'Numbered step', 'N', '①'],
  ['emoji', 'Sticker', 'K', '☺'],
  ['pixelate', 'Pixelate / redact', 'X', '▦'],
  ['blur', 'Blur region', 'B', '◌'],
  ['spotlight', 'Spotlight', 'S', '◎'],
  ['fill', 'Fill bucket', 'F', '◧'],
  ['eyedropper', 'Eyedropper', 'I', '⌖'],
  ['region', 'Select region (copy/paste)', 'M', '⬒'],
  ['crop', 'Crop', 'C', '⌗'],
]
const ASPECTS = [
  ['free', 'Free', null],
  ['1:1', '1:1', 1],
  ['4:3', '4:3', 4 / 3],
  ['16:9', '16:9', 16 / 9],
  ['9:16', '9:16', 9 / 16],
  ['3:2', '3:2', 3 / 2],
]
const FONTS = [
  ['system-ui, sans-serif', 'Sans'],
  ['Georgia, serif', 'Serif'],
  ['ui-monospace, monospace', 'Mono'],
  ['Impact, "Arial Black", sans-serif', 'Impact'],
]
const uid = () => Math.random().toString(36).slice(2, 10)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function EditorModal({ shot, onClose, selected }) {
  const { updateShot, addShotsFromCanvases, toast, confirm, shots, settings } = useApp()
  const displayRef = useRef(null)
  const overlayRef = useRef(null)
  const viewportRef = useRef(null)
  const inkRef = useRef(null)
  const miniRef = useRef(null)
  const [doc, setDoc] = useState(null)
  const [hist, setHist] = useState({ list: [], index: -1 })
  const [initialBase, setInitialBase] = useState(null)
  const [tool, setTool] = useState('pen')
  const [opt, setOpt] = useState(() => ({
    color: '#ff5a1f',
    fill: false,
    fillColor: '#ffd60a',
    size: 6,
    opacity: 1,
    hardness: 1,
    pressure: true,
    smoothing: 2,
    font: FONTS[0][0],
    textSize: 40,
    weight: 700,
    outline: '#000000',
    useOutline: true,
    textBg: '#000000',
    useBg: false,
    align: 'left',
    redact: 14,
    spot: 0.6,
    spotShape: 'rect',
    aspect: 'free',
    tolerance: 32,
    emoji: '👍',
    ...ls.get('fc.editorOpts', {}),
  }))
  const [recentColors, setRecentColors] = useState(() => ls.get('fc.recentColors', []))
  const [palette, setPalette] = useState(() => ls.get('fc.palette', ['#ff5a1f', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2', '#ffffff', '#000000']))
  const [selId, setSelId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [crop, setCrop] = useState(null)
  const [region, setRegion] = useState(null)
  const [textEdit, setTextEdit] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [cursor, setCursor] = useState(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [straighten, setStraighten] = useState(0)
  const [resize, setResize] = useState({ w: 0, h: 0, lock: true, quality: 'high' })
  const [pad, setPad] = useState({ px: 40, color: '#ffffff' })
  const [frame, setFrame] = useState(DEFAULT_FRAME)
  const [guides, setGuides] = useState([])
  const [spaceDown, setSpaceDown] = useState(false)
  const [draftRestore, setDraftRestore] = useState(null)
  const [saveAs, setSaveAs] = useState({ type: shot.type || 'image/png', quality: 0.92 })
  const [sideTab, setSideTab] = useState('tool')
  const [busy, setBusy] = useState('')
  const clipboard = useRef(null)
  const gesture = useRef(null)
  const pointers = useRef(new Map())

  useEffect(() => ls.set('fc.editorOpts', opt), [opt])

  // ---------- Load ----------
  useEffect(() => {
    let alive = true
    ;(async () => {
      const bmp = await blobToDrawable(shot.blob)
      if (!alive) return
      const base = canvasFrom(bmp)
      const d = { base, adj: { ...DEFAULT_ADJ }, objects: [], ops: [] }
      setDoc(d)
      setHist({ list: [{ label: 'Open', doc: d }], index: 0 })
      setResize({ w: base.width, h: base.height, lock: true, quality: 'high' })
      if (shot.originalBlob) setInitialBase(canvasFrom(await blobToDrawable(shot.originalBlob)))
      else setInitialBase(base)
      const saved = await db.get(`draft:${shot.id}`)
      if (alive && saved?.base) setDraftRestore(saved)
      requestAnimationFrame(() => fitZoom(base))
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id])

  const adjusted = useMemo(() => (doc ? adjustBase(doc.base, doc.adj) : null), [doc?.base, doc?.adj]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- History ----------
  const docRef = useRef(null)
  docRef.current = doc
  const commit = useCallback((label, patch) => {
    const next = { ...docRef.current, ...patch }
    docRef.current = next
    setDoc(next)
    setHist((h) => {
      const list = [...h.list.slice(0, h.index + 1), { label, doc: next }].slice(-LIMITS.editorMaxHistory)
      return { list, index: list.length - 1 }
    })
  }, [])
  const goto = useCallback(
    (i) => {
      if (i < 0 || i >= hist.list.length) return
      setDoc(hist.list[i].doc)
      setHist((h) => ({ ...h, index: i }))
      setSelId(null)
    },
    [hist.list],
  )
  const undo = () => goto(hist.index - 1)
  const redo = () => goto(hist.index + 1)
  const dirty = hist.index > 0

  // Autosave draft (debounced)
  useEffect(() => {
    if (!doc || !dirty) return
    const t = setTimeout(async () => {
      try {
        const objects = await Promise.all(doc.objects.map(async (o) => (o.type === 'image' ? { ...o, canvas: null, blob: await canvasToBlob(o.canvas) } : o)))
        await db.set(`draft:${shot.id}`, { base: await canvasToBlob(doc.base), adj: doc.adj, objects, ops: doc.ops, at: Date.now() })
      } catch {
        /* best effort */
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [doc, dirty, shot.id])

  async function restoreDraft() {
    const s = draftRestore
    setDraftRestore(null)
    const base = canvasFrom(await blobToDrawable(s.base))
    const objects = await Promise.all(
      s.objects.map(async (o) => (o.type === 'image' && o.blob ? { ...o, canvas: canvasFrom(await blobToDrawable(o.blob)), blob: undefined } : o)),
    )
    commit('Restore draft', { base, adj: s.adj, objects, ops: s.ops || [] })
  }

  // ---------- Rendering ----------
  useEffect(() => {
    if (!doc || !adjusted) return
    const id = requestAnimationFrame(() => {
      const c = displayRef.current
      if (!c) return
      if (c.width !== adjusted.width || c.height !== adjusted.height) {
        c.width = adjusted.width
        c.height = adjusted.height
      }
      if (!inkRef.current) inkRef.current = blankCanvas(c.width, c.height)
      const objs = draft ? [...doc.objects, draft] : doc.objects
      composite(c.getContext('2d'), adjusted, objs, inkRef.current)
      drawOverlay()
      drawMinimap()
    })
    return () => cancelAnimationFrame(id)
  })

  function drawOverlay() {
    const o = overlayRef.current
    const c = displayRef.current
    if (!o || !c) return
    if (o.width !== c.width || o.height !== c.height) {
      o.width = c.width
      o.height = c.height
    }
    const ctx = o.getContext('2d')
    ctx.clearRect(0, 0, o.width, o.height)
    const lw = 1.5 / zoom
    ctx.lineWidth = lw
    const sel = doc.objects.find((x) => x.id === selId)
    if (sel && tool === 'select') {
      const b = bounds(sel, ctx)
      ctx.setLineDash([6 / zoom, 4 / zoom])
      ctx.strokeStyle = '#0a84ff'
      ctx.strokeRect(b.x, b.y, b.w, b.h)
      ctx.setLineDash([])
      const hs = 10 / zoom
      ctx.fillStyle = '#fff'
      ctx.fillRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs)
      ctx.strokeRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs)
    }
    for (const g of guides) {
      ctx.strokeStyle = '#ff2d95'
      ctx.beginPath()
      if (g.x != null) {
        ctx.moveTo(g.x, 0)
        ctx.lineTo(g.x, o.height)
      } else {
        ctx.moveTo(0, g.y)
        ctx.lineTo(o.width, g.y)
      }
      ctx.stroke()
    }
    if (crop) {
      ctx.fillStyle = 'rgba(0,0,0,.5)'
      ctx.beginPath()
      ctx.rect(0, 0, o.width, o.height)
      ctx.rect(crop.x, crop.y + crop.h, crop.w, -crop.h)
      ctx.fill('evenodd')
      ctx.strokeStyle = '#fff'
      ctx.setLineDash([6 / zoom, 4 / zoom])
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h)
      ctx.setLineDash([])
      ctx.strokeStyle = 'rgba(255,255,255,.5)'
      for (let i = 1; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo(crop.x + (crop.w * i) / 3, crop.y)
        ctx.lineTo(crop.x + (crop.w * i) / 3, crop.y + crop.h)
        ctx.moveTo(crop.x, crop.y + (crop.h * i) / 3)
        ctx.lineTo(crop.x + crop.w, crop.y + (crop.h * i) / 3)
        ctx.stroke()
      }
      const hs = 12 / zoom
      ctx.fillStyle = '#fff'
      for (const [hx, hy] of cropHandles(crop)) ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
      ctx.font = `${13 / zoom}px system-ui`
      ctx.fillText(`${Math.round(crop.w)} × ${Math.round(crop.h)}`, crop.x + 4 / zoom, crop.y - 6 / zoom)
    }
    if (region) {
      ctx.strokeStyle = '#34c759'
      ctx.setLineDash([5 / zoom, 3 / zoom])
      ctx.strokeRect(region.x, region.y, region.w, region.h)
      ctx.setLineDash([])
    }
  }

  function drawMinimap() {
    const m = miniRef.current
    const vp = viewportRef.current
    const c = displayRef.current
    if (!m || !vp || !c) return
    const scale = 140 / Math.max(c.width, c.height)
    m.width = Math.round(c.width * scale)
    m.height = Math.round(c.height * scale)
    const ctx = m.getContext('2d')
    ctx.drawImage(c, 0, 0, m.width, m.height)
    ctx.strokeStyle = '#ff8a3d'
    ctx.lineWidth = 2
    ctx.strokeRect((vp.scrollLeft / zoom) * scale, (vp.scrollTop / zoom) * scale, (vp.clientWidth / zoom) * scale, (vp.clientHeight / zoom) * scale)
  }

  // ---------- Zoom ----------
  function fitZoom(base = doc?.base) {
    const vp = viewportRef.current
    if (!vp || !base) return
    setZoom(clamp(Math.min((vp.clientWidth - 24) / base.width, (vp.clientHeight - 24) / base.height, 1), 0.05, 32))
  }
  function zoomAt(nz, clientX, clientY) {
    const vp = viewportRef.current
    nz = clamp(nz, 0.05, 32)
    if (!vp) return setZoom(nz)
    const r = vp.getBoundingClientRect()
    const cx = (clientX ?? r.left + r.width / 2) - r.left
    const cy = (clientY ?? r.top + r.height / 2) - r.top
    const ix = (vp.scrollLeft + cx) / zoom
    const iy = (vp.scrollTop + cy) / zoom
    setZoom(nz)
    requestAnimationFrame(() => {
      vp.scrollLeft = ix * nz - cx
      vp.scrollTop = iy * nz - cy
    })
  }
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      zoomAt(zoom * Math.exp(-e.deltaY * 0.003), e.clientX, e.clientY)
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  })

  // ---------- Pointer ----------
  function pt(e) {
    const c = overlayRef.current
    const r = c.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
      p: e.pointerType === 'mouse' ? 0.5 : e.pressure || 0.5,
    }
  }
  const rememberColor = (col) => {
    setRecentColors((prev) => {
      const next = [col, ...prev.filter((c) => c !== col)].slice(0, 10)
      ls.set('fc.recentColors', next)
      return next
    })
  }

  function onPointerDown(e) {
    if (!doc) return
    // Prevent the compat mousedown from moving focus (keeps the text box focused, avoids text selection)
    e.preventDefault()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
    overlayRef.current.setPointerCapture?.(e.pointerId)
    const vp = viewportRef.current
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
      setDraft(null)
      return
    }
    if (spaceDown || e.button === 1) {
      gesture.current = { type: 'pan', x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop }
      return
    }
    const p = pt(e)
    const base = { id: uid(), color: opt.color, size: opt.size, opacity: opt.opacity }
    switch (tool) {
      case 'pen':
      case 'highlighter':
      case 'eraser':
        gesture.current = { type: 'stroke', last: p }
        setDraft({
          ...base,
          type: 'stroke',
          mode: tool === 'eraser' ? 'erase' : tool,
          opacity: tool === 'highlighter' ? Math.min(opt.opacity, 0.45) : opt.opacity,
          size: tool === 'highlighter' ? opt.size * 3 : opt.size,
          hardness: opt.hardness,
          pressure: opt.pressure && e.pointerType === 'pen',
          points: [[p.x, p.y, p.p]],
        })
        if (tool !== 'eraser') rememberColor(opt.color)
        break
      case 'line':
      case 'arrow':
      case 'rect':
      case 'ellipse':
      case 'pixelate':
      case 'blur':
      case 'spotlight':
        gesture.current = { type: 'box', x: p.x, y: p.y }
        setDraft({
          ...base,
          type: tool,
          x1: p.x,
          y1: p.y,
          x2: p.x,
          y2: p.y,
          fill: opt.fill ? opt.fillColor : null,
          amount: opt.redact,
          opacity: tool === 'spotlight' ? opt.spot : opt.opacity,
          shape: opt.spotShape,
        })
        if (!['pixelate', 'blur', 'spotlight'].includes(tool)) rememberColor(opt.color)
        break
      case 'polygon':
        if (draft?.type === 'polygon') setDraft({ ...draft, points: [...draft.points, [p.x, p.y]] })
        else
          setDraft({
            ...base,
            type: 'polygon',
            points: [
              [p.x, p.y],
              [p.x, p.y],
            ],
            fill: opt.fill ? opt.fillColor : null,
          })
        gesture.current = { type: 'polygon' }
        break
      case 'text':
        setTextEdit({ x: p.x, y: p.y, value: '', id: null })
        break
      case 'step': {
        const n = Math.max(0, ...doc.objects.filter((o) => o.type === 'step').map((o) => o.n)) + 1
        commit(`Step ${n}`, { objects: [...doc.objects, { ...base, type: 'step', x: p.x, y: p.y, n, size: Math.max(14, opt.size * 3) }] })
        rememberColor(opt.color)
        break
      }
      case 'emoji':
        commit('Sticker', { objects: [...doc.objects, { ...base, type: 'emoji', x: p.x, y: p.y, char: opt.emoji, size: Math.max(24, opt.size * 8) }] })
        break
      case 'eyedropper': {
        const d = displayRef.current.getContext('2d').getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data
        const hex = rgbToHex(d[0], d[1], d[2])
        setOpt((o) => ({ ...o, color: hex }))
        rememberColor(hex)
        setTool('pen')
        toast(`Picked ${hex}`)
        break
      }
      case 'fill': {
        const mask = floodFill(displayRef.current, p.x, p.y, opt.color, opt.tolerance)
        if (mask) commit('Fill', { objects: [...doc.objects, { ...base, type: 'image', x: 0, y: 0, w: mask.width, h: mask.height, canvas: mask }] })
        rememberColor(opt.color)
        break
      }
      case 'region':
        gesture.current = { type: 'region', x: p.x, y: p.y }
        setRegion({ x: p.x, y: p.y, w: 0, h: 0 })
        break
      case 'crop': {
        const h = crop && cropHandles(crop).findIndex(([hx, hy]) => Math.hypot(hx - p.x, hy - p.y) < 16 / zoom)
        if (crop && h >= 0) gesture.current = { type: 'cropResize', handle: h, start: { ...crop } }
        else if (crop && p.x > crop.x && p.x < crop.x + crop.w && p.y > crop.y && p.y < crop.y + crop.h)
          gesture.current = { type: 'cropMove', dx: p.x - crop.x, dy: p.y - crop.y }
        else {
          gesture.current = { type: 'cropNew', x: p.x, y: p.y }
          setCrop({ x: p.x, y: p.y, w: 1, h: 1 })
        }
        break
      }
      case 'select': {
        const sel = doc.objects.find((o) => o.id === selId)
        if (sel) {
          const b = bounds(sel, displayRef.current.getContext('2d'))
          if (Math.hypot(b.x + b.w - p.x, b.y + b.h - p.y) < 14 / zoom) {
            gesture.current = { type: 'scale', id: sel.id, b, orig: sel }
            return
          }
        }
        const hit = hitTest(doc.objects, p.x, p.y, displayRef.current.getContext('2d'))
        setSelId(hit)
        if (hit) gesture.current = { type: 'move', id: hit, x: p.x, y: p.y, orig: doc.objects.find((o) => o.id === hit), moved: false }
        break
      }
      default:
        break
    }
  }

  function onPointerMove(e) {
    if (!doc) return
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
    const p = pt(e)
    setCursor({ x: Math.round(p.x), y: Math.round(p.y) })
    const g = gesture.current
    if (!g) return
    const W = doc.base.width,
      H = doc.base.height
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      zoomAt((g.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / (g.dist || 1), g.mid.x, g.mid.y)
    } else if (g.type === 'pan') {
      const vp = viewportRef.current
      vp.scrollLeft = g.sl - (e.clientX - g.x)
      vp.scrollTop = g.st - (e.clientY - g.y)
    } else if (g.type === 'stroke') {
      const k = 1 / (1 + opt.smoothing)
      const sx = g.last.x + (p.x - g.last.x) * k
      const sy = g.last.y + (p.y - g.last.y) * k
      g.last = { x: sx, y: sy }
      setDraft((d) => d && { ...d, points: [...d.points, [sx, sy, p.p]] })
    } else if (g.type === 'box') {
      let { x, y } = p
      if (e.shiftKey) {
        if (draft?.type === 'line' || draft?.type === 'arrow') {
          const ang = Math.round(Math.atan2(y - g.y, x - g.x) / (Math.PI / 4)) * (Math.PI / 4)
          const len = Math.hypot(x - g.x, y - g.y)
          x = g.x + Math.cos(ang) * len
          y = g.y + Math.sin(ang) * len
        } else {
          const s = Math.max(Math.abs(x - g.x), Math.abs(y - g.y))
          x = g.x + Math.sign(x - g.x || 1) * s
          y = g.y + Math.sign(y - g.y || 1) * s
        }
      }
      setDraft((d) => d && { ...d, x2: x, y2: y })
    } else if (g.type === 'polygon') {
      setDraft((d) => d && d.type === 'polygon' && { ...d, points: [...d.points.slice(0, -1), [p.x, p.y]] })
    } else if (g.type === 'region') {
      setRegion({ x: Math.min(g.x, p.x), y: Math.min(g.y, p.y), w: Math.abs(p.x - g.x), h: Math.abs(p.y - g.y) })
    } else if (g.type === 'cropNew' || g.type === 'cropResize' || g.type === 'cropMove') {
      const ar = ASPECTS.find((a) => a[0] === opt.aspect)?.[2]
      if (g.type === 'cropMove') {
        setCrop((c) => ({ ...c, x: clamp(p.x - g.dx, 0, W - c.w), y: clamp(p.y - g.dy, 0, H - c.h) }))
      } else {
        let x0, y0, x1, y1
        if (g.type === 'cropNew') {
          x0 = g.x
          y0 = g.y
          x1 = p.x
          y1 = p.y
        } else {
          const s = g.start
          const corners = [
            [s.x, s.y],
            [s.x + s.w, s.y],
            [s.x + s.w, s.y + s.h],
            [s.x, s.y + s.h],
          ]
          const hIdx = g.handle
          if (hIdx < 4) {
            const opp = corners[(hIdx + 2) % 4]
            x0 = opp[0]
            y0 = opp[1]
            x1 = p.x
            y1 = p.y
          } else {
            // edges: 4 top, 5 right, 6 bottom, 7 left
            x0 = s.x
            y0 = s.y
            x1 = s.x + s.w
            y1 = s.y + s.h
            if (hIdx === 4) y0 = p.y
            if (hIdx === 5) x1 = p.x
            if (hIdx === 6) y1 = p.y
            if (hIdx === 7) x0 = p.x
          }
        }
        x0 = clamp(x0, 0, W)
        x1 = clamp(x1, 0, W)
        y0 = clamp(y0, 0, H)
        y1 = clamp(y1, 0, H)
        let w = Math.abs(x1 - x0),
          h = Math.abs(y1 - y0)
        if (ar) {
          if (w / ar > h) w = h * ar
          else h = w / ar
        }
        const x = x1 >= x0 ? x0 : x0 - w
        const y = y1 >= y0 ? y0 : y0 - h
        setCrop({ x: clamp(x, 0, W - w), y: clamp(y, 0, H - h), w: Math.max(1, w), h: Math.max(1, h) })
      }
    } else if (g.type === 'move') {
      let dx = p.x - g.x,
        dy = p.y - g.y
      const b = bounds(g.orig, displayRef.current.getContext('2d'))
      const cx = b.x + b.w / 2 + dx,
        cy = b.y + b.h / 2 + dy
      const snap = 8 / zoom
      const gl = []
      if (Math.abs(cx - W / 2) < snap) {
        dx += W / 2 - cx
        gl.push({ x: W / 2 })
      }
      if (Math.abs(cy - H / 2) < snap) {
        dy += H / 2 - cy
        gl.push({ y: H / 2 })
      }
      if (Math.abs(b.x + dx) < snap) {
        dx = -b.x
        gl.push({ x: 0 })
      }
      if (Math.abs(b.y + dy) < snap) {
        dy = -b.y
        gl.push({ y: 0 })
      }
      setGuides(gl)
      g.moved = true
      const moved = translateObject(g.orig, dx, dy)
      setDoc((d) => ({ ...d, objects: d.objects.map((o) => (o.id === g.id ? moved : o)) }))
    } else if (g.type === 'scale') {
      const sx = Math.max(0.05, (p.x - g.b.x) / Math.max(1, g.b.w))
      const sy = e.shiftKey ? Math.max(0.05, (p.y - g.b.y) / Math.max(1, g.b.h)) : sx
      const scaled = scaleObject(g.orig, sx, sy, g.b.x, g.b.y)
      g.moved = true
      setDoc((d) => ({ ...d, objects: d.objects.map((o) => (o.id === g.id ? scaled : o)) }))
    }
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g?.type === 'polygon') return
    gesture.current = null
    setGuides([])
    if (!g || !doc) return
    if (g.type === 'stroke' && draft) {
      commit(tool === 'eraser' ? 'Erase' : tool === 'highlighter' ? 'Highlight' : 'Draw', { objects: [...doc.objects, draft] })
      setDraft(null)
    } else if (g.type === 'box' && draft) {
      if (Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 3)
        commit(TOOLS.find((t) => t[0] === draft.type)?.[1] || 'Shape', { objects: [...doc.objects, draft] })
      setDraft(null)
    } else if ((g.type === 'move' || g.type === 'scale') && g.moved) {
      commit(g.type === 'move' ? 'Move' : 'Resize object', { objects: doc.objects })
    }
  }

  function finishPolygon() {
    if (draft?.type === 'polygon' && draft.points.length > 2) commit('Polygon', { objects: [...doc.objects, { ...draft, points: draft.points.slice(0, -1) }] })
    setDraft(null)
    gesture.current = null
  }

  function onDoubleClick(e) {
    if (tool === 'polygon') return finishPolygon()
    if (tool !== 'select' && tool !== 'text') return
    const p = pt(e)
    const hit = hitTest(doc.objects, p.x, p.y, displayRef.current.getContext('2d'))
    const o = doc.objects.find((x) => x.id === hit)
    if (o?.type === 'text') setTextEdit({ x: o.x, y: o.y, value: o.text, id: o.id })
  }

  function commitText() {
    const te = textEdit
    setTextEdit(null)
    if (!te) return
    const text = te.value.replace(/\s+$/, '')
    if (te.id) {
      if (!text) commit('Delete text', { objects: doc.objects.filter((o) => o.id !== te.id) })
      else commit('Edit text', { objects: doc.objects.map((o) => (o.id === te.id ? { ...o, text } : o)) })
    } else if (text) {
      commit('Text', {
        objects: [
          ...doc.objects,
          {
            id: uid(),
            type: 'text',
            x: te.x,
            y: te.y,
            text,
            font: opt.font,
            size: opt.textSize,
            weight: opt.weight,
            color: opt.color,
            outline: opt.useOutline ? opt.outline : null,
            bg: opt.useBg ? opt.textBg : null,
            align: opt.align,
            opacity: opt.opacity,
          },
        ],
      })
      rememberColor(opt.color)
    }
  }

  // ---------- Geometry ----------
  function applyGeometry(label, fn, op) {
    if (!doc) return
    const g = fn(doc)
    commit(label, { ...g, ops: op ? [...doc.ops, op] : doc.ops })
    setResize((r) => ({ ...r, w: g.base.width, h: g.base.height }))
    setSelId(null)
    requestAnimationFrame(() => fitZoom(g.base))
  }
  function applyCrop() {
    if (!crop || crop.w < 2 || crop.h < 2) return
    const W = doc.base.width,
      H = doc.base.height
    applyGeometry('Crop', (d) => geometry.crop(d, crop), { type: 'crop', x: crop.x / W, y: crop.y / H, w: crop.w / W, h: crop.h / H })
    setCrop(null)
  }

  // ---------- Clipboard ----------
  async function copyRegion() {
    const src = displayRef.current
    const r = region && region.w > 2 ? region : { x: 0, y: 0, w: src.width, h: src.height }
    const c = blankCanvas(r.w, r.h)
    c.getContext('2d').drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
    clipboard.current = { canvas: c, x: r.x, y: r.y }
    try {
      await copyImageToClipboard(await canvasToBlob(c))
      toast('Region copied')
    } catch {
      toast('Region copied (inside the editor)')
    }
  }
  const pasteCanvas = useCallback(
    (c, x, y) => {
      const o = {
        id: uid(),
        type: 'image',
        x: x ?? (doc.base.width - c.width) / 2,
        y: y ?? (doc.base.height - c.height) / 2,
        w: c.width,
        h: c.height,
        canvas: c,
        opacity: 1,
      }
      commit('Paste', { objects: [...doc.objects, o] })
      setTool('select')
      setSelId(o.id)
    },
    [doc, commit],
  )

  useEffect(() => {
    const onPaste = async (e) => {
      if (textEdit) return
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'))
      e.preventDefault()
      e.stopPropagation()
      if (file) pasteCanvas(canvasFrom(await blobToDrawable(file)))
      else if (clipboard.current) pasteCanvas(clipboard.current.canvas, clipboard.current.x + 20, clipboard.current.y + 20)
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [pasteCanvas, textEdit])

  // ---------- Keyboard ----------
  function onKeyDown(e) {
    if (textEdit || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (mod && k === 'z') {
      e.preventDefault()
      e.shiftKey ? redo() : undo()
      return
    }
    if (mod && k === 'y') {
      e.preventDefault()
      redo()
      return
    }
    if (mod && k === 'c') {
      e.preventDefault()
      copyRegion()
      return
    }
    if (mod && k === 's') {
      e.preventDefault()
      save()
      return
    }
    if (e.key === 'Escape') {
      if (draft || crop || region || selId) {
        e.preventDefault()
        setDraft(null)
        setCrop(null)
        setRegion(null)
        setSelId(null)
        gesture.current = null
      }
      return
    }
    if (e.key === 'Enter') {
      if (tool === 'polygon') {
        e.preventDefault()
        finishPolygon()
      }
      if (tool === 'crop' && crop) {
        e.preventDefault()
        applyCrop()
      }
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selId) {
      e.preventDefault()
      commit('Delete', { objects: doc.objects.filter((o) => o.id !== selId) })
      setSelId(null)
      return
    }
    if (selId && e.key.startsWith('Arrow')) {
      e.preventDefault()
      const d = e.shiftKey ? 10 : 1
      const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
      const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
      commit('Nudge', { objects: doc.objects.map((o) => (o.id === selId ? translateObject(o, dx, dy) : o)) })
      return
    }
    if (e.key === ' ') {
      e.preventDefault()
      setSpaceDown(true)
      return
    }
    if (mod) return
    const t = TOOLS.find((x) => x[2].toLowerCase() === k)
    if (t) {
      setTool(t[0])
      setDraft(null)
      e.preventDefault()
    }
    if (k === '0') fitZoom()
    if (k === '1') setZoom(1)
    if (k === '+' || k === '=') zoomAt(zoom * 1.25)
    if (k === '-') zoomAt(zoom / 1.25)
  }
  useEffect(() => {
    const up = (e) => e.key === ' ' && setSpaceDown(false)
    window.addEventListener('keyup', up)
    return () => window.removeEventListener('keyup', up)
  }, [])

  // ---------- Save ----------
  function finalCanvas() {
    return exportCanvas(adjusted, doc.objects, frame)
  }
  async function save() {
    if (!doc) return
    setBusy('Saving…')
    try {
      const out = finalCanvas()
      const blob = await canvasToBlob(out, shot.type || 'image/png', settings.imageQuality)
      await updateShot(shot.id, { blob, thumbBlob: await makeThumb(out), width: out.width, height: out.height })
      await db.del(`draft:${shot.id}`)
      toast('Saved. The original is kept so you can revert.')
      onClose()
    } catch (e) {
      toast(`Save failed: ${e.message}`, { kind: 'error' })
    } finally {
      setBusy('')
    }
  }
  async function saveAsNew() {
    const out = finalCanvas()
    await addShotsFromCanvases([{ canvas: out, time: shot.time, video: shot.video, videoId: shot.videoId, note: shot.caption }], {
      format: saveAs.type,
      quality: saveAs.quality,
    })
    toast('Saved as a new frame')
  }
  async function downloadAs() {
    const out = finalCanvas()
    const blob = await canvasToBlob(out, saveAs.type, saveAs.quality)
    downloadBlob(blob, shot.name.replace(/\.\w+$/, '') + '_edited.' + extFor(saveAs.type))
  }
  async function copyImage() {
    try {
      await copyImageToClipboard(await canvasToBlob(finalCanvas()))
      toast('Copied to clipboard')
    } catch (e) {
      toast(e.message, { kind: 'warn' })
    }
  }
  async function applyToSelected() {
    const targets = shots.filter((s) => selected?.has(s.id) && s.id !== shot.id)
    if (!targets.length) return toast('Select other frames in the gallery first', { kind: 'warn' })
    if (
      !(await confirm(
        `Apply this edit’s adjustments and crop/rotate/flip/resize to ${targets.length} other frame${targets.length > 1 ? 's' : ''}? Drawings are not copied. Originals are kept.`,
        { confirmLabel: 'Apply' },
      ))
    )
      return
    setBusy('Applying…')
    try {
      let i = 0
      for (const s of targets) {
        setBusy(`Applying ${++i}/${targets.length}…`)
        const base = canvasFrom(await blobToDrawable(s.blob))
        const d = replayOps({ base, objects: [] }, doc.ops)
        const out = exportCanvas(adjustBase(d.base, doc.adj), [], frame)
        const blob = await canvasToBlob(out, s.type || 'image/png', settings.imageQuality)
        await updateShot(s.id, { blob, thumbBlob: await makeThumb(out), width: out.width, height: out.height })
      }
      toast(`Updated ${targets.length} frames`)
    } finally {
      setBusy('')
    }
  }

  async function requestClose() {
    if (textEdit) return commitText()
    if (dirty && !(await confirm('You have unsaved edits. Discard them?', { title: 'Discard changes?', confirmLabel: 'Discard', danger: true }))) return
    if (dirty) await db.del(`draft:${shot.id}`)
    onClose()
  }

  const setAdj = (k, val) => setDoc((d) => ({ ...d, adj: { ...d.adj, [k]: val } }))
  const commitAdj = () => commit('Adjust', { adj: doc.adj })
  const sel = doc?.objects.find((o) => o.id === selId)
  const updateSel = (patch) => commit('Style', { objects: doc.objects.map((o) => (o.id === selId ? { ...o, ...patch } : o)) })
  const otherSelected = shots.filter((s) => selected?.has(s.id) && s.id !== shot.id).length
  const gridOn = zoom >= 8
  const W = doc?.base.width || 0,
    H = doc?.base.height || 0
  const cursorCss = spaceDown
    ? 'grab'
    : tool === 'select'
      ? 'default'
      : tool === 'text'
        ? 'text'
        : tool === 'eyedropper' || tool === 'fill'
          ? 'copy'
          : 'crosshair'

  return (
    <Modal title={`Edit ${shot.name}`} onClose={requestClose} size="full" closeOnBackdrop={false} onKeyDown={onKeyDown} className="editor">
      {draftRestore && (
        <div className="banner">
          Unsaved edits from {new Date(draftRestore.at).toLocaleString()} were found.
          <button className="btn sm" onClick={restoreDraft}>
            Restore
          </button>
          <button
            className="btn secondary sm"
            onClick={() => {
              db.del(`draft:${shot.id}`)
              setDraftRestore(null)
            }}
          >
            Discard
          </button>
        </div>
      )}
      <div className="editor-top" role="toolbar" aria-label="Editor actions">
        <button className="btn secondary sm" onClick={undo} disabled={hist.index <= 0} title="Undo (Ctrl/⌘+Z)">
          ↶ Undo
        </button>
        <button className="btn secondary sm" onClick={redo} disabled={hist.index >= hist.list.length - 1} title="Redo (Shift+Ctrl/⌘+Z)">
          ↷ Redo
        </button>
        <span className="muted small">
          {hist.index} edit{hist.index === 1 ? '' : 's'}
        </span>
        <span className="divider" />
        <button className="btn secondary sm" onClick={() => fitZoom()} title="Fit (0)">
          Fit
        </button>
        <button className="btn secondary sm" onClick={() => zoomAt(1)} title="100% (1)">
          100%
        </button>
        <button className="btn secondary sm" onClick={() => zoomAt(2)}>
          200%
        </button>
        <button className="btn icon secondary sm" onClick={() => zoomAt(zoom / 1.25)} aria-label="Zoom out">
          −
        </button>
        <span className="mono small">{Math.round(zoom * 100)}%</span>
        <button className="btn icon secondary sm" onClick={() => zoomAt(zoom * 1.25)} aria-label="Zoom in">
          ＋
        </button>
        <span className="divider" />
        <button
          className={`btn secondary sm ${showOriginal ? 'active' : ''}`}
          onPointerDown={() => setShowOriginal(true)}
          onPointerUp={() => setShowOriginal(false)}
          onPointerLeave={() => setShowOriginal(false)}
          title="Hold to see the original"
        >
          Original
        </button>
        <span className="spacer" />
        {busy && (
          <span className="muted small">
            <span className="spinner sm" /> {busy}
          </span>
        )}
        <button className="btn secondary sm" onClick={copyImage}>
          Copy
        </button>
        <button className="btn sm" onClick={save} disabled={!doc || !!busy} title="Save (Ctrl/⌘+S)">
          Save
        </button>
      </div>

      <div className="editor-body">
        <div className="editor-tools" role="toolbar" aria-label="Tools" aria-orientation="vertical">
          {TOOLS.map(([id, label, key, icon]) => (
            <button
              key={id}
              className={`tool ${tool === id ? 'on' : ''}`}
              aria-pressed={tool === id}
              onClick={() => {
                setTool(id)
                setDraft(null)
                if (id !== 'crop') setCrop(null)
                if (id === 'crop' && !crop && doc) setCrop({ x: 0, y: 0, w: W, h: H })
              }}
              title={`${label} (${key})`}
              aria-label={`${label} (${key})`}
            >
              <span aria-hidden="true">{icon}</span>
            </button>
          ))}
        </div>

        <div className="editor-stage">
          <div ref={viewportRef} className="editor-viewport" onScroll={drawMinimap}>
            {!doc && <div className="skeleton" style={{ width: 480, height: 300 }} />}
            {doc && (
              <div
                className="editor-canvas-wrap"
                style={{
                  width: W * zoom,
                  height: H * zoom,
                  transform: straighten ? `rotate(${straighten}deg)` : undefined,
                  borderRadius: frame.radius * zoom,
                  outline: frame.border ? `${frame.border * zoom}px solid ${frame.borderColor}` : undefined,
                  boxShadow: frame.shadow ? `0 ${(frame.shadow / 3) * zoom}px ${frame.shadow * zoom}px ${frame.shadowColor}` : undefined,
                }}
              >
                <canvas
                  ref={displayRef}
                  className="editor-canvas"
                  style={{ width: W * zoom, height: H * zoom, imageRendering: zoom >= 4 ? 'pixelated' : 'auto' }}
                />
                <canvas
                  ref={overlayRef}
                  className="editor-canvas ink-overlay"
                  style={{ width: W * zoom, height: H * zoom, cursor: cursorCss, touchAction: 'none' }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onPointerLeave={() => setCursor(null)}
                  onDoubleClick={onDoubleClick}
                  aria-label="Image canvas"
                  role="img"
                />
                {gridOn && <div className="pixel-grid" style={{ backgroundSize: `${zoom}px ${zoom}px` }} aria-hidden="true" />}
                {showOriginal && initialBase && (
                  <img
                    className="editor-original"
                    src={shot.originalUrl || shot.url}
                    alt="Original"
                    style={{ width: W * zoom, height: H * zoom, objectFit: 'contain' }}
                  />
                )}
                {textEdit && (
                  <textarea
                    className="text-edit"
                    ref={(el) => el && document.activeElement !== el && requestAnimationFrame(() => el.focus())}
                    value={textEdit.value}
                    onChange={(e) => setTextEdit((t) => ({ ...t, value: e.target.value }))}
                    onBlur={commitText}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        commitText()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation()
                        setTextEdit(null)
                      }
                    }}
                    style={{ left: textEdit.x * zoom, top: textEdit.y * zoom, font: fontOf({ ...opt, size: opt.textSize * zoom }), color: opt.color }}
                    aria-label="Text"
                    placeholder="Type, Enter to finish"
                  />
                )}
              </div>
            )}
          </div>
          {doc && (W * zoom > (viewportRef.current?.clientWidth || 0) || H * zoom > (viewportRef.current?.clientHeight || 0)) && (
            <canvas
              ref={miniRef}
              className="minimap"
              aria-label="Navigator"
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                const vp = viewportRef.current
                vp.scrollLeft = ((e.clientX - r.left) / r.width) * W * zoom - vp.clientWidth / 2
                vp.scrollTop = ((e.clientY - r.top) / r.height) * H * zoom - vp.clientHeight / 2
              }}
            />
          )}
          <div className="editor-status" aria-live="off">
            <span>
              {W} × {H}px
            </span>
            {cursor && (
              <span>
                x {cursor.x} · y {cursor.y}
              </span>
            )}
            <span>{TOOLS.find((t) => t[0] === tool)?.[1]}</span>
            {tool === 'polygon' && <span>Click to add points, double-click or Enter to finish</span>}
            {tool === 'crop' && <span>Drag handles, Enter to apply</span>}
            {tool === 'region' && <span>Drag a region, then Ctrl/⌘+C and Ctrl/⌘+V</span>}
            <span className="muted">Space+drag to pan · Ctrl/⌘+scroll to zoom</span>
          </div>
        </div>

        <aside className="editor-side">
          <div className="tabs small" role="tablist">
            {[
              ['tool', 'Tool'],
              ['adjust', 'Adjust'],
              ['transform', 'Transform'],
              ['export', 'Export'],
              ['history', 'History'],
            ].map(([id, l]) => (
              <button key={id} role="tab" aria-selected={sideTab === id} className={`tab ${sideTab === id ? 'on' : ''}`} onClick={() => setSideTab(id)}>
                {l}
              </button>
            ))}
          </div>
          <div className="side-body">
            {sideTab === 'tool' && (
              <div className="stack">
                {sel && tool === 'select' && (
                  <fieldset>
                    <legend>Selected {sel.type}</legend>
                    {'color' in sel && (
                      <label className="inline">
                        Color <input type="color" value={sel.color || '#000000'} onChange={(e) => updateSel({ color: e.target.value })} />
                      </label>
                    )}
                    {sel.type === 'text' && <Slider label="Font size" value={sel.size} min={8} max={300} onChange={(v) => updateSel({ size: v })} />}
                    {sel.opacity != null && (
                      <Slider
                        label="Opacity"
                        value={Math.round((sel.opacity ?? 1) * 100)}
                        min={5}
                        max={100}
                        unit="%"
                        onChange={(v) => updateSel({ opacity: v / 100 })}
                      />
                    )}
                    <div className="row gap-s wrap">
                      <button
                        className="btn secondary sm"
                        onClick={() => {
                          const i = doc.objects.findIndex((o) => o.id === selId)
                          const arr = [...doc.objects]
                          const [o] = arr.splice(i, 1)
                          arr.push(o)
                          commit('Bring to front', { objects: arr })
                        }}
                      >
                        To front
                      </button>
                      <button
                        className="btn secondary sm"
                        onClick={() => {
                          const i = doc.objects.findIndex((o) => o.id === selId)
                          const arr = [...doc.objects]
                          const [o] = arr.splice(i, 1)
                          arr.unshift(o)
                          commit('Send to back', { objects: arr })
                        }}
                      >
                        To back
                      </button>
                      <button
                        className="btn secondary sm"
                        onClick={() => {
                          const c = { ...translateObject(sel, 20, 20), id: uid() }
                          commit('Duplicate', { objects: [...doc.objects, c] })
                          setSelId(c.id)
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        className="btn secondary sm danger-text"
                        onClick={() => {
                          commit('Delete', { objects: doc.objects.filter((o) => o.id !== selId) })
                          setSelId(null)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </fieldset>
                )}
                <div className="color-row">
                  <label className="inline">
                    Color <input type="color" value={opt.color} onChange={(e) => setOpt((o) => ({ ...o, color: e.target.value }))} aria-label="Stroke color" />
                  </label>
                  <div className="swatches" role="group" aria-label="Palette">
                    {palette.map((c) => (
                      <button
                        key={c}
                        className="sw"
                        style={{ background: c }}
                        onClick={() => setOpt((o) => ({ ...o, color: c }))}
                        aria-label={`Use ${c}`}
                        title={c}
                      />
                    ))}
                    <button
                      className="sw add"
                      onClick={() => {
                        const next = [...new Set([...palette, opt.color])].slice(-16)
                        setPalette(next)
                        ls.set('fc.palette', next)
                      }}
                      aria-label="Add current color to palette"
                      title="Add to palette"
                    >
                      ＋
                    </button>
                  </div>
                  {recentColors.length > 0 && (
                    <div className="swatches" role="group" aria-label="Recent colors">
                      <small className="muted">Recent</small>
                      {recentColors.map((c) => (
                        <button
                          key={c}
                          className="sw"
                          style={{ background: c }}
                          onClick={() => setOpt((o) => ({ ...o, color: c }))}
                          aria-label={`Use recent ${c}`}
                          title={c}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <Slider label="Size" value={opt.size} min={1} max={80} onChange={(v) => setOpt((o) => ({ ...o, size: v }))} />
                <Slider
                  label="Opacity"
                  value={Math.round(opt.opacity * 100)}
                  min={5}
                  max={100}
                  unit="%"
                  onChange={(v) => setOpt((o) => ({ ...o, opacity: v / 100 }))}
                />
                {['pen', 'highlighter'].includes(tool) && (
                  <>
                    <Slider
                      label="Hardness"
                      value={Math.round(opt.hardness * 100)}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(v) => setOpt((o) => ({ ...o, hardness: v / 100 }))}
                    />
                    <Slider label="Smoothing" value={opt.smoothing} min={0} max={10} onChange={(v) => setOpt((o) => ({ ...o, smoothing: v }))} />
                    <label className="inline check">
                      <input type="checkbox" checked={opt.pressure} onChange={(e) => setOpt((o) => ({ ...o, pressure: e.target.checked }))} /> Stylus pressure
                    </label>
                  </>
                )}
                {['rect', 'ellipse', 'polygon'].includes(tool) && (
                  <label className="inline check">
                    <input type="checkbox" checked={opt.fill} onChange={(e) => setOpt((o) => ({ ...o, fill: e.target.checked }))} /> Fill{' '}
                    <input type="color" value={opt.fillColor} onChange={(e) => setOpt((o) => ({ ...o, fillColor: e.target.value }))} aria-label="Fill color" />
                  </label>
                )}
                {tool === 'text' && (
                  <fieldset>
                    <legend>Text</legend>
                    <label className="field">
                      Font{' '}
                      <select value={opt.font} onChange={(e) => setOpt((o) => ({ ...o, font: e.target.value }))}>
                        {FONTS.map(([f, l]) => (
                          <option key={f} value={f}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Slider label="Font size" value={opt.textSize} min={8} max={300} onChange={(v) => setOpt((o) => ({ ...o, textSize: v }))} />
                    <label className="field">
                      Weight{' '}
                      <select value={opt.weight} onChange={(e) => setOpt((o) => ({ ...o, weight: +e.target.value }))}>
                        {[400, 600, 700, 900].map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Align{' '}
                      <select value={opt.align} onChange={(e) => setOpt((o) => ({ ...o, align: e.target.value }))}>
                        <option>left</option>
                        <option>center</option>
                        <option>right</option>
                      </select>
                    </label>
                    <label className="inline check">
                      <input type="checkbox" checked={opt.useOutline} onChange={(e) => setOpt((o) => ({ ...o, useOutline: e.target.checked }))} /> Outline{' '}
                      <input type="color" value={opt.outline} onChange={(e) => setOpt((o) => ({ ...o, outline: e.target.value }))} aria-label="Outline color" />
                    </label>
                    <label className="inline check">
                      <input type="checkbox" checked={opt.useBg} onChange={(e) => setOpt((o) => ({ ...o, useBg: e.target.checked }))} /> Background box{' '}
                      <input
                        type="color"
                        value={opt.textBg}
                        onChange={(e) => setOpt((o) => ({ ...o, textBg: e.target.value }))}
                        aria-label="Background color"
                      />
                    </label>
                    <small className="muted">Click the image to type. Double-click text (Select tool) to edit.</small>
                  </fieldset>
                )}
                {tool === 'emoji' && (
                  <div className="emoji-grid" role="group" aria-label="Stickers">
                    {EMOJIS.map((em) => (
                      <button
                        key={em}
                        className={`emoji ${opt.emoji === em ? 'on' : ''}`}
                        onClick={() => setOpt((o) => ({ ...o, emoji: em }))}
                        aria-label={`Sticker ${em}`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
                {['pixelate', 'blur'].includes(tool) && (
                  <Slider label="Strength" value={opt.redact} min={4} max={60} onChange={(v) => setOpt((o) => ({ ...o, redact: v }))} />
                )}
                {tool === 'spotlight' && (
                  <>
                    <Slider
                      label="Dim"
                      value={Math.round(opt.spot * 100)}
                      min={10}
                      max={95}
                      unit="%"
                      onChange={(v) => setOpt((o) => ({ ...o, spot: v / 100 }))}
                    />
                    <label className="field">
                      Shape{' '}
                      <select value={opt.spotShape} onChange={(e) => setOpt((o) => ({ ...o, spotShape: e.target.value }))}>
                        <option value="rect">Rectangle</option>
                        <option value="ellipse">Ellipse</option>
                      </select>
                    </label>
                  </>
                )}
                {tool === 'fill' && (
                  <Slider label="Tolerance" value={opt.tolerance} min={0} max={120} onChange={(v) => setOpt((o) => ({ ...o, tolerance: v }))} />
                )}
                {tool === 'region' && (
                  <div className="row gap-s wrap">
                    <button className="btn secondary sm" onClick={copyRegion}>
                      Copy {region?.w > 2 ? 'region' : 'whole image'}
                    </button>
                    <button
                      className="btn secondary sm"
                      disabled={!clipboard.current}
                      onClick={() => pasteCanvas(clipboard.current.canvas, clipboard.current.x + 20, clipboard.current.y + 20)}
                    >
                      Paste
                    </button>
                  </div>
                )}
                {tool === 'crop' && (
                  <fieldset>
                    <legend>Crop</legend>
                    <div className="seg wrap" role="group" aria-label="Aspect ratio">
                      {ASPECTS.map(([id, l]) => (
                        <button
                          key={id}
                          className={`seg-btn ${opt.aspect === id ? 'on' : ''}`}
                          onClick={() => {
                            setOpt((o) => ({ ...o, aspect: id }))
                            const ar = ASPECTS.find((a) => a[0] === id)[2]
                            if (ar) {
                              let w = W,
                                h = W / ar
                              if (h > H) {
                                h = H
                                w = H * ar
                              }
                              setCrop({ x: (W - w) / 2, y: (H - h) / 2, w, h })
                            }
                          }}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    <div className="row gap-s">
                      <button className="btn sm" onClick={applyCrop} disabled={!crop}>
                        Apply crop
                      </button>
                      <button className="btn secondary sm" onClick={() => setCrop(null)}>
                        Cancel
                      </button>
                    </div>
                  </fieldset>
                )}
              </div>
            )}
            {sideTab === 'adjust' && doc && (
              <div className="stack" onPointerUp={commitAdj} onKeyUp={commitAdj}>
                {[
                  ['exposure', 'Exposure', -3, 3, 0.05],
                  ['brightness', 'Brightness', 0, 200, 1],
                  ['contrast', 'Contrast', 0, 200, 1],
                  ['saturate', 'Saturation', 0, 300, 1],
                  ['vibrance', 'Vibrance', -100, 100, 1],
                  ['hue', 'Hue', -180, 180, 1],
                  ['temperature', 'Temperature', -100, 100, 1],
                  ['sharpen', 'Sharpness', 0, 100, 1],
                ].map(([k, l, mn, mx, st]) => (
                  <Slider key={k} label={l} value={doc.adj[k]} min={mn} max={mx} step={st} def={DEFAULT_ADJ[k]} onChange={(val) => setAdj(k, val)} />
                ))}
                <button className="btn secondary sm" onClick={() => commit('Reset adjustments', { adj: { ...DEFAULT_ADJ } })}>
                  Reset adjustments
                </button>
                <small className="muted">Adjustments stay editable until you save; crops and drawings never bake them in.</small>
              </div>
            )}
            {sideTab === 'transform' && doc && (
              <div className="stack">
                <div className="row gap-s wrap">
                  <button
                    className="btn secondary sm"
                    onClick={() => applyGeometry('Rotate left', (d) => geometry.rotate90(d, -1), { type: 'rotate90', dir: -1 })}
                  >
                    ⟲ 90°
                  </button>
                  <button
                    className="btn secondary sm"
                    onClick={() => applyGeometry('Rotate right', (d) => geometry.rotate90(d, 1), { type: 'rotate90', dir: 1 })}
                  >
                    ⟳ 90°
                  </button>
                  <button
                    className="btn secondary sm"
                    onClick={() => applyGeometry('Flip horizontal', (d) => geometry.flip(d, 'h'), { type: 'flip', axis: 'h' })}
                  >
                    Flip ↔
                  </button>
                  <button
                    className="btn secondary sm"
                    onClick={() => applyGeometry('Flip vertical', (d) => geometry.flip(d, 'v'), { type: 'flip', axis: 'v' })}
                  >
                    Flip ↕
                  </button>
                </div>
                <fieldset>
                  <legend>Straighten</legend>
                  <Slider label="Angle" value={straighten} min={-45} max={45} step={0.1} unit="°" def={0} onChange={setStraighten} />
                  <button
                    className="btn secondary sm"
                    disabled={!straighten}
                    onClick={() => {
                      const a = straighten
                      setStraighten(0)
                      applyGeometry('Straighten', (d) => geometry.straighten(d, a), { type: 'straighten', deg: a })
                    }}
                  >
                    Apply (auto-crops edges)
                  </button>
                </fieldset>
                <fieldset>
                  <legend>Resize</legend>
                  <div className="grid2">
                    <label className="field">
                      Width{' '}
                      <input
                        type="number"
                        className="num"
                        min="1"
                        max="16000"
                        value={resize.w}
                        onChange={(e) => {
                          const w = Math.max(1, +e.target.value || 1)
                          setResize((r) => ({ ...r, w, h: r.lock ? Math.round((w * H) / W) : r.h }))
                        }}
                      />
                    </label>
                    <label className="field">
                      Height{' '}
                      <input
                        type="number"
                        className="num"
                        min="1"
                        max="16000"
                        value={resize.h}
                        onChange={(e) => {
                          const h = Math.max(1, +e.target.value || 1)
                          setResize((r) => ({ ...r, h, w: r.lock ? Math.round((h * W) / H) : r.w }))
                        }}
                      />
                    </label>
                  </div>
                  <label className="inline check">
                    <input type="checkbox" checked={resize.lock} onChange={(e) => setResize((r) => ({ ...r, lock: e.target.checked }))} /> Lock aspect ratio
                  </label>
                  <label className="field">
                    Resampling{' '}
                    <select value={resize.quality} onChange={(e) => setResize((r) => ({ ...r, quality: e.target.value }))}>
                      <option value="high">High quality</option>
                      <option value="medium">Medium</option>
                      <option value="low">Fast</option>
                      <option value="pixelated">Nearest neighbor (pixel art)</option>
                    </select>
                  </label>
                  <button
                    className="btn secondary sm"
                    disabled={resize.w === W && resize.h === H}
                    onClick={() =>
                      applyGeometry('Resize', (d) => geometry.resize(d, resize.w, resize.h, resize.quality), {
                        type: 'resize',
                        sx: resize.w / W,
                        sy: resize.h / H,
                        quality: resize.quality,
                      })
                    }
                  >
                    Apply resize
                  </button>
                </fieldset>
                <fieldset>
                  <legend>Expand canvas</legend>
                  <div className="grid2">
                    <label className="field">
                      Padding (px){' '}
                      <input
                        type="number"
                        className="num"
                        min="1"
                        max="2000"
                        value={pad.px}
                        onChange={(e) => setPad((p) => ({ ...p, px: Math.max(1, +e.target.value || 1) }))}
                      />
                    </label>
                    <label className="field">
                      Color <input type="color" value={pad.color} onChange={(e) => setPad((p) => ({ ...p, color: e.target.value }))} />
                    </label>
                  </div>
                  <button
                    className="btn secondary sm"
                    onClick={() =>
                      applyGeometry('Pad', (d) => geometry.pad(d, pad.px, pad.color), { type: 'pad', frac: pad.px / Math.max(W, H), color: pad.color })
                    }
                  >
                    Add padding
                  </button>
                </fieldset>
                <fieldset>
                  <legend>Polish (applied on save)</legend>
                  <Slider label="Border" value={frame.border} min={0} max={120} unit="px" def={0} onChange={(v) => setFrame((f) => ({ ...f, border: v }))} />
                  {frame.border > 0 && (
                    <label className="inline">
                      Border color <input type="color" value={frame.borderColor} onChange={(e) => setFrame((f) => ({ ...f, borderColor: e.target.value }))} />
                    </label>
                  )}
                  <Slider
                    label="Corner radius"
                    value={frame.radius}
                    min={0}
                    max={300}
                    unit="px"
                    def={0}
                    onChange={(v) => setFrame((f) => ({ ...f, radius: v }))}
                  />
                  <Slider
                    label="Drop shadow"
                    value={frame.shadow}
                    min={0}
                    max={120}
                    unit="px"
                    def={0}
                    onChange={(v) => setFrame((f) => ({ ...f, shadow: v }))}
                  />
                  {frame.shadow > 0 && (
                    <label className="inline">
                      Background <input type="color" value={frame.background} onChange={(e) => setFrame((f) => ({ ...f, background: e.target.value }))} />{' '}
                      <button className="btn secondary sm" onClick={() => setFrame((f) => ({ ...f, background: 'transparent' }))}>
                        Transparent
                      </button>
                    </label>
                  )}
                </fieldset>
                {otherSelected > 0 && (
                  <fieldset>
                    <legend>Batch edit</legend>
                    <p className="muted small">
                      Replays this edit’s adjustments, crop, rotation, flips, resize, padding and polish on the other {otherSelected} selected frame
                      {otherSelected > 1 ? 's' : ''}.
                    </p>
                    <button className="btn secondary sm" onClick={applyToSelected}>
                      Apply to {otherSelected} selected
                    </button>
                  </fieldset>
                )}
              </div>
            )}
            {sideTab === 'export' && (
              <div className="stack">
                <label className="field">
                  Format{' '}
                  <select value={saveAs.type} onChange={(e) => setSaveAs((s) => ({ ...s, type: e.target.value }))}>
                    <option value="image/png">PNG</option>
                    <option value="image/jpeg">JPEG</option>
                    <option value="image/webp">WebP</option>
                  </select>
                </label>
                {saveAs.type !== 'image/png' && (
                  <Slider
                    label="Quality"
                    value={Math.round(saveAs.quality * 100)}
                    min={30}
                    max={100}
                    unit="%"
                    onChange={(v) => setSaveAs((s) => ({ ...s, quality: v / 100 }))}
                  />
                )}
                <div className="row gap-s wrap">
                  <button className="btn secondary sm" onClick={downloadAs}>
                    Download as…
                  </button>
                  <button className="btn secondary sm" onClick={saveAsNew}>
                    Save as new frame
                  </button>
                  <button className="btn secondary sm" onClick={copyImage}>
                    Copy to clipboard
                  </button>
                </div>
              </div>
            )}
            {sideTab === 'history' && (
              <ol className="history">
                {hist.list.map((h, i) => (
                  <li key={i}>
                    <button className={`link ${i === hist.index ? 'on' : ''} ${i > hist.index ? 'future' : ''}`} onClick={() => goto(i)}>
                      {h.label}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  )
}

function cropHandles(c) {
  return [
    [c.x, c.y],
    [c.x + c.w, c.y],
    [c.x + c.w, c.y + c.h],
    [c.x, c.y + c.h],
    [c.x + c.w / 2, c.y],
    [c.x + c.w, c.y + c.h / 2],
    [c.x + c.w / 2, c.y + c.h],
    [c.x, c.y + c.h / 2],
  ]
}

// Re-export for tests
export { drawObject }
