# Design sources and reasoning

These notes connect concrete implementation decisions to primary documentation and inspected source. They describe engineering choices, not endorsements by the cited projects or a claim that this service is universally safer than another one. The normative wire format is [protocol 1](protocol.md); its assumptions and limitations are in [the threat model](threat-model.md).

## Authenticated encryption

Libsodium documents XChaCha20-Poly1305 as an authenticated-encryption construction with a 192-bit nonce suitable for random nonce generation. Its additional authenticated data input protects non-secret metadata alongside the ciphertext. erase.to uses a fresh key context and nonce per package and authenticates the **exact** canonical header bytes, including the retention policy and capability hashes. Decryption authenticates before interpreting the content envelope. [Libsodium XChaCha20-Poly1305](https://doc.libsodium.org/secret-key_cryptography/aead/chacha20-poly1305/xchacha20-poly1305_construction).

The choice does not establish a defect in AES-GCM. The previous client used random AES-GCM keys/nonces and authenticated metadata. XChaCha20 is a practical fit here because libsodium also provides the required password KDF, and its nonce space makes random nonce generation straightforward. The cost is a maintained dependency and a browser/WASM compatibility surface. The installed `libsodium-wrappers-sumo` package provides the high-level APIs; its sumo variant is needed for password hashing. [libsodium.js](https://github.com/jedisct1/libsodium.js).

The test suite checks an upstream XChaCha20 known-answer fixture as well as application-level tampering. A known-answer vector is evidence of primitive compatibility, not a proof that all surrounding state transitions are correct. [Upstream test input](https://github.com/jedisct1/libsodium/blob/master/test/default/aead_xchacha20poly1305.c), [expected output](https://github.com/jedisct1/libsodium/blob/master/test/default/aead_xchacha20poly1305.exp).

## Password derivation and random link entropy

Libsodium's password-hashing documentation distinguishes fixed algorithm identifiers from a default that can change, describes explicit CPU/memory parameters, and recommends measuring the chosen cost. This protocol fixes Argon2id v1.3, a 32-byte result, 64 MiB memory, three operations and a fresh 16-byte salt. It neither accepts remote work factors nor silently reduces them on a low-memory client. The browser performs this work in a worker. [Libsodium password hashing](https://doc.libsodium.org/password_hashing/default_phf).

The random 256-bit secret is retained with an additional passphrase. This is a project design decision: an optional human secret supplements random link entropy instead of becoming the sole source of encryption-key entropy. A complete-link holder can still attempt offline passphrase guesses, so the interface does not present a weak phrase as strong protection.

The read capability depends on both inputs in passphrase mode. Metadata contains its hash, allowing the client to reject an incorrect phrase before calling the consuming endpoint. The backend independently checks the same capability before changing the count. This avoids coupling a typing mistake to irreversible retrieval consumption.

## Key separation

RFC 5869 explains the extract/expand structure of HKDF and the use of context information to distinguish derived key material. erase.to uses different context labels for metadata access, content encryption and authorized retrieval. The random message ID also scopes derivation. The revoke capability is independently random and absent from the recipient link. [RFC 5869, especially section 3.2](https://www.rfc-editor.org/rfc/rfc5869).

HKDF runs through WebCrypto rather than an application-written primitive. A server receiving an authorization token does not receive a symmetric encryption key. The tests independently reproduce the derivation with Node's native HKDF to catch differences in byte representation or labels. [WebCrypto deriveBits](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits), [libsodium's HKDF explanation](https://doc.libsodium.org/key_derivation/hkdf).

## Atomic state and failure semantics

Valkey scripts execute atomically with respect to other requests. This supports a single operation that checks authorization, expiry and remaining retrievals, then decrements or deletes and returns the packet. It also supports coordinating creation with challenge spending across API processes. Fixed scripts take data through arguments instead of generating script source from input. [Valkey scripting](https://valkey.io/topics/eval-intro/).

Atomic execution is not a promise that earlier successful writes roll back after a later command error. The create script checks known conditions before mutation and has explicit compensation for partial writes. A real-cache test injects a permission failure after the first write to exercise this case. Transport failure remains ambiguous after a mutating operation begins; neither backend nor client automatically resends a consuming request. Valkey also documents the absence of general transactional rollback. [Valkey transactions](https://valkey.io/topics/transactions/).

One authoritative primary is the initial topology. Ordinary asynchronous replication can lose acknowledged changes during failover; promoting a replica can therefore reintroduce an old retrieval count or a deleted record. We do not extend the one-time claim across an unreviewed failover or restore design. [Valkey replication](https://valkey.io/topics/replication/).

## Volatile storage requires operational controls

Valkey supports both RDB snapshots and AOF. Choosing an in-memory database does not disable either. The application checks required persistence/memory settings on startup and new connections; deployment additionally disables persistence, request recording, swap and crash dumps. A nonpersistent cache restart discards messages, whereas an API-only restart can preserve unexpired cache records. [Valkey persistence](https://valkey.io/topics/persistence/).

Cache diagnostics deserve separate review. A slow-command record can retain identifiers or command arguments after the corresponding message expires. Deployment disables slow-command capture and avoids `MONITOR` sessions over live messages; aggregate diagnostic choices must not become per-message records. [Valkey SLOWLOG GET](https://valkey.io/commands/slowlog-get/).

systemd can restrict privileges, writable paths, capabilities, address families and resource use. These are controls on the service, not evidence about every hypervisor or provider behavior. The actual unit settings and kernel support must be checked on the target host; a security score is not a proof of secrecy. [systemd execution environment](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html), [systemd resource control](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html).

## Resource limits and abuse

OWASP's denial-of-service guidance emphasizes bounded input, allocation and duration, rather than treating a puzzle as sufficient protection. erase.to combines single-use packet-bound proofs with body limits, finite cache capacity, global admission limits and bounded concurrency. It rejects new storage at capacity instead of silently evicting existing notes. Client KDF work factors and decoded content sizes are also fixed and bounded. [OWASP Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html).

The privacy tradeoff is explicit: global limits do not retain per-IP visitor profiles, but one abusive source can consume shared capacity. Proof of work is an economic obstacle, not proof of a human or a guarantee against a well-resourced attacker. The Rust listener adds an absolute accepted-connection lifetime, including stalled reads and writes. Reverse-proxy controls remain necessary: completing an application handler is not the same as delivering every response byte.

## File handling and size disclosure

The content envelope encrypts names, media types, file count, exact lengths and file bytes together. The client accepts only bounded metadata and payloads, rejects path-like names and collisions, and performs no decompression. This is a deliberately small parser surface. The CLI additionally uses exclusive file creation; the browser downloads only after an explicit action and does not preview active documents.

Padding to a 4 KiB boundary is a project choice to obscure exact total length within a bucket at a small bounded cost. It does not hide the bucket, request timing, transport metadata or retained copies. There is no claim of formal traffic-analysis resistance.

## Onion deployment

Tor's setup guide describes forwarding an onion service to a local web server and protecting its service keys. Its Onion-Location documentation describes advertising the alternative onion address from an HTTPS clearnet page. Deployment uses an explicitly configured onion origin and locally served assets; the onion route must not redirect users to clearnet dependencies. [Onion service setup](https://community.torproject.org/onion-services/setup/), [Onion-Location](https://community.torproject.org/onion-services/advanced/onion-location/).

Tor changes the network route, not endpoint trust or the cryptographic file format. It does not prevent a recipient from making copies or guarantee immunity to traffic correlation. Browser functionality must be verified in Tor Browser. The current CLI rejects onion origins before network access because it has no tested Tor transport; accepting an onion-looking hostname alone would be misleading.

## Implementation review

Code review focuses on concrete concerns: keeping random entropy when adding a password, authenticating routing metadata, checking a passphrase before consumption, making count changes atomic across processes, bounding file allocation, and separating capabilities. Finding an issue in source is not evidence that it was exploited in production.

The complete [protocol](protocol.md) and [tests](testing.md) make these design choices reviewable. Release verification must still establish which source, dependencies and configuration actually reached the running service.
