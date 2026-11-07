import { describe, expect, it, vi } from 'vitest';
import {
  create,
  decrypt,
  derivePeek,
  parsePacket,
  prepareOpen,
  toBase64Url,
} from '../../shared/index.ts';
import { nativeHkdf } from '../../shared/hkdf.ts';
import { workerHkdf } from '../src/lib/worker-hkdf.ts';
import { canonicalI2pOrigin } from '../src/lib/site.ts';

const pin = `http://${'a'.repeat(51)}q.b32.i2p`;
const csprng = { getRandomValues: crypto.getRandomValues.bind(crypto) };
const fallback = () => workerHkdf(pin, pin, false, csprng);

describe('I2P worker key derivation', () => {
  it('accepts only a canonical 256-bit destination and its optional root slash as a build pin', () => {
    expect(canonicalI2pOrigin(pin)).toBe(pin);
    expect(canonicalI2pOrigin(pin + '/')).toBe(pin);
    for (const value of [
      undefined,
      '',
      pin.toUpperCase(),
      pin + '.',
      pin + ':80',
      pin + '/path',
      pin + '?host=1',
      pin + '#test',
      pin.replace('http:', 'https:'),
      pin.replace('http://', 'http://user@'),
      pin.replace('q.b32', 'b.b32'),
      pin.replace('q.b32', '.b32'),
      pin + '\n',
    ])
      expect(canonicalI2pOrigin(value)).toBeNull();
  });

  it('requires this worker origin, its exact build pin, and a working platform random source', () => {
    for (const origin of [
      pin.replace('q.', 'a.'),
      pin + '.',
      pin + ':8080',
      'http://ordinary.test',
      'https://example.com',
      'null',
    ]) {
      expect(() => workerHkdf(origin, pin, false, csprng)).toThrow();
    }
    for (const incorrectPin of [null, pin.replace('q.', 'a.'), 'http://ordinary.test']) {
      expect(() => workerHkdf(pin, incorrectPin, false, csprng)).toThrow();
    }
    expect(() =>
      workerHkdf('http://ordinary.test', 'http://ordinary.test', false, csprng),
    ).toThrow();
    expect(() => workerHkdf(pin, pin, false, undefined)).toThrow();
    expect(() =>
      workerHkdf(pin, pin, false, {
        getRandomValues: () => {
          throw Error('unavailable');
        },
      }),
    ).toThrow();
  });

  it('uses native WebCrypto whenever available and never retries a native failure with noble', async () => {
    const selected = workerHkdf(pin, pin, false, crypto);
    expect(selected).toBe(nativeHkdf);
    expect(workerHkdf('https://example.com', pin, true, crypto)).toBe(nativeHkdf);
    expect(() => workerHkdf('http://ordinary.test', pin, false, crypto)).toThrow();
    expect(() => workerHkdf('https://example.com', pin, true, csprng)).toThrow();
    const failed = vi
      .spyOn(crypto.subtle, 'importKey')
      .mockRejectedValue(new Error('Native failure'));
    try {
      const bytes = new Uint8Array(8);
      await expect(selected(bytes, bytes, bytes, 32)).rejects.toThrow('Native failure');
    } finally {
      failed.mockRestore();
    }
  });

  it('matches RFC 5869 Appendix A.1 and the native HKDF-SHA-256 result', async () => {
    const ikm = new Uint8Array(22).fill(0x0b);
    const salt = Uint8Array.from({ length: 13 }, (_, i) => i);
    const info = Uint8Array.from({ length: 10 }, (_, i) => 0xf0 + i);
    const expected =
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865';
    const actual = await fallback()(ikm, salt, info, 42);
    expect(Buffer.from(actual).toString('hex')).toBe(expected);
    expect(actual).toEqual(await nativeHkdf(ikm, salt, info, 42));
  });

  it('exchanges passphrase-protected packages in both directions without changing their wire format', async () => {
    const input = { text: 'interoperability check', files: [] };
    const passphrase = 'test passphrase';
    for (const [send, receive] of [
      [nativeHkdf, fallback()],
      [fallback(), nativeHkdf],
    ]) {
      const note = await create(input, { views: 1, ttl: 60, passphrase }, send);
      const header = toBase64Url(parsePacket(note.packet).headerBytes);
      expect(await derivePeek(note.secret, note.id, receive)).toBe(
        await derivePeek(note.secret, note.id, send),
      );
      await expect(
        prepareOpen(header, note.secret, note.id, 'incorrect', receive),
      ).rejects.toMatchObject({ code: 'wrong_passphrase' });
      const prepared = await prepareOpen(header, note.secret, note.id, passphrase, receive);
      try {
        expect(await decrypt(note.packet, prepared)).toEqual(input);
      } finally {
        prepared.key.fill(0);
        note.packet.fill(0);
      }
    }
  });
});
