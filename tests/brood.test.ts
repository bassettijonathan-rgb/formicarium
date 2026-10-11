import { describe, expect, it } from 'vitest';
import { AntState, Caste, Place } from '../src/sim/ants';
import { BroodStage, addBrood, broodCounts, createBrood, scentBrood, stageRate, stepBrood } from '../src/sim/brood';
import { addToField, sampleField, updateField } from '../src/sim/farm';
import { Material } from '../src/sim/materials';
import { type AntParams, DEFAULT_ANT_PARAMS } from '../src/sim/params';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { createWorld, placeProtein, placeSugar, step, type World } from '../src/sim/world';
import { expectDeterministic } from './helpers';

function run(w: World, seconds: number): void {
  for (let s = 0; s < seconds * STEPS_PER_SECOND; s++) step(w);
}

const params = (p: Partial<AntParams> = {}): AntParams => ({ ...DEFAULT_ANT_PARAMS, ...p });

describe('brood development', () => {
  it('runs on degree-days: the stated days at 25 °C, twice as long halfway to the development zero, none below it', () => {
    const p = params();
    expect(stageRate(p.eggDays, p) * p.eggDays).toBeCloseTo(1, 12);
    const half = params({ nestTemperature: (25 + p.developmentZero) / 2 });
    expect(stageRate(p.eggDays, half)).toBeCloseTo(stageRate(p.eggDays, p) / 2, 12);
    expect(stageRate(p.eggDays, params({ nestTemperature: p.developmentZero - 1 }))).toBe(0);
  });

  it('turns an egg into a larva after eggDays, and a fed larva into a pupa after larvaDays', () => {
    const p = params();
    const b = createBrood();
    addBrood(b, BroodStage.egg, 10, 10);
    stepBrood(b, p, p.eggDays * p.daySeconds * 0.99);
    expect(b.stage[0]).toBe(BroodStage.egg);
    stepBrood(b, p, p.eggDays * p.daySeconds * 0.02);
    expect(b.stage[0]).toBe(BroodStage.larva);
    b.food[0] = p.larvaFood;
    for (let d = 0; d < p.larvaDays * 1.01; d += 0.01) stepBrood(b, p, 0.01 * p.daySeconds);
    expect(b.stage[0]).toBe(BroodStage.pupa);
  });

  it('an unfed larva does not grow, and one fed half its food gets half way', () => {
    const p = params();
    const b = createBrood();
    addBrood(b, BroodStage.larva, 10, 10);
    addBrood(b, BroodStage.larva, 20, 10);
    b.food[1] = p.larvaFood / 2;
    for (let d = 0; d < p.larvaDays * 2; d += 0.1) stepBrood(b, p, 0.1 * p.daySeconds);
    expect(b.progress[0]).toBe(0);
    expect(b.progress[1]).toBeCloseTo(0.5, 9);
    expect(broodCounts(b)).toEqual({ eggs: 0, larvae: 2, pupae: 0 });
  });

  it('reuses the slot of a hatched item', () => {
    const b = createBrood();
    addBrood(b, BroodStage.egg, 1, 1);
    addBrood(b, BroodStage.egg, 2, 2);
    b.stage[0] = BroodStage.none;
    expect(addBrood(b, BroodStage.egg, 3, 3)).toBe(0);
    expect(b.count).toBe(2);
  });

  it('only hungry larvae give off brood scent', () => {
    const w = createWorld(1, { ants: 0 });
    const b = createBrood();
    addBrood(b, BroodStage.larva, 50, 100);
    addBrood(b, BroodStage.larva, 200, 100);
    b.food[1] = w.params.larvaFood;
    addBrood(b, BroodStage.egg, 120, 100);
    scentBrood(b, w.farm, w.params, 2);
    expect(sampleField(w.farm, w.farm.broodScent, 50, 100)).toBeGreaterThan(0);
    expect(sampleField(w.farm, w.farm.broodScent, 200, 100)).toBe(0);
    expect(sampleField(w.farm, w.farm.broodScent, 120, 100)).toBe(0);
  });
});

