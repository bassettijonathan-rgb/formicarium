/**
 * Keeping a tank (M6a; DESIGN.md D7 and section 10).
 *
 * A save is the tank's seed, the keeper's log and a snapshot of the world,
 * taken every few seconds while the page is open. On reopening, the page
 * loads the last snapshot and lets the tank live through the time it was
 * closed (at 1×, up to `CATCH_UP_DAYS` tank days), then reports what happened.
 *
 * The snapshot is the `World` itself: plain data, which browser storage keeps
 * as it is (a structured clone). Real time never enters the simulation: the
 * page measures how long it was closed and asks for that many steps.
 */
import { Cause, Place, createAnts } from './ants';
import { dropRadius } from './food';
import { createBrood } from './brood';
import type { Census } from './history';
import { stampDecorations } from './decor';
import { type LoggedCommand, createTank, furnishArena } from './keeper';
import type { Farm } from './farm';
import { type BoughtNest, TEST_TUBE_SETUP, nestMaterialName } from './nest';
import { TANK_ARENA } from './tank';
import { STEPS_PER_SECOND } from './time';
import type { World } from './world';

/**
 * The save format. A model change that only adds state does not change it:
 * `loadWorld` fills what an older save lacks. Raise it when old saves can no
 * longer be carried over; they are then set aside rather than loaded.
 */
export const SAVE_VERSION = 1;

export interface Save {
  version: number;
  seed: number;
  /** The keeper's name for the tank (U2); saves from before the tank list have none. */
  name?: string;
  /** When the page saved, ms since 1970 by the page's clock; never read by the simulation. */
  savedAt: number;
  log: LoggedCommand[];
  world: World;
}

/** A closed tank lives on for at most this many tank days (D7). */
export const CATCH_UP_DAYS = 3;

/**
 * How many steps a tank closed for `awaySeconds` of real time lives through
 * on reopening: real time at 1×, capped at `CATCH_UP_DAYS` tank days.
 */
export function catchUpSteps(world: World, awaySeconds: number): number {
  const cap = CATCH_UP_DAYS * world.params.daySeconds * STEPS_PER_SECOND;
  return Math.max(0, Math.min(cap, Math.floor(awaySeconds * STEPS_PER_SECOND)));
}

/**
 * The world in a save, ready to run, or null when the save is from a format
 * this code cannot read. State that the save predates (a model added since)
 * starts as it would in a new tank, and state the model no longer has is
 * dropped. The parameters are always the current model's: they are the
 * model, not the tank's state.
 */
export function loadWorld(save: Save): World | null {
  if (save.version !== SAVE_VERSION || !save.world) return null;
  const saved = save.world;
  const old = saved.farm as Farm & { nest?: BoughtNest | null };
  // A tank saved before bought nests lives in the sand farm, and goes on doing so.
  old.table ??= null;
  const first = old.table?.modules[0] ?? old.nest;
  // A nest saved before Nests 2 is ytong, its cover on.
  const template = createTank(
    save.seed,
    first ? (first.kind === 'tube' ? TEST_TUBE_SETUP : { size: first.size, layout: first.layout, material: nestMaterialName(first.material) }) : null,
  );
  if (old.nest) tableFromNest(old, old.nest, template.farm.table!.modules[0]!);
  delete old.nest;
  template.ants = createAnts(saved.ants?.count ?? 0);
  template.brood = createBrood(saved.brood?.stage?.length ?? 0);
  fill(saved as unknown as Record<string, unknown>, template as unknown as Record<string, unknown>);
  saved.params = template.params;
  if (saved.arena.width !== template.arena.width || saved.arena.height !== template.arena.height) moveIntoBigArena(saved);
  else {
    // A tank saved while its stones, bark and tube were walls (before A5): they become ground the ants climb.
    saved.arena.wall.fill(0);
    stampDecorations(saved.arena, saved.decor);
  }
  return saved;
}

/**
 * A bought nest saved before Nests 3 becomes the only module on its table,
 * where it lay, with the one port it was carved with holding the arena's
 * tube. What it was saved without is as in a new tank (`fresh`).
 */
function tableFromNest(farm: Farm, nest: BoughtNest, fresh: BoughtNest): void {
  const kept = nest as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(fresh)) if (!(key in kept)) kept[key] = structuredClone(value);
  nest.id = 1;
  nest.x = 0;
  nest.y = 0;
  nest.width = farm.width;
  nest.height = farm.height;
  nest.ports = [{ x: farm.tubeX, y: farm.tubeY, dx: 1, dy: 0 }];
  farm.table = { modules: [nest], tubes: [], arena: { module: 1, port: 0 }, nextId: 2 };
}

