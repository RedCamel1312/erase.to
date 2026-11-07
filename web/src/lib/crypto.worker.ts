import {
  create,
  derivePeek,
  prepareOpen,
  decrypt,
  solveProof,
  parseShareLink,
  decodeHeader,
} from '../../../shared/index.ts';
import type { PreparedOpen, FileInput } from '../../../shared/index.ts';
import type { WorkerMethods } from './worker.ts';
import { MAX_FILES, MAX_CONTENT_BYTES } from '../../../shared/types.ts';
import { workerHkdf } from './worker-hkdf.ts';
import { i2pOrigin } from './site.ts';
let link: { id: string; secret: string } | null = null;
let headerBase64 = '';
let prepared: PreparedOpen | null = null;
let running = false;
const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({
  data,
}: MessageEvent<{ id: number; method: keyof WorkerMethods; input: unknown }>) => {
  if (running) {
    scope.postMessage({ id: data.id, error: 'worker_busy' });
    return;
  }
  running = true;
  try {
    const hkdf = workerHkdf(self.location.origin, i2pOrigin, self.isSecureContext, self.crypto);
    let result: unknown;
    let transfer: Transferable[] = [];
    switch (data.method) {
      case 'seal': {
        const input = data.input as WorkerMethods['seal']['input'];
        const files: FileInput[] = [];
        if (
          input.files.length > MAX_FILES ||
          input.files.reduce((total, file) => total + file.size, 0) > MAX_CONTENT_BYTES
        )
          throw new Error('invalid_input');
        try {
          for (const file of input.files)
            files.push({
              name: file.name,
              mime: file.type || 'application/octet-stream',
              data: new Uint8Array(await file.arrayBuffer()),
            });
          const sealed = await create({ text: input.text, files }, input.options, hkdf);
          result = {
            packet: sealed.packet,
            id: sealed.id,
            secret: sealed.secret,
            revokeToken: sealed.revokeToken,
          };
          transfer = [sealed.packet.buffer as ArrayBuffer];
        } finally {
          for (const file of files) file.data.fill(0);
        }
        break;
      }
      case 'proof': {
        const input = data.input as WorkerMethods['proof']['input'];
        try {
          result = { nonce: await solveProof(input.packet, input.challenge), packet: input.packet };
          transfer = [input.packet.buffer as ArrayBuffer];
        } catch (error) {
          input.packet.fill(0);
          throw error;
        }
        break;
      }
      case 'load': {
        link = parseShareLink((data.input as WorkerMethods['load']['input']).url);
        result = { id: link.id, peekToken: await derivePeek(link.secret, link.id, hkdf) };
        break;
      }
      case 'inspect': {
        headerBase64 = (data.input as WorkerMethods['inspect']['input']).header;
        const header = decodeHeader(headerBase64);
        if (!link || header.id !== link.id) throw new Error('invalid_package');
        result = header;
        break;
      }
      case 'prepare': {
        if (!link || !headerBase64) throw new Error('invalid_link');
        prepared?.key.fill(0);
        prepared = null;
        prepared = await prepareOpen(
          headerBase64,
          link.secret,
          link.id,
          (data.input as WorkerMethods['prepare']['input']).passphrase,
          hkdf,
        );
        result = { readToken: prepared.readToken };
        break;
      }
      case 'decrypt': {
        if (!prepared) throw new Error('invalid_package');
        const packet = (data.input as WorkerMethods['decrypt']['input']).packet;
        try {
          const content = await decrypt(packet, prepared);
          result = content;
          transfer = content.files.map((file) => file.data.buffer as ArrayBuffer);
        } finally {
          packet.fill(0);
          prepared.key.fill(0);
          prepared = null;
          link = null;
          headerBase64 = '';
        }
        break;
      }
      default:
        throw new Error('invalid_request');
    }
    scope.postMessage({ id: data.id, result }, transfer);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'invalid_package';
    scope.postMessage({ id: data.id, error: code });
  } finally {
    running = false;
  }
};
