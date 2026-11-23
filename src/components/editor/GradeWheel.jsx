import React, { useRef } from 'react'

/** Colour wheel: angle is hue, distance from the centre is strength. Double-click or Reset to neutral. */
export default function GradeWheel({ label, value, onChange }) {
  const ref = useRef(null)
  const { hue = 0, amount = 0 } = value || {}
  const set = (e) => {
    const r = ref.current.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const rad = r.width / 2
    const dist = Math.min(1, Math.hypot(dx, dy) / rad)
    // 0° is at the top, clockwise.
    const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    onChange({ ...value, hue: Math.round(deg), amount: Math.round(dist * 100) })
  }
  const a = (hue * Math.PI) / 180
  const rr = amount / 100
  return (
    <div className="grade-wheel">
      <div
        ref={ref}
        className="wheel-disc"
        role="slider"
        tabIndex={0}
        aria-label={`${label} colour`}
        aria-valuetext={amount ? `hue ${hue} degrees, strength ${amount}%` : 'neutral'}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          set(e)
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && set(e)}
        onDoubleClick={() => onChange({ ...value, hue: 0, amount: 0 })}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2
          if (e.key === 'ArrowLeft') onChange({ ...value, hue: (hue + 360 - step) % 360, amount: amount || 20 })
          else if (e.key === 'ArrowRight') onChange({ ...value, hue: (hue + step) % 360, amount: amount || 20 })
          else if (e.key === 'ArrowUp') onChange({ ...value, amount: Math.min(100, amount + step) })
          else if (e.key === 'ArrowDown') onChange({ ...value, amount: Math.max(0, amount - step) })
          else if (e.key === 'Delete' || e.key === 'Backspace') onChange({ ...value, hue: 0, amount: 0 })
          else return
          e.preventDefault()
        }}
      >
        <span className="wheel-dot" style={{ left: `${50 + Math.sin(a) * rr * 50}%`, top: `${50 - Math.cos(a) * rr * 50}%` }} />
      </div>
      <span className="small">{label}</span>
    </div>
  )
}
