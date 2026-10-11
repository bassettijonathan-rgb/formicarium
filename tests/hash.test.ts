import { describe, expect, it } from 'vitest';
import { hashState } from '../src/sim/hash';
import { Rng } from '../src/sim/rng';
import { expectDeterministic } from './helpers';

describe('hashState', () => {
  it('ignores object key order but not array order', () => {
    expect(hashState({ a: 1, b: 2 })).toBe(hashState({ b: 2, a: 1 }));
    expect(hashState([1, 2])).not.toBe(hashState([2, 1]));
  });

  it('sees single-bit differences in typed arrays', () => {
    const a = new Float32Array([0.1, 0.2, 0.3]);
    const b = new Float32Array(a);
    new Uint32Array(b.buffer)[1]! ^= 1; // flip the lowest mantissa bit of b[1]
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('distinguishes types that hold the same bytes', () => {
    expect(hashState(new Uint32Array([1]))).not.toBe(hashState(new Int32Array([1])));
    expect(hashState('1')).not.toBe(hashState(1));
  });

  it('rejects class instances and functions', () => {
    expect(() => hashState(new Rng(0))).toThrow();
    expect(() => hashState({ f: () => 0 })).toThrow();
  });
});

describe('determinism harness', () => {
  // A toy simulation: random walkers. tests/world.test.ts runs the real one.
  function walkers(seed: number) {
    const rng = new Rng(seed);
    const x = new Float64Array(50);
    const y = new Float64Array(50);
    for (let step = 0; step < 1000; step++) {
      for (let i = 0; i < x.length; i++) {
        x[i]! += rng.normal(0, 0.01);
        y[i]! += rng.normal(0, 0.01);
      }
    }
    return { x, y, rng: rng.state };
  }

  it('same seed, same hash; different seed, different hash', () => {
    expectDeterministic(walkers);
  });
});
