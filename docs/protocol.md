# erase.to protocol 1

This document specifies the binary format and client cryptography implemented in `shared/`. Protocol 1 belongs to the Rust/Svelte application and is not compatible with the previous Node application's message formats 2 and 3. A protocol number identifies a complete format; clients must not guess algorithms from ciphertext.

The server receives ciphertext, authorization capabilities and limited routing metadata. Text, file contents, names, media types and exact individual lengths are encrypted in the browser or CLI. The server still learns the padded package size, requested lifetime and open limit, password-mode flag, identifiers, and request timing. Transport infrastructure can observe network metadata. This protocol does not provide anonymity, proof of deletion, protection from a compromised client, or protection from a server that serves modified client JavaScript.

## Limits and representation

All integers in binary envelopes use unsigned big-endian encoding. JSON header numbers are ordinary decimal integers without leading zeroes or exponent notation. Base64url strings are canonical, unpadded URL-safe base64. Decoders reject alternative spellings, including nonzero unused bits. SHA-256 digests are 64 lowercase hexadecimal characters.

| Item | Limit |
| --- | --- |
| Combined UTF-8 text and raw file bytes | 67,108,864 bytes (64 MiB) |
| UTF-8 text | 8,388,608 bytes (8 MiB) |
| Files | 8, including empty files |
| File name | 255 UTF-8 bytes after NFC normalization |
| Media type | 127 ASCII bytes |
| Passphrase | 1–1,024 UTF-8 bytes when enabled |
| Header | 1–2,048 bytes |
| Complete upload packet | 67,141,632 bytes (content limit + 32,768) |
| Lifetime | 60–604,800 seconds |
| Authorized opens | 1–100 |

At least one text byte or one file is required. Text and files can coexist. Text and passphrases are encoded as exact UTF-8; ill-formed Unicode strings are rejected. Passphrases are not trimmed or Unicode-normalized. An empty passphrase selects password-free mode at creation. No content compression is applied.

## Link and independent capabilities

The client samples an independent 32-byte message ID, 32-byte master secret `S`, and 32-byte revoke capability using a cryptographic random generator. IDs do not grant access. The master secret remains random even when a passphrase is supplied.

The sharing URL is:

```text
https://erase.to/view#1.<id-base64url>.<S-base64url>
```

The recipient captures the ID and secret in memory and immediately replaces the current URL/history entry with `/view` and a null history state. Both values are in the fragment, which the browser does not send in the initial HTTP request. API calls subsequently transmit the ID and the applicable derived capability over the configured transport. Replacing the current history entry does not remove the original URL from messengers, copied text, browser sync, screenshots, or other histories.

`HKDF(IKM, salt, info)` below is RFC 5869 HKDF-SHA-256 with 32 output bytes. Text arguments are UTF-8. The browser and CLI normally use WebCrypto for HKDF. On the exact I2P origin configured at build time, browsers without SubtleCrypto use the same HKDF-SHA-256 from `@noble/hashes` inside the worker. Both paths require native secure randomness and produce the same keys and capabilities. Libsodium provides Argon2id, XChaCha20-Poly1305 and the protocol’s public SHA-256 hashes.

```text
peek_token = HKDF(S,
                 "erase.to/v1/peek:" + id,
                 "erase.to/v1/peek")

If kdf == "none":
    P = 32 zero bytes
If kdf == "argon2id":
    P = Argon2id_v1.3(UTF8(passphrase), salt16,
                     output=32 bytes, opslimit=3, memlimit=67,108,864 bytes)

IKM = S || P                     # exactly 64 bytes
K = HKDF(IKM, "erase.to/v1/content:" + id, "erase.to/v1/aead:" + kdf)
R = HKDF(IKM, "erase.to/v1/content:" + id, "erase.to/v1/read:" + kdf)
```

Argon2id is precisely libsodium `crypto_pwhash` with `crypto_pwhash_ALG_ARGON2ID13`, the fixed output/memory/operation parameters above, and a fresh random 16-byte salt. There are no remotely selected work factors or silent low-memory fallback. Browser implementations perform it in a dedicated worker. Insufficient memory is an error; clearing the session terminates the worker.

