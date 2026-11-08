import React, { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { LANGS } from '../lib/i18n'
import { clearAllLocalData, formatBytes, storageEstimate } from '../lib/storage'
import { DEFAULT_SETTINGS } from '../lib/config'
import { downloadText } from '../lib/download'
import Slider from '../components/Slider'
import { Link } from 'react-router-dom'

export default function Settings() {
  const { settings, setSettings, shots, confirm, clearShots, errors, clearErrors, toast } = useApp()
  const [est, setEst] = useState(null)
  useEffect(() => {
    storageEstimate().then(setEst)
  }, [shots.length])
  const s = settings

  async function persist() {
    const ok = await navigator.storage?.persist?.()
    toast(ok ? 'Storage marked as persistent' : 'The browser did not grant persistent storage', { kind: ok ? 'info' : 'warn' })
  }
  function report() {
    const body = `**What happened?**\n\n\n**Browser**: ${navigator.userAgent}\n\n**Recent errors**\n\`\`\`\n${errors
      .slice(-10)
      .map((e) => `${e.time} [${e.context}] ${e.message}`)
      .join('\n')}\n\`\`\``
    window.open(
      `https://github.com/sgreenberg22/frame-cap-tool/issues/new?title=${encodeURIComponent('Bug report')}&body=${encodeURIComponent(body)}`,
      '_blank',
      'noopener',
    )
  }

  return (
    <main id="main" className="container prose">
      <section className="card stack">
        <h1>Settings</h1>
        <fieldset>
          <legend>Appearance</legend>
          <div className="grid2">
            <label className="field">
              Theme
              <select value={s.theme} onChange={(e) => setSettings({ theme: e.target.value })}>
                <option value="system">Match system</option>
                <option value="creamsicle">Creamsicle (light)</option>
                <option value="midnight">Midnight (dark)</option>
                <option value="contrast">High contrast</option>
              </select>
            </label>
            <label className="field">
              Language
              <select value={s.lang} onChange={(e) => setSettings({ lang: e.target.value })}>
                {LANGS.map(([id, l]) => (
                  <option key={id} value={id}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Capture defaults</legend>
          <div className="grid2">
            <label className="field">
              Image format
              <select value={s.imageFormat} onChange={(e) => setSettings({ imageFormat: e.target.value })}>
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
              </select>
            </label>
            <label className="field">
              Time display
              <select value={s.timeUnit} onChange={(e) => setSettings({ timeUnit: e.target.value })}>
                <option value="seconds">Timecode (HH:MM:SS:FF)</option>
                <option value="frames">Frame numbers</option>
              </select>
            </label>
          </div>
          {s.imageFormat !== 'image/png' && (
            <Slider
              label="Quality"
              value={Math.round(s.imageQuality * 100)}
              min={30}
              max={100}
              unit="%"
              def={92}
              onChange={(v) => setSettings({ imageQuality: v / 100 })}
            />
          )}
          <label className="field">
            File name template <input className="text" value={s.nameTemplate} onChange={(e) => setSettings({ nameTemplate: e.target.value })} />
          </label>
          <small className="muted">Tokens: {'{video} {index} {timecode} {time} {date}'}. More capture options are in the Studio’s Capture tab.</small>
        </fieldset>
        <fieldset>
          <legend>Keyboard</legend>
          <p className="muted">
            Shortcuts are listed on the <Link to="/help#shortcuts">Help page</Link> and with <kbd>?</kbd> in the Studio.
          </p>
          <button className="btn secondary sm" onClick={() => setSettings({ tourDone: false })}>
            Show the welcome tour again
          </button>
        </fieldset>
        <fieldset>
          <legend>Storage</legend>
          <p>
            {shots.length} frames saved.{' '}
            {est ? `This site uses ${formatBytes(est.usage)}${est.quota ? ` of about ${formatBytes(est.quota)} available` : ''}.` : ''}
          </p>
          <div className="row wrap gap-s">
            <button className="btn secondary sm" onClick={persist}>
              Ask the browser to keep my data
            </button>
            <button
              className="btn secondary sm"
              onClick={async () => {
                if (await confirm(`Delete all ${shots.length} frames?`, { danger: true, confirmLabel: 'Delete frames' })) clearShots()
              }}
              disabled={!shots.length}
            >
              Delete all frames
            </button>
            <button
              className="btn danger sm"
              onClick={async () => {
                if (await confirm('Delete all frames, settings, presets, drafts and cached files?', { danger: true, confirmLabel: 'Reset everything' })) {
                  clearShots()
                  await clearAllLocalData()
                  window.location.reload()
                }
              }}
            >
              Reset everything
            </button>
            <button className="btn secondary sm" onClick={() => setSettings({ ...DEFAULT_SETTINGS, tourDone: true })}>
              Restore default settings
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Error reporting (off by default)</legend>
          <label className="inline check">
            <input type="checkbox" checked={s.errorLog} onChange={(e) => setSettings({ errorLog: e.target.checked })} /> Show the local error log here so I can
            include it in a bug report
          </label>
          <p className="muted small">
            Errors are only kept in memory on this device. Nothing is sent unless you click “Report on GitHub”, which opens a prefilled issue you can review
            first. Media and file contents are never included.
          </p>
          {s.errorLog && (
            <>
              {errors.length ? (
                <pre className="errlog">{errors.map((e) => `${e.time} [${e.context}] ${e.message}`).join('\n')}</pre>
              ) : (
                <p className="muted">No errors recorded this session.</p>
              )}
              <div className="row gap-s wrap">
                <button className="btn secondary sm" onClick={report}>
                  Report on GitHub
                </button>
                <button
                  className="btn secondary sm"
                  onClick={() => downloadText(JSON.stringify(errors, null, 2), 'framecapture-errors.json', 'application/json')}
                  disabled={!errors.length}
                >
                  Download log
                </button>
                <button className="btn secondary sm" onClick={clearErrors} disabled={!errors.length}>
                  Clear
                </button>
              </div>
            </>
          )}
        </fieldset>
      </section>
    </main>
  )
}
