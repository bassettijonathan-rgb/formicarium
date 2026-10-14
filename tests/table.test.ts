import { describe, expect, it } from 'vitest';
import { AntState, Caste, Place, addAnt } from '../src/sim/ants';
import { FIELD_CELL, type Farm } from '../src/sim/farm';
import { hashState } from '../src/sim/hash';
import { applyCommand, createTank, type LoggedCommand, replayTank } from '../src/sim/keeper';
import { Material } from '../src/sim/materials';
import { COVER_LEAK, TEST_TUBE, TEST_TUBE_SETUP, lightAt, moduleById } from '../src/sim/nest';
import type { AntParams } from '../src/sim/params';
import { SAVE_VERSION, loadWorld } from '../src/sim/save';
import { MODULE_GAP, addModule, connect, connectArena, moveModule, removeModule, removeTube, setPlug } from '../src/sim/table';
import { createWorld, setCover, step, type World } from '../src/sim/world';

function tableOf(seed = 5): World {
  return createWorld(seed, { ants: 0, bought: { size: 'S', layout: 'classic', material: 'ytong' } });
}

/** True if an ant could walk from (ax, ay) to (bx, by) through open cells. */
function reachable(farm: Farm, ax: number, ay: number, bx: number, by: number): boolean {
  const seen = new Uint8Array(farm.width * farm.height);
  const start = Math.floor(ay) * farm.width + Math.floor(ax);
  const goal = Math.floor(by) * farm.width + Math.floor(bx);
  const queue = [start];
  seen[start] = 1;
  while (queue.length > 0) {
    const c = queue.pop()!;
    if (c === goal) return true;
    const x = c % farm.width;
    const y = (c - x) / farm.width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= farm.width || ny >= farm.height) continue;
      const n = ny * farm.width + nx;
      if (seen[n] || farm.material[n] !== Material.air) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}

