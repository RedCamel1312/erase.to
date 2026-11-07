import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBoundedFile, writeContent } from './index';
import { Client, serverOrigin } from './client';
import { MAX_PACKET_BYTES } from '../shared/index';

const directories: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'erase-cli-test-'));
  directories.push(path);
  return path;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
describe('CLI boundaries', () => {
  it('accepts HTTPS and local development but rejects credentials, remote HTTP and redirect-like paths', () => {
    expect(serverOrigin('https://erase.to/')).toBe('https://erase.to');
    expect(serverOrigin('http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001');
    for (const value of [
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com/?key=secret',
      'https://example.com/#secret',
      'file:///tmp/x',
      'http://' + 'a'.repeat(56) + '.onion',
      'https://' + 'a'.repeat(56) + '.onion',
    ])
      expect(() => serverOrigin(value)).toThrow();
  });
  it('bounds file reads and preserves bytes at the exact limit', async () => {
    const path = join(await directory(), 'input.bin');
    const data = new Uint8Array(70000).fill(197);
    await writeFile(path, data);
    await expect(readBoundedFile(path, data.length - 1)).rejects.toThrow();
    expect(await readBoundedFile(path, data.length)).toEqual(data);
  });
  it('rejects onion FQDN spellings before a transport can be constructed', () => {
    const host = 'a'.repeat(56) + '.onion';
    for (const origin of [
      `https://${host}.`,
      `https://${host.toUpperCase()}.`,
      `https://${host}..`,
      `http://${host}.`,
    ]) {
      expect(() => serverOrigin(origin)).toThrow('Tor transport');
    }
  });
  it('rejects I2P addresses before invoking the network transport', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    for (const host of [
      'example.i2p',
      'example.i2p.',
      'EXAMPLE.I2P..',
      'a'.repeat(52) + '.b32.i2p',
      'i2p.',
    ]) {
      for (const scheme of ['https', 'http']) {
        expect(() => new Client(`${scheme}://${host}`)).toThrow('I2P transport');
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds a consuming request and never retries an ambiguous network failure', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Synthetic connection failure'));
    await expect(
      new Client('https://example.com').open('A'.repeat(43), 'B'.repeat(43)),
    ).rejects.toThrow('Synthetic connection failure');
    expect(timeout).toHaveBeenCalledWith(330000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/open'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
      }),
    );
  });
  it('preserves fragmented binary replies with and without a declared length', async () => {
    const data = Uint8Array.from({ length: 70003 }, (_, index) => index % 251);
    for (const declared of [true, false]) {
      let offset = 0;
      const response = new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (offset === data.length) return controller.close();
            const end = Math.min(data.length, offset + 23);
            controller.enqueue(data.slice(offset, end));
            offset = end;
          },
        }),
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            ...(declared ? { 'Content-Length': String(data.length) } : {}),
          },
        },
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
      expect(await new Client('https://example.com').open('A'.repeat(43), 'B'.repeat(43))).toEqual(
        data,
      );
      expect(response.body!.locked).toBe(false);
    }
  });
  it('cancels and releases a response that advertises excessive data without retrying', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'Content-Length': String(MAX_PACKET_BYTES + 1) },
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    await expect(
      new Client('https://example.com').open('A'.repeat(43), 'B'.repeat(43)),
    ).rejects.toThrow('oversized');
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('bounds decoded bytes rather than treating a compressed wire length as a plaintext length', async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: {
        'Content-Encoding': 'gzip',
        'Content-Length': '2',
        'Content-Type': 'application/octet-stream',
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    expect(await new Client('https://example.com').open('A'.repeat(43), 'B'.repeat(43))).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
  });
  it('rejects truncated and overlong declared responses and cancels an overflowing stream', async () => {
    for (const declared of ['1', '3']) {
      const cancel = vi.fn();
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            if (declared === '3') controller.close();
          },
          cancel,
        }),
        { headers: { 'Content-Length': declared } },
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
      await expect(
        new Client('https://example.com').open('A'.repeat(43), 'B'.repeat(43)),
      ).rejects.toThrow();
      expect(response.body!.locked).toBe(false);
      if (declared === '1') expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it('rejects traversal, device names and case-insensitive collisions before writing', async () => {
    const root = await directory();
    for (const name of ['../outside', 'sub/file', 'C:\\escape', 'NUL', 'x\u202etxt.exe']) {
      await expect(
        writeContent(root, { text: '', files: [{ name, mime: '', data: new Uint8Array([1]) }] }),
      ).rejects.toThrow();
    }
    await expect(
      writeContent(root, {
        text: '',
        files: ['A.txt', 'a.txt'].map((name) => ({ name, mime: '', data: new Uint8Array([1]) })),
      }),
    ).rejects.toThrow();
  });
  it('never overwrites an existing file and selects a distinct text name', async () => {
    const root = await directory();
    await writeFile(join(root, 'occupied.txt'), 'keep');
    await expect(
      writeContent(root, {
        text: '',
        files: [{ name: 'occupied.txt', mime: '', data: new Uint8Array([1]) }],
      }),
    ).rejects.toThrow();
    expect(await readFile(join(root, 'occupied.txt'), 'utf8')).toBe('keep');
    await writeContent(root, {
      text: 'message',
      files: [{ name: 'message.txt', mime: '', data: new Uint8Array([9]) }],
    });
    expect(await readFile(join(root, 'message-1.txt'), 'utf8')).toBe('message');
    expect(await readFile(join(root, 'message.txt'))).toEqual(Buffer.from([9]));
  });
});
