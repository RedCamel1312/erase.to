import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

type Merge = (
  target: unknown,
  source: unknown,
  options?: { arrayMerge: (target: unknown[], source: unknown[]) => unknown[] },
) => Record<string, unknown>;

// Resolve from the actual consumer rather than testing an unrelated direct dependency.
const pluginRequire = createRequire(import.meta.resolve('@sveltejs/vite-plugin-svelte'));
const packageDirectory = dirname(pluginRequire.resolve('deepmerge/package.json'));
const dependency = pluginRequire('deepmerge/package.json') as { name: string; version: string };
const esm = await import(pathToFileURL(join(packageDirectory, 'dist/index.js')).href);
const entrypoints: [string, Merge][] = [
  ['Vite plugin ESM dependency', esm.default as Merge],
  ['published CommonJS entrypoint', pluginRequire('deepmerge') as Merge],
];
const malicious = () => JSON.parse('{"__proto__":{"syntheticMarker":true}}') as unknown;

it('resolves the published replacement from the actual Svelte plugin', () => {
  expect(dependency.name).toBe('@stackline/deepmerge');
  expect(dependency.version).toBe('1.1.0');
});

it('preserves the plugin configuration pipeline with the replacement installed', async () => {
  const optionsUrl = new URL(
    './utils/options.js',
    import.meta.resolve('@sveltejs/vite-plugin-svelte'),
  );
  const { preResolveOptions } = await import(optionsUrl.href);
  const preprocess = [{ script: () => undefined }];
  const onwarn = () => undefined;
  const include = /\.svelte$/;
  const options = await preResolveOptions(
    { configFile: false, compilerOptions: { dev: false }, preprocess, onwarn, include },
    { root: process.cwd() },
    { command: 'build', mode: 'production' },
  );
  expect(options.compilerOptions).toEqual({ dev: false });
  expect(options.preprocess).toBe(preprocess);
  expect(options.onwarn).toBe(onwarn);
  expect(options.include).toBe(include);
  expect(options.emitCss).toBe(true);
  expect(options.isBuild).toBe(true);
});

describe.each(entrypoints)('%s prototype-poisoning regression', (_label, merge) => {
  it('does not give a null-prototype target an attacker-controlled prototype', () => {
    const result = merge(Object.create(null), malicious());
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.syntheticMarker).toBeUndefined();
    expect(Object.hasOwn(result, '__proto__')).toBe(false);
  });

  it.each([null, undefined, 1, false])(
    'rejects poisoning below a %s placeholder',
    (placeholder) => {
      const result = merge({ nested: placeholder }, { nested: malicious() });
      const nested = result.nested as Record<string, unknown>;
      expect(Object.getPrototypeOf(nested)).toBe(Object.prototype);
      expect(nested.syntheticMarker).toBeUndefined();
    },
  );

  it('does not copy an own __proto__ key from the target, including nested targets', () => {
    const direct = merge(malicious(), {});
    const nested = merge({ nested: malicious() }, {}).nested as Record<string, unknown>;
    for (const result of [direct, nested]) {
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(result.syntheticMarker).toBeUndefined();
    }
    expect(Object.hasOwn(Object.prototype, 'syntheticMarker')).toBe(false);
  });

  it('preserves the Svelte plugin merge behavior for arrays, functions and compiler options', () => {
    const first = () => 'first';
    const second = () => 'second';
    const onwarn = () => undefined;
    const pattern = /\.svelte$/;
    const original = {
      compilerOptions: { dev: true, css: 'external' },
      preprocess: [first],
      onwarn,
      pattern,
    };
    const override = { compilerOptions: { dev: false }, preprocess: [second] };
    const result = merge(original, override, { arrayMerge: (target, source) => source ?? target });
    expect(result.compilerOptions).toEqual({ dev: false, css: 'external' });
    expect(result.preprocess).toBe(override.preprocess);
    expect(result.onwarn).toBe(onwarn);
    expect(result.pattern).toBe(pattern);
    expect(original.preprocess).toEqual([first]);
    expect(original.compilerOptions.dev).toBe(true);
  });
});
