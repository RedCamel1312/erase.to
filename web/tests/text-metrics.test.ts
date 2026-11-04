import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextMetrics } from '../src/lib/text-metrics.ts';
afterEach(() => {
  vi.useRealTimers();
});
describe('large draft measurements', () => {
  it('matches UTF-8 replacement and surrogate rules without an encoded allocation', () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const metrics = new TextMetrics(report);
    const text = 'a'.repeat(65535) + '🔒\né\uD800\uDC00\uDFFF\uD800';
    metrics.update(text);
    expect(report).toHaveBeenCalledWith({ bytes: 0, lines: 1, pending: true });
    vi.runAllTimers();
    expect(report).toHaveBeenLastCalledWith({
      bytes: new TextEncoder().encode(text).length,
      lines: 2,
      pending: false,
    });
    metrics.destroy();
  });
  it('yields while measuring an eight-MiB draft and never reports cancelled content', () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const metrics = new TextMetrics(report);
    metrics.update('a'.repeat(8 * 1024 * 1024));
    expect(report).toHaveBeenLastCalledWith({ bytes: 0, lines: 1, pending: true });
    metrics.update('new\ndraft');
    vi.runAllTimers();
    expect(report).toHaveBeenLastCalledWith({ bytes: 9, lines: 2, pending: false });
    metrics.update('b'.repeat(8 * 1024 * 1024));
    metrics.clear();
    vi.runAllTimers();
    expect(report).toHaveBeenLastCalledWith({ bytes: 0, lines: 1, pending: false });
    expect(vi.getTimerCount()).toBe(0);
  });
});
