export type ClearReason = 'manual' | 'expired' | 'hidden' | 'navigation';
export type Ticket = { generation: number; signal: AbortSignal };
type Schedule = (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
type Cancel = (timer: ReturnType<typeof setTimeout> | undefined) => void;
type Options = {
  hasData: () => boolean;
  clear: (reason: ClearReason) => void;
  warning: (seconds: number) => void;
  clock?: (seconds: number) => void;
  hideImmediately?: () => boolean;
  now?: () => number;
  schedule?: Schedule;
  cancel?: Cancel;
};
export class SensitiveSession {
  private generation = 0;
  private controller = new AbortController();
  private deadline = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private detach: (() => void) | undefined;
  private readonly now: () => number;
  private readonly schedule: Schedule;
  private readonly cancel: Cancel;
  constructor(private options: Options) {
    this.now = options.now ?? Date.now;
    this.schedule =
      options.schedule ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.cancel = options.cancel ?? ((timer) => globalThis.clearTimeout(timer));
  }
  attach(doc: Document = document, win: Window = window): void {
    const activity = (event: Event) => {
      if (!event.isTrusted || doc.hidden || this.expire()) return;
      const generation = this.generation;
      const at = this.now();
      this.touchAt(at);
      // Delegated UI bindings may update after this document listener. Preserve
      // the real event time while checking their settled state before paint.
      globalThis.queueMicrotask(() => {
        if (generation !== this.generation || doc.hidden || this.expire()) return;
        this.touchAt(at);
      });
    };
    const visibility = () => {
      if (doc.hidden && this.options.hideImmediately?.()) this.clear('hidden');
      else if (!doc.hidden) this.check();
    };
    const leave = () => this.clear('navigation');
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) this.clear('navigation');
    };
    for (const name of ['pointerdown', 'keydown', 'input'])
      doc.addEventListener(name, activity, { passive: true });
    doc.addEventListener('visibilitychange', visibility);
    win.addEventListener('pagehide', leave);
    win.addEventListener('pageshow', restore);
    this.detach = () => {
      for (const name of ['pointerdown', 'keydown', 'input'])
        doc.removeEventListener(name, activity);
      doc.removeEventListener('visibilitychange', visibility);
      win.removeEventListener('pagehide', leave);
      win.removeEventListener('pageshow', restore);
    };
  }
  ticket(): Ticket {
    this.expire();
    return { generation: this.generation, signal: this.controller.signal };
  }
  valid(ticket: Ticket): boolean {
    return ticket.generation === this.generation && !this.expire() && !ticket.signal.aborted;
  }
  private touchAt(at: number): void {
    this.deadline = this.options.hasData() ? at + 300000 : 0;
    this.check();
  }
  touch(): void {
    this.touchAt(this.now());
  }
  keep(event: Event): void {
    if (event.isTrusted && !(typeof document !== 'undefined' && document.hidden) && !this.expire())
      this.touch();
  }
  expire(): boolean {
    if (this.deadline && this.now() >= this.deadline) {
      this.clear('expired');
      return true;
    }
    return false;
  }
  check(): void {
    this.cancel(this.timer);
    this.timer = undefined;
    if (this.expire()) return;
    if (!this.deadline || !this.options.hasData()) {
      this.deadline = 0;
      this.options.warning(0);
      this.options.clock?.(0);
      return;
    }
    const left = this.deadline - this.now();
    const warning = left <= 30000;
    this.options.warning(warning ? Math.ceil(left / 1000) : 0);
    this.options.clock?.(Math.ceil(left / 1000));
    this.timer = this.schedule(() => this.check(), Math.min(left, 1000));
  }
  clear(reason: ClearReason): void {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    this.cancel(this.timer);
    this.timer = undefined;
    this.deadline = 0;
    this.options.warning(0);
    this.options.clock?.(0);
    this.options.clear(reason);
  }
  destroy(): void {
    this.detach?.();
    this.detach = undefined;
    this.clear('navigation');
  }
}
export class ObjectUrls {
  private urls = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }
  releaseLater(url: string): void {
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
      this.timers.delete(timer);
    }, 1000);
    this.timers.add(timer);
  }
  clear(): void {
    for (const timer of this.timers) clearTimeout(timer);
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.timers.clear();
    this.urls.clear();
  }
}
