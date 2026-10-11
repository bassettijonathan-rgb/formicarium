import { describe, expect, it } from 'vitest';
import { Purpose, Rng, hashInts } from '../src/sim/rng';

describe('Rng (xoshiro128**)', () => {
  it('matches the reference implementation for state [1, 2, 3, 4]', () => {
    // Outputs of the reference C code by Blackman & Vigna with s = {1, 2, 3, 4}.
    const rng = Rng.fromState([1, 2, 3, 4]);
    const out = Array.from({ length: 8 }, () => rng.nextU32());
    expect(out).toEqual([11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849]);
  });

  it('gives the same sequence for the same seed tuple', () => {
    const a = new Rng(42, 3, 7, Purpose.soil);
    const b = new Rng(42, 3, 7, Purpose.soil);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('gives different streams for tuples that differ in any position or order', () => {
    const first = (...t: number[]) => new Rng(...t).nextU32();
    const base = first(42, 3, 7, Purpose.soil);
    expect(first(43, 3, 7, Purpose.soil)).not.toBe(base);
    expect(first(42, 4, 7, Purpose.soil)).not.toBe(base);
    expect(first(42, 3, 7, Purpose.sim)).not.toBe(base);
    expect(first(42, 7, 3, Purpose.soil)).not.toBe(base);
    expect(hashInts(1, 2 ** 32 + 1)).not.toBe(hashInts(1, 1));
  });

  it('can be saved and restored mid-stream', () => {
    const a = new Rng(5);
    for (let i = 0; i < 17; i++) a.nextU32();
    const b = Rng.fromState(Array.from(a.state));
    for (let i = 0; i < 100; i++) expect(b.nextU32()).toBe(a.nextU32());
  });

  it('produces floats in [0, 1) with the right mean and variance', () => {
    const rng = new Rng(1);
    const n = 100_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.float();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    // Standard error of the mean is ~0.0009; allow about 4 standard errors.
    expect(mean).toBeCloseTo(0.5, 2);
    expect(variance).toBeCloseTo(1 / 12, 2);
  });

  it('draws unbiased integers (chi-square over 10 bins)', () => {
    const rng = new Rng(2);
    const bins = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) bins[rng.int(10)]!++;
    const expected = n / 10;
    const chi2 = bins.reduce((acc, o) => acc + (o - expected) ** 2 / expected, 0);
    // 9 degrees of freedom: p = 0.001 critical value is 27.9.
    expect(chi2).toBeLessThan(27.9);
  });

  it('draws normals with mean 0 and standard deviation 1', () => {
    const rng = new Rng(3);
    const n = 100_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.normal();
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(sumSq / n - mean * mean)).toBeCloseTo(1, 1);
  });

  it('rejects invalid arguments', () => {
    const rng = new Rng(0);
    expect(() => rng.int(0)).toThrow();
    expect(() => rng.int(1.5)).toThrow();
    expect(() => hashInts(0.5)).toThrow();
  });
});
