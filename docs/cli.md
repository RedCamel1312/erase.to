# Command line client

The CLI encrypts and decrypts locally using the same `shared/` implementation as the browser worker. It supports text, up to eight files, an additional passphrase, and sender revocation. It does not provide a background service, account, saved session or automatic recovery after an ambiguous delivery failure.

Install the repository's pinned dependencies first. Run commands from the repository root with Node 24:

```sh
pnpm install --frozen-lockfile
pnpm exec tsx cli/index.ts help
```

`pnpm cli help` is also available. The examples below use `pnpm exec tsx` so redirected output contains the command's JSON rather than a package-script banner. Shell examples use Bash on a Unix-like system. File permission behavior differs on Windows; use appropriate Windows access controls for local secret files.

## Inputs, outputs and limits

| Command | Standard input | Standard output |
| --- | --- | --- |
| `send` | UTF-8 message, or optional message alongside files | Secret JSON receipt containing the sharing URL and revoke capability |
| `receive` | One complete sharing URL | JSON count of files written, including a generated text file when present |
| `revoke` | The original JSON receipt, or an object containing `id` and `token` | `Revoked.` on success |

Errors go to standard error and set a nonzero exit status. Positional arguments are rejected: content, links and capabilities belong on standard input rather than in command arguments. Paths and public service origins are arguments; avoid putting secrets in file names.

Text is limited to 8 MiB of UTF-8 bytes; this is a byte limit, not a character count. Raw file bytes and text together are limited to 64 MiB. Up to eight files, including empty files, are allowed. An entirely empty text-only message is rejected. File names must satisfy the portable-name and collision checks in [the protocol](protocol.md). The CLI labels uploaded files `application/octet-stream`; their raw bytes are unchanged.

Standard-input text is not trimmed, and a leading UTF-8 byte-order mark is preserved as U+FEFF. The `receive` command trims surrounding whitespace from its input link. Ill-formed UTF-8 is rejected.

## Sending text

Use a protected local file or pipe as input. These examples contain only synthetic data:

```sh
umask 077
printf 'A synthetic test message\n' > message-input.txt
pnpm exec tsx cli/index.ts send --server https://erase.to \
  --ttl 3600 --views 1 < message-input.txt > receipt.json
```

The defaults are `https://erase.to`, a 3,600-second lifetime and one authorized retrieval. `--ttl` accepts whole seconds from 60 through 604800; `--views` accepts an integer from 1 through 100. Both limits apply simultaneously.

The receipt has this shape; the placeholders below are not working credentials:

```json
{
  "url": "https://erase.to/view#1.<id>.<master-secret>",
  "expires_at": 1800000000,
  "revoke": { "id": "<id>", "token": "<revoke-capability>" }
}
```

Share only the `url` value with the recipient. The complete receipt also grants the ability to revoke the remaining server copy. Retain it only as long as needed and protect it like a secret. `umask 077` restricts newly created files; it does not tighten the permissions of an existing file that shell redirection truncates. Use a fresh receipt path or verify its permissions first.

## Sending files, with or without text

Repeat `--file` for each file:

```sh
pnpm exec tsx cli/index.ts send --server https://erase.to \
  --file ./document.pdf --file ./data.bin --ttl 3600 --views 2 \
  < /dev/null > receipt.json
```

To include text, redirect a UTF-8 file instead of `/dev/null`. When files are provided and standard input is an interactive terminal, the command does not wait for an optional text message. Without files, it reads standard input until EOF.

The CLI checks aggregate sizes before reading file contents and performs bounded reads from open regular files. It rejects a file whose size differs from the size checked for that upload. This protects memory allocation against growing files; it does not prove that a concurrently modified file represents an atomic snapshot. Do not edit an input file while sending it.

## Additional passphrases

Use `--passphrase-file PATH`. There is deliberately no `--password SECRET` argument. A Bash prompt can create a private input file without placing the value in shell history:

```sh
umask 077
IFS= read -r -s -p 'Additional passphrase: ' ERASE_PASSPHRASE
printf '\n'
printf '%s' "$ERASE_PASSPHRASE" > passphrase-input.txt
unset ERASE_PASSPHRASE
pnpm exec tsx cli/index.ts send --server https://erase.to \
  --passphrase-file ./passphrase-input.txt \
  < message-input.txt > receipt.json
```

