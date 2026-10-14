/**
 * The keeper's table of bought nests (DESIGN.md 3.5, Nests 3, N8).
 *
 * A bought nest's grid is a table: the modules lie on it, and the keeper
 * joins their ports with tubes. A tube is a channel of air carved through
 * the table between two ports, so the ants walk through it like any
 * corridor, and smells, warmth and damp spread along it too; a cotton plug
 * in its middle closes it until the keeper takes the plug out. The arena's
 * tube (ants.ts) plugs into one port of one module.
 *
 * The grid grows to the right and to the front as modules are added, so
 * nothing already on it moves. Modules are laid out down the table, their
 * ports all in their right ends; tubes leave a port, bend in the free strip
 * right of the modules, and come back into the other port.
 */
import { AntState, Place } from './ants';
import { BroodStage } from './brood';
import { type Farm, FIELD_CELL, updateFresh } from './farm';
import { Material } from './materials';
import { type BoughtNest, type NestSetup, type Port, type Table, type Tube, type TubeEnd, carveModule, layModule, moduleAt, moduleById, nestHumidity } from './nest';
import { Purpose, Rng } from './rng';
import type { World } from './world';

/** Width of a tube's channel, mm: 6 mm vinyl tubing inside, seen from above. */
export const TUBE_WIDTH = 6;
/** A tube runs straight out of its port this far before it bends, mm. */
const LEAD = 12;
/** Bare table kept between a tube and anything else, mm (more than a field cell, so smells do not leak through). */
const CLEAR = 4;
/** Free table right of the modules, where tubes bend, mm. */
export const TABLE_MARGIN = 50;
/** Table between one module and the next, mm. */
export const MODULE_GAP = 25;
/** Length of a tube's cotton plug, mm. */
const PLUG = 8;

/**
 * Grows the farm's grid to at least `width` × `height` mm, keeping every cell
 * and field where it is; the new cells are bare table at the room's warmth
 * and humidity.
 */
export function growTable(farm: Farm, width: number, height: number, roomTemperature: number, roomHumidity: number): void {
  width = Math.max(farm.width, Math.ceil(width / FIELD_CELL) * FIELD_CELL);
  height = Math.max(farm.height, Math.ceil(height / FIELD_CELL) * FIELD_CELL);
  if (width === farm.width && height === farm.height) return;
  const cells = <T extends Uint8Array | Float32Array | Float64Array>(old: T, make: (n: number) => T, fill: number, ow: number, oh: number, nw: number, nh: number): T => {
    const next = make(nw * nh);
    next.fill(fill);
    for (let y = 0; y < oh; y++) next.set(old.subarray(y * ow, (y + 1) * ow), y * nw);
    return next;
  };
  const [ow, oh] = [farm.width, farm.height];
  farm.material = cells(farm.material, (n) => new Uint8Array(n), Material.table, ow, oh, width, height);
  farm.moisture = cells(farm.moisture, (n) => new Uint8Array(n), 0, ow, oh, width, height);
  farm.loose = cells(farm.loose, (n) => new Uint8Array(n), 0, ow, oh, width, height);
  farm.trail = cells(farm.trail, (n) => new Float64Array(n), 0, ow, oh, width, height);
  farm.moistureRest = cells(farm.moistureRest, (n) => new Float32Array(n), 0, ow, oh, width, height);
  const surface = new Uint16Array(width);
  surface.set(farm.surface);
  farm.surface = surface;
  const [fw, fh] = [farm.fieldWidth, farm.fieldHeight];
  const nfw = width / FIELD_CELL;
  const nfh = height / FIELD_CELL;
  const field = (old: Float64Array, fill: number) => cells(old, (n) => new Float64Array(n), fill, fw, fh, nfw, nfh);
  farm.odour = field(farm.odour, 0);
  farm.digMark = field(farm.digMark, 0);
  farm.broodScent = field(farm.broodScent, 0);
  farm.fresh = field(farm.fresh, 0);
  farm.temperature = field(farm.temperature, roomTemperature);
  farm.humidity = field(farm.humidity, roomHumidity);
  farm.mould = field(farm.mould, 0);
  farm.width = width;
  farm.height = height;
  farm.fieldWidth = nfw;
  farm.fieldHeight = nfh;
  farm.version++;
}

