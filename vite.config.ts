import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { open: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
