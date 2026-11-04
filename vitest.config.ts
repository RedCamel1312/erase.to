import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'web/tests/**/*.test.ts', 'cli/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
