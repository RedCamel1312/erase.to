import { stat, mkdir, readdir, open } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  create,
  derivePeek,
  prepareOpen,
  decrypt,
  solveProof,
  parseShareLink,
  makeShareLink,
  normalizeFilename,
  MAX_CONTENT_BYTES,
  MAX_TEXT_BYTES,
  MAX_FILES,
  MAX_PASSPHRASE_BYTES,
  ProtocolError,
} from '../shared/index';
import type { ContentInput } from '../shared/index';
import { Client } from './client';

const help = `erase.to — encrypted, temporary handoffs

send     [--server ORIGIN] [--file PATH ...] [--ttl SECONDS] [--views COUNT]
         [--passphrase-file PATH]
receive  --output DIRECTORY [--server ORIGIN] [--passphrase-file PATH]
revoke   [--server ORIGIN]

Text is read from standard input. With --file, text input is optional.
receive reads a complete share link from standard input.
revoke reads the JSON receipt from send, or {"id":"...","token":"..."}.
send writes a secret JSON receipt to standard output. Protect it accordingly.
No consuming request is automatically retried. Received files are never overwritten.
`;

async function stdin(limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    length += buffer.length;
    if (length > limit) throw new Error('Input exceeds the limit.');
    chunks.push(buffer);
  }
  const buffer = Buffer.concat(chunks);
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } finally {
    buffer.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

export async function readBoundedFile(path: string, limit: number): Promise<Uint8Array> {
  const file = await open(path, 'r');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error('File exceeds the limit or is not a regular file.');
    for (;;) {
      const chunk = new Uint8Array(Math.min(65536, limit - size + 1));
      const { bytesRead } = await file.read(chunk, 0, chunk.length);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > limit) {
        chunk.fill(0);
        throw new Error('File exceeds the limit.');
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    await file.close();
  }
}

async function passphrase(path?: string): Promise<string> {
  if (!path) return '';
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_PASSPHRASE_BYTES + 2)
    throw new Error('Invalid passphrase file.');
  const bytes = await readBoundedFile(path, MAX_PASSPHRASE_BYTES + 2);
  try {
    if (bytes.length > MAX_PASSPHRASE_BYTES + 2)
      throw new Error('Passphrase file exceeds the limit.');
    const value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
      .decode(bytes)
      .replace(/\r?\n$/, '');
    if (!value || Buffer.byteLength(value) > MAX_PASSPHRASE_BYTES)
      throw new Error('Passphrase must contain 1–1024 UTF-8 bytes.');
    return value;
  } finally {
    bytes.fill(0);
  }
}

export async function writeContent(directory: string, content: ContentInput): Promise<void> {
  const names = content.files.map((file) => normalizeFilename(file.name));
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length)
    throw new Error('Duplicate output file names.');
  let textName = 'message.txt';
  for (let n = 1; names.some((name) => name.toLowerCase() === textName.toLowerCase()); n++)
    textName = `message-${n}.txt`;
  const outputs = content.files.map((file, index) => ({ name: names[index]!, data: file.data }));
  if (content.text) outputs.push({ name: textName, data: new TextEncoder().encode(content.text) });
  for (const item of outputs) {
    const file = await open(join(directory, item.name), 'wx', 0o600);
    try {
      await file.writeFile(item.data);
    } finally {
      await file.close();
    }
  }
}

