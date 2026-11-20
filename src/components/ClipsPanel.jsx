import React, { useRef, useState } from 'react'
import Slider from './Slider'
import { clipAt, clipLength, cutRange, defaultClips, isEdited, keepRange, moveClip, splitAt, totalDuration } from '../lib/clips'
import { TITLE_POSITIONS, TITLE_STYLES } from '../lib/titles'
import { formatClock } from '../lib/timecode'
import { applyCuts, detectSilences, splitAtTimes } from '../lib/autoCut'

const uid = () => Math.random().toString(36).slice(2, 9)

/** Cut list editor: split, trim, remove, reorder, per-clip speed and volume, fades and titles. */
export default function ClipsPanel({
  edit,
  setEdit,
  duration,
  time,
  range,
  previewEdit,
  setPreviewEdit,
  onSeek,
  onExport,
  disabled,
  live,
  getPeaks,
  scanScenes,
}) {
  const clips = edit.clips || defaultClips(duration)
  const setClips = (next) => setEdit((e) => ({ ...e, clips: next.length ? next : defaultClips(duration) }))
  const cur = clipAt(clips, time)
  const edited = isEdited(clips, duration)
  const hasRange = range.in != null || range.out != null
  const a = range.in ?? 0
  const b = range.out ?? duration
  const patch = (i, p) => setClips(clips.map((c, k) => (k === i ? { ...c, ...p } : c)))
  const [auto, setAuto] = useState({ threshold: 4, minSilence: 0.6, sceneSens: 14 })
  const [autoBusy, setAutoBusy] = useState(null) // { label, p }
  const [autoMsg, setAutoMsg] = useState('')
  const cancelAuto = useRef(false)

  async function removeSilences() {
    setAutoMsg('')
    setAutoBusy({ label: 'Reading the audio…', p: 0 })
    try {
      const peaks = await getPeaks()
      if (!peaks) return setAutoMsg('No audio could be read from this file.')
      const ranges = detectSilences(peaks, duration, { threshold: auto.threshold / 100, minSilence: auto.minSilence })
      if (!ranges.length) return setAutoMsg('No silences found. Try a higher level or a shorter minimum length.')
      const removed = ranges.reduce((t, r) => t + (r.b - r.a), 0)
      setClips(applyCuts(clips, ranges))
      setAutoMsg(`Removed ${ranges.length} silence${ranges.length === 1 ? '' : 's'} (${formatClock(removed)}). Use Reset cuts to undo.`)
    } catch (e) {
      setAutoMsg(`Could not analyze audio: ${e.message}`)
    } finally {
      setAutoBusy(null)
    }
  }

  async function splitScenes() {
    setAutoMsg('')
    cancelAuto.current = false
    setAutoBusy({ label: 'Scanning for scene changes…', p: 0 })
    try {
      const cuts = await scanScenes({
        threshold: auto.sceneSens,
        isCancelled: () => cancelAuto.current,
        onProgress: (p) => setAutoBusy({ label: 'Scanning for scene changes…', p }),
      })
      if (cancelAuto.current) return setAutoMsg('Scan cancelled.')
      if (!cuts.length) return setAutoMsg('No scene changes found. Try a lower sensitivity value.')
      setClips(splitAtTimes(clips, cuts))
      setAutoMsg(`Split at ${cuts.length} scene change${cuts.length === 1 ? '' : 's'}. Delete clips you do not want, or reorder them.`)
    } catch (e) {
      setAutoMsg(`Scan failed: ${e.message}`)
    } finally {
      setAutoBusy(null)
    }
  }

  const titles = edit.titles || []
  const setTitles = (next) => setEdit((e) => ({ ...e, titles: next }))

  if (live) return <p className="muted">Editing needs a video file. Record or open a file to cut it.</p>

  return (
    <div className="stack">
      <fieldset disabled={disabled}>
        <legend>Cut</legend>
        <div className="row wrap gap-s">
          <button className="btn secondary sm" onClick={() => setClips(splitAt(clips, time))} disabled={cur < 0} title="Split the clip at the playhead (C)">
            ✂ Split at playhead
          </button>
          <button
            className="btn secondary sm"
            onClick={() => setClips(keepRange(clips, a, b))}
            disabled={!hasRange}
            title="Keep only the in/out range (set with I and O)"
          >
            Trim to in/out
          </button>
          <button
            className="btn secondary sm"
            onClick={() => setClips(cutRange(clips, a, b))}
            disabled={!hasRange}
            title="Remove the in/out range and close the gap"
          >
            Cut out in/out
          </button>
          <button className="btn secondary sm" onClick={() => setEdit((e) => ({ ...e, clips: defaultClips(duration) }))} disabled={!edited}>
            Reset cuts
          </button>
        </div>
        <label className="inline check">
          <input type="checkbox" checked={previewEdit} onChange={(e) => setPreviewEdit(e.target.checked)} /> Play the edit (skip removed parts, follow clip
          order and speed)
        </label>
        <p className="muted small" aria-live="polite">
          {clips.length} clip{clips.length === 1 ? '' : 's'} · {formatClock(totalDuration(clips))} of {formatClock(duration)}
          {hasRange ? '' : ' · Set in/out points (I / O) to trim or cut a range.'}
        </p>
      </fieldset>
      <fieldset disabled={disabled || !!autoBusy}>
        <legend>Auto cuts</legend>
        <div className="grid2">
          <Slider label="Silence level" value={auto.threshold} min={1} max={15} unit="%" def={4} onChange={(v) => setAuto((a) => ({ ...a, threshold: v }))} />
          <Slider
            label="Min silence"
            value={auto.minSilence}
            min={0.3}
            max={3}
            step={0.1}
            unit="s"
            def={0.6}
            onChange={(v) => setAuto((a) => ({ ...a, minSilence: v }))}
          />
        </div>
        <div className="row wrap gap-s">
          <button className="btn secondary sm" onClick={removeSilences} title="Cut out quiet stretches, keeping a little breathing room around speech">
            Remove silences
          </button>
          <button className="btn secondary sm" onClick={splitScenes} title="Scan the picture and split the clip wherever the scene changes">
            Split at scene changes
          </button>
        </div>
        <Slider
          label="Scene sensitivity (lower finds more)"
          value={auto.sceneSens}
          min={5}
          max={40}
          def={14}
          onChange={(v) => setAuto((a) => ({ ...a, sceneSens: v }))}
        />
        {autoBusy && (
          <div className="row wrap gap-s" aria-live="polite">
            <progress max="1" value={autoBusy.p} />
            <span className="muted small">{autoBusy.label}</span>
            <button className="btn secondary sm" onClick={() => (cancelAuto.current = true)}>
              Cancel
            </button>
          </div>
        )}
        {autoMsg && (
          <p className="muted small" role="status">
            {autoMsg}
          </p>
        )}
      </fieldset>

      <ol className="clip-list" aria-label="Clips in playback order">
        {clips.map((c, i) => (
          <li key={c.id} className={`clip ${i === cur ? 'on' : ''}`}>
            <div className="row between gap-s wrap">
              <button className="link mono" onClick={() => onSeek(c.in)} title="Jump to this clip">
                {i + 1}. {formatClock(c.in)} → {formatClock(c.out)}
              </button>
              <span className="muted small">{formatClock(clipLength(c))}</span>
              <span className="row gap-xs">
                <button className="mini" onClick={() => setClips(moveClip(clips, i, -1))} disabled={i === 0} aria-label={`Move clip ${i + 1} earlier`}>
                  ▲
                </button>
                <button
                  className="mini"
                  onClick={() => setClips(moveClip(clips, i, 1))}
                  disabled={i === clips.length - 1}
                  aria-label={`Move clip ${i + 1} later`}
                >
                  ▼
                </button>
                <button
                  className="mini"
                  onClick={() => setClips(clips.filter((x) => x.id !== c.id))}
                  disabled={clips.length === 1}
                  aria-label={`Delete clip ${i + 1}`}
                >
                  ✕
                </button>
              </span>
            </div>
            <div className="row wrap gap-s">
              <label className="inline small">
                Speed
                <select value={c.speed} onChange={(e) => patch(i, { speed: parseFloat(e.target.value) })} aria-label={`Clip ${i + 1} speed`}>
                  {[0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8].map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline small">
                Volume
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={c.volume}
                  onChange={(e) => patch(i, { volume: parseFloat(e.target.value) })}
                  aria-label={`Clip ${i + 1} volume`}
                />
                <span className="mono">{Math.round(c.volume * 100)}%</span>
              </label>
            </div>
          </li>
        ))}
      </ol>

      <fieldset disabled={disabled}>
        <legend>Fades</legend>
        <Slider label="Fade in" value={edit.fadeIn || 0} min={0} max={5} step={0.1} unit="s" def={0} onChange={(v) => setEdit((e) => ({ ...e, fadeIn: v }))} />
        <Slider
          label="Fade out"
          value={edit.fadeOut || 0}
          min={0}
          max={5}
          step={0.1}
          unit="s"
          def={0}
          onChange={(v) => setEdit((e) => ({ ...e, fadeOut: v }))}
        />
        <small className="muted">Fades apply to picture and sound in the exported video.</small>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend>Titles and captions</legend>
        {titles.map((tt, i) => (
          <div key={tt.id} className="title-row">
            <textarea
              className="text"
              rows="2"
              value={tt.text}
              onChange={(e) => setTitles(titles.map((x) => (x.id === tt.id ? { ...x, text: e.target.value } : x)))}
              aria-label={`Title ${i + 1} text`}
              placeholder="Title text"
            />
            <div className="row wrap gap-s">
              <label className="inline small">
                From
                <input
                  type="number"
                  className="num"
                  min="0"
                  step="0.1"
                  value={+tt.start.toFixed(2)}
                  onChange={(e) => setTitles(titles.map((x) => (x.id === tt.id ? { ...x, start: Math.max(0, parseFloat(e.target.value) || 0) } : x)))}
                  aria-label={`Title ${i + 1} start (s)`}
                />
              </label>
              <label className="inline small">
                to
                <input
                  type="number"
                  className="num"
                  min="0"
                  step="0.1"
                  value={+tt.end.toFixed(2)}
                  onChange={(e) => setTitles(titles.map((x) => (x.id === tt.id ? { ...x, end: Math.max(x.start + 0.1, parseFloat(e.target.value) || 0) } : x)))}
                  aria-label={`Title ${i + 1} end (s)`}
                />
              </label>
              <select
                value={tt.position}
                onChange={(e) => setTitles(titles.map((x) => (x.id === tt.id ? { ...x, position: e.target.value } : x)))}
                aria-label={`Title ${i + 1} position`}
              >
                {TITLE_POSITIONS.map(([id, l]) => (
                  <option key={id} value={id}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                value={tt.style}
                onChange={(e) => setTitles(titles.map((x) => (x.id === tt.id ? { ...x, style: e.target.value } : x)))}
                aria-label={`Title ${i + 1} style`}
              >
                {TITLE_STYLES.map(([id, l]) => (
                  <option key={id} value={id}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                type="color"
                value={tt.color}
                onChange={(e) => setTitles(titles.map((x) => (x.id === tt.id ? { ...x, color: e.target.value } : x)))}
                aria-label={`Title ${i + 1} color`}
              />
              <label className="inline small">
                Size
                <input
                  type="range"
                  min="3"
                  max="16"
                  step="0.5"
                  value={tt.size}
                  onChange={(e) => setTitles(titles.map((x) => (x.id === tt.id ? { ...x, size: parseFloat(e.target.value) } : x)))}
                  aria-label={`Title ${i + 1} size`}
                />
              </label>
              <button className="mini" onClick={() => onSeek(tt.start)} aria-label={`Jump to title ${i + 1}`}>
                ⇥
              </button>
              <button className="mini" onClick={() => setTitles(titles.filter((x) => x.id !== tt.id))} aria-label={`Delete title ${i + 1}`}>
                ✕
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn secondary sm"
          onClick={() =>
            setTitles([
              ...titles,
              { id: uid(), text: 'Your title', start: time, end: Math.min(duration, time + 3), position: 'lower', style: 'outline', color: '#ffffff', size: 7 },
            ])
          }
        >
          ＋ Add title at playhead
        </button>
      </fieldset>

      <button className="btn" onClick={onExport} disabled={disabled}>
        Export video →
      </button>
    </div>
  )
}
