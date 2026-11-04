import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, errorText, LIMITS } from '../src/lib/api.ts';
import { MAX_PACKET_BYTES } from '../../shared/types.ts';
import { CryptoWorker } from '../src/lib/worker.ts';
const ID = 'A'.repeat(43);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('browser API transport', () => {
  it('copies many tiny unknown-length chunks into bounded owned storage as they arrive', async () => {
    const length = 131105;
    let count = 0;
    const reused = new Uint8Array(1);
    const reader = {
      async read() {
        if (count === length) return { done: true as const, value: undefined };
        reused[0] = count++ % 251;
        return { done: false as const, value: reused };
      },
      cancel: vi.fn(async () => {}),
      releaseLock: vi.fn(),
    };
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
      body: { getReader: () => reader },
    } as unknown as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );
    const result = await api.open(ID, 'token', new AbortController().signal);
    const expected = Uint8Array.from({ length }, (_value, index) => index % 251);
    expect(result).toEqual(expected);
    expect(result.buffer.byteLength).toBe(length);
    expect(reader.cancel).not.toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });
  it('cancels fragmented unknown-length responses immediately at the byte limit', async () => {
    let count = 0;
    const reader = {
      async read() {
        count++;
        return { done: false as const, value: new Uint8Array([32]) };
      },
      cancel: vi.fn(async () => {}),
      releaseLock: vi.fn(),
    };
    const response = {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Response;
    const fetch = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetch);
    await expect(api.config(new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    expect(count).toBe(8193);
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not use compressed Content-Length as the size of decoded response bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(bytes, {
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Encoding': 'gzip',
              'Content-Length': '2',
            },
          }),
      ),
    );
    expect(await api.open(ID, 'token', new AbortController().signal)).toEqual(bytes);
  });
  it('cancels and releases the response on allocation failure, even if cancellation fails', async () => {
    const reader = {
      read: vi.fn(),
      cancel: vi.fn(async () => {
        throw new TypeError('connection already closed');
      }),
      releaseLock: vi.fn(),
    };
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Length': '1024',
        'Content-Type': 'application/octet-stream',
      }),
      body: { getReader: () => reader },
    } as unknown as Response;
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      requestSignal = options.signal as AbortSignal;
      return response;
    });
    vi.stubGlobal('fetch', fetch);
    const NativeBytes = Uint8Array;
    vi.stubGlobal(
      'Uint8Array',
      new Proxy(NativeBytes, {
        construct(target, args, newTarget) {
          if (args[0] === 1024) throw new RangeError('simulated allocation failure');
          return Reflect.construct(target, args, newTarget);
        },
      }),
    );
    await expect(api.open(ID, 'token', new AbortController().signal)).rejects.toThrow(
      'simulated allocation failure',
    );
    expect(reader.read).not.toHaveBeenCalled();
    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('allows 330 seconds for transfer and then fails once without retrying', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetch = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new DOMException('Timed out', 'AbortError'));
            },
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const opening = api.open(ID, 'token', new AbortController().signal);
    const failure = expect(opening).rejects.toMatchObject({ code: 'request_timeout' });
    vi.advanceTimersByTime(329999);
    expect(aborted).toBe(false);
    vi.advanceTimersByTime(1);
    await failure;
    expect(aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reports server transfer timeouts separately from exhausted capacity', async () => {
    const fetch = vi.fn(async () => Response.json({ error: 'request_timeout' }, { status: 504 }));
    vi.stubGlobal('fetch', fetch);
    const error = await api.open(ID, 'token', new AbortController().signal).catch((value) => value);
    expect(error).toMatchObject({ code: 'request_timeout' });
    expect(errorText(error)).toMatch(/not retried automatically/);
    expect(errorText(error)).not.toMatch(/capacity/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('uploads the owned packet buffer without a second application copy', async () => {
    const fetch = vi.fn(async () => Response.json({ id: ID, expires_at: 1900000000 }));
    vi.stubGlobal('fetch', fetch);
    const packet = new Uint8Array([1, 2, 3]);
    await api.create(
      packet,
      { challenge: 'challenge', bits: 18, expires_at: 1900000000 },
      '7',
      new AbortController().signal,
    );
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBe(packet.buffer);
    const view = packet.subarray(1, 2);
    await api.create(
      view,
      { challenge: 'challenge', bits: 18, expires_at: 1900000000 },
      '7',
      new AbortController().signal,
    );
    expect([
      ...new Uint8Array(
        (fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as ArrayBuffer,
      ),
    ]).toEqual([2]);
  });
  it('checks declared response size before allocation and requires a complete body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '3' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('x', { headers: { 'Content-Length': String(MAX_PACKET_BYTES + 1) } }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '2' },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    expect([...(await api.open(ID, 'token', new AbortController().signal))]).toEqual([1, 2, 3]);
    await expect(api.open(ID, 'token', new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    await expect(api.open(ID, 'token', new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
  it('uses same-origin no-store requests and carries only the separate capability', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const bytes = await api.open(ID, 'read-capability', new AbortController().signal);
    expect([...bytes]).toEqual([1, 2, 3]);
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/notes/${ID}/open`);
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('omit');
    expect(options.cache).toBe('no-store');
    expect(options.referrerPolicy).toBe('no-referrer');
    expect(options.redirect).toBe('error');
    expect(options.body).toBe('{"token":"read-capability"}');
  });
  it('does not retry a failed consuming request', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('connection interrupted');
    });
    vi.stubGlobal('fetch', fetch);
    await expect(api.open(ID, 'token', new AbortController().signal)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized JSON and unexpected binary content types', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(' '.repeat(8193)))
      .mockResolvedValueOnce(
        new Response('not a package', { headers: { 'Content-Type': 'text/html' } }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(api.config(new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    await expect(api.open(ID, 'token', new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
  it('bounds binary response allocation and aborts active requests when the session clears', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array(MAX_PACKET_BYTES + 1), {
            headers: { 'Content-Type': 'application/octet-stream' },
          }),
      ),
    );
    await expect(api.open(ID, 'token', new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    let actualSignal: AbortSignal | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            actualSignal = init.signal as AbortSignal;
            actualSignal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      ),
    );
    const controller = new AbortController();
    const opening = api.open(ID, 'token', controller.signal);
    controller.abort();
    await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    expect(actualSignal!.aborted).toBe(true);
  });
  it('rejects remote configuration that expands compiled content or proof-work bounds', async () => {
    const base = { protocol: 1, ...LIMITS, pow_bits: 18 };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...base, max_content_bytes: LIMITS.max_content_bytes + 1 }),
      )
      .mockResolvedValueOnce(Response.json({ ...base, pow_bits: 99 }));
    vi.stubGlobal('fetch', fetch);
    await expect(api.config(new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    await expect(api.config(new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});

class NativeWorkerStub {
  static instances: NativeWorkerStub[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  messages: { message: { id: number; method: string }; transfer: Transferable[] }[] = [];
  constructor() {
    NativeWorkerStub.instances.push(this);
  }
  postMessage(message: { id: number; method: string }, transfer: Transferable[]) {
    this.messages.push({ message, transfer });
  }
  terminate() {
    this.terminated = true;
  }
}
describe('worker cancellation', () => {
  it('terminates the worker, rejects pending work, and ignores a late queued result', async () => {
    NativeWorkerStub.instances = [];
    vi.stubGlobal('Worker', NativeWorkerStub);
    const port = new CryptoWorker();
    const pending = port.run('load', { url: 'https://erase.test/view#secret' });
    const old = NativeWorkerStub.instances[0];
    port.dispose();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(old.terminated).toBe(true);
    old.onmessage?.({
      data: { id: old.messages[0].message.id, result: { id: ID, peekToken: 'stale' } },
    });
    const next = port.run('load', { url: 'https://erase.test/view#new-secret' });
    const fresh = NativeWorkerStub.instances[1];
    fresh.onmessage?.({
      data: { id: fresh.messages[0].message.id, result: { id: ID, peekToken: 'fresh' } },
    });
    await expect(next).resolves.toEqual({ id: ID, peekToken: 'fresh' });
    port.dispose();
  });
  it('a worker startup/runtime error fails pending requests without exposing raw worker details', async () => {
    NativeWorkerStub.instances = [];
    vi.stubGlobal('Worker', NativeWorkerStub);
    const port = new CryptoWorker();
    const pending = port.run('load', { url: 'https://erase.test/view#secret' });
    NativeWorkerStub.instances[0].onerror?.({ preventDefault() {} });
    await expect(pending).rejects.toMatchObject({
      code: 'worker_failed',
      message: 'worker_failed',
    });
    port.dispose();
  });
});
