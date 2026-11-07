export type HkdfSha256 = (
  material: Uint8Array,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
) => Promise<Uint8Array>;

export const nativeHkdf: HkdfSha256 = async (material, salt, info, length) => {
  const copy = new Uint8Array(material);
  try {
    const key = await crypto.subtle.importKey('raw', copy, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt, info },
        key,
        length * 8,
      ),
    );
  } finally {
    copy.fill(0);
  }
};
