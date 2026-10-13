import { describe, expect, it } from 'vitest';
import { AntState, Place } from '../src/sim/ants';
import { createArena } from '../src/sim/arena';
import { BroodStage, addBrood } from '../src/sim/brood';
import { hashState } from '../src/sim/hash';
import { type LoggedCommand, applyCommand, createTank, replayTank } from '../src/sim/keeper';
import { mouldAt, updateMould } from '../src/sim/mould';
import { AT_A_WOUND, type Piece, agePieces, assembly, edible, makeInsect } from '../src/sim/prey';
import { SAVE_VERSION, loadWorld } from '../src/sim/save';
import { TANK_ARENA } from '../src/sim/tank';
import { type World, createWorld, placeInsect, step } from '../src/sim/world';

/** A lab colony in the keeper's bare 40 x 30 cm arena, its foragers all out for protein (`hungry`) or for sugar. */
function labColony(seed: number, hungry = true, ants = 40): World {
  const world = createWorld(seed, { nest: 'lab', ants });
  world.arena = createArena(TANK_ARENA.width, TANK_ARENA.height);
  if (hungry) world.ants.seekProtein.fill(1);
  return world;
}

const mass = (pieces: Piece[]) => pieces.reduce((sum, p) => sum + p.mass, 0);

function run(world: World, minutes: number, each?: () => void): void {
  for (let s = 0; s < minutes * 60 * 20; s++) {
    step(world);
    each?.();
  }
}

