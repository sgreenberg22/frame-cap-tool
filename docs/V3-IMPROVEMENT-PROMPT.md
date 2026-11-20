# FrameCapture v2.1 improvement prompt (120 items)

Paste everything below the line into a Claude Code session opened on a clone of `sgreenberg22/frame-cap-tool`. It is written so an agent can run unattended and push to `main`.

---

You are working on **FrameCapture** (`sgreenberg22/frame-cap-tool`), a browser-only video frame capture, GIF and photo/video editing tool: React 18 + Vite 5 SPA, WebGL2 filter pipeline with CPU fallback, WebCodecs video export, worker-based enhancement and TensorFlow.js upscaling, IndexedDB storage, nginx on Fly.io. Read `readme.md`, `docs/ARCHITECTURE.md` and `docs/IMPROVEMENTS.md` first.

## Mission

Implement as many of the 120 items below as you can, in priority order within each section, and push to `main`. Add further fixes you find along the way (list them in the report).

## Non-negotiable rules

1. **Everything stays client-side.** No uploads, analytics or third-party network calls. Keep the strict CSP (`script-src 'self'`, `connect-src 'self' blob: data:`). Any new model or asset is self-hosted under `public/` and cached by the service worker.
2. **Push to `main` automatically**, in small commits (one section or feature per commit, imperative subject line, reference item numbers). Before every push run `npm run lint && npm test && npm run build && npm run size && npm run e2e`. If any step fails, fix it before pushing. Never use `--no-verify` or force-push. After each push, check the GitHub Actions run with `gh run watch`; if CI fails, fix forward immediately.
3. **Respect the bundle budget** (`scripts/check-size.mjs`). New heavy code is lazy-loaded behind `import()`. Raise a budget only with a written reason in the commit message.
4. **Add or update tests** for every new pure function (Vitest) and extend `e2e/smoke.mjs` for each new user-facing flow. Verify UI work in a real browser (Playwright), at desktop and 390 px mobile widths, and look at screenshots.
5. **Accessibility:** every control keyboard-reachable, labelled, with visible focus; respect `prefers-reduced-motion`; contrast at least AA.
6. Do not remove existing features or change stored data formats without a migration.
7. Update `readme.md`, `CHANGELOG.md` (bump to 2.1.0), the in-app Help page and the keyboard-shortcuts overlay. Write `docs/IMPROVEMENTS-V2.1.md` with a status table (Done / Partial / Skipped, with reasons).
8. If something needs the owner (for example the `FLY_API_TOKEN` secret), say so in the report rather than blocking.

## Already done (do not redo)

Fullscreen mode now has an on-screen control bar (seek bar, play/pause, frame and 5 s steps, speed, volume, capture, batch, marker, in/out, A-B loop, split, picture-in-picture, exit, capture counter, auto-hide). Extend it per section A.

## A. Fullscreen and playback (1–14)

1. Show a filmstrip of recent captures along the edge of fullscreen; tapping one opens it in a fullscreen lightbox with next/previous.
2. Add quick filter presets, an Auto Enhance toggle and the before/after split to the fullscreen bar.
3. Add zoom and pan controls in fullscreen (pinch, wheel, 1:1, fit) and a minimap while zoomed.
4. Add fullscreen buttons for rotate, flip and crop-region (ROI) selection.
5. Add a fullscreen frame-grid / safe-area / rule-of-thirds overlay toggle.
6. Double-click the video to toggle play/pause and double-tap left/right to skip 5 s on touch (YouTube-style), with ripple feedback.
7. Add on-screen touch gestures in fullscreen: horizontal drag to scrub, vertical drag on the right edge for volume.
8. Keep the controls visible while paused and while any menu is open; never hide while the pointer is over a control or a control has keyboard focus.
9. Add a fullscreen marker list drawer with jump and rename.
10. Add a "fullscreen capture with countdown" (3-2-1 timer) for self-timed screenshots of live sources.
11. Lock screen orientation to landscape on mobile fullscreen where supported, and respect safe-area insets.
12. Add a fullscreen playlist control to switch between loaded videos.
13. Make a keyboard help hint appear for two seconds on entering fullscreen.
14. Add a cinema mode (hide UI chrome, letterbox, ambient glow behind the video) available outside fullscreen too.

## B. Capture and screenshots (15–34)

