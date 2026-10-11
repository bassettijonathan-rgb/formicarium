import { expect } from 'vitest';
import { hashHex, hashState } from '../src/sim/hash';

/**
 * Runs `run` twice with the same seed and checks the resulting state hashes
 * match, and that a different seed gives a different hash. Every simulation
 * milestone adds a call to this with its own run function.
 */
export function expectDeterministic(run: (seed: number) => unknown, seed = 42): void {
  const a = hashHex(hashState(run(seed)));
  const b = hashHex(hashState(run(seed)));
  expect(b, 'same seed must give the same state').toBe(a);
  const c = hashHex(hashState(run(seed + 1)));
  expect(c, 'a different seed should give a different state').not.toBe(a);
}
