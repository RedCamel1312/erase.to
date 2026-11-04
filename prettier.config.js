/** @type {import('prettier').Config} */
export default {
  plugins: ['prettier-plugin-svelte'],
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  endOfLine: 'lf',
  overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }],
};