/** The port at `end`, or undefined. */
export function portOf(table: Table, end: TubeEnd): Port | undefined {
  return moduleById(table, end.module)?.ports[end.port];
}

/** True when nothing is plugged into the port at `end`: no tube, and not the arena's. */
export function portFree(table: Table, end: TubeEnd): boolean {
  const same = (e: TubeEnd) => e.module === end.module && e.port === end.port;
  return portOf(table, end) !== undefined && !same(table.arena) && !table.tubes.some((t) => same(t.a) || same(t.b));
}

/**
 * The keeper lays a new nest module on the table with its top left corner
 * at `at` (by default at the left, in front of the modules already there),
 * carved from the tank's seed and the module's id. Returns its id, or null
 * when it would not fit there.
 */
export function addModule(world: World, setup: NestSetup, at?: { x: number; y: number }): number | null {
  const { farm, params } = world;
  const table = farm.table;
  if (!table) return null;
  const id = table.nextId;
  const front = Math.max(...table.modules.map((m) => m.y + m.height));
  const x = Math.round(at?.x ?? 0);
  const y = Math.round(at?.y ?? front + MODULE_GAP);
  const { nest, air } = carveModule(new Rng(world.seed, Purpose.nest, id), setup, id, x, y);
  if (x < 0 || y < 0) return null;
  // Bare table under it and round it (beyond the table's edge it will be, once the table grows), checked before
  // the table grows so a refused nest leaves the tank as it was.
  for (let cy = y - CLEAR; cy < y + nest.height + CLEAR; cy++) {
    for (let cx = x - CLEAR; cx < x + nest.width + CLEAR; cx++) {
      if (cx < 0 || cy < 0 || cx >= farm.width || cy >= farm.height) continue;
      if (farm.material[cy * farm.width + cx] !== Material.table) return null;
    }
  }
  growTable(farm, Math.max(farm.width, x + nest.width + TABLE_MARGIN), Math.max(farm.height, y + nest.height), params.roomTemperature, params.roomHumidity);
  table.nextId++;
  table.modules.push(nest);
  layModule(farm, nest, air);
  refreshTable(world);
  return id;
}

/**
 * The keeper takes module `id` off the table: only when no tube is plugged
 * into it and nothing is inside (N8). Returns true if it was taken away.
 */
export function removeModule(world: World, id: number): boolean {
  const { farm } = world;
  const table = farm.table;
  const nest = table && moduleById(table, id);
  if (!table || !nest) return false;
  const plugged = (e: TubeEnd) => e.module === id;
  if (plugged(table.arena) || table.tubes.some((t) => plugged(t.a) || plugged(t.b))) return false;
  const mask = new Uint8Array(farm.width * farm.height);
  for (let y = nest.y; y < nest.y + nest.height; y++) for (let x = nest.x; x < nest.x + nest.width; x++) mask[y * farm.width + x] = 1;
  if (occupied(world, mask)) return false;
  for (let c = 0; c < mask.length; c++) if (mask[c]) farm.material[c] = Material.table;
  for (let c = 0; c < mask.length; c++) if (mask[c]) farm.moisture[c] = 0;
  table.modules = table.modules.filter((m) => m.id !== id);
  refreshTable(world);
  return true;
}

/**
 * The keeper moves module `id` so its top left corner is near (`x`, `y`):
 * only when no tube is plugged into it and nothing is inside (N8), and only
 * onto bare table. The block takes its damp and smells with it. The move is
 * rounded to whole field cells. Returns true if it was moved.
 */
