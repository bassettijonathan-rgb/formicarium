import { describe, expect, it } from 'vitest';
import { AntState, Place } from '../src/sim/ants';
import { BroodStage, addBrood, createBrood, stepBrood } from '../src/sim/brood';
import { agePrey, mouldAt, updateMould } from '../src/sim/mould';
import { type AntParams } from '../src/sim/params';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { addCorpse, createWorld, placeProtein, placeSugar, step, type World } from '../src/sim/world';

const MOULD: Partial<AntParams> = { mould: true };

/** Lets mould grow in `w`'s farm for `days` tank days, as the world does: every 10 s of ant time. Corpses age meanwhile. */
function grow(w: World, days: number): void {
  const { ants, params } = w;
  for (let t = 0; t < days * params.daySeconds; t += 10) {
    for (let i = 0; i < ants.count; i++) if (ants.state[i] === AntState.dead) ants.deadFor[i]! += 10 / params.daySeconds;
    updateMould(w.farm, ants, params, 10);
  }
}

/** A farm with no ants and one corpse lying in it, dead `deadFor` tank days. */
function withCorpse(deadFor: number, params: Partial<AntParams> = MOULD): { w: World; k: number } {
  const w = createWorld(1, { ants: 0, params });
  const k = addCorpse(w, Place.farm, 151, 151, deadFor);
  return { w, k };
}

describe('mould (M5b)', () => {
  it('with mould off, nothing grows on a corpse', () => {
    const { w } = withCorpse(5, {});
    grow(w, 2);
    expect(w.farm.mouldy).toBe(0);
  });

  it('a corpse left in the damp nest grows mould that reaches about a cm round it', () => {
    const { w } = withCorpse(3);
    grow(w, 2);
    const { farm, params } = w;
    expect(mouldAt(farm, 151, 151)).toBeGreaterThan(0.9);
    expect(mouldAt(farm, 151 + 6, 151)).toBeGreaterThan(params.mouldHarm);
    expect(mouldAt(farm, 151 + 30, 151)).toBeLessThan(0.01);
  });

  it('a fresh corpse grows no mould until it has lain long enough', () => {
    const { w } = withCorpse(0);
    grow(w, 0.95 * w.params.corpseMouldDays);
    expect(w.farm.mouldy).toBe(0);
    grow(w, 0.1 * w.params.corpseMouldDays);
    expect(w.farm.mouldy).toBeGreaterThan(0);
  });

  it('no mould grows in dry air', () => {
    const { w } = withCorpse(3);
    w.farm.humidity.fill(0.6);
    grow(w, 2);
    expect(w.farm.mouldy).toBe(0);
  });

  it('warmth makes it grow faster', () => {
    const cool = withCorpse(3).w;
    const warm = withCorpse(3).w;
    warm.farm.temperature.fill(35);
    grow(cool, 0.5);
    grow(warm, 0.5);
    expect(warm.farm.mouldy).toBeGreaterThan(1.5 * cool.farm.mouldy);
  });

  it('once the corpse is carried off, the mould dies back', () => {
    const { w, k } = withCorpse(3);
    grow(w, 2);
    const thick = w.farm.mouldy;
    w.ants.place[k] = Place.arena;
    grow(w, 5);
    expect(w.farm.mouldy).toBeLessThan(0.15 * thick);
    grow(w, 30);
    expect(w.farm.mouldy).toBe(0);
  });

  it('brood lying in mould dies in about a tank day; brood clear of it lives', () => {
    const { w } = withCorpse(3, { ...MOULD, developmentZero: 1e9 });
    grow(w, 2);
    const { farm, params } = w;
    const b = createBrood();
    addBrood(b, BroodStage.larva, 152, 151);
    addBrood(b, BroodStage.pupa, 151 + 40, 151);
    for (let t = 0; t < 0.9 * params.mouldKillDays * params.daySeconds; t += 2) stepBrood(b, farm, params, 2);
    expect(b.stage[0]).toBe(BroodStage.larva);
    for (let t = 0; t < 0.2 * params.mouldKillDays * params.daySeconds; t += 2) stepBrood(b, farm, params, 2);
    expect(b.stage[0]).toBe(BroodStage.none);
    expect(b.stage[1]).toBe(BroodStage.pupa);
    expect(b.moulded).toBe(1);
  });

  it('a nurse picks up brood lying in mould sooner', () => {
    const picked = { mould: 0, clean: 0 };
    for (const where of ['mould', 'clean'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const w = createWorld(seed, { ants: 1, params: { broodPickRate: 0.01 } });
        const { ants, brood, farm } = w;
        for (let y = 140; y < 150; y++) for (let x = 140; x < 160; x++) farm.material[y * farm.width + x] = 0;
        if (where === 'mould') {
          // A patch of mould over the chamber, held where it is (mould is off, so it neither grows nor fades).
          for (let fy = 68; fy < 77; fy++) for (let fx = 68; fx < 82; fx++) farm.mould[fy * farm.fieldWidth + fx] = 0.5;
          farm.mouldy = 1;
        }
        addBrood(brood, BroodStage.pupa, 150, 145);
        ants.x[0] = 150;
        ants.y[0] = 145;
        ants.state[0] = AntState.resting;
        ants.timer[0] = 1e6;
        for (let s = 0; s < 30 * STEPS_PER_SECOND && ants.state[0] !== AntState.carryingBrood; s++) step(w);
        if (ants.state[0] === AntState.carryingBrood) picked[where]++;
      }
    }
    expect(picked.mould).toBeGreaterThan(picked.clean + 4);
  }, 120_000);

  it('an insect left in the arena goes mouldy after a couple of days; sugar water does not', () => {
    const w = createWorld(1, { ants: 0, params: MOULD });
    placeSugar(w, 50, 50, 10, 1);
    placeProtein(w, 80, 50, 10);
    const { params } = w;
    // The room is at 25 °C here, so the insect's days count at their face value.
    agePrey(w.food, params, 0.9 * params.preyMouldDays * params.daySeconds);
    expect(w.food[1]!.mouldy).toBe(false);
    agePrey(w.food, params, 0.2 * params.preyMouldDays * params.daySeconds);
    expect(w.food[1]!.mouldy).toBe(true);
    expect(w.food[0]!.mouldy).toBe(false);
  });

  it('ants do not take a mouldy insect', () => {
    const drunk = { fresh: 0, mouldy: 0 };
    for (const kind of ['fresh', 'mouldy'] as const) {
      const w = createWorld(1, { ants: 20, nest: 'lab', params: MOULD });
      const y = w.arena.entranceY;
      const id = placeProtein(w, 30, y, 10);
      // A starved colony, all after protein.
      for (let i = 0; i < w.ants.count; i++) w.ants.seekProtein[i] = 1;
      if (kind === 'mouldy') w.food.find((d) => d.id === id)!.mouldy = true;
      for (let s = 0; s < 1200 * STEPS_PER_SECOND; s++) step(w);
      drunk[kind] = 10 - (w.food.find((d) => d.id === id)?.volume ?? 0);
    }
    expect(drunk.fresh).toBeGreaterThan(0);
    expect(drunk.mouldy).toBe(0);
  }, 120_000);

  it('mould grows on a corpse lying in the farm\'s corner', () => {
    const w = createWorld(1, { ants: 0, params: MOULD });
    addCorpse(w, Place.farm, 1, w.farm.height - 1, 3);
    grow(w, 1);
    expect(w.farm.mould[(w.farm.fieldHeight - 1) * w.farm.fieldWidth]).toBeGreaterThan(0.5);
  });
});
