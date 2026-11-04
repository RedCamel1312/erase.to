# Operating an instance

The deployment consists of the application, a dedicated volatile Valkey primary and an HTTPS reverse proxy. The native templates target a dedicated Linux host with systemd. Docker Compose is an alternative. Neither approach removes the need to review host swap, crash dumps, network exposure and provider snapshots.

## Runtime boundaries

| Process | Required access | Deliberately absent |
| --- | --- | --- |
| nginx | Public HTTP/HTTPS, certificates, loopback API | Request logs, proxy cache, disk-backed request buffering |
| erase-server | Read-only binary/assets, loopback listener, cache socket | Shell commands from requests, message files, outbound internet access |
| Valkey | Private Unix socket, bounded RAM | Public listener, snapshots, AOF, swap, command capture |
| Tor, optional | Tor network, private onion identity, local proxy socket | Public SOCKS/Control port, exit relay operation |

The native cache uses a Unix socket and a private network namespace. It has no TCP listener. Its writable runtime directory is under `/run`. The application and cache run as separate unprivileged users with access through a dedicated group. Service isolation includes read-only system paths, empty capability sets, no privilege escalation, no executable writable memory and resource ceilings.

## Build

Use Node.js 24, pnpm 11.25.0 and Rust 1.99.1. Lockfiles are part of the source distribution.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
cd server
cargo build --release --locked
```

Build on the target operating system or in the supplied container. A Linux binary built against a newer glibc may not run on an older distribution. The provided Docker build uses Debian Bookworm for both the Rust build environment and runtime. Do not build against a production message cache.

An installed release contains `erase-server`, a `web/` directory copied from `web/dist/`, the license notices and a source revision manifest. Keep releases under `/opt/erase/releases/REVISION` and point `/opt/erase/current` at the active release. Runtime users must not be able to modify a release.

## Native services

Install nginx, Valkey, a certificate renewal client and the native build prerequisites from maintained distribution repositories. Create a system user/group named `erase-to`; the cache template uses the distribution's `valkey` user with group `erase-to`.

```sh
install -d -m 0750 -g erase-to /etc/erase
install -m 0644 deploy/valkey.conf /etc/erase/valkey.conf
install -m 0644 deploy/erase-cache.service /etc/systemd/system/
install -m 0644 deploy/erase.service /etc/systemd/system/
install -m 0600 deploy/server.env.example /etc/erase/server.env
```

Edit `server.env` for the public origin and installed asset path. It is read by systemd; it need not be readable by the application account. Cache configuration must be traversable/readable by its runtime account. Disable an unused distribution-default Valkey service so it does not expose an additional listener.

```sh
systemctl daemon-reload
systemctl enable --now erase-cache.service
valkey-cli -s /run/erase-cache/valkey.sock PING
systemctl enable --now erase.service
curl --fail http://127.0.0.1:3001/healthz
```

`/healthz` returns 200 only when cache connectivity and readiness succeed. Detailed diagnostics are intentionally not public. Ordinary application restarts preserve live packages if Valkey remains running. Restarting the cache or host destroys them. This is intentional; do not add a backup or snapshot job for the cache.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `BIND` | `127.0.0.1:3001` | HTTP listener. Keep it private behind the proxy. |
| `PUBLIC_ORIGINS` | Development origin | Comma-separated exact origins, without trailing slashes. Include the onion origin only if deployed. |
| `CACHE_URL` | `redis://127.0.0.1:6379/` | Private cache connection; use the Unix socket example for native deployment. |
| `CACHE_PREFIX` | `erase:{notes}:` | Bounded key namespace. Independent application instances must share it to coordinate access. |
| `POW_BITS` | `18` | Client creation work factor; increasing it costs battery and may exclude slower devices. |
| `MAX_CHALLENGES` | `4096` | Upper bound on concurrent creation challenges. |
| `MAX_NOTES` | `2048` | Maximum number of live packages. |
| `MAX_STORAGE_BYTES` | `268435456` | Conservative application admission budget, below the cache memory limit. |
| `MAX_IN_FLIGHT` | `2` | Concurrent API operations per process. |
| `REQUESTS_PER_SECOND` | `100` | Shared global API limit. |
| `CHALLENGES_PER_SECOND` | `10` | Shared global challenge issuance limit. |
| `CREATES_PER_SECOND` | `8` | Shared global creation limit. |
| `CACHE_TIMEOUT_MS` | `5000` | Deadline on cache operations. Mutations are not automatically retried. |
| `REQUEST_TIMEOUT_MS` | `300000` | Bound on request handling; transport has an additional absolute connection deadline. |
| `CONNECTION_LIFETIME_SECONDS` | `360` | Absolute backend TCP lifetime; traffic does not reset it. |
| `REQUIRE_SAFE_CACHE` | `true` | Reject startup/reconnection when persistence or memory policy is unsafe. Keep enabled. |
| `STATIC_DIR` | `../web/dist` | Directory containing the built frontend. |
| `VITE_ONION_URL` | Empty | Optional public onion origin embedded at frontend build time. Never place secrets in Vite variables. |

