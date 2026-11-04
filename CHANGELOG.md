# Changelog

## 3.1.1 — 2026-11-04

- Restore a compact color-theme button with a System, Light and Dark cycle. System remains the default, with a light fallback.
- Expand the project introduction, purpose and usage guide in all five README languages. Keep detailed operational material in optional sections.
- Replace the affected build-only merge package with a pinned published alternative. Remove the local patch and check both exported entrypoints and the real Svelte configuration pipeline.
- Audit all JavaScript dependencies in CI, including build tools, from Low severity upward without advisory exclusions.
- Keep the message protocol, retention limits and existing links unchanged.

## 3.1.0 — 2026-11-04

### Interface and documentation

- Follow the browser or system color scheme by default, with a light fallback and explicit System, Light and Dark choices. System changes apply while the page is open; returning to System removes the stored override.
- Serve the early theme script through the production API router and verify startup resources in end-to-end checks.
- Keep the editor compact while improving attachment limits, control labels and keyboard feedback.
- Give the project and privacy pages a more personal explanation from the maintainer, with implementation details behind an optional disclosure.
- Add complete Simplified Chinese and Brazilian Portuguese introductions alongside English, German and Spanish. A documentation index and expandable README sections make deeper material easier to find.

### Reliability

- Bound browser and CLI response allocation independently of network chunk count. Check declared response lengths, account for decoded content, cancel rejected streams and release readers on every exit path.
- Preserve the existing cryptographic format and retention behavior. This update remains compatible with 3.0.0 links; ordinary deployment does not restart the cache.

At this release, a build-only dependency advisory was mitigated by a pinned local patch. Version 3.1.1 replaces that dependency and removes the patch.

## 3.0.0 — 2026-11-04

The application has been rebuilt around a versioned client-encrypted protocol, a Rust HTTP service and a dedicated volatile Valkey primary. The editor is available directly at the root URL.

### Handoffs

- Text and encrypted file attachments share one bounded package: up to 64 MiB total, up to 8 MiB UTF-8 text and eight files.
- XChaCha20-Poly1305 authenticates the content and its exact protocol header. File names and media types are encrypted, and plaintext is padded to 4 KiB buckets.
- A random 256-bit link secret is always required. An optional Argon2id passphrase adds a separate requirement; a wrong passphrase does not consume a retrieval.
- Expiry and retrieval limits apply together. Authorization, consumption and final removal are atomic across application processes connected to the same cache.
- Senders can revoke a package with an independent capability retained in the creation session.
- The browser removes the received fragment from its current URL, clears inactive local sessions and clears decrypted content when its tab is hidden.
- Files are downloaded only on an explicit action; active content is never previewed by the application.

### Operation

- Single-use, payload-bound proof of work and shared global limits protect creation without IP-based visitor records.
- Bounded bodies, cache admission, concurrent operations and absolute connection deadlines constrain resource use. Capacity is rejected rather than handled by eviction.
- Deployment templates cover non-persistent cache storage, private sockets, disabled message logging, swap/core-dump controls, HTTPS and optional Tor onion access.
- A command line client shares the browser's protocol implementation, with bounded input, safe output paths and no automatic retry of consuming requests.
- English, German and Spanish introductions accompany protocol, threat-model, operations, development and verification documentation.

### Compatibility

This release uses protocol version 1 of the rebuilt application. It does not read links or records from earlier erase.to implementations. A deployment replacing an older version must account for outstanding links before switching. Clearing or restarting the volatile cache permanently discards its packages.

Retrieval limits govern server delivery, not copies made by recipients. RAM-only operation depends on the host and provider as well as the application. The project has not undergone an independent security audit; see the documented threat model and verification boundaries.
