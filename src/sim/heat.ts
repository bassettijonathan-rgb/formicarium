/**
 * Warmth in the farm (DESIGN.md sections 3.1 and 7.6, M5a).
 *
 * The farm's temperature is a field on the 2 mm chemical grid. The heat mat,
 * when the keeper has put it under the farm, holds the bottom cells above it
 * at `matTemperature`; heat spreads through the farm and leaks out through
 * the glass to the room. Between two panes a few mm apart the glass loses
 * heat fast, so the mat warms only the soil within a few cm of it, the way a
 * keeper's mat makes a warm corner rather than a warm farm. The arena and the
 * tube are at room temperature.
 */
import { type Farm, FIELD_CELL, smoothAt } from './farm';
import type { AntParams } from './params';

/** Where the keeper has put the heat mat: under the farm's bottom edge from `x` to `x + width`, mm. */
export interface HeatMat {
  x: number;
  width: number;
}

/** A keeper's mat for a small formicarium: 8 cm wide (rough). */
export const MAT_WIDTH = 80;

/**
 * Lets heat flow for `seconds`: diffusion (explicit scheme, stable while
 * `heatDiffusivity` × seconds / FIELD_CELL² ≤ 0.25), loss to the room, and
 * the mat holding the cells over it at its temperature.
 */
export function updateTemperature(farm: Farm, mat: HeatMat | null, params: AntParams, seconds: number): void {
  if (!params.heatFlow) return;
  const t = farm.temperature;
  const w = farm.fieldWidth;
  const h = farm.fieldHeight;
  const k = Math.min(0.25, (params.heatDiffusivity * seconds) / (FIELD_CELL * FIELD_CELL));
  const loss = 1 - Math.pow(0.5, seconds / params.heatLossHalfLife);
  const room = params.roomTemperature;
  const src = t.slice();
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      const v = src[i]!;
      // Zero-flux edges: the frame passes no heat; what leaves goes through the glass.
      const l = cx > 0 ? src[i - 1]! : v;
      const r = cx < w - 1 ? src[i + 1]! : v;
      const u = cy > 0 ? src[i - w]! : v;
      const d = cy < h - 1 ? src[i + w]! : v;
      const next = v + k * (l + r + u + d - 4 * v);
      t[i] = next + (room - next) * loss;
    }
  }
  if (mat) {
    const from = Math.max(0, Math.floor(mat.x / FIELD_CELL));
    const to = Math.min(w, Math.ceil((mat.x + mat.width) / FIELD_CELL));
    for (let cx = from; cx < to; cx++) t[(h - 1) * w + cx] = params.matTemperature;
  }
}

/** Temperature at (x, y) in the farm, °C, interpolated between field-cell centres. */
export function temperatureAt(farm: Farm, x: number, y: number): number {
  return smoothAt(farm, farm.temperature, x, y);
}

/** Walking speed at temperature `celsius`, mm/s: it doubles every `speedDoubling` °C (Hurlbert et al. 2008). */
export function speedAt(params: AntParams, celsius: number): number {
  return params.speed * Math.pow(2, (celsius - 25) / params.speedDoubling);
}
