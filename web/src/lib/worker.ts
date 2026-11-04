import type { ContentInput, CreateOptions, Header } from '../../../shared/index.ts';
import type { Challenge } from './api.ts';
export type Sealed = { packet: Uint8Array; id: string; secret: string; revokeToken: string };
export type WorkerMethods = {
  seal: { input: { text: string; files: File[]; options: CreateOptions }; output: Sealed };
  proof: {
    input: { packet: Uint8Array; challenge: Challenge };
    output: { nonce: string; packet: Uint8Array };
  };
  load: { input: { url: string }; output: { id: string; peekToken: string } };
  inspect: { input: { header: string }; output: Header };
  prepare: { input: { passphrase: string }; output: { readToken: string } };
  decrypt: { input: { packet: Uint8Array }; output: ContentInput };
};
export class WorkerFailure extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export interface CryptoPort {
  run<K extends keyof WorkerMethods>(
    method: K,
    input: WorkerMethods[K]['input'],
    transfer?: Transferable[],
  ): Promise<WorkerMethods[K]['output']>;
  dispose(): void;
}
export class CryptoWorker implements CryptoPort {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void }
  >();
  run<K extends keyof WorkerMethods>(
    method: K,
    input: WorkerMethods[K]['input'],
    transfer: Transferable[] = [],
  ): Promise<WorkerMethods[K]['output']> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./crypto.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({
        data,
      }: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        this.pending.delete(data.id);
        if (data.error) pending.reject(new WorkerFailure(data.error));
        else pending.resolve(data.result);
      };
      this.worker.onerror = (event) => {
        event.preventDefault();
        this.fail(new WorkerFailure('worker_failed'));
      };
      this.worker.onmessageerror = () => this.fail(new WorkerFailure('worker_failed'));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      try {
        this.worker!.postMessage({ id, method, input }, transfer);
      } catch {
        this.pending.delete(id);
        reject(new WorkerFailure('worker_failed'));
      }
    });
  }
  private fail(error: Error): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
  dispose(): void {
    this.fail(new DOMException('Cancelled', 'AbortError'));
  }
}
