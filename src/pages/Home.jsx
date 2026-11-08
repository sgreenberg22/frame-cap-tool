import React from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../lib/i18n'
import { useApp } from '../state/store'

const FEATURES = [
  ['🎞️', 'Frame-accurate scrubbing', 'Step frame by frame, A-B loop, markers, speed from 0.05× to 16×, timecodes and hover previews.'],
  ['🎨', 'GPU color grading', 'Exposure, curves, levels, temperature, LUTs, chroma key and analysis views like false color and zebras.'],
  ['📸', 'Smart capture', 'Single, burst and batch capture: intervals, frame counts, scene changes, the sharpest frame, or on loud audio.'],
  ['✏️', 'Annotate', 'Arrows, shapes, text, numbered steps, highlighter, redaction and spotlight, with undo and layers that stay editable.'],
  ['🌀', 'GIF, APNG and video', 'Shared palettes, dithering, ping-pong, captions, crossfades, size targets, sprite sheets and WebM/MP4.'],
  ['🔒', 'Private by design', 'No uploads, accounts or analytics. Works offline once loaded, and your frames stay in this browser.'],
]

export default function Home() {
  const t = useT()
  const { shots } = useApp()
  return (
    <main id="main" className="container home">
      <section className="hero card">
        <h1>{t('home.title')}</h1>
        <p className="lead">{t('home.tagline')}</p>
        <p className="private-note">
          <span aria-hidden="true">🔒</span> {t('home.private')}
        </p>
        <div className="row wrap gap-s">
          <Link to="/studio" className="btn lg">
            {t('home.open')}
          </Link>
          {shots.length > 0 && (
            <Link to="/studio" className="btn secondary lg">
              Continue with {shots.length} saved frame{shots.length === 1 ? '' : 's'}
            </Link>
          )}
          <Link to="/help" className="btn secondary lg">
            How it works
          </Link>
        </div>
      </section>
      <section className="features" aria-label="Features">
        {FEATURES.map(([icon, title, body]) => (
          <article key={title} className="card feature">
            <div className="feature-icon" aria-hidden="true">
              {icon}
            </div>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