export function moveModule(world: World, id: number, x: number, y: number): boolean {
  const { farm, params } = world;
  const table = farm.table;
  const nest = table && moduleById(table, id);
  if (!table || !nest) return false;
  const dx = Math.round((x - nest.x) / FIELD_CELL) * FIELD_CELL;
  const dy = Math.round((y - nest.y) / FIELD_CELL) * FIELD_CELL;
  if ((dx === 0 && dy === 0) || nest.x + dx < 0 || nest.y + dy < 0) return false;
  const plugged = (e: TubeEnd) => e.module === id;
  if (plugged(table.arena) || table.tubes.some((t) => plugged(t.a) || plugged(t.b))) return false;
  const mask = new Uint8Array(farm.width * farm.height);
  for (let cy = nest.y; cy < nest.y + nest.height; cy++) for (let cx = nest.x; cx < nest.x + nest.width; cx++) mask[cy * farm.width + cx] = 1;
  if (occupied(world, mask)) return false;
  growTable(farm, Math.max(farm.width, nest.x + dx + nest.width + TABLE_MARGIN), Math.max(farm.height, nest.y + dy + nest.height), params.roomTemperature, params.roomHumidity);

  // Lift the block (its cells, and the fields over it) off the table.
  const cells = [farm.material, farm.moisture, farm.loose, farm.trail, farm.moistureRest];
  const bare = [Material.table, 0, 0, 0, 0];
  const fields = [farm.odour, farm.digMark, farm.broodScent, farm.mould];
  const lifted = cells.map(() => [] as number[]);
  for (let cy = nest.y; cy < nest.y + nest.height; cy++) {
    for (let cx = nest.x; cx < nest.x + nest.width; cx++) {
      const c = cy * farm.width + cx;
      cells.forEach((layer, k) => {
        lifted[k]!.push(layer[c]!);
        layer[c] = bare[k]!;
      });
    }
  }
  const [fx0, fy0] = [Math.floor(nest.x / FIELD_CELL), Math.floor(nest.y / FIELD_CELL)];
  const [fx1, fy1] = [Math.ceil((nest.x + nest.width) / FIELD_CELL), Math.ceil((nest.y + nest.height) / FIELD_CELL)];
  const smells = fields.map(() => [] as number[]);
  for (let fy = fy0; fy < fy1; fy++) {
    for (let fx = fx0; fx < fx1; fx++) {
      fields.forEach((field, k) => {
        smells[k]!.push(field[fy * farm.fieldWidth + fx]!);
        field[fy * farm.fieldWidth + fx] = 0;
      });
    }
  }
  const lay = (ox: number, oy: number) => {
    let n = 0;
    for (let cy = nest.y + oy; cy < nest.y + oy + nest.height; cy++) {
      for (let cx = nest.x + ox; cx < nest.x + ox + nest.width; cx++, n++) cells.forEach((layer, k) => (layer[cy * farm.width + cx] = lifted[k]![n]!));
    }
    n = 0;
    const [gx, gy] = [ox / FIELD_CELL, oy / FIELD_CELL];
    for (let fy = fy0; fy < fy1; fy++) {
      for (let fx = fx0; fx < fx1; fx++, n++) fields.forEach((field, k) => (field[(fy + gy) * farm.fieldWidth + fx + gx] = smells[k]![n]!));
    }
  };

  // It goes down only on bare table, clear of everything else.
  for (let cy = nest.y + dy - CLEAR; cy < nest.y + dy + nest.height + CLEAR; cy++) {
    for (let cx = nest.x + dx - CLEAR; cx < nest.x + dx + nest.width + CLEAR; cx++) {
      if (cx < 0 || cy < 0 || cx >= farm.width || cy >= farm.height) continue;
      if (farm.material[cy * farm.width + cx] !== Material.table) {
        lay(0, 0);
        return false;
      }
    }
  }
  lay(dx, dy);
  nest.x += dx;
  nest.y += dy;
  nest.waterX += dx;
  nest.waterY += dy;
  for (const p of nest.ports) [p.x, p.y] = [p.x + dx, p.y + dy];
  for (const c of nest.chambers) [c.x, c.y] = [c.x + dx, c.y + dy];
  refreshTable(world);
  return true;
}

