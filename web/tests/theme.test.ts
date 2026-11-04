import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { ThemeController, type ThemeState } from '../src/lib/theme.ts';

const earlyScript = readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');

function themeHost(stored: string | null = null, dark = false) {
  const data = new Map<string, string>([['unrelated.preference', 'keep']]);
  if (stored !== null) data.set('erase.theme', stored);
  const access = { readBlocked: false, writeBlocked: false };
  const storage = {
    getItem: vi.fn((key: string) => {
      if (access.readBlocked) throw new DOMException('Blocked', 'SecurityError');
      return data.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (access.writeBlocked) throw new DOMException('Blocked', 'SecurityError');
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      if (access.writeBlocked) throw new DOMException('Blocked', 'SecurityError');
      data.delete(key);
    }),
  };
  const listeners = new Set<() => void>();
  const media = {
    matches: dark,
    addEventListener: vi.fn((_name: string, handler: () => void) => listeners.add(handler)),
    removeEventListener: vi.fn((_name: string, handler: () => void) => listeners.delete(handler)),
    addListener: vi.fn((handler: () => void) => listeners.add(handler)),
    removeListener: vi.fn((handler: () => void) => listeners.delete(handler)),
  };
  const windowListeners = new Map<string, Set<(event: StorageEvent) => void>>();
  const win = {
    localStorage: storage,
    matchMedia: vi.fn(() => media),
    addEventListener: vi.fn((name: string, handler: (event: StorageEvent) => void) => {
      const entries = windowListeners.get(name) ?? new Set();
      entries.add(handler);
      windowListeners.set(name, entries);
    }),
    removeEventListener: vi.fn((name: string, handler: (event: StorageEvent) => void) =>
      windowListeners.get(name)?.delete(handler),
    ),
  };
  const root = { dataset: {} as Record<string, string> };
  const colorScheme = { content: 'light dark' };
  const doc = { documentElement: root, querySelector: vi.fn(() => colorScheme) };
  const changed = vi.fn<(state: ThemeState) => void>();
  return {
    data,
    access,
    storage,
    media,
    win,
    doc,
    root,
    colorScheme,
    changed,
    listeners,
    start: () => new ThemeController(changed, doc as unknown as Document, win as unknown as Window),
    system: (dark: boolean) => {
      media.matches = dark;
      for (const handler of listeners) handler();
    },
    storageEvent: (key: string | null) => {
      for (const handler of windowListeners.get('storage') ?? []) handler({ key } as StorageEvent);
    },
    early: () => runInNewContext(earlyScript, { document: doc, localStorage: storage }),
  };
}

