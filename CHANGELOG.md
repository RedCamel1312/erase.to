# Changelog

## 3.1.1 — 2026-11-04

- Restore the theme button: System, Light and Dark.
- Expand the project introduction and usage guide in all five languages.
- Replace `deepmerge` and remove the local build dependency patch.
- Include build dependencies in CI security checks.

## 3.1.0 — 2026-11-04

- Follow the system color scheme by default, with a light fallback.
- Fix the production route for the startup theme script.
- Bound memory use when reading browser and CLI responses.
- Add Chinese and Portuguese READMEs and improve the project documentation.

## 3.0.0 — 2026-11-04

- Rebuild the service with Rust, Svelte and volatile Valkey storage.
- Encrypt text and files on the client, with an optional passphrase.
- Support 64 MiB packages, including 8 MiB of text and eight files.
- Enforce expiry and retrieval limits atomically; add sender revocation.
- Add proof of work, local session cleanup, a CLI and optional Tor access.

Version 3.0.0 introduces a new protocol and cannot open links from the earlier PHP or Node.js implementations. Versions 3.1.0 and 3.1.1 retain that protocol. Updating the application does not require restarting the message cache.
