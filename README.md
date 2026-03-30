# erase.to — Source Code

This is the auditable core of [erase.to](https://erase.to), a Zero-Trace ephemeral messaging platform.

---

## What this is

erase.to lets you send a message that disappears. The architecture is designed so that the server **cannot** read your message, and leaves **no permanent record** of who sent or received it.

This repository exists so that you can **verify those claims** rather than take them on faith.

---

## Security Architecture

### Zero-Knowledge Encryption
- **Encryption and decryption happen entirely in the browser** using the WebCrypto API (AES-GCM, 256-bit key).
- The decryption key lives in the **URL fragment** (`#key`) — the part of the URL that browsers **never send to the server** by design.
- The server only ever sees an opaque, encrypted ciphertext blob. It has no mathematical means to obtain the plaintext.

### Zero-Trace Server Side
- **No IP logging.** Rate limiting is handled via stateless, anonymous **Proof-of-Work** (Hashcash). Your network identity is never recorded.
- **No accounts, no sessions, no cookies.**
- **No third-party CDNs**, tracking scripts, or analytics. Zero external dependencies.
- **No-Store headers** on all sensitive routes prevent browser and proxy caching of any decrypted data.
- Decrypted content lives only in **volatile RAM** during the viewing session.

### Ephemeral by Design
- Messages are stored only as encrypted ciphertext.
- On first successful view (single-use mode), the stored copy is **immediately and physically deleted** from disk.
- All messages are deleted on expiry by a periodic cleanup job (`bin/cleanup.php`).
- No backups. No archives.

### Browser-Side Hardening
- Strict **Content Security Policy (CSP)** with nonces — no inline scripts, no external resources.
- **Referrer-Policy: no-referrer** — nothing leaks via referrer headers.
- **X-Frame-Options: DENY** + `frame-ancestors 'none'` — no clickjacking.
- **Permissions-Policy** — microphone, camera, geolocation, USB and other APIs are explicitly disabled.
- **Fetch Metadata validation** — API endpoints reject any request not originating from the same origin.
- After decryption, the key fragment is cleared from the URL using `history.replaceState()`.
- Plaintext is always rendered via `textContent`, never `innerHTML` — DOM-XSS is structurally impossible.
- A 5-minute inactivity timer and a tab-visibility guard automatically wipe decrypted content from view.

---

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
├── public/                 # Web root — everything served by nginx
│   ├── api/                # API endpoints (create, get, consume)
│   ├── assets/             # CSS, JS, fonts
│   ├── index.php           # Home
│   ├── create.php          # Message creation
│   ├── view.php            # Message viewing + decryption
│   └── ...
└── storage/
    └── messages/           # Runtime-only: encrypted JSON blobs (not in repo)
```

---

## Setup

### Requirements
- PHP 8.1+
- nginx or Apache with PHP-FPM
- A writable `storage/messages/` directory

### Installation

```bash
git clone https://github.com/your-username/erase-to.git
cd erase-to

# 1. Copy and configure
cp app/config.example.php app/config.php
# Edit config.php: set a random site_secret

# 2. Create the storage directory
mkdir -p storage/messages
chmod 700 storage/messages

# 3. Point your webserver's document root at /public
```

### nginx example

```nginx
server {
    listen 443 ssl;
    server_name example.com;
    root /path/to/erase-to/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.1-fpm.sock;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
```

### Cron (Cleanup)

```bash
# Run every 15 minutes
*/15 * * * * php /path/to/erase-to/bin/cleanup.php >> /var/log/erase-to-gc.log 2>&1
```

---

## What is NOT in this repository

| Excluded | Why |
|---|---|
| `storage/messages/` | Runtime data — never committed |
| Real server IP / hostname | Not relevant to audit |
| SSL certificates | Infrastructure, not code |
| Nginx live config | Same |
| Logs, dumps, backups | Operational, not auditable |
| Secrets or tokens | Obviously |

---

## License

MIT — see [LICENSE](LICENSE).

---

## Contact

RedCamel. For security reports, use Session:

```
05d142f0db75884b2b84d3647acd19090681d1fe5a58c40039e72b2c0f2215a16a
```
# erase.to
