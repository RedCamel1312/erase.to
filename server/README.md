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
| `MAX_IN_FLIGHT` | `2` | Per-process API body/work slots, held by outgoing buffers until release; overload is rejected without queueing |
| `REQUESTS_PER_SECOND` | `100` | Shared anonymous API token bucket; burst is twice the rate |
| `CHALLENGES_PER_SECOND` | `10` | Shared challenge token bucket |
| `CREATES_PER_SECOND` | `8` | Shared creation token bucket |
| `CACHE_TIMEOUT_MS` | `5000` | Bounds connection acquisition and individual cache operations |
| `REQUEST_TIMEOUT_MS` | `300000` | Bounds routing, request-body receipt and response construction |
| `CONNECTION_LIFETIME_SECONDS` | `360` | Absolute accepted TCP lifetime, including outgoing delivery; activity cannot extend it |
| `REQUIRE_SAFE_CACHE` | `true` | Cache safety check; disable only in controlled tests |

The request timeout is not a promise of successful delivery. The transport lifetime also bounds slow readers/writers. A consuming Valkey command may have executed even when its response is lost, so it is never automatically retried. A note permits at most its configured number of authorized retrievals; neither TCP nor the application can guarantee successful receipt or prevent recipients copying content.

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

Integration tests use actual HTTP and Valkey, independent app instances, and two separate server processes. They cover concurrent retrieval counts, capability separation, revocation, replay, expiry, storage limits, failed partial writes, request boundaries and security headers. Parser tests include 1,000 deterministic bounded malformed inputs. Transport tests use virtual time to verify deadlines despite continuous activity and stalled outgoing data. An ownership regression verifies that outgoing byte frames retain their API slot after the body has been dropped. Full-size tests upload/open two 64 MiB packets concurrently, verify the three-record capacity boundary, and confirm that admission rejection preserves the proof.
