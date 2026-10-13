import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works under GitHub Pages' /formicarium/ path.
  base: './',
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    // Several rule tests run a few seconds of simulation (3-4 s alone); on a CI runner busy with the
    // science tests they can pass vitest's 5 s default. The long experiments set their own timeouts.
    testTimeout: 30_000,
  },
});
