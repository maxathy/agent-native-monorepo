import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * `test:unit` used to collect every unit test twice — 46 tests where 23 are
     * distinct, once from `src/agent/graph/edges.test.ts` and again from the
     * compiled `dist/agent/graph/edges.test.js`.
     *
     * Two things combine to produce that. `tsc --build` emits test files
     * because they are inside `rootDir`, and Vitest 4's `defaultExclude` is
     * `['**\/node_modules/**', '**\/.git/**']`, which no longer covers `dist`.
     * The package had no config at all, so nothing narrowed it.
     *
     * It wastes time, and it could report a stale compiled copy as a pass — the
     * two copies happen to agree at HEAD, which is luck, not a property.
     *
     * Naming `src` is the fix rather than excluding `dist`, because it also
     * rules out anything else that lands beside it. Keeping test files out of
     * `rootDir` is the alternative, and would additionally stop shipping them
     * in the image; it is a bigger change to the build than this PRD owns.
     */
    include: ['src/**/*.test.ts'],
  },
});