describe('system theme and explicit preferences', () => {
  it('follows OS changes by default without storing a forced light or dark preference', () => {
    const host = themeHost(null, true);
    const controller = host.start();
    expect(host.win.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'system', resolved: 'dark' });
    expect(host.root.dataset.theme).toBeUndefined();
    expect(host.colorScheme.content).toBe('light dark');
    host.system(false);
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'system', resolved: 'light' });
    host.system(true);
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'system', resolved: 'dark' });
    expect(host.storage.setItem).not.toHaveBeenCalled();
    controller.destroy();
  });
  it('keeps an explicit saved override across OS changes and restores system without deleting other storage', () => {
    const host = themeHost('light', true);
    const controller = host.start();
    expect(host.root.dataset.theme).toBe('light');
    expect(host.colorScheme.content).toBe('light');
    host.system(false);
    host.system(true);
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'light', resolved: 'light' });
    controller.set('system');
    expect(host.root.dataset.theme).toBeUndefined();
    expect(host.colorScheme.content).toBe('light dark');
    expect(host.data.has('erase.theme')).toBe(false);
    expect(host.data.get('unrelated.preference')).toBe('keep');
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'system', resolved: 'dark' });
    controller.set('dark');
    expect(host.data.get('erase.theme')).toBe('dark');
    controller.destroy();
  });
  it('continues to work when storage reads or writes are blocked', () => {
    const host = themeHost();
    host.access.readBlocked = true;
    host.access.writeBlocked = true;
    const controller = host.start();
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'system', resolved: 'light' });
    controller.set('dark');
    expect(host.root.dataset.theme).toBe('dark');
    expect(host.colorScheme.content).toBe('dark');
    host.storageEvent('erase.theme');
    expect(host.root.dataset.theme).toBe('dark');
    controller.set('system');
    expect(host.root.dataset.theme).toBeUndefined();
    controller.destroy();
  });
  it.each(['missing', 'throws'] as const)('falls back safely when matchMedia %s', (mode) => {
    const host = themeHost();
    if (mode === 'missing') Reflect.deleteProperty(host.win, 'matchMedia');
    else
      host.win.matchMedia.mockImplementation(() => {
        throw new Error('unavailable');
      });
    const controller = host.start();
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'system', resolved: 'light' });
    expect(host.root.dataset.theme).toBeUndefined();
    controller.set('dark');
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'dark', resolved: 'dark' });
    controller.destroy();
  });
  it('ignores invalid stored values and synchronizes valid changes from another tab', () => {
    const host = themeHost('not-a-theme');
    const controller = host.start();
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'system', resolved: 'light' });
    host.data.set('erase.theme', 'dark');
    host.storageEvent('unrelated.preference');
    expect(host.root.dataset.theme).toBeUndefined();
    host.storageEvent('erase.theme');
    expect(host.root.dataset.theme).toBe('dark');
    host.data.delete('erase.theme');
    host.storageEvent(null);
    expect(host.root.dataset.theme).toBeUndefined();
    controller.destroy();
  });
  it('removes listeners and ignores queued events after disposal', () => {
    const host = themeHost();
    const controller = host.start();
    const pending = [...host.listeners][0];
    controller.destroy();
    const count = host.changed.mock.calls.length;
    host.media.matches = true;
    pending();
    host.storageEvent('erase.theme');
    controller.set('dark');
    expect(host.changed).toHaveBeenCalledTimes(count);
    expect(host.listeners.size).toBe(0);
    expect(host.win.removeEventListener).toHaveBeenCalledWith('storage', expect.any(Function));
  });
  it('supports older MediaQueryList change listeners without making them mandatory', () => {
    const host = themeHost();
    Reflect.deleteProperty(host.media, 'addEventListener');
    const controller = host.start();
    expect(host.media.addListener).toHaveBeenCalledOnce();
    host.system(true);
    expect(host.changed).toHaveBeenLastCalledWith({ preference: 'system', resolved: 'dark' });
    controller.destroy();
    expect(host.media.removeListener).toHaveBeenCalledOnce();
  });
});

describe('theme before application startup', () => {
  it.each(['light', 'dark'] as const)(
    'applies a stored %s override before the app, preserving it at handoff',
    (preference) => {
      const host = themeHost(preference, preference === 'light');
      host.early();
      expect(host.root.dataset.theme).toBe(preference);
      expect(host.colorScheme.content).toBe(preference);
      const controller = host.start();
      expect(host.root.dataset.theme).toBe(preference);
      expect(host.colorScheme.content).toBe(preference);
      controller.destroy();
    },
  );
  it('leaves system colors available when no preference exists, storage is invalid, or storage is blocked', () => {
    for (const stored of [null, 'invalid']) {
      const host = themeHost(stored);
      host.root.dataset.theme = 'dark';
      host.early();
      expect(host.root.dataset.theme).toBeUndefined();
      expect(host.colorScheme.content).toBe('light dark');
    }
    const host = themeHost('dark');
    host.access.readBlocked = true;
    expect(() => host.early()).not.toThrow();
    expect(host.root.dataset.theme).toBeUndefined();
    expect(host.colorScheme.content).toBe('light dark');
  });
  it('loads the early script synchronously before the application with a native light fallback', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const early = html.match(/<script\b[^>]*src="\/theme\.js"[^>]*>/)?.[0];
    expect(early).toBeDefined();
    expect(early).not.toMatch(/\b(?:defer|async|module)\b/);
    expect(html.indexOf(early!)).toBeLessThan(html.indexOf('src="/src/main.ts"'));
    expect(html).toContain('<meta name="color-scheme" content="light dark"');
  });
});
