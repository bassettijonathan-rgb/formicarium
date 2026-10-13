import { describe, expect, it } from 'vitest';
import { AntState, Place } from '../src/sim/ants';
import { type Farm, FIELD_CELL } from '../src/sim/farm';
import { hashState } from '../src/sim/hash';
import { applyCommand, createTank, replayTank } from '../src/sim/keeper';
import { Material, diggable } from '../src/sim/materials';
import { updateTemperature } from '../src/sim/heat';
import { updateMould } from '../src/sim/mould';
import { COVER_LEAK, NEST_MATERIALS, type NestMaterial, lightAt, nestWater } from '../src/sim/nest';
import { DEFAULT_ANT_PARAMS } from '../src/sim/params';
import { SAVE_VERSION, loadWorld } from '../src/sim/save';
import { addCorpse, createWorld, setHeatMat, step, type World } from '../src/sim/world';

const MATERIALS: NestMaterial[] = ['ytong', 'plaster', 'acrylic', 'wood'];
const DEFAULT_HUMIDITY = DEFAULT_ANT_PARAMS.broodHumidity;

/** Share of the nest's floor whose air is at least nearly as humid as nurses keep brood in. */
function dampShare(farm: Farm, broodHumidity: number): number {
  let n = 0;
  let damp = 0;
  for (let fy = 0; fy < farm.fieldHeight; fy++) {
    for (let fx = 0; fx < farm.fieldWidth; fx++) {
      if (farm.material[fy * FIELD_CELL * farm.width + fx * FIELD_CELL] !== Material.air) continue;
      n++;
      if (farm.humidity[fy * farm.fieldWidth + fx]! >= broodHumidity - 0.05) damp++;
    }
  }
  return damp / n;
}

function nest(material: NestMaterial, seed = 3): World {
  return createWorld(seed, { ants: 0, bought: { size: 'M', layout: 'classic', material } });
}

describe('nest materials (Nests 2)', () => {
  it('each is a hard block of its own material that ants cannot dig', () => {
    for (const material of MATERIALS) {
      const { farm } = nest(material);
      const m = NEST_MATERIALS[material].material;
      expect(farm.nest!.material).toBe(m);
      expect(diggable(m)).toBe(false);
      for (const cell of farm.material) expect(cell === Material.air || cell === m).toBe(true);
    }
    // The carving is the same whatever it is carved in.
    expect(hashState(nest('wood').farm.material.map((c) => (c ? 1 : 0)))).toBe(hashState(nest('ytong').farm.material.map((c) => (c ? 1 : 0))));
  });

  it('plaster is damp farther from its water hole than ytong, and wood less far', () => {
    const humid = DEFAULT_HUMIDITY;
    const ytong = dampShare(nest('ytong').farm, humid);
    expect(dampShare(nest('plaster').farm, humid)).toBeGreaterThan(ytong + 0.05);
    expect(dampShare(nest('wood').farm, humid)).toBeLessThan(ytong - 0.1);
  });

  it('wood holds its water unevenly along the grain', () => {
    const n = nest('wood').farm.nest!;
    // Along a line the same distance from the hole, the water varies from band to band.
    const along = Array.from({ length: 20 }, (_, k) => nestWater(n, n.waterX + 20, 10 + k * 6.5));
    const ytong = nest('ytong').farm.nest!;
    const even = Array.from({ length: 20 }, (_, k) => nestWater(ytong, ytong.waterX + 20, ytong.waterY + (k % 2 ? 0.01 : 0)));
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(along)).toBeGreaterThan(0.05);
    expect(spread(even)).toBeLessThan(1e-3);
  });

  it('acrylic holds no water: only the air round its sponge, in a chamber, is humid', () => {
    const { farm, params } = nest('acrylic');
    const n = farm.nest!;
    expect(farm.material[Math.floor(n.waterY) * farm.width + Math.floor(n.waterX)]).toBe(Material.air);
    expect(nestWater(n, n.waterX, n.waterY)).toBe(1);
    expect(nestWater(n, n.waterX + 10, n.waterY)).toBe(0);
    const at = (x: number, y: number) => farm.humidity[Math.floor(y / FIELD_CELL) * farm.fieldWidth + Math.floor(x / FIELD_CELL)]!;
    expect(at(n.waterX, n.waterY)).toBeGreaterThan(0.95);
    // Far from the sponge the air is the room's.
    expect(dampShare(farm, params.broodHumidity)).toBeLessThan(0.5);
    expect(dampShare(farm, params.broodHumidity)).toBeGreaterThan(0.02);
  });

  it('plaster passes the heat mat\'s warmth best and wood least', () => {
    const warmth = (material: NestMaterial) => {
      const world = nest(material);
      setHeatMat(world, 0);
      updateTemperature(world.farm, world.heatMat, world.params, 1);
      return world.farm.temperature[Math.floor(75 / FIELD_CELL) * world.farm.fieldWidth + Math.floor(40 / FIELD_CELL)]!;
    };
    expect(warmth('plaster')).toBeGreaterThan(warmth('ytong'));
    expect(warmth('ytong')).toBeGreaterThan(warmth('acrylic'));
    expect(warmth('acrylic')).toBeGreaterThan(warmth('wood'));
  });

  it('mould spreads farthest from a corpse in damp wood and least over acrylic', () => {
    const mould = (material: NestMaterial) => {
      const w = createWorld(1, { ants: 0, params: { mould: true }, bought: { size: 'M', layout: 'classic', material } });
      w.farm.humidity.fill(0.97);
      const c = w.farm.nest!.chambers[0]!;
      addCorpse(w, Place.farm, c.x, c.y, 3);
      for (let t = 0; t < w.params.daySeconds; t += 10) {
        for (let i = 0; i < w.ants.count; i++) if (w.ants.state[i] === AntState.dead) w.ants.deadFor[i]! += 10 / w.params.daySeconds;
        updateMould(w.farm, w.ants, w.params, 10);
      }
      return w.farm.mouldy;
    };
    expect(mould('wood')).toBeGreaterThan(mould('plaster'));
    expect(mould('plaster')).toBeGreaterThan(mould('ytong'));
    expect(mould('ytong')).toBeGreaterThan(mould('acrylic'));
  });
});

