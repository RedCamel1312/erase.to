import {
  MAX_HEADER_BYTES,
  MAX_PACKET_BYTES,
  ProtocolError,
  type Header,
  type ParsedPacket,
} from './types';

export const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export const HEADER_FIELDS = [
  'version',
  'id',
  'ttl',
  'views',
  'peek',
  'read',
  'revoke',
  'kdf',
  'salt',
  'nonce',
] as const;

export function invalid(message = 'The encrypted package is invalid.'): never {
  throw new ProtocolError('invalid_package', message);
}
export function utf8(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    return invalid('Invalid UTF-8 data.');
  }
}
export function encodeText(value: string): Uint8Array {
  const bytes = encoder.encode(value);
  if (utf8(bytes) !== value) invalid('Invalid Unicode text.');
  return bytes;
}
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function fromBase64Url(
  value: string,
  expectedBytes?: number,
  maxBytes = MAX_HEADER_BYTES,
): Uint8Array {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    value.length > Math.ceil((maxBytes * 4) / 3) ||
    value.length % 4 === 1
  )
    invalid();
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(
      atob(
        value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4),
      ),
      (c) => c.charCodeAt(0),
    );
  } catch {
    return invalid();
  }
  if (
    bytes.length > maxBytes ||
    (expectedBytes !== undefined && bytes.length !== expectedBytes) ||
    toBase64Url(bytes) !== value
  )
    invalid();
  return bytes;
}
export function validateId(id: string): void {
  fromBase64Url(id, 32, 32);
}
export function validatePolicy(ttl: number, views: number): void {
  if (
    !Number.isSafeInteger(ttl) ||
    ttl < 60 ||
    ttl > 604800 ||
    !Number.isSafeInteger(views) ||
    views < 1 ||
    views > 100
  ) {
    throw new ProtocolError(
      'invalid_policy',
      'Choose a lifetime from one minute to seven days and between one and 100 opens.',
    );
  }
}
export function serializeHeader(header: Header): Uint8Array {
  return encoder.encode(
    JSON.stringify({
      version: header.version,
      id: header.id,
      ttl: header.ttl,
      views: header.views,
      peek: header.peek,
      read: header.read,
      revoke: header.revoke,
      kdf: header.kdf,
      salt: header.salt,
      nonce: header.nonce,
    }),
  );
}
export function parseHeader(bytes: Uint8Array): Header {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX_HEADER_BYTES)
    invalid();
  const text = utf8(bytes);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return invalid();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const obj = value as Record<string, unknown>;
  if (
    Object.keys(obj).length !== HEADER_FIELDS.length ||
    HEADER_FIELDS.some((key) => !Object.hasOwn(obj, key))
  )
    invalid();
  if (
    obj.version !== 1 ||
    typeof obj.id !== 'string' ||
    typeof obj.ttl !== 'number' ||
    typeof obj.views !== 'number' ||
    !['peek', 'read', 'revoke'].every(
      (key) => typeof obj[key] === 'string' && /^[a-f0-9]{64}$/.test(obj[key]),
    ) ||
    (obj.kdf !== 'none' && obj.kdf !== 'argon2id') ||
    typeof obj.salt !== 'string' ||
    typeof obj.nonce !== 'string'
  )
    invalid();
  validateId(obj.id);
  validatePolicy(obj.ttl, obj.views);
  fromBase64Url(obj.nonce, 24, 24);
  if (obj.kdf === 'none' ? obj.salt !== '' : !obj.salt) invalid();
  if (obj.kdf === 'argon2id') fromBase64Url(obj.salt, 16, 16);
  const header = obj as unknown as Header;
  // Canonical bytes also reject duplicate members, reordered fields and alternate numeric forms.
  if (utf8(serializeHeader(header)) !== text) invalid('Noncanonical package header.');
  return header;
}
export function parsePacket(packet: Uint8Array): ParsedPacket {
  if (
    !(packet instanceof Uint8Array) ||
    packet.length < 8 ||
    packet.length > MAX_PACKET_BYTES ||
    packet[0] !== 69 ||
    packet[1] !== 82 ||
    packet[2] !== 83 ||
    packet[3] !== 49
  )
    invalid();
  const length = new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(
    4,
    false,
  );
  if (length < 1 || length > MAX_HEADER_BYTES || packet.length < 8 + length + 4112) invalid();
  const headerBytes = packet.slice(8, 8 + length);
  const ciphertext = packet.subarray(8 + length);
  if ((ciphertext.length - 16) % 4096 !== 0) invalid();
  return { header: parseHeader(headerBytes), headerBytes, ciphertext };
}
export function makeShareLink(origin: string, id: string, secret: string): string {
  const url = new URL(origin);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.origin !== origin
  )
    invalid('Invalid service origin.');
  validateId(id);
  fromBase64Url(secret, 32, 32);
  return `${url.origin}/view#1.${id}.${secret}`;
}
export function parseShareLink(value: string): { id: string; secret: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid('The private link is incomplete.');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/view' ||
    url.search
  )
    invalid('The private link is incomplete.');
  const match = /^#1\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(url.hash);
  if (!match) invalid('The private link is incomplete.');
  const id = match[1]!;
  const secret = match[2]!;
  validateId(id);
  fromBase64Url(secret, 32, 32);
  return { id, secret };
}
