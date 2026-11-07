const candidate = import.meta.env.VITE_ONION_URL as string | undefined;
export const onionUrl =
  candidate && /^http:\/\/[a-z2-7]{56}\.onion\/?$/.test(candidate)
    ? new URL(candidate).origin + '/'
    : null;

export function canonicalI2pOrigin(candidate: unknown): string | null {
  // A 256-bit destination hash has 51 full Base32 digits and one final data bit.
  if (typeof candidate !== 'string' || !/^http:\/\/[a-z2-7]{51}[aq]\.b32\.i2p\/?$/.test(candidate))
    return null;
  return candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
}

export const i2pOrigin = canonicalI2pOrigin(import.meta.env.VITE_I2P_URL);