Protocol limits are intentionally fixed and validated by every client: 64 MiB total input, 8 MiB UTF-8 text, eight files, 1–100 retrievals and 60 seconds–7 days retention. Changing only a proxy or environment limit does not extend the protocol.

Valkey is configured with 512 MiB `maxmemory` and `noeviction`; its systemd ceiling is higher to allow allocator and client-buffer overhead. The application budget is lower again. The native templates cap the application at 768 MiB and Valkey at 1 GiB; the proxy is limited to 256 MiB. The 256 MiB admission budget holds about three packages at the full 64 MiB size, or many smaller packages. At capacity the service rejects new packages instead of silently evicting old ones. A failure to persist an atomic creation must not spend a valid challenge or leave an unbounded orphan record.

Large transfer handling is bounded: two API operations per process, a 300-second request deadline, a 360-second absolute backend TCP lifetime, and 420-second challenge leases. The proxy accepts at most 65 MiB on the wire; the stricter protocol packet bound is 67,141,632 bytes. A browser/CLI request has a 330-second deadline. A full upload needs roughly 1.8 Mbit/s before overhead to fit the request deadline; slow Tor paths may require a smaller package. The nginx body/send and upstream-send timeouts are 30-second inactivity limits between I/O operations; continuous uploads can run longer. The upstream-read inactivity limit is 330 seconds so it can wait for a slow upload to complete. The Rust deadlines are absolute bounds. These deadlines do not promise successful delivery.

