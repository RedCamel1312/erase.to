export const PROTOCOL_VERSION = 1;
export const MAX_CONTENT_BYTES = 64 * 1024 * 1024;
export const MAX_TEXT_BYTES = 8 * 1024 * 1024;
export const MAX_FILES = 8;
export const MAX_FILENAME_BYTES = 255;
export const MAX_MIME_BYTES = 127;
export const MAX_PASSPHRASE_BYTES = 1024;
export const MAX_HEADER_BYTES = 2048;
export const MAX_PACKET_BYTES = MAX_CONTENT_BYTES + 32768;
export const PADDING_BYTES = 4096;
export const ARGON_MEMORY_BYTES = 64 * 1024 * 1024;
export const ARGON_OPSLIMIT = 3;

export interface FileInput {
  name: string;
  mime: string;
  data: Uint8Array;
}
export interface ContentInput {
  text: string;
  files: FileInput[];
}
export interface CreateOptions {
  ttl: number;
  views: number;
  passphrase?: string;
}
export interface Header {
  version: 1;
  id: string;
  ttl: number;
  views: number;
  peek: string;
  read: string;
  revoke: string;
  kdf: 'none' | 'argon2id';
  salt: string;
  nonce: string;
}
export interface ParsedPacket {
  header: Header;
  headerBytes: Uint8Array;
  ciphertext: Uint8Array;
}
export interface CreatedNote {
  packet: Uint8Array;
  id: string;
  secret: string;
  revokeToken: string;
  header: Header;
}
export interface PreparedOpen {
  header: Header;
  headerBytes: Uint8Array;
  readToken: string;
  key: Uint8Array;
}
export interface Challenge {
  challenge: string;
  bits: number;
  expires_at: number;
}
export interface Metadata {
  header: string;
  expires_at: number;
  remaining: number;
}
export interface ServiceConfig {
  protocol: 1;
  max_content_bytes: number;
  max_text_bytes: number;
  max_files: number;
  max_views: number;
  max_ttl: number;
  pow_bits: number;
}
export interface CreatedResponse {
  id: string;
  expires_at: number;
}
export interface ProofOptions {
  signal?: AbortSignal;
  onProgress?: (attempts: number) => void;
}

export class ProtocolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}
