import React, { useState } from 'react'
import { useApp } from '../state/store'
import { clearAllLocalData } from '../lib/storage'

export default function Privacy() {
  const { confirm, clearShots } = useApp()
  const [done, setDone] = useState(false)
  async function wipe() {
    if (
      !(await confirm('Delete all frames, settings, presets, drafts and the offline cache from this browser?', {
        title: 'Clear all local data',
        confirmLabel: 'Delete everything',
        danger: true,
      }))
    )
      return
    clearShots()
    await clearAllLocalData()
    setDone(true)
    setTimeout(() => window.location.reload(), 800)
  }
  return (
    <main id="main" className="container prose">
      <section className="card">
        <h1>Privacy</h1>
        <p className="lead">FrameCapture never uploads your videos, images or GIFs. There are no accounts, no analytics, no ads and no tracking.</p>
        <h2>What happens to your files</h2>
        <ul>
          <li>
            <strong>Videos</strong> are opened by your browser from your device. They are never copied to a server.
          </li>
          <li>
            <strong>Frames</strong> are stored in this browser’s IndexedDB so they survive a refresh. Only you can see them, on this device.
          </li>
          <li>
            <strong>Settings and presets</strong> live in localStorage.
          </li>
          <li>
            <strong>Editor drafts</strong> are autosaved locally so you do not lose work.
          </li>
        </ul>
        <h2>Network requests</h2>
        <p>The app downloads only its own code and icons from this site. After that it works offline. The only exceptions are things you start yourself:</p>
        <ul>
          <li>Opening a video from a URL fetches that URL directly from the server you typed.</li>
          <li>External links (GitHub, Buy Me a Coffee) open in a new tab.</li>
        </ul>
        <h2>Check it yourself</h2>
        <ol>
          <li>Open your browser’s developer tools and go to the Network tab.</li>
          <li>Load a video, capture frames and export a GIF.</li>
          <li>
            You will see only <code>blob:</code> URLs and this site’s own files. Nothing is sent anywhere.
          </li>
          <li>You can also turn on airplane mode after the page loads; everything keeps working.</li>
        </ol>
        <p className="muted small">
          A strict Content Security Policy blocks scripts and connections to other sites, apart from the media URLs you choose to open.
        </p>
        <h2>Clear everything</h2>
        <p>This deletes every frame, setting, preset, draft and cached file from this browser.</p>
        <button className="btn danger" onClick={wipe} disabled={done}>
          {done ? 'Cleared, reloading…' : 'Clear all local data'}
        </button>
      </section>
    </main>
  )
}
