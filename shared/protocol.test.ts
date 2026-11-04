import { createHash, hkdfSync } from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ARGON_MEMORY_BYTES,
  ARGON_OPSLIMIT,
  MAX_CONTENT_BYTES,
  MAX_PACKET_BYTES,
  MAX_TEXT_BYTES,
  create,
  decodeHeader,
  decrypt,
  derivePeek,
  fromBase64Url,
  makeShareLink,
  normalizeFilename,
  pack,
  parseHeader,
  parsePacket,
  parseShareLink,
  prepareOpen,
  serializeHeader,
  solveProof,
  toBase64Url,
  unpack,
  type CreatedNote,
  type Header,
} from './index';

const text = new TextEncoder();
const options = { ttl: 3600, views: 1 };
const header64 = (note: CreatedNote) => toBase64Url(parsePacket(note.packet).headerBytes);
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
beforeAll(async () => {
  await sodium.ready;
});

describe('protocol cryptography', () => {
  it('matches the upstream libsodium XChaCha20-Poly1305 known-answer vector', () => {
    // https://github.com/jedisct1/libsodium/blob/master/test/default/aead_xchacha20poly1305.{c,exp}
    const key = Uint8Array.from({ length: 32 }, (_, i) => 128 + i);
    const nonce = sodium.from_hex('07000000404142434445464748494a4b4c4d4e4f50515253');
    const aad = sodium.from_hex('50515253c0c1c2c3c4c5c6c7');
    const message = text.encode(
      "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
    );
    const expected =
      'f8ebea4875044066fc162a0604e171feecfb3d20425248563bcfd5a155dcc47bbda70b86e5ab9b55002bd1274c02db35321acd7af8b2e2d25015e136b7679458e9f43243bf719d639badb5feac03f80a19a96ef10cb1d15333a837b90946ba3854ee74da3f2585efc7e1e170e17e15e563e77601f4f85cafa8e5877614e143e68420';
    expect(
      sodium.to_hex(
        sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(message, aad, null, nonce, key),
      ),
    ).toBe(expected);
  });

  it('round trips Unicode, control characters, binary files and empty files', async () => {
    const input = {
      text: '\ufeffHello, 世界 🌍\u0000\n',
      files: [
        {
          name: 'résumé.bin',
          mime: 'application/octet-stream',
          data: Uint8Array.from([0, 255, 1, 128]),
        },
        { name: 'empty.txt', mime: 'text/plain', data: new Uint8Array() },
      ],
    };
    const note = await create(input, options);
    const prepared = await prepareOpen(header64(note), note.secret, note.id);
    expect(await decrypt(note.packet, prepared)).toEqual(input);
    expect(note.packet.length).toBeLessThan(MAX_PACKET_BYTES);
    prepared.key.fill(0);
  });

  it('uses independently reproducible HKDF domains and unrelated revoke capability', async () => {
    const note = await create({ text: 'key roles', files: [] }, options);
    const prepared = await prepareOpen(header64(note), note.secret, note.id);
    const master = fromBase64Url(note.secret, 32);
    const material = new Uint8Array(64);
    material.set(master);
    const independent = (info: string) =>
      new Uint8Array(hkdfSync('sha256', material, `erase.to/v1/content:${note.id}`, info, 32));
    expect(prepared.key).toEqual(independent('erase.to/v1/aead:none'));
    expect(fromBase64Url(prepared.readToken, 32)).toEqual(independent('erase.to/v1/read:none'));
    const peek = await derivePeek(note.secret, note.id);
    const peekExpected = new Uint8Array(
      hkdfSync('sha256', master, `erase.to/v1/peek:${note.id}`, 'erase.to/v1/peek', 32),
    );
    expect(fromBase64Url(peek, 32)).toEqual(peekExpected);
    expect(note.header.peek).toBe(digest(peekExpected));
    expect(note.header.read).toBe(digest(fromBase64Url(prepared.readToken, 32)));
    expect(note.header.revoke).toBe(digest(fromBase64Url(note.revokeToken, 32)));
    expect(
      new Set([note.secret, peek, prepared.readToken, note.revokeToken, toBase64Url(prepared.key)])
        .size,
    ).toBe(5);
    prepared.key.fill(0);
    master.fill(0);
    material.fill(0);
  });

  it('rejects wrong passphrases before a consuming operation and retains link entropy', async () => {
    const note = await create(
      { text: 'protected', files: [] },
      { ...options, passphrase: 'correct phrase' },
    );
    const consume = vi.fn();
    await expect(
      (async () => {
        const prepared = await prepareOpen(header64(note), note.secret, note.id, 'typo');
        consume(prepared.readToken);
      })(),
    ).rejects.toMatchObject({ code: 'wrong_passphrase' });
    expect(consume).not.toHaveBeenCalled();
    await expect(
      prepareOpen(header64(note), toBase64Url(new Uint8Array(32)), note.id, 'correct phrase'),
    ).rejects.toMatchObject({ code: 'invalid_link' });
    const prepared = await prepareOpen(header64(note), note.secret, note.id, 'correct phrase');
    expect((await decrypt(note.packet, prepared)).text).toBe('protected');
    const pw = sodium.crypto_pwhash(
      32,
      text.encode('correct phrase'),
      fromBase64Url(note.header.salt, 16),
      ARGON_OPSLIMIT,
      ARGON_MEMORY_BYTES,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    );
    const material = new Uint8Array(64);
    material.set(fromBase64Url(note.secret, 32));
    material.set(pw, 32);
    expect(prepared.key).toEqual(
      new Uint8Array(
        hkdfSync(
          'sha256',
          material,
          `erase.to/v1/content:${note.id}`,
          'erase.to/v1/aead:argon2id',
          32,
        ),
      ),
    );
    prepared.key.fill(0);
    pw.fill(0);
    material.fill(0);
  });

  it('authenticates all exact header bytes, ciphertext and authentication tag', async () => {
    const note = await create({ text: 'authenticated', files: [] }, options);
    const prepared = await prepareOpen(header64(note), note.secret, note.id);
    for (const index of [8 + parsePacket(note.packet).headerBytes.length, note.packet.length - 1]) {
      const tampered = note.packet.slice();
      tampered[index]! ^= 1;
      await expect(decrypt(tampered, prepared)).rejects.toMatchObject({
        code: 'decryption_failed',
      });
    }
    const changed = { ...note.header, ttl: 7200 };
    const bytes = serializeHeader(changed);
    const packet = note.packet.slice();
    packet.set(bytes, 8);
    await expect(decrypt(packet, prepared)).rejects.toMatchObject({ code: 'invalid_package' });
    // Even preparing against the substituted metadata cannot make its old ciphertext authenticate.
    const changedPrepared = await prepareOpen(toBase64Url(bytes), note.secret, note.id);
    await expect(decrypt(packet, changedPrepared)).rejects.toMatchObject({
      code: 'decryption_failed',
    });
    changedPrepared.key.fill(0);
    prepared.key.fill(0);
  });

  it('uses fresh master, ID, nonce and revoke secret for repeated equal input', async () => {
    const a = await create({ text: 'same', files: [] }, options);
    const b = await create({ text: 'same', files: [] }, options);
    expect(a.secret).not.toBe(b.secret);
    expect(a.id).not.toBe(b.id);
    expect(a.header.nonce).not.toBe(b.header.nonce);
    expect(a.revokeToken).not.toBe(b.revokeToken);
    expect(a.packet).not.toEqual(b.packet);
  });
});

