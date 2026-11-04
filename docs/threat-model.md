# Threat model

erase.to transfers encrypted text and files under a limited lifetime and retrieval count. Its intended benefit is to reduce the amount of content retained by the delivery service and the time during which that service will deliver it. It cannot control a recipient after delivery, hide all traffic metadata, or guarantee physical erasure from every system involved.

This document separates protocol properties, client behavior and deployment requirements. A configuration example is not evidence that a particular host follows it. Source review and automated tests cover specific cases; this project has not thereby received an independent security audit.

## Assets and trust boundaries

The sensitive assets are the plaintext and files; their names and media types; the random link secret; any additional passphrase; the derived encryption key; and the capabilities authorizing metadata access, content retrieval and revocation. The message ID is an unguessable identifier, not an access credential on its own.

The browser or CLI is trusted to encrypt and decrypt correctly and to run unmodified code. The service is trusted to enforce availability and retrieval policies. Network encryption is trusted to protect capabilities in transit. The cache, operating system, reverse proxy, hosting provider, dependency supply chain and the transport used to share the link are separate trust boundaries.

| Location | Data available there | Principal limits |
| --- | --- | --- |
| Sender client | Original content, files, link secret, passphrase, encryption key and revoke token | The service cannot remove original files, clipboard entries, screenshots or malware access. |
| Link-sharing channel | Full link, unless the sender uses another arrangement | A complete link grants metadata access and, without an extra passphrase, content access. |
| Recipient client | Link secret; passphrase if supplied; retrieved ciphertext and decrypted content | A recipient can keep, redistribute or photograph what they receive. |
| API/proxy during requests | ID, ciphertext, protocol header and presented access capability; transport metadata | Encryption does not prevent request correlation, service denial or delivery of altered client code. |
| Valkey record | Packet, header, capability hashes, remaining count and expiry | A cache compromise reveals metadata and ciphertext, can alter policy state or destroy records, and can aid traffic correlation. |
| Host/provider | Process memory, storage configuration, network connections, potentially snapshots | Application code alone cannot constrain a privileged host or provider. |

## Passive network observers

On the public web, HTTPS protects request bodies and authorization capabilities against ordinary passive observers between the browser and the TLS endpoint. An observer can still see connection timing, volume and the destination; exact visibility depends on the observer's position and the transport. TLS terminates at the configured proxy, which can see API requests even though it does not receive the content-decryption key.

Both the ID and master secret are placed after `#` in `/view#1.<id>.<secret>`. The browser does not include the fragment in the initial HTTP request. Subsequent API routes contain the ID, and request bodies contain a role-specific capability. Disabling logs is therefore relevant even though the fragment is excluded from HTTP. Access logs, traces, metrics labels, error capture, packet recording or proxy debugging must not be treated as harmless merely because the content is encrypted.

The recipient replaces its current history entry with `/view` after capturing the fragment. This reduces exposure in the current address bar and history entry. It does not undo copies already made by the sharing application, browser synchronization, a password manager, an extension, clipboard history or screenshots.

## Someone who obtains a link

Without an additional passphrase, possession of the complete link is sufficient to access the note. There is no identity check, recipient account or intended-recipient binding. Sharing the link is granting authority; the service cannot determine whether the person following it is the intended recipient.

With a passphrase, the random link secret remains necessary. The password-derived value and link secret jointly derive the content key and read capability, with separate HKDF domains. A link holder can fetch nonconsuming metadata and attempt passphrase guesses offline against its read-token hash. Argon2id uses a fixed memory/CPU cost to increase the cost of each guess. It cannot compensate for an easily guessed passphrase. Delivering the passphrase through the same compromised channel as the link removes the benefit of separating those two requirements.

Metadata and read capabilities are separate. The metadata capability permits inspection of the bounded public header without retrieving ciphertext or decreasing the count. The read capability is derived from the link secret plus password-derived material when a passphrase is configured. A client checks the read hash locally before making the consuming request, and the server checks authorization again. A typo therefore does not need to destroy a one-time note. A client that skips the local check still cannot consume with the wrong capability.

