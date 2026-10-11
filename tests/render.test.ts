import { describe, expect, it } from 'vitest';
import { paintSoil } from '../src/render/soilColors';
import { Material } from '../src/sim/materials';
import { formatAntTime } from '../src/sim/time';

describe('soil colours', () => {
  it('draws wet soil darker than dry soil of the same kind', () => {
    const material = new Uint8Array([Material.loam, Material.loam]);
    const out = new Uint8ClampedArray(8);
    // Same cell index matters for the grain jitter, so paint each moisture at index 0.
    paintSoil(material.subarray(0, 1), new Uint8Array([0]), out.subarray(0, 4));
    paintSoil(material.subarray(0, 1), new Uint8Array([255]), out.subarray(4, 8));
    expect(out[4]!).toBeLessThan(out[0]!);
    expect(out[3]).toBe(255);
  });
});

describe('formatAntTime', () => {
  it('shows minutes and seconds, then hours', () => {
    expect(formatAntTime(0)).toBe('0 min 00 s');
    expect(formatAntTime(20 * 65)).toBe('1 min 05 s');
    expect(formatAntTime(20 * 3725)).toBe('1 h 02 min 05 s');
  });
});