/**
 * A tank saved before the arena grew (DESIGN.md A2) moves into the new box:
 * the old floor goes in at the tube's end, so the ants, the food, the dead
 * and the trails keep their places relative to the tube's mouth, and the
 * decorations are laid out round them.
 */
function moveIntoBigArena(world: World): void {
  const old = world.arena;
  const offset = TANK_ARENA.height / 2 - old.entranceY;
  const inArena: number[] = [];
  for (let i = 0; i < world.ants.count; i++) if (world.ants.place[i] === Place.arena) inArena.push(i);
  furnishArena(world, [
    ...inArena.map((i) => ({ x: world.ants.x[i]!, y: world.ants.y[i]! + offset, radius: 8 })),
    ...world.food.map((d) => ({ x: d.x, y: d.y + offset, radius: dropRadius(d.volume) + 8 })),
  ]);
  const arena = world.arena;
  for (let y = 0; y < old.height; y++) {
    const ny = y + offset;
    if (ny < 0 || ny >= arena.height) continue;
    for (let x = 0; x < Math.min(old.width, arena.width); x++) {
      const cell = ny * arena.width + x;
      if (!arena.wall[cell]) arena.trail[cell] = old.trail[y * old.width + x]!;
    }
  }
  for (const i of inArena) world.ants.y[i]! += offset;
  for (const d of world.food) d.y += offset;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

/** Copies into `saved` what it lacks of `template`, and drops what `template` does not have, through plain objects. */
function fill(saved: Record<string, unknown>, template: Record<string, unknown>): void {
  for (const key of Object.keys(saved)) if (!(key in template)) delete saved[key];
  for (const key of Object.keys(template)) {
    const want = template[key];
    if (!(key in saved)) saved[key] = want;
    else if (isRecord(want) && isRecord(saved[key])) fill(saved[key], want);
  }
}

export { type Census, census } from './history';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Tank days, to one decimal below ten. */
export function formatDays(days: number): string {
  const shown = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${shown} ${shown === 1 ? 'day' : 'days'}`;
}

/**
 * What happened while the tank was closed, as short lines for the keeper
 * (D7: "12 workers eclosed, mould in chamber 3").
 */
export function awayReport(before: Census, after: Census, daySeconds: number): string[] {
  const lines: string[] = [];
  const days = (after.step - before.step) / STEPS_PER_SECOND / daySeconds;
  lines.push(`The tank lived ${formatDays(days)} while it was closed.`);
  if (before.diedOut < 0 && after.diedOut >= 0) lines.push('The colony died out.');
  if (before.queen && !after.queen) lines.push('The queen died.');
  const born = after.everAnts - before.everAnts;
  if (born > 0) lines.push(`${plural(born, 'worker', 'workers')} came out of the cocoon.`);
  const died: string[] = [];
  const causes: [number, string][] = [
    [Cause.age, 'of age'],
    [Cause.hunger, 'of hunger'],
    [Cause.drying, 'of drying out'],
    [Cause.heat, 'of heat'],
  ];
  for (const [cause, what] of causes) {
    const n = after.deaths[cause]! - before.deaths[cause]!;
    if (n > 0) died.push(`${n} ${what}`);
  }
  if (died.length > 0) lines.push(`Workers died: ${died.join(', ')}.`);
  lines.push(
    `Workers: ${before.workers} then, ${after.workers} now. Brood now ${plural(after.eggs, 'egg', 'eggs')}, ` +
      `${plural(after.larvae, 'larva', 'larvae')} and ${plural(after.pupae, 'pupa', 'pupae')} ` +
      `(was ${before.eggs}, ${before.larvae} and ${before.pupae}).`,
  );
  const dried = after.broodDried - before.broodDried;
  const moulded = after.broodMoulded - before.broodMoulded;
  if (dried > 0) lines.push(`${plural(dried, 'piece', 'pieces')} of brood dried out.`);
  if (moulded > 0) lines.push(`Mould killed ${plural(moulded, 'piece', 'pieces')} of brood.`);
  if (before.mould === 0 && after.mould > 0) lines.push('Mould is growing in the farm.');
  else if (before.mould > 0 && after.mould === 0) lines.push('The mould in the farm has gone.');
  if (before.arenaFood > 0 && after.arenaFood === 0) lines.push('The food in the arena ran out.');
  const dug = after.nest - before.nest;
  if (dug >= 10) lines.push(`They dug ${(dug / 100).toFixed(1)} cm² more nest.`);
  if (after.soilWater < before.soilWater - 0.02) {
    lines.push(`The soil dried: ${Math.round(100 * before.soilWater)}% water then, ${Math.round(100 * after.soilWater)}% now.`);
  }
  return lines;
}
