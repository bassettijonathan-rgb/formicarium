/**
 * The farm: the side-view soil between two glass panes (DESIGN.md sections 3 and 6).
 *
 * The soil grid is 1 mm per cell. Ants walk in any air cell: in a thin farm
 * they climb the glass, so tunnels, chambers and the headspace under the lid
 * are all floor to them. Chemical fields (nest odour, dig marks) live on a
 * coarser 2 mm grid; trail pheromone is laid at 1 mm like in the arena.
 */
import { Material } from './materials';
import { valueNoise2D } from './noise';
import type { Rng } from './rng';
import { FARM_HEIGHT, FARM_WIDTH, HEADSPACE, TUBE } from './tank';

/** Size of a chemical-field cell, mm. */
export const FIELD_CELL = 2;

export interface Farm {
  width: number;
  height: number;
  /** A `Material` per cell. */
  material: Uint8Array;
  /** Water content per cell, 0 (dust dry) to 255 (saturated). */
  moisture: Uint8Array;
  /** 1 for a loose grain (dropped by an ant or fallen), 0 for settled, packed soil. */
  loose: Uint8Array;
  /** Cells that may still fall: indices into the grid, processed by `stepSoil`. */
  falling: number[];
  /** Counts changes to the soil, so the page knows when to redraw it. */
  version: number;
  /** Depth of the original soil surface below the lid, per column, in mm. */
  surface: Uint16Array;
  /** Field grid size (`FIELD_CELL` mm per cell). */
  fieldWidth: number;
  fieldHeight: number;
  /** Colony odour, left by resting ants: it marks where the nest is. */
  odour: Float64Array;
  /** Short-lived mark left where a grain was dug out; it draws more digging there. */
  digMark: Float64Array;
  /** Scent of hungry larvae: it draws workers carrying protein to the brood (M3b). */
  broodScent: Float64Array;
  /**
   * Fresh air: 1 in the open headspace, fading along the tunnels the deeper
   * in they lead (by `FRESH_KEEP` per field cell). Underground, ants find the
   * way out by the draught and the drop in CO2 towards the entrance; this is
   * that gradient. Rebuilt from the soil by `updateFresh`.
   */
  fresh: Float64Array;
  /** Trail pheromone, laid by foragers carrying food from the tube to the nest. */
  trail: Float64Array;
  /** Temperature per field cell, °C (M5a; see heat.ts). */
  temperature: Float64Array;
  /** Where the tube opens into the farm, mm. */
  tubeX: number;
  tubeY: number;
}

/**
 * Fills the farm the way a keeper would: a damp sand-loam mix with patches
 * of sandier and clay-rich soil, a slightly uneven surface, and water that
 * has drained toward the bottom.
 */
export function createFarm(rng: Rng): Farm {
  const width = FARM_WIDTH;
  const height = FARM_HEIGHT;
  const material = new Uint8Array(width * height);
  const moisture = new Uint8Array(width * height);
  const surface = new Uint16Array(width);

  // Surface: a few mm of unevenness from pouring and settling.
  const surfaceNoise = valueNoise2D(rng, width, 1, 40);
  for (let x = 0; x < width; x++) surface[x] = Math.round(HEADSPACE + (surfaceNoise(x, 0) - 0.5) * 6);

  const patches = valueNoise2D(rng, width, height, 45);
  const grain = valueNoise2D(rng, width, height, 5);
  const wetness = valueNoise2D(rng, width, height, 30);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (y < surface[x]!) continue; // air under the lid
      const v = 0.6 * patches(x, y) + 0.4 * grain(x, y) + 0.12 * (rng.float() - 0.5);
      const m: Material = v < 0.33 ? Material.sand : v > 0.67 ? Material.clay : Material.loam;
      material[i] = m;

      // Water drains down, and clay holds more of it than sand.
      const depth = (y - surface[x]!) / (height - surface[x]!);
      const retention = m === Material.clay ? 0.12 : m === Material.sand ? -0.12 : 0;
      const w = 0.3 + 0.35 * depth + retention + 0.15 * (wetness(x, y) - 0.5);
      moisture[i] = Math.round(255 * Math.min(1, Math.max(0, w)));
    }
  }
  const fieldWidth = width / FIELD_CELL;
  const fieldHeight = height / FIELD_CELL;
  const farm: Farm = {
    width,
    height,
    material,
    moisture,
    loose: new Uint8Array(width * height),
    falling: [],
    version: 0,
    surface,
    fieldWidth,
    fieldHeight,
    odour: new Float64Array(fieldWidth * fieldHeight),
    digMark: new Float64Array(fieldWidth * fieldHeight),
    broodScent: new Float64Array(fieldWidth * fieldHeight),
    fresh: new Float64Array(fieldWidth * fieldHeight),
    trail: new Float64Array(width * height),
    temperature: new Float64Array(fieldWidth * fieldHeight),
    tubeX: width - 1.5,
    tubeY: TUBE.farmY,
  };
  updateFresh(farm);
  return farm;
}

