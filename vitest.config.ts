import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/services/**/*.ts', 'src/hooks/**/*.ts'],
      exclude: ['src/lib/i18n.hi.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
      },
    },
  },
});
