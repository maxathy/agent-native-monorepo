import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // An empty run must never be reported as a pass. The nightly eval depends on
    // these files actually being collected.
    passWithNoTests: false,
  },
});
