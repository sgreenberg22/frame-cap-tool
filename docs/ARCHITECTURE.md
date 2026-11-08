# Architecture

FrameCapture is a static React 18 + Vite single-page app. All media processing happens client-side.

## Layout

```
src/
  main.jsx            Router (lazy routes), service worker registration
  App.jsx             Layout: header/nav, theme, compat banner, toasts, error boundary
  state/store.jsx     App state: settings (localStorage), frames (IndexedDB), toasts, confirm dialog, error log
  pages/              Home, Studio, Help, Settings, About, Privacy, NotFound
  components/         Player, Timeline, Transport, panels, Gallery, Lightbox, ExportPanel, Modal, ...
  components/editor/  EditorModal (UI) + editorCore (document model, geometry, rendering)
  lib/                Pure helpers: filters, gl, capture, batch, timecode, analysis, storage, download, apng, gifcore, media, i18n, config
  workers/            gif.worker.js (streaming GIF encoder)
public/               sw.js, manifest, icons, theme-init.js, robots/sitemap
deploy/nginx.conf     Production server config (SPA fallback, headers, CSP, /healthz)
```

## Rendering pipeline

`lib/gl.js` is a WebGL2 fragment shader that implements the whole filter stack (exposure, contrast, curves via a 256×1 texture, 3D LUTs via a 3D texture, chroma key, vignette, grain, blur/sharpen, analysis views). The same renderer draws:

1. the live preview (`Player` draws on each presented frame via `requestVideoFrameCallback`)
2. captures (`lib/capture.js` renders at native resolution in an offscreen renderer)
3. GIF frames sampled from the video

`lib/filters.js#makeGrader` mirrors the shader on the CPU for browsers without WebGL2 (and for the editor’s adjustments fallback), so Safari no longer silently drops filters.

Capture order: filters → crop region → rotate/flip → scale → burn-in/watermark.

## Frames

Frames are Blobs (not data URLs) with a JPEG thumbnail, persisted in IndexedDB and exposed through object URLs that are revoked on delete. Editing keeps the first `originalBlob` so frames can be reverted. Display order is persisted.

## Editor

`editorCore.js` holds a document: a base canvas, live adjustments, and a list of vector objects (strokes, shapes, text, steps, stickers, images, redactions, spotlights). Geometry operations (crop/rotate/flip/resize/straighten/pad) transform the base and remap object coordinates, and are logged as normalized ops so they can be replayed on other frames (batch edit). Undo/redo stores document snapshots; drafts autosave to IndexedDB.

## Export

`ExportPanel` prepares frames at output size, then streams them (transferring ImageData buffers) to `gif.worker.js`. Per-frame-palette encodes stream directly; shared-palette or frame-diff modes buffer in the worker to build the palette first. APNG reuses the browser PNG encoder and stitches chunks (`lib/apng.js`). Video export records a canvas with MediaRecorder.

## Testing

- Vitest unit tests for the pure libraries and a few components (`*.test.js[x]`)
- `e2e/smoke.mjs` drives the built app with Playwright (sample clip → capture → batch → edit → GIF → reload persistence)
- CI also enforces a gzipped bundle budget (`scripts/check-size.mjs`)
