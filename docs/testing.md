# Testing and verification boundaries

For the hosted build, release assets from 3.2.0 include `web-SHA256SUMS.txt`. This lists the uncompressed files the operator built, including the worker. To compare a local build, check out the release tag, install the pinned dependencies, and set `VITE_I2P_URL` and `VITE_ONION_URL` to the exact origins printed in the checksum file. Run `pnpm build` and then `sha256sum -c /path/to/web-SHA256SUMS.txt` inside `web/dist`. When comparing served bytes, fetch the root document at `/` and the other files at their listed paths with HTTP content encoding decoded. Matching bytes for one check do not establish how every visitor was served or how the backend is configured.

The test suite separates cryptography, client lifecycle, HTTP/cache behavior and deployment checks. Passing one layer does not establish another. Use synthetic data and an isolated Valkey instance. Never run integration or fault-injection tests against a live message cache.

Install the pinned dependencies and prepare the tools in [development](development.md). Test counts change as regressions are added; use the command output for the current count instead of treating a number in prose as a release certificate.

## TypeScript and browser build

From the repository root:

```sh
pnpm check
pnpm test
pnpm audit --audit-level low
pnpm build
```

`pnpm check` runs Svelte checking and strict TypeScript checking. `pnpm test` runs the Vitest files selected by `vitest.config.ts`. `pnpm build` produces the production browser assets and worker bundle. A successful build alone does not demonstrate that the worker can initialize under a deployed Content Security Policy.

Run a focused group when investigating a failure:

```sh
pnpm exec vitest run shared/protocol.test.ts
pnpm exec vitest run web/tests/lifecycle.test.ts web/tests/transport.test.ts
pnpm exec vitest run cli/client.test.ts
```

### Shared cryptography and envelope tests

`shared/protocol.test.ts` exercises the real cryptographic implementation, including:

- An upstream libsodium XChaCha20-Poly1305 known-answer vector.
- HKDF outputs reproduced independently using Node's native implementation.
- Separate metadata/read/encryption/revocation roles and the continuing need for the random link secret in passphrase mode.
- Local rejection of a wrong passphrase before a consuming action.
- Tampered ciphertext, tag and exact header bytes.
- Unicode, byte-order marks, control characters, binary files and empty files.
- A complete 64 MiB authenticated-encryption/decryption round trip with a passphrase, content-hash comparison, rejection of one extra byte, the 8 MiB text limit and exact padding boundaries.
- Canonical base64url/header parsing, invalid ranges, truncated content, unsafe names and duplicate filenames.
- Bit-based proof of work, expiry and cancellation.

The cryptographic tests run with the installed libsodium dependency and WebCrypto in Node. They are interoperability and regression evidence, not a new proof of the primitives or an independent audit of the complete protocol.

### Browser-controller and transport tests

`web/tests/theme.test.ts` checks the System default, light fallback, live system changes, blocked storage and the System → Light → Dark → System button cycle. `web/tests/build-dependency.test.ts` checks the exact merge package resolved by the Svelte plugin, both published entrypoints and the real configuration pipeline. The complete dependency audit includes build tools without exclusions.

`web/tests/lifecycle.test.ts` uses controlled asynchronous completions and clocks to check cancellation, duplicate submissions, wrong-passphrase handling, warning/expiry behavior, hidden-tab clearing and delayed results. A result arriving after clearing or after a suspended deadline must not repopulate a draft, secret or plaintext view. Network or worker completion must not extend the last-activity deadline.

`web/tests/transport.test.ts` checks request privacy options, response size limits, unsupported remote limits, consuming-call failures and worker termination. These tests use controlled transports/workers. They do not replace a real browser test of DOM event trust, clipboard permissions, downloads, WebAssembly loading, visibility events or accessibility.

### CLI tests

`cli/client.test.ts` checks allowed origins, rejection of unsupported Tor and I2P transports, bounded file reads, unsafe output names, duplicate names, overwrite refusal and the generated text filename. A loopback HTTP allowance is for development; remote HTTP is rejected.

## Rust protocol tests without a cache

```sh
cargo test --locked --manifest-path server/Cargo.toml --test protocol
```

These tests validate the server's envelope parser and proof verification without running Valkey. They cover header bytes, duplicate/unknown/missing fields, canonical encodings, bounded sizes/ranges and proof binding. The server cannot validate an encrypted file name or plaintext size directly; those checks belong to the client decoder after authentication.

Run formatting and lint checks as well:

```sh
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --locked --manifest-path server/Cargo.toml --all-targets -- -D warnings
```

## Real Valkey integration tests

