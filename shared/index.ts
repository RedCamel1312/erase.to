import sodium from 'libsodium-wrappers-sumo';
import { pack, unpack } from './content';
import { nativeHkdf, type HkdfSha256 } from './hkdf';
import {
  encoder,
  encodeText,
  fromBase64Url,
  invalid,
  parseHeader,
  parsePacket,
  serializeHeader,
  toBase64Url,
  validateId,
  validatePolicy,
} from './encoding';
import {
  ARGON_MEMORY_BYTES,
  ARGON_OPSLIMIT,
  MAX_PACKET_BYTES,
  MAX_PASSPHRASE_BYTES,
  ProtocolError,
  type Challenge,
  type ContentInput,
  type CreatedNote,
  type CreateOptions,
  type Header,
  type PreparedOpen,
  type ProofOptions,
} from './types';

export * from './types';
export { pack, unpack, normalizeFilename } from './content';
export {
  fromBase64Url,
  toBase64Url,
  parsePacket,
  parseHeader,
  serializeHeader,
  makeShareLink,
  parseShareLink,
} from './encoding';

function hash(bytes: Uint8Array): string {
  return sodium.to_hex(sodium.crypto_hash_sha256(bytes));
}
function sameHex(left: string, right: string): boolean {
  return (
    /^[a-f0-9]{64}$/.test(left) &&
    /^[a-f0-9]{64}$/.test(right) &&
    sodium.memcmp(sodium.from_hex(left), sodium.from_hex(right))
  );
}
async function peekBytes(secret: string, id: string, hkdf: HkdfSha256): Promise<Uint8Array> {
  await sodium.ready;
  validateId(id);
  const master = fromBase64Url(secret, 32, 32);
  try {
    return await hkdf(
      master,
      encoder.encode(`erase.to/v1/peek:${id}`),
      encoder.encode('erase.to/v1/peek'),
      32,
    );
  } finally {
    master.fill(0);
  }
}
export async function derivePeek(
  secret: string,
  id: string,
  hkdf: HkdfSha256 = nativeHkdf,
): Promise<string> {
  const peek = await peekBytes(secret, id, hkdf);
  try {
    return toBase64Url(peek);
  } finally {
    peek.fill(0);
  }
}
async function contentKeys(
  secret: string,
  header: Header,
  passphrase: string,
  hkdf: HkdfSha256,
): Promise<{ key: Uint8Array; read: Uint8Array }> {
  await sodium.ready;
  if (typeof passphrase !== 'string' || passphrase.length > MAX_PASSPHRASE_BYTES)
    throw new ProtocolError('invalid_passphrase', 'The passphrase is too long.');
  const master = fromBase64Url(secret, 32, 32);
  const passwordBytes = encodeText(passphrase);
  const material = new Uint8Array(64);
  let passwordKey: Uint8Array = new Uint8Array(32);
  let encryptionKey: Uint8Array | undefined;
  try {
    if (passwordBytes.length > MAX_PASSPHRASE_BYTES)
      throw new ProtocolError('invalid_passphrase', 'The passphrase exceeds 1024 UTF-8 bytes.');
    if (header.kdf === 'argon2id') {
      if (!passwordBytes.length)
        throw new ProtocolError('wrong_passphrase', 'Enter the separate passphrase.');
      passwordKey = sodium.crypto_pwhash(
        32,
        passwordBytes,
        fromBase64Url(header.salt, 16, 16),
        ARGON_OPSLIMIT,
        ARGON_MEMORY_BYTES,
        sodium.crypto_pwhash_ALG_ARGON2ID13,
      );
    }
    material.set(master);
    material.set(passwordKey, 32);
    const salt = encoder.encode(`erase.to/v1/content:${header.id}`);
    encryptionKey = await hkdf(
      material,
      salt,
      encoder.encode(`erase.to/v1/aead:${header.kdf}`),
      32,
    );
    return {
      key: encryptionKey,
      read: await hkdf(material, salt, encoder.encode(`erase.to/v1/read:${header.kdf}`), 32),
    };
  } catch (error) {
    encryptionKey?.fill(0);
    throw error;
  } finally {
    master.fill(0);
    passwordBytes.fill(0);
    passwordKey.fill(0);
    material.fill(0);
  }
}
export async function create(
  input: ContentInput,
  options: CreateOptions,
  hkdf: HkdfSha256 = nativeHkdf,
): Promise<CreatedNote> {
  validatePolicy(options.ttl, options.views);
  const passphrase = options.passphrase ?? '';
  if (typeof passphrase !== 'string' || passphrase.length > MAX_PASSPHRASE_BYTES)
    throw new ProtocolError('invalid_passphrase', 'The passphrase is too long.');
  const clear = pack(input);
  let key: Uint8Array | undefined;
  let read: Uint8Array | undefined;
  let peek: Uint8Array | undefined;
  let master: Uint8Array | undefined;
  let revoke: Uint8Array | undefined;
  try {
    await sodium.ready;
    master = sodium.randombytes_buf(32);
    revoke = sodium.randombytes_buf(32);
    const secret = toBase64Url(master);
    const id = toBase64Url(sodium.randombytes_buf(32));
    peek = await peekBytes(secret, id, hkdf);
    const header: Header = {
      version: 1,
      id,
      ttl: options.ttl,
      views: options.views,
      peek: hash(peek),
      read: '',
      revoke: hash(revoke),
      kdf: passphrase ? 'argon2id' : 'none',
      salt: passphrase ? toBase64Url(sodium.randombytes_buf(16)) : '',
      nonce: toBase64Url(sodium.randombytes_buf(24)),
    };
    ({ key, read } = await contentKeys(secret, header, passphrase, hkdf));
    header.read = hash(read);
    const headerBytes = serializeHeader(header);
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      clear,
      headerBytes,
      null,
      fromBase64Url(header.nonce, 24, 24),
      key,
    );
    const packet = new Uint8Array(8 + headerBytes.length + ciphertext.length);
    packet.set([69, 82, 83, 49]);
    new DataView(packet.buffer).setUint32(4, headerBytes.length, false);
    packet.set(headerBytes, 8);
    packet.set(ciphertext, 8 + headerBytes.length);
    if (packet.length > MAX_PACKET_BYTES) invalid();
    return { packet, id, secret, revokeToken: toBase64Url(revoke), header };
  } finally {
    clear.fill(0);
    key?.fill(0);
    read?.fill(0);
    peek?.fill(0);
    master?.fill(0);
    revoke?.fill(0);
  }
}
export const encrypt = create;
export function decodeHeader(headerBase64: string): Header {
  return parseHeader(fromBase64Url(headerBase64));
}

