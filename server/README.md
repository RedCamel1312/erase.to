# erase.to Rust server

Rust 1.99 or newer, Axum, Tokio and a dedicated Valkey instance. `Cargo.lock` pins the dependency graph. The server handles opaque encrypted packets; keys, passphrases, file names and message text are not server inputs.

```sh
cargo build --release --locked
PUBLIC_ORIGINS=https://erase.to \
CACHE_URL=redis+unix:///run/erase-cache/valkey.sock \
STATIC_DIR=../web/dist \
BIND=127.0.0.1:3001 \
./target/release/erase-server
```

Valkey must have `save ""`, `appendonly no`, a nonzero `maxmemory`, and `maxmemory-policy noeviction`. The server verifies those settings before publishing every new cache connection, including after reconnect. Its cache ACL must permit `CONFIG GET`. Deployment additionally needs disabled swap/core dumps, no command capture or slowlog, private cache access, no persistent replicas, and reverse-proxy connection/memory limits. See the repository deployment guide.

| Environment | Default | Purpose |
| --- | --- | --- |
| `BIND` | `127.0.0.1:3001` | Private HTTP listener |
| `PUBLIC_ORIGINS` | `http://localhost:3001` | Comma-separated exact origins, without trailing slashes |
| `CACHE_URL` | `redis://127.0.0.1:6379/` | Dedicated Valkey socket or loopback URL |
| `CACHE_PREFIX` | `erase:{notes}:` | Common namespace across application instances |
| `STATIC_DIR` | `../web/dist` | Built frontend assets |
| `POW_BITS` | `18` | Leading zero bits; accepted range 1–24 |
| `MAX_NOTES` | `2048` | Maximum admitted live records |
| `MAX_STORAGE_BYTES` | `268435456` | Conservatively charged packet/header/record budget |
| `MAX_CHALLENGES` | `4096` | Maximum live challenge leases |
| `MAX_IN_FLIGHT` | `2` | Per-process large-packet slots (2–256). Uploads may use all but one. Authorized opens can use every free slot. |
| `REQUESTS_PER_SECOND` | `100` | Total anonymous request allowance across instances, split equally between public/create and access. Each bucket can burst to twice its own rate. |
| `CHALLENGES_PER_SECOND` | `10` | Shared challenge token bucket |
| `CREATES_PER_SECOND` | `8` | Shared creation token bucket |
| `CACHE_TIMEOUT_MS` | `5000` | Bounds connection acquisition and individual cache operations |
| `REQUEST_TIMEOUT_MS` | `300000` | Bounds routing, request-body receipt and response construction |
| `CONNECTION_LIFETIME_SECONDS` | `360` | Absolute accepted TCP lifetime, including outgoing delivery; activity cannot extend it |
| `REQUIRE_SAFE_CACHE` | `true` | Cache safety check; disable only in controlled tests |

The request timeout is not a promise of successful delivery. The transport lifetime also bounds slow readers/writers. A consuming Valkey command may have executed even when its response is lost, so it is never automatically retried. A note permits at most its configured number of authorized retrievals; neither TCP nor the application can guarantee successful receipt or prevent recipients copying content.

### Admission during heavy traffic

Configuration, challenge issuance and creation share one anonymous allowance. Metadata, open and revocation use a separate allowance. At the default rate, each class can sustain 50 requests per second with a burst of 100. The challenge and creation limits apply within the public allowance. Each class has its own small-request concurrency limit per process, eight by default or `MAX_IN_FLIGHT` when larger. Unknown routes, incorrect methods and malformed note IDs cannot charge the access allowance. A capability body is limited to 1 KiB and has a five-second receipt deadline.

At the default packet limit, one upload can proceed alongside a download, or two downloads can proceed together. A live challenge lease is checked before a large upload is accepted. An open first checks the read capability and expiry without reading the packet or decrementing the count. Once a packet slot is available, a single Valkey command rechecks the capability, expiry and count and consumes the view. A capacity rejection at admission leaves the view intact. The slot stays with outgoing packet bytes until the transport releases them.

These limits reserve application resources during a creation flood. Traffic aimed at correctly shaped access endpoints can still exhaust their shared allowance, including requests with wrong tokens. Authorized downloads can occupy every packet slot. The proxy connection budget, network, CPU and cache are also shared. The service does not assign quotas to IP addresses or maintain a client identity.

An expired request-handling deadline returns HTTP 504 with `request_timeout`, distinct from storage-capacity errors. HTTP 408 is deliberately avoided because [Chromium automatically retries it on reused HTTP/1.1 connections](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/http/http_network_transaction.cc#1720). The timeout does not establish whether a consuming cache operation executed; clients must not automatically repeat an open or creation request. The five-minute browser inactivity policy remains separate, with its warning and explicit continuation action.

Every note has a native TTL plus a bounded expiry index for accurate quota reclamation. Fixed Lua scripts authorize and consume atomically across multiple application processes. Challenge leases have 420-second TTLs and are spent atomically with creation. Failed admission or a compensated cache write failure leaves the proof available and no partial note. On Valkey restart, records and outstanding leases disappear. Application-process restarts alone do not erase the shared cache.

There are no request, network-address, body, capability or message-ID logs. Startup emits generic readiness/failure messages only. API and HTML responses are `no-store`; metadata access cannot consume a note. Static paths are allowlisted, source maps are denied, and native form submission is blocked by CSP.

## Verification

Use an **isolated test Valkey**, never a production cache. Tests clean only their own random namespaces and do not issue `FLUSHDB` or `FLUSHALL`.

```sh
cargo fmt --all -- --check
cargo test --lib --test protocol --locked
CACHE_URL=redis+unix:///run/erase-tests/cache.sock cargo test --test cache_api --locked
cargo clippy --all-targets --locked -- -D warnings
cargo audit --file Cargo.lock
```

Integration tests use actual HTTP and Valkey, independent app instances, and two separate server processes. They cover concurrent retrieval counts, capability separation, revocation, replay, expiry, storage limits, failed partial writes, request boundaries and security headers. Parser tests include 1,000 deterministic bounded malformed inputs. Transport tests use virtual time to verify deadlines despite continuous activity and stalled outgoing data. An ownership regression verifies that outgoing byte frames retain their packet slot after the body has been dropped.

Load regressions exhaust the public rate allowance and stall an admitted upload while an existing recipient retrieves a one-view packet. Full-size tests upload two 64 MiB packets through separate instances and open both through one instance. They verify the three-record storage boundary, capacity rejection without proof or view consumption, and capability checks while both outgoing buffers are occupied.