/** A short life clock so tests cover days of development in seconds of ant time. */
const FAST = { daySeconds: 60 } as const;

describe('the queen', () => {
  function withQueen(p: Partial<AntParams> = {}): { w: World; q: number } {
    const w = createWorld(3, { ants: 4, queen: true, params: { ...FAST, ...p } });
    const q = w.ants.count - 1;
    expect(w.ants.caste[q]).toBe(Caste.queen);
    return { w, q };
  }

  it('lays from her reserve, about layRate eggs a day, and none once it is spent', () => {
    const { w, q } = withQueen({ queenReserve: 1 });
    w.ants.state[q] = AntState.resting;
    w.ants.timer[q] = 1e9;
    run(w, 10 * w.params.daySeconds);
    const laid = broodCounts(w.brood).eggs + broodCounts(w.brood).larvae;
    expect(laid).toBeGreaterThan(0.6 * 10 * w.params.layRate);
    expect(laid).toBeLessThan(1.4 * 10 * w.params.layRate);

    const empty = withQueen({ queenReserve: 0 });
    empty.w.ants.state[empty.q] = AntState.resting;
    empty.w.ants.timer[empty.q] = 1e9;
    run(empty.w, 2 * empty.w.params.daySeconds);
    expect(empty.w.brood.count).toBe(0);
  });

  it('never leaves the farm, never digs and never feeds a nestmate', () => {
    const { w, q } = withQueen({ forageThresholdMin: 0.01, forageThresholdMax: 0.01, burnRate: 0, begRate: 50 });
    const { ants } = w;
    ants.crop[q] = w.params.cropLoad;
    for (let i = 0; i < q; i++) {
      ants.crop[i] = 0;
      ants.x[i] = ants.x[q]! + 0.5 * (i + 1);
      ants.y[i] = ants.y[q]!;
    }
    for (let s = 0; s < 120 * STEPS_PER_SECOND; s++) {
      step(w);
      expect(ants.place[q]).toBe(Place.farm);
      expect(ants.state[q]).not.toBe(AntState.carrying);
    }
    expect(ants.crop[q]).toBe(w.params.cropLoad);
  });

  it('gives off brood scent while she is short of protein, and none once fed', () => {
    const hungry = withQueen({ queenReserve: 0 });
    const fed = withQueen({ queenReserve: 0.1 });
    for (const { w, q } of [hungry, fed]) {
      w.ants.state[q] = AntState.resting;
      w.ants.timer[q] = 1e9;
      w.params.layRate = 0;
      run(w, 5);
    }
    const at = ({ w, q }: { w: World; q: number }) => sampleField(w.farm, w.farm.broodScent, w.ants.x[q]!, w.ants.y[q]!);
    expect(at(hungry)).toBeGreaterThan(0);
    expect(at(fed)).toBe(0);
  });

  it('is fed protein by the workers touching her while she is short of it, and not once she has enough', () => {
    const short = withQueen({ queenReserve: 0, layRate: 0, burnRate: 0, begRate: 0 });
    const fed = withQueen({ queenReserve: 0.1, layRate: 0, burnRate: 0, begRate: 0 });
    for (const { w, q } of [short, fed]) {
      const { ants } = w;
      ants.state[q] = AntState.resting;
      ants.timer[q] = 1e9;
      ants.state[0] = AntState.resting;
      ants.timer[0] = 1e9;
      ants.x[0] = ants.x[q]! + 1;
      ants.y[0] = ants.y[q]!;
      ants.crop[0] = 0.1;
      ants.cropProtein[0] = 0.1;
      run(w, 10);
    }
    const got = short.w.ants.reserve[short.q]! + short.w.ants.cropProtein[short.q]!;
    expect(got).toBeGreaterThan(0);
    expect(got).toBeCloseTo(0.1 - short.w.ants.cropProtein[0]!, 12);
    expect(fed.w.ants.cropProtein[0]).toBe(0.1);
  });

  it('stores protein she is fed up to queenReserveMax and leaves the rest in her crop', () => {
    const { w, q } = withQueen({ queenReserve: 0, layRate: 0, burnRate: 0 });
    w.ants.state[q] = AntState.resting;
    w.ants.timer[q] = 1e9;
    w.ants.crop[q] = w.params.cropLoad;
    w.ants.cropProtein[q] = w.params.cropLoad;
    w.params.queenReserveMax = 0.05;
    run(w, 1);
    expect(w.ants.reserve[q]).toBeCloseTo(0.05, 12);
    expect(w.ants.cropProtein[q]).toBeCloseTo(w.params.cropLoad - 0.05, 12);
  });
});

