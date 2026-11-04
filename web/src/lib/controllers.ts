import { api, errorText, LIMITS, RequestError } from './api.ts';
import type { Api, PublicConfig, Metadata } from './api.ts';
import { CryptoWorker } from './worker.ts';
import type { CryptoPort } from './worker.ts';
import { SensitiveSession, ObjectUrls } from './session.ts';
import type { ClearReason } from './session.ts';
import type { ContentInput } from '../../../shared/index.ts';
type Dependencies = {
  api?: Api;
  worker?: () => CryptoPort;
  origin?: () => string;
  clipboard?: (text: string) => Promise<void>;
};
const encoder = new TextEncoder();
export function sizeLabel(bytes: number): string {
  return bytes < 1048576
    ? `${(bytes / 1024).toFixed(bytes ? 1 : 0)} KiB`
    : `${(bytes / 1048576).toFixed(1)} MiB`;
}
function clearedText(reason: ClearReason): string {
  if (reason === 'expired')
    return 'Local data cleared after five minutes of inactivity. Server retention and copies made elsewhere are unchanged.';
  if (reason === 'hidden') return 'Local view cleared when this tab became hidden.';
  return 'Local data cleared. Server retention and copies made elsewhere are unchanged.';
}
export type ComposerStage =
  'compose' | 'encrypt' | 'proof' | 'upload' | 'share' | 'revoke' | 'revoked';
