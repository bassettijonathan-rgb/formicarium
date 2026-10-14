/**
 * Bought nests (DESIGN.md section 3.5, Nests 1).
 *
 * A bought formicarium is a block of ytong (aerated concrete) with chambers
 * and corridors already carved into its top, 5 mm deep, under a glass lid.
 * It lies flat on the table, so this grid is the nest seen from above: x
 * across, y from the back toward the keeper. The ants walk on the floor of
 * the carving; its walls are hard and cannot be dug.
 *
 * The keeper fills a water hole at one end. Ytong is porous: the water soaks
 * into the block and spreads by capillarity while the block dries through its
 * faces, so it is wet near the hole and drier the farther away (Nests 1 has
 * the water refill itself, N6). The air in each chamber takes the humidity of
 * the ytong round it, mixed along the chambers, and the room's air comes in
 * through the tube. So the colony has a damp-to-dry range to choose from.
 *
 * Nests 2 sells the same carvings in plaster, acrylic and wood, which hold
 * water, pass warmth and grow mould differently (`NEST_MATERIALS`), and puts
 * a cover on every nest: under it the nest is dark for the ants, and the
 * keeper can lift it from part of the nest or all of it (`lightAt`).
 *
 * The same `Farm` grid holds it as holds the sand farm: the cells are walls
 * or air, and the fields (smells, warmth, humidity, mould) work as before.
 *
 * Nests 3 makes the grid a table: it holds several modules (`Table`), each
 * with its own material, water and cover, joined by tubes laid on the table
 * between their ports (table.ts). Each module's numbers are in the table's
 * mm, except its cover's, which are across the module itself.
 */
import { type Farm, FIELD_CELL, updateFresh } from './farm';
import { Material } from './materials';
import type { AntParams } from './params';
import type { Rng } from './rng';
import { poreHumidity } from './water';

export type NestSize = 'S' | 'M' | 'L';
export type NestLayout = 'classic' | 'organic' | 'honeycomb';
export type NestMaterial = 'ytong' | 'plaster' | 'acrylic' | 'wood';

/** What the keeper buys: a size, a layout and a material (ytong unless said); or (`testTube`) a test tube (N9). */
export interface NestSetup {
  size: NestSize;
  layout: NestLayout;
  material?: NestMaterial;
  testTube?: boolean;
}

/** A queen's first home (N9): a glass test tube lying on the table, its water held behind a cotton plug at the closed end. */
export const TEST_TUBE_SETUP: NestSetup = { size: 'S', layout: 'classic', testTube: true };

/** The page's new tank: a medium classic ytong nest. */
export const DEFAULT_NEST: NestSetup = { size: 'M', layout: 'classic', material: 'ytong' };

/** How a nest's material holds water, passes warmth and lets mould grow (N2, DESIGN.md 3.5). */
export interface NestMaterialProps {
  material: Material;
  /**
   * Water in the block round the water hole, fraction of saturation, and how
   * far it reaches: it falls by e every `waterReach` mm from the hole's edge.
   * Acrylic holds none (`sponge`: a wet sponge in one chamber instead).
   */
  waterAtHole: number;
  waterReach: number;
  sponge: boolean;
  /** How unevenly the block holds its water, 0 (evenly) to 1: wood's grain soaks some bands more than others. */
  uneven: number;
  /** How far water vapour spreads along the chambers before the walls take it up, mm. */
  vapourReach: number;
  /** How much of the heat mat's warmth reaches the floor, as a multiple of ytong's (`nestMatShare`). */
  heat: number;
  /** How fast mould spreads from what it grows on, and how fast it dies back, as multiples of ytong's. */
  mouldSpread: number;
  mouldDecay: number;
}

