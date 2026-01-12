import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/renderer/**/*.ts'],
      exclude: ['src/renderer/**/__tests__/**', 'src/renderer/vite-env.d.ts'],
    },
  },
});
