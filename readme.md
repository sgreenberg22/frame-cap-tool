# FrameCapture

A video analysis studio that runs entirely in your browser: load a video, scrub it with speed and filter controls, capture single or batch screenshots, annotate them, and export GIFs.

Nothing is uploaded. All processing happens locally.

## Local dev

```bash
npm ci
npm run dev
# open http://localhost:5173
```

## Deploy

Pushing to `main` runs CI (lint, tests, build) and then deploys to Fly.io with `flyctl deploy --remote-only`. The repo needs a `FLY_API_TOKEN` secret.