/** Area dug out below the original soil surface, mm² (one cell is 1 mm²). */
export function excavatedArea(farm: Farm): number {
  let area = 0;
  for (let x = 0; x < farm.width; x++) {
    for (let y = farm.surface[x]!; y < farm.height; y++) if (farm.material[y * farm.width + x] === Material.air) area++;
  }
  return area;
}

/** True if cell (cx, cy) is not walkable: soil, or the glass frame and lid around the farm. */
export function cellSolid(farm: Farm, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= farm.width || cy >= farm.height) return true;
  return farm.material[cy * farm.width + cx] !== Material.air;
}

/** True if an ant cannot stand at (x, y), in mm. */
export function isBlockedFarm(farm: Farm, x: number, y: number): boolean {
  return cellSolid(farm, Math.floor(x), Math.floor(y));
}

/** True if cell (cx, cy) holds soil an ant could dig (not the frame, not air). */
export function isSoil(farm: Farm, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= farm.width || cy >= farm.height) return false;
  return farm.material[cy * farm.width + cx] !== Material.air;
}

/**
 * True if nothing but air lies straight above (x, y) up to the lid: the ant
 * is out in the open headspace rather than in a tunnel. Ants tell this from
 * light and air movement; a column scan stands in for that sense.
 */
export function openAbove(farm: Farm, x: number, y: number): boolean {
  const cx = Math.floor(x);
  for (let cy = Math.floor(y) - 1; cy >= 0; cy--) if (cellSolid(farm, cx, cy)) return false;
  return true;
}

/** A field value at (x, y) mm, interpolated between field-cell centres. */
export function sampleField(farm: Farm, field: Float64Array, x: number, y: number): number {
  const fx = x / FIELD_CELL - 0.5;
  const fy = y / FIELD_CELL - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (cx: number, cy: number) =>
    cx < 0 || cy < 0 || cx >= farm.fieldWidth || cy >= farm.fieldHeight ? 0 : field[cy * farm.fieldWidth + cx]!;
  return (
    at(x0, y0) * (1 - tx) * (1 - ty) +
    at(x0 + 1, y0) * tx * (1 - ty) +
    at(x0, y0 + 1) * (1 - tx) * ty +
    at(x0 + 1, y0 + 1) * tx * ty
  );
}

/** Adds `amount` to the field cell containing (x, y). */
export function addToField(farm: Farm, field: Float64Array, x: number, y: number, amount: number): void {
  const cx = Math.floor(x / FIELD_CELL);
  const cy = Math.floor(y / FIELD_CELL);
  if (cx < 0 || cy < 0 || cx >= farm.fieldWidth || cy >= farm.fieldHeight) return;
  field[cy * farm.fieldWidth + cx]! += amount;
}

/**
 * Evaporates a field over `seconds` and, if `diffusion` > 0 (mm²/s), lets it
 * spread to neighbouring cells (explicit scheme; stable while
 * diffusion * seconds / FIELD_CELL² ≤ 0.25).
 */
