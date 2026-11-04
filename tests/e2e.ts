import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { Client } from '../cli/client';
import {
  create,
  derivePeek,
  prepareOpen,
  decrypt,
  solveProof,
  ProtocolError,
} from '../shared/index';
import type { ContentInput, CreatedNote } from '../shared/index';

const { values } = parseArgs({ options: { server: { type: 'string' } } });
if (!values.server)
  throw new Error('Explicit --server required. Tests create and consume synthetic packages.');
const client = new Client(values.server);
const outstanding: CreatedNote[] = [];
let assertions = 0;
function passed(name: string) {
  assertions++;
  process.stdout.write(`PASS ${name}\n`);
}

async function upload(input: ContentInput, views = 1, passphrase = '') {
  const note = await create(input, { ttl: 60, views, passphrase });
  const challenge = await client.challenge();
  const nonce = await solveProof(note.packet, challenge);
  const receipt = await client.create(note.packet, challenge, nonce);
  assert.equal(receipt.id, note.id);
  outstanding.push(note);
  return { note, challenge, nonce };
}

try {
  for (const path of ['/', '/create', '/about', '/privacy', '/terms', '/view']) {
    const response = await fetch(client.origin + path, { redirect: 'error' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.match(response.headers.get('content-security-policy') ?? '', /form-action 'none'/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('set-cookie'), null);
    const html = await response.text();
    assert.match(html, /<html[^>]+lang="en"/);
    if (path === '/') {
      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(
        (match) => match[1]!,
      );
      assert.ok(scripts.includes('/theme.js'), 'The early theme script must be present.');
      assert.ok(scripts.length >= 2, 'The production app script must be present.');
      for (const source of scripts) {
        assert.match(source, /^\/(?:theme\.js|assets\/[\w.-]+\.js)$/);
        const script = await fetch(client.origin + source, { redirect: 'error' });
        assert.equal(script.status, 200, `Missing startup script: ${source}`);
        assert.match(script.headers.get('content-type') ?? '', /(?:text|application)\/javascript/);
        assert.equal(script.headers.get('x-content-type-options'), 'nosniff');
        assert.match(script.headers.get('cache-control') ?? '', /no-store/);
        assert.ok((await script.text()).trim().length > 0);
      }
    }
  }
  passed('pages, startup scripts, no-store, CSP, referrer policy and no cookies');
  for (const path of ['/server/Cargo.toml', '/.env', '/api/unknown', '/assets/absent.js']) {
    const response = await fetch(client.origin + path);
    assert.equal(response.status, 404);
  }
  passed('unknown API, missing assets and source paths are inaccessible');
  const input = {
    text: '\uFEFFSynthetic test only. Grüße / 日本語\n<script>not executable</script>',
    files: [],
  };
  const protectedNote = await upload(input, 1, 'separate test phrase');
  const preview = await client.meta(
    protectedNote.note.id,
    await derivePeek(protectedNote.note.secret, protectedNote.note.id),
  );
  await assert.rejects(
    prepareOpen(preview.header, protectedNote.note.secret, protectedNote.note.id, 'wrong phrase'),
    (error) => error instanceof ProtocolError && error.code === 'wrong_passphrase',
  );
  assert.equal(
    (
      await client.meta(
        protectedNote.note.id,
        await derivePeek(protectedNote.note.secret, protectedNote.note.id),
      )
    ).remaining,
    1,
  );
  passed('wrong passphrase does not consume a retrieval');
  const prepared = await prepareOpen(
    preview.header,
    protectedNote.note.secret,
    protectedNote.note.id,
    'separate test phrase',
  );
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => client.open(protectedNote.note.id, prepared.readToken)),
  );
  const successes = results.filter(
    (result): result is PromiseFulfilledResult<Uint8Array> => result.status === 'fulfilled',
  );
  assert.equal(successes.length, 1);
  assert.deepEqual(await decrypt(successes[0]!.value, prepared), input);
  prepared.key.fill(0);
  passed(
    'exactly one successful authorized opening among concurrent requests, correct Unicode decryption',
  );
  await assert.rejects(
    client.create(protectedNote.note.packet, protectedNote.challenge, protectedNote.nonce),
  );
  passed('reusing a creation proof is rejected');
  const content: ContentInput = {
    text: 'Synthetic binary attachments.',
    files: [
      {
        name: 'sample.bin',
        mime: 'application/octet-stream',
        data: Uint8Array.from({ length: 65537 }, (_, index) => index % 256),
      },
      {
        name: 'notes.txt',
        mime: 'text/plain',
        data: new TextEncoder().encode('Payload\n\u0000\uFEFF'),
      },
    ],
  };
  const binary = (await upload(content, 2)).note;
  const metadata = await client.meta(binary.id, await derivePeek(binary.secret, binary.id));
  assert.equal(metadata.remaining, 2);
  const key = await prepareOpen(metadata.header, binary.secret, binary.id);
  assert.deepEqual(await decrypt(await client.open(binary.id, key.readToken), key), content);
  assert.equal(
    (await client.meta(binary.id, await derivePeek(binary.secret, binary.id))).remaining,
    1,
  );
  await client.revoke(binary.id, binary.revokeToken);
  await assert.rejects(client.open(binary.id, key.readToken));
  key.key.fill(0);
  passed(
    'encrypted binary files, combined text, exact bytes, retrieval count and sender revocation',
  );
  const forbidden = await fetch(client.origin + '/api/notes', {
    method: 'POST',
    headers: { Origin: 'https://unrelated.invalid', 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(1),
  });
  assert.equal(forbidden.status, 403);
  passed('cross-origin creation rejected');
  process.stdout.write(
    `Completed ${assertions} end-to-end checks. Only synthetic test content was used.\n`,
  );
} finally {
  for (const note of outstanding) {
    try {
      await client.revoke(note.id, note.revokeToken);
    } catch {
      /* Already consumed or revoked. */
    }
    note.packet.fill(0);
  }
}