An expired request-handling deadline returns HTTP 504 with `request_timeout`, distinct from storage-capacity errors. HTTP 408 is deliberately avoided because [Chromium automatically retries it on reused HTTP/1.1 connections](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/http/http_network_transaction.cc#1720). The timeout does not establish whether a consuming cache operation executed; clients must not automatically repeat an open or creation request. The five-minute browser inactivity policy remains separate, with its warning and explicit continuation action.

Valkey's client output limit is 256 MiB hard / 128 MiB for 15 seconds soft; the previous 32 MiB limit cannot deliver a full-size packet. Query buffers are limited to 192 MiB and individual RESP bulk strings to 128 MiB. Keep these values consistent in native configuration, Compose and isolated CI caches. `latency-tracking no` disables the separate per-command latency sampling feature as well as the other disabled logs.

The upload path holds bounded HTTP, Redis command and transport buffers. An outgoing response keeps its concurrency slot attached to every transported byte-buffer owner, so dropping an exhausted body before a slow socket has drained does not admit another full-size response prematurely. Command buffers are preallocated to avoid doubling just after a full-size packet is appended, and the HTTP packet is released before the Redis transport copy. Process ceilings include room for temporary copies; they are not limits on stored ciphertext alone. Raising concurrency or running multiple application processes requires reassessing both application and shared-cache peaks. Test with simultaneous full-size transfers before changing these values.

## Reverse proxy and TLS

Render `__DOMAIN__` in `deploy/nginx.conf`, install the result in nginx's HTTP context and provision a valid certificate for the chosen names. The example redirects `www` and HTTP to the main HTTPS origin. The template includes rejecting default virtual hosts for unrelated hosts; remove conflicting distribution defaults. Review global logging and TLS defaults too, then test with `nginx -t` before reload.

The TLS 1.2 cipher list follows the [TLSRef intermediate recommendations](https://docs.tlsref.org/server-side-tls.html): ECDHE key exchange with AES-GCM or ChaCha20-Poly1305. Static RSA key exchange and CBC suites are excluded. TLS 1.3 uses the platform's authenticated cipher suites. The configured curves work with the deployment's OpenSSL 3.0 baseline; this configuration does not claim post-quantum TLS key exchange.

The proxy disables request/response buffering, temporary response files, retries and access logs. Request/proxy temporary paths are under `/run/erase-nginx` as a second safeguard against disk-backed buffering. Install `deploy/nginx-hardening.conf` as a systemd drop-in; its runtime directory must exist before nginx starts. This affects the whole host nginx service, so review other sites before applying it.

Request and connection limits are keyed by the service name, not client IPs. Header, body and idle deadlines supplement the Rust listener's absolute connection lifetime. These are resource controls; they cannot guarantee availability against an attack that fills the server's internet connection. Upstream filtering requires a separate provider decision and may change the privacy model.

Keep the ACME webroot identical in nginx and the renewal client. The template uses `/var/www/erase-acme`, including for `www`; an existing renewal configuration must keep using that same directory. Ensure certificate renewal is enabled and verify its deploy hook (`nginx -t && systemctl reload nginx`). A renewal timer being enabled is not the same as a successful renewal simulation. Monitor expiry without logging visitor requests.

## Optional onion service

Install a maintained Tor package. Adapt `deploy/torrc.example` to the installed version and validate it with `tor --verify-config`. The service publishes a v3 onion address and forwards to a Unix socket, without exposing a SOCKS or Control port publicly. Its private identity stays under `/var/lib/tor/erase`; never commit, print or distribute the identity key.

Read the generated `hostname`, render `__ONION_HOST__` in `deploy/nginx-onion.conf`, and include its `http://...onion` origin in `PUBLIC_ORIGINS`. Both templates use `/run/erase-onion/erase.sock`. Install `deploy/nginx-onion-service.conf` as `/etc/systemd/system/nginx.service.d/erase-onion.conf`, alongside the main nginx hardening drop-in. It creates a root-owned, `debian-tor`-group directory with mode 0750 before nginx's configuration check, then applies mode 0660 and the Tor group to the socket on start and reload. This matters because nginx creates Unix sockets with mode 0666. Do not grant nginx access to Tor's identity directory or control cookie.

On Debian/Ubuntu with Tor's AppArmor profile, add the rules from `deploy/tor-apparmor.local` to `/etc/apparmor.d/local/system_tor`, preserving any existing rules, and reload the profile with `apparmor_parser -r /etc/apparmor.d/system_tor`. Do not disable AppArmor. The distro service's defaults can enable a Unix control socket even with `ControlPort 0`; the Tor template explicitly sets both `ControlSocket 0` and `SocksPort 0`.

Run `systemctl daemon-reload` and restart nginx once when introducing these runtime directories; a reload alone does not run its start hooks. Verify the directory and socket ownership after nginx and Tor restarts. Changing the socket path requires a coordinated restart, because nginx reload signaling is asynchronous. Test socket access as `debian-tor`, then perform an end-to-end check through Tor Browser or a separate, explicitly configured test Tor client. Local socket success alone does not establish onion reachability.

The onion directory is created by the start hook rather than nginx's `RuntimeDirectory` setting, which would reapply the main unit's ownership and mode before later commands. After an unclean stop, the hook removes only an existing socket at its fixed application path before starting nginx. Reloads never unlink the live socket. This allows crash recovery while preserving the private directory permissions.

The clearnet HTTPS site can advertise the onion root through `Onion-Location`. A frontend build with `VITE_ONION_URL` also includes an explicit link. Neither link carries the current message fragment or switches the origin of an in-progress handoff. Use Tor Browser to create and receive onion links. The CLI deliberately refuses onion addresses because it does not implement a Tor transport.

The onion service helps keep client IPs out of the destination server's view and avoids Tor exit nodes. It does not hide a server that is also publicly associated with its clearnet domain, defeat traffic correlation, or protect a compromised browser. JavaScript must be enabled for this browser client.

## Docker Compose

The supplied Dockerfile builds the UI and Rust binary from locked dependencies. Base images and the Valkey image are pinned by digest. The Compose configuration keeps the application and cache on internal networks without default gateways. The cache has no published port, persistence is off, `/data` is tmpfs, and memory/process/capability limits apply to every container. A separate unprivileged nginx relay publishes only `127.0.0.1:3001`; it has a read-only configuration, a small tmpfs and no access to the cache network. Its fixed upstream is the application, and logging, request/response buffering and proxy retries are disabled.

```sh
PUBLIC_ORIGINS=https://example.com docker compose up -d --build
```

The published relay port is bound to host loopback. Put nginx or another reviewed TLS proxy in front; the container relay itself speaks plain HTTP. It preserves the original Host header including its port, so `PUBLIC_ORIGINS` must match the actual browser origin. A container attached only to Docker internal networks has no default gateway, so Docker does not publish its requested host ports. The relay therefore joins a separate ordinary ingress network as well as an internal application network. Only the relay has that outbound route; the application and cache remain isolated. Do not attach the relay to `cache_internal` or add ingress access to the application. Docker creates firewall rules independently of some host firewall tools; verify actual listeners and packet paths rather than relying only on a UFW summary. The host still needs swap and core-dump controls. Updating a pinned image is a deliberate dependency change: review it and rerun the checks.

## Host controls

- Disable host swap and cgroup swap for both application and cache. Check the running state and boot configuration.
- Disable core dumps, including piped crash collectors such as Apport; `LimitCORE=0` alone may not address a piped collector. The dedicated-host sysctl template discards core content.
- Restrict inbound connections to intended web ports and administration. Keep the cache private. Do not expose debug, metrics, health dashboards or container administration ports.
- Keep security updates and certificate renewal active. Plan reboots because a cache reboot removes outstanding packages.
- Prefer SSH keys and tightly controlled administrative access. Authentication changes require a verified recovery path; do not disable the only working login method.
- Keep application/cache access logs, slowlog, ACL log, latency sampling and command-monitoring facilities disabled. Administrative authentication logs are a separate operational decision.
- Review provider snapshots, crash capture and hypervisor swap. The application cannot verify or control the hosting provider's memory handling.

`deploy/security.conf` contains dedicated-host kernel settings. Review each setting before using it on a shared machine. Do not lower a stricter existing sysctl value; the Ubuntu template preserves `perf_event_paranoid=4`. An effective `sshd -T` check is necessary because OpenSSH commonly uses the first matching value, so a later drop-in does not override an earlier password-login setting. These controls reduce exposure; root and the hosting provider remain in the trust boundary.

## Replacing the earlier Node.js deployment

Prepare a root-owned release under `/opt/erase/releases/REVISION`, validate it privately, and set `/opt/erase/current` atomically. Install the final environment and units before touching the public proxy. Stop `erase-preview.service` if it occupies port 3001, then start the final `erase.service` and verify `/healthz` plus synthetic create/read/revoke operations with the final Host and Origin.

Keep the existing Node service on port 3000 running until nginx has successfully switched to port 3001. Update nginx's body/time limits, ACME path, default hosts and runtime directories together; test the configuration and restart nginx when introducing the runtime-directory hooks. Verify HTTPS and onion traffic before disabling the old Node and preview units. Legacy PHP/Node links are not compatible with this protocol; plan the transition explicitly. Never point the new binary at the old release directory.

Build users must not retain membership in the runtime `erase-to` group. That group grants access to the production cache socket; remove temporary build access and end sessions/processes that still hold the old supplementary groups after validation. Check that the final release is writable only by its deployment owner, no build service remains running, and only intended web/SSH ports are publicly listening.

## Updates, rollback and incident handling

Build and test a new release in a separate directory. Record the source revision, binary checksum and built asset checksums. Verify cache compatibility and serve it privately before switching the active release. Keep the previous release and proxy/service configuration until the new health and functional checks pass. Roll back the application symlink and configuration together if necessary.

Do not restart or clear Valkey for an ordinary application update. Do not import old ciphertext formats into a new protocol. If compatibility is intentionally broken, communicate that pending old-format links will stop working. A rollback cannot reconstruct a consumed, expired or discarded package.

On suspected compromise, isolate the service, preserve relevant administrative evidence, stop new handoffs and assess delivered JavaScript as well as the backend. Do not copy live message memory into diagnostic archives. Rebuilding the server cannot revoke plaintext already obtained by an attacker or recipient.
