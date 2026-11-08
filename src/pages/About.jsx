import React from 'react'

export default function About() {
  return (
    <main id="main" className="container prose">
      <section className="card">
        <h1>About FrameCapture</h1>
        <p>
          FrameCapture is a free, browser-based video frame grabber, annotator and GIF maker. It started as a small tool for pulling clean stills out of videos
          and grew into a full studio.
        </p>
        <p>
          Everything runs on your device using modern web APIs: WebGL2 for live color grading, Web Workers for GIF encoding, IndexedDB for saving your frames,
          and MediaRecorder for video export.
        </p>
        <h2>Credits</h2>
        <ul>
          <li>Built by Stephen G.</li>
          <li>
            GIF encoding by{' '}
            <a href="https://github.com/mattdesl/gifenc" target="_blank" rel="noopener noreferrer">
              gifenc
            </a>{' '}
            (MIT), ZIP files by{' '}
            <a href="https://github.com/101arrowz/fflate" target="_blank" rel="noopener noreferrer">
              fflate
            </a>{' '}
            (MIT).
          </li>
          <li>Built with React, React Router and Vite.</li>
        </ul>
        <h2>Support and feedback</h2>
        <p>
          Found a bug or have an idea?{' '}
          <a href="https://github.com/sgreenberg22/frame-cap-tool/issues/new/choose" target="_blank" rel="noopener noreferrer">
            Open an issue on GitHub
          </a>
          . If FrameCapture saves you time, you can{' '}
          <a href="https://buymeacoffee.com/scgreenberg" target="_blank" rel="noopener noreferrer">
            buy me a coffee
          </a>
          .
        </p>
        <p className="muted small">Version {__APP_VERSION__}</p>
      </section>
    </main>
  )
}