describe('the table of nests (Nests 3, N8)', () => {
  it('a new nest goes in front of the first, which stays as it was', () => {
    const world = tableOf();
    const before = world.farm.material.slice();
    const width = world.farm.width;
    const id = addModule(world, { size: 'S', layout: 'organic', material: 'plaster' })!;
    const table = world.farm.table!;
    const second = moduleById(table, id)!;
    expect(second.y).toBe(100 + MODULE_GAP);
    expect(second.x).toBe(0);
    expect(world.farm.height).toBeGreaterThanOrEqual(second.y + second.height);
    for (let y = 0; y < 100; y++) for (let x = 0; x < width; x++) expect(world.farm.material[y * world.farm.width + x]).toBe(before[y * width + x]);
    // Its walls are plaster, the table round it bare.
    expect(world.farm.material[(second.y + 1) * world.farm.width + 1]).toBe(Material.plaster);
    expect(world.farm.material[(second.y - 5) * world.farm.width + 5]).toBe(Material.table);
    // It does not fit where the first one lies.
    expect(addModule(world, { size: 'S', layout: 'classic' }, { x: 20, y: 20 })).toBeNull();
  });

  it('a tube joins two ports; its cotton plug keeps the ants out until the keeper pulls it', () => {
    const world = tableOf();
    const id = addModule(world, { size: 'S', layout: 'classic' })!;
    const table = world.farm.table!;
    const first = table.modules[0]!;
    const second = moduleById(table, id)!;
    const from = first.ports[1]!;
    const to = second.ports[0]!;
    expect(reachable(world.farm, from.x, from.y, to.x, to.y)).toBe(false);
    const tube = connect(world, { module: first.id, port: 1 }, { module: id, port: 0 }, true)!;
    expect(tube).not.toBeNull();
    expect(reachable(world.farm, from.x, from.y, to.x, to.y)).toBe(false);
    expect(world.farm.material.includes(Material.cotton)).toBe(true);
    expect(setPlug(world, tube, false)).toBe(true);
    expect(reachable(world.farm, from.x, from.y, to.x, to.y)).toBe(true);
    // Chambers of both nests are now one space.
    expect(reachable(world.farm, first.chambers[0]!.x, first.chambers[0]!.y, second.chambers[3]!.x, second.chambers[3]!.y)).toBe(true);
    // A port takes one tube; the arena's port takes none.
    expect(connect(world, { module: first.id, port: 1 }, { module: id, port: 1 })).toBeNull();
    expect(connect(world, { module: first.id, port: 0 }, { module: id, port: 1 })).toBeNull();
  });

  it('the tubes are clear: light in them is the room\'s; the nests stay dark under their covers', () => {
    const world = tableOf();
    const id = addModule(world, { size: 'S', layout: 'classic' })!;
    const tube = connect(world, { module: 1, port: 1 }, { module: id, port: 0 }, false)!;
    const path = world.farm.table!.tubes.find((t) => t.id === tube)!.path;
    const corner = { x: path[4]!, y: path[5]! };
    expect(lightAt(world.farm, corner.x, corner.y)).toBe(1);
    expect(lightAt(world.farm, 50, 50)).toBe(COVER_LEAK);
    expect(lightAt(world.farm, 50, moduleById(world.farm.table!, id)!.y + 50)).toBe(COVER_LEAK);
  });

  it('the second nest is damp at its own water hole, and its damp reaches along the tube', () => {
    const world = tableOf();
    const id = addModule(world, { size: 'S', layout: 'classic' })!;
    const second = moduleById(world.farm.table!, id)!;
    const at = (x: number, y: number) => world.farm.humidity[Math.floor(y / FIELD_CELL) * world.farm.fieldWidth + Math.floor(x / FIELD_CELL)]!;
    const nearWater = second.chambers.reduce((a, c) => (c.x < a.x ? c : a));
    expect(at(nearWater.x, nearWater.y)).toBeGreaterThan(0.9);
  });

  it('a tube or a nest with something in it cannot be taken away', () => {
    const world = tableOf();
    const id = addModule(world, { size: 'S', layout: 'classic' })!;
    const tube = connect(world, { module: 1, port: 1 }, { module: id, port: 0 }, false)!;
    expect(removeModule(world, id)).toBe(false); // a tube is plugged into it
    const path = world.farm.table!.tubes[0]!.path;
    const i = addAnt(world.ants);
    world.ants.place[i] = Place.farm;
    world.ants.state[i] = AntState.wandering;
    world.ants.carriedBy[i] = -1;
    world.ants.x[i] = path[4]!;
    world.ants.y[i] = path[5]!;
    expect(removeTube(world, tube)).toBe(false);
    world.ants.place[i] = Place.gone;
    expect(removeTube(world, tube)).toBe(true);
    expect(world.farm.material.includes(Material.cotton)).toBe(false);
    expect(removeModule(world, id)).toBe(true);
    expect(world.farm.table!.modules.length).toBe(1);
  });

  it('an empty nest with nothing plugged in can be moved onto bare table, its smell and damp with it', () => {
    const world = tableOf();
    const { farm } = world;
    const id = addModule(world, { size: 'S', layout: 'organic', material: 'plaster' })!;
    const nest = moduleById(farm.table!, id)!;
    const [x0, y0, w, h] = [nest.x, nest.y, nest.width, nest.height];
    const block = (x: number, y: number) => {
      const out: number[] = [];
      for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) out.push(farm.material[cy * farm.width + cx]!, farm.moisture[cy * farm.width + cx]!);
      return out;
    };
    const before = block(x0, y0);
    const chamber = { ...nest.chambers[0]! };
    const smell = (x: number, y: number) => farm.odour[Math.floor(y / FIELD_CELL) * farm.fieldWidth + Math.floor(x / FIELD_CELL)]!;
    farm.odour[Math.floor(chamber.y / FIELD_CELL) * farm.fieldWidth + Math.floor(chamber.x / FIELD_CELL)] = 0.7;
    // Not onto the first nest, nor with an ant inside.
    expect(moveModule(world, id, 10, 10)).toBe(false);
    const i = addAnt(world.ants);
    world.ants.place[i] = Place.farm;
    world.ants.state[i] = AntState.wandering;
    world.ants.carriedBy[i] = -1;
    [world.ants.x[i], world.ants.y[i]] = [chamber.x, chamber.y];
    expect(moveModule(world, id, 200, y0)).toBe(false);
    expect(block(x0, y0)).toEqual(before);
    world.ants.place[i] = Place.gone;
    // Off to the right: the table grows, the block arrives whole, bare table is left behind.
    expect(moveModule(world, id, 200, y0)).toBe(true);
    expect([nest.x, nest.y]).toEqual([200, y0]);
    expect(farm.width).toBeGreaterThanOrEqual(200 + w);
    expect(block(200, y0)).toEqual(before);
    expect(farm.material[(y0 + 10) * farm.width + x0 + 10]).toBe(Material.table);
    expect(nest.chambers[0]).toEqual({ x: chamber.x + 200 - x0, y: chamber.y });
    expect(smell(nest.chambers[0]!.x, nest.chambers[0]!.y)).toBeCloseTo(0.7);
    expect(smell(chamber.x, chamber.y)).toBe(0);
    // Joined by a tube where it lies now, the ants can walk from one nest into the other.
    const tube = connect(world, { module: 1, port: 1 }, { module: id, port: 0 }, false)!;
    const first = farm.table!.modules[0]!.chambers[0]!;
    expect(reachable(farm, first.x, first.y, nest.chambers[0]!.x, nest.chambers[0]!.y)).toBe(true);
    // With a tube plugged into it, it stays where it is.
    expect(moveModule(world, id, 200, y0 + 40)).toBe(false);
    expect(removeTube(world, tube)).toBe(true);
    expect(moveModule(world, id, 200, y0 + 40)).toBe(true);
  });

  it("the arena's tube can go into another port; the fresh air comes in there", () => {
    const world = tableOf();
    const id = addModule(world, { size: 'S', layout: 'classic' })!;
    const port = moduleById(world.farm.table!, id)!.ports[0]!;
    expect(connectArena(world, { module: id, port: 0 })).toBe(true);
    expect([world.farm.tubeX, world.farm.tubeY]).toEqual([port.x, port.y]);
    const fresh = (x: number, y: number) => world.farm.fresh[Math.floor(y / FIELD_CELL) * world.farm.fieldWidth + Math.floor(x / FIELD_CELL)]!;
    expect(fresh(port.x, port.y)).toBe(1);
    // The first nest is shut off from it now.
    const first = world.farm.table!.modules[0]!;
    expect(fresh(first.chambers[0]!.x, first.chambers[0]!.y)).toBe(0);
  });

  it('a table built by the keeper replays and keeps exactly', () => {
    const log: LoggedCommand[] = [
      { step: 20, command: { type: 'addNest', nest: { size: 'S', layout: 'honeycomb', material: 'acrylic' } } },
      { step: 40, command: { type: 'connect', a: { module: 1, port: 1 }, b: { module: 2, port: 0 }, plugged: true } },
      { step: 60, command: { type: 'plug', tube: 3, plugged: false } },
      { step: 80, command: { type: 'cover', from: 0, to: 50, module: 2 } },
      { step: 90, command: { type: 'addNest', nest: { size: 'S', layout: 'organic', material: 'wood' } } },
      { step: 100, command: { type: 'moveNest', module: 4, x: 260, y: 0 } },
    ];
    const a = replayTank(21, log, 400, { size: 'S', layout: 'classic', material: 'ytong' });
    const b = replayTank(21, log, 400, { size: 'S', layout: 'classic', material: 'ytong' });
    expect(a.farm.table!.tubes[0]!.plugged).toBe(false);
    expect(moduleById(a.farm.table!, 2)!.litTo).toBe(50);
    expect(moduleById(a.farm.table!, 4)!.x).toBe(260);
    expect(hashState(a)).toBe(hashState(b));
    const loaded = loadWorld(structuredClone({ version: SAVE_VERSION, seed: 21, savedAt: 0, log, world: a }))!;
    expect(hashState(loaded)).toBe(hashState(a));
    for (let s = 0; s < 200; s++) {
      step(a);
      step(loaded);
    }
    expect(hashState(loaded)).toBe(hashState(a));
  });

  it('a new tank on the page starts with one nest, the arena in its first port', () => {
    const world = createTank(3);
    applyCommand(world, { type: 'addNest', nest: { size: 'M', layout: 'classic', material: 'wood' } });
    const table = world.farm.table!;
    expect(table.modules.length).toBe(2);
    expect(table.arena).toEqual({ module: 1, port: 0 });
  });
});

