/**
 * Water in the farm (DESIGN.md sections 3.1 and 7.7, M5b).
 *
 * Each soil cell holds water (`farm.moisture`). Water seeps from cell to
 * cell down the soil's water potential: wetter soil gives to drier, gravity
 * pulls it down, and clay holds more than sand at the same potential. With
 * nothing taking water out, the soil settles back to the drained state it was
 * poured in. Where soil meets the air it evaporates, faster where it is warm
 * and where the air is fresh: the surface under the lid dries first, the
 * deep nest last. Damp soil is strong and dry sand caves in (section 3.2),
 * so a farm left unwatered loses its tunnels. The keeper pours water from above.
 *
 * The air's humidity follows the soil: air in soil pores is saturated until
 * the soil is nearly dry, and the open headspace mixes with the room's air
 * through the lid. Brood dries out in dry air, and nurses carry it to where
 * the air is damp (farmAnts.ts).
 *
 * Water is tracked in whole units of `moisture` (1/255 of saturation); what
 * an update moves that is not a whole unit is kept in `moistureRest`, so slow
 * drying is not lost to rounding.
 */
import { DRAINED_RISE, type Farm, FIELD_CELL, RETENTION, smoothAt } from './farm';
import { Material } from './materials';
import type { AntParams } from './params';
import { FARM_HEIGHT, HEADSPACE } from './tank';

/** How much more water the drained soil holds per mm deeper, fraction of saturation. */
const RISE_PER_MM = DRAINED_RISE / (FARM_HEIGHT - HEADSPACE);

/** Water one cell holds when saturated, µL: 1 mm² of a farm 5 mm thick, 40% of it pores. */
export const CELL_SATURATION = 2;

/** The keeper's pipette wets a strip this wide at most, mm. */
export const POUR_WIDTH = 30;

/** Scratch per cell, fraction of saturation: water, water potential, and the change this update. */
let wet = new Float64Array(0);
let potential = new Float64Array(0);
let delta = new Float64Array(0);
/** `RETENTION` as a typed array, for the inner loop. */
const HOLD = Float64Array.from(RETENTION);

/**
 * Moves the soil's water for `seconds` of ant time (it runs on the life clock,
 * D6), then recomputes the air's humidity. Does nothing unless `waterFlow` is on.
 */
export function updateWater(farm: Farm, params: AntParams, seconds: number): void {
  if (!params.waterFlow) return;
  const days = seconds / params.daySeconds;
  const { width: w, height: h, material, moisture, moistureRest, fresh, temperature, fieldWidth } = farm;
  const n = w * h;
  if (delta.length !== n) {
    wet = new Float64Array(n);
    potential = new Float64Array(n);
    delta = new Float64Array(n);
  }
  for (let y = 0, i = 0; y < h; y++) {
    const fall = RISE_PER_MM * y;
    for (let x = 0; x < w; x++, i++) {
      const m = material[i]!;
      const v = (moisture[i]! + moistureRest[i]!) / 255;
      wet[i] = v;
      potential[i] = m === Material.air ? 0 : v - HOLD[m]! - fall;
      delta[i] = 0;
    }
  }
  // Explicit scheme on the 1 mm grid: stable while the rate per update stays below 1/4.
  const k = Math.min(0.2, params.seepage * days);
  // Dry soil passes water slowly: its pores have emptied.
  const conductAt = 2 * params.seepDry;
  const dryAt = params.evaporation * days;
  const airDryBelow = params.airDryBelow;
  const doubling = params.vapourDoubling;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      if (material[i] === Material.air) continue;
      const wi = wet[i]!;
      const pi = potential[i]!;
      // Seepage to the right and downwards (each pair of cells once).
      if (x + 1 < w && material[i + 1] !== Material.air) {
        const f = k * Math.min(1, (wi + wet[i + 1]!) / conductAt) * (pi - potential[i + 1]!);
        delta[i]! -= f;
        delta[i + 1]! += f;
      }
      if (y + 1 < h && material[i + w] !== Material.air) {
        const f = k * Math.min(1, (wi + wet[i + w]!) / conductAt) * (pi - potential[i + w]!);
        delta[i]! -= f;
        delta[i + w]! += f;
      }
      // Evaporation where the cell meets the air: as fast as the freshest air beside it allows.
      if (wi <= 0) continue;
      let open = 0;
      if (x > 0 && material[i - 1] === Material.air) open = Math.max(open, fresh[fieldIndex(x - 1, y, fieldWidth)]!);
      if (x + 1 < w && material[i + 1] === Material.air) open = Math.max(open, fresh[fieldIndex(x + 1, y, fieldWidth)]!);
      if (y > 0 && material[i - w] === Material.air) open = Math.max(open, fresh[fieldIndex(x, y - 1, fieldWidth)]!);
      if (y + 1 < h && material[i + w] === Material.air) open = Math.max(open, fresh[fieldIndex(x, y + 1, fieldWidth)]!);
      if (open === 0) continue;
      const vapour = Math.pow(2, (temperature[fieldIndex(x, y, fieldWidth)]! - 25) / doubling);
      // A face stops giving water as it dries to the point where its pores' air dries.
      delta[i]! -= dryAt * open * vapour * Math.min(1, wi / airDryBelow);
    }
  }
  let changed = false;
  for (let i = 0; i < n; i++) {
    const d = delta[i]!;
    if (d === 0 || material[i] === Material.air) continue;
    const before = moisture[i]!;
    if (setWater(farm, i, before + moistureRest[i]! + d * 255)) {
      changed = true;
      // A ceiling that dried may no longer hold.
      if (moisture[i]! < before && !farm.loose[i] && i + w < n && material[i + w] === Material.air) farm.falling.push(i);
    }
  }
  if (changed) farm.version++;
  updateHumidity(farm, params);
}

