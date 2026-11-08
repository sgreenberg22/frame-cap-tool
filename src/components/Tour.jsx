import React, { useState } from 'react'
import Modal from './Modal'

const STEPS = [
  [
    'Load a video',
    'Drop a file anywhere, use “Choose video”, paste from the clipboard, or try the sample clip. Your camera and screen work too. Nothing is uploaded.',
  ],
  [
    'Scrub and grade',
    'Use the timeline, frame-step with ← →, change speed, and tweak exposure, color, curves or a LUT in the Filters tab. Hold H to compare with the original.',
  ],
  [
    'Capture frames',
    'Press S (or the capture button) for a single frame. Batch capture grabs many at once: on an interval, spread across a range, on scene changes, or the sharpest frame.',
  ],
  ['Edit and export', 'Click ✎ on a frame to annotate, crop and redact. Select frames and build a GIF, APNG, video or sprite sheet in the Export section.'],
]

export default function Tour({ onDone }) {
  const [i, setI] = useState(0)
  const [title, body] = STEPS[i]
  return (
    <Modal title={`Quick tour · ${i + 1} of ${STEPS.length}`} onClose={onDone} size="sm">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p>{body}</p>
      <div className="dots" aria-hidden="true">
        {STEPS.map((_, k) => (
          <span key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
      <div className="row between">
        <button className="btn secondary" onClick={onDone}>
          Skip tour
        </button>
        <div className="row gap-s">
          {i > 0 && (
            <button className="btn secondary" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          {i < STEPS.length - 1 ? (
            <button className="btn" data-autofocus onClick={() => setI(i + 1)}>
              Next
            </button>
          ) : (
            <button className="btn" data-autofocus onClick={onDone}>
              Start
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
