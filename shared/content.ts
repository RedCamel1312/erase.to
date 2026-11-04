import { encodeText, invalid, utf8 } from './encoding';
import {
  MAX_CONTENT_BYTES,
  MAX_FILES,
  MAX_FILENAME_BYTES,
  MAX_MIME_BYTES,
  MAX_TEXT_BYTES,
  PADDING_BYTES,
  ProtocolError,
  type ContentInput,
  type FileInput,
} from './types';

const INNER_HEADER_BYTES = 14;
const MAX_INNER_BYTES =
  MAX_CONTENT_BYTES + INNER_HEADER_BYTES + MAX_FILES * (8 + MAX_FILENAME_BYTES + MAX_MIME_BYTES);
const MAX_PADDED_BYTES = Math.ceil(MAX_INNER_BYTES / PADDING_BYTES) * PADDING_BYTES;

export function normalizeFilename(value: string): string {
  if (typeof value !== 'string' || value.length > 1024) invalid('Invalid file name.');
  const name = value.normalize('NFC');
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    /[\x00-\x1f\x7f-\x9f<>:"/\\|?*\p{Bidi_Control}]/u.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) ||
    encodeText(name).length > MAX_FILENAME_BYTES
  ) {
    throw new ProtocolError(
      'invalid_filename',
      'Use a file name without paths, control characters or reserved device names (maximum 255 UTF-8 bytes).',
    );
  }
  return name;
}
function normalizeMime(value: string): string {
  if (typeof value !== 'string' || value.length > MAX_MIME_BYTES)
    invalid('Invalid file media type.');
  const mime = value ? value.toLowerCase() : 'application/octet-stream';
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) invalid('Invalid file media type.');
  return mime;
}
export function pack(input: ContentInput): Uint8Array {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.text !== 'string' ||
    input.text.length > MAX_TEXT_BYTES ||
    !Array.isArray(input.files) ||
    input.files.length > MAX_FILES
  )
    invalid('Invalid note content.');
  const text = encodeText(input.text);
  try {
    if (text.length > MAX_TEXT_BYTES)
      throw new ProtocolError('too_large', 'Text exceeds 8 MiB of UTF-8 data.');
    if (!text.length && !input.files.length)
      throw new ProtocolError('empty_content', 'Add text or a file.');
    const names = new Set<string>();
    let contentBytes = text.length;
    const files = input.files.map((file) => {
      if (!file || !(file.data instanceof Uint8Array)) invalid('Invalid file data.');
      contentBytes += file.data.length;
      if (contentBytes > MAX_CONTENT_BYTES)
        throw new ProtocolError('too_large', 'The combined text and files exceed 64 MiB.');
      const name = normalizeFilename(file.name);
      const folded = name.toLowerCase();
      if (names.has(folded))
        throw new ProtocolError('duplicate_filename', 'File names must be unique.');
      names.add(folded);
      return {
        name: encodeText(name),
        mime: encodeText(normalizeMime(file.mime)),
        data: file.data,
      };
    });
    const logicalLength =
      INNER_HEADER_BYTES +
      text.length +
      files.reduce((n, f) => n + 8 + f.name.length + f.mime.length + f.data.length, 0);
    const padded = new Uint8Array(Math.ceil(logicalLength / PADDING_BYTES) * PADDING_BYTES);
    // Fill only padding: the envelope and file data overwrite the rest of the allocation.
    for (let n = logicalLength; n < padded.length; n += 65536)
      crypto.getRandomValues(padded.subarray(n, n + 65536));
    padded.set([69, 67, 78, 49]); // ECN1
    const view = new DataView(padded.buffer);
    view.setUint32(4, logicalLength, false);
    view.setUint32(8, text.length, false);
    view.setUint16(12, files.length, false);
    let offset = INNER_HEADER_BYTES;
    padded.set(text, offset);
    offset += text.length;
    for (const file of files) {
      view.setUint16(offset, file.name.length, false);
      view.setUint16(offset + 2, file.mime.length, false);
      view.setUint32(offset + 4, file.data.length, false);
      offset += 8;
      for (const part of [file.name, file.mime, file.data]) {
        padded.set(part, offset);
        offset += part.length;
      }
    }
    return padded;
  } finally {
    text.fill(0);
  }
}
export function unpack(padded: Uint8Array): ContentInput {
  if (
    !(padded instanceof Uint8Array) ||
    padded.length < PADDING_BYTES ||
    padded.length > MAX_PADDED_BYTES ||
    padded.length % PADDING_BYTES !== 0 ||
    padded[0] !== 69 ||
    padded[1] !== 67 ||
    padded[2] !== 78 ||
    padded[3] !== 49
  )
    invalid('Invalid encrypted content envelope.');
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  const logicalLength = view.getUint32(4, false);
  const textLength = view.getUint32(8, false);
  const count = view.getUint16(12, false);
  if (
    logicalLength < INNER_HEADER_BYTES ||
    logicalLength > MAX_INNER_BYTES ||
    logicalLength > padded.length ||
    Math.ceil(logicalLength / PADDING_BYTES) * PADDING_BYTES !== padded.length ||
    textLength > MAX_TEXT_BYTES ||
    count > MAX_FILES ||
    (!textLength && !count)
  )
    invalid('Invalid content lengths.');
  let offset = INNER_HEADER_BYTES;
  function take(length: number): Uint8Array {
    if (length < 0 || offset + length > logicalLength) invalid('Truncated content.');
    const bytes = padded.subarray(offset, offset + length);
    offset += length;
    return bytes;
  }
  const text = utf8(take(textLength));
  const files: FileInput[] = [];
  const names = new Set<string>();
  let contentBytes = textLength;
  try {
    for (let i = 0; i < count; i++) {
      if (offset + 8 > logicalLength) invalid('Truncated file header.');
      const nameLength = view.getUint16(offset, false);
      const mimeLength = view.getUint16(offset + 2, false);
      const dataLength = view.getUint32(offset + 4, false);
      offset += 8;
      if (
        !nameLength ||
        nameLength > MAX_FILENAME_BYTES ||
        !mimeLength ||
        mimeLength > MAX_MIME_BYTES
      )
        invalid('Invalid file metadata.');
      contentBytes += dataLength;
      if (contentBytes > MAX_CONTENT_BYTES) invalid('Content exceeds the size limit.');
      const name = utf8(take(nameLength));
      const mime = utf8(take(mimeLength));
      if (
        normalizeFilename(name) !== name ||
        normalizeMime(mime) !== mime ||
        names.has(name.toLowerCase())
      )
        invalid('Noncanonical file metadata.');
      names.add(name.toLowerCase());
      files.push({ name, mime, data: take(dataLength).slice() });
    }
    if (offset !== logicalLength) invalid('Unexpected content bytes.');
    return { text, files };
  } catch (error) {
    for (const file of files) file.data.fill(0);
    throw error;
  }
}