/**
 * The keeper joins the ports at `a` and `b` with a tube, with a cotton plug
 * in it (`plugged`) or open. Both ports must be free. Returns the tube's id,
 * or null when no tube can be laid between them without crossing something.
 */
export function connect(world: World, a: TubeEnd, b: TubeEnd, plugged = true): number | null {
  const { farm, params } = world;
  const table = farm.table;
  if (!table || (a.module === b.module && a.port === b.port) || !portFree(table, a) || !portFree(table, b)) return null;
  growTable(farm, Math.max(...table.modules.map((m) => m.x + m.width)) + TABLE_MARGIN, farm.height, params.roomTemperature, params.roomHumidity);
  const path = route(farm, table, a, b);
  if (!path) return null;
  const tube: Tube = { id: table.nextId++, a: { ...a }, b: { ...b }, path, plugged: false };
  forEachTubeCell(farm, tube, TUBE_WIDTH / 2, (c) => {
    if (farm.material[c] === Material.table) farm.material[c] = Material.air;
  });
  table.tubes.push(tube);
  if (plugged) plugCells(farm, tube, Material.cotton);
  tube.plugged = plugged;
  refreshTable(world);
  return tube.id;
}

/**
 * The keeper pushes a cotton plug into tube `id`, or pulls it out. The plug
 * goes in only where nothing is in its way. Returns true if it was done.
 */
export function setPlug(world: World, id: number, plugged: boolean): boolean {
  const { farm } = world;
  const tube = farm.table?.tubes.find((t) => t.id === id);
  if (!tube) return false;
  if (tube.plugged === plugged) return true;
  if (plugged) {
    const mask = new Uint8Array(farm.width * farm.height);
    plugCells(farm, tube, -1, mask);
    if (occupied(world, mask)) return false;
  }
  plugCells(farm, tube, plugged ? Material.cotton : Material.air);
  tube.plugged = plugged;
  refreshTable(world);
  return true;
}

/** The keeper takes tube `id` away, when nothing is inside it. Returns true if it was taken away. */
export function removeTube(world: World, id: number): boolean {
  const { farm } = world;
  const table = farm.table;
  const tube = table?.tubes.find((t) => t.id === id);
  if (!table || !tube) return false;
  const mask = new Uint8Array(farm.width * farm.height);
  forEachTubeCell(farm, tube, TUBE_WIDTH / 2, (c) => {
    if (farm.material[c] === Material.air || farm.material[c] === Material.cotton) mask[c] = 1;
  });
  if (occupied(world, mask)) return false;
  for (let c = 0; c < mask.length; c++) if (mask[c]) farm.material[c] = Material.table;
  table.tubes = table.tubes.filter((t) => t.id !== id);
  refreshTable(world);
  return true;
}

/**
 * The keeper plugs the arena's tube into the port at `end` instead (a free
 * port, or the one it is in). Ants in the tube come out there. Returns true
 * if it was done.
 */
export function connectArena(world: World, end: TubeEnd): boolean {
  const { farm } = world;
  const table = farm.table;
  if (!table) return false;
  const same = end.module === table.arena.module && end.port === table.arena.port;
  if (!same && !portFree(table, end)) return false;
  const port = portOf(table, end)!;
  table.arena = { ...end };
  farm.tubeX = port.x;
  farm.tubeY = port.y;
  refreshTable(world);
  return true;
}

/** After the keeper changes the table: the fresh air from the arena's tube and the damp settle again, and the page redraws it. */
export function refreshTable(world: World): void {
  const { farm, params } = world;
  farm.fresh.fill(0);
  for (let k = 0; k < 40; k++) updateFresh(farm);
  nestHumidity(farm, params);
  farm.version++;
}

