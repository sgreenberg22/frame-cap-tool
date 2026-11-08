import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Accessible dialog: focus trap, Escape to close, restores focus, labelled by its title. */
export default function Modal({ title, onClose, children, size = 'md', closeOnBackdrop = true, className = '', hideTitle = false, onKeyDown }) {
  const ref = useRef(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const prev = document.activeElement
    const el = ref.current
    const auto = el?.querySelector('[data-autofocus]') || el?.querySelector(FOCUSABLE) || el
    auto?.focus?.()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      prev?.focus?.()
    }
  }, [])

  function handleKey(e) {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCloseRef.current?.()
    } else if (e.key === 'Tab') {
      const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return createPortal(
    <div className="modal" onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onCloseRef.current?.()}>
      <div
        ref={ref}
        className={`panel panel-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKey}
      >
        <div className={`panel-head ${hideTitle ? 'sr-only' : ''}`}>
          <h2 id={titleId}>{title}</h2>
          <button className="btn icon secondary" onClick={() => onCloseRef.current?.()} aria-label="Close dialog" title="Close (Esc)">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
