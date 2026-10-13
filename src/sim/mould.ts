/**
 * Mould (DESIGN.md section 7.8, M5b).
 *
 * Mould needs something to feed on and damp air. In the farm that is a
 * corpse the workers have not carried out: once it has lain `corpseMouldDays`,
 * mould grows on it, faster where it is warm, and its threads and spores
 * spread from it through damp soil and air (`farm.mould`, on the 2 mm grid).
 * Away from the corpse there is nothing to feed on and it dies back, so it
 * reaches about a cm round the corpse; in dry air it dies back fast. Brood
 * lying in it dies (brood.ts), and nurses carry brood out of it (farmAnts.ts).
 * Carrying the dead out of the nest is what keeps it clean (Diez et al. 2014).
 *
 * In the arena, an insect left uneaten for `preyMouldDays` goes mouldy and
 * ants no longer take it: the keeper should clear it away.
 */
import { AntState, type Ants, Place } from './ants';
import { type Farm, FIELD_CELL, smoothAt } from './farm';
import type { FoodDrop } from './food';
import { propsAt } from './nest';
import type { AntParams } from './params';
import type { Piece } from './prey';

/** How thickly mould covers a corpse when it starts, 0-1. */
const MOULD_SEED = 0.02;

/** Scratch: the mould field before this update. */
let before = new Float64Array(0);
/** Scratch: per field cell, how thickly mould covers the corpses in it (0 if none), the source it spreads from. */
let source = new Float64Array(0);

/**
 * How thickly mould covers a corpse that has lain `deadFor` tank days at
 * `warmth` (the growth rate's factor for its temperature): none until
 * `corpseMouldDays`, then a logistic rise from a speck to full cover.
 */
export function corpseMould(params: AntParams, deadFor: number, warmth: number): number {
  const t = deadFor - params.corpseMouldDays;
  if (t < 0) return 0;
  return 1 / (1 + (1 / MOULD_SEED - 1) * Math.exp(-params.mouldGrowth * warmth * t));
}

/** Lets mould grow, spread and die back for `seconds` of ant time (life clock). Does nothing unless `mould` is on. */
export function updateMould(farm: Farm, ants: Ants, params: AntParams, seconds: number, prey: readonly Piece[] = []): void {
  if (!params.mould) return;
  const days = seconds / params.daySeconds;
  const w = farm.fieldWidth;
  const h = farm.fieldHeight;
  const n = w * h;
  const mould = farm.mould;
  if (source.length !== n) {
    source = new Float64Array(n);
    before = new Float64Array(n);
  } else source.fill(0);
  let any = false;
  for (let i = 0; i < ants.count; i++) {
    if (ants.state[i] !== AntState.dead || ants.place[i] !== Place.farm || ants.carriedBy[i] !== -1) continue;
    if (ants.deadFor[i]! < params.corpseMouldDays) continue;
    const fx = Math.min(w - 1, Math.max(0, Math.floor(ants.x[i]! / FIELD_CELL)));
    const fy = Math.min(h - 1, Math.max(0, Math.floor(ants.y[i]! / FIELD_CELL)));
    const f = fy * w + fx;
    // Mould takes hold only on a corpse lying in damp air.
    if (farm.humidity[f]! < params.mouldHumidity) continue;
    const warmth = Math.pow(2, (farm.temperature[f]! - 25) / params.mouldDoubling);
    source[f] = Math.max(source[f]!, corpseMould(params, ants.deadFor[i]!, warmth));
    any = true;
  }
  // A piece of insect left uneaten in the nest feeds mould as a corpse does, from when it went mouldy (Arena 3, B8).
  for (const p of prey) {
    if (!p.mouldy || p.place !== Place.farm || p.carriedBy >= 0) continue;
    const fx = Math.min(w - 1, Math.max(0, Math.floor(p.x / FIELD_CELL)));
    const fy = Math.min(h - 1, Math.max(0, Math.floor(p.y / FIELD_CELL)));
    const f = fy * w + fx;
    if (farm.humidity[f]! < params.mouldHumidity) continue;
    const warmth = Math.pow(2, (farm.temperature[f]! - 25) / params.mouldDoubling);
    const since = p.age - params.preyMouldDays + params.corpseMouldDays;
    source[f] = Math.max(source[f]!, corpseMould(params, since, warmth));
    any = true;
  }
  if (!any && farm.mouldy === 0) return; // nothing to grow on, and no mould left
  before.set(mould);
  // Explicit diffusion on the 2 mm grid, through damp cells only.
  // In a bought nest, each module's material decides how readily mould creeps through it and how fast it dies back (Nests 2).
  const table = farm.table;
  const k0 = (params.mouldSpread * days) / (FIELD_CELL * FIELD_CELL);
  const damp = (j: number) => farm.humidity[j]! >= params.mouldHumidity;
  let total = 0;
  for (let fy = 0; fy < h; fy++) {
    for (let fx = 0; fx < w; fx++) {
      const i = fy * w + fx;
      const m = before[i]!;
      const humid = damp(i);
      const material = table ? propsAt(table, fx, fy) : undefined;
      const k = Math.min(0.2, k0 * (material?.mouldSpread ?? 1));
      const decay = params.mouldDecay * (material?.mouldDecay ?? 1);
      let next = m;
      if (humid) {
        let flow = 0;
        if (fx > 0 && damp(i - 1)) flow += before[i - 1]! - m;
        if (fx < w - 1 && damp(i + 1)) flow += before[i + 1]! - m;
        if (fy > 0 && damp(i - w)) flow += before[i - w]! - m;
        if (fy < h - 1 && damp(i + w)) flow += before[i + w]! - m;
        next += k * flow;
      }
      // Away from food, or in dry air, it dies back (fast in dry air); on a corpse it is as thick as the corpse's cover.
      next *= 1 - Math.min(1, decay * (humid ? 1 : 10) * days);
      next = Math.max(next, source[i]!);
      next = next < 1e-4 ? 0 : Math.min(1, next);
      mould[i] = next;
      total += next;
    }
  }
  farm.mouldy = total;
}

/** Thickness of the mould at (x, y) in the farm, 0-1. */
export function mouldAt(farm: Farm, x: number, y: number): number {
  return farm.mouldy === 0 ? 0 : smoothAt(farm, farm.mould, x, y);
}

/**
 * Insects in the arena age by `seconds` of ant time (life clock), faster when
 * warm, and go mouldy after `preyMouldDays`. Does nothing unless `mould` is on.
 */
export function agePrey(food: FoodDrop[], params: AntParams, seconds: number): void {
  if (!params.mould) return;
  const warmth = Math.pow(2, (params.roomTemperature - 25) / params.mouldDoubling);
  for (const drop of food) {
    if (drop.protein <= 0 || drop.mouldy) continue;
    drop.age += (seconds / params.daySeconds) * warmth;
    if (drop.age >= params.preyMouldDays) drop.mouldy = true;
  }
}