A sender's revoke token is independent random data. It is not in the shared link and is not derivable from the recipient's key material. Losing it can prevent early revocation; expiry still applies. Revocation removes the service's remaining record and cannot retract earlier deliveries.

## Service operators and cache access

In the normal protocol, the API and cache do not receive plaintext, original file metadata, master secrets, passphrases or content keys. They receive encrypted packages and role-separated authorization material. A read or metadata capability is not a decryption key.

They do receive the package ID, algorithm/version fields, nonce, password salt and mode, lifetime, open limit, capability hashes and padded size. They can associate requests to the same ID. During an authorized request, the API also receives the capability itself. Calling the service "zero metadata" or claiming that its running infrastructure cannot see network addresses would be incorrect.

A read-only cache compromise does not by itself supply the random link secret required to derive a decryption key. The public password salt does not change this. If the attacker separately obtains a complete link, passphrase guessing becomes possible as described above. Encryption also does not stop a cache attacker from denying service or modifying records. AEAD authentication detects modified ciphertext and immutable header fields when the client decrypts; it cannot force an honest retention policy on a malicious operator.

The metadata read-hash comparison is a practical check before consumption, not a signed assertion from a trusted third party. A malicious server can fabricate metadata or delete a note at any time. Clients validate bounds and refuse unsupported parameters before expensive work, and authenticate the complete header with the content. They must not silently downgrade a malformed or unfamiliar package.

## A malicious web server or dependency

Browser-delivered encryption depends on the code the browser receives. A compromised server, deployment credential, build pipeline or dependency could serve JavaScript that uploads a secret or plaintext. A strict Content Security Policy and removal of third-party resources reduce exposure; they cannot make deliberately malicious first-party JavaScript trustworthy.

The same consideration applies to an altered CLI binary or package. A locally inspected, pinned client can reduce dependence on future browser-code delivery, but only if its source, dependencies and execution environment remain trustworthy. Publishing source and reproducible commands helps inspection; it does not establish that a particular public deployment is running those exact bytes. Deployment verification must be performed and described separately.

Dependencies are pinned through the lockfile and should be updated with review and relevant tests. Cryptographic primitives come from libsodium and WebCrypto rather than new application-level cipher implementations. That choice reduces the amount of primitive code maintained here, but does not remove dependency or protocol-composition risks.

## Malicious senders and untrusted files

A legitimate sender can supply hostile content. AEAD proves that a package has not been changed without its key; it does not prove that a sender or file is safe. Text is rendered as text. The application does not execute HTML, render arbitrary Markdown, follow embedded links automatically or preview documents.

Encrypted files can contain executable code, macros, tracking content or malformed data. The browser offers an explicit download and makes no malware-free claim. The recipient's chosen application may subsequently execute content or contact the network. Automatic previews are omitted to avoid opening that processing surface inside erase.to.

The inner envelope has strict text, file-count, name, MIME and aggregate byte limits. It uses no decompression, so a small compressed object cannot request an unbounded decoded allocation. Names are normalized and checked for paths, device names, controls and collisions. A CLI must additionally constrain output paths, handle symlinks safely and prevent accidental overwrites. Sender-controlled file names must never be passed directly to an unrestricted filesystem path resolver.

## Retrieval count, concurrency and delivery failure

Every stored package has both an expiry and a maximum number of authorized retrievals. The authoritative cache operation must check existence, capability, expiry and remaining count, then decrement or delete and return the package without any other request interleaving. An API process-local lock is not enough when multiple processes share data.

One fixed Valkey script provides that transition on one primary. The relevant property is **at most N authorized retrievals**, not N human readers or N successful end-to-end deliveries. A connection can fail after the cache consumes a retrieval but before the recipient receives the packet. A final retrieval can consequently destroy the last available server copy without delivering usable content. The client and backend must not automatically retry an ambiguous consuming operation.

