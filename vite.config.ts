import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { open: false },
  // three.js is most of the bundle (~600 kB, ~160 kB gzipped); it loads in one go anyway.
  build: { chunkSizeWarningLimit: 700 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