describe('feeder insects (DESIGN.md 3.4, B6)', () => {
  it('come as a keeper buys them: a 1 mg fly, a 40 mg cricket, a 120 mg mealworm, with their parts joined', () => {
    expect(mass(makeInsect(1, 0, 1, 'fly', 'whole', 50, 50))).toBeCloseTo(1, 6);
    const cricket = makeInsect(1, 0, 1, 'cricket', 'whole', 50, 50);
    expect(mass(cricket)).toBeCloseTo(40, 6);
    expect(cricket.map((p) => p.part).sort()).toEqual(['abdomen', 'head', 'hindLeg', 'hindLeg', 'leg', 'leg', 'leg', 'leg', 'thorax']);
    expect(assembly(cricket, cricket[3]!)).toHaveLength(9);
    expect(cricket.every((p) => p.cuts === 0)).toBe(true);
    expect(mass(makeInsect(1, 0, 1, 'mealworm', 'whole', 50, 50))).toBeCloseTo(120, 6);
    // Juice is the soft part: what is not skin.
    for (const p of cricket) expect(p.juice).toBeLessThan(p.mass);
    // The same seed and moment give the same insect; another moment, another pose.
    expect(hashState(makeInsect(1, 0, 1, 'cricket', 'whole', 50, 50))).toBe(hashState(cricket));
    expect(hashState(makeInsect(1, 5, 1, 'cricket', 'whole', 50, 50))).not.toBe(hashState(cricket));
  });

  it('cut in two has one joint cut, with a wound each side; in pieces every part is free and cut', () => {
    const halved = makeInsect(1, 0, 1, 'cricket', 'halved', 50, 50);
    const abdomen = halved.find((p) => p.part === 'abdomen')!;
    const thorax = halved.find((p) => p.part === 'thorax')!;
    expect(abdomen.joint).toBe(-1);
    expect([abdomen.cuts, thorax.cuts]).toEqual([1, 1]);
    expect(assembly(halved, thorax)).toHaveLength(8);
    const pieces = makeInsect(1, 0, 1, 'mealworm', 'pieces', 50, 50);
    expect(pieces.every((p) => p.joint === -1 && p.cuts >= 1)).toBe(true);
    // The pieces lie a little apart.
    expect(Math.hypot(pieces[0]!.x - pieces[6]!.x, pieces[0]!.y - pieces[6]!.y)).toBeGreaterThan(25);
  });

  it('a fruit fly is carried home whole by the forager that finds it, laying no trail', () => {
    const world = labColony(2);
    const [id] = placeInsect(world, 'fly', 'whole', 60, 150);
    let carriers = 0;
    run(world, 15, () => {
      for (let i = 0; i < world.ants.count; i++) if (world.ants.pieceHeld[i] === id && world.ants.state[i] === AntState.returning) carriers = Math.max(carriers, 1);
    });
    expect(carriers).toBe(1);
    // Taken into the lab nest and eaten there.
    expect(world.prey).toHaveLength(0);
    expect(world.arena.trail.every((v) => v === 0)).toBe(true);
  });

  it('a cricket has its legs bitten off and carried home, is drunk at its wounds, and draws a trail and a crowd', () => {
    const world = labColony(1);
    placeInsect(world, 'cricket', 'whole', 80, 150);
    let most = 0;
    let wounded = 0;
    run(world, 30, () => {
      let at = 0;
      for (let i = 0; i < world.ants.count; i++) if (world.ants.state[i] === AntState.atPrey) at++;
      most = Math.max(most, at);
      const body = world.prey.filter((p) => p.place === Place.arena && p.carriedBy < 0);
      // Never more drinking than its wounds allow.
      let drinking = 0;
      for (let i = 0; i < world.ants.count; i++) if (world.ants.state[i] === AntState.atPrey && world.ants.foodId[i]! >= 0) drinking++;
      wounded = Math.max(wounded, body.reduce((n, p) => n + p.cuts, 0));
      expect(drinking).toBeLessThanOrEqual(AT_A_WOUND * body.reduce((n, p) => n + p.cuts, 0));
    });
    const left = world.prey.filter((p) => p.place === Place.arena);
    expect(left.some((p) => p.part === 'leg' || p.part === 'hindLeg')).toBe(false);
    expect(left.map((p) => p.part).sort()).toEqual(['abdomen', 'head', 'thorax']);
    expect(wounded).toBeGreaterThanOrEqual(6);
    expect(most).toBeGreaterThanOrEqual(10);
    let trail = 0;
    for (const v of world.arena.trail) trail += v;
    expect(trail).toBeGreaterThan(100);
  }, 120_000);

  it('is passed by foragers out for sugar in a colony with no hungry brood', () => {
    const world = labColony(1, false);
    placeInsect(world, 'cricket', 'whole', 40, 150);
    run(world, 10, () => {
      for (let i = 0; i < world.ants.count; i++) expect(world.ants.state[i]).not.toBe(AntState.atPrey);
    });
    expect(mass(world.prey)).toBeCloseTo(40, 6);
  }, 60_000);

  it("is taken to the brood in the farm, drunk there, and its husk carried out to the arena", () => {
    const world = createTank(3);
    for (let s = 0; s < 1800 * 20; s++) step(world);
    const q = world.ants.count - 1;
    for (let k = 0; k < 12; k++) addBrood(world.brood, BroodStage.larva, world.ants.x[q]! + (k % 4) - 1.5, world.ants.y[q]! + Math.floor(k / 4) - 1);
    const [fly] = placeInsect(world, 'fly', 'whole', 60, 140);
    let inFarm = false;
    let drunk = false;
    let out = false;
    for (let s = 0; s < 6 * 3600 * 20 && !out; s++) {
      step(world);
      const p = world.prey.find((r) => r.id === fly);
      if (!p) break;
      if (p.place === Place.farm && p.carriedBy < 0) inFarm = true;
      if (inFarm && !edible(p)) drunk = true;
      if (drunk && p.place === Place.arena && p.carriedBy < 0) out = true;
    }
    expect([inFarm, drunk, out]).toEqual([true, true, true]);
  }, 300_000);

  it('goes mouldy if left uneaten, and in the damp nest feeds mould as a corpse does', () => {
    const world = createWorld(1, { ants: 0, params: { mould: true } });
    const [a] = placeInsect(world, 'cricket', 'pieces', 100, 100);
    const piece = world.prey.find((p) => p.id === a)!;
    piece.place = Place.farm;
    piece.x = 151;
    piece.y = 151;
    for (let t = 0; t < 4 * world.params.daySeconds; t += 10) {
      agePieces(world, 10);
      updateMould(world.farm, world.ants, world.params, 10, world.prey);
    }
    expect(world.prey.every((p) => p.mouldy)).toBe(true);
    expect(mouldAt(world.farm, 151, 151)).toBeGreaterThan(0.5);
  });

  it('is refused on a stone, cleared by Clear food, and its husks and mouldy pieces taken out by Clean', () => {
    const world = createTank(2);
    const stone = world.decor.find((d) => d.kind === 'stone')!;
    applyCommand(world, { type: 'insect', insect: 'cricket', cut: 'whole', x: stone.x, y: stone.y });
    expect(world.prey).toHaveLength(0);
    applyCommand(world, { type: 'insect', insect: 'mealworm', cut: 'pieces', x: 300, y: 60 });
    world.prey[0]!.juice = 0;
    world.prey[1]!.mouldy = true;
    applyCommand(world, { type: 'clean' });
    expect(world.prey).toHaveLength(5);
    applyCommand(world, { type: 'clearFood' });
    expect(world.prey).toHaveLength(0);
  });

  it('moves with a feeding dish it lies in', () => {
    const world = createWorld(1, { nest: 'lab', ants: 0 });
    world.arena = createArena(TANK_ARENA.width, TANK_ARENA.height);
    applyCommand(world, { type: 'put', item: 'dish', x: 200, y: 150, concentration: 1 });
    applyCommand(world, { type: 'insect', insect: 'fly', cut: 'whole', x: 202, y: 150 });
    applyCommand(world, { type: 'move', index: 0, x: 250, y: 100 });
    expect(Math.hypot(world.prey[0]!.x - 250, world.prey[0]!.y - 100)).toBeLessThan(4);
  });

  it('replays exactly, and a tank saved before insects loads with none', () => {
    const log: LoggedCommand[] = [
      { step: 5, command: { type: 'insect', insect: 'cricket', cut: 'halved', x: 60, y: 160 } },
      { step: 9, command: { type: 'insect', insect: 'fly', cut: 'whole', x: 70, y: 140 } },
    ];
    expect(hashState(replayTank(4, log, 600))).toBe(hashState(replayTank(4, log, 600)));
    const world = createTank(4);
    const raw = structuredClone(world) as Partial<World>;
    delete raw.prey;
    const ants = raw.ants as unknown as Record<string, unknown>;
    delete ants.pieceHeld;
    delete ants.preyId;
    const loaded = loadWorld({ version: SAVE_VERSION, seed: 4, savedAt: 0, log: [], world: raw as World })!;
    expect(loaded.prey).toEqual([]);
    expect(Array.from(loaded.ants.pieceHeld).every((v) => v === -1)).toBe(true);
  });
});
