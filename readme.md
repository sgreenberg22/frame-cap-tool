# FrameCapture

[![CI and Deploy](https://github.com/sgreenberg22/frame-cap-tool/actions/workflows/deploy.yml/badge.svg)](https://github.com/sgreenberg22/frame-cap-tool/actions/workflows/deploy.yml)
![Runs locally](https://img.shields.io/badge/processing-100%25%20in%20browser-ff8a3d)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

A video frame grabber, annotator and GIF maker that runs entirely in your browser. Load a video, scrub it frame by frame, color-grade it on the GPU, capture single or batch frames, annotate them, and export GIF, APNG, WebM/MP4 or sprite sheets.

**Nothing is uploaded.** There is no server-side processing, no accounts and no analytics. Frames are kept in your browser (IndexedDB) until you delete them.

Live: https://frame-cap-tool.fly.dev

## Features

**Video**

- Open files (picker, drag and drop, paste), URLs (CORS permitting), your camera or a screen share, and several videos at once in tabs
- Frame-accurate stepping, HH:MM:SS:FF timecodes, jump-to (`1:23.5`, `f120`, timecodes), speed 0.05×–16× with pitch control
- Timeline with hover thumbnails, in/out range, A-B loop, named markers, captured-frame ticks and an audio waveform
- Zoom/pan (Ctrl/⌘ + scroll, pinch), rotate/flip, crop region, black-bar trimming, fullscreen and picture-in-picture
- Guides (thirds, grid, crosshair, safe areas), onion skin, pixel inspector, calibrated measuring, histogram and waveform scopes
- Subtitles (.vtt/.srt) and a synced side-by-side compare video

**Color (WebGL2, with a CPU fallback)**

- Exposure, brightness, contrast, highlights/shadows, gamma, saturation, vibrance, hue, temperature/tint, levels, tone curve, 3D LUTs (.cube)
- Blur, sharpen, grayscale, sepia, invert, vignette, grain, opacity, chroma key
- Presets plus your own, before/after split, hold-to-compare, auto-enhance, click-to-white-balance, copy/paste settings
- Analysis views: false color, zebras, edge detect, threshold, motion, color-blindness simulations

**Capture**

- PNG/JPEG/WebP at native, display or custom scale; timestamp burn-in, watermark, naming templates
- Burst (hold S), batch by interval, frame count, even spread, in/out range, scene change, or sharpest frame; duplicate skipping
- Contact sheets and audio-triggered capture

**Editor**

- Pen, highlighter (with pressure and smoothing), eraser, line, arrow, rectangle, ellipse, polygon, text, numbered steps, stickers
- Pixelate/blur redaction, spotlight, fill bucket, eyedropper, region copy/paste
- Crop with aspect presets, rotate, flip, straighten, resize, padding, border/rounded corners/shadow
- Non-destructive adjustments, undo/redo with history, autosaved drafts, batch-apply to other frames, revert to original

**Gallery and export**

- Multi-select, reorder by drag, favorites, captions, tags, search, lightbox, compare, ZIP download, share, metadata CSV/JSON, project import/export, print
- GIF in a Web Worker: shared or per-frame palettes, dithering, changed-pixel optimization, transparency, target file size
- Reverse, ping-pong, speed, crossfades, captions, per-frame delays, trimming, aspect presets
- APNG, WebM/MP4 (MediaRecorder) and sprite sheets

**App**

- Installable PWA that works offline, light/dark/high-contrast themes, English and Spanish UI, keyboard shortcuts (press `?`), mobile layout with gestures

## Keyboard shortcuts

| Key                | Action                                     |
| ------------------ | ------------------------------------------ |
| Space / K          | Play / pause                               |
| ← → or , .         | Previous / next frame (Shift: ±5 s)        |
| J / L, [ / ]       | Slower / faster                            |
| S (hold for burst) | Capture frame                              |
| B                  | Batch capture                              |
| I / O / X / A      | In / out / clear / A-B loop                |
| M, N / P           | Add marker, next / previous marker         |
| H (hold)           | Show the original frame                    |
| G, 0, F, U         | Thirds guide, reset zoom, fullscreen, mute |
| ?                  | All shortcuts                              |

## Local development

```bash
nvm use            # Node 22 (see .nvmrc)
npm ci
npm run dev        # http://localhost:5173
npm test           # unit + component tests (Vitest)
npm run lint
npm run build && npm run e2e   # Playwright smoke test against vite preview
```

Commits run ESLint and Prettier on staged files (husky + lint-staged).

## Deploy

Pushing to `main` runs lint, tests, build, bundle-size check and a Playwright smoke test, then deploys to Fly.io (`flyctl deploy --remote-only`).

- The repo needs a `FLY_API_TOKEN` secret (`fly tokens create deploy -a frame-cap-tool`). Without it the deploy step is skipped with a warning.
- The image is a static build served by unprivileged nginx on port 8080 with SPA fallback, gzip, immutable asset caching, a strict CSP and a `/healthz` endpoint.
- A staging deploy (`fly.staging.toml`, app `frame-cap-tool-staging`) can be run manually from the Actions tab (workflow dispatch, target "staging") once that Fly app exists.

## Browser support

Current Chrome, Edge, Firefox and Safari 16.4+. Optional features degrade gracefully: without WebGL2 filters fall back to CSS/CPU, without `requestVideoFrameCallback` stepping is approximate, and without `ImageDecoder` animated images import as one frame. The Help page shows what your browser supports.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Security](SECURITY.md)
