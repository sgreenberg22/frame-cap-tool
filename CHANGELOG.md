# Changelog

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
