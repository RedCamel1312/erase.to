import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { nativeHkdf, type HkdfSha256 } from '../../../shared/hkdf.ts';
import { ProtocolError } from '../../../shared/types.ts';
import { canonicalI2pOrigin } from './site.ts';

const i2pHkdf: HkdfSha256 = async (material, salt, info, length) =>
  hkdf(sha256, material, salt, info, length);

export function workerHkdf(
  origin: string,
  configuredOrigin: string | null,
  secureContext: boolean,
  crypto: (Pick<Crypto, 'getRandomValues'> & { subtle?: SubtleCrypto }) | undefined,
): HkdfSha256 {
  if (typeof crypto?.getRandomValues === 'function') {
    const pinned = origin === canonicalI2pOrigin(configuredOrigin);
    if (crypto.subtle && (secureContext || pinned)) return nativeHkdf;
    if (!crypto.subtle && pinned) {
      try {
        crypto.getRandomValues(new Uint8Array(1));
        return i2pHkdf;
      } catch {
        // A disabled random source cannot authorize the HTTP worker path.
      }
    }
  }
  throw new ProtocolError(
    'crypto_unavailable',
    'This origin does not provide the required browser cryptography.',
  );
}
