import React, { useId } from 'react'

/** Labelled slider + numeric input. Double-click resets to the default. */
export default function Slider({ label, value, min, max, step = 1, unit = '', def, onChange, hint, disabled }) {
  const id = useId()
  const set = (raw) => {
    const n = parseFloat(raw)
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
  }
  const changed = def != null && value !== def
  return (
    <div className={`slider ${changed ? 'changed' : ''}`} title={hint || (def != null ? 'Double-click to reset' : undefined)}>
      <label htmlFor={id} onDoubleClick={() => def != null && onChange(def)}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => set(e.target.value)}
        onDoubleClick={() => def != null && onChange(def)}
      />
      <span className="num-wrap">
        <input
          type="number"
          className="num"
          aria-label={`${label} value`}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => set(e.target.value)}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  )
}
