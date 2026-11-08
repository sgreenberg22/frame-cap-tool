import React, { useMemo, useState } from 'react'
import { compatReport } from '../lib/compat'
import { ls } from '../lib/storage'
import { Link } from 'react-router-dom'

export default function CompatBanner() {
  const missing = useMemo(() => compatReport().filter((c) => !c.ok && !c.quiet), [])
  const key = 'fc.compatDismissed.' + missing.map((m) => m.id).join(',')
  const [hidden, setHidden] = useState(() => ls.get(key, false))
  if (!missing.length || hidden) return null
  return (
    <div className="banner compat" role="note">
      <span>
        Some features are limited in this browser: {missing.map((m) => m.label.split(' (')[0]).join(', ')}. <Link to="/help#compat">Details</Link>
      </span>
      <button
        className="link"
        onClick={() => {
          ls.set(key, true)
          setHidden(true)
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