/**
 * The four materials. Rough values, chosen to match how keepers describe
 * them (bought-nests.md): plaster soaks up water like ytong, a bit faster and
 * farther; acrylic holds none, so only the air near its sponge is humid
 * (and with no walls soaking vapour up it spreads farther along the
 * chambers); wood holds a little, unevenly. Warmth passes as their
 * conductivities when damp go (plaster about 0.5 W/m·K, damp ytong 0.3,
 * acrylic 0.19, beech 0.16). Mould creeps through damp porous plaster
 * readily, hardly over smooth acrylic, and feeds on damp wood itself, so it
 * dies back slowly there.
 */
export const NEST_MATERIALS: Record<NestMaterial, NestMaterialProps> = {
  ytong: { material: Material.ytong, waterAtHole: 0.6, waterReach: 45, sponge: false, uneven: 0, vapourReach: 20, heat: 1, mouldSpread: 1, mouldDecay: 1 },
  plaster: { material: Material.plaster, waterAtHole: 0.7, waterReach: 60, sponge: false, uneven: 0, vapourReach: 20, heat: 1.15, mouldSpread: 1.3, mouldDecay: 1 },
  acrylic: { material: Material.acrylic, waterAtHole: 0, waterReach: 1, sponge: true, uneven: 0, vapourReach: 60, heat: 0.85, mouldSpread: 0.5, mouldDecay: 1.5 },
  wood: { material: Material.wood, waterAtHole: 0.35, waterReach: 30, sponge: false, uneven: 0.6, vapourReach: 20, heat: 0.8, mouldSpread: 1.5, mouldDecay: 0.5 },
};

/** The name of a nest's material, from the number stored in it. */
export function nestMaterialName(material: Material): NestMaterial {
  for (const name of Object.keys(NEST_MATERIALS) as NestMaterial[]) if (NEST_MATERIALS[name].material === material) return name;
  return 'ytong';
}

/** How the material of `nest` behaves. */
export function materialOf(nest: BoughtNest): NestMaterialProps {
  return nest.kind === 'tube' ? TEST_TUBE_PROPS : NEST_MATERIALS[nestMaterialName(nest.material)];
}

/**
 * A test tube, mm: 15 cm long and 18 mm across outside, its glass 2 mm
 * thick (so 14 mm of room inside, as in the 16 mm tubes keepers use), with
 * water in the closed end and a cotton plug holding it in. Lying flat, seen
 * from above.
 */
export const TEST_TUBE = { width: 150, height: 18, glass: 2, water: 40, cotton: 12 } as const;

/**
 * Glass holds no water; the wet cotton keeps the air on it saturated, like
 * acrylic's sponge, and the damp spreads along the tube toward its mouth.
 * Glass takes no vapour from the air (a long `vapourReach`), so the tube is
 * damp from the cotton nearly to its mouth, where the drier air comes in, as
 * keepers see from the mist on the glass. Thin glass on the mat passes its
 * warmth well. Mould hardly grows on glass (rough).
 */
export const TEST_TUBE_PROPS: NestMaterialProps = {
  material: Material.glass,
  waterAtHole: 1,
  waterReach: 1,
  sponge: true,
  uneven: 0,
  vapourReach: 1000,
  heat: 1.2,
  mouldSpread: 0.5,
  mouldDecay: 1.5,
};

/** Floor size of each size of nest, mm (N4): a young colony, a few hundred workers, a thousand or more. */
export const NEST_SIZES: Record<NestSize, { width: number; height: number }> = {
  S: { width: 100, height: 100 },
  M: { width: 200, height: 150 },
  L: { width: 300, height: 200 },
};

