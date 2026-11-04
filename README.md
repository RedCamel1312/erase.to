# erase.to

Encrypted, temporary handoffs for text and files.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [简体中文](README.zh-CN.md) · [Português (Brasil)](README.pt-BR.md)

[Open erase.to](https://erase.to/) · [Documentation](docs/README.md) · [Security model](docs/threat-model.md) · [Self-hosting](docs/operations.md)

erase.to is an ephemeral communication tool designed by RedCamel. I develop and run it as an independent, one-person project.

Privacy is not a premium feature. The service is free, with no accounts, ads or analytics. Content is encrypted on your device before upload; the server keeps encrypted packages in volatile memory. The application keeps no access logs or IP-based visitor profiles, and the interface loads no third-party scripts, fonts or CDNs.

Write a message or attach files, choose an expiry and retrieval limit, then share the generated link. An optional passphrase adds a second requirement. The editor opens directly, without a registration flow.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/editor-dark.jpg">
  <img src="docs/images/editor-light.jpg" alt="erase.to message editor on desktop">
</picture>

<details>
<summary>Mobile view</summary>

<img src="docs/images/editor-mobile.jpg" alt="erase.to editor on a phone" width="390">

</details>

## What it does

| Feature | Behavior |
| --- | --- |
| Text and files | Up to **64 MiB total**, including up to **8 MiB of UTF-8 text** and **8 files**. File names and media types are encrypted. |
| Client encryption | XChaCha20-Poly1305, a random link secret and an optional Argon2id passphrase. A wrong passphrase does not consume a retrieval. |
| Limited availability | Expiry and retrieval count apply together. Authorization, count changes and final deletion are atomic across API processes sharing one Valkey primary. |
| Sender control | An independent revocation capability removes the remaining server copy. It is not included in the recipient's link. |
| Local cleanup | Manual clearing, a five-minute inactivity deadline with a 30-second warning, and clearing of decrypted content when the tab is hidden. |
| Access and operation | Browser and CLI clients, optional Tor onion access in Tor Browser, and self-hosting with Rust, Svelte and non-persistent Valkey. |

## Try a local instance

With Git, Docker and Docker Compose installed:

```sh
git clone https://github.com/RedCamel1312/erase.to.git
cd erase.to
docker compose up --build -d
```

Open `http://127.0.0.1:3001`. The Compose stack publishes only that loopback address; the application and cache use internal networks. Stopping the cache discards its packages.

For public hosting, follow the [operations guide](docs/operations.md), including HTTPS or a supported onion-service browser context, swap and core-dump controls, proxy buffering and host verification. Containers alone do not establish RAM-only operation. For source development, use the [development guide](docs/development.md).

## Limits worth understanding

- A full link grants access unless an additional passphrase is required. Protect the link, and share the passphrase separately when that separation matters.
- The count limits authorized retrievals, not people or successful deliveries. An interrupted final retrieval can consume the package. Recipients can keep copies; revocation and local cleanup cannot remove them.
- Cache restarts discard packages. Large transfers buffer complete packages, can require several times their content size in memory and must finish within bounded deadlines.
- Encryption does not hide all metadata or protect a compromised device. The server sees access parameters and transport information; the browser also trusts the code it receives. Source review and tests are not an independent security audit or a guarantee of anonymity.

The [threat model](docs/threat-model.md) explains these boundaries in detail.

<details>
<summary>How the protocol and storage work</summary>

![Data flow and trust boundaries](docs/images/architecture.svg)

The browser worker and CLI share the versioned protocol in `shared/`. A random 256-bit link secret and a 192-bit nonce support XChaCha20-Poly1305 encryption. Optional passphrases use Argon2id v1.3 with 64 MiB of memory and three passes. Authenticated metadata binds the package's policy to its content; 4 KiB padding buckets conceal exact lengths, while approximate sizes remain visible.

The link secret stays in the URL fragment, which browsers omit from HTTP requests. Metadata, retrieval and revocation use separate capabilities. The server receives ciphertext, public protocol fields, policy, capability hashes and the capability presented for each access; it does not receive the plaintext, original file names, link secret, passphrase or decryption key in the normal protocol.

The Rust API validates bounded requests and payload-bound, single-use proof of work. Fixed Valkey scripts coordinate expiry, consumption, revocation and capacity. Every package expires, persistence and eviction are disabled, and full capacity rejects new uploads. An API-only restart can preserve packages while the cache remains running.

See the [protocol specification](docs/protocol.md) and [design sources](docs/research.md) for exact formats and rationale.

</details>

<details>
<summary>Development, command line and verification</summary>

Use Node 24 and the pnpm version pinned in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm cli help
```

The [development guide](docs/development.md) covers Rust, an isolated Valkey instance and the browser development server. The [testing guide](docs/testing.md) covers real-cache, multi-process and end-to-end checks. Tests must never use a production cache.

The [CLI guide](docs/cli.md) explains sending, receiving, passphrase input and revocation. Keep full links, message text and passphrases out of shell arguments and history. The CLI supports HTTPS and local development HTTP; it rejects onion addresses because it has no Tor transport. Use Tor Browser for onion access. Received files are never automatically opened or previewed.

The main source directories are `web/` (interface), `shared/` (protocol and cryptography), `server/` (API and atomic cache operations), `cli/` and `deploy/`. CI checks the application, real-cache behavior and the production container. See the [documentation index](docs/README.md) for the full map.

</details>

## Contribute or report a problem

[Contributing](CONTRIBUTING.md) covers development and review. Report vulnerabilities privately through [the security policy](SECURITY.md). Use synthetic examples; do not post private links, messages or access capabilities in issues.

## Support the project

I pay for the server and domain out of my own pocket. If this tool is useful to you and you want to support my work and the running costs, you can contribute some sats. The service remains free to use.

Bitcoin (BTC):

```text
bc1qddfz8u589nvh0gcxdqcz3yltracn9t9qq9jtm7
```

Created by RedCamel. Licensed under [MIT](LICENSE). [Third-party notices](THIRD_PARTY.md).
