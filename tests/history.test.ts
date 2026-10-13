import { describe, expect, it } from 'vitest';
import { MAX_CENSUSES, MAX_FRAMES, census, nestPicture } from '../src/sim/history';
import { createTank } from '../src/sim/keeper';
import { Material } from '../src/sim/materials';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { step } from '../src/sim/world';

describe('the colony history', () => {
  it('takes a census every tenth of a tank day and a picture of the sand farm\'s nest every 5 minutes', () => {
    const world = createTank(1, null);
    for (let i = 0; i < 12 * 60 * STEPS_PER_SECOND; i++) step(world);
    const h = world.history;
    expect(h.censuses.map((c) => c.step)).toEqual([7200, 14400]);
    expect(h.frameSteps).toEqual([6000, 12000]);
    const last = h.censuses.at(-1)!;
    expect(last.workers).toBe(60);
    expect(last.activity.reduce((a, b) => a + b, 0)).toBe(last.workers);
  }, 60_000);

  it('takes no pictures of a bought nest, which keeps its shape', () => {
    const world = createTank(1);
    for (let i = 0; i < 6 * 60 * STEPS_PER_SECOND; i++) step(world);
    expect(world.history.censuses).toHaveLength(1);
    expect(world.history.frames).toHaveLength(0);
  }, 60_000);

  it('thins itself as it grows: a few hundred entries, evenly spaced, however old the tank', () => {
    const world = createTank(1, null);
    world.history.every = 1;
    world.history.frameEvery = 1;
    for (let i = 0; i < 2 * MAX_CENSUSES + 50; i++) step(world);
    const h = world.history;
    expect(h.censuses.length).toBeLessThanOrEqual(MAX_CENSUSES);
    expect(h.censuses.length).toBeGreaterThan(MAX_CENSUSES / 2);
    expect(h.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
    expect(h.frames.length).toBeGreaterThan(MAX_FRAMES / 2);
    for (const steps of [h.censuses.map((c) => c.step), h.frameSteps]) {
      const gaps = new Set(steps.slice(1).map((s, n) => s - steps[n]!));
      expect(gaps.size).toBe(1);
    }
    expect(h.every).toBe(4);
    expect(h.frameEvery).toBe(8);
    expect(h.frames).toHaveLength(h.frameSteps.length);
  }, 60_000);

  it('pictures the nest one bit per cell, set where the farm is solid', () => {
    const { farm } = createTank(2);
    const bits = nestPicture(farm);
    let set = 0;
    for (const b of bits) for (let k = 0; k < 8; k++) set += (b >> k) & 1;
    expect(set).toBe(farm.material.filter((m) => m !== Material.air).length);
  });

  it('counts the colony for the graphs', () => {
    const c = census(createTank(3));
    expect(c.workers).toBe(60);
    expect(c.fat).toBeGreaterThan(0);
    expect(c.activity).toHaveLength(7);
  });
});
