import React, { useMemo } from 'react'
import Slider from './Slider'
import { LIMITS } from '../lib/config'
import { planBatch, toInt } from '../lib/batch'
import { formatClock } from '../lib/timecode'
import { useApp } from '../state/store'

const MODES = [
  ['interval', 'Every N ms'],
  ['frames', 'Every N frames'],
  ['spread', 'N evenly spaced'],
  ['range', 'In → out at interval'],
  ['scene', 'On scene change'],
  ['sharpest', 'Sharpest frame in range'],
]
const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']

export default function CapturePanel({
  batch,
  setBatch,
  duration,
  time,
  fps,
  inPoint,
  outPoint,
  progress,
  onContactSheet,
  audioTrigger,
  setAudioTrigger,
  audioLevel,
  live,
  disabled,
}) {
  const { settings, setSettings } = useApp()
  const s = settings
  const errors = {
    count: !(batch.count >= 1 && batch.count <= LIMITS.batchMaxCount),
    interval: !(batch.intervalMs >= LIMITS.batchMinIntervalMs && batch.intervalMs <= LIMITS.batchMaxIntervalMs),
  }
  const plan = useMemo(() => {
    if (['scene', 'sharpest'].includes(batch.mode)) return null
    const start = batch.mode === 'range' || batch.mode === 'spread' ? (inPoint ?? (batch.mode === 'spread' ? 0 : time)) : time
    const end = batch.mode === 'range' || batch.mode === 'spread' ? (outPoint ?? duration) : undefined
    return planBatch({ ...batch, start, end, duration, fps })
  }, [batch, time, duration, fps, inPoint, outPoint])

  return (
    <div className="stack">
      <fieldset>
        <legend>Image output</legend>
        <div className="grid2">
          <label className="field">
            Format
            <select value={s.imageFormat} onChange={(e) => setSettings({ imageFormat: e.target.value })}>
              <option value="image/png">PNG (lossless)</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/webp">WebP</option>
            </select>
          </label>
          <label className="field">
            Resolution
            <select value={s.captureScale} onChange={(e) => setSettings({ captureScale: e.target.value })}>
              <option value="native">Native video size</option>
              <option value="display">As displayed</option>
              <option value="custom">Custom scale</option>
            </select>
          </label>
        </div>
        {s.imageFormat !== 'image/png' && (
          <Slider
            label="Quality"
            value={Math.round(s.imageQuality * 100)}
            min={30}
            max={100}
            unit="%"
            def={92}
            onChange={(v) => setSettings({ imageQuality: v / 100 })}
          />
        )}
        {s.captureScale === 'custom' && (
          <Slider
            label="Scale"
            value={s.captureCustomScale}
            min={0.1}
            max={2}
            step={0.05}
            unit="×"
            def={1}
            onChange={(v) => setSettings({ captureCustomScale: v })}
          />
        )}
        <label className="inline check">
          <input type="checkbox" checked={s.bakeFilters} onChange={(e) => setSettings({ bakeFilters: e.target.checked })} /> Bake filters into captures
          (settings are saved with each frame either way)
        </label>
        <label className="field">
          File name template
          <input className="text" value={s.nameTemplate} onChange={(e) => setSettings({ nameTemplate: e.target.value })} aria-describedby="tpl-help" />
        </label>
        <small id="tpl-help" className="muted">
          Tokens: {'{video} {index} {timecode} {time} {date}'}
        </small>
      </fieldset>

      <fieldset>
        <legend>Burn-in</legend>
        <label className="inline check">
          <input type="checkbox" checked={s.burnTimestamp} onChange={(e) => setSettings({ burnTimestamp: e.target.checked })} /> Timestamp
        </label>
        {s.burnTimestamp && (
          <div className="grid2">
            <label className="field">
              Position
              <select value={s.burnPosition} onChange={(e) => setSettings({ burnPosition: e.target.value })}>
                {POSITIONS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Color <input type="color" value={s.burnColor} onChange={(e) => setSettings({ burnColor: e.target.value })} />
            </label>
            <Slider label="Size" value={s.burnSize} min={10} max={72} def={24} onChange={(v) => setSettings({ burnSize: v })} />
          </div>
        )}
        <label className="field">
          Watermark text
          <input
            className="text"
            value={s.watermarkText}
            placeholder="Optional, e.g. © you"
            onChange={(e) => setSettings({ watermarkText: e.target.value })}
            maxLength={80}
          />
        </label>
        {s.watermarkText && (
          <div className="grid2">
            <label className="field">
              Position
              <select value={s.watermarkPosition} onChange={(e) => setSettings({ watermarkPosition: e.target.value })}>
                {POSITIONS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <Slider
              label="Opacity"
              value={Math.round(s.watermarkOpacity * 100)}
              min={5}
              max={100}
              unit="%"
              def={50}
              onChange={(v) => setSettings({ watermarkOpacity: v / 100 })}
            />
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Feedback</legend>
        <div className="row wrap gap">
          <label className="inline check">
            <input type="checkbox" checked={s.flash} onChange={(e) => setSettings({ flash: e.target.checked })} /> Flash
          </label>
          <label className="inline check">
            <input type="checkbox" checked={s.shutterSound} onChange={(e) => setSettings({ shutterSound: e.target.checked })} /> Shutter sound
          </label>
          <label className="inline check">
            <input type="checkbox" checked={s.haptics} onChange={(e) => setSettings({ haptics: e.target.checked })} /> Vibrate (mobile)
          </label>
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Batch capture</legend>
        <label className="field">
          Mode
          <select value={batch.mode} onChange={(e) => setBatch((b) => ({ ...b, mode: e.target.value }))}>
            {MODES.map(([id, label]) => (
              <option key={id} value={id} disabled={live && id !== 'interval'}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {live && <small className="muted">Live sources capture in real time at the interval.</small>}
        <div className="grid2">
          {['interval', 'frames', 'spread', 'scene'].includes(batch.mode) && (
            <label className="field">
              {batch.mode === 'scene' ? 'Max shots' : 'Count'}
              <input
                type="number"
                className={`num ${errors.count ? 'invalid' : ''}`}
                min="1"
                max={LIMITS.batchMaxCount}
                value={batch.count}
                aria-invalid={errors.count}
                onChange={(e) => setBatch((b) => ({ ...b, count: toInt(e.target.value, 1, 1, LIMITS.batchMaxCount) }))}
              />
            </label>
          )}
          {['interval', 'range'].includes(batch.mode) && (
            <label className="field">
              Interval (ms)
              <input
                type="number"
                className={`num ${errors.interval ? 'invalid' : ''}`}
                min={LIMITS.batchMinIntervalMs}
                step="10"
                value={batch.intervalMs}
                aria-invalid={errors.interval}
                onChange={(e) => setBatch((b) => ({ ...b, intervalMs: toInt(e.target.value, 500, LIMITS.batchMinIntervalMs, LIMITS.batchMaxIntervalMs) }))}
              />
            </label>
          )}
          {batch.mode === 'frames' && (
            <label className="field">
              Every N frames
              <input
                type="number"
                className="num"
                min="1"
                max="10000"
                value={batch.everyFrames}
                onChange={(e) => setBatch((b) => ({ ...b, everyFrames: toInt(e.target.value, 10, 1, 10000) }))}
              />
            </label>
          )}
        </div>
        {batch.mode === 'scene' && (
          <Slider
            label="Scene threshold"
            value={batch.sceneThreshold}
            min={1}
            max={60}
            def={12}
            onChange={(v) => setBatch((b) => ({ ...b, sceneThreshold: v }))}
            hint="Higher = only big changes"
          />
        )}
        {batch.mode !== 'sharpest' && (
          <>
            <label className="inline check">
              <input type="checkbox" checked={batch.skipDuplicates} onChange={(e) => setBatch((b) => ({ ...b, skipDuplicates: e.target.checked }))} /> Skip
              near-identical frames
            </label>
            {batch.skipDuplicates && (
              <Slider
                label="Duplicate sensitivity"
                value={batch.dupThreshold}
                min={0.2}
                max={10}
                step={0.1}
                def={1.5}
                onChange={(v) => setBatch((b) => ({ ...b, dupThreshold: v }))}
              />
            )}
          </>
        )}
        {(batch.mode === 'spread' || batch.mode === 'range' || batch.mode === 'scene' || batch.mode === 'sharpest') && (
          <small className="muted">Uses the in/out range{inPoint == null && outPoint == null ? ' (none set: whole video)' : ''}.</small>
        )}
        {plan && (
          <details className="plan">
            <summary>
              Planned: {plan.length} shot{plan.length === 1 ? '' : 's'}
              {plan.length ? ` (${formatClock(plan[0])} → ${formatClock(plan[plan.length - 1])})` : ''}
            </summary>
            <p className="muted mono">
              {plan
                .slice(0, 60)
                .map((t) => formatClock(t))
                .join(' · ')}
              {plan.length > 60 ? ' …' : ''}
            </p>
          </details>
        )}
        {progress && (
          <div className="progress-wrap" aria-live="polite">
            <progress max="1" value={progress.p} />
            <span className="muted">
              {progress.label}
              {progress.eta != null ? ` · ~${Math.ceil(progress.eta)}s left` : ''}
            </span>
          </div>
        )}
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>More</legend>
        <div className="row wrap gap-s">
          <button className="btn secondary sm" onClick={onContactSheet} disabled={live}>
            Contact sheet…
          </button>
          <label className="inline check" title="Capture automatically when the audio gets loud">
            <input type="checkbox" checked={audioTrigger.enabled} onChange={(e) => setAudioTrigger((a) => ({ ...a, enabled: e.target.checked }))} /> Capture on
            loud audio
          </label>
        </div>
        {audioTrigger.enabled && (
          <>
            <Slider
              label="Loudness threshold"
              value={audioTrigger.threshold}
              min={1}
              max={100}
              def={40}
              onChange={(v) => setAudioTrigger((a) => ({ ...a, threshold: v }))}
            />
            <meter min="0" max="100" value={audioLevel} low={audioTrigger.threshold} high={audioTrigger.threshold} aria-label="Current audio level" />
          </>
        )}
      </fieldset>
    </div>
  )
}
