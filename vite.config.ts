import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // On Windows, a terminal that starts in `c:\...` (lowercase drive letter, as VS Code does) makes the default
    // pool load Vitest twice under two path spellings, and every test file then fails with
    // "Cannot read properties of undefined (reading 'config')". This pool loads everything through Vite's own
    // module graph and is not affected.
    pool: 'vmThreads',
  },
});