Start a new, isolated cache using [the development command](development.md#start-an-isolated-cache). Ensure it contains no real notes and is not shared with another application. The suite requires administrative cache access for temporary ACL users and accelerated synthetic expiry. It must not be given a production socket or credentials.

```sh
export CACHE_URL='redis://127.0.0.1:6379/'
cargo test --locked --manifest-path server/Cargo.toml --test cache_api
```

To run all Rust tests against that isolated cache:

```sh
CACHE_URL='redis://127.0.0.1:6379/' cargo test --locked --manifest-path server/Cargo.toml
```

The integration test creates its own HTTP listeners and random cache namespaces. It also launches separate compiled server processes to test coordination beyond a single Tokio runtime. The tested scenarios include concurrent opens, role-confused capabilities, revocation, challenge reuse, atomic challenge spending, quota failure without spending a valid proof, ID collision, native expiry, namespace loss, challenge bounds, altered packet proofs, source isolation and request-origin checks.

A deliberate cache-permission failure denies an operation after an initial record write. The test checks that compensation removes the partial record and preserves the unspent proof. This matters because script atomicity prevents interleaving but is not automatic rollback of previous successful commands.

Namespace cleanup is convenient, not permission to use a shared cache. Failed tests can leave synthetic keys or temporary administrative state behind. Restarting the dedicated nonpersistent test cache provides a clean starting point; do not use broad cache-clearing commands on another service.

The race tests assert the configured number of successful responses under their healthy test transport. The service guarantee remains **at most** the configured number of authorized retrievals. A real connection may fail after consumption. Asynchronous replica failover and restored snapshots are outside this topology and can invalidate strict consumption semantics.

The transport unit tests in `server/src/transport.rs` use paused Tokio time to check that continuous incoming bytes do not extend an absolute connection lifetime and that a stalled outgoing write is interrupted. The running binary wraps accepted TCP streams in this deadline layer. These tests complement the application request/body limits; reverse-proxy timeouts and connection budgets still require separate verification.

## Cross-client HTTP smoke test

Start the local API with the development origins, a reduced local proof difficulty if appropriate, and enough local admission capacity for the smoke test. Run the synthetic test against that explicit origin:

```sh
pnpm exec tsx tests/e2e.ts --server http://127.0.0.1:3001
```

The script uses the real shared encryption code and HTTP API for synthetic text/file packages and access races. It is a mutating test: it creates and consumes its own packages. The `--server` argument is deliberately explicit; do not point it at an arbitrary host or infer authorization to test a public service. Only an operator-authorized release smoke test should target a deployed instance.

This test does not inspect kernel settings, proxy temporary files or browser rendering. Keep its output free of secret URLs, content and capabilities. See the script for its current assertions; add tests alongside any new protocol behavior.

### Maximum-size HTTP round trip

After applying the 64 MiB request and cache-buffer settings, exercise the complete transport boundary against the same explicitly selected test instance:

```sh
pnpm exec tsx tests/large-handoff.ts --server http://127.0.0.1:3001
```

This transfers a synthetic package containing 8 MiB of text and 56 MiB of binary file data, with an additional passphrase. It verifies the complete text, file length and SHA-256 digest, the remaining retrieval count, revocation and rejection of a later open. It uses real encryption, proof of work and HTTP, and attempts to remove its own remaining package on exit. It must have enough cache capacity and must not be run against a live cache without the operator's authorization.

The Node process can use several hundred MiB while performing this test. Its result establishes behavior for the tested client, transport and server configuration; it does not establish browser peak memory or usability on every device. Test the real browser and network route separately, especially for mobile devices and Tor.

## Manual browser acceptance

Use the Rust-served production build, synthetic files and a fresh browser context. Check the following behaviors in the supported browsers:

1. Create and open text, binary attachments and a package containing both. Compare received bytes with the original synthetic files.
2. Supply an incorrect passphrase, then a correct one. Confirm that the first attempt sends no consuming request and the note remains available.
3. Open a complete link and confirm that both ID and secret disappear from the current address bar. A link without a key must cause no metadata/open fetch.
4. Clear while encryption, proof work, upload, access preparation or decryption is pending. No delayed result should restore cleared state.
5. Check the 30-second warning, five-minute inactivity expiry and foreground return after suspended timers. Hiding decrypted content clears it; briefly hiding an unopened recipient context does not immediately destroy it.
6. Download a file only through the explicit action. Confirm that no preview or remote content loads and object URLs are revoked after use/clearing.
7. Navigate with the keyboard, inspect focus/error feedback and test narrow screens. Verify System follows the browser color preference with a light fallback, explicit Light/Dark overrides survive navigation, and returning to System removes the stored override. Check early theme loading against the built production server, not only Vite.
8. Check the real response CSP and worker behavior, including WebAssembly. Verify no third-party requests, service worker or persistent sensitive browser data.

Run `python3 tests/proxy_admission.py` on Linux with nginx and OpenSSL installed. It creates private listeners and a synthetic upstream. Do not load-test public endpoints. For [I2P](i2p.md), check the full editor through a separate router identity, including a passphrase-protected transfer and rejection of a second open. A local HTTP health check alone does not establish that the I2P route or browser cryptography works.

For an onion deployment, repeat the relevant checks in Tor Browser on the onion origin. An ordinary browser or a CLI that simply accepts an onion-looking string is not a Tor transport test. The current CLI rejects onion origins.

## Deployment verification

The [operations guide](operations.md) covers actual TLS, service isolation, volatile cache configuration, swap, core dumps, proxy buffering and log behavior. Verify those properties on the running host after deployment. A local unit test cannot establish that a provider avoids snapshots or that an external proxy has logging disabled.

Record the source revision, lockfiles, artifact hashes, executed commands, results and any unverified boundaries in release evidence. Do not include production secrets or captured user messages. Source findings should be reported as source findings; they do not prove that an older live deployment was exploited.
