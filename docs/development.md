# Development

The development stack consists of a dedicated volatile Valkey instance, the Rust HTTP service and a Vite/Svelte client. Use synthetic content. Local development does not reproduce the production host's swap, dump, filesystem or network controls.

## Prerequisites

- Node 24, matching the `engines` field in the root `package.json`.
- The pnpm version recorded in `packageManager` (currently `11.25.0`).
- Rust at least the `rust-version` in `server/Cargo.toml`, with Cargo, rustfmt and Clippy.
- A Valkey installation supporting the Lua flags used here; the application targets a standalone primary, not a cluster or automatic failover topology.
- A C toolchain required by native Rust dependencies, and a browser with WebCrypto, WebAssembly and module workers.

Linux is the reference environment for the server and real-cache tests. On Windows, the TypeScript checks can run natively; use WSL or a dedicated Linux environment for the complete Valkey/Rust stack. Do not point tests at a shared or production cache.

Check the installed tools:

```sh
node --version
pnpm --version
rustc --version
cargo --version
valkey-server --version
```

Clone and install from the lockfile:

```sh
git clone https://github.com/RedCamel1312/erase.to.git
cd erase.to
pnpm install --frozen-lockfile
pnpm build
```

The browser build is written to `web/dist`. The Rust binary serves that directory in production. Vite's development server additionally provides hot reload and proxies `/api` and `/healthz` to port 3001.

## Start an isolated cache

The following commands assume Bash and three terminals. First verify that port 6379 is not already occupied by a service you need. Start a **new, dedicated** cache in a fresh directory in terminal A:

```sh
ERASE_CACHE_DIR=$(mktemp -d)
valkey-server --bind 127.0.0.1 --port 6379 --protected-mode yes \
  --dir "$ERASE_CACHE_DIR" --save '' --appendonly no \
  --maxmemory 512mb --maxmemory-policy noeviction \
  --slowlog-log-slower-than -1 --slowlog-max-len 0 \
  --latency-monitor-threshold 0 --latency-tracking no --acllog-max-len 0 \
  --loglevel warning
```

Leave this foreground process running. A bind failure means another service occupies the port; do not continue against that unknown service. Choose another free port consistently if needed. The fresh directory avoids loading an unrelated pre-existing snapshot. Disabling persistence does not prevent OS swap or provider snapshots; only synthetic data belongs in this environment.

In terminal B, verify the intended cache configuration:

```sh
valkey-cli -h 127.0.0.1 -p 6379 PING
valkey-cli -h 127.0.0.1 -p 6379 CONFIG GET save appendonly maxmemory maxmemory-policy
```

Expect `PONG`, an empty `save` value, `appendonly` set to `no`, a nonzero memory limit and `noeviction`. The API checks the required persistence/memory settings before publishing a new cache connection, including reconnects.

## Run the API

From the repository root in terminal B:

```sh
export CACHE_URL='redis://127.0.0.1:6379/'
export PUBLIC_ORIGINS='http://127.0.0.1:3300,http://127.0.0.1:3001'
export BIND='127.0.0.1:3001'
export STATIC_DIR="$PWD/web/dist"
export CACHE_PREFIX='erase-dev:{notes}:'
cargo run --locked --manifest-path server/Cargo.toml --bin erase-server
```

`PUBLIC_ORIGINS` contains exact origins without trailing slashes. Host and origin checks intentionally reject unrelated names: `localhost` and `127.0.0.1` are different origins. Use the addresses in the example consistently, or update both the configuration and browser URL.

Leave `REQUIRE_SAFE_CACHE` enabled for ordinary development. Tests that deliberately exercise cache errors may override it in their own isolated configurations. That override is not an operational workaround for an unsafe production cache.

The default proof difficulty is 18 leading zero bits. To reduce waiting during exclusively local synthetic testing, set `POW_BITS=4` before starting the API. Do not copy that test setting to a public deployment. Other admission settings are documented in `server/src/config.rs` and the [operations guide](operations.md); relax them only for a specific local test that requires it.

## Run the browser client

In terminal C, from the repository root:

```sh
pnpm dev
```

