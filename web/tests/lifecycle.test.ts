import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Composer, Reader, composerState, readerState } from '../src/lib/controllers.ts';
import { SensitiveSession, ObjectUrls } from '../src/lib/session.ts';
import { WorkerFailure } from '../src/lib/worker.ts';
import type { CryptoPort, WorkerMethods } from '../src/lib/worker.ts';
import { LIMITS, type Api } from '../src/lib/api.ts';
import type { ContentInput } from '../../shared/index.ts';
const ID = 'A'.repeat(43);
const SECRET = 'B'.repeat(43);
const TOKEN = 'C'.repeat(43);
const config = { protocol: 1 as const, ...LIMITS, pow_bits: 18 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const service = (): Api => ({
  config: vi.fn(async () => config),
  challenge: vi.fn(async () => ({
    challenge: 'challenge-0123456789',
    bits: 18,
    expires_at: Math.floor(Date.now() / 1000) + 120,
  })),
  create: vi.fn(async () => ({ id: ID, expires_at: Math.floor(Date.now() / 1000) + 3600 })),
  meta: vi.fn(async () => ({
    header: 'header-base64',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    remaining: 1,
  })),
  open: vi.fn(async () => new Uint8Array([1, 2, 3])),
  revoke: vi.fn(async () => {}),
});
class WorkerStub implements CryptoPort {
  disposed = 0;
  calls: string[] = [];
  handlers: Record<string, (value: unknown) => Promise<unknown>> = {};
  content: ContentInput = {
    text: '<img onerror=alert(1)> remains plain text',
    files: [{ name: 'test.txt', mime: 'text/plain', data: new Uint8Array([65, 66]) }],
  };
  async run<K extends keyof WorkerMethods>(
    method: K,
    input: WorkerMethods[K]['input'],
  ): Promise<WorkerMethods[K]['output']> {
    this.calls.push(method);
    if (this.handlers[method])
      return (await this.handlers[method](input)) as WorkerMethods[K]['output'];
    if (method === 'proof')
      return {
        nonce: '7',
        packet: (input as WorkerMethods['proof']['input']).packet,
      } as WorkerMethods[K]['output'];
    const values: Record<string, unknown> = {
      seal: { id: ID, secret: SECRET, revokeToken: TOKEN, packet: new Uint8Array([1, 2, 3]) },
      proof: '7',
      load: { id: ID, peekToken: TOKEN },
      inspect: { id: ID, views: 1, kdf: 'argon2id' },
      prepare: { readToken: TOKEN },
      decrypt: this.content,
    };
    return values[method] as WorkerMethods[K]['output'];
  }
  dispose(): void {
    this.disposed++;
  }
}
async function composer() {
  const state = composerState();
  const worker = new WorkerStub();
  const api = service();
  const clipboard = vi.fn(async () => {});
  const controller = new Composer(state, {
    worker: () => worker,
    api,
    clipboard,
    origin: () => 'https://erase.test',
  });
  await controller.init();
  return { state, worker, api, clipboard, controller };
}
async function reader() {
  const state = readerState();
  const worker = new WorkerStub();
  const api = service();
  const controller = new Reader(state, {
    worker: () => worker,
    api,
    clipboard: vi.fn(async () => {}),
  });
  await controller.load(`https://erase.test/view#1.${ID}.${SECRET}`);
  return { state, worker, api, controller };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sender lifecycle', () => {
  it('hands the same packet buffer to proof work and rejects late proof output after clear', async () => {
    const { state, api, worker, controller } = await composer();
    state.text = 'Private';
    const packet = new Uint8Array([42]);
    const pending = deferred<unknown>();
    worker.handlers.seal = async () => ({ id: ID, secret: SECRET, revokeToken: TOKEN, packet });
    worker.handlers.proof = async (value) => {
      expect((value as { packet: Uint8Array }).packet).toBe(packet);
      return await pending.promise;
    };
    const creating = controller.submit();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(worker.calls).toContain('proof');
    controller.clear();
    pending.resolve({ nonce: '7', packet });
    await creating;
    expect(packet[0]).toBe(0);
    expect(api.create).not.toHaveBeenCalled();
    expect(state.link).toBe('');
    controller.destroy();
  });
  it('removes the previous clear notice when a new draft is edited', async () => {
    const { state, controller } = await composer();
    state.text = 'Old draft';
    controller.clear();
    expect(state.status).toMatch(/Local data cleared/);
    state.text = 'New draft';
    controller.edit();
    expect(state.status).toBe('Ready to create an encrypted package.');
    expect(state.text).toBe('New draft');
    controller.destroy();
  });
  it('checks UTF-8 and file limits before encryption or network upload', async () => {
    const { state, worker, api, controller } = await composer();
    state.text = '🔒'.repeat(LIMITS.max_text_bytes / 4 + 1);
    await controller.submit();
    expect(worker.calls).toEqual([]);
    expect(api.create).not.toHaveBeenCalled();
    state.text = '';
    const large = new File(['x'], 'large.bin');
    Object.defineProperty(large, 'size', { value: LIMITS.max_content_bytes + 1 });
    controller.addFiles([large]);
    expect(state.files).toEqual([]);
    expect(state.error).toMatch(/64.0 MiB/);
    controller.destroy();
  });
  it('creates a fragment-only link, clears the draft, and revokes with the separate capability', async () => {
    const { state, api, controller } = await composer();
    state.text = 'Private';
    state.passphrase = 'different channel';
    await controller.submit();
    expect(new URL(state.link).pathname).toBe('/view');
    expect(new URL(state.link).hash).toBe(`#1.${ID}.${SECRET}`);
    expect(state.text).toBe('');
    expect(state.passphrase).toBe('');
    expect(state.canRevoke).toBe(true);
    await controller.revoke();
    expect(api.revoke).toHaveBeenCalledWith(ID, TOKEN, expect.any(AbortSignal));
    expect(state.link).toBe('');
    expect(state.canRevoke).toBe(false);
    controller.destroy();
  });
  it('does not duplicate uploads on repeated submission while encryption is pending', async () => {
    const { state, api, worker, controller } = await composer();
    state.text = 'Private';
    const pending = deferred<unknown>();
    worker.handlers.seal = () => pending.promise;
    const first = controller.submit();
    await controller.submit();
    expect(worker.calls).toEqual(['seal']);
    pending.resolve({ id: ID, secret: SECRET, revokeToken: TOKEN, packet: new Uint8Array([1]) });
    await first;
    expect(api.create).toHaveBeenCalledTimes(1);
    controller.destroy();
  });
  it('terminates work and ignores a late encryption result after manual clear', async () => {
    const { state, api, worker, controller } = await composer();
    state.text = 'Private';
    state.passphrase = 'Phrase';
    const pending = deferred<unknown>();
    worker.handlers.seal = () => pending.promise;
    const creating = controller.submit();
    controller.clear();
    const packet = new Uint8Array([42]);
    pending.resolve({ id: ID, secret: SECRET, revokeToken: TOKEN, packet });
    await creating;
    expect(worker.disposed).toBeGreaterThan(0);
    expect(api.create).not.toHaveBeenCalled();
    expect(state.link).toBe('');
    expect(state.passphrase).toBe('');
    expect(packet[0]).toBe(0);
    controller.destroy();
  });
  it('warns at 4:30, clears at 5:00, and destroys the revocation capability', async () => {
    const { state, api, controller } = await composer();
    state.text = 'Private';
    await controller.submit();
    vi.advanceTimersByTime(270000);
    expect(state.warning).toBe(30);
    vi.advanceTimersByTime(30000);
    expect(state.warning).toBe(0);
    expect(state.link).toBe('');
    expect(state.canRevoke).toBe(false);
    await controller.revoke();
    expect(api.revoke).not.toHaveBeenCalled();
    expect(state.status).toMatch(/Server retention/);
    controller.destroy();
  });
  it('enforces absolute expiry when an upload returns after suspended timers', async () => {
    const { state, api, controller } = await composer();
    state.text = 'Private';
    const pending = deferred<{ id: string; expires_at: number }>();
    api.create = vi.fn(() => pending.promise);
    const creating = controller.submit();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(api.create).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 300001);
    pending.resolve({ id: ID, expires_at: 1900000000 });
    await creating;
    expect(state.link).toBe('');
    expect(state.status).toMatch(/inactivity/);
    expect(state.busy).toBe(false);
    controller.destroy();
  });
  it('asynchronous creation does not extend the last activity deadline', async () => {
    const { state, api, controller } = await composer();
    state.text = 'Private';
    const pending = deferred<{ id: string; expires_at: number }>();
    api.create = vi.fn(() => pending.promise);
    const creating = controller.submit();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    vi.advanceTimersByTime(40000);
    pending.resolve({ id: ID, expires_at: 1900000000 });
    await creating;
    expect(state.link).not.toBe('');
    vi.advanceTimersByTime(260000);
    expect(state.link).toBe('');
    expect(state.status).toMatch(/inactivity/);
    controller.destroy();
  });
  it('configuration failure never presents a ready state', async () => {
    const state = composerState();
    const api = service();
    api.config = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const controller = new Composer(state, { api, worker: () => new WorkerStub() });
    await controller.init();
    expect(state.configured).toBe(false);
    expect(state.status).toBe('Connection unavailable.');
    expect(state.error).not.toBe('');
    controller.destroy();
  });
  it('does not restore clipboard feedback after local clearing', async () => {
    const state = composerState();
    const worker = new WorkerStub();
    const pending = deferred<void>();
    const controller = new Composer(state, {
      worker: () => worker,
      api: service(),
      clipboard: () => pending.promise,
      origin: () => 'https://erase.test',
    });
    await controller.init();
    state.text = 'Private';
    await controller.submit();
    const copying = controller.copyLink();
    controller.clear();
    pending.resolve();
    await copying;
    expect(state.copied).toBe('');
    expect(state.link).toBe('');
    controller.destroy();
  });
});

