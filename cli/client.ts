import { MAX_PACKET_BYTES, ProtocolError } from '../shared/index';
import type { Challenge, CreatedResponse, Metadata } from '../shared/index';

export function serverOrigin(input: string): string {
  const url = new URL(input);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.hostname.replace(/\.+$/, '').endsWith('.onion'))
    throw new Error(
      'Use the onion service in Tor Browser. This CLI does not provide a Tor transport.',
    );
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/'].includes(url.pathname) ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
  ) {
    throw new Error('Use an HTTPS origin or a loopback development origin.');
  }
  return url.origin;
}

async function bytes(response: Response, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty server response.');
  let length = 0;
  let complete = false;
  try {
    const encoding = response.headers.get('content-encoding');
    // fetch exposes decoded bytes, while Content-Length describes encoded bytes.
    const header =
      !encoding || encoding === 'identity' ? response.headers.get('content-length') : null;
    const announced = header === null ? null : Number(header);
    if (
      announced !== null &&
      (!/^\d+$/.test(header!) || !Number.isSafeInteger(announced) || announced > limit)
    )
      throw new Error('Invalid or oversized response length.');
    const maximum = announced ?? limit;
    // Do not retain one object per network chunk. Fragmented responses should
    // have the same allocation ceiling as a response delivered in one piece.
    let buffer = new Uint8Array(announced ?? Math.min(limit, 65536));
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      const next = length + part.value.length;
      if (next > maximum) throw new Error('Server response exceeds the protocol limit.');
      if (next > buffer.length) {
        const grown = new Uint8Array(Math.min(maximum, Math.max(next, buffer.length * 2)));
        grown.set(buffer.subarray(0, length));
        buffer = grown;
      }
      buffer.set(part.value, length);
      length = next;
    }
    if (announced !== null && length !== announced) throw new Error('Incomplete server response.');
    const result = length === buffer.length ? buffer : buffer.slice(0, length);
    complete = true;
    return result;
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class Client {
  readonly origin: string;
  constructor(origin: string) {
    this.origin = serverOrigin(origin);
  }
  async request(path: string, options: RequestInit = {}, binary = false): Promise<unknown> {
    const response = await fetch(this.origin + path, {
      ...options,
      headers: { ...options.headers, Origin: this.origin },
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(330000),
    });
    if (response.status === 204 && response.ok) return null;
    const body = await bytes(response, response.ok && binary ? MAX_PACKET_BYTES : 8192);
    if (!response.ok) {
      let code = 'request_failed';
      try {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
        if (
          value &&
          typeof value === 'object' &&
          'error' in value &&
          typeof value.error === 'string' &&
          /^[a-z_]{1,40}$/.test(value.error)
        )
          code = value.error;
      } catch {
        /* Keep a bounded, non-sensitive error. */
      }
      throw new ProtocolError(code, `Request failed (${response.status}, ${code}).`);
    }
    if (binary) {
      if (response.headers.get('content-type')?.split(';')[0] !== 'application/octet-stream')
        throw new Error('Unexpected response type.');
      return body;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  }
  async challenge(): Promise<Challenge> {
    const result = (await this.request('/api/challenge')) as Challenge;
    if (
      !result ||
      typeof result.challenge !== 'string' ||
      !Number.isInteger(result.bits) ||
      result.bits < 1 ||
      result.bits > 24 ||
      !Number.isSafeInteger(result.expires_at)
    )
      throw new Error('Invalid challenge response.');
    return result;
  }
  async create(packet: Uint8Array, challenge: Challenge, nonce: string): Promise<CreatedResponse> {
    const result = (await this.request('/api/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Erase-Challenge': challenge.challenge,
        'X-Erase-Nonce': nonce,
      },
      body: packet.slice().buffer,
    })) as CreatedResponse;
    if (
      !result ||
      !/^[A-Za-z0-9_-]{43}$/.test(result.id) ||
      !Number.isSafeInteger(result.expires_at)
    )
      throw new Error('Invalid creation response.');
    return result;
  }
  private path(id: string): string {
    if (!/^[A-Za-z0-9_-]{43}$/.test(id)) throw new Error('Invalid package identifier.');
    return `/api/notes/${id}`;
  }
  private authorization(token: string, method: string): RequestInit {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid capability.');
    return {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    };
  }
  async meta(id: string, token: string): Promise<Metadata> {
    const result = (await this.request(
      this.path(id) + '/meta',
      this.authorization(token, 'POST'),
    )) as Metadata;
    if (
      !result ||
      typeof result.header !== 'string' ||
      result.header.length > 2800 ||
      !Number.isSafeInteger(result.expires_at) ||
      !Number.isInteger(result.remaining) ||
      result.remaining < 1 ||
      result.remaining > 100
    )
      throw new Error('Invalid metadata response.');
    return result;
  }
  async open(id: string, token: string): Promise<Uint8Array> {
    return (await this.request(
      this.path(id) + '/open',
      this.authorization(token, 'POST'),
      true,
    )) as Uint8Array;
  }
  async revoke(id: string, token: string): Promise<void> {
    await this.request(this.path(id), this.authorization(token, 'DELETE'));
  }
}