/** True if any ant, dead or alive, brood item or piece of insect lies on a cell of `mask` in the farm. */
function occupied(world: World, mask: Uint8Array): boolean {
  const { ants, brood, farm } = world;
  const on = (x: number, y: number) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    return cx >= 0 && cy >= 0 && cx < farm.width && cy < farm.height && mask[cy * farm.width + cx] === 1;
  };
  for (let i = 0; i < ants.count; i++) if (ants.place[i] === Place.farm && (ants.state[i] !== AntState.dead || ants.carriedBy[i]! < 0) && on(ants.x[i]!, ants.y[i]!)) return true;
  for (let k = 0; k < brood.count; k++) if (brood.stage[k] !== BroodStage.none && on(brood.x[k]!, brood.y[k]!)) return true;
  return world.prey.some((p) => p.place === Place.farm && on(p.x, p.y));
}

/**
 * Calls `visit` once for each cell within `radius` mm of the tube's middle
 * line, outside the modules (so a tube never cuts into a block).
 */
function forEachTubeCell(farm: Farm, tube: Tube, radius: number, visit: (cell: number) => void, from = 0, to = Infinity): void {
  const table = farm.table!;
  const seen = new Uint8Array(farm.width * farm.height);
  walk(tube.path, (x, y, along) => {
    if (along < from || along > to) return;
    for (let cy = Math.floor(y - radius); cy <= Math.ceil(y + radius); cy++) {
      for (let cx = Math.floor(x - radius); cx <= Math.ceil(x + radius); cx++) {
        if (cx < 0 || cy < 0 || cx >= farm.width || cy >= farm.height) continue;
        if ((cx + 0.5 - x) ** 2 + (cy + 0.5 - y) ** 2 > radius * radius) continue;
        const c = cy * farm.width + cx;
        if (seen[c] || moduleAt(table, cx + 0.5, cy + 0.5)) continue;
        seen[c] = 1;
        visit(c);
      }
    }
  });
}

/** Sets the cells of the tube's plug, in the middle of its length, to `material`, or (`material` -1) marks them in `mask`. */
function plugCells(farm: Farm, tube: Tube, material: number, mask?: Uint8Array): void {
  const half = tubeLength(tube.path) / 2;
  forEachTubeCell(
    farm,
    tube,
    TUBE_WIDTH / 2 + 0.5,
    (c) => {
      if (farm.material[c] !== Material.air && farm.material[c] !== Material.cotton) return;
      if (mask) mask[c] = 1;
      else farm.material[c] = material;
    },
    half - PLUG / 2,
    half + PLUG / 2,
  );
}

/** Length of a path of x, y pairs, mm. */
export function tubeLength(path: readonly number[]): number {
  let length = 0;
  for (let k = 2; k < path.length; k += 2) length += Math.hypot(path[k]! - path[k - 2]!, path[k + 1]! - path[k - 1]!);
  return length;
}

/** The point `along` mm along a path of x, y pairs. */
export function pointAlong(path: readonly number[], along: number): { x: number; y: number } {
  let left = along;
  for (let k = 2; k < path.length; k += 2) {
    const dx = path[k]! - path[k - 2]!;
    const dy = path[k + 1]! - path[k - 1]!;
    const d = Math.hypot(dx, dy);
    if (left <= d || k === path.length - 2) {
      const t = d > 0 ? Math.min(1, left / d) : 0;
      return { x: path[k - 2]! + dx * t, y: path[k - 1]! + dy * t };
    }
    left -= d;
  }
  return { x: path[0]!, y: path[1]! };
}