The header contains `SHA256(peek_token)`, `SHA256(R)`, and `SHA256(revoke_token)`. These hashes are of the **raw 32 bytes**, not of their base64 strings. Requests present the corresponding raw token encoded as base64url. Each role has independent key material. In particular, a server that receives a read capability does not thereby receive the encryption key. The revoke token is independent random data retained by the sender; it is not included in the sharing link.

A holder of the complete link can retrieve metadata, including a password salt and read-token hash. With a passphrase-protected note they can try passphrases offline; Argon2id increases the cost but cannot make a weak passphrase strong. Possession of the database alone does not supply the random link secret needed for those guesses.

## Outer packet and authenticated header

```text
offset  bytes          meaning
0       4              ASCII ERS1
4       4              header byte length H
8       H              canonical UTF-8 JSON header
8+H     remaining      XChaCha20-Poly1305 ciphertext followed by its 16-byte tag
```

The header is serialized without whitespace in exactly this member order:

```json
{"version":1,"id":"<43 chars>","ttl":3600,"views":1,"peek":"<64 hex>","read":"<64 hex>","revoke":"<64 hex>","kdf":"none","salt":"","nonce":"<32 chars>"}
```

`nonce` is a fresh random 24-byte XChaCha20 nonce. `salt` is empty for `none`; for `argon2id` it is a fresh 16-byte salt encoded as 22 base64url characters. Unknown, missing or duplicate members, noncanonical order, alternate numeric representations, unsupported versions and out-of-range values are rejected.

Encryption is `XChaCha20-Poly1305-IETF(K, nonce, padded_content, AAD=exact_header_bytes)`, with its full 128-bit authentication tag. The server preserves the exact header and packet bytes. Decryption first checks that the packet header exactly matches the metadata header used to prepare the open, then verifies the AEAD tag, then parses the plaintext. The authenticated header binds the protocol, ID, lifetime, open limit, capability commitments, password mode, salt and nonce to the ciphertext. Dynamic server values such as remaining opens and absolute expiry are outside the immutable header; the server must enforce them independently.

XChaCha20's 192-bit nonce makes independently sampled nonces practical. This choice is not a claim that AES-GCM is broken: the earlier implementation used fresh AES-GCM keys/nonces and authenticated metadata. The new implementation adopts libsodium to provide XChaCha20 and the memory-hard password KDF in the same worker dependency. It adds a dependency and WebAssembly/browser compatibility surface that must be maintained. [Libsodium XChaCha20 documentation](https://doc.libsodium.org/secret-key_cryptography/aead/chacha20-poly1305/xchacha20-poly1305_construction), [libsodium.js](https://github.com/jedisct1/libsodium.js).

## Inner content envelope

The complete inner envelope is encrypted, including all lengths and filenames:

```text
bytes                   meaning
4                       ASCII ECN1
4                       logical envelope length L, including this header and excluding padding
4                       UTF-8 text byte length T
2                       file count F
T                       raw UTF-8 text
repeat F times:
    2                   filename byte length N
    2                   media-type byte length M
    4                   file byte length D
    N                   NFC-normalized UTF-8 filename
    M                   lowercase ASCII media type
    D                   unmodified file bytes
remaining               cryptographically random padding
```

The total plaintext length is exactly `ceil(L / 4096) * 4096`, with a minimum of 4096 bytes. The ciphertext length is therefore a positive multiple of 4096 plus 16. For text-only content, the 14-byte inner header leaves 4082 text bytes in the first bucket. A maximum-size input plus bounded file metadata fits within the outer packet limit.

The decoder checks each boundary before slicing or allocating, checks the aggregate unpadded content limit, validates UTF-8, requires the cursor to finish exactly at `L`, and rejects extra logical bytes or nonminimal padding buckets. Padding conceals exact total size only within the exposed 4 KiB bucket. It does not hide the bucket, packet timing, count of downloads, or network metadata.

File names are NFC-normalized on creation and required to already be canonical on decoding. Paths, separators, control and bidirectional formatting characters, reserved device names, trailing dots/spaces and names that collide after lowercase conversion are rejected. Filesystems can impose additional restrictions; a later output error must not cause an automatic retrieval retry. Empty media types become `application/octet-stream`; nonempty types must be bounded lowercase `type/subtype` tokens without parameters. A media type is sender-supplied data, not a safety assessment. Clients must not execute or automatically preview files. Downloads require an explicit action, and CLI clients must independently enforce their output directory and refuse unintended overwrites.

