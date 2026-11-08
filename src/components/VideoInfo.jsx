import React from 'react'
import { formatClock, secondsToFrames } from '../lib/timecode'
import { formatBytes } from '../lib/storage'

export default function VideoInfo({ source, v, fps, fpsMeasured, time, onMeasureFps }) {
  if (!source || !v) return <p className="muted">No video loaded.</p>
  const rows = [
    ['Name', source.name],
    ['Type', source.file?.type || (source.stream ? 'Live stream' : source.kind === 'url' ? 'Remote URL' : 'Unknown')],
    ['File size', source.file ? formatBytes(source.file.size) : '—'],
    ['Resolution', v.videoWidth ? `${v.videoWidth} × ${v.videoHeight}` : '—'],
    ['Aspect', v.videoWidth ? (v.videoWidth / v.videoHeight).toFixed(3) : '—'],
    ['Duration', Number.isFinite(v.duration) ? formatClock(v.duration) : 'Live'],
    ['Frame rate', `${fps} fps${fpsMeasured ? ' (measured)' : ' (assumed — play the video to measure)'}`],
    ['Current frame', `${secondsToFrames(time, fps)}${Number.isFinite(v.duration) ? ` of ${secondsToFrames(v.duration, fps)}` : ''}`],
    ['Audio', v.mozHasAudio ?? (v.webkitAudioDecodedByteCount > 0 ? 'Yes' : v.audioTracks?.length ? 'Yes' : 'Unknown')],
  ]
  return (
    <div>
      <dl className="info">
        {rows.map(([k, val]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd>{String(val)}</dd>
          </React.Fragment>
        ))}
      </dl>
      {!source.stream && (
        <button className="btn secondary sm" onClick={onMeasureFps}>
          Measure frame rate
        </button>
      )}
      <p className="muted small">Browsers do not expose the codec name; the container type comes from the file.</p>
    </div>
  )
}