Use a fresh, appropriately protected path. The passphrase file must contain 1–1024 UTF-8 bytes after removing **one final LF or CRLF**. A leading byte-order mark is preserved, and spaces or other trailing bytes are not trimmed. No Unicode normalization is performed. The bounded file reader allows at most two extra bytes for that final line ending.

The random secret remains in the link when a passphrase is enabled. The recipient needs both. Share the passphrase separately if that separation is part of your intended protection. A weak passphrase can still be guessed by someone holding the complete link; the fixed Argon2id work factor increases the cost, not the passphrase's entropy.

## Receiving

`receive` requires `--output DIRECTORY`. The directory is created when necessary and must be empty before the consuming request. Its contents are not deleted to make room. Provide the complete link on standard input:

```sh
pnpm exec tsx cli/index.ts receive --server https://erase.to \
  --output ./received-package < private-link.txt
```

If testing your own receipt, extract its URL without exposing it as a process argument:

```sh
node --input-type=module -e 'import { readFileSync } from "node:fs"; process.stdout.write(JSON.parse(readFileSync(0, "utf8")).url + "\n")' \
  < receipt.json | pnpm exec tsx cli/index.ts receive --output ./received-package
```

Add `--passphrase-file` when the note requires it. If `--server` is omitted, the origin comes from the link. When supplied, it must match the link's origin. The ID and secret are parsed locally; metadata is fetched with a separate capability. The passphrase is checked locally against the read-capability hash **before** `/open` is called. A wrong passphrase does not consume a retrieval.

After authenticated decryption, each attachment is written using exclusive creation (`wx`). Existing files and file symlinks are not overwritten. Nonempty text is saved as `message.txt`, or `message-1.txt`, `message-2.txt`, and so on if an attachment already uses that name. File names are validated independently of the server, and output files request mode `0600` on systems that support it. New directories request `0700`; existing directory permissions remain unchanged.

Writing may still fail after retrieval because of disk errors, a newly occupied path or changed permissions. A partial output may remain, and the retrieval may already have been consumed. Inspect the destination before deciding whether to try again. Files are never automatically opened or executed. Downloading encrypted content does not establish that its sender or eventual plaintext file is safe.

## Revocation

Use the original receipt:

```sh
pnpm exec tsx cli/index.ts revoke --server https://erase.to < receipt.json
```

The input may instead be a protected JSON file containing only `{ "id": "…", "token": "…" }`. A complete receipt can supply the service origin from its URL when `--server` is omitted; a bare capability object otherwise uses the default public service. The read key does not grant revocation authority. Revocation, expiry and exhausted retrieval counts all leave the package unavailable; a recipient's earlier copies are unaffected.

## Transport and failure behavior

The CLI accepts HTTPS origins and loopback HTTP origins for development. It rejects user information in URLs, remote plaintext HTTP, query strings, fragments in the service origin, and non-root service paths. Redirects are rejected. Capabilities are sent in JSON bodies, with credentials omitted and an explicit `Origin` header. Each request has a 330-second timeout and a bounded response reader. The server also applies its own request and connection deadlines; a size below 64 MiB is not a promise of completion on a slow connection.

Every `.i2p` origin is also refused before DNS resolution. Use a browser with a trusted local I2P proxy for the [I2P service](i2p.md).

Every `.onion` origin is rejected before a network request, including HTTPS onion URLs and fully qualified names ending in a dot. Use Tor Browser for the onion service. This CLI does not provide a Tor proxy transport; a hostname alone must not be mistaken for Tor routing.

No consuming request is automatically retried. If a connection fails after the server consumes a retrieval, the last available copy may be gone even though no usable plaintext arrived. A create request can similarly succeed on the server while its response is lost; expiry still bounds that stored record. Treat the command's result as uncertain after an ambiguous transport failure rather than assuming no state changed.

The browser's five-minute session timer does not apply to files written by this CLI. Terminal scrollback, pipes, receipts, passphrase files and received documents are under the local user's control. The CLI wipes mutable working arrays where practical, but does not promise physical memory or disk erasure. See [the threat model](threat-model.md).