## Metadata, passphrase check and opening

1. Parse a complete link locally. An invalid or missing key must not trigger a metadata or open request.
2. Derive the peek capability from `S` and the ID. Retrieve metadata using `POST /api/notes/:id/meta` with `{ "token": "<peek-token>" }`.
3. Validate the canonical header and matching ID. Check the locally derived peek hash against the header.
4. On the user's explicit Open action, obtain the passphrase if required and derive `K` and `R` in the worker. Compare `SHA256(R)` with the metadata read hash locally. A wrong passphrase stops here and consumes no open.
5. Send `POST /api/notes/:id/open` with the read capability. The server independently checks authorization and the remaining lifetime/count in the same atomic cache operation that decrements the count or deletes the last copy.
6. Compare exact header bytes, authenticate/decrypt, then parse and display the bounded content.

The local read-hash check avoids consuming a valid note after a typo. It is not an independent signature on the metadata: a malicious server can alter metadata, refuse service or delete a note. Metadata integrity is finally checked by AEAD on the returned ciphertext. Clients must never downgrade the format or retry a consuming request automatically after timeout or an ambiguous connection failure.

At most the configured number of authorized retrievals may occur, across all application instances sharing the authoritative cache. A network interruption can consume an open without delivering usable data. The server cannot determine whether a human actually read content, prevent a recipient from copying it, or retract a package that was already retrieved.

## Admission proof

The server issues a cryptographically random 32-byte challenge and retains a 420-second lease in the shared cache. There is no challenge-signing key: validity and one-time use are coordinated by that authoritative cache. Proof verification is independent of the encryption key:

```text
packet_hash = lowerhex(SHA256(exact_packet_bytes))
proof_hash  = SHA256(UTF8(challenge + "." + packet_hash + "." + decimal_nonce))
```

The required number of leading **bits**, not hexadecimal characters, must be zero. The nonce is a canonical decimal integer in `0..9007199254740991`. Clients bound accepted proof difficulty and support cancellation/expiry. The server binds the proof to the packet and atomically marks the challenge spent when it admits the record. A proof cannot replace body-size, memory, request-duration, concurrency or global admission limits. It does not prove that a caller is human.

## Storage and lifecycle requirements

Every note has both a maximum lifetime and an open limit. The cache must atomically create a complete record with expiry, authorize/open/decrement/delete it, and authorize deletion. Separate reads followed by a decrement or delete are not sufficient. Fixed Lua scripts provide atomic execution on one authoritative Valkey primary; ordinary asynchronous replica failover can lose prior decrements. A deployment must not claim strict consumption semantics across failover without a separate consistency design. [Valkey scripting](https://valkey.io/topics/eval-intro/), [Valkey replication](https://valkey.io/topics/replication/).

Volatile storage requires more than choosing Valkey: disable RDB and AOF, snapshots/backups, swap and core dumps, and avoid request/body logs and proxy temporary files. Native expirations and hard memory limits are required; capacity exhaustion rejects new creation instead of evicting a live note. Provider snapshots and hypervisor behavior require separate verification. A cache restart loses the notes, while an application-only restart can leave them available until their original cache expiry. [Valkey persistence](https://valkey.io/topics/persistence/).

Browser clients keep secrets in memory, use no service worker or persistent secret store, and use generation guards plus absolute deadlines around asynchronous work. Creation and reading contexts clear after five minutes of inactivity with a 30-second warning. Displayed plaintext clears when the page becomes hidden; an unopened recipient context may briefly background to obtain a passphrase, but its inactivity deadline continues. Clearing aborts requests, terminates crypto workers and revokes tracked object URLs. These actions cannot guarantee physical erasure from JavaScript strings, browser/OS memory, clipboard history, user-created files or another recipient's copies.

The fixed Argon2id parameters are deliberately part of the format, rather than relying on a library's changeable default. Future parameter changes require a new supported profile/version with bounded decoding. [Libsodium password hashing](https://doc.libsodium.org/password_hashing/default_phf), [HKDF](https://doc.libsodium.org/key_derivation/hkdf), [WebCrypto deriveBits](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits).
