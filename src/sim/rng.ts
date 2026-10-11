/**
 * Seeded random numbers (DESIGN.md section 10, principle 4 in section 0).
 *
 * The generator is xoshiro128** (Blackman & Vigna 2018): four 32-bit words of
 * state, 32-bit output, period 2^128 − 1, and only 32-bit integer operations,
 * so it is fast and bit-identical in every JavaScript engine.
 *
 * Every random stream in the simulation is derived from a tuple of integers,
 * for example (tank seed, Purpose.soil).
 * Two streams with different tuples are statistically independent, and a
 * stream never depends on which worker ran it or in what order.
 */

/** Murmur3's 32-bit finalizer: a bijective mix with good avalanche. */
export function mix32(x: number): number {
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hashes a tuple of integers into one 32-bit seed. Order matters. */
export function hashInts(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`hashInts expects integers, got ${v}`);
    // Fold in the low and high 32 bits so ids above 2^32 still differ.
    const lo = v >>> 0;
    const hi = Math.floor(v / 0x1_0000_0000) >>> 0;
    h = mix32((h ^ lo) + 0x9e3779b9);
    h = mix32((h ^ hi) + 0x7f4a7c15);
  }
  return h;
}

/** Named purposes, so streams for different jobs never collide. */
export const Purpose = {
  /** Generating the soil when a tank is set up. */
  soil: 1,
  /** The running simulation's main stream, saved in the world. */
  sim: 2,
  test: 99,
} as const;

/** The generator's state: plain data, so it can be saved, hashed and copied. */
export type RngState = Uint32Array;

const TWO_POW_32 = 0x1_0000_0000;

export class Rng {
  readonly state: RngState;

  /** Seeds from a tuple of integers, e.g. `new Rng(seed, Purpose.soil)`. */
  constructor(...seedTuple: number[]) {
    this.state = new Uint32Array(4);
    // SplitMix-style expansion of one hash into four words.
    let h = hashInts(...seedTuple);
    for (let i = 0; i < 4; i++) {
      h = (h + 0x9e3779b9) >>> 0;
      this.state[i] = mix32(h);
    }
    // xoshiro must not start from the all-zero state.
    if ((this.state[0]! | this.state[1]! | this.state[2]! | this.state[3]!) === 0) this.state[0] = 1;
  }

  /** Rebuilds a generator from a saved state. */
  static fromState(state: ArrayLike<number>): Rng {
    const rng = new Rng(0);
    rng.state.set(state);
    return rng;
  }

  /** Next 32-bit unsigned integer. */
  nextU32(): number {
    const s = this.state;
    const s0 = s[0]!;
    const s1 = s[1]!;
    const s2 = s[2]!;
    const s3 = s[3]!;
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    const n2 = s2 ^ s0;
    const n3 = s3 ^ s1;
    s[1] = s1 ^ n2;
    s[0] = s0 ^ n3;
    s[2] = n2 ^ t;
    s[3] = rotl(n3, 11);
    return result;
  }

  /** Uniform in [0, 1) with 53 bits of precision. */
  float(): number {
    const hi = this.nextU32() >>> 5; // 27 bits
    const lo = this.nextU32() >>> 6; // 26 bits
    return (hi * 67108864 + lo) / 9007199254740992;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** Uniform integer in [0, n), without modulo bias. */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > TWO_POW_32) throw new Error(`int(n) needs 1 ≤ n ≤ 2^32, got ${n}`);
    const limit = TWO_POW_32 - (TWO_POW_32 % n);
    for (;;) {
      const x = this.nextU32();
      if (x < limit) return x % n;
    }
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Standard normal (Box–Muller; uses Math.log/cos, so bit-identical only within one engine). */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    while (u === 0) u = this.float();
    const v = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** A new independent generator derived from this one's next outputs. */
  fork(): Rng {
    return new Rng(this.nextU32(), this.nextU32());
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}
