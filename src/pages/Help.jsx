import React from 'react'
import { SHORTCUTS } from '../lib/shortcuts'
import { compatReport } from '../lib/compat'

const FAQ = [
  [
    'Is my video uploaded anywhere?',
    'No. The file is opened directly by your browser and every frame, edit and GIF is produced on your device. See the Privacy page for details and how to verify it.',
  ],
  [
    'Which formats work?',
    'Whatever your browser can play: MP4 (H.264/AAC) and WebM (VP8/VP9/AV1) work almost everywhere, MOV/HEVC works in Safari, and MKV works in Chromium for common codecs. If a file will not play, convert it to MP4 (H.264).',
  ],
  [
    'Why does the timecode say "assumed" fps?',
    'Browsers do not report a video’s frame rate. FrameCapture measures it while the video plays. You can also type the exact value in the Info tab.',
  ],
  [
    'Where are my frames stored?',
    'In this browser’s IndexedDB storage, so they survive a refresh. Clear them from the gallery, or wipe everything in Settings.',
  ],
  [
    'My GIF is too big. What can I do?',
    'Lower the width or FPS, use fewer colors, enable the shared palette and “only store changed pixels”, or set a target size in MB. APNG or video export can be better for long or colorful clips.',
  ],
  ['Why can I not capture from a URL?', 'The server must allow cross-origin access (CORS). If it does not, download the file and open it locally.'],
  ['Can I use it offline?', 'Yes. After the first visit the app is cached, and you can install it as an app from your browser’s menu.'],
  [
    'What do the analysis views show?',
    'False color maps brightness to colors (red = clipped highlights, purple = crushed blacks, green/pink = mid-tones such as skin). Zebras stripe over/under exposed areas. Edge detect, threshold and motion help with analysis; color-blindness views simulate how others see the frame. These views are preview-only.',
  ],
  [
    'How do I measure things?',
    'In View & tools, use “Set scale” to draw over something of known length and type its size (e.g. 30 cm). Then “Measure” lines report real-world lengths and angles.',
  ],
]

export default function Help() {
  const compat = compatReport()
  return (
    <main id="main" className="container prose">
      <section className="card">
        <h1>Help</h1>
        <h2>Getting started</h2>
        <ol>
          <li>Open the Studio and drop in a video (or paste, choose a file, use your camera, or generate the sample clip).</li>
          <li>Scrub with the timeline and arrow keys; set in/out points with I and O.</li>
          <li>Grade the image in Filters. Hold H to compare with the original.</li>
          <li>Press S to capture, or run a batch capture with B.</li>
          <li>Edit a frame with ✎, then select frames and export a GIF, APNG, video or sprite sheet.</li>
        </ol>
        <h2>Tips</h2>
        <ul>
          <li>Hold S for burst capture. Double-tap the left or right side of the video on mobile to skip 5 seconds; long-press to capture; swipe to scrub.</li>
          <li>Drag in the gallery (Custom order) to set the animation order.</li>
          <li>Use “Sharpest frame in range” to find the least blurry still in a fast scene.</li>
          <li>Drop a .cube LUT, .vtt/.srt subtitles, or images anywhere on the Studio page.</li>
        </ul>
      </section>
      <section className="card" id="shortcuts">
        <h2>Keyboard shortcuts</h2>
        <div className="shortcut-grid">
          {SHORTCUTS.map(([group, items]) => (
            <section key={group}>
              <h3>{group}</h3>
              <dl>
                {items.map(([k, d]) => (
                  <React.Fragment key={k}>
                    <dt>
                      <kbd>{k}</kbd>
                    </dt>
                    <dd>{d}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </section>
      <section className="card" id="faq">
        <h2>FAQ</h2>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
      <section className="card" id="compat">
        <h2>Browser support</h2>
        <p>Works best in current Chrome, Edge, Firefox and Safari (16.4+). Here is what this browser supports:</p>
        <table className="compat-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Status</th>
              <th>If missing</th>
            </tr>
          </thead>
          <tbody>
            {compat.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>{c.ok ? '✅ Supported' : '⚠️ Missing'}</td>
                <td className="muted">{c.ok ? '—' : c.fallback}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
