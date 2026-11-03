import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    // Never start draw.io from a test.
    env: { DGM_NO_OPEN: '1' },
  },
});