15. Capture the current view with annotations, overlays and titles baked in (optional toggle).
16. Add scrolling/stitched panorama capture: pick a range, align frames and stitch into one tall or wide image.
17. Add "contact sheet" export with timestamps, configurable grid, margins and header.
18. Add scene-change-based capture (one frame at every cut) with sensitivity slider and preview of detected cuts.
19. Add duplicate-frame removal after batch capture, with a similarity threshold and review step.
20. Add blur/closed-eyes/low-quality rejection in "best frames", with a score badge on each thumbnail.
21. Add face detection (lazy-loaded, local) for "capture frames with faces" and optional auto-crop to faces.
22. Add burst capture with a configurable rate and a "keep sharpest of each burst" option.
23. Add a capture queue so captures never block playback; show progress per item.
24. Add copy-to-clipboard for the last capture (Ctrl+C) and paste-image-to-gallery (Ctrl+V).
25. Add drag-and-drop of a captured frame straight out of the app to the desktop or another app.
26. Add custom filename templates (`{video}-{timecode}-{n}`), applied to single and ZIP exports.
27. Add capture presets (for example "Social 1080×1350", "YouTube thumbnail", "Print 300 dpi") combining size, format, filter and watermark.
28. Add embedded metadata on export (capture time, source name, timecode, EXIF `ImageDescription`) with a privacy toggle to strip it.
29. Add 16-bit/high-quality PNG, AVIF and JPEG XL export where the browser supports encoding, with feature detection.
30. Add lossless frame-exact seeking using WebCodecs decode instead of video-element seeking, to avoid off-by-one frames.
31. Add capture from a webcam, screen share or window (getDisplayMedia) as a source, with the same capture and record tools.
32. Add "capture every N seconds" and "capture on motion" for live sources.
33. Add undo/redo for gallery actions (delete, merge, reorder).
34. Add a compare-two-frames view (side by side, slider, difference heat map).

## C. Photo editor (35–58)

35. Add a non-destructive adjustment stack with per-adjustment toggle and re-order, saved with the frame.
36. Add masks: brush, linear gradient, radial gradient, and luminosity/colour-range masks for any adjustment.
37. Add a healing brush (content-aware patch) distinct from clone stamp.
38. Add a lasso, polygon and magic-wand selection tool with feather and invert.
39. Add AI background removal (lazy-loaded local segmentation model such as an ONNX/TF.js salient-object model) with refine-edge brush.
40. Add a background replace tool (colour, blur, gradient, image).
41. Add perspective correction and a skew/warp tool with a grid overlay.
42. Add lens-distortion and vignette correction, plus chromatic-aberration removal.
43. Add a liquify/warp brush.
44. Add colour grading wheels (shadows/mids/highlights) and a HSL per-channel panel.
45. Add LUT import (`.cube`) for stills and a built-in LUT library with intensity slider.
46. Add curves per channel and an eyedropper for black, white and grey points.
47. Add text layers with fonts (system + a bundled open font set), outline, shadow, curved text and templates.
48. Add shape layers (rectangle, ellipse, arrow, line, callout) with fill, stroke and corner radius.
49. Add a sticker/emoji layer set and a user-uploaded image layer with transform handles.
50. Add layer groups, opacity per layer, lock/hide, drag-to-reorder and merge down.
51. Add a smart-guides/snapping system with rulers and user guides.
52. Add blur tools: Gaussian, motion, tilt-shift and a pixelate/redact brush for hiding sensitive details.
53. Add automatic redaction (detect faces, text and licence plates locally) with one-click blur.
54. Add history panel with named snapshots, jump to any state, and persist history per frame.
55. Add before/after toggle (hold backslash) and split view in the editor.
56. Add crop presets (1:1, 4:5, 9:16, 16:9, passport) with rule-of-thirds, golden-ratio and diagonal overlays, plus straighten.
57. Add an export dialog with format, quality, size, estimated file size and live preview.
58. Add copy adjustments from one frame and paste to many (sync settings), plus "apply to all".

## D. Enhance and upscale (59–76)

59. Add a larger, higher-quality AI upscaler as an optional download (self-hosted, lazy, cached) alongside the slim model, with a clear size warning.
60. Add a face-restoration pass (local model) as an optional post-step for upscaling.
61. Add tile-based AI upscaling with progress, cancel and memory-safe tile sizes so large frames do not crash.
62. Prefer WebGPU for TensorFlow.js/ONNX when available, with automatic fallback to WebGL then WASM; surface the active backend in Settings and benchmark it.
63. Add AI denoise (learned) as an option beside the bilateral filter.
64. Add AI deblur / motion-blur removal (deconvolution) with strength and angle detection.
65. Add JPEG/compression artefact removal for low-quality screen recordings.
66. Add auto colour-match between frames (match the look of a reference frame).
67. Add auto-crop of black bars and detected letterboxing.
68. Add auto-straighten using horizon/line detection.
69. Add HDR-style tone mapping and a local-contrast pass with halos controlled.
70. Add temporal denoise for video (motion-compensated or frame-blend) in the video exporter.
71. Add video stabilisation (feature-tracking, crop-and-smooth) with strength control.
72. Add video upscaling using the AI model on keyframes plus sharpened resize between them, with a quality/speed slider and ETA.
73. Add frame-rate interpolation (optical-flow or blend) to create smooth 60 fps or slow motion.
74. Add a before/after preview for every enhance tool using a movable split slider on the actual frame.
75. Add "Enhance presets" (Screenshot clean-up, Old video, Low light, Portrait, Text/UI) that chain tools, and let users save their own.
76. Add an upscale-and-sharpen benchmark page showing time, memory and a visual comparison of all modes on a sample image.

