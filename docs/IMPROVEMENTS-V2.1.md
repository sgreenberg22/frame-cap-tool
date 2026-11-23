# v2.1 improvement status

Status of the 120 items in [V3-IMPROVEMENT-PROMPT.md](V3-IMPROVEMENT-PROMPT.md).
**20 done · 8 partial · 92 not started.** Also added beyond the list: a standalone Photo page with HEIC and Live Photo import, and a before/after split view.

| #   | Item                                                  | Status  | Notes                                                                                                                                                                  |
| --- | ----------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Filmstrip of recent captures in fullscreen            | Done    | Opens the frame in the editor and leaves fullscreen.                                                                                                                   |
| 4   | Rotate and flip buttons in fullscreen                 | Done    | Crop-region selection is not included.                                                                                                                                 |
| 5   | Guide overlay toggle in fullscreen                    | Done    | Cycles thirds, safe area, off.                                                                                                                                         |
| 6   | Double-click / double-tap play and skip               | Done    | Centre toggles play, outer 30% each side skips 5 s. Tested with a mouse; touch uses the same event.                                                                    |
| 8   | Controls stay visible while hovered or focused        | Done    |                                                                                                                                                                        |
| 9   | Marker drawer in fullscreen                           | Done    | Jump only; rename is still in the main UI.                                                                                                                             |
| 10  | Self-timer (3-2-1) capture                            | Done    |                                                                                                                                                                        |
| 11  | Landscape lock on fullscreen                          | Partial | Code path added; not tested on a real phone, and browsers without orientation lock ignore it.                                                                          |
| 13  | Shortcut hint on entering fullscreen                  | Done    |                                                                                                                                                                        |
| 19  | Near-duplicate removal                                | Done    | Gallery → Enhance → Clean up. Fixed similarity threshold, confirm before delete; no review grid.                                                                       |
| 20  | Sharpness score on frames                             | Partial | Gallery "Sharpest first" sort, a 0–100 badge per frame, and "Select blurry frames". "Best frames" capture did not change; no face or closed-eye checks.                |
| 61  | Tile-based AI upscaling with progress and cancel      | Done    | Tiles were already used; added Cancel, UI that stays responsive between tiles, and transparency kept on AI results. Cancel measured at 1.2 s on a no-GPU test machine. |
| 62  | Prefer fast backend and show which one ran            | Partial | Shows the TensorFlow.js backend after an AI run. No WebGPU backend, no benchmark.                                                                                      |
| 66  | Match colour between frames                           | Done    | Gallery → Enhance → Match colour to first selected (histogram matching, per channel).                                                                                  |
| 67  | Auto-crop black bars                                  | Done    | Button in the editor's Enhance tab (the Studio already had a crop-region version).                                                                                     |
| 68  | Auto-straighten using horizon/line detection          | Done    | Transform tab; suggests an angle for you to check, then Apply.                                                                                                         |
| 36  | Brush, gradient and colour-range masks                | Partial | Brush, linear, circular and similar-colour masks for a fixed set of adjustments. No luminosity masks, and the mask is baked in (no re-editable layer).                 |
| 41  | Perspective correction with draggable corners         | Done    | Manual four-corner; no automatic edge detection.                                                                                                                       |
| 42  | Vignette, chromatic-aberration, lens-distortion fixes | Done    | Colour fringes, corner light, barrel/pincushion; manual, no lens profiles.                                                                                             |
| 44  | Grading wheels and HSL per-colour mixer               | Done    | Three tone-range wheels plus an 8-band mixer.                                                                                                                          |
| 74  | Before/after preview for enhance tools                | Partial | Upscale dialog previews a centre crop with a split slider. Other enhance tools have no preview yet.                                                                    |
| 75  | Enhance presets by content type                       | Partial | Upscale has Photo / Screenshot or UI / Old or noisy presets. No user-saved presets, no chains for other tools.                                                         |
| 87  | Split at scene changes                                | Done    | Scans the video and splits the clip list at each cut; sensitivity slider and cancel.                                                                                   |
| 88  | Silence removal                                       | Done    | Level and minimum length sliders; keeps a little room around speech. No filler-word detection.                                                                         |
| 92  | Target file size for video export                     | Partial | Bitrate solved from a size in MB, with Discord/email/WhatsApp/X presets. No per-platform resolution presets.                                                           |
| 93  | Audio-only export                                     | Partial | WAV only (cuts, speed, volume and fades applied). No M4A/MP3, no image-sequence ZIP.                                                                                   |
| 109 | Command palette (Ctrl/⌘ K)                            | Done    | Navigation, Studio actions, themes, What's new; recent commands first.                                                                                                 |
| 120 | What's new dialog from CHANGELOG                      | Done    | Opened from the palette. The local error report already existed in Settings.                                                                                           |

Already present before this pass, so not counted: copy/paste images (24), filename templates (26), asking the browser for persistent storage (part of 117).

## Notes for the owner

- Hosting moved to Cloudflare Pages. `public/_headers` now carries the CSP and caching rules the nginx config used to provide. Check the live site's response headers after the next Cloudflare build.
- Canonical, sitemap and social-image URLs now point at `https://frame-cap-tool.pages.dev`. If the site uses a custom domain, change them in `index.html`, `public/robots.txt` and `public/sitemap.xml`.
- The `<hash>.frame-cap-tool.pages.dev` URL you shared is one commit's snapshot. Open the project's main `pages.dev` address to see the latest build.