export type ComposerState = {
  stage: ComposerStage;
  sessionSeconds: number;
  text: string;
  files: File[];
  mode: 'text' | 'files';
  passphrase: string;
  ttl: number;
  views: number;
  busy: boolean;
  configured: boolean;
  config: PublicConfig | null;
  status: string;
  error: string;
  warning: number;
  link: string;
  expiresAt: number;
  copied: string;
  canRevoke: boolean;
  createdViews: number;
};
export const composerState = (): ComposerState => ({
  stage: 'compose',
  sessionSeconds: 0,
  text: '',
  files: [],
  mode: 'text',
  passphrase: '',
  ttl: 3600,
  views: 1,
  busy: false,
  configured: false,
  config: null,
  status: 'Connecting to service…',
  error: '',
  warning: 0,
  link: '',
  expiresAt: 0,
  copied: '',
  canRevoke: false,
  createdViews: 0,
});
export class Composer {
  readonly session: SensitiveSession;
  private service: Api;
  private crypto: CryptoPort;
  private receipt: { id: string; token: string } | null = null;
  private copy: (text: string) => Promise<void>;
  private origin: () => string;
  constructor(
    readonly state: ComposerState,
    dependencies: Dependencies = {},
  ) {
    this.service = dependencies.api ?? api;
    this.crypto = (dependencies.worker ?? (() => new CryptoWorker()))();
    this.copy = dependencies.clipboard ?? ((text) => navigator.clipboard.writeText(text));
    this.origin = dependencies.origin ?? (() => location.origin);
    this.session = new SensitiveSession({
      hasData: () =>
        Boolean(state.text || state.files.length || state.passphrase || state.link || state.busy),
      warning: (seconds) => (state.warning = seconds),
      clock: (seconds) => (state.sessionSeconds = seconds),
      clear: (reason) => this.reset(reason),
    });
  }
  async init(): Promise<void> {
    const ticket = this.session.ticket();
    this.state.status = 'Connecting to service…';
    this.state.error = '';
    try {
      const config = await this.service.config(ticket.signal);
      if (this.session.valid(ticket)) {
        this.state.config = config;
        this.state.configured = true;
        if (this.state.ttl > config.max_ttl)
          this.state.ttl = [604800, 86400, 3600, 600, 60].find((value) => value <= config.max_ttl)!;
        this.state.views = Math.min(this.state.views, config.max_views);
        this.state.status = 'Ready to create an encrypted package.';
      }
    } catch (error) {
      if (this.session.valid(ticket)) {
        this.state.error = errorText(error);
        this.state.status = 'Connection unavailable.';
        this.state.configured = false;
      }
    }
  }
  private reset(reason: ClearReason): void {
    this.crypto.dispose();
    this.receipt = null;
    Object.assign(this.state, {
      stage: 'compose',
      sessionSeconds: 0,
      text: '',
      files: [],
      passphrase: '',
      link: '',
      expiresAt: 0,
      copied: '',
      error: '',
      busy: false,
      canRevoke: false,
      createdViews: 0,
      status: clearedText(reason),
    });
  }
  attach(): void {
    this.session.attach();
  }
  clear(): void {
    this.session.clear('manual');
  }
  destroy(): void {
    this.session.destroy();
  }
  edit(): void {
    if (this.state.busy) return;
    this.state.stage = 'compose';
    if (this.state.configured && this.state.status.startsWith('Local data cleared'))
      this.state.status = 'Ready to create an encrypted package.';
  }
  addFiles(files: File[]): void {
    if (this.state.busy || this.session.expire()) return;
    const all = [...this.state.files, ...files];
    const limits = this.state.config ?? LIMITS;
    if (
      all.length > limits.max_files ||
      all.reduce((sum, file) => sum + file.size, 0) + encoder.encode(this.state.text).length >
        limits.max_content_bytes
    ) {
      this.state.error = `Select up to ${limits.max_files} files, with at most ${sizeLabel(limits.max_content_bytes)} total content.`;
      return;
    }
    this.state.files = all;
    this.state.stage = 'compose';
    this.state.error = '';
    this.session.touch();
  }
  removeFile(index: number): void {
    if (!this.state.busy) this.state.files = this.state.files.filter((_, i) => i !== index);
  }
  async submit(): Promise<void> {
    if (this.state.busy || !this.state.configured || this.session.expire()) return;
    const state = this.state;
    const limits = state.config!;
    const files = state.mode === 'files' ? [...state.files] : [];
    const textBytes = encoder.encode(state.text).length;
    if (
      (!/\S/.test(state.text) && !files.length) ||
      files.length > limits.max_files ||
      textBytes > limits.max_text_bytes ||
      textBytes + files.reduce((sum, file) => sum + file.size, 0) > limits.max_content_bytes ||
      !Number.isInteger(state.views) ||
      state.views < 1 ||
      state.views > limits.max_views ||
      !Number.isInteger(state.ttl) ||
      state.ttl < 60 ||
      state.ttl > limits.max_ttl ||
      state.passphrase.length > 256
    ) {
      state.error = 'Check the content size, retrieval limit, and expiry.';
      return;
    }
    state.busy = true;
    state.stage = 'encrypt';
    state.error = '';
    state.copied = '';
    state.status = 'Encrypting content locally…';
    this.session.touch();
    const ticket = this.session.ticket();
    let packet: Uint8Array | undefined;
    try {
      const sealed = await this.crypto.run('seal', {
        text: state.text,
        files,
        options: { ttl: state.ttl, views: state.views, passphrase: state.passphrase },
      });
      packet = sealed.packet;
      if (!this.session.valid(ticket)) return;
      state.stage = 'proof';
      state.status = 'Computing proof-of-work…';
      const challenge = await this.service.challenge(ticket.signal);
      if (!this.session.valid(ticket)) return;
      const proofPacket = packet;
      packet = undefined;
      const proof = await this.crypto.run('proof', { packet: proofPacket, challenge }, [
        proofPacket.buffer as ArrayBuffer,
      ]);
      packet = proof.packet;
      if (!this.session.valid(ticket)) return;
      state.stage = 'upload';
      state.status = 'Uploading encrypted package…';
      const receipt = await this.service.create(packet, challenge, proof.nonce, ticket.signal);
      if (!this.session.valid(ticket)) return;
      if (receipt.id !== sealed.id) throw new RequestError('invalid_response');
      this.receipt = { id: sealed.id, token: sealed.revokeToken };
      state.link = `${this.origin()}/view#1.${sealed.id}.${sealed.secret}`;
      state.expiresAt = receipt.expires_at;
      state.canRevoke = true;
      state.createdViews = state.views;
      state.text = '';
      state.files = [];
      state.passphrase = '';
      state.stage = 'share';
      state.status = 'Package created. Local draft cleared.';
      this.crypto.dispose();
    } catch (error) {
      if (this.session.valid(ticket)) {
        state.stage = state.link ? 'share' : 'compose';
        state.error = errorText(error);
        state.status = 'Creation failed. Local draft retained.';
        this.crypto.dispose();
      }
    } finally {
      packet?.fill(0);
      if (this.session.valid(ticket)) state.busy = false;
    }
  }
  async copyLink(): Promise<void> {
    if (this.session.expire() || !this.state.link) return;
    const ticket = this.session.ticket();
    try {
      await this.copy(this.state.link);
      if (this.session.valid(ticket))
        this.state.copied = 'Link copied. Clipboard copies are outside this page’s control.';
    } catch {
      if (this.session.valid(ticket))
        this.state.copied = 'Clipboard access unavailable. Select and copy the link manually.';
    }
  }
  async revoke(): Promise<void> {
    if (this.session.expire() || !this.receipt || this.state.busy) return;
    const ticket = this.session.ticket();
    const receipt = this.receipt;
    this.state.busy = true;
    this.state.stage = 'revoke';
    try {
      await this.service.revoke(receipt.id, receipt.token, ticket.signal);
      if (!this.session.valid(ticket)) return;
      this.receipt = null;
      this.state.stage = 'revoked';
      this.state.link = '';
      this.state.canRevoke = false;
      this.state.copied = '';
      this.state.status = 'Stored package revoked. Previously received copies are unaffected.';
    } catch (error) {
      if (this.session.valid(ticket)) {
        this.state.stage = 'share';
        this.state.error = errorText(error);
      }
    } finally {
      if (this.session.valid(ticket)) this.state.busy = false;
    }
  }
}
export type ReaderState = {
  sessionSeconds: number;
  phase: 'loading' | 'ready' | 'open' | 'cleared' | 'error';
  passphrase: string;
  required: boolean;
  busy: boolean;
  status: string;
  error: string;
  warning: number;
  expiresAt: number;
  remaining: number;
  content: ContentInput | null;
  copied: string;
};
export const readerState = (): ReaderState => ({
  sessionSeconds: 0,
  phase: 'loading',
  passphrase: '',
  required: false,
  busy: false,
  status: 'Checking package metadata…',
  error: '',
  warning: 0,
  expiresAt: 0,
  remaining: 0,
  content: null,
  copied: '',
});
export class Reader {
  readonly session: SensitiveSession;
  readonly urls = new ObjectUrls();
  private service: Api;
  private crypto: CryptoPort;
  private id = '';
  private metadata: Metadata | null = null;
  private copy: (text: string) => Promise<void>;
  constructor(
    readonly state: ReaderState,
    dependencies: Dependencies = {},
  ) {
    this.service = dependencies.api ?? api;
    this.crypto = (dependencies.worker ?? (() => new CryptoWorker()))();
    this.copy = dependencies.clipboard ?? ((text) => navigator.clipboard.writeText(text));
    this.session = new SensitiveSession({
      hasData: () =>
        Boolean(
          this.id || state.passphrase || state.content || state.busy || state.phase === 'loading',
        ),
      warning: (seconds) => (state.warning = seconds),
      clock: (seconds) => (state.sessionSeconds = seconds),
      clear: (reason) => this.reset(reason),
      hideImmediately: () => state.phase === 'open' || state.busy,
    });
  }
  attach(): void {
    this.session.attach();
  }
  private reset(reason: ClearReason): void {
    this.crypto.dispose();
    this.id = '';
    this.metadata = null;
    this.urls.clear();
    for (const file of this.state.content?.files ?? []) file.data.fill(0);
    Object.assign(this.state, {
      phase: 'cleared',
      passphrase: '',
      content: null,
      busy: false,
      copied: '',
      error: '',
      expiresAt: 0,
      remaining: 0,
      status: clearedText(reason),
    });
  }
  clear(): void {
    this.session.clear('manual');
  }
  destroy(): void {
    this.session.destroy();
  }
  async load(url: string): Promise<void> {
    this.state.phase = 'loading';
    this.state.error = '';
    this.state.status = 'Checking package metadata…';
    this.session.touch();
    const ticket = this.session.ticket();
    try {
      const link = await this.crypto.run('load', { url });
      if (!this.session.valid(ticket)) return;
      this.id = link.id;
      const metadata = await this.service.meta(link.id, link.peekToken, ticket.signal);
      if (!this.session.valid(ticket)) return;
      const header = await this.crypto.run('inspect', { header: metadata.header });
      if (!this.session.valid(ticket)) return;
      if (header.id !== this.id || metadata.remaining > header.views)
        throw new RequestError('invalid_response');
      this.metadata = metadata;
      Object.assign(this.state, {
        phase: 'ready',
        required: header.kdf === 'argon2id',
        expiresAt: metadata.expires_at,
        remaining: metadata.remaining,
        status: 'Encrypted package available.',
      });
    } catch (error) {
      if (!this.session.valid(ticket)) return;
      this.crypto.dispose();
      this.id = '';
      this.state.phase = 'error';
      this.state.status = 'Package unavailable.';
      this.state.error =
        error && typeof error === 'object' && 'code' in error && error.code === 'invalid_link'
          ? 'The complete original link is required, including its fragment after #.'
          : errorText(error);
    }
  }
  async open(): Promise<void> {
    if (
      this.session.expire() ||
      this.state.busy ||
      this.state.phase !== 'ready' ||
      !this.id ||
      !this.metadata
    )
      return;
    if (this.state.required && !this.state.passphrase) {
      this.state.error = 'Enter the separate passphrase.';
      return;
    }
    this.state.busy = true;
    this.state.error = '';
    this.state.status = 'Deriving and verifying access locally…';
    const ticket = this.session.ticket();
    let requested = false;
    let packet: Uint8Array | undefined;
    try {
      const access = await this.crypto.run('prepare', { passphrase: this.state.passphrase });
      if (!this.session.valid(ticket)) return;
      this.state.passphrase = '';
      this.state.status = 'Retrieving encrypted package…';
      requested = true;
      packet = await this.service.open(this.id, access.readToken, ticket.signal);
      if (!this.session.valid(ticket)) return;
      this.state.status = 'Decrypting locally…';
      const content = await this.crypto.run('decrypt', { packet }, [packet.buffer as ArrayBuffer]);
      packet = undefined;
      if (!this.session.valid(ticket)) {
        for (const file of content.files) file.data.fill(0);
        return;
      }
      this.state.content = content;
      this.state.remaining--;
      this.state.phase = 'open';
      this.state.status = 'Decrypted locally. This retrieval has been counted.';
      this.id = '';
      this.metadata = null;
      this.crypto.dispose();
    } catch (error) {
      if (!this.session.valid(ticket)) return;
      this.state.passphrase = '';
      this.state.error = errorText(error);
      if (requested) {
        this.crypto.dispose();
        this.id = '';
        this.metadata = null;
        this.state.phase = 'error';
        this.state.error =
          error instanceof RequestError && error.code === 'request_timeout'
            ? 'The transfer timed out and was not retried automatically. A retrieval may already have been counted. Reopen the original link to check availability.'
            : 'Retrieval or integrity verification failed. A retrieval may already have been counted. Reopen the original link to check availability.';
      }
      this.state.status = requested ? 'Opening failed.' : 'Local access verification failed.';
    } finally {
      if (packet?.byteLength) packet.fill(0);
      if (this.session.valid(ticket)) this.state.busy = false;
    }
  }
  async copyText(): Promise<void> {
    if (this.session.expire() || !this.state.content?.text) return;
    const ticket = this.session.ticket();
    try {
      await this.copy(this.state.content.text);
      if (this.session.valid(ticket))
        this.state.copied = 'Content copied. Clipboard data is outside this page’s control.';
    } catch {
      if (this.session.valid(ticket))
        this.state.copied = 'Clipboard access unavailable. Select and copy the content manually.';
    }
  }
  download(index: number): void {
    if (this.session.expire() || !this.state.content) return;
    const file = this.state.content.files[index];
    if (!file) return;
    const url = this.urls.create(
      new Blob([file.data as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.rel = 'noreferrer';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    this.urls.releaseLater(url);
  }
  downloadText(): void {
    if (this.session.expire() || !this.state.content?.text) return;
    const url = this.urls.create(
      new Blob([this.state.content.text], { type: 'text/plain;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'erase-message.txt';
    anchor.rel = 'noreferrer';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    this.urls.releaseLater(url);
  }
}
