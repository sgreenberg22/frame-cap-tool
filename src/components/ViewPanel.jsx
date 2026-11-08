import React from 'react'
import Slider from './Slider'
import { VIEW_MODES } from '../lib/filters'

export default function ViewPanel({
  view,
  setView,
  overlays,
  setOverlays,
  setRotate,
  flipH,
  setFlipH,
  flipV,
  setFlipV,
  roi,
  setRoi,
  tool,
  setTool,
  onDetectBars,
  onion,
  setOnion,
  measure,
  clearMeasure,
  onCaptions,
  captionsName,
  clearCaptions,
  onCompare,
  comparing,
  stopCompare,
  onZoomReset,
  onActualPixels,
  showScopes,
  setShowScopes,
  disabled,
  live,
}) {
  const toggleTool = (t) => setTool(tool === t ? 'none' : t)
  return (
    <div className="stack">
      <fieldset>
        <legend>Guides</legend>
        <div className="row wrap gap">
          <label className="inline check">
            <input type="checkbox" checked={overlays.thirds} onChange={(e) => setOverlays((o) => ({ ...o, thirds: e.target.checked }))} /> Rule of thirds (G)
          </label>
          <label className="inline check">
            <input type="checkbox" checked={overlays.crosshair} onChange={(e) => setOverlays((o) => ({ ...o, crosshair: e.target.checked }))} /> Center cross
          </label>
          <label className="inline check">
            <input type="checkbox" checked={overlays.safe} onChange={(e) => setOverlays((o) => ({ ...o, safe: e.target.checked }))} /> Safe areas
          </label>
        </div>
        <Slider label="Grid divisions" value={overlays.grid} min={0} max={16} def={0} onChange={(v) => setOverlays((o) => ({ ...o, grid: v }))} />
      </fieldset>
      <fieldset>
        <legend>Analysis view (preview only)</legend>
        <select value={view} onChange={(e) => setView(e.target.value)} aria-label="Analysis view mode">
          {VIEW_MODES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <label className="inline check">
          <input type="checkbox" checked={showScopes} onChange={(e) => setShowScopes(e.target.checked)} /> Show histogram and waveform scopes
        </label>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Transform (applies to captures)</legend>
        <div className="row wrap gap-s">
          <button className="btn secondary sm" onClick={() => setRotate((r) => (r + 270) % 360)} title="Rotate left">
            ⟲ 90°
          </button>
          <button className="btn secondary sm" onClick={() => setRotate((r) => (r + 90) % 360)} title="Rotate right">
            ⟳ 90°
          </button>
          <button className={`btn secondary sm ${flipH ? 'active' : ''}`} aria-pressed={flipH} onClick={() => setFlipH(!flipH)}>
            Flip ↔
          </button>
          <button className={`btn secondary sm ${flipV ? 'active' : ''}`} aria-pressed={flipV} onClick={() => setFlipV(!flipV)}>
            Flip ↕
          </button>
          <button className="btn secondary sm" onClick={onZoomReset} title="Reset zoom (0)">
            Fit view
          </button>
          <button className="btn secondary sm" onClick={onActualPixels} title="Show the video at 1:1 pixels">
            100% pixels
          </button>
        </div>
        <div className="row wrap gap-s">
          <button className={`btn secondary sm ${tool === 'roi' ? 'active' : ''}`} aria-pressed={tool === 'roi'} onClick={() => toggleTool('roi')}>
            Draw crop region
          </button>
          <button className="btn secondary sm" onClick={onDetectBars} title="Detect letterbox / pillarbox bars and crop them">
            Trim black bars
          </button>
          {roi && (
            <button className="btn secondary sm" onClick={() => setRoi(null)}>
              Clear crop ({Math.round(roi.w * 100)}% × {Math.round(roi.h * 100)}%)
            </button>
          )}
        </div>
        <small className="muted">Zoom with Ctrl/⌘ + scroll or pinch; drag to pan when zoomed.</small>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Tools</legend>
        <div className="row wrap gap-s">
          <button
            className={`btn secondary sm ${tool === 'inspect' ? 'active' : ''}`}
            aria-pressed={tool === 'inspect'}
            onClick={() => toggleTool('inspect')}
            title="Hover to read colors, click to copy HEX"
          >
            Pixel inspector
          </button>
          <button
            className={`btn secondary sm ${tool === 'calibrate' ? 'active' : ''}`}
            aria-pressed={tool === 'calibrate'}
            onClick={() => toggleTool('calibrate')}
            title="Draw a line over something of known length"
          >
            Set scale
          </button>
          <button className={`btn secondary sm ${tool === 'measure' ? 'active' : ''}`} aria-pressed={tool === 'measure'} onClick={() => toggleTool('measure')}>
            Measure
          </button>
          {measure.lines.length > 0 && (
            <button className="btn secondary sm" onClick={clearMeasure}>
              Clear lines
            </button>
          )}
        </div>
        {measure.results.length > 0 && (
          <ul className="measure-list">
            {measure.results.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Onion skin</legend>
        <label className="inline check">
          <input type="checkbox" checked={onion.enabled} onChange={(e) => setOnion((o) => ({ ...o, enabled: e.target.checked }))} /> Overlay the last captured
          frame
        </label>
        {onion.enabled && (
          <Slider
            label="Opacity"
            value={Math.round(onion.opacity * 100)}
            min={5}
            max={95}
            unit="%"
            def={40}
            onChange={(v) => setOnion((o) => ({ ...o, opacity: v / 100 }))}
          />
        )}
      </fieldset>
      <fieldset disabled={disabled || live}>
        <legend>Subtitles and compare</legend>
        <div className="row wrap gap-s">
          <label className="btn secondary sm file">
            Load .vtt / .srt
            <input type="file" accept=".vtt,.srt,text/vtt" onChange={(e) => onCaptions(e.target.files?.[0])} />
          </label>
          {captionsName && (
            <button className="btn secondary sm" onClick={clearCaptions}>
              Remove “{captionsName}”
            </button>
          )}
          {!comparing ? (
            <label className="btn secondary sm file">
              Compare with another video…
              <input type="file" accept="video/*" onChange={(e) => onCompare(e.target.files?.[0])} />
            </label>
          ) : (
            <button className="btn secondary sm" onClick={stopCompare}>
              Close compare
            </button>
          )}
        </div>
      </fieldset>
    </div>
  )
}
