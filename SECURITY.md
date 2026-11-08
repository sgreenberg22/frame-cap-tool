# Security policy

FrameCapture runs entirely in the browser and never uploads user media. The production server only serves static files with a strict Content Security Policy.

## Reporting a vulnerability

Please report security issues privately via GitHub’s “Report a vulnerability” (Security tab → Advisories) rather than a public issue. Include steps to reproduce and the browser/version. You should get a response within a week.

## Scope

- XSS or CSP bypasses, ways to make the app send user media off-device, service worker cache poisoning, and dependency vulnerabilities are in scope.
- Issues requiring a malicious browser extension or physical access to an unlocked device are out of scope.