export async function prepareOpen(
  headerBase64: string,
  secret: string,
  expectedId: string,
  passphrase = '',
  hkdf: HkdfSha256 = nativeHkdf,
): Promise<PreparedOpen> {
  await sodium.ready;
  const headerBytes = fromBase64Url(headerBase64);
  const header = parseHeader(headerBytes);
  validateId(expectedId);
  if (header.id !== expectedId) invalid('The package belongs to another link.');
  const peek = await peekBytes(secret, expectedId, hkdf);
  try {
    if (!sameHex(hash(peek), header.peek))
      throw new ProtocolError('invalid_link', 'The key does not match this note.');
  } finally {
    peek.fill(0);
  }
  const { key, read } = await contentKeys(secret, header, passphrase, hkdf);
  try {
    if (!sameHex(hash(read), header.read)) {
      key.fill(0);
      throw new ProtocolError(
        header.kdf === 'argon2id' ? 'wrong_passphrase' : 'invalid_link',
        header.kdf === 'argon2id'
          ? 'The passphrase does not match. The note has not been opened.'
          : 'The key does not match this note.',
      );
    }
    return { header, headerBytes, readToken: toBase64Url(read), key };
  } finally {
    read.fill(0);
  }
}
export async function decrypt(packet: Uint8Array, prepared: PreparedOpen): Promise<ContentInput> {
  await sodium.ready;
  const parsed = parsePacket(packet);
  if (
    !(prepared.key instanceof Uint8Array) ||
    prepared.key.length !== 32 ||
    parsed.headerBytes.length !== prepared.headerBytes.length ||
    !sodium.memcmp(parsed.headerBytes, prepared.headerBytes)
  )
    invalid('The package changed after preparation.');
  let clear: Uint8Array;
  try {
    clear = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      parsed.ciphertext,
      parsed.headerBytes,
      fromBase64Url(parsed.header.nonce, 24, 24),
      prepared.key,
    );
  } catch {
    throw new ProtocolError(
      'decryption_failed',
      'The encrypted content could not be authenticated.',
    );
  }
  try {
    return unpack(clear);
  } finally {
    clear.fill(0);
  }
}
export async function solveProof(
  packet: Uint8Array,
  challenge: Challenge,
  options: ProofOptions = {},
): Promise<string> {
  await sodium.ready;
  parsePacket(packet);
  if (
    !challenge ||
    typeof challenge.challenge !== 'string' ||
    !/^[A-Za-z0-9._-]{1,512}$/.test(challenge.challenge) ||
    !Number.isSafeInteger(challenge.bits) ||
    challenge.bits < 0 ||
    challenge.bits > 24 ||
    !Number.isSafeInteger(challenge.expires_at)
  )
    throw new ProtocolError('invalid_challenge', 'Invalid proof challenge.');
  const prefix = `${challenge.challenge}.${hash(packet)}.`;
  const zeroBytes = Math.floor(challenge.bits / 8);
  const remainder = challenge.bits % 8;
  for (let nonce = 0; nonce <= Number.MAX_SAFE_INTEGER; nonce++) {
    if (nonce % 2048 === 0) {
      if (options.signal?.aborted) throw new ProtocolError('cancelled', 'Operation cancelled.');
      if (Date.now() >= challenge.expires_at * 1000)
        throw new ProtocolError('proof_expired', 'The upload challenge expired. Try again.');
      options.onProgress?.(nonce);
      // Let cancellation/messages run; a browser may also terminate the dedicated worker.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (options.signal?.aborted) throw new ProtocolError('cancelled', 'Operation cancelled.');
      if (Date.now() >= challenge.expires_at * 1000)
        throw new ProtocolError('proof_expired', 'The upload challenge expired. Try again.');
    }
    const digest = sodium.crypto_hash_sha256(encoder.encode(prefix + nonce));
    let good = true;
    for (let i = 0; i < zeroBytes; i++)
      if (digest[i] !== 0) {
        good = false;
        break;
      }
    if (good && (!remainder || digest[zeroBytes]! >>> (8 - remainder) === 0)) return String(nonce);
  }
  throw new ProtocolError('proof_exhausted', 'Unable to solve this upload challenge.');
}
