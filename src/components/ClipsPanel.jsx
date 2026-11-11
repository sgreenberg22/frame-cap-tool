import React from 'react'
import Slider from './Slider'
import { clipAt, clipLength, cutRange, defaultClips, isEdited, keepRange, moveClip, splitAt, totalDuration } from '../lib/clips'
import { TITLE_POSITIONS, TITLE_STYLES } from '../lib/titles'
import { formatClock } from '../lib/timecode'

const uid = () => Math.random().toString(36).slice(2, 9)

/** Cut list editor: split, trim, remove, reorder, per-clip speed and volume, fades and titles. */
export default function ClipsPanel({ edit, setEdit, duration, time, range, previewEdit, setPreviewEdit, onSeek, onExport, disabled, live }) {
  if (live) return <p className="muted">Editing needs a video file. Record or open a file to cut it.</p>
  const clips = edit.clips || defaultClips(duration)
  const setClips = (next) => setEdit((e) => ({ ...e, clips: next.length ? next : defaultClips(duration) }))
  const cur = clipAt(clips, time)
  const edited = isEdited(clips, duration)
  const hasRange = range.in != null || range.out != null
  const a = range.in ?? 0
  const b = range.out ?? duration
  const patch = (i, p) => setClips(clips.map((c, k) => (k === i ? { ...c, ...p } : c)))
  const titles = edit.titles || []
  const setTitles = (next) => setEdit((e) => ({ ...e, titles: next }))

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
