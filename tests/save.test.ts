import { describe, expect, it } from 'vitest';
import { Cause } from '../src/sim/ants';
import { hashState } from '../src/sim/hash';
import { type LoggedCommand, applyCommand, createTank, replayTank } from '../src/sim/keeper';
import { CATCH_UP_DAYS, type Census, SAVE_VERSION, type Save, awayReport, catchUpSteps, census, loadWorld } from '../src/sim/save';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { step, type World } from '../src/sim/world';

/** A keeper's tank run for `steps`, the keeper acting now and then; returns the tank and the keeper's log. */
function keptTank(seed: number, steps: number): { world: World; log: LoggedCommand[] } {
  const world = createTank(seed);
  const log: LoggedCommand[] = [];
  const act: Record<number, LoggedCommand['command']> = {
    0: { type: 'sugar', x: 60, y: 120, volume: 10, concentration: 0.1 },
    300: { type: 'water', x: 80 },
    700: { type: 'protein', x: 150, y: 40, volume: 3 },
    1100: { type: 'heatMat', x: 10 },
    1500: { type: 'clean' },
  };
  while (world.step < steps) {
    const c = act[world.step];
    if (c) {
      applyCommand(world, c);
      log.push({ step: world.step, command: c });
    }
    step(world);
  }
  return { world, log };
}

const save = (world: World, log: LoggedCommand[]): Save => ({ version: SAVE_VERSION, seed: world.seed, savedAt: 0, log, world });

describe('keeping a tank', () => {
  it("is rebuilt exactly from its seed and the keeper's log", () => {
    const { world, log } = keptTank(3, 2000);
    expect(log).toHaveLength(5);
    expect(hashState(replayTank(3, log, 2000))).toBe(hashState(world));
  });

  it('goes on from a saved copy exactly as it would have without being saved', () => {
    const { world, log } = keptTank(4, 1200);
    // Browser storage keeps a structured clone of the save; loading it is what the page does on reopening.
    const loaded = loadWorld(structuredClone(save(world, log)))!;
    expect(hashState(loaded)).toBe(hashState(world));
    for (let i = 0; i < 1500; i++) {
      step(world);
      step(loaded);
    }
    expect(hashState(loaded)).toBe(hashState(world));
  });

  it('loads a save from before a model was added: new state starts as in a new tank, old state is dropped', () => {
    const { world, log } = keptTank(5, 400);
    const old = structuredClone(save(world, log));
    const raw = old.world as unknown as Record<string, unknown>;
    delete (old.world.ants as unknown as Record<string, unknown>).shutIn; // added in M5c
    delete raw.diedOut;
    raw.retired = 7; // state a later model no longer has
    const loaded = loadWorld(old)!;
    expect(loaded.ants.shutIn).toHaveLength(loaded.ants.count);
    expect(loaded.diedOut).toBe(-1);
    expect('retired' in loaded).toBe(false);
    for (let i = 0; i < 200; i++) step(loaded);
  });

  it("uses the current model's parameters, not the saved ones", () => {
    const { world, log } = keptTank(6, 10);
    const old = structuredClone(save(world, log));
    old.world.params.digRate = 99;
    expect(loadWorld(old)!.params.digRate).toBe(createTank(6).params.digRate);
  });

  it('refuses a save in a format it cannot read', () => {
    const { world, log } = keptTank(7, 10);
    expect(loadWorld({ ...save(world, log), version: SAVE_VERSION + 1 })).toBeNull();
  });
});

describe('catching up on the time the tank was closed', () => {
  const world = createTank(1);
  const day = world.params.daySeconds;

  it('lives through the time away at 1×', () => {
    expect(catchUpSteps(world, 600)).toBe(600 * STEPS_PER_SECOND);
    expect(catchUpSteps(world, -5)).toBe(0);
  });

  it(`stops at ${CATCH_UP_DAYS} tank days (D7)`, () => {
    expect(catchUpSteps(world, 10 * day)).toBe(CATCH_UP_DAYS * day * STEPS_PER_SECOND);
  });
});

describe('the report of what happened while the tank was closed', () => {
  const before: Census = {
    step: 0,
    workers: 60,
    queen: true,
    everAnts: 61,
    deaths: [0, 1, 0, 0, 0, 0],
    eggs: 20,
    larvae: 10,
    pupae: 5,
    broodDried: 0,
    broodMoulded: 0,
    crops: 30,
    arenaFood: 12,
    nest: 900,
    mould: 0,
    soilWater: 0.3,
    diedOut: -1,
    fat: 0.8,
    activity: [10, 30, 15, 2, 2, 1, 0],
  };

  it('says what changed, in plain words', () => {
    const after: Census = {
      ...before,
      step: 2 * 3600 * STEPS_PER_SECOND,
      workers: 64,
      everAnts: 68,
      deaths: [0, 3, 1, 0, 0, 0],
      eggs: 14,
      larvae: 18,
      pupae: 2,
      broodMoulded: 2,
      arenaFood: 0,
      nest: 1150,
      mould: 4,
      soilWater: 0.2,
    };
    expect(awayReport(before, after, 3600)).toEqual([
      'The tank lived 2 days while it was closed.',
      '7 workers came out of the cocoon.',
      'Workers died: 2 of age, 1 of hunger.',
      'Workers: 60 then, 64 now. Brood now 14 eggs, 18 larvae and 2 pupae (was 20, 10 and 5).',
      'Mould killed 2 pieces of brood.',
      'Mould is growing in the farm.',
      'The food in the arena ran out.',
      'They dug 2.5 cm² more nest.',
      'The soil dried: 30% water then, 20% now.',
    ]);
  });

  it('tells of the end of a colony', () => {
    const after: Census = { ...before, step: 3600 * STEPS_PER_SECOND, workers: 0, queen: false, deaths: [0, 1, 60, 0, 0, 0], diedOut: 50 };
    const lines = awayReport(before, after, 3600);
    expect(lines.slice(0, 3)).toEqual(['The tank lived 1 day while it was closed.', 'The colony died out.', 'The queen died.']);
    expect(lines).toContain('Workers died: 60 of hunger.');
  });

  it('counts a real tank', () => {
    const { world } = keptTank(2, 100);
    const c = census(world);
    expect(c.workers).toBe(60);
    expect(c.queen).toBe(true);
    expect(c.deaths[Cause.hunger]).toBe(0);
    expect(c.arenaFood).toBeGreaterThan(40);
    expect(c.soilWater).toBeGreaterThan(0);
  });
});