describe('receiver lifecycle', () => {
  it('offers complete long text as a download and revokes its temporary URL on clear', async () => {
    const { state, worker, controller } = await reader();
    const completeText = 'Long message\n'.repeat(20000);
    worker.content.text = completeText;
    state.passphrase = 'correct';
    await controller.open();
    const anchor = {
      href: '',
      download: '',
      rel: '',
      hidden: false,
      click: vi.fn(),
      remove: vi.fn(),
    };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { append: vi.fn() } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:complete-text');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    controller.downloadText();
    expect(anchor.download).toBe('erase-message.txt');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(await (create.mock.calls[0][0] as Blob).text()).toBe(completeText);
    controller.clear();
    expect(revoke).toHaveBeenCalledWith('blob:complete-text');
    expect(state.content).toBeNull();
    controller.destroy();
  });
  it('loads only metadata before explicit opening and checks wrong passphrases without consuming', async () => {
    const { state, worker, api, controller } = await reader();
    expect(api.meta).toHaveBeenCalledTimes(1);
    expect(api.open).not.toHaveBeenCalled();
    expect(state.phase).toBe('ready');
    state.passphrase = 'incorrect';
    worker.handlers.prepare = async () => {
      throw new WorkerFailure('wrong_passphrase');
    };
    await controller.open();
    expect(api.open).not.toHaveBeenCalled();
    expect(state.phase).toBe('ready');
    expect(state.error).toMatch(/No retrieval/);
    delete worker.handlers.prepare;
    state.passphrase = 'correct';
    await controller.open();
    expect(api.open).toHaveBeenCalledTimes(1);
    expect(state.phase).toBe('open');
    expect(state.content?.text).toContain('<img');
    expect(state.passphrase).toBe('');
    controller.destroy();
  });
  it('makes one consuming request on double submit and never retries a failed delivery automatically', async () => {
    const { state, api, controller } = await reader();
    state.passphrase = 'correct';
    const pending = deferred<Uint8Array>();
    api.open = vi.fn(() => pending.promise);
    const opening = controller.open();
    await Promise.resolve();
    await controller.open();
    expect(api.open).toHaveBeenCalledTimes(1);
    pending.reject(new TypeError('network failed'));
    await opening;
    expect(state.phase).toBe('error');
    await controller.open();
    expect(api.open).toHaveBeenCalledTimes(1);
    expect(state.error).toMatch(/may already have been counted/);
    controller.destroy();
  });
  it('a late plaintext result cannot restore a cleared view, and its file buffers are wiped', async () => {
    const { state, worker, controller } = await reader();
    state.passphrase = 'correct';
    const pending = deferred<ContentInput>();
    worker.handlers.decrypt = () => pending.promise;
    const opening = controller.open();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(worker.calls).toContain('decrypt');
    controller.clear();
    const content = {
      text: 'Late secret',
      files: [{ name: 'secret', mime: '', data: new Uint8Array([42]) }],
    };
    pending.resolve(content);
    await opening;
    expect(state.content).toBeNull();
    expect(state.phase).toBe('cleared');
    expect(content.files[0].data[0]).toBe(0);
    controller.destroy();
  });
  it('asynchronous decryption does not extend the last activity deadline', async () => {
    const { state, worker, controller } = await reader();
    state.passphrase = 'correct';
    const pending = deferred<ContentInput>();
    worker.handlers.decrypt = () => pending.promise;
    const opening = controller.open();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    vi.advanceTimersByTime(40000);
    pending.resolve(worker.content);
    await opening;
    expect(state.phase).toBe('open');
    vi.advanceTimersByTime(260000);
    expect(state.phase).toBe('cleared');
    expect(state.content).toBeNull();
    controller.destroy();
  });
  it('starts the inactivity timer before link preparation finishes', async () => {
    const state = readerState();
    const worker = new WorkerStub();
    const pending = deferred<unknown>();
    worker.handlers.load = () => pending.promise;
    const api = service();
    const controller = new Reader(state, { worker: () => worker, api });
    const loading = controller.load('https://erase.test/view#secret');
    vi.advanceTimersByTime(300000);
    pending.resolve({ id: ID, peekToken: TOKEN });
    await loading;
    expect(api.meta).not.toHaveBeenCalled();
    expect(state.phase).toBe('cleared');
    controller.destroy();
  });
  it('clearing decrypted files releases byte buffers', async () => {
    const { state, worker, controller } = await reader();
    state.passphrase = 'correct';
    await controller.open();
    const bytes = worker.content.files[0].data;
    expect(bytes[0]).toBe(65);
    controller.clear();
    expect([...bytes]).toEqual([0, 0]);
    expect(state.content).toBeNull();
    controller.destroy();
  });
});

