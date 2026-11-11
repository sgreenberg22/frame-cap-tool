import React, { useState } from 'react'
import Modal from './Modal'

const STEPS = [
  [
    '1 · Video',
    'Drop in a video, then cut it: split at the playhead, trim or remove ranges, reorder clips, change speed, add titles and fades. Grade the color and export a finished MP4 or WebM. Nothing is uploaded.',
  ],
  [
    'Capture frames',
    'Press S to grab the current frame, hold S for a burst, or let batch capture pick frames for you: on an interval, at scene changes, or the sharpest and best frames in a range.',
  ],
  [
    '2 · Frames',
    'Every capture lands in Frames. Select some and use Enhance to auto-fix, denoise, sharpen or upscale them (including AI upscaling), or open one in the editor for layers, retouching, text and crops.',
  ],
  [
    '3 · Animate',
    'Turn selected frames, or a stretch of the video, into a GIF, APNG, looping video or sprite sheet. Use the numbered bar at the top to move between the three steps at any time.',
  ],
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
