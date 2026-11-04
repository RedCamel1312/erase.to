import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Client } from '../cli/client';
import {
  create,
  derivePeek,
  prepareOpen,
  decrypt,
  solveProof,
  MAX_CONTENT_BYTES,
  MAX_TEXT_BYTES,
} from '../shared/index';
import type { CreatedNote } from '../shared/index';

const { values } = parseArgs({ options: { server: { type: 'string' } } });
if (!values.server)
  throw new Error(
    'Explicit --server required. This check transfers a synthetic maximum-size package.',
  );
const client = new Client(values.server);
const expectedText = 'T'.repeat(MAX_TEXT_BYTES);
const file = new Uint8Array(MAX_CONTENT_BYTES - MAX_TEXT_BYTES);
for (let offset = 0; offset < file.length; offset++) file[offset] = offset % 256;
const expectedDigest = createHash('sha256').update(file).digest('hex');
let note: CreatedNote | undefined;
let decryptionKey: Uint8Array | undefined;

try {
  note = await create(
    {
      text: expectedText,
      files: [{ name: 'synthetic-boundary.bin', mime: 'application/octet-stream', data: file }],
    },
    { ttl: 600, views: 2, passphrase: 'Synthetic maximum-size verification' },
  );
  file.fill(0);
  const challenge = await client.challenge();
  const nonce = await solveProof(note.packet, challenge);
  const receipt = await client.create(note.packet, challenge, nonce);
  assert.equal(receipt.id, note.id);
  const peek = await derivePeek(note.secret, note.id);
  const metadata = await client.meta(note.id, peek);
  assert.equal(metadata.remaining, 2);
  const prepared = await prepareOpen(
    metadata.header,
    note.secret,
    note.id,
    'Synthetic maximum-size verification',
  );
  decryptionKey = prepared.key;
  const received = await client.open(note.id, prepared.readToken);
  const content = await decrypt(received, prepared);
  assert.equal(content.text, expectedText);
  assert.equal(content.files.length, 1);
  assert.equal(content.files[0]!.name, 'synthetic-boundary.bin');
  assert.equal(content.files[0]!.data.length, MAX_CONTENT_BYTES - MAX_TEXT_BYTES);
  assert.equal(createHash('sha256').update(content.files[0]!.data).digest('hex'), expectedDigest);
  content.files[0]!.data.fill(0);
  received.fill(0);
  assert.equal((await client.meta(note.id, peek)).remaining, 1);
  await client.revoke(note.id, note.revokeToken);
  await assert.rejects(client.open(note.id, prepared.readToken));
  process.stdout.write(
    `PASS ${MAX_CONTENT_BYTES} content bytes, ${MAX_TEXT_BYTES} text bytes, exact file digest, passphrase, retrieval count and revocation.\n`,
  );
} finally {
  decryptionKey?.fill(0);
  file.fill(0);
  if (note) {
    try {
      await client.revoke(note.id, note.revokeToken);
    } catch {
      /* Already revoked, consumed or expired. */
    }
    note.packet.fill(0);
  }
}
