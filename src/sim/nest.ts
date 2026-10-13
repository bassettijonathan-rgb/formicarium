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
 * The same `Farm` grid holds it as holds the sand farm: the cells are walls
 * or air, and the fields (smells, warmth, humidity, mould) work as before.
 */
import { type Farm, FIELD_CELL, updateFresh } from './farm';
import { Material } from './materials';
import type { AntParams } from './params';
import type { Rng } from './rng';
import { poreHumidity } from './water';

export type NestSize = 'S' | 'M' | 'L';
export type NestLayout = 'classic' | 'organic' | 'honeycomb';

/** What the keeper buys: a size and a layout (Nests 1 sells ytong only). */
export interface NestSetup {
  size: NestSize;
  layout: NestLayout;
}

/** The page's new tank: a medium classic ytong nest. */
export const DEFAULT_NEST: NestSetup = { size: 'M', layout: 'classic' };

/** Floor size of each size of nest, mm (N4): a young colony, a few hundred workers, a thousand or more. */
export const NEST_SIZES: Record<NestSize, { width: number; height: number }> = {
  S: { width: 100, height: 100 },
  M: { width: 200, height: 150 },
  L: { width: 300, height: 200 },
};

export interface BoughtNest {
  material: Material;
  size: NestSize;
  layout: NestLayout;
  /** Depth of the chambers, and the block's thickness, mm. */
  depth: number;
  thickness: number;
  /** The water hole: its middle and radius, mm. */
  waterX: number;
  waterY: number;
  waterRadius: number;
  /** Middles of the chambers, mm, in the order they were carved. */
  chambers: { x: number; y: number }[];
}

/** Chambers are 5 mm deep, as in bought nests (N4); the block is 25 mm thick. */
const DEPTH = 5;
const THICKNESS = 25;

/** Nothing is carved this close to the block's edge, mm, except the way to the tube. */
const EDGE = 3;
/** Room left at the water end for the hole and the wall round it, mm. */
const WATER_MARGIN = 30;

/**
 * Water in the ytong round the hole, fraction of saturation, and how far it
 * reaches: it falls by e every `WATER_REACH` mm from the hole's edge. Rough
 * values chosen so a medium nest is wet at its water end and dry at the far
 * one, as keepers describe ytong nests (DESIGN.md 3.5).
 */
const WATER_AT_HOLE = 0.6;
const WATER_REACH = 45;

/**
 * Water vapour spreads along the chambers about this far before the ytong
 * round it takes it back up or gives more, mm (rough): the air in a chamber
 * is a mix of the ytong under it and of its neighbours'.
 */
const VAPOUR_REACH = 20;

/** Corridor widths, mm (N4: 3-4 mm), and the honeycomb's doors. */
const CORRIDOR = { classic: 3.8, organic: 3.5, door: 2.6, port: 4 } as const;

/**
 * Carves a new bought nest from the seed's layout stream: chambers laid out
 * in the chosen style, joined by corridors so every chamber can be reached,
 * a corridor to the tube's port in the right end, and the water hole at the
 * left end.
 */
export function createNest(rng: Rng, setup: NestSetup, params: AntParams): Farm {
  const { width, height } = NEST_SIZES[setup.size];
  const air = new Uint8Array(width * height);
  const carve = new Carver(air, width, height);
  const chambers = setup.layout === 'honeycomb' ? honeycomb(rng, carve, width, height) : rooms(rng, carve, width, height, setup.layout);

  // The tube's port, in the right end a third of the way from the back, joined to the nearest chamber.
  const portY = Math.round(height * 0.35) + 0.5;
  let near = chambers[0]!;
  for (const c of chambers) if (Math.hypot(c.x - width, c.y - portY) < Math.hypot(near.x - width, near.y - portY)) near = c;
  carve.stroke(near.x, near.y, near.x, near.y, width, portY, CORRIDOR.port, true);

  const nest: BoughtNest = {
    material: Material.ytong,
    size: setup.size,
    layout: setup.layout,
    depth: DEPTH,
    thickness: THICKNESS,
    waterX: 14,
    waterY: height / 2,
    waterRadius: setup.size === 'S' ? 7 : 9,
    chambers,
  };
  const material = new Uint8Array(width * height);
  const moisture = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      material[i] = air[i] ? Material.air : Material.ytong;
      // Under an air cell this is the chamber's floor.
      moisture[i] = Math.round(255 * nestWater(nest, x + 0.5, y + 0.5));
    }
  }
  const fieldWidth = Math.ceil(width / FIELD_CELL);
  const fieldHeight = Math.ceil(height / FIELD_CELL);
  const cells = fieldWidth * fieldHeight;
  const farm: Farm = {
    width,
    height,
    material,
    moisture,
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
    tubeX: width - 1.5,
    tubeY: portY,
    nest,
  };
  // The tube's air reaches into the nest along the corridors; it is the only opening, so let it settle.
  for (let k = 0; k < 60; k++) updateFresh(farm);
  nestHumidity(farm, params);
  return farm;
}

/** Water in the ytong at (x, y), fraction of saturation (it does not change: the hole refills itself, N6). */
export function nestWater(nest: BoughtNest, x: number, y: number): number {
  const d = Math.max(0, Math.hypot(x - nest.waterX, y - nest.waterY) - nest.waterRadius);
  return WATER_AT_HOLE * Math.exp(-d / WATER_REACH);
}

/**
 * The air's humidity in a bought nest, per field cell. Each chamber's air is
 * in touch with the ytong under and round it (its pore humidity: saturated
 * unless the ytong is nearly dry, water.ts), and vapour mixes along the
 * chambers over `VAPOUR_REACH`; then the room's air coming in through the
 * tube mixes in as far as fresh air reaches (`farm.fresh`). Solved once, by
 * relaxation, since nothing in a bought nest changes it.
 */
export function nestHumidity(farm: Farm, params: AntParams): void {
  const nest = farm.nest!;
  const { fieldWidth: w, fieldHeight: h, humidity } = farm;
  const open = new Uint8Array(w * h);
  const floor = new Float64Array(w * h);
  for (let fy = 0; fy < h; fy++) {
    for (let fx = 0; fx < w; fx++) {
      const f = fy * w + fx;
      floor[f] = poreHumidity(params, nestWater(nest, (fx + 0.5) * FIELD_CELL, (fy + 0.5) * FIELD_CELL));
      for (let dy = 0; dy < FIELD_CELL; dy++) {
        for (let dx = 0; dx < FIELD_CELL; dx++) {
          const x = fx * FIELD_CELL + dx;
          const y = fy * FIELD_CELL + dy;
          if (x < farm.width && y < farm.height && farm.material[y * farm.width + x] === Material.air) open[f] = 1;
        }
      }
      humidity[f] = floor[f]!;
    }
  }
  // Each air cell settles to its floor's humidity held against its open neighbours': a = (cell / reach)².
  const a = (FIELD_CELL / VAPOUR_REACH) ** 2;
  const relax = (f: number, fx: number, fy: number) => {
    if (!open[f]) return;
    let sum = a * floor[f]!;
    let weight = a;
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