export async function main(args: string[]): Promise<void> {
  const command = args[0] ?? 'help';
  if (command === 'help' || command === '--help') {
    process.stdout.write(help);
    return;
  }
  const { values, positionals } = parseArgs({
    args: args.slice(1),
    strict: true,
    allowPositionals: true,
    options: {
      server: { type: 'string' },
      file: { type: 'string', multiple: true },
      ttl: { type: 'string', default: '3600' },
      views: { type: 'string', default: '1' },
      output: { type: 'string' },
      'passphrase-file': { type: 'string' },
    },
  });
  if (positionals.length)
    throw new Error('Read sensitive text, links and capabilities from standard input.');
  if (command === 'send') {
    const client = new Client(values.server ?? 'https://erase.to');
    const paths = values.file ?? [];
    if (paths.length > MAX_FILES) throw new Error('At most eight files are supported.');
    const text = paths.length && process.stdin.isTTY ? '' : await stdin(MAX_TEXT_BYTES);
    const input: ContentInput = { text, files: [] };
    let total = Buffer.byteLength(text);
    const files = [];
    for (const path of paths) {
      const info = await stat(path);
      total += info.size;
      if (!info.isFile() || total > MAX_CONTENT_BYTES)
        throw new Error('Input exceeds the content limit.');
      files.push({ path, size: info.size, name: normalizeFilename(basename(path)) });
    }
    try {
      for (const file of files) {
        const data = await readBoundedFile(file.path, file.size);
        if (data.length !== file.size) {
          data.fill(0);
          throw new Error('A file changed while being read.');
        }
        input.files.push({ name: file.name, mime: 'application/octet-stream', data });
      }
      const note = await create(input, {
        ttl: Number(values.ttl),
        views: Number(values.views),
        passphrase: await passphrase(values['passphrase-file']),
      });
      try {
        const challenge = await client.challenge();
        const nonce = await solveProof(note.packet, challenge);
        const receipt = await client.create(note.packet, challenge, nonce);
        if (receipt.id !== note.id) throw new Error('Server returned a different identifier.');
        process.stdout.write(
          JSON.stringify(
            {
              url: makeShareLink(client.origin, note.id, note.secret),
              expires_at: receipt.expires_at,
              revoke: { id: note.id, token: note.revokeToken },
            },
            null,
            2,
          ) + '\n',
        );
      } finally {
        note.packet.fill(0);
      }
    } finally {
      input.text = '';
      for (const file of input.files) file.data.fill(0);
    }
    return;
  }
  if (command === 'receive') {
    if (!values.output) throw new Error('Use --output with an empty destination directory.');
    const directory = resolve(values.output);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await readdir(directory)).length)
      throw new Error('The destination directory must be empty before retrieval.');
    const link = (await stdin(2048)).trim();
    const url = new URL(link);
    const client = new Client(values.server ?? url.origin);
    if (url.origin !== client.origin) throw new Error('The link and server origins differ.');
    const parsed = parseShareLink(link);
    const meta = await client.meta(parsed.id, await derivePeek(parsed.secret, parsed.id));
    const prepared = await prepareOpen(
      meta.header,
      parsed.secret,
      parsed.id,
      await passphrase(values['passphrase-file']),
    );
    let packet: Uint8Array | undefined;
    let content: ContentInput | undefined;
    try {
      packet = await client.open(parsed.id, prepared.readToken);
      content = await decrypt(packet, prepared);
      await writeContent(directory, content);
      process.stdout.write(
        JSON.stringify({ saved: content.files.length + (content.text ? 1 : 0) }) + '\n',
      );
    } finally {
      prepared.key.fill(0);
      packet?.fill(0);
      if (content) {
        content.text = '';
        for (const file of content.files) file.data.fill(0);
      }
    }
    return;
  }
  if (command === 'revoke') {
    const value: unknown = JSON.parse(await stdin(8192));
    if (!value || typeof value !== 'object') throw new Error('Invalid revocation receipt.');
    const record = value as Record<string, unknown>;
    const revocation = (record.revoke ?? record) as Record<string, unknown>;
    if (!revocation || typeof revocation.id !== 'string' || typeof revocation.token !== 'string')
      throw new Error('Invalid revocation capability.');
    const client = new Client(
      values.server ??
        (typeof record.url === 'string' ? new URL(record.url).origin : 'https://erase.to'),
    );
    await client.revoke(revocation.id, revocation.token);
    process.stdout.write('Revoked.\n');
    return;
  }
  throw new Error('Unknown command. Run help for usage.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      (error instanceof ProtocolError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Operation failed.') + '\n',
    );
    process.exitCode = 1;
  });
}