describe('the cover (Nests 2, N7)', () => {
  it('keeps the nest dark until the keeper lifts it; then the lifted part is lit, fading under the edge', () => {
    const world = createTank(11, { size: 'M', layout: 'classic', material: 'ytong' });
    const { farm } = world;
    for (const x of [5, 100, 195]) expect(lightAt(farm, x)).toBe(COVER_LEAK);
    applyCommand(world, { type: 'cover', from: 0, to: 100 });
    expect(lightAt(farm, 5)).toBe(1);
    expect(lightAt(farm, 95)).toBe(1);
    expect(lightAt(farm, 100)).toBeGreaterThan(0.4);
    expect(lightAt(farm, 100)).toBeLessThan(0.6);
    expect(lightAt(farm, 110)).toBe(COVER_LEAK);
    applyCommand(world, { type: 'cover', from: 0, to: farm.width });
    expect(lightAt(farm, 199)).toBe(1);
    applyCommand(world, { type: 'cover', from: 0, to: 0 });
    expect(lightAt(farm, 5)).toBe(COVER_LEAK);
    // The sand farm is dug into soil: dark, cover or none.
    const sand = createTank(11, null);
    applyCommand(sand, { type: 'cover', from: 0, to: 300 });
    expect(lightAt(sand.farm, 50)).toBe(0);
  });

  it('a kept tank comes back with its material and its cover as they were', () => {
    const log = [{ step: 100, command: { type: 'cover' as const, from: 100, to: 200 } }];
    const world = replayTank(12, log, 300, { size: 'S', layout: 'organic', material: 'acrylic' });
    const loaded = loadWorld(structuredClone({ version: SAVE_VERSION, seed: 12, savedAt: 0, log, world }))!;
    expect(loaded.farm.nest!.material).toBe(Material.acrylic);
    expect(loaded.farm.nest!.litFrom).toBe(100);
    expect(hashState(loaded)).toBe(hashState(world));
    for (let s = 0; s < 300; s++) {
      step(world);
      step(loaded);
    }
    expect(hashState(loaded)).toBe(hashState(world));
  });

  it('a nest kept from before Nests 2 is ytong with its cover on', () => {
    const world = createTank(13, { size: 'M', layout: 'classic' });
    const kept = structuredClone({ version: SAVE_VERSION, seed: 13, savedAt: 0, log: [], world });
    const n = kept.world.farm.nest as unknown as Record<string, unknown>;
    delete n.litFrom;
    delete n.litTo;
    delete n.grain;
    const loaded = loadWorld(kept)!;
    expect(loaded.farm.nest!.material).toBe(Material.ytong);
    expect(loaded.farm.nest!.litTo).toBe(loaded.farm.nest!.litFrom);
    expect(hashState(loaded)).toBe(hashState(world));
  });
});
