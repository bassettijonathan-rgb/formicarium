import { describe, expect, it } from 'vitest';
import { Material, MATERIAL_COUNT } from '../src/sim/materials';
import { FARM_HEIGHT, FARM_WIDTH, HEADSPACE } from '../src/sim/tank';
import { createWorld, step } from '../src/sim/world';
import { expectDeterministic } from './helpers';

describe('a new tank', () => {
  const { farm } = createWorld(7);
  const at = (x: number, y: number) => y * farm.width + x;

  it('is deterministic: same seed, same tank', () => {
    expectDeterministic((seed) => {
      const w = createWorld(seed);
      for (let i = 0; i < 200; i++) step(w);
      return w;
    });
  });

  it('has air under the lid and soil below a slightly uneven surface', () => {
    expect(farm.width).toBe(FARM_WIDTH);
    expect(farm.height).toBe(FARM_HEIGHT);
    for (let x = 0; x < farm.width; x++) {
      const s = farm.surface[x]!;
      expect(Math.abs(s - HEADSPACE)).toBeLessThanOrEqual(3);
      for (let y = 0; y < farm.height; y++) {
        const isAir = farm.material[at(x, y)] === Material.air;
        expect(isAir, `cell (${x}, ${y}) with surface at ${s}`).toBe(y < s);
      }
    }
    expect(Math.max(...farm.surface)).toBeGreaterThan(Math.min(...farm.surface));
  });

  it('mixes all three soils, mostly loam', () => {
    const counts = new Array<number>(MATERIAL_COUNT).fill(0);
    for (const m of farm.material) counts[m]!++;
    const soil = counts[Material.sand]! + counts[Material.loam]! + counts[Material.clay]!;
    expect(counts[Material.sand]! / soil).toBeGreaterThan(0.05);
    expect(counts[Material.clay]! / soil).toBeGreaterThan(0.05);
    expect(counts[Material.loam]! / soil).toBeGreaterThan(0.4);
  });

  it('is wetter at the bottom than near the surface, and clay holds more water than sand', () => {
    const meanMoisture = (y0: number, y1: number) => {
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < farm.width; x++) {
          sum += farm.moisture[at(x, y)]!;
          n++;
        }
      }
      return sum / n;
    };
    expect(meanMoisture(FARM_HEIGHT - 30, FARM_HEIGHT)).toBeGreaterThan(meanMoisture(HEADSPACE + 5, HEADSPACE + 35) + 40);

    const byMaterial = (m: Material) => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < farm.material.length; i++) {
        if (farm.material[i] !== m) continue;
        sum += farm.moisture[i]!;
        n++;
      }
      return sum / n;
    };
    expect(byMaterial(Material.clay)).toBeGreaterThan(byMaterial(Material.sand));
  });

  it('keeps air dry', () => {
    for (let i = 0; i < farm.material.length; i++) if (farm.material[i] === Material.air) expect(farm.moisture[i]).toBe(0);
  });
});

describe('step', () => {
  it('advances ant time by one step', () => {
    const w = createWorld(1);
    step(w);
    step(w);
    expect(w.step).toBe(2);
  });
});
