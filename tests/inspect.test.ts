import { describe, expect, it } from 'vitest';
import { AntState, Caste } from '../src/sim/ants';
import { hashState } from '../src/sim/hash';
import { inspectAnt } from '../src/sim/inspect';
import { createTank } from '../src/sim/keeper';
import { killAnt, step } from '../src/sim/world';

describe('the ant inspector', () => {
  // Half an hour of a keeper's tank: the colony digs, forages and shares food.
  const world = createTank(2);
  for (let i = 0; i < 30 * 60 * 20; i++) step(world);
  const { ants } = world;
  const workers = [...Array(ants.count).keys()].filter((i) => ants.caste[i] === Caste.worker);

  it('only reads the world', () => {
    const before = hashState(world);
    for (let i = 0; i < ants.count; i++) inspectAnt(world, i);
    expect(hashState(world)).toBe(before);
  });

  it('says what every ant is doing and how it is', () => {
    for (let i = 0; i < ants.count; i++) {
      const card = inspectAnt(world, i);
      expect(card.doing.length).toBeGreaterThan(3);
      expect(card.lines.some((l) => l.startsWith('Crop '))).toBe(true);
    }
    const queen = ants.caste.indexOf(Caste.queen);
    expect(inspectAnt(world, queen).title).toBe('The queen');
    expect(inspectAnt(world, queen).lines.some((l) => l.startsWith('Protein in her body'))).toBe(true);
    const card = inspectAnt(world, workers[0]!);
    expect(card.title).toBe(`Worker ${workers[0]}`);
    expect(card.lines[0]).toMatch(/^Age .*was in the tank from the start\.$/);
  });

  it('keeps each worker’s life so far: digging, sharing food, trips out', () => {
    const total = (a: ArrayLike<number>) => workers.reduce((sum, i) => sum + a[i]!, 0);
    expect(total(ants.dug)).toBeGreaterThan(100);
    expect(total(ants.gave)).toBeGreaterThan(0);
    expect(total(ants.trips)).toBeGreaterThan(0);
    const digger = workers.reduce((a, b) => (ants.dug[b]! > ants.dug[a]! ? b : a));
    expect(inspectAnt(world, digger).lines.at(-2)).toContain(`${ants.dug[digger]} grains of soil dug or cleared`);
  });

  it('keeps how each ant spends its time, every step of its life counted once', () => {
    for (const i of workers) {
      if (ants.state[i] === AntState.dead) continue;
      const spent =
        ants.timeOut[i]! + ants.timeResting[i]! + ants.timeAbout[i]! + ants.timeDigging[i]! +
        ants.timeBrood[i]! + ants.timeSharing[i]! + ants.timeDead[i]!;
      expect(spent).toBe(world.step);
    }
    const foragers = workers.filter((i) => ants.trips[i]! > 0);
    expect(foragers.length).toBeGreaterThan(0);
    for (const i of foragers) expect(ants.timeOut[i]).toBeGreaterThan(0);
    const line = inspectAnt(world, foragers[0]!).lines.at(-1)!;
    expect(line).toMatch(/^Its time: \d+% .*foraging or on its way/);
  });

  it('tells how a dead ant died', () => {
    const copy = structuredClone(world);
    const i = workers.find((k) => copy.ants.state[k] !== AntState.dead)!;
    killAnt(copy, i);
    const card = inspectAnt(copy, i);
    expect(card.doing).toBe('dead');
    expect(card.lines[0]).toMatch(/^Died of the keeper’s hand at .* old, 0\.0 days ago\.$/);
  });
});