/** Where a tube plugs into a module: the middle of the port's mouth, in table mm, and which way it faces out (`dx`, `dy`). */
export interface Port {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface BoughtNest {
  /** The module's number on its table, and its place there: its top left corner and its size, mm (Nests 3). */
  id: number;
  /** A carved nest, or a test tube (N9). */
  kind: 'nest' | 'tube';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Its ports, in the right end: the one a third of the way from the back, and one nearer the front. */
  ports: Port[];
  material: Material;
  size: NestSize;
  layout: NestLayout;
  /** Depth of the chambers, and the block's thickness, mm. */
  depth: number;
  thickness: number;
  /** The water hole (in acrylic, the sponge): its middle and radius, mm. */
  waterX: number;
  waterY: number;
  waterRadius: number;
  /** Middles of the chambers, mm, in the order they were carved. */
  chambers: { x: number; y: number }[];
  /** Seed of the wood's grain (how unevenly it holds water). */
  grain: number;
  /** Where the keeper has lifted the cover: from `litFrom` to `litTo` mm across the module; covered everywhere when they are equal (N7). */
  litFrom: number;
  litTo: number;
}

/** One end of a tube: a module's port, by the module's id and the port's index. */
export interface TubeEnd {
  module: number;
  port: number;
}

/**
 * A tube the keeper has laid between two ports (N8): a channel of air
 * `TUBE_WIDTH` wide carved through the table along `path` (its middle line,
 * as x, y pairs in mm), with a cotton plug in its middle while `plugged`.
 */
export interface Tube {
  id: number;
  a: TubeEnd;
  b: TubeEnd;
  path: number[];
  plugged: boolean;
}

/** What a bought nest's grid holds (Nests 3): its modules, the tubes between them, and the port the arena's tube plugs into. */
export interface Table {
  modules: BoughtNest[];
  tubes: Tube[];
  arena: TubeEnd;
  /** The id the next module or tube gets. */
  nextId: number;
}

/** The module of `table` with (x, y) on its floor or in its walls, or undefined (a tube, or the bare table). */
export function moduleAt(table: Table, x: number, y: number): BoughtNest | undefined {
  for (const m of table.modules) if (x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) return m;
  return undefined;
}

/** The module with id `id`. */
export function moduleById(table: Table, id: number): BoughtNest | undefined {
  return table.modules.find((m) => m.id === id);
}

/**
 * The tubes: clear vinyl lying on the table. They hold no water, pass the
 * mat's warmth about as acrylic does, and mould hardly grows on their smooth
 * walls (rough).
 */
export const TUBE_PROPS: NestMaterialProps = {
  material: Material.table,
  waterAtHole: 0,
  waterReach: 1,
  sponge: false,
  uneven: 0,
  vapourReach: 60,
  heat: 0.85,
  mouldSpread: 0.5,
  mouldDecay: 1.5,
};

/** How the module at field cell (fx, fy) behaves, or the tubes' material between modules. */
export function propsAt(table: Table, fx: number, fy: number): NestMaterialProps {
  const m = moduleAt(table, (fx + 0.5) * FIELD_CELL, (fy + 0.5) * FIELD_CELL);
  return m ? materialOf(m) : TUBE_PROPS;
}

/** Chambers are 5 mm deep, as in bought nests (N4); the block is 25 mm thick. */
const DEPTH = 5;
const THICKNESS = 25;

/** Nothing is carved this close to the block's edge, mm, except the way to the tube. */
const EDGE = 3;
/** Room left at the water end for the hole and the wall round it, mm. */
const WATER_MARGIN = 30;

/** The sponge in an acrylic nest's chamber nearest the water end, radius in mm. */
const SPONGE_RADIUS = 5;

/**
 * Light under the cover, as a share of the room's: the lid is tinted (or,
 * on acrylic, a red film, which ants barely see), and a little light comes
 * in round its edges (rough).
 */
export const COVER_LEAK = 0.03;
/** Light spreads this far under the edge of a lifted cover, mm (rough: the lid sits 1-2 mm above the walls). */
const COVER_EDGE = 4;

/** Corridor widths, mm (N4: 3-4 mm), and the honeycomb's doors. */
const CORRIDOR = { classic: 3.8, organic: 3.5, door: 2.6, port: 4 } as const;

/**
 * Carves a new bought nest from the seed's layout stream: chambers laid out
 * in the chosen style, joined by corridors so every chamber can be reached,
 * corridors to the ports in the right end, and the water hole at the left
 * end. The grid it returns is a table holding just this nest, the arena's
 * tube in its first port; more modules can be laid beside it (table.ts).
 */
export function createNest(rng: Rng, setup: NestSetup, params: AntParams): Farm {
  const { nest, air } = carveModule(rng, setup, 1, 0, 0);
  const { width, height } = nest;
  const fieldWidth = Math.ceil(width / FIELD_CELL);
  const fieldHeight = Math.ceil(height / FIELD_CELL);
  const cells = fieldWidth * fieldHeight;
  const farm: Farm = {
    width,
    height,
    material: new Uint8Array(width * height),
    moisture: new Uint8Array(width * height),
    loose: new Uint8Array(width * height),
    falling: [],
    version: 0,
    // No soil surface: the whole floor is inside the nest.
    surface: new Uint16Array(width),
    fieldWidth,
    fieldHeight,
    odour: new Float64Array(cells),
    digMark: new Float64Array(cells),
    broodScent: new Float64Array(cells),
    fresh: new Float64Array(cells),
    trail: new Float64Array(width * height),
    temperature: new Float64Array(cells).fill(params.roomTemperature),
    humidity: new Float64Array(cells),
    moistureRest: new Float32Array(width * height),
    mould: new Float64Array(cells),
    mouldy: 0,
    tubeX: nest.ports[0]!.x,
    tubeY: nest.ports[0]!.y,
    table: { modules: [nest], tubes: [], arena: { module: nest.id, port: 0 }, nextId: 2 },
  };
  layModule(farm, nest, air);
  // The tube's air reaches into the nest along the corridors; it is the only opening, so let it settle.
  for (let k = 0; k < 60; k++) updateFresh(farm);
  nestHumidity(farm, params);
  return farm;
}

/**
 * A new nest module `id` with its top left corner at (x, y) on the table,
 * carved from `rng`, and which of its cells are carved out (1), row by row
 * across the module.
 */
export function carveModule(rng: Rng, setup: NestSetup, id: number, x: number, y: number): { nest: BoughtNest; air: Uint8Array } {
  if (setup.testTube) return testTube(id, x, y);
  const { width, height } = NEST_SIZES[setup.size];
  const air = new Uint8Array(width * height);
  const carve = new Carver(air, width, height);
  const chambers = setup.layout === 'honeycomb' ? honeycomb(rng, carve, width, height) : rooms(rng, carve, width, height, setup.layout);

  // The ports in the right end, a third of the way from the back and a quarter from the front, each joined to the nearest chamber.
  const ports: Port[] = [];
  for (const at of [0.35, 0.75]) {
    const portY = Math.round(height * at) + 0.5;
    let near = chambers[0]!;
    for (const c of chambers) if (Math.hypot(c.x - width, c.y - portY) < Math.hypot(near.x - width, near.y - portY)) near = c;
    carve.stroke(near.x, near.y, near.x, near.y, width, portY, CORRIDOR.port, true);
    ports.push({ x: x + width - 1.5, y: y + portY, dx: 1, dy: 0 });
  }

  const props = NEST_MATERIALS[setup.material ?? 'ytong'];
  // In acrylic the sponge lies in the chamber nearest the water end's middle.
  let wet = chambers[0]!;
  for (const c of chambers) if (Math.hypot(c.x, c.y - height / 2) < Math.hypot(wet.x, wet.y - height / 2)) wet = c;
  const nest: BoughtNest = {
    id,
    kind: 'nest',
    x,
    y,
    width,
    height,
    ports,
    material: props.material,
    size: setup.size,
    layout: setup.layout,
    depth: DEPTH,
    thickness: THICKNESS,
    waterX: x + (props.sponge ? wet.x : 14),
    waterY: y + (props.sponge ? wet.y : height / 2),
    waterRadius: props.sponge ? SPONGE_RADIUS : setup.size === 'S' ? 7 : 9,
    chambers: chambers.map((c) => ({ x: x + c.x, y: y + c.y })),
    grain: rng.int(2 ** 31),
    litFrom: 0,
    litTo: 0,
  };
  return { nest, air };
}

/** A test tube at (x, y) on the table, and which of its cells are open, row by row: its mouth is its one port. */
function testTube(id: number, x: number, y: number): { nest: BoughtNest; air: Uint8Array } {
  const { width, height, glass, water, cotton } = TEST_TUBE;
  const air = new Uint8Array(width * height);
  for (let cy = glass; cy < height - glass; cy++) for (let cx = water + cotton; cx < width; cx++) air[cy * width + cx] = 1;
  const nest: BoughtNest = {
    id,
    kind: 'tube',
    x,
    y,
    width,
    height,
    ports: [{ x: x + width - 1.5, y: y + height / 2, dx: 1, dy: 0 }],
    material: Material.glass,
    size: 'S',
    layout: 'classic',
    depth: height - 2 * glass,
    thickness: height,
    waterX: x + water + cotton,
    waterY: y + height / 2,
    waterRadius: 0,
    chambers: [{ x: x + (water + cotton + width) / 2, y: y + height / 2 }],
    grain: 0,
    litFrom: 0,
    litTo: 0,
  };
  return { nest, air };
}

/** True for the cells of a test tube's cotton plug, (x, y) mm from its corner. */
function isCotton(x: number, y: number): boolean {
  const { height, glass, water, cotton } = TEST_TUBE;
  return x >= water && x < water + cotton && y >= glass && y < height - glass;
}

/** Lays module `nest` on its place in the farm's grid: its walls of its material, its carving air, and the water in its block. */
export function layModule(farm: Farm, nest: BoughtNest, air: Uint8Array): void {
  for (let y = 0; y < nest.height; y++) {
    for (let x = 0; x < nest.width; x++) {
      const i = (nest.y + y) * farm.width + nest.x + x;
      farm.material[i] = air[y * nest.width + x] ? Material.air : nest.kind === 'tube' && isCotton(x, y) ? Material.cotton : nest.material;
      // Under an air cell this is the chamber's floor.
      farm.moisture[i] = Math.round(255 * nestWater(nest, nest.x + x + 0.5, nest.y + y + 0.5));
    }
  }
  farm.version++;
}

/**
 * Water in the block at (x, y), fraction of saturation (it does not change:
 * the hole refills itself, N6). In acrylic only the sponge is wet.
 */
export function nestWater(nest: BoughtNest, x: number, y: number): number {
  // In a test tube, the water and the wet cotton (and the air on the cotton's face).
  if (nest.kind === 'tube') return x - nest.x < TEST_TUBE.water + TEST_TUBE.cotton + FIELD_CELL ? 1 : 0;
  const props = materialOf(nest);
  const r = Math.hypot(x - nest.waterX, y - nest.waterY);
  if (props.sponge) return r <= nest.waterRadius ? 1 : 0;
  const d = Math.max(0, r - nest.waterRadius);
  const water = props.waterAtHole * Math.exp(-d / props.waterReach);
  return props.uneven > 0 ? water * Math.max(0, 1 + props.uneven * grainNoise(nest.grain, x - nest.x, y - nest.y)) : water;
}

/**
 * Smooth noise in -1..1 stretched along x, like the bands of wood grain:
 * values on a lattice 30 mm across and 6 mm deep, blended between.
 */
function grainNoise(seed: number, x: number, y: number): number {
  const gx = x / 30;
  const gy = y / 6;
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const fx = gx - i;
  const fy = gy - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = lattice(seed, i, j) + (lattice(seed, i + 1, j) - lattice(seed, i, j)) * sx;
  const bottom = lattice(seed, i, j + 1) + (lattice(seed, i + 1, j + 1) - lattice(seed, i, j + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** A value in -1..1 for lattice point (i, j), hashed from the seed. */
function lattice(seed: number, i: number, j: number): number {
  let h = (seed ^ Math.imul(i, 374761393) ^ Math.imul(j, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

/**
 * Light at (x, y) on the table, as a share of the room's light, 0-1 (N7).
 * Under a module's cover it is nearly dark; where the keeper has lifted it,
 * the room's light, fading over a few mm under the cover's edge. The tubes
 * between modules are clear: the room's light. The sand farm's nest is
 * dark: it is dug into the soil.
 */
export function lightAt(farm: Farm, x: number, y: number): number {
  const table = farm.table;
  if (!table) return 0;
  const nest = moduleAt(table, x, y);
  if (!nest) return 1;
  if (nest.litTo <= nest.litFrom) return COVER_LEAK;
  // Past the lifted part's ends by `out` mm (negative inside it); the block's own ends are no edge.
  const u = x - nest.x;
  const left = nest.litFrom <= 0 ? -Infinity : nest.litFrom - u;
  const right = nest.litTo >= nest.width ? -Infinity : u - nest.litTo;
  const out = Math.max(left, right);
  const lit = Math.min(1, Math.max(0, 0.5 - out / COVER_EDGE));
  return COVER_LEAK + (1 - COVER_LEAK) * lit;
}

/**
 * The air's humidity in a bought nest, per field cell. Each chamber's air is
 * in touch with the block under and round it (its pore humidity: saturated
 * unless the block is nearly dry, water.ts, and no drier than the room), and
 * vapour mixes along the chambers over the material's `vapourReach`, and on
 * along the tubes into the next module (whose walls hold no water); then the
 * room's air coming in through the arena's tube mixes in as far as fresh air
 * reaches (`farm.fresh`). Solved once, by relaxation, since nothing in a
 * bought nest changes it but the keeper laying out the table.
 */
export function nestHumidity(farm: Farm, params: AntParams): void {
  const table = farm.table!;
  const { fieldWidth: w, fieldHeight: h, humidity } = farm;
  const open = new Uint8Array(w * h);
  const floor = new Float64Array(w * h);
  const hold = new Float64Array(w * h);
  for (let fy = 0; fy < h; fy++) {
    for (let fx = 0; fx < w; fx++) {
      const f = fy * w + fx;
      const x = (fx + 0.5) * FIELD_CELL;
      const y = (fy + 0.5) * FIELD_CELL;
      const nest = moduleAt(table, x, y);
      const props = nest ? materialOf(nest) : TUBE_PROPS;
      // A dry block is as dry as the room it stands in, no drier.
      floor[f] = Math.max(params.roomHumidity, nest ? poreHumidity(params, nestWater(nest, x, y)) : 0);
      // Each air cell settles to its floor's humidity held against its open neighbours': a = (cell / reach)².
      // A wet sponge holds the air on it saturated: it gives vapour as fast as the air takes it.
      hold[f] = props.sponge && floor[f]! >= 1 ? 1e3 : (FIELD_CELL / props.vapourReach) ** 2;
      for (let dy = 0; dy < FIELD_CELL; dy++) {
        for (let dx = 0; dx < FIELD_CELL; dx++) {
          const cx = fx * FIELD_CELL + dx;
          const cy = fy * FIELD_CELL + dy;
          if (cx < farm.width && cy < farm.height && farm.material[cy * farm.width + cx] === Material.air) open[f] = 1;
        }
      }
      // A test tube's glass takes up no vapour: its air is near saturated from the wet cotton, and the
      // sweeps below would take long to carry that so far; so start it there.
      humidity[f] = nest?.kind === 'tube' ? 1 : floor[f]!;
    }
  }
  const relax = (f: number, fx: number, fy: number) => {
    if (!open[f]) return;
    let sum = hold[f]! * floor[f]!;
    let weight = hold[f]!;
    const add = (j: number, ok: boolean) => {
      if (!ok || !open[j]) return;
      sum += humidity[j]!;
      weight++;
    };
    add(f - 1, fx > 0);
    add(f + 1, fx < w - 1);
    add(f - w, fy > 0);
    add(f + w, fy < h - 1);
    humidity[f] = sum / weight;
  };
  for (let sweep = 0; sweep < 300; sweep++) {
    if (sweep % 2 === 0) for (let f = 0; f < w * h; f++) relax(f, f % w, Math.floor(f / w));
    else for (let f = w * h - 1; f >= 0; f--) relax(f, f % w, Math.floor(f / w));
  }
  for (let f = 0; f < w * h; f++) humidity[f]! += (params.roomHumidity - humidity[f]!) * farm.fresh[f]!;
}

/** Marks cells as carved out (air), keeping a wall of `EDGE` mm round the block unless told otherwise. */
class Carver {
  constructor(
    private readonly air: Uint8Array,
    private readonly width: number,
    private readonly height: number,
  ) {}

  /** Carves every cell whose middle `inside` accepts, within the box (x0, y0)-(x1, y1). */
  region(x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean, toEdge = false): void {
    const m = toEdge ? 0 : EDGE;
    for (let y = Math.max(m, Math.floor(y0)); y <= Math.min(this.height - 1 - m, Math.ceil(y1)); y++) {
      for (let x = Math.max(m, Math.floor(x0)); x <= Math.min(this.width - 1 - m, Math.ceil(x1)); x++) {
        if (inside(x + 0.5, y + 0.5)) this.air[y * this.width + x] = 1;
      }
    }
  }

  disc(cx: number, cy: number, r: number, toEdge = false): void {
    this.region(cx - r, cy - r, cx + r, cy + r, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, toEdge);
  }

  /** A corridor `width` wide along the quadratic curve from (ax, ay) through control (mx, my) to (bx, by). */
  stroke(ax: number, ay: number, mx: number, my: number, bx: number, by: number, width: number, toEdge = false): void {
    const length = Math.hypot(mx - ax, my - ay) + Math.hypot(bx - mx, by - my);
    const n = Math.max(2, Math.ceil(length / 0.5));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx;
      const y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by;
      this.disc(x, y, width / 2, toEdge);
    }
  }
}

/**
 * Classic rooms (rounded rectangles in a loose grid) or organic chambers
 * (uneven rounded blobs, more jittered), joined by corridors: a random
 * spanning tree over neighbouring chambers, so all are reachable, plus some
 * extra links so there are loops.
 */
function rooms(rng: Rng, carve: Carver, width: number, height: number, layout: 'classic' | 'organic'): { x: number; y: number }[] {
  const organic = layout === 'organic';
  const pad = 12;
  const left = WATER_MARGIN;
  const cols = Math.max(2, Math.round((width - left) / (organic ? 50 : 56)));
  const rows = Math.max(2, Math.round(height / (organic ? 50 : 52)));
  const cw = (width - left - pad) / cols;
  const ch = (height - 2 * pad) / rows;
  const jitter = organic ? 0.22 : 0.08;
  const chambers: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = left + (c + 0.5 + (rng.float() - 0.5) * 2 * jitter) * cw;
      const y = pad + (r + 0.5 + (rng.float() - 0.5) * 2 * jitter) * ch;
      chambers.push({ x, y });
      if (organic) {
        const radius = Math.min(cw, ch) * (0.28 + rng.float() * 0.12);
        const stretch = 1 + rng.float() * 0.5;
        const turn = rng.float() * Math.PI;
        const bumps = Array.from({ length: 7 }, () => 0.82 + rng.float() * 0.3);
        const reach = radius * stretch * 1.15;
        carve.region(x - reach, y - reach, x + reach, y + reach, (px, py) => {
          const dx = px - x;
          const dy = py - y;
          const lx = (dx * Math.cos(turn) + dy * Math.sin(turn)) / stretch;
          const ly = -dx * Math.sin(turn) + dy * Math.cos(turn);
          const a = ((Math.atan2(ly, lx) / (2 * Math.PI) + 1) % 1) * 7;
          const k = Math.floor(a);
          const t = (1 - Math.cos((a - k) * Math.PI)) / 2;
          const f = bumps[k % 7]! * (1 - t) + bumps[(k + 1) % 7]! * t;
          return Math.hypot(lx, ly) <= radius * f;
        });
      } else {
        const w = cw * (0.62 + rng.float() * 0.16);
        const h = ch * (0.56 + rng.float() * 0.14);
        const rr = Math.min(w, h) / 2;
        carve.region(x - w / 2, y - h / 2, x + w / 2, y + h / 2, (px, py) => {
          const qx = Math.max(0, Math.abs(px - x) - (w / 2 - rr));
          const qy = Math.max(0, Math.abs(py - y) - (h / 2 - rr));
          return Math.abs(px - x) <= w / 2 && Math.abs(py - y) <= h / 2 && qx * qx + qy * qy <= rr * rr;
        });
      }
    }
  }
  const pairs: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols) pairs.push([i, i + 1]);
      if (r + 1 < rows) pairs.push([i, i + cols]);
    }
  }
  for (const [i, j] of spanningLinks(rng, chambers.length, pairs, 0.3)) {
    const a = chambers[i]!;
    const b = chambers[j]!;
    // Organic corridors bend: the control point is pushed to one side.
    const bend = organic ? (rng.float() - 0.5) * 18 : 0;
    const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const mx = (a.x + b.x) / 2 + (bend * (b.y - a.y)) / len;
    const my = (a.y + b.y) / 2 - (bend * (b.x - a.x)) / len;
    carve.stroke(a.x, a.y, mx, my, b.x, b.y, organic ? CORRIDOR.organic : CORRIDOR.classic);
  }
  return chambers;
}

/**
 * Hexagonal cells in rows, the acrylic look: thin walls between neighbours,
 * each pair joined or not by a narrow door (a spanning tree plus a few
 * more), so every cell can be reached.
 */
function honeycomb(rng: Rng, carve: Carver, width: number, height: number): { x: number; y: number }[] {
  const r = width <= 100 ? 9.5 : 12;
  const inner = r - 1.6;
  const dx = r * Math.sqrt(3);
  const dy = r * 1.5;
  const pad = 10;
  const chambers: { x: number; y: number }[] = [];
  for (let row = 0, y = pad + r; y < height - pad - r * 0.6; row++, y += dy) {
    for (let x = WATER_MARGIN + r + (row % 2 ? dx / 2 : 0); x < width - pad - r * 0.6; x += dx) {
      chambers.push({ x, y });
      const apothem = inner * Math.cos(Math.PI / 6);
      carve.region(x - inner, y - inner, x + inner, y + inner, (px, py) => {
        // Pointy-topped: its flat sides face left, right and the four diagonals.
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          if ((px - x) * Math.cos(a) + (py - y) * Math.sin(a) > apothem) return false;
        }
        return true;
      });
    }
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < chambers.length; i++) {
    for (let j = i + 1; j < chambers.length; j++) {
      if (Math.hypot(chambers[i]!.x - chambers[j]!.x, chambers[i]!.y - chambers[j]!.y) < dx * 1.05) pairs.push([i, j]);
    }
  }
  for (const [i, j] of spanningLinks(rng, chambers.length, pairs, 0.12)) {
    const a = chambers[i]!;
    const b = chambers[j]!;
    // A door through the wall between the two cells: the middle third of the way between their middles.
    const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const p = at(0.32);
    const q = at(0.68);
    carve.stroke(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2, q.x, q.y, CORRIDOR.door);
  }
  return chambers;
}

/**
 * Links between neighbouring chambers: in a random order, every link that
 * joins two parts not yet joined (Kruskal's spanning tree), and each other
 * link with probability `extra`.
 */
function spanningLinks(rng: Rng, n: number, pairs: [number, number][], extra: number): [number, number][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const keyed = pairs.map((p) => ({ key: rng.float(), p }));
  keyed.sort((a, b) => a.key - b.key);
  const links: [number, number][] = [];
  for (const { p } of keyed) {
    const ra = find(p[0]);
    const rb = find(p[1]);
    if (ra !== rb) {
      parent[ra] = rb;
      links.push(p);
    } else if (rng.chance(extra)) links.push(p);
  }
  return links;
}
