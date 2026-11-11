import React from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../lib/i18n'
import { useApp } from '../state/store'

const FEATURES = [
  ['✂️', 'Edit video', 'Split, trim, cut and reorder clips, change speed, add titles and fades, then export MP4 or WebM with sound, up to 4K.'],
  ['🎨', 'GPU color grading', 'Exposure, curves, levels, temperature, LUTs, chroma key and analysis views like false color and zebras.'],
  ['📸', 'Smart capture', 'Single, burst and batch capture. Auto-pick the sharpest and best frames, or stack frames into a clean, noise-free still.'],
  [
    '✨',
    'Enhance and upscale',
    'One-click auto enhance, denoise, sharpen, clarity, dehaze and low-light boost. Upscale 2× or 4×, instantly or with an AI model.',
  ],
  ['🖌️', 'Pro photo editor', 'Layers with blend modes, clone stamp, magic eraser, curves, text, arrows, redaction, crops and full undo history.'],
  ['🌀', 'GIF, APNG and more', 'Shared palettes, dithering, ping-pong, captions, crossfades, size targets, sprite sheets and looping video.'],
  ['🔒', 'Private by design', 'No uploads, accounts or analytics. Even the AI upscaler runs on your own device. Works offline once loaded.'],
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
