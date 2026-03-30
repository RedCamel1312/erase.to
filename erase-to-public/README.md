# erase.to Source Code

This is the auditable core of [erase.to](https://erase.to), a Zero-Trace ephemeral messaging platform.

## What this is

erase.to lets you send a message that disappears. The architecture is designed so that the server **cannot** read your message, and leaves **no permanent record** of who sent or received it.

This repository exists so that you can **verify those claims** rather than take them on faith.

## Security Architecture

### Zero-Knowledge Encryption
- **Encryption and decryption happen entirely in the browser** using the WebCrypto API (AES-GCM, 256-bit key).
- The decryption key lives in the **URL fragment** (`#key`), the part of the URL that browsers **never send to the server** by design.
- The server only ever sees an opaque, encrypted ciphertext blob. It has no mathematical means to obtain the plaintext.

### Zero-Trace Server Side
- **No IP logging.** Rate limiting is handled via stateless, anonymous **Proof-of-Work** (Hashcash). Your network identity is never recorded.
- **No accounts, no sessions, no cookies.**
- **No third-party CDNs**, tracking scripts, or analytics. Zero external dependencies.
- **No-Store headers** on all sensitive routes prevent browser and proxy caching of any decrypted data.
- Decrypted content lives only in **volatile RAM** during the viewing session.

### Ephemeral by Design
- Ciphertext is written to `storage/messages/`. **This directory must be a tmpfs mount** (see [docs/server-setup.md](docs/server-setup.md)). Files never touch a physical disk.
- On first successful view (single-use mode), the stored copy is immediately and physically destroyed.
- All messages are purged on expiry by a cron job (`bin/cleanup.php`), running every minute.
- No backups. No archives. A reboot wipes everything.

### Browser-Side Hardening
- Strict **Content Security Policy (CSP)** with nonces. No inline scripts, no external resources.
- **Referrer-Policy: no-referrer.** Nothing leaks via referrer headers.
- **X-Frame-Options: DENY** plus `frame-ancestors 'none'`. No clickjacking.
- **Permissions-Policy.** Microphone, camera, geolocation, USB and other APIs are explicitly disabled.
- **Fetch Metadata validation.** API endpoints reject any request not originating from the same origin.
- After decryption, the key fragment is cleared from the URL using `history.replaceState()`.
- Plaintext is always rendered via `textContent`, never `innerHTML`. DOM-XSS is structurally impossible.
- A 5-minute inactivity timer and a tab-visibility guard automatically wipe decrypted content from view.

## Project Structure

```
erase-to/
├── app/
│   ├── config.php          # Site configuration (see config.example.php)
│   ├── http/               # Request/Response helpers, JSON, Fetch-Metadata guard
│   ├── messages/           # Business logic: create, get, consume handlers + storage
│   ├── security/           # CSP manager, Proof-of-Work implementation
│   ├── content/            # PHP page content (Home, About, Privacy, Terms)
│   ├── includes/           # Shared layout partials (head, header, footer)
│   └── protocol/           # Protocol specification (message-v1.md)
├── bin/
│   └── cleanup.php         # CLI garbage collector for expired/consumed messages
├── public/                 # Web root, served by nginx
│   ├── api/                # API endpoints (create, get, consume)
│   ├── assets/             # CSS, JS, fonts
│   ├── index.php           # Home
│   ├── create.php          # Message creation
│   ├── view.php            # Message viewing + decryption
│   └── ...
└── storage/
    └── messages/           # MUST be a tmpfs RAM mount (see docs/server-setup.md)
```

## Setup

> **Read [docs/server-setup.md](docs/server-setup.md) before deploying.**
> The `storage/messages/` directory must be mounted as a kernel tmpfs (RAM disk).
> Without this mount, ciphertext lands on a physical disk and the core privacy guarantee does not hold.
> This is a mandatory infrastructure requirement, not a recommendation.

### Quick start

```bash
git clone https://github.com/RedCamel1312/erase.to.git
cd erase.to

cp app/config.example.php app/config.php
# Generate site_secret: php -r "echo bin2hex(random_bytes(32));"

mkdir -p storage/messages && chmod 700 storage/messages
# Mount as tmpfs (see docs/server-setup.md for /etc/fstab entry)
# mount storage/messages
```

See [docs/server-setup.md](docs/server-setup.md) for the full setup sequence including nginx config, fstab entry, and cron.

## What is NOT in this repository

| Excluded | Why |
|---|---|
| `storage/messages/` | Runtime data, never committed |
| Real server IP / hostname | Not relevant to audit |
| SSL certificates | Infrastructure, not code |
| Nginx live config | Same |
| Logs, dumps, backups | Operational, not auditable |
| Secrets or tokens | Obviously |

## License

MIT. See [LICENSE](LICENSE).

## Contact

RedCamel. For security reports, use Session:

```
05d142f0db75884b2b84d3647acd19090681d1fe5a58c40039e72b2c0f2215a16a
```