describe('bounded canonical envelopes', () => {
  it('pads complete content to 4 KiB buckets including encrypted length fields', () => {
    expect(pack({ text: 'a', files: [] }).length).toBe(4096);
    expect(pack({ text: 'a'.repeat(4082), files: [] }).length).toBe(4096);
    expect(pack({ text: 'a'.repeat(4083), files: [] }).length).toBe(8192);
    const a = pack({ text: 'a', files: [] });
    const b = pack({ text: 'a', files: [] });
    expect(a.slice(15)).not.toEqual(b.slice(15));
  });
  it('handles maximum control-character text without JSON size inflation', () => {
    const input = { text: '\u0000'.repeat(MAX_TEXT_BYTES), files: [] };
    expect(unpack(pack(input))).toEqual(input);
    expect(() => pack({ text: 'é'.repeat(MAX_TEXT_BYTES), files: [] })).toThrow();
  });
  it('authenticates exactly 64 MiB with a passphrase and rejects one extra byte', async () => {
    const data = new Uint8Array(MAX_CONTENT_BYTES - 1).fill(197);
    data[0] = 0;
    data[65535] = 128;
    data[data.length - 1] = 255;
    const input = { text: 'a', files: [{ name: 'maximum.bin', mime: '', data }] };
    const expectedDigest = digest(data);
    const note = await create(input, { ...options, passphrase: 'synthetic maximum-size test' });
    const prepared = await prepareOpen(
      header64(note),
      note.secret,
      note.id,
      'synthetic maximum-size test',
    );
    let output: Awaited<ReturnType<typeof decrypt>> | undefined;
    try {
      output = await decrypt(note.packet, prepared);
      expect(output.text).toBe('a');
      expect(output.files[0]!.data.length).toBe(64 * 1024 * 1024 - 1);
      expect(digest(output.files[0]!.data)).toBe(expectedDigest);
      expect(output.files[0]!.mime).toBe('application/octet-stream');
      expect(note.packet.length).toBeLessThanOrEqual(MAX_PACKET_BYTES);
      expect(() => pack({ ...input, text: 'ab' })).toThrow();
    } finally {
      prepared.key.fill(0);
      note.packet.fill(0);
      data.fill(0);
      for (const file of output?.files ?? []) file.data.fill(0);
    }
  }, 30000);
  it('validates normalized, portable file names and refuses collisions', () => {
    expect(normalizeFilename('re\u0301sume\u0301.txt')).toBe('résumé.txt');
    for (const name of [
      '../escape',
      'C:\\file',
      '/root',
      '..',
      'CON.txt',
      'nul',
      'file.',
      'file ',
      'in\u0000valid',
      'spoof\u202Etxt',
      'x'.repeat(256),
    ]) {
      expect(() => normalizeFilename(name), name).toThrow();
    }
    const file = { name: 'same.txt', mime: 'text/plain', data: new Uint8Array() };
    expect(() => pack({ text: '', files: [file, { ...file, name: 'SAME.txt' }] })).toThrow();
    expect(() =>
      pack({
        text: '',
        files: Array.from({ length: 9 }, (_, i) => ({ ...file, name: `${i}.txt` })),
      }),
    ).toThrow();
    expect(() =>
      pack({ text: '', files: [{ ...file, mime: 'text/html; charset=utf8' }] }),
    ).toThrow();
    expect(() => pack({ text: '\ud800', files: [] })).toThrow();
  });
  it('rejects malformed logical sizes, trailing logical bytes and truncated files', () => {
    const good = pack({ text: 'x', files: [] });
    const extra = good.slice();
    new DataView(extra.buffer).setUint32(4, 16, false);
    expect(() => unpack(extra)).toThrow();
    const huge = good.slice();
    new DataView(huge.buffer).setUint32(8, 0xffffffff, false);
    expect(() => unpack(huge)).toThrow();
    const tooMany = good.slice();
    new DataView(tooMany.buffer).setUint16(12, 9, false);
    expect(() => unpack(tooMany)).toThrow();
    expect(() => unpack(good.subarray(1))).toThrow();
  });
  it('rejects duplicate, reordered, unknown and out-of-range header fields', async () => {
    const note = await create({ text: 'header', files: [] }, options);
    const good = new TextDecoder().decode(serializeHeader(note.header));
    expect(decodeHeader(header64(note))).toEqual(note.header);
    for (const bad of [
      good.replace('"version":1', '"version":1,"version":1'),
      ` ${good}`,
      good.replace('"version":1', '"version":1.0'),
      good.replace('"version":1', '"version":1,"extra":0'),
    ]) {
      expect(() => parseHeader(text.encode(bad))).toThrow();
    }
    for (const replacement of [
      { ttl: 0 },
      { ttl: 604801 },
      { views: 0 },
      { views: 101 },
      { kdf: 'argon2id' },
      { salt: 'extra' },
      { nonce: note.header.nonce + '=' },
      { version: 2 },
    ]) {
      expect(() =>
        parseHeader(serializeHeader({ ...note.header, ...replacement } as Header)),
      ).toThrow();
    }
    const packet = note.packet.slice();
    new DataView(packet.buffer).setUint32(4, 0xffffffff, false);
    expect(() => parsePacket(packet)).toThrow();
    expect(() => parsePacket(note.packet.subarray(0, note.packet.length - 1))).toThrow();
  });
});