/** Index of the field cell holding cell (x, y). */
function fieldIndex(x: number, y: number, fieldWidth: number): number {
  return ((y / FIELD_CELL) | 0) * fieldWidth + ((x / FIELD_CELL) | 0);
}

/** Puts `units` of water (1/255 of saturation) in cell `i`, keeping what is not a whole unit. True if `moisture` changed. */
function setWater(farm: Farm, i: number, units: number): boolean {
  const whole = Math.min(255, Math.max(0, Math.round(units)));
  farm.moistureRest[i] = Math.max(-0.5, Math.min(0.5, units - whole));
  if (whole === farm.moisture[i]) return false;
  farm.moisture[i] = whole;
  return true;
}

/**
 * Relative humidity of the air per field cell. The headspace under the lid
 * is one body of air: it takes up water from the soil surface and loses it
 * to the room through the lid's vents, so its humidity lies between the
 * surface's pores and the room's. Air near soil has the humidity of the
 * soil pores within a cell of it (saturated unless the soil is nearly dry),
 * mixed with the headspace's as far as fresh air reaches down the tunnels.
 */
export function headspaceHumidity(farm: Farm, params: AntParams): number {
  const { width: w, height: h, material, moisture } = farm;
  let sum = 0;
  let n = 0;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && material[y * w + x] === Material.air) y++;
    if (y === h) continue;
    sum += poreHumidity(params, moisture[y * w + x]! / 255);
    n++;
  }
  const surface = n > 0 ? sum / n : params.roomHumidity;
  return surface + (params.roomHumidity - surface) * params.ventilation;
}

/** Recomputes `farm.humidity` from the soil, as `headspaceHumidity` describes. */
export function updateHumidity(farm: Farm, params: AntParams): void {
  const { width: w, height: h, material, moisture, fieldWidth: fw, fieldHeight: fh } = farm;
  const headspace = headspaceHumidity(farm, params);
  for (let fy = 0; fy < fh; fy++) {
    for (let fx = 0; fx < fw; fx++) {
      let sum = 0;
      let n = 0;
      for (let cy = Math.max(0, fy * FIELD_CELL - 1); cy <= Math.min(h - 1, (fy + 1) * FIELD_CELL); cy++) {
        for (let cx = Math.max(0, fx * FIELD_CELL - 1); cx <= Math.min(w - 1, (fx + 1) * FIELD_CELL); cx++) {
          const i = cy * w + cx;
          if (material[i] === Material.air) continue;
          sum += poreHumidity(params, moisture[i]! / 255);
          n++;
        }
      }
      const f = fy * fw + fx;
      const near = n > 0 ? sum / n : headspace;
      farm.humidity[f] = near + (headspace - near) * farm.fresh[f]!;
    }
  }
}

/** Relative humidity of the air in soil pores holding `water` (fraction of saturation). */
export function poreHumidity(params: AntParams, water: number): number {
  return Math.min(1, water / params.airDryBelow);
}

/** Relative humidity of the air at (x, y) in the farm, 0-1. */
export function humidityAt(farm: Farm, x: number, y: number): number {
  return smoothAt(farm, farm.humidity, x, y);
}

/**
 * The keeper pours `params.pourVolume` µL from above at x. It soaks down
 * through a strip `POUR_WIDTH` wide, most of it in the middle, so the wetted
 * soil ends in a rounded front like water poured on sand; each column is
 * wetted from the top down to `fieldCapacity` as far as its share goes.
 * Water that soaks past the bottom is lost. Returns the water the soil took up, µL.
 */
export function pourWater(farm: Farm, params: AntParams, x: number): number {
  const half = POUR_WIDTH / 2;
  const x0 = Math.max(0, Math.ceil(x - half));
  const x1 = Math.min(farm.width - 1, Math.floor(x + half));
  if (x1 < x0) return 0;
  // Shares by column: a parabola, highest under the pour.
  const weights: number[] = [];
  let total = 0;
  for (let cx = x0; cx <= x1; cx++) {
    const d = (cx + 0.5 - x) / half;
    const wgt = Math.max(0, 1 - d * d);
    weights.push(wgt);
    total += wgt;
  }
  if (total === 0) return 0;
  const w = farm.width;
  let taken = 0;
  for (let cx = x0; cx <= x1; cx++) {
    let left = (params.pourVolume / CELL_SATURATION) * (weights[cx - x0]! / total); // fraction of saturation
    for (let cy = 0; cy < farm.height && left > 0; cy++) {
      const i = cy * w + cx;
      if (farm.material[i] === Material.air) continue;
      const room = params.fieldCapacity - (farm.moisture[i]! + farm.moistureRest[i]!) / 255;
      if (room <= 0) continue;
      const add = Math.min(room, left);
      setWater(farm, i, farm.moisture[i]! + farm.moistureRest[i]! + add * 255);
      left -= add;
      taken += add;
    }
  }
  farm.version++;
  if (params.waterFlow) updateHumidity(farm, params);
  return taken * CELL_SATURATION;
}