describe('nurses', () => {
  /** One worker resting on top of a brood item. */
  function nurse(stage: BroodStage): World {
    const w = createWorld(5, { ants: 1, params: { ...FAST, burnRate: 0 } });
    w.ants.state[0] = AntState.resting;
    w.ants.timer[0] = 1e9;
    addBrood(w.brood, stage, w.ants.x[0]!, w.ants.y[0]!);
    return w;
  }

  it('feed a hungry larva protein from the crop, and nothing is lost', () => {
    const w = nurse(BroodStage.larva);
    w.ants.crop[0] = 0.1;
    w.ants.cropProtein[0] = 0.1;
    run(w, 5);
    expect(w.brood.food[0]! + w.brood.progress[0]! * w.params.larvaFood).toBeCloseTo(0.1 - w.ants.cropProtein[0]!, 9);
    expect(w.brood.food[0]! + w.brood.progress[0]! * w.params.larvaFood).toBeGreaterThan(0);
    expect(w.ants.crop[0]).toBeCloseTo(w.ants.cropProtein[0]!, 12);
  });

  it('cannot feed a larva from sugar alone', () => {
    const w = nurse(BroodStage.larva);
    w.ants.crop[0] = 0.1;
    run(w, 30);
    expect(w.brood.food[0]).toBe(0);
    expect(w.brood.progress[0]).toBe(0);
  });

  it('eat a larva that has gone unfed for larvaStarveDays, and take its protein back', () => {
    const w = nurse(BroodStage.larva);
    w.params.broodPickRate = 0;
    w.ants.crop[0] = 0;
    w.brood.progress[0] = 0.5;
    w.brood.unfed[0] = w.params.larvaStarveDays * w.params.daySeconds * 0.99;
    run(w, 0.02 * w.params.larvaStarveDays * w.params.daySeconds);
    expect(w.brood.stage[0]).toBe(BroodStage.none);
    expect(w.ants.cropProtein[0]).toBeCloseTo(0.5 * w.params.larvaFood, 12);
  });

  it('help a ready pupa out of its cocoon: a new worker appears and the pupa is gone', () => {
    const w = nurse(BroodStage.pupa);
    w.brood.progress[0] = 1;
    run(w, 1);
    expect(w.ants.count).toBe(2);
    expect(w.ants.caste[1]).toBe(Caste.worker);
    expect(w.ants.place[1]).toBe(Place.farm);
    expect(w.brood.stage[0]).toBe(BroodStage.none);
  });
});

describe('a colony with a queen', () => {
  it('is deterministic', () => {
    expectDeterministic((seed) => {
      const w = createWorld(seed, { ants: 10, queen: true, params: FAST });
      run(w, 3 * 60);
      return w;
    });
  });
});

