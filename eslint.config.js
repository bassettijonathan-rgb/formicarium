import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Simulation code must be deterministic and must not touch the browser
 * (DESIGN.md section 0). It runs unchanged in the worker, in Node and in tests.
 */
const simRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded Rng (src/sim/rng.ts).' },
    { object: 'Date', property: 'now', message: 'The simulation never reads the clock; use simulated time.' },
    { object: 'performance', property: 'now', message: 'The simulation never reads the clock; use simulated time.' },
  ],
  'no-restricted-syntax': [
    'error',
    { selector: "NewExpression[callee.name='Date']", message: 'The simulation never reads the clock; use simulated time.' },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'window', message: 'No browser code in the simulation.' },
    { name: 'document', message: 'No browser code in the simulation.' },
    { name: 'self', message: 'No browser code in the simulation.' },
    { name: 'setTimeout', message: 'Use simulated time, not real time.' },
    { name: 'setInterval', message: 'Use simulated time, not real time.' },
  ],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['**/render/*', '**/worker/*', '**/main', 'pixi.js'], message: 'Simulation code cannot import the page or workers.' },
      ],
    },
  ],
};

/** The simulation: everything under src/sim/. */
const simFiles = ['src/sim/**/*.ts'];

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: simFiles, rules: simRules },
);
