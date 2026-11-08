# Contributing

Thanks for helping improve FrameCapture.

1. Use Node 22 (`nvm use`) and run `npm ci`.
2. `npm run dev` for the app, `npm test` for unit tests, `npm run lint` for lint.
3. Before a PR: `npm run build && npm run e2e`.
4. Keep the promise: no uploads, no analytics, no third-party requests carrying user media. Anything network-related must be opt-in.
5. Prefer native browser APIs and small dependencies. Explain any new dependency in the PR and lazy-load heavy code.
6. Keep UI accessible: labels on inputs, keyboard support, visible focus, and work at phone widths.

Commit hooks run ESLint and Prettier on staged files.