describe('foragers out for one kind of food', () => {
  /** One ant in the arena, exploring, a few mm from a sugar drop and an insect on either side. */
  function arena(seekProtein: number): World {
    const w = createWorld(9, { ants: 1, params: { ...FAST, burnRate: 0 } });
    const { ants } = w;
    ants.place[0] = Place.arena;
    ants.state[0] = AntState.exploring;
    ants.x[0] = 100;
    ants.y[0] = 100;
    ants.heading[0] = 0;
    ants.seekProtein[0] = seekProtein;
    placeSugar(w, 104, 100, 10, 1);
    placeProtein(w, 100, 130, 10);
    return w;
  }
  const drank = (w: World) => ({ sugar: 10 - w.food[0]!.volume, protein: 10 - w.food[1]!.volume });

  it('one out for sugar drinks the sugar in front of it', () => {
    const w = arena(0);
    run(w, 70); // drinking takes `feedTime`
    expect(drank(w).sugar).toBeGreaterThan(0);
    expect(w.ants.cropProtein[0]).toBe(0);
  });

  it('one out for protein passes the sugar by', () => {
    const w = arena(1);
    run(w, 70);
    expect(drank(w).sugar).toBe(0);
  });

  it('one out for sugar takes prey it comes on only if it feels the brood\'s hunger', () => {
    const prey = (need: number): World => {
      const w = arena(0);
      w.food = w.food.filter((d) => d.protein > 0); // no sugar on its way, the insect in front of it
      w.food[0]!.x = 104;
      w.food[0]!.y = 100;
      w.ants.broodNeed[0] = need;
      w.params.needHalfLife = 1e9;
      run(w, 70);
      return w;
    };
    expect(prey(0.9).ants.cropProtein[0]).toBeGreaterThan(0);
    expect(prey(0).ants.cropProtein[0]).toBe(0);
  });

  it('one giving up and going home empty takes the prey it walks into', () => {
    const w = arena(1);
    w.food = w.food.filter((d) => d.protein > 0);
    w.food[0]!.x = 96; // on its way home
    w.food[0]!.y = 100;
    w.ants.state[0] = AntState.homing;
    w.ants.heading[0] = Math.PI;
    w.ants.piX[0] = 100 - w.arena.entranceX;
    w.ants.piY[0] = 100 - w.arena.entranceY;
    run(w, 70);
    expect(w.ants.cropProtein[0]).toBeGreaterThan(0);
  });
});

describe('the brood drives foraging for protein', () => {
  /** Twenty well-fed, keen foragers; `scent` fills the farm with the smell of hungry larvae. */
  function trips(scent: number): { out: number; forProtein: number } {
    const w = createWorld(2, { ants: 20, params: { burnRate: 0 } });
    w.ants.crop.fill(w.params.cropLoad);
    w.ants.forageThreshold.fill(w.params.forageThresholdMin);
    w.farm.broodScent.fill(scent);
    let out = 0;
    let forProtein = 0;
    const wasIn = new Uint8Array(w.ants.count).fill(1);
    for (let s = 0; s < 1200 * STEPS_PER_SECOND; s++) {
      step(w);
      for (let i = 0; i < w.ants.count; i++) {
        const isIn = w.ants.place[i] === Place.farm ? 1 : 0;
        if (wasIn[i] && !isIn) {
          out++;
          if (w.ants.seekProtein[i]) forProtein++;
        }
        wasIn[i] = isIn;
      }
    }
    return { out, forProtein };
  }

  it('a worker passes the feeling on to the nestmates it touches, weakened', () => {
    const w = createWorld(4, { ants: 2, params: { burnRate: 0, forageRate: 0, returnToFoodRate: 0 } });
    const { ants } = w;
    ants.x[1] = ants.x[0]! + 1;
    ants.y[1] = ants.y[0]!;
    ants.state.fill(AntState.resting);
    ants.timer.fill(1e9);
    ants.broodNeed[0] = 1;
    step(w);
    expect(ants.broodNeed[1]).toBeCloseTo(w.params.needRelay, 2);
    expect(ants.broodNeed[0]).toBeGreaterThan(0.99);
  });

  it('fed workers that smell hungry larvae go out, and go out for protein', () => {
    const none = trips(0);
    const brood = trips(100);
    expect(none.forProtein).toBe(0);
    expect(brood.out).toBeGreaterThan(2 * none.out);
    expect(brood.forProtein).toBeGreaterThan(brood.out / 2);
  }, 30_000);
});

