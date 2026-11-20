import React, { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import { CONTENT_TYPES, TARGETS, planUpscale, previewCrop } from '../lib/upscalePlan'
import { aiBackend, enhanceCanvas } from '../lib/enhanceClient'

const PREVIEW_PX = 320

function cropCanvas(src, r) {
  const c = document.createElement('canvas')
  c.width = r.w
  c.height = r.h
  c.getContext('2d').drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
  return c
}

/**
 * Upscale options with a before/after preview on a center crop.
 * getCanvas(): Promise<HTMLCanvasElement> for the image to preview.
 * onApply({ ops, label, signal, onProgress }): Promise, runs the real job.
 */
export default function UpscaleDialog({ width, height, count = 1, getCanvas, onApply, onClose }) {
  const [method, setMethod] = useState('smart')
  const [content, setContent] = useState('photo')
  const [targetId, setTargetId] = useState('x2')
  const [preview, setPreview] = useState({ state: 'idle' })
  const [split, setSplit] = useState(50)
  const [run, setRun] = useState(null) // { p, label }
  const ctl = useRef(null)
  const previewCtl = useRef(null)
  const srcRef = useRef(null)

  const target = TARGETS.find((t) => t.id === targetId)
  const plan = useMemo(() => planUpscale({ width, height, method, content, target }), [width, height, method, content, target])

  async function makePreview() {
    if (plan.error) return
    previewCtl.current?.abort()
    const ac = new AbortController()
    previewCtl.current = ac
    setPreview({ state: 'busy', p: 0 })
    try {
      srcRef.current = srcRef.current || (await getCanvas())
      const crop = previewCrop(srcRef.current.width, srcRef.current.height)
      const small = cropCanvas(srcRef.current, crop)
      const cropPlan = planUpscale({ width: crop.w, height: crop.h, method, content, target: { scale: plan.outW / width } })
      if (cropPlan.error) throw new Error(cropPlan.error)
      const out = await enhanceCanvas(small, cropPlan.ops, (p) => !ac.signal.aborted && setPreview({ state: 'busy', p }), ac.signal)
      if (ac.signal.aborted) return
      setPreview({ state: 'ready', before: small.toDataURL('image/png'), after: out.toDataURL('image/png'), backend: method === 'ai' ? aiBackend() : '' })
    } catch (e) {
      if (e?.name !== 'AbortError') setPreview({ state: 'error', message: e.message })
    }
  }

  // Smart previews are instant, so they follow the options. AI previews run on request.
  useEffect(() => {
    previewCtl.current?.abort()
    if (method === 'smart' && !plan.error) {
      const id = setTimeout(makePreview, 250)
      return () => clearTimeout(id)
    }
    setPreview({ state: 'idle' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, content, targetId, plan.error])

  useEffect(() => () => previewCtl.current?.abort(), [])

  async function apply() {
    if (plan.error) return
    const ac = new AbortController()
    ctl.current = ac
    const label = `${method === 'ai' ? 'AI' : 'Smart'} upscale to ${plan.outW}×${plan.outH}`
    setRun({ p: 0, label })
    try {
      await onApply({ ops: plan.ops, label, signal: ac.signal, onProgress: (p) => setRun({ p, label }) })
      onClose()
    } catch (e) {
      if (e?.name !== 'AbortError') setPreview({ state: 'error', message: e.message })
      setRun(null)
    }
  }

  const running = !!run
  return (
    <Modal
      title={count > 1 ? `Upscale ${count} frames` : 'Upscale'}
      onClose={() => (running ? ctl.current?.abort() : onClose())}
      size="lg"
      className="upscale-dialog"
    >
      <div className="stack">
        <fieldset disabled={running}>
          <legend>What is it?</legend>
          <div className="seg" role="radiogroup" aria-label="Content type">
            {Object.entries(CONTENT_TYPES).map(([id, c]) => (
              <button
                key={id}
                role="radio"
                aria-checked={content === id}
                className={`seg-btn ${content === id ? 'on' : ''}`}
                onClick={() => setContent(id)}
                title={c.hint}
              >
                {c.label}
              </button>
            ))}
          </div>
          <small className="muted">{CONTENT_TYPES[content].hint}</small>
        </fieldset>
        <fieldset disabled={running}>
          <legend>Method</legend>
          <div className="seg" role="radiogroup" aria-label="Method">
            <button role="radio" aria-checked={method === 'smart'} className={`seg-btn ${method === 'smart' ? 'on' : ''}`} onClick={() => setMethod('smart')}>
              Smart (fast)
            </button>
            <button role="radio" aria-checked={method === 'ai'} className={`seg-btn ${method === 'ai' ? 'on' : ''}`} onClick={() => setMethod('ai')}>
              AI (rebuilds detail)
            </button>
          </div>
        </fieldset>
        <fieldset disabled={running}>
          <legend>Size</legend>
          <div className="seg" role="radiogroup" aria-label="Target size">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={targetId === t.id}
                className={`seg-btn ${targetId === t.id ? 'on' : ''}`}
                onClick={() => setTargetId(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        {plan.error ? (
          <p className="warn" role="alert">
            {plan.error}
          </p>
        ) : (
          <p className="small">
            <strong>
              {width}×{height} → {plan.outW}×{plan.outH}
            </strong>{' '}
            <span className="muted">
              ({((plan.outW * plan.outH) / 1e6).toFixed(1)} MP) · {plan.steps.join(' → ')}
            </span>
          </p>
        )}
        {plan.warnings.map((w) => (
          <p key={w} className="warn small">
            {w}
          </p>
        ))}

        <div className="upscale-preview" aria-label="Before and after preview">
          {preview.state === 'ready' ? (
            <>
              <div className="cmp" style={{ width: PREVIEW_PX, height: PREVIEW_PX }}>
                <img src={preview.before} alt="Before" style={{ imageRendering: 'pixelated' }} />
                <img src={preview.after} alt="After" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
                <span className="cmp-line" style={{ left: `${split}%` }} />
                <span className="cmp-tag l">Before</span>
                <span className="cmp-tag r">After</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={split}
                onChange={(e) => setSplit(+e.target.value)}
                aria-label="Before and after split"
                style={{ width: PREVIEW_PX }}
              />
              <small className="muted">Center crop of the image{preview.backend ? ` · AI ran on ${preview.backend}` : ''}.</small>
            </>
          ) : preview.state === 'busy' ? (
            <div className="cmp empty" style={{ width: PREVIEW_PX, height: 120 }}>
              <progress max="1" value={preview.p || 0} /> <span className="muted small">Previewing…</span>
            </div>
          ) : preview.state === 'error' ? (
            <p className="warn small" role="alert">
              {preview.message}
            </p>
          ) : (
            <button className="btn secondary" onClick={makePreview} disabled={!!plan.error || running}>
              Preview on a small crop
            </button>
          )}
        </div>

        <div className="row wrap gap-s">
          <button className="btn" onClick={apply} disabled={!!plan.error || running}>
            {count > 1 ? `Upscale ${count} frames` : 'Upscale'}
          </button>
          {running && (
            <>
              <progress max="1" value={run.p} />
              <span className="muted small">{Math.round(run.p * 100)}%</span>
              <button className="btn secondary sm" onClick={() => ctl.current?.abort()}>
                Cancel
              </button>
            </>
          )}
          {!running && (
            <button className="btn secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <small className="muted">Everything runs in your browser; nothing is uploaded. The original is kept, so each frame can be reverted.</small>
      </div>
    </Modal>
  )
}