describe('the test tube and moving house (Nests 3, N8, N9)', () => {
  function tube(params: Partial<AntParams> = {}): World {
    return createWorld(5, { ants: 0, queen: false, params: { forageRate: 0, returnToFoodRate: 0, ...params }, bought: TEST_TUBE_SETUP });
  }
  function put(world: World, x: number, y: number, state: number, caste: number = Caste.worker): number {
    const i = addAnt(world.ants);
    world.ants.place[i] = Place.farm;
    world.ants.state[i] = state;
    world.ants.caste[i] = caste;
    world.ants.carriedBy[i] = -1;
    world.ants.corpseHeld[i] = -1;
    world.ants.broodHeld[i] = -1;
    world.ants.pieceHeld[i] = -1;
    world.ants.partner[i] = -1;
    world.ants.preyId[i] = -1;
    world.ants.fat[i] = 1;
    world.ants.x[i] = x;
    world.ants.y[i] = y;
    world.ants.timer[i] = 1e6;
    return i;
  }

  it("a test tube's air is damp from the wet cotton nearly to its mouth", () => {
    const world = tube();
    const at = (x: number) => world.farm.humidity[Math.floor(9 / FIELD_CELL) * world.farm.fieldWidth + Math.floor(x / FIELD_CELL)]!;
    expect(at(60)).toBeGreaterThan(0.99);
    expect(at(110)).toBeGreaterThan(0.95);
    expect(at(147)).toBeLessThan(0.8); // where the drier air comes in
  });

  it('a worker does not lie down on top of resting nestmates', () => {
    const world = tube({ restRate: 1e3, speed: 0.01 });
    put(world, 100, 9, AntState.resting);
    put(world, 100.3, 9, AntState.resting);
    const w = put(world, 100.1, 9.2, AntState.wandering);
    for (let s = 0; s < 40; s++) step(world);
    expect(world.ants.state[w]).toBe(AntState.wandering);
    // With room beside one nestmate, it lies down at once.
    const free = tube({ restRate: 1e3, speed: 0.01 });
    put(free, 100, 9, AntState.resting);
    const v = put(free, 101, 9, AntState.wandering);
    for (let s = 0; s < 40; s++) step(free);
    expect(free.ants.state[v]).toBe(AntState.resting);
  });

  it('a queen resting in the light gets up soon; under the cover she lies on', () => {
    const dark = tube();
    const lit = tube();
    setCover(lit, 0, TEST_TUBE.width, 1);
    const a = put(dark, 100, 9, AntState.resting, Caste.queen);
    const b = put(lit, 100, 9, AntState.resting, Caste.queen);
    dark.ants.timer[a] = 4000;
    lit.ants.timer[b] = 4000;
    for (let s = 0; s < 400; s++) {
      step(dark);
      step(lit);
    }
    expect(dark.ants.state[a]).toBe(AntState.resting);
    expect(lit.ants.state[b]).not.toBe(AntState.resting);
  });

  it('a worker that goes out through the arena tube forgets the new site it found', () => {
    const world = tube();
    const i = put(world, 100, 9, AntState.homing);
    world.ants.place[i] = Place.tube;
    world.ants.timer[i] = 0;
    world.ants.site[i] = 1;
    step(world);
    expect(world.ants.place[i]).toBe(Place.farm);
    expect(world.ants.site[i]).toBe(0);
  });
});