class EventSurface {
  hidden = false;
  listeners = new Map<string, Set<(event: Event) => void>>();
  addEventListener(name: string, callback: (event: Event) => void): void {
    const set = this.listeners.get(name) ?? new Set();
    set.add(callback);
    this.listeners.set(name, set);
  }
  removeEventListener(name: string, callback: (event: Event) => void): void {
    this.listeners.get(name)?.delete(callback);
  }
  emit(name: string, values: object = {}): void {
    for (const fn of this.listeners.get(name) ?? []) fn({ isTrusted: true, ...values } as Event);
  }
}
describe('session boundaries', () => {
  it('starts on the first trusted input even when binding updates after the document handler', async () => {
    const doc = new EventSurface();
    const win = new EventSurface();
    let hasData = false;
    const clock = vi.fn();
    const clear = vi.fn(() => {
      hasData = false;
    });
    const session = new SensitiveSession({
      hasData: () => hasData,
      clear,
      warning: vi.fn(),
      clock,
    });
    session.attach(doc as unknown as Document, win as unknown as Window);
    doc.emit('input');
    hasData = true;
    await Promise.resolve();
    expect(clock).toHaveBeenLastCalledWith(300);
    vi.advanceTimersByTime(300000);
    expect(clear).toHaveBeenCalledWith('expired');
    session.destroy();
  });
  it('keeps the original activity time when a deferred binding check runs later', async () => {
    const doc = new EventSurface();
    const win = new EventSurface();
    let hasData = false;
    const clock = vi.fn();
    const clear = vi.fn();
    const session = new SensitiveSession({
      hasData: () => hasData,
      clear,
      warning: vi.fn(),
      clock,
    });
    session.attach(doc as unknown as Document, win as unknown as Window);
    doc.emit('input');
    hasData = true;
    vi.setSystemTime(Date.now() + 5000);
    await Promise.resolve();
    expect(clock).toHaveBeenLastCalledWith(295);
    vi.advanceTimersByTime(295000);
    expect(clear).toHaveBeenCalledWith('expired');
    session.destroy();
  });
  it('stops timing when the same input dispatch removes all local data', async () => {
    const doc = new EventSurface();
    const win = new EventSurface();
    let hasData = true;
    const clock = vi.fn();
    const clear = vi.fn();
    const session = new SensitiveSession({
      hasData: () => hasData,
      clear,
      warning: vi.fn(),
      clock,
    });
    session.attach(doc as unknown as Document, win as unknown as Window);
    session.touch();
    doc.emit('input');
    hasData = false;
    await Promise.resolve();
    expect(clock).toHaveBeenLastCalledWith(0);
    vi.advanceTimersByTime(300001);
    expect(clear).not.toHaveBeenCalled();
    session.destroy();
  });
  it('discards queued activity after clearing or when the tab becomes hidden', async () => {
    const doc = new EventSurface();
    const win = new EventSurface();
    const clock = vi.fn();
    const session = new SensitiveSession({
      hasData: () => true,
      clear: vi.fn(),
      warning: vi.fn(),
      clock,
    });
    session.attach(doc as unknown as Document, win as unknown as Window);
    doc.emit('input');
    session.clear('manual');
    const afterClear = clock.mock.calls.length;
    await Promise.resolve();
    expect(clock).toHaveBeenCalledTimes(afterClear);
    expect(clock).toHaveBeenLastCalledWith(0);
    doc.emit('input');
    doc.hidden = true;
    const beforeHiddenCheck = clock.mock.calls.length;
    await Promise.resolve();
    expect(clock).toHaveBeenCalledTimes(beforeHiddenCheck);
    session.destroy();
  });
  it('calls browser timer functions with the global receiver', () => {
    const schedule = globalThis.setTimeout;
    const cancel = globalThis.clearTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(function (this: unknown, ...args) {
      expect(this).toBe(globalThis);
      return schedule(...args);
    });
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(function (this: unknown, ...args) {
      expect(this).toBe(globalThis);
      return cancel(...args);
    });
    const clock = vi.fn();
    const clear = vi.fn();
    const session = new SensitiveSession({ hasData: () => true, clear, warning: vi.fn(), clock });
    session.touch();
    expect(clock).toHaveBeenLastCalledWith(300);
    vi.advanceTimersByTime(1000);
    expect(clock).toHaveBeenLastCalledWith(299);
    session.destroy();
    expect(clock).toHaveBeenLastCalledWith(0);
    expect(clear).toHaveBeenCalledWith('navigation');
  });
  it('ignores synthetic and mousemove activity, while trusted input renews the deadline', () => {
    const doc = new EventSurface();
    const win = new EventSurface();
    const clear = vi.fn();
    const warning = vi.fn();
    const session = new SensitiveSession({ hasData: () => true, clear, warning });
    session.attach(doc as unknown as Document, win as unknown as Window);
    session.touch();
    vi.advanceTimersByTime(270000);
    expect(warning).toHaveBeenLastCalledWith(30);
    vi.advanceTimersByTime(1000);
    expect(warning).toHaveBeenLastCalledWith(29);
    doc.emit('keydown');
    vi.advanceTimersByTime(270000);
    doc.emit('mousemove');
    doc.emit('input', { isTrusted: false });
    vi.advanceTimersByTime(30000);
    expect(clear).toHaveBeenCalledWith('expired');
    session.destroy();
  });
  it('preserves a waiting receiver on tab hiding, but clears decrypted content immediately', () => {
    const doc = new EventSurface();
    const win = new EventSurface();
    let decrypted = false;
    const clear = vi.fn();
    const session = new SensitiveSession({
      hasData: () => true,
      clear,
      warning: vi.fn(),
      hideImmediately: () => decrypted,
    });
    session.attach(doc as unknown as Document, win as unknown as Window);
    session.touch();
    doc.hidden = true;
    doc.emit('visibilitychange');
    expect(clear).not.toHaveBeenCalled();
    decrypted = true;
    doc.emit('visibilitychange');
    expect(clear).toHaveBeenCalledWith('hidden');
    session.destroy();
  });
  it('checks a suspended deadline before a returning tab can renew its state', () => {
    const doc = new EventSurface();
    const win = new EventSurface();
    const clear = vi.fn();
    const session = new SensitiveSession({ hasData: () => true, clear, warning: vi.fn() });
    session.attach(doc as unknown as Document, win as unknown as Window);
    session.touch();
    doc.hidden = true;
    vi.setSystemTime(Date.now() + 300001);
    doc.hidden = false;
    doc.emit('visibilitychange');
    expect(clear).toHaveBeenCalledWith('expired');
    session.destroy();
  });
  it('revokes every object URL and cancels delayed releases on clear', () => {
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const urls = new ObjectUrls();
    const a = urls.create(new Blob(['a']));
    urls.create(new Blob(['b']));
    urls.releaseLater(a);
    urls.clear();
    expect(revoke).toHaveBeenCalledWith('blob:first');
    expect(revoke).toHaveBeenCalledWith('blob:second');
    expect(revoke).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
