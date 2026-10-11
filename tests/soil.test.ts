import { describe, expect, it } from 'vitest';
import { type Farm, createFarm, sampleField, updateFresh } from '../src/sim/farm';
import { Material } from '../src/sim/materials';
import { Purpose, Rng } from '../src/sim/rng';
import { placeGrain, removeGrain, stepSoil } from '../src/sim/soil';

/** A farm with no soil at all, to build test scenes in. */
function emptyFarm(): Farm {
  const farm = createFarm(new Rng(1, Purpose.test));
  farm.material.fill(Material.air);
  farm.moisture.fill(0);
  farm.loose.fill(0);
  farm.falling = [];
  return farm;
}

/** Fills a rectangle with packed soil. */
function fill(farm: Farm, x0: number, y0: number, x1: number, y1: number, material: Material, moisture: number): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      farm.material[y * farm.width + x] = material;
      farm.moisture[y * farm.width + x] = moisture;
    }
  }
}

function settle(farm: Farm, rng = new Rng(2, Purpose.test)): void {
  for (let i = 0; i < 10_000 && farm.falling.length > 0; i++) stepSoil(farm, rng);
  expect(farm.falling).toHaveLength(0);
}

function soilCells(farm: Farm): number {
  let n = 0;
  for (const m of farm.material) if (m !== Material.air) n++;
  return n;
}

function looseCells(farm: Farm): number {
  let n = 0;
  for (const l of farm.loose) n += l;
  return n;
}

/** Digs a chamber `width` wide and 3 high out of a slab of `material`, from the bottom row up. */
function digChamber(material: Material, moisture: number, width: number): Farm {
  const farm = emptyFarm();
  fill(farm, 50, 50, 200, 80, material, moisture);
  for (let y = 62; y >= 60; y--) for (let x = 100; x < 100 + width; x++) removeGrain(farm, x, y);
  settle(farm);
  return farm;
}

describe('soil', () => {
  it('dry sand cannot roof a chamber: the ceiling caves in', () => {
    const farm = digChamber(Material.sand, 0, 12);
    expect(looseCells(farm)).toBeGreaterThan(12);
  });

  it('damp clay roofs a wide chamber', () => {
    const farm = digChamber(Material.clay, 200, 12);
    expect(looseCells(farm)).toBe(0);
    // The chamber is still open.
    expect(farm.material[61 * farm.width + 106]).toBe(Material.air);
  });

  it('never creates or destroys grains', () => {
    const farm = digChamber(Material.sand, 0, 20);
    expect(soilCells(farm)).toBe(150 * 30 - 20 * 3);
  });

  it('piles dry spoil at about 45° and damp spoil steeper', () => {
    const slope = (moisture: number) => {
      const farm = emptyFarm();
      fill(farm, 0, 150, farm.width, 151, Material.loam, 100);
      for (let k = 0; k < 400; k++) {
        placeGrain(farm, 150, 20, Material.loam, moisture);
        settle(farm);
      }
      // Height of the heap over its half-width at the base.
      let top = 150;
      while (farm.material[(top - 1) * farm.width + 150] !== Material.air) top--;
      let left = 150;
      while (farm.material[149 * farm.width + left - 1] !== Material.air) left--;
      let right = 150;
      while (farm.material[149 * farm.width + right + 1] !== Material.air) right++;
      return (150 - top) / ((right - left) / 2);
    };
    const dry = slope(20);
    const damp = slope(150);
    expect(dry).toBeGreaterThan(0.8);
    expect(dry).toBeLessThan(1.25);
    expect(damp).toBeGreaterThan(1.6 * dry);
  });
});

describe('fresh air', () => {
  it('is full in the open, fades along a tunnel and is absent in a sealed pocket', () => {
    const farm = emptyFarm();
    fill(farm, 0, 30, farm.width, farm.height, Material.clay, 200);
    // An L-shaped tunnel: down from the surface at x = 50, then along to x = 120.
    for (let y = 30; y < 90; y++) for (let x = 48; x < 52; x++) removeGrain(farm, x, y);
    for (let y = 86; y < 90; y++) for (let x = 52; x < 120; x++) removeGrain(farm, x, y);
    // A sealed pocket.
    for (let y = 140; y < 146; y++) for (let x = 200; x < 206; x++) removeGrain(farm, x, y);
    settle(farm);
    for (let k = 0; k < 20; k++) updateFresh(farm);
    const fresh = (x: number, y: number) => sampleField(farm, farm.fresh, x, y);
    expect(fresh(150, 10)).toBeCloseTo(1, 5);
    // A shaft straight down from the surface is open to the sky all the way.
    expect(fresh(50, 80)).toBeCloseTo(1, 5);
    expect(fresh(70, 88)).toBeLessThan(1);
    expect(fresh(80, 88)).toBeLessThan(fresh(70, 88));
    expect(fresh(110, 88)).toBeLessThan(fresh(80, 88));
    expect(fresh(110, 88)).toBeGreaterThan(0);
    expect(fresh(203, 143)).toBe(0);
  });
});