/** Visits points every half mm along a path of x, y pairs, with how far along each is. */
function walk(path: readonly number[], visit: (x: number, y: number, along: number) => void): void {
  let along = 0;
  for (let k = 2; k < path.length; k += 2) {
    const ax = path[k - 2]!;
    const ay = path[k - 1]!;
    const dx = path[k]! - ax;
    const dy = path[k + 1]! - ay;
    const d = Math.hypot(dx, dy);
    const n = Math.max(1, Math.ceil(d / 0.5));
    for (let s = k === 2 ? 0 : 1; s <= n; s++) visit(ax + (dx * s) / n, ay + (dy * s) / n, along + (d * s) / n);
    along += d;
  }
}

/**
 * A way for a tube from the port at `a` to the port at `b`: straight out of
 * each port, then one bend, either way round, whichever crosses nothing and
 * keeps clear of everything else. Null if neither does.
 */
function route(farm: Farm, table: Table, a: TubeEnd, b: TubeEnd): number[] | null {
  const pa = portOf(table, a)!;
  const pb = portOf(table, b)!;
  const out = (p: Port) => ({ x: p.x + p.dx * (1.5 + LEAD), y: p.y + p.dy * (1.5 + LEAD) });
  const a1 = out(pa);
  const b1 = out(pb);
  const ends = [moduleById(table, a.module)!, moduleById(table, b.module)!];
  const candidates = [
    [pa.x, pa.y, a1.x, a1.y, a1.x, b1.y, b1.x, b1.y, pb.x, pb.y],
    [pa.x, pa.y, a1.x, a1.y, b1.x, a1.y, b1.x, b1.y, pb.x, pb.y],
  ];
  for (const path of candidates) {
    const tidy = simplify(path);
    if (clear(farm, table, tidy, ends, [pa, pb])) return tidy;
  }
  return null;
}

/** Drops points that repeat the one before, or lie on a straight line through their neighbours. */
function simplify(path: number[]): number[] {
  const out: number[] = [path[0]!, path[1]!];
  for (let k = 2; k < path.length; k += 2) {
    const x = path[k]!;
    const y = path[k + 1]!;
    const n = out.length;
    if (Math.abs(x - out[n - 2]!) < 1e-9 && Math.abs(y - out[n - 1]!) < 1e-9) continue;
    if (n >= 4) {
      const [px, py, qx, qy] = [out[n - 4]!, out[n - 3]!, out[n - 2]!, out[n - 1]!];
      if (Math.abs((qx - px) * (y - py) - (qy - py) * (x - px)) < 1e-9) {
        out[n - 2] = x;
        out[n - 1] = y;
        continue;
      }
    }
    out.push(x, y);
  }
  return out;
}

/**
 * True if a tube along `path` would cross only bare table, with `CLEAR` mm
 * of it round the tube, except where it leaves and enters its two ports.
 */
function clear(farm: Farm, table: Table, path: number[], ends: BoughtNest[], ports: Port[]): boolean {
  let ok = true;
  const near = TUBE_WIDTH / 2 + CLEAR + 2;
  walk(path, (x, y) => {
    if (!ok) return;
    const atPort = ports.some((p) => Math.hypot(x - p.x, y - p.y) < near);
    const r = TUBE_WIDTH / 2 + (atPort ? 0 : CLEAR);
    for (let cy = Math.floor(y - r); cy <= Math.ceil(y + r) && ok; cy++) {
      for (let cx = Math.floor(x - r); cx <= Math.ceil(x + r); cx++) {
        if ((cx + 0.5 - x) ** 2 + (cy + 0.5 - y) ** 2 > r * r) continue;
        if (cx < 0 || cy < 0 || cx >= farm.width || cy >= farm.height) {
          ok = false;
          break;
        }
        if (farm.material[cy * farm.width + cx] === Material.table) continue;
        // Into the block only at its own port.
        const block = moduleAt(table, cx + 0.5, cy + 0.5);
        if (atPort && block && ends.includes(block)) continue;
        ok = false;
        break;
      }
    }
  });
  return ok;
}
