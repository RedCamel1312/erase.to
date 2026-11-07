export type PublicConfig = {
  protocol: 1;
  max_content_bytes: number;
  max_text_bytes: number;
  max_files: number;
  max_views: number;
  max_ttl: number;
  pow_bits: number;
};
export type Challenge = { challenge: string; bits: number; expires_at: number };
export type Metadata = { header: string; expires_at: number; remaining: number };
export type Receipt = { id: string; expires_at: number };
import {
  MAX_CONTENT_BYTES,
  MAX_TEXT_BYTES,
  MAX_FILES,
  MAX_PACKET_BYTES,
} from '../../../shared/types.ts';
export const LIMITS = {
  max_content_bytes: MAX_CONTENT_BYTES,
  max_text_bytes: MAX_TEXT_BYTES,
  max_files: MAX_FILES,
  max_views: 100,
  max_ttl: 604800,
};
export class RequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const idPattern = /^[A-Za-z0-9_-]{43}$/;
function idPath(id: string) {
  if (!idPattern.test(id)) throw new RequestError('invalid_request');
  return `/api/notes/${id}`;
}
async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new RequestError('invalid_response');
  let finished = false;
  try {
    let size = 0;
    const encoding = response.headers.get('content-encoding');
    const lengthHeader =
      !encoding || encoding === 'identity' ? response.headers.get('content-length') : null;
    const expected =
      lengthHeader !== null && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
    if (expected !== null && (!Number.isSafeInteger(expected) || expected > limit))
      throw new RequestError('invalid_response');
    const maximum = expected ?? limit;
    // Allocation can fail on constrained devices; the reader must still close.
    // Unknown-length responses grow by bytes instead of retaining network chunk objects.
    let target = new Uint8Array(expected ?? Math.min(limit, 65536));
    while (true) {
      const part = await reader.read();
      if (part.done) {
        finished = true;
        break;
      }
      const next = size + part.value.length;
      if (next > maximum) throw new RequestError('invalid_response');
      if (next > target.length) {
        const grown = new Uint8Array(Math.min(maximum, Math.max(next, target.length * 2)));
        grown.set(target.subarray(0, size));
        target = grown;
      }
      target.set(part.value, size);
      size = next;
    }
    if (expected !== null && size !== expected) throw new RequestError('invalid_response');
    return size === target.length ? target : target.slice(0, size);
  } finally {
    try {
      if (!finished) await reader.cancel();
    } catch {
      // Preserve the original failure if the network is already broken.
    } finally {
      reader.releaseLock();
    }
  }
}
async function request(
  path: string,
  signal: AbortSignal,
  options: RequestInit = {},
  binary = false,
): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, 330000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (response.status === 204 && response.ok) return null;
    const bytes = await readBounded(response, response.ok && binary ? MAX_PACKET_BYTES : 8192);
    if (response.ok && binary) {
      if (response.headers.get('content-type')?.split(';')[0] !== 'application/octet-stream')
        throw new RequestError('invalid_response');
      return bytes;
    }
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      throw new RequestError('invalid_response');
    }
    if (!response.ok)
      throw new RequestError(
        value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
          ? value.error
          : 'request_failed',
      );
    return value;
  } catch (error) {
    if (timedOut && !signal.aborted) throw new RequestError('request_timeout');
    throw error;
  } finally {
    controller.abort();
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new RequestError('invalid_response');
  return value as Record<string, unknown>;
}
function integer(value: unknown, low: number, high: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < low || value > high)
    throw new RequestError('invalid_response');
  return value;
}
function unix(value: unknown): number {
  return integer(value, 1, Number.MAX_SAFE_INTEGER);
}
export const api = {
  async config(signal: AbortSignal): Promise<PublicConfig> {
    const v = object(await request('/api/config', signal));
    if (v.protocol !== 1) throw new RequestError('unsupported_protocol');
    return {
      protocol: 1,
      max_content_bytes: integer(v.max_content_bytes, 1, LIMITS.max_content_bytes),
      max_text_bytes: integer(v.max_text_bytes, 1, LIMITS.max_text_bytes),
      max_files: integer(v.max_files, 1, LIMITS.max_files),
      max_views: integer(v.max_views, 1, LIMITS.max_views),
      max_ttl: integer(v.max_ttl, 60, LIMITS.max_ttl),
      pow_bits: integer(v.pow_bits, 1, 24),
    };
  },
  async challenge(signal: AbortSignal): Promise<Challenge> {
    const v = object(await request('/api/challenge', signal));
    if (typeof v.challenge !== 'string' || v.challenge.length < 16 || v.challenge.length > 2048)
      throw new RequestError('invalid_response');
    return { challenge: v.challenge, bits: integer(v.bits, 1, 24), expires_at: unix(v.expires_at) };
  },
  async create(
    packet: Uint8Array,
    challenge: Challenge,
    nonce: string,
    signal: AbortSignal,
  ): Promise<Receipt> {
    const body =
      packet.buffer instanceof ArrayBuffer &&
      packet.byteOffset === 0 &&
      packet.byteLength === packet.buffer.byteLength
        ? packet.buffer
        : packet.slice().buffer;
    const v = object(
      await request('/api/notes', signal, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Erase-Challenge': challenge.challenge,
          'X-Erase-Nonce': nonce,
        },
        body,
      }),
    );
    if (typeof v.id !== 'string' || !idPattern.test(v.id))
      throw new RequestError('invalid_response');
    return { id: v.id, expires_at: unix(v.expires_at) };
  },
  async meta(id: string, token: string, signal: AbortSignal): Promise<Metadata> {
    const v = object(
      await request(idPath(id) + '/meta', signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
    );
    if (
      typeof v.header !== 'string' ||
      v.header.length > 2800 ||
      !/^[A-Za-z0-9_-]+$/.test(v.header)
    )
      throw new RequestError('invalid_response');
    return {
      header: v.header,
      expires_at: unix(v.expires_at),
      remaining: integer(v.remaining, 1, 100),
    };
  },
  async open(id: string, token: string, signal: AbortSignal): Promise<Uint8Array> {
    return (await request(
      idPath(id) + '/open',
      signal,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      },
      true,
    )) as Uint8Array;
  },
  async revoke(id: string, token: string, signal: AbortSignal): Promise<void> {
    await request(idPath(id), signal, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  },
};
export type Api = typeof api;
export function errorText(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    crypto_unavailable:
      'Required browser cryptography is unavailable. Open the service through a supported address and browser.',
    unavailable:
      'Package unavailable. It may have expired, reached its retrieval limit, or been revoked.',
    wrong_passphrase: 'Incorrect passphrase. No retrieval has been used. Try again.',
    too_large: 'The package exceeds the size limit.',
    capacity: 'Storage capacity is currently exhausted. Please try again later.',
    request_timeout:
      'The transfer exceeded the allowed time and was not retried automatically. Check your connection before starting a new attempt.',
    rate_limited: 'The service is busy. Please wait before trying again.',
    proof_invalid: 'The proof-of-work challenge was not accepted. Please try again.',
    proof_reused: 'The proof-of-work challenge was already used. Please try again.',
    id_conflict: 'Package identifier conflict. Please create a new package.',
    invalid_response: 'The server returned an invalid response.',
    unsupported_protocol:
      'This client and server use different protocol versions. Reload the page.',
    forbidden: 'The request origin was not accepted.',
    invalid_input: 'Check the message, file sizes, and retention settings.',
    invalid_filename:
      'A file name contains unsupported characters or is too long. Rename the file and select it again.',
    duplicate_filename: 'File names must be unique. Rename duplicate files before selecting them.',
    proof_expired: 'The creation challenge expired. Please try again.',
    worker_failed:
      'Local processing could not be completed. Retry or use a smaller package if your device is low on memory.',
  };
  if (messages[code]) return messages[code];
  if (error instanceof Error && error.name === 'AbortError')
    return 'The operation was cancelled or the connection timed out.';
  return 'The operation failed. Check your connection and try again.';
}
