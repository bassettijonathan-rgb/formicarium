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
import { AntState, Caste, Cause, Place, createAnts } from './ants';
import { BroodStage, createBrood } from './brood';
import { excavatedArea } from './farm';
import { type LoggedCommand, createTank } from './keeper';
import { Material } from './materials';
import { STEPS_PER_SECOND } from './time';
import { colonyCrop, type World } from './world';

/**
 * The save format. A model change that only adds state does not change it:
 * `loadWorld` fills what an older save lacks. Raise it when old saves can no
 * longer be carried over; they are then set aside rather than loaded.
 */
export const SAVE_VERSION = 1;

export interface Save {
  version: number;
  seed: number;
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
  const template = createTank(save.seed);
  template.ants = createAnts(saved.ants?.count ?? 0);
  template.brood = createBrood(saved.brood?.stage?.length ?? 0);
  fill(saved as unknown as Record<string, unknown>, template as unknown as Record<string, unknown>);
  saved.params = template.params;
  return saved;
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

/** What the keeper sees of a tank at a glance, compared before and after it was closed. */
export interface Census {
  step: number;
  /** Living workers, and whether the queen lives. */
  workers: number;
  queen: boolean;
  /** Every ant the tank has held, alive or dead: new ones are workers out of their cocoons. */
  everAnts: number;
  /** Ants dead of each `Cause`. */
  deaths: number[];
  eggs: number;
  larvae: number;
  pupae: number;
  /** Brood dead of drying out and of mould, since the tank was set up. */
  broodDried: number;
  broodMoulded: number;
  /** Sugar water in the workers' crops, and food left in the arena, µL. */
  crops: number;
  arenaFood: number;
  /** Nest dug out of the soil, mm². */
  nest: number;
  /** Mould in the farm (summed over its cells; 0 when there is none). */
  mould: number;
  /** Mean water content of the farm's soil, 0-1. */
  soilWater: number;
  /** The step the colony died out, or -1. */
  diedOut: number;
}

export function census(world: World): Census {
  const { ants, brood, farm } = world;
  let workers = 0;
  let queen = false;
  const deaths = Object.values(Cause).map(() => 0);
  for (let i = 0; i < ants.count; i++) {
    if (ants.state[i] === AntState.dead) deaths[ants.cause[i]!]!++;
    else if (ants.place[i] !== Place.gone) {
      if (ants.caste[i] === Caste.queen) queen = true;
      else workers++;
    }
  }
  const stages = [0, 0, 0, 0];
  for (let k = 0; k < brood.count; k++) stages[brood.stage[k]!]!++;
  let water = 0;
  let soil = 0;
  for (let c = 0; c < farm.material.length; c++) {
    if (farm.material[c] === Material.air) continue;
    water += farm.moisture[c]!;
    soil++;
  }
  return {
    step: world.step,
    workers,
    queen,
    everAnts: ants.count,
    deaths,
    eggs: stages[BroodStage.egg]!,
    larvae: stages[BroodStage.larva]!,
    pupae: stages[BroodStage.pupa]!,
    broodDried: brood.dried,
    broodMoulded: brood.moulded,
    crops: colonyCrop(world),
    arenaFood: world.food.reduce((sum, d) => sum + d.volume, 0),
    nest: excavatedArea(farm),
    mould: farm.mouldy,
    soilWater: soil > 0 ? water / (255 * soil) : 0,
    diedOut: world.diedOut,
  };
}

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
