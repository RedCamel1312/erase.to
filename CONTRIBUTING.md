# Contributing

Keep changes small enough to review. Describe the concrete failure or behavior change and its validation. Use English for code, comments, documentation and commit messages. Avoid changing the wire format without updating its version, specification, fixtures and every client.

## Local checks

Install the pinned pnpm version from `package.json`, Node.js 24 and a maintained stable Rust toolchain. Run:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
cd server
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Integration tests need a dedicated non-persistent Valkey instance. Never point test utilities at a live cache. Follow [development](docs/development.md) for isolated service setup.

## Review requirements

- No plaintext, passphrases, capabilities, full links, IP addresses or request headers in logs or error reports.
- Validate sizes before copying or allocating and again after decryption. Input validation belongs at every trust boundary.
- Keep cache decisions atomic; a process-local lock does not coordinate multiple servers.
- Never retry a consuming operation automatically after an ambiguous network failure.
- Do not introduce browser storage, tracking, external scripts, fonts, analytics, service workers or third-party error reporting.
- Document dependencies and preserve their license notices. Pin lockfiles and review dependency upgrades.
- Tests should exercise observable invariants and failure paths, including races and cancellation. Tests that only restate an implementation do not establish security.

Use the private reporting channel in [SECURITY.md](SECURITY.md) for vulnerabilities.