describe('links and upload proof', () => {
  it('keeps both ID and secret in the fragment and validates the whole link', async () => {
    const note = await create({ text: 'link', files: [] }, options);
    const link = makeShareLink('https://erase.to', note.id, note.secret);
    expect(new URL(link).pathname).toBe('/view');
    expect(parseShareLink(link)).toEqual({ id: note.id, secret: note.secret });
    for (const bad of [
      link.replace('/view#', '/view?key=oops#'),
      link + '=',
      link.replace('#1.', '#2.'),
      link.replace('/view#', '/other#'),
      'javascript:alert(1)',
    ])
      expect(() => parseShareLink(bad)).toThrow();
    // Nonzero discarded base64 bits must not provide alternate spellings of the same secret.
    expect(() => fromBase64Url('A'.repeat(42) + 'B', 32)).toThrow();
  });
  it('solves bit-based proof bound to exact packet and rejects expiry/cancellation', async () => {
    const note = await create({ text: 'proof', files: [] }, options);
    const challenge = {
      challenge: 'test.signed.challenge',
      bits: 9,
      expires_at: Math.floor(Date.now() / 1000) + 120,
    };
    const nonce = await solveProof(note.packet, challenge);
    const proof = createHash('sha256')
      .update(`${challenge.challenge}.${digest(note.packet)}.${nonce}`)
      .digest();
    expect(proof[0]).toBe(0);
    expect(proof[1]! >>> 7).toBe(0);
    await expect(solveProof(note.packet, { ...challenge, expires_at: 1 })).rejects.toMatchObject({
      code: 'proof_expired',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      solveProof(note.packet, challenge, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    await expect(solveProof(note.packet, { ...challenge, bits: 100 })).rejects.toMatchObject({
      code: 'invalid_challenge',
    });
  });
});