Open `http://127.0.0.1:3300`. A browser request to that origin reaches Vite, whose proxy forwards API traffic to the backend. Both origins are allowed in the API configuration so the browser and direct CLI testing can use the same instance. The API does not enable general cross-origin access.

To inspect the production build instead of hot reload, open `http://127.0.0.1:3001` after `pnpm build`. Vite development mode is not a production deployment and must not be exposed publicly. Verify production CSP, worker loading and headers against the Rust-served build separately.

## Build dependency replacement

The Svelte Vite plugin requests `deepmerge@4.3.1`. This repository resolves that one consumer to the published [`@stackline/deepmerge@1.1.0`](https://github.com/alexandroit/stackline-deepmerge/tree/v1.1.0) package through a scoped pnpm override. The original `deepmerge` package and the former local patch are absent from the lockfile. The replacement's real package name, version and integrity hash remain visible; this is not an advisory exclusion or a relabeled copy of the affected package.

The replacement preserves the API used by the plugin and rejects `__proto__` in both object-copy directions. It has no runtime dependencies or installation hooks. Its [LICENSE](licenses/npm/stackline__deepmerge-1.1.0/LICENSE) and [NOTICE](licenses/npm/stackline__deepmerge-1.1.0/NOTICE) are included unchanged. It is used only to merge build configuration and is not bundled into the application or CLI.

This is a small, comparatively young upstream project. The exact version is pinned instead of accepting a floating range. The override is limited to the reviewed Svelte plugin version so a plugin upgrade requires another compatibility review. Prefer a supported Svelte release without the original dependency when one is available; reassess and remove the override then.

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run web/tests/build-dependency.test.ts
pnpm audit --audit-level low
pnpm build
```

The tests resolve the package from the actual plugin, assert its published identity, and exercise the ESM and CommonJS exports. Coverage includes nested placeholder and null-prototype cases, arrays, callbacks, compiler options, RegExp values and the plugin's own configuration pipeline. Frozen installation, the production build and container checks run in CI. The complete JavaScript audit includes build tools and fails from Low severity upward without exclusions.

## Shared protocol and worker boundaries

`shared/` is the source of truth for binary encoding, canonical metadata, capabilities, XChaCha20-Poly1305, Argon2id, HKDF and proof of work. Browser and CLI consumers must not create their own approximate versions of these routines.

The browser worker owns recipient key material and performs expensive cryptography. The UI receives only the minimum results it needs. Each sensitive controller uses generation tickets and an absolute inactivity deadline. Adding an asynchronous step requires checking both before it can restore state. Worker completion or a network reply must not count as user activity.

Do not introduce local draft storage, a service worker, request logging, automatic retries of `/open`, previews of untrusted files, or remote UI dependencies without revisiting the [threat model](threat-model.md). Theme preference is separate from sensitive session state.

Changes to the header or key-derivation labels are protocol changes. Update [the specification](protocol.md), cross-client tests, server validation and client limits together. Canonical JSON bytes are authenticated; an apparently harmless serialization change can make existing ciphertext fail verification.

## Checks and debugging

```sh
pnpm check
pnpm test
pnpm build
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --locked --manifest-path server/Cargo.toml --all-targets -- -D warnings
CACHE_URL='redis://127.0.0.1:6379/' cargo test --locked --manifest-path server/Cargo.toml
```

The Rust integration tests require their own isolated cache; stop ordinary development traffic or use a second dedicated cache before running them. They use administrative operations and temporary namespaces. See [testing](testing.md) for the exact coverage and separate cross-client smoke test.

Debug with synthetic content and inspect structural events rather than printing keys, request bodies or complete links. Avoid adding a trace middleware that records every route: `/api/notes/:id` still contains an identifier, even though sharing links put it in the fragment. A cache `MONITOR` session or slow-command log can also retain request material beyond its intended lifetime.

Stop foreground development processes with Ctrl-C when finished. The cache has no persistence, so its stored packages disappear when it stops. The temporary cache directory should contain no message snapshot under this configuration; inspect it before any manual cleanup. Production updates and cache lifetime are covered separately in [operations](operations.md).