## E. Video editing (77–96)

77. Add multiple video and audio tracks on the timeline with drag, snap and ripple/overwrite modes.
78. Add transitions between clips (cross-fade, dip to black, wipe, slide) with duration control, rendered in export.
79. Add keyframes for position, scale, rotation, opacity and filters, with easing curves.
80. Add picture-in-picture overlay clips and a green-screen (chroma key) effect.
81. Add speed ramps and reverse playback per clip, with audio pitch preserved on speed change (time-stretch in a worklet).
82. Add audio tools: waveform editing, per-clip gain, fade handles, a mixer, noise reduction and loudness normalisation (LUFS).
83. Add background music/voice-over recording from the microphone directly onto a track.
84. Add subtitle/caption tracks: import SRT/VTT, edit inline, style, burn in on export, and optional on-device speech-to-text (lazy-loaded model).
85. Add animated titles and lower thirds from templates.
86. Add text-based editing using the transcript (delete words to cut the video).
87. Add automatic scene detection with one-click "split at cuts".
88. Add silence removal and "remove filler pauses" with a threshold.
89. Add freeze-frame, and "insert captured frame as a clip" with duration.
90. Add crop, rotate, mirror and aspect-ratio reframing per clip, with smart reframe following a tracked subject.
91. Add colour grading for video clips using the same adjustments and LUTs as the photo editor.
92. Add export presets (YouTube 1080p/4K, Instagram Reels, TikTok, X, Discord 8 MB, WhatsApp), with bitrate calculation to hit a target file size.
93. Add export of an audio-only file (M4A/WAV/MP3) and an image-sequence ZIP.
94. Add background export in a worker with a persistent progress panel, cancel, and resume-after-reload where possible.
95. Add project save/load (`.framecap` file containing clips, edits, markers and settings, with media referenced by name or embedded optionally) and autosave with recovery.
96. Add proxy generation for large 4K files so editing stays smooth, while export uses the original.

## F. GIF, animation and sharing (97–108)

97. Add a dedicated animation editor with a frame timeline: per-frame delay, reorder, duplicate, reverse, ping-pong, delete ranges.
98. Add GIF optimisation modes (target file size, lossy compression, palette per frame vs global, dithering choices) with a live size estimate.
99. Add animated WebP and AVIF export, plus MP4/WebM loops for sharing, with size comparison.
100.  Add a transparent-background GIF/APNG/WebP export (using the magic eraser or AI background removal on every frame).
101.  Add text, sticker and caption overlays that apply across a frame range of the animation.
102.  Add crossfade between the last and first frame to make seamless loops, with a loop-quality score.
103.  Add "stabilise and loop" for cinemagraphs: freeze everything outside a painted mask.
104.  Add sprite-sheet and tile-set export presets for game engines, with JSON atlas output.
105.  Add a share sheet using the Web Share API with files, plus copy-as-GIF to clipboard where supported.
106.  Add social-ready size templates and safe-area guides for animation export.
107.  Add a side-by-side/before-after video or GIF generator (slider wipe animation).
108.  Add a "make a storyboard" export (frames with captions as a PDF or image).

## G. Interface, workflow and settings (109–120)

109. Add a command palette (Ctrl/Cmd+K) with every action searchable and recent actions first.
110. Add a customisable workspace: dockable, collapsible and resizable panels, saved layouts, and a "focus" layout per step.
111. Add a persistent, searchable media bin for loaded videos and images with thumbnails, tags and favourites.
112. Add a global progress/jobs tray showing every running export, enhance and upscale job.
113. Add onboarding sample projects (a short clip, a screenshot to fix, a GIF to optimise) that teach each workflow step in-app.
114. Add a light/dark/high-contrast theme set, accent colour choice and a UI density setting.
115. Add full keyboard remapping with conflict detection, import/export of the keymap, and a printable cheat sheet.
116. Add an "undo everything for this video" safety net with a recoverable trash for deleted frames (30-day, local).
117. Add storage manager: per-video usage, clear caches, export-all backup ZIP and restore, and a warning before the browser evicts data (`navigator.storage.persist()` prompt).
118. Add a performance mode that lowers preview resolution and disables heavy filters on slow devices, auto-suggested after dropped-frame detection.
119. Add real localisation for Spanish, French, German, Portuguese, Japanese and Simplified Chinese with a language switcher and RTL-ready layout.
120. Add an in-app "What's new" dialog driven by `CHANGELOG.md`, and a lightweight local-only error report you can copy to GitHub issues.

## Finish

1. Run the full check suite once more and make sure CI on `main` is green.
2. Write `docs/IMPROVEMENTS-V2.1.md` with the status table and a "Manual steps for the owner" section.
3. Reply with: number Done / Partial / Skipped, the three riskiest changes, anything you could not verify (for example behaviour on real GPUs), and the commit range pushed.
