export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeState = { preference: ThemePreference; resolved: 'light' | 'dark' };
const STORAGE_KEY = 'erase.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function themePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function nextThemePreference(value: ThemePreference): ThemePreference {
  return value === 'system' ? 'light' : value === 'light' ? 'dark' : 'system';
}

export class ThemeController {
  private preference: ThemePreference;
  private media: MediaQueryList | null = null;
  private cleanup: (() => void)[] = [];
  private disposed = false;

  constructor(
    private changed: (state: ThemeState) => void,
    private doc: Document = document,
    private win: Window = window,
  ) {
    this.preference = this.readPreference() ?? 'system';
    try {
      if (typeof win.matchMedia === 'function') this.media = win.matchMedia(DARK_QUERY);
    } catch {
      // CSS still follows the browser preference when the scripting API is unavailable.
    }
    const systemChanged = () => {
      if (!this.disposed && this.preference === 'system') this.publish();
    };
    try {
      const media = this.media;
      if (media?.addEventListener) {
        media.addEventListener('change', systemChanged);
        this.cleanup.push(() => media.removeEventListener('change', systemChanged));
      } else if (media?.addListener) {
        media.addListener(systemChanged);
        this.cleanup.push(() => media.removeListener(systemChanged));
      }
    } catch {}
    const storedChanged = (event: StorageEvent) => {
      if (this.disposed || (event.key !== STORAGE_KEY && event.key !== null)) return;
      const preference = this.readPreference();
      if (preference !== undefined) {
        this.preference = preference;
        this.publish();
      }
    };
    win.addEventListener('storage', storedChanged);
    this.cleanup.push(() => win.removeEventListener('storage', storedChanged));
    this.publish();
  }

  private readPreference(): ThemePreference | undefined {
    try {
      return themePreference(this.win.localStorage.getItem(STORAGE_KEY));
    } catch {
      return undefined;
    }
  }

  private publish(): void {
    // Leaving the attribute absent lets CSS handle live OS changes without waiting for JS.
    if (this.preference === 'system') delete this.doc.documentElement.dataset.theme;
    else this.doc.documentElement.dataset.theme = this.preference;
    const colorScheme = this.doc.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (colorScheme)
      colorScheme.content = this.preference === 'system' ? 'light dark' : this.preference;
    let systemDark = false;
    try {
      systemDark = this.media?.matches ?? false;
    } catch {}
    this.changed({
      preference: this.preference,
      resolved: this.preference === 'system' ? (systemDark ? 'dark' : 'light') : this.preference,
    });
  }

  set(value: unknown): void {
    if (this.disposed) return;
    this.preference = themePreference(value);
    this.publish();
    try {
      if (this.preference === 'system') this.win.localStorage.removeItem(STORAGE_KEY);
      else this.win.localStorage.setItem(STORAGE_KEY, this.preference);
    } catch {
      // A blocked storage API must not prevent a choice for this page.
    }
  }

  cycle(): void {
    this.set(nextThemePreference(this.preference));
  }

  destroy(): void {
    this.disposed = true;
    for (const detach of this.cleanup) {
      try {
        detach();
      } catch {}
    }
    this.cleanup = [];
  }
}