export function updateField(
  farm: Farm,
  field: Float64Array,
  seconds: number,
  halfLife: number,
  diffusion: number,
  throughAir = false,
): void {
  const keep = Math.pow(0.5, seconds / halfLife);
  const w = farm.fieldWidth;
  const h = farm.fieldHeight;
  const k = Math.min(0.25, (diffusion * seconds) / (FIELD_CELL * FIELD_CELL));
  const src = k > 0 ? field.slice() : field;
  // A smell carried in the air spreads along tunnels, through the open and through loose sand, not through
  // firm soil.
  const air = throughAir ? airCells(farm) : undefined;
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      if (air && !air[i]) {
        field[i] = 0;
        continue;
      }
      let v = src[i]!;
      if (k > 0) {
        // Zero-flux edges: a missing neighbour (or soil, for a smell in the air) counts as this cell.
        const open = (j: number, ok: boolean) => ok && (!air || air[j] === 1);
        const l = open(i - 1, cx > 0) ? src[i - 1]! : v;
        const r = open(i + 1, cx < w - 1) ? src[i + 1]! : v;
        const u = open(i - w, cy > 0) ? src[i - w]! : v;
        const d = open(i + w, cy < h - 1) ? src[i + w]! : v;
        v += k * (l + r + u + d - 4 * v);
      }
      v *= keep;
      field[i] = v < 1e-6 ? 0 : v;
    }
  }
}

/** Scratch: 1 for field cells air can pass through (see `hasAir`). */
let air = new Uint8Array(0);

function airCells(farm: Farm): Uint8Array {
  const w = farm.fieldWidth;
  const h = farm.fieldHeight;
  if (air.length !== w * h) air = new Uint8Array(w * h);
  for (let fy = 0; fy < h; fy++) for (let fx = 0; fx < w; fx++) air[fy * w + fx] = hasAir(farm, fx, fy, true) ? 1 : 0;
  return air;
}

/** How much fresher air is per field cell nearer the open, along a tunnel. */
const FRESH_KEEP = 0.85;

/**
 * Spreads fresh air from the open headspace into the tunnels: one sweep down
 * and one back, so a change in the soil reaches far along a tunnel within a
 * few calls. Field cells that are all soil hold none.
 */
export function updateFresh(farm: Farm): void {
  const w = farm.fieldWidth;
  const h = farm.fieldHeight;
  const fresh = farm.fresh;
  // Open sky: everything above the first soil in each column (both cell columns of a field column).
  const openTo = new Int32Array(w);
  for (let fx = 0; fx < w; fx++) {
    let top = farm.height;
    for (let dx = 0; dx < FIELD_CELL; dx++) {
      const cx = fx * FIELD_CELL + dx;
      let y = 0;
      while (y < farm.height && farm.material[y * farm.width + cx] === Material.air) y++;
      top = Math.min(top, y);
    }
    openTo[fx] = Math.floor(top / FIELD_CELL);
  }
  const sweep = (from: number, to: number, by: number) => {
    for (let i = from; i !== to; i += by) {
      const fx = i % w;
      const fy = (i - fx) / w;
      if (fy < openTo[fx]!) {
        fresh[i] = 1;
        continue;
      }
      if (!hasAir(farm, fx, fy)) {
        fresh[i] = 0;
        continue;
      }
      let best = 0;
      if (fx > 0) best = Math.max(best, fresh[i - 1]!);
      if (fx < w - 1) best = Math.max(best, fresh[i + 1]!);
      if (fy > 0) best = Math.max(best, fresh[i - w]!);
      if (fy < h - 1) best = Math.max(best, fresh[i + w]!);
      fresh[i] = best * FRESH_KEEP;
    }
  };
  sweep(0, w * h, 1);
  sweep(w * h - 1, -1, -1);
}

/**
 * True if a field cell holds any open air, or, when `seep`, loose grains, which a smell seeps between
 * (the way out an ant follows is open air only).
 */
function hasAir(farm: Farm, fx: number, fy: number, seep = false): boolean {
  for (let dy = 0; dy < FIELD_CELL; dy++) {
    for (let dx = 0; dx < FIELD_CELL; dx++) {
      const c = (fy * FIELD_CELL + dy) * farm.width + fx * FIELD_CELL + dx;
      if (farm.material[c] === Material.air || (seep && farm.loose[c])) return true;
    }
  }
  return false;
}
