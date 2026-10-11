import { describe, expect, it } from 'vitest';
import { AntState, Place } from '../src/sim/ants';
import { cellSolid, excavatedArea } from '../src/sim/farm';
import { Material } from '../src/sim/materials';
import { placeGrain } from '../src/sim/soil';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { createWorld, step, type World } from '../src/sim/world';
import { expectDeterministic } from './helpers';

const MINUTE = 60 * STEPS_PER_SECOND;

function run(w: World, steps: number): void {
  for (let s = 0; s < steps; s++) step(w);
}

/** Soil cells in the farm plus grains held in mandibles. */
function grains(w: World): number {
  let n = 0;
  for (const m of w.farm.material) if (m !== Material.air) n++;
  for (let i = 0; i < w.ants.count; i++) if (w.ants.state[i] === AntState.carrying) n++;
  return n;
}

describe('a colony in the farm', () => {
  it('is deterministic', () => {
    expectDeterministic((seed) => {
      const w = createWorld(seed, { ants: 40 });
      run(w, 10 * MINUTE);
      return w;
    });
  }, 60_000);

  it('starts on the soil surface', () => {
    const w = createWorld(3, { ants: 30 });
    for (let i = 0; i < w.ants.count; i++) {
      expect(w.ants.place[i]).toBe(Place.farm);
      expect(cellSolid(w.farm, Math.floor(w.ants.x[i]!), Math.floor(w.ants.y[i]!))).toBe(false);
    }
  });

  it('digs, and never creates or destroys a grain', () => {
    const w = createWorld(4, { ants: 60 });
    const before = grains(w);
    run(w, 30 * MINUTE);
    expect(excavatedArea(w.farm)).toBeGreaterThan(200);
    expect(grains(w)).toBe(before);
  }, 60_000);

  it('carries the spoil out: most loose grains end up above the original surface', () => {
    const w = createWorld(5, { ants: 60 });
    run(w, 60 * MINUTE);
    const { farm } = w;
    let above = 0;
    let below = 0;
    for (let x = 0; x < farm.width; x++) {
      for (let y = 0; y < farm.height; y++) {
        if (!farm.loose[y * farm.width + x]) continue;
        if (y < farm.surface[x]!) above++;
        else below++;
      }
    }
    expect(above).toBeGreaterThan(below);
  }, 60_000);

  it('digs more per ant in a group than alone (social facilitation, Chen 1937)', () => {
    const perAnt = (ants: number) => {
      let total = 0;
      for (const seed of [1, 2]) {
        const w = createWorld(seed, { ants });
        run(w, 60 * MINUTE);
        total += excavatedArea(w.farm) / ants;
      }
      return total / 2;
    };
    expect(perAnt(5)).toBeLessThan(0.25 * perAnt(40));
  }, 120_000);

  it('a buried ant pushes its way out', () => {
    const w = createWorld(6, { ants: 1 });
    const { farm, ants } = w;
    const cx = Math.floor(ants.x[0]!);
    const cy = Math.floor(ants.y[0]!);
    for (let dy = -2; dy <= 0; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (!cellSolid(farm, cx + dx, cy + dy)) placeGrain(farm, cx + dx, cy + dy, Material.loam, 120);
    }
    expect(cellSolid(farm, cx, cy)).toBe(true);
    run(w, 5);
    expect(cellSolid(farm, Math.floor(ants.x[0]!), Math.floor(ants.y[0]!))).toBe(false);
  });
});