describe('the nest round the queen', () => {
  it('a wandering ant out in the open goes back to the hole it came out of', () => {
    const w = createWorld(6, { ants: 1, params: { forageRate: 0, returnToFoodRate: 0, restRate: 0 } });
    const { ants } = w;
    ants.state[0] = AntState.wandering;
    ants.x[0] = 150;
    ants.y[0] = 25; // in the headspace, above the soil
    ants.heading[0] = 0; // facing away from the hole
    ants.piX[0] = 0;
    ants.piY[0] = 0;
    ants.holeX[0] = -30;
    ants.holeY[0] = 0;
    ants.hasHole[0] = 1;
    run(w, 4);
    expect(ants.x[0]).toBeLessThan(135);
  });

  /** A world whose ants are shut in a 20 x 8 mm chamber dug in the soil, with nothing to do but rest. */
  function chamber(ants: number, p: Partial<AntParams> = {}, queen = false): World {
    const w = createWorld(7, { ants, queen, params: { forageRate: 0, returnToFoodRate: 0, digRate: 0, ...p } });
    const { farm } = w;
    for (let y = 100; y < 108; y++) for (let x = 140; x < 160; x++) farm.material[y * farm.width + x] = Material.air;
    for (let i = 0; i < w.ants.count; i++) {
      w.ants.state[i] = AntState.wandering;
      w.ants.x[i] = 141 + (i % 18);
      w.ants.y[i] = 104;
    }
    return w;
  }

  it('workers settle sooner on brood: the nest forms round it', () => {
    const resting = (w: World) => w.ants.state.filter((s) => s === AntState.resting).length;
    const bare = chamber(20);
    const brood = chamber(20, { broodPickRate: 0 });
    for (let x = 141; x < 160; x += 2) addBrood(brood.brood, BroodStage.egg, x, 104);
    run(bare, 10);
    run(brood, 10);
    expect(resting(brood)).toBeGreaterThan(15);
    expect(resting(bare)).toBeLessThan(10);
  });

  it('a worker carrying protein settles only by the brood', () => {
    const resting = (w: World) => w.ants.state.filter((s) => s === AntState.resting).length;
    const setUp = (protein: number, brood: boolean): World => {
      const w = chamber(20, { broodPickRate: 0, restRate: 1, burnRate: 0, begRate: 0 });
      for (let i = 0; i < 20; i++) {
        w.ants.crop[i] = 0.1;
        w.ants.cropProtein[i] = protein;
      }
      if (brood) for (let x = 141; x < 160; x += 2) addBrood(w.brood, BroodStage.egg, x, 104);
      run(w, 10);
      return w;
    };
    expect(resting(setUp(0, false))).toBeGreaterThan(10);
    expect(resting(setUp(0.05, false))).toBe(0);
    expect(resting(setUp(0.05, true))).toBeGreaterThan(10);
  });

  it('a brood carrier puts its load down by the queen, and keeps it where there is neither her nor other brood', () => {
    const carrier = (queen: boolean): World => {
      const w = chamber(1, { speed: 0, restRate: 0 }, queen);
      const k = addBrood(w.brood, BroodStage.egg, 150, 104);
      w.brood.carried[k] = 1;
      w.ants.state[0] = AntState.carryingBrood;
      w.ants.broodHeld[0] = k;
      w.ants.x[0] = 150;
      if (queen) {
        const q = w.ants.count - 1;
        w.ants.x[q] = 152;
        w.ants.state[q] = AntState.resting;
        w.ants.timer[q] = 1e9;
      }
      run(w, 20);
      return w;
    };
    const byQueen = carrier(true);
    expect(byQueen.ants.state[0]).not.toBe(AntState.carryingBrood);
    expect(byQueen.brood.carried[0]).toBe(0);
    const alone = carrier(false);
    expect(alone.ants.state[0]).toBe(AntState.carryingBrood);
  });

  it('the queen settles among the larvae, and only reluctantly where there are none', () => {
    /** In how many of 20 farms the queen has lain down within a minute (12 of 20 if she settled like a worker). */
    const settled = (brood: boolean): number => {
      let n = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const w = createWorld(seed, { ants: 1, queen: true, params: { forageRate: 0, returnToFoodRate: 0, broodPickRate: 0 } });
        const { farm, ants } = w;
        for (let y = 100; y < 108; y++) for (let x = 140; x < 160; x++) farm.material[y * farm.width + x] = Material.air;
        ants.place[0] = Place.arena; // the worker stays out of the way
        const q = ants.count - 1;
        ants.state[q] = AntState.wandering;
        ants.x[q] = 150;
        ants.y[q] = 104;
        if (brood) for (let x = 141; x < 160; x += 2) addBrood(w.brood, BroodStage.larva, x, 104);
        for (let s = 0; s < 60 * STEPS_PER_SECOND && ants.state[q] !== AntState.resting; s++) step(w);
        if (ants.state[q] === AntState.resting) n++;
      }
      return n;
    };
    expect(settled(true)).toBeGreaterThanOrEqual(18);
    expect(settled(false)).toBeLessThanOrEqual(5);
  });

  it('spoil is never dropped over the tube mouth, where it could bury the way out', () => {
    const drops = (dx: number): boolean => {
      const w = createWorld(1, { ants: 1, params: { speed: 0, spoilDistance: 0, dropRate: 100, maxCarryTime: 1e6 } });
      const { ants, farm } = w;
      ants.state[0] = AntState.carrying;
      ants.grain[0] = Material.sand;
      ants.x[0] = farm.tubeX - dx;
      ants.y[0] = 5;
      run(w, 5);
      return ants.state[0] !== AntState.carrying;
    };
    expect(drops(5)).toBe(false);
    expect(drops(60)).toBe(true);
  });

  it('a worker carrying protein for the brood clears debris from a tunnel, but does not dig new ground', () => {
    /** Whether a lone worker at the end of a tunnel picks up a grain within 20 s. */
    const digs = (protein: number, loose: boolean): boolean => {
      const w = createWorld(3, { ants: 1, params: { forageRate: 0, returnToFoodRate: 0, restRate: 0, burnRate: 0, begRate: 0, crowdControl: false } });
      const { ants, farm } = w;
      // A short dead-end tunnel deep in the soil, its end plugged by a grain that fell in (or by firm soil).
      for (let x = 140; x < 150; x++) for (let y = 120; y < 122; y++) farm.material[y * farm.width + x] = Material.air;
      for (let y = 120; y < 122; y++) {
        farm.material[y * farm.width + 150] = Material.sand;
        farm.loose[y * farm.width + 150] = loose ? 1 : 0;
      }
      ants.state[0] = AntState.wandering;
      ants.x[0] = 148.5;
      ants.y[0] = 121;
      ants.heading[0] = 0;
      ants.crop[0] = protein;
      ants.cropProtein[0] = protein;
      for (let s = 0; s < 20 * STEPS_PER_SECOND; s++) {
        step(w);
        if (ants.state[0] === AntState.carrying) return true;
      }
      return false;
    };
    expect(digs(0.05, true)).toBe(true);
    expect(digs(0.05, false)).toBe(false);
    expect(digs(0, false)).toBe(true);
  });

  it('an ant whose hole has been buried under spoil digs it open again', () => {
    /** Seconds until the ant first picks up a grain of the spoil, or Infinity. */
    const digsIn = (remember: boolean): number => {
      const w = createWorld(6, { ants: 1, params: { forageRate: 0, returnToFoodRate: 0, restRate: 0 } });
      const { ants, farm } = w;
      const top = farm.surface[150]!;
      // Level, firm ground with a shaft into it, the shaft's mouth buried under three rows of loose spoil.
      for (let y = top; y < top + 12; y++) {
        for (let x = 130; x < 170; x++) farm.material[y * farm.width + x] = x >= 149 && x < 152 ? Material.air : Material.loam;
      }
      for (let y = top - 3; y < top; y++) {
        for (let x = 140; x < 160; x++) {
          farm.material[y * farm.width + x] = Material.sand;
          farm.loose[y * farm.width + x] = 1;
        }
      }
      ants.state[0] = AntState.wandering;
      ants.x[0] = 150.5;
      ants.y[0] = top - 4.5;
      ants.heading[0] = Math.PI / 2;
      ants.piX[0] = 0;
      ants.piY[0] = 0;
      ants.holeX[0] = 0;
      ants.holeY[0] = 4;
      ants.hasHole[0] = remember ? 1 : 0;
      for (let s = 0; s < 30 * STEPS_PER_SECOND; s++) {
        step(w);
        if (ants.state[0] === AntState.carrying) return s / STEPS_PER_SECOND;
      }
      return Infinity;
    };
    expect(digsIn(true)).toBeLessThan(10);
    expect(digsIn(false)).toBe(Infinity);
  });

  it('smells spread along tunnels and through the open, not through soil', () => {
    const w = createWorld(1, { ants: 0 });
    const { farm } = w;
    // A spot in the headspace, and one the same distance below it inside solid soil.
    addToField(farm, farm.odour, 150, 40, 100);
    for (let s = 0; s < 30; s++) updateField(farm, farm.odour, 2, 1e9, 1, true);
    expect(sampleField(farm, farm.odour, 150, 30)).toBeGreaterThan(0);
    expect(sampleField(farm, farm.odour, 150, 60)).toBe(0);
  });

  it('smells seep through loose sand, so a chamber walled off by fallen debris can still be smelt', () => {
    const smellBelow = (loose: boolean): number => {
      const w = createWorld(1, { ants: 0 });
      const { farm } = w;
      const top = farm.surface[150]!;
      // A shaft from the open down to a chamber, plugged by a few rows of grains.
      for (let y = top; y < top + 30; y++) for (let x = 148; x < 152; x++) farm.material[y * farm.width + x] = Material.air;
      for (let y = top + 6; y < top + 10; y++) {
        for (let x = 148; x < 152; x++) {
          farm.material[y * farm.width + x] = Material.sand;
          farm.loose[y * farm.width + x] = loose ? 1 : 0;
        }
      }
      addToField(farm, farm.odour, 150, top + 25, 100);
      for (let s = 0; s < 60; s++) updateField(farm, farm.odour, 2, 1e9, 1, true);
      return sampleField(farm, farm.odour, 150, top + 2);
    };
    expect(smellBelow(true)).toBeGreaterThan(0);
    expect(smellBelow(false)).toBe(0);
  });

  it('the resting queen leaves more colony odour than a resting worker', () => {
    const odourAt = (queen: boolean): number => {
      const w = createWorld(1, { ants: 1, queen, params: { forageRate: 0, returnToFoodRate: 0 } });
      const { ants, farm } = w;
      const i = ants.count - 1;
      for (let j = 0; j < ants.count; j++) ants.place[j] = Place.arena;
      ants.place[i] = Place.farm;
      ants.state[i] = AntState.resting;
      ants.timer[i] = 1e9;
      ants.x[i] = 150;
      ants.y[i] = 30;
      run(w, 10);
      return sampleField(farm, farm.odour, 150, 30);
    };
    expect(odourAt(true)).toBeGreaterThan(10 * odourAt(false));
  });
});
