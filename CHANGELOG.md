# Changelog

## Unreleased

- **Photo editor page** (`/photo`, "Photo" in the menu). Open a picture straight in the editor with no video: choose, drop or paste JPG, PNG, WebP, GIF, AVIF or **iPhone HEIC** (decoded on-device with a lazy, self-hosted libheif build; the CSP gained `'wasm-unsafe-eval'` for it). Select a **Live Photo's** still and its `.MOV` together and they are paired; the motion clip can be opened in the Studio from the photo card. A lone video dropped there opens in the Studio.
- **Editor: healing brush** (tool Y). Paint over a blemish, dust spot or wire; it finds a matching nearby area itself (or Alt-click to choose the source), copies its texture and matches the colour and tone to the surroundings so there is no visible patch edge. It adds a layer, so it is undoable and removable.
- **Editor: local adjustments** (Enhance tab → Mask & adjust part of the photo…). Paint a mask with a soft brush, a linear or circular gradient, or select a colour, then change exposure, contrast, saturation, warmth, highlights, shadows, sharpness or blur in just that area, with a live preview, undo and invert.
- **Editor: colour grading wheels** for shadows, midtones and highlights (tint plus brightness), **lens distortion** (barrel / pincushion, auto-zoomed so no empty corners) and a **before / after split view** with a draggable divider.
- **Editor:** Perspective correction (Transform tab → Fix perspective…). Drag four corners onto a slanted page, sign or building face with a live preview; annotations move with the image and the edit can be replayed on other selected photos.
- **Editor:** Colour mixer (hue, saturation and brightness for 8 colour bands) and Lens fixes (remove red/blue colour fringes, lift or add corner light), both in the Enhance tab.
- **Editor:** Auto-straighten (Transform tab). Edge pixels vote for the rotation that lines them up, it pre-fills the Straighten slider so you can check it before applying.

- **Auto cuts** (Cut & edit): remove silences and split at scene changes.
- **Frames:** sort by sharpness with a score badge, select blurry frames, and match the colour of other frames to a reference frame.
- **Editor:** auto-crop black bars.

- **Videos with no decodable picture** (for example iPhone HEVC `.mov` in Chrome without the HEVC extension, which loads the duration and audio but shows black and raises no error) now show the explanation and fix steps.

- **Upscale dialog** (Frames → Enhance → Upscale…, and the editor's Enhance tab). Pick what the image is (photo, screenshot/UI, old or noisy), Smart or AI, and an exact size: 2×, 3×, 4× or fit to 1080p, 1440p or 4K. Shows the plan, warns about poor combinations and previews a centre crop with a before/after slider. Noisy sources are denoised before enlarging; UI uses stronger edge sharpening.
- AI upscaling can be cancelled, keeps the page responsive between tiles, preserves transparency and reports which backend ran.

- **Black-screen fixes.** A video the browser cannot decode (for example iPhone HEVC, ProRes, AV1 on some machines) now shows a permanent explanation with fix steps instead of a black player. If GPU rendering produces a black picture while the video has one, the player detects it and switches to compatibility mode automatically (captures too).

- **Hosting moved to Cloudflare Pages.** Added `public/_headers` (CSP, security headers, caching), removed the Fly.io config and deploy jobs, renamed the workflow to `ci.yml`, and pointed canonical/sitemap URLs at `frame-cap-tool.pages.dev`.

- **Fullscreen controls.** Fullscreen now shows an auto-hiding control bar: seek bar, play/pause, frame and 5 s steps, speed, volume, capture, batch, marker, in/out, A-B loop, split, picture-in-picture and exit, plus a capture counter and inline "Captured" confirmation.
- **Fullscreen v2.** Double-click to play/pause, double-click the edges to skip 5 s, capture filmstrip, marker drawer, guides, rotate/flip, 3-2-1 self-timer, landscape lock on phones.
- **Command palette** (Ctrl/⌘ K) and a **What's new** dialog.
- **Near-duplicate cleanup** for captured frames (Enhance menu).
- **Video export** can target a file size (Discord, email, WhatsApp, X presets) and export audio only as WAV.
- Added `docs/V3-IMPROVEMENT-PROMPT.md`, a 120-item prompt for the next round of improvements.

## 2.0.0 (2026-11-10)

- **New workflow.** The studio is organized into three numbered workspaces (Video → Frames → Animate) with an inspector beside the player and a recent-frames strip that opens the editor in one click.
- **Video editing.** Cut list with split, trim, cut-out, reorder, per-clip speed and volume; titles; fades; edit-aware preview; frame-accurate MP4/WebM export with audio (WebCodecs), up to 4K or 2× upscaled.
- **Enhance and upscale.** Auto enhance, auto tone, auto white balance, denoise, sharpen, clarity, dehaze, low-light boost, deinterlace; Smart (Lanczos + CAS) and AI (ESRGAN) upscaling at 2× and 4×; bulk enhance in Frames; optional auto-enhance/upscale on capture.
- **Smarter capture.** "Auto-pick the best N frames" and "Clean still" (median stack of neighboring frames).
- **Photo editor.** Enhance tab, Layers panel with blend modes, clone stamp, magic eraser, full tone controls and tone curve.
- Keyboard input now always reaches the open dialog, even after a button disables itself.

## 1.0.0 (2026-11-08)

- Rebuilt the studio: WebGL2 color pipeline, frame-accurate timeline, in/out ranges, markers, zoom/pan, crop region, rotate/flip, scopes, measuring, captions, compare video, camera/screen sources and multiple video tabs.
- Capture: formats/quality/scale, burn-in, watermark, burst, batch modes (interval, frames, spread, range, scene change, sharpest frame, duplicate skip), contact sheets, audio trigger.
- Editor: object-based annotations, redaction, spotlight, fill, crop with aspect presets, straighten, resize, padding, polish, undo/redo, autosave, batch edit, revert.
- Gallery: persistence, multi-select, reorder, favorites, captions, tags, ZIP, project import/export, metadata export, lightbox and compare.
- Export: GIF in a worker (shared palette, dithering, frame-diff, transparency, target size), APNG, WebM/MP4, sprite sheets, captions, crossfades, ping-pong.
- PWA/offline, themes, Spanish UI, accessibility pass, help/privacy/settings pages.
- Fixed: broken deploy workflow, SPA refresh 404s, reversed gallery GIFs, double-applied filters, editor zoom offsets, Safari filters, NaN batch inputs, seek hangs, memory leaks.

## 0.2.0

- Initial version: upload, speed and filters, single/batch screenshots, basic editor, GIF export.
