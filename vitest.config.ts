import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  resolve: {
    conditions: ['browser'],
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/lib/test-utils.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        'src/**/*.{test,spec}.{js,ts}',
        'src/lib/test-utils.ts',
        '**/*.d.ts',
        'playwright.config.ts',
        'svelte.config.js',
        'vite.config.ts',
        'vitest.config.ts',
      ],
    },
  },
});
