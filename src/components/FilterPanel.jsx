import React, { useState } from 'react'
import Slider from './Slider'
import CurveEditor from './CurveEditor'
import { DEFAULT_FILTERS, FILTER_FIELDS, FILTER_PRESETS, parseCube } from '../lib/filters'
import { ls } from '../lib/storage'
import { useApp } from '../state/store'

const GROUPS = [
  ['light', 'Light'],
  ['color', 'Color'],
  ['effects', 'Effects'],
  ['levels', 'Levels'],
]

export default function FilterPanel({ filters, setFilters, lut, setLut, onAuto, onPickWB, onHold, split, setSplit, disabled }) {
  const { toast } = useApp()
  const [custom, setCustom] = useState(() => ls.get('fc.presets', {}))
  const [presetName, setPresetName] = useState('')
  const [open, setOpen] = useState('light')
  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }))

  function savePreset(e) {
    e.preventDefault()
    const name = presetName.trim()
    if (!name) return
    const next = { ...custom, [name]: { ...filters, lutName: null } }
    setCustom(next)
    ls.set('fc.presets', next)
    setPresetName('')
    toast(`Saved preset “${name}”`)
  }
  function deletePreset(name) {
    const next = { ...custom }
    delete next[name]
    setCustom(next)
    ls.set('fc.presets', next)
  }
  async function copySettings() {
    const text = JSON.stringify({ framecaptureFilters: filters })
    try {
      await navigator.clipboard.writeText(text)
      toast('Filter settings copied')
    } catch {
      ls.set('fc.filterClipboard', filters)
      toast('Filter settings copied (in this browser)')
    }
  }
  async function pasteSettings() {
    let data = null
    try {
      const text = await navigator.clipboard.readText()
      data = JSON.parse(text)?.framecaptureFilters
    } catch {
      /* fall back */
    }
    data = data || ls.get('fc.filterClipboard', null)
    if (!data) return toast('Nothing to paste', { kind: 'warn' })
    setFilters({ ...DEFAULT_FILTERS, ...data })
    toast('Filter settings pasted')
  }
  async function loadLut(file) {
    if (!file) return
    try {
      const parsed = parseCube(await file.text())
      setLut({ ...parsed, name: parsed.title || file.name })
      set('lutName', parsed.title || file.name)
      toast(`Loaded LUT ${parsed.title || file.name} (${parsed.size}³)`)
    } catch (e) {
      toast(`Could not read LUT: ${e.message}`, { kind: 'error' })
    }
  }

  return (
    <div className="filters">
      <div className="row wrap gap-s">
        <button
          className="btn secondary sm"
          onPointerDown={() => onHold(true)}
          onPointerUp={() => onHold(false)}
          onPointerLeave={() => onHold(false)}
          disabled={disabled}
          title="Hold to see the original (or hold H)"
        >
          Hold to compare
        </button>
        <button className="btn secondary sm" onClick={onAuto} disabled={disabled} title="Auto levels and a touch of saturation">
          Auto-enhance
        </button>
        <button className="btn secondary sm" onClick={onPickWB} disabled={disabled} title="Click a neutral gray in the video to set white balance">
          White balance pick
        </button>
        <button className="btn secondary sm" onClick={copySettings}>
          Copy
        </button>
        <button className="btn secondary sm" onClick={pasteSettings}>
          Paste
        </button>
        <button
          className="btn secondary sm"
          onClick={() => {
            setFilters({ ...DEFAULT_FILTERS })
            setLut(null)
          }}
        >
          Reset all
        </button>
      </div>
      <Slider
        label="Before/after split"
        value={Math.round(split * 100)}
        min={0}
        max={100}
        unit="%"
        def={0}
        onChange={(v) => setSplit(v / 100)}
        hint="Left of the split shows the original"
      />

      <div className="presets" role="group" aria-label="Filter presets">
        {Object.entries(FILTER_PRESETS).map(([name, p]) => (
          <button key={name} className="chip" onClick={() => setFilters({ ...DEFAULT_FILTERS, ...p })}>
            {name}
          </button>
        ))}
        {Object.keys(custom).map((name) => (
          <span key={name} className="chip mine">
            <button onClick={() => setFilters({ ...DEFAULT_FILTERS, ...custom[name] })}>{name}</button>
            <button aria-label={`Delete preset ${name}`} onClick={() => deletePreset(name)}>
              ✕
            </button>
          </span>
        ))}
      </div>
      <form className="row gap-s" onSubmit={savePreset}>
        <label className="sr-only" htmlFor="presetName">
          Preset name
        </label>
        <input
          id="presetName"
          className="text"
          placeholder="Name this look…"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          maxLength={40}
        />
        <button className="btn secondary sm" disabled={!presetName.trim()}>
          Save preset
        </button>
      </form>

      <div className="tabs small" role="tablist" aria-label="Filter groups">
        {[...GROUPS, ['curve', 'Curve'], ['lut', 'LUT'], ['key', 'Chroma key']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={open === id} className={`tab ${open === id ? 'on' : ''}`} onClick={() => setOpen(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {GROUPS.some(([g]) => g === open) &&
          FILTER_FIELDS.filter((f) => f[6] === open).map(([k, label, min, max, step, unit]) => (
            <Slider
              key={k}
              label={label}
              value={filters[k]}
              min={min}
              max={max}
              step={step}
              unit={unit}
              def={DEFAULT_FILTERS[k]}
              onChange={(v) => set(k, v)}
              disabled={disabled}
            />
          ))}
        {open === 'curve' && <CurveEditor value={filters.curve} onChange={(c) => set('curve', c)} />}
        {open === 'lut' && (
          <div className="stack">
            <label className="btn secondary sm file">
              Import .cube LUT
              <input type="file" accept=".cube,text/plain" onChange={(e) => loadLut(e.target.files?.[0])} />
            </label>
            {lut ? (
              <>
                <p className="muted">
                  Active: {lut.name} ({lut.size}³)
                </p>
                <Slider label="Strength" value={filters.lutStrength} min={0} max={100} unit="%" def={100} onChange={(v) => set('lutStrength', v)} />
                <button
                  className="btn secondary sm"
                  onClick={() => {
                    setLut(null)
                    set('lutName', null)
                  }}
                >
                  Remove LUT
                </button>
              </>
            ) : (
              <p className="muted">
                3D LUTs (.cube) from Resolve, Premiere or Photoshop are applied locally on the GPU.{' '}
                {filters.lutName ? `Re-import “${filters.lutName}” to use it again.` : ''}
              </p>
            )}
          </div>
        )}
        {open === 'key' && (
          <div className="stack">
            <label className="inline check">
              <input type="checkbox" checked={filters.chromaEnabled} onChange={(e) => set('chromaEnabled', e.target.checked)} /> Remove a solid background color
            </label>
            <label className="inline">
              Key color <input type="color" value={filters.chromaColor} onChange={(e) => set('chromaColor', e.target.value)} />
            </label>
            <Slider label="Tolerance" value={filters.chromaTolerance} min={0} max={100} def={30} onChange={(v) => set('chromaTolerance', v)} />
            <Slider label="Softness" value={filters.chromaSoftness} min={0} max={100} def={10} onChange={(v) => set('chromaSoftness', v)} />
            <small className="muted">Save frames as PNG or WebP, or export APNG / transparent GIF, to keep the transparency.</small>
          </div>
        )}
      </div>
    </div>
  )
}
