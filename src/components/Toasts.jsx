import React from 'react'
import { useApp } from '../state/store'

export default function Toasts() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="toasts" role="status" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
          <span>{t.message}</span>
          {t.action && (
            <button
              className="link"
              onClick={() => {
                t.action.fn()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="x" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