A metadata check is not a reservation. A note can expire or be consumed between metadata inspection and Open. Return a generic unavailable result for absent, expired, consumed and unauthorized access rather than revealing additional existence details.

Cache unavailability must fail closed: do not fall back to a process-local store, bypass authorization, reset counts or infer success. Creating a note and spending its proof must not leave a retrievable partial record if an operation fails. Expiry is mandatory on every record, including one-time notes.

Atomic scripts do not solve distributed failover consistency. An asynchronous replica may lack a recent decrement or deletion when promoted, allowing a previously consumed record to reappear. The initial topology therefore relies on one authoritative volatile primary. Adding replication, restore or failover requires an explicit design and new guarantees; ordinary cache replication must not be advertised as preserving strict one-time semantics. [Valkey scripting](https://valkey.io/topics/eval-intro/), [Valkey replication](https://valkey.io/topics/replication/).

## Denial of service and resource exhaustion

Anonymous service access is inherently vulnerable to determined resource exhaustion. Proof of work adds cost to package creation but does not identify a human or provide a complete denial-of-service defense. A powerful adversary may have much cheaper computation than a mobile user.

The intended controls are complementary: bounded request size before buffering; no unbounded admission queue; concurrent-body limits; request and cache-operation deadlines; fixed KDF work factors; bounded decoded content; global short-lived rate limits; single-use, expiring challenges bound to exact packet bytes; and a finite cache budget. At capacity, reject new uploads instead of evicting existing live packages. Never put a user-provided script into a Valkey operation.

The client accepts up to 64 MiB of combined text and file bytes, with an 8 MiB text limit and at most eight files. It encrypts and decrypts complete buffered envelopes, not a stream of independent chunks. Working arrays, the WebAssembly heap, transfer/request copies, decoded text and download blobs can occupy several times the package size; an additional passphrase requires the fixed 64 MiB Argon2id allocation. A conforming maximum-size package can still exhaust a constrained device or fail to finish over a slow connection. The protocol ceiling is not a promise of browser performance or availability.

File validation checks bounded sizes, names and metadata; it does not detect malware or establish that a document is safe to open. The server cannot inspect encrypted file contents. A malicious sender can provide an authenticated file containing harmful content, or an authenticated envelope that the client rejects after a retrieval has been consumed. The browser does not preview active documents, and CLI writes are exclusive, but files deliberately opened in another application enter that application's security boundary.

Global limits deliberately avoid retaining per-IP visitor profiles. Their tradeoff is that one source can consume a shared allowance and affect other users. Host or network-level denial-of-service protection can introduce separate logs or identity processing; its privacy effect must be assessed as an operational choice. Avoid claiming that no IP addresses are ever processed: sockets, proxies and the network necessarily process addressing information.

The application has no account database or persistent identity mechanism. It should neither read trusted-proxy headers as visitor identities nor put IDs, tokens or client addresses into telemetry labels. Absence of application access logs does not imply absence of firewall, SSH, system, certificate, provider or network logs. Operators must distinguish ordinary administrative events from message-request recording.

## Five-minute cleanup and endpoint compromise

The five-minute timer is a browser-session policy. It applies to drafts, generated links, a waiting receiver's key, prepared key material and displayed content. The 30-second warning is an opportunity to continue using the page before the deadline. Only real trusted user activity should extend the deadline; background jobs, synthetic events and network completion are not activity.

An absolute deadline is needed because background tabs and suspended devices can delay timers. Every asynchronous completion and foreground return must check the deadline and generation before changing state. Clearing aborts requests, terminates the crypto worker, clears references and inputs, wipes mutable byte arrays where practical and revokes object URLs. Page exit and hiding an already-decrypted view also clear the context. A waiting receiver can switch briefly to retrieve a passphrase, but the original inactivity deadline continues.

These actions reduce accidental exposure and stop late work from repopulating a cleared interface. They do not guarantee overwriting every memory copy. JavaScript strings, browser internals, WASM allocations, crash capture, OS paging and hardware behavior are not all controlled by the page. A clipboard manager or another application may keep an explicit copy. Downloaded files and original sender files are outside the timer's scope. Reloading does not restore an in-memory secret: the original link is needed, and the package must still be available.

An extension with sufficient permissions, device malware, keylogger, compromised browser or person with access to an unlocked screen can observe content before encryption or after decryption. The service cannot repair a compromised endpoint. The CLI has process lifetime rather than the browser's inactivity UI, and its output may be retained by terminals, pipes and files.

## Volatile storage and privileged infrastructure

Valkey is not automatically diskless simply because its dataset is held in memory. RDB snapshots and AOF must both be disabled; snapshot and replication behavior must be reviewed before changing topology. OS swap, core dumps, container/runtime dumps and proxy request buffering can persist data outside the application's store. Reverse-proxy access logs and diagnostic output can retain metadata and capabilities even without plaintext. [Valkey persistence](https://valkey.io/topics/persistence/).

Deployment templates should use a dedicated cache and restricted local socket or loopback connection, no persistence or eviction, explicit memory budgets, disabled swap and crash dumps, and disabled request/body logging and proxy temporary-file buffering. These settings require verification on the actual host. Generic operational logs must not accidentally include request bodies or sensitive configuration. A shared host may need a different approach to host-wide settings.

A privileged provider can inspect memory, capture packets or create snapshots regardless of application settings. Hypervisor swap and provider RAM snapshots cannot be ruled out by checking the guest OS alone. The accurate statement is that the application intentionally stores ciphertext in volatile service memory under its configured lifecycle; universal physical deletion is outside its control.

Cache restart loses all records. API-only restart may preserve records while the shared cache runs. Neither behavior is a backup promise. Do not restore old message-cache snapshots: they can resurrect expired or consumed data and contradict the retention model.

## Onion deployment

An onion-service deployment can give users a Tor route to the service and reduce exposure of their direct network address to the service. It does not change the cryptographic format, authenticate an individual recipient, remove endpoint risk, or guarantee resistance to traffic correlation. The Tor process and host still form part of the trusted infrastructure.

Configure the onion origin explicitly, keep requests on that origin, and serve the complete interface and crypto dependencies locally. Do not redirect a user who chose the onion service to a clearnet URL or fetch fonts, scripts, analytics or downloads from another origin. The current CLI rejects every `.onion` origin before a network request, including HTTPS onion URLs; use Tor Browser for the onion service. Future CLI support would require an explicitly configured and tested Tor-capable transport. Accepting an `.onion` string alone does not route traffic through Tor.

Browser support for secure-context features and performance of the KDF/proof must be tested in the intended Tor Browser configuration. An unsupported browser should receive a clear error rather than a weaker silent cryptographic fallback. A private network address, a self-signed certificate, an onion URL and HTTPS are different deployment choices; none justifies a blanket anonymity claim.

## Evidence and review scope

The shared cryptographic tests include an upstream libsodium XChaCha20-Poly1305 known-answer vector, independently reproduced HKDF outputs, passphrase/secret separation, rejection before consumption, authenticated-header and ciphertext tampering, Unicode and binary round trips, maximum-size input, padding boundaries, canonical parsing, bounded file names and bit-based proof verification. These tests establish those specific checks for the exercised implementation and dependency versions.

They do not exercise browser rendering, a running reverse proxy, cache failures, multiple API processes, a kernel's memory behavior or provider systems. Those require distinct lifecycle tests, real-cache integration tests and deployment checks. Test counts and production status should be recorded in release verification rather than inferred from this design document.

Further changes to key derivation, canonical encoding, allowed file metadata, worker lifecycle, caching, proxies or cache topology require review across these boundaries. When reporting a defect, use synthetic content and describe the observed behavior and conditions; do not infer that a source-level weakness proves past exploitation on a live service.
