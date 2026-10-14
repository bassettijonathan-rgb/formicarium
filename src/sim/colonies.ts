/**
 * Several colonies on one table (DESIGN.md 3.6, Marco 2026-10-14). A kept
 * tank is a table in the keeper's room with up to `MAX_COLONIES` colonies
 * on it, each a whole setup of its own: its queen and workers, its test
 * tube or nests, its tubes, its arena, heat mat, food and objects. Each is
 * its own `World`, simulated side by side; nothing passes from one to
 * another, so a colony runs exactly as it would alone on the table.
 *
 * A colony keeps its place on the table (`slot`, 0 to `MAX_COLONIES` - 1),
 * its seed and the keeper's log of what was done to it.
 */
import type { LoggedCommand } from './keeper';
import { type Census, SAVE_VERSION, type Save, awayReport, census, loadWorld } from './save';
import { step, type World } from './world';

/** The most colonies one table holds (T2): each costs computing time. */
export const MAX_COLONIES = 4;

/** One colony on a table, as kept: its name, place, seed, the keeper's log and its world. */
export interface ColonySave {
  name: string;
  slot: number;
  seed: number;
  log: LoggedCommand[];
  world: World;
}

/** A kept table: its name, when it was kept, and its colonies. */
export interface TableSave {
  version: number;
  /** The keeper's name for the table (shown in the list of kept tanks). */
  name: string;
  /** When the page kept it, ms since 1970 by the page's clock; never read by the simulation. */
  savedAt: number;
  colonies: ColonySave[];
}

/** A table running: like its save, with each world ready to step. */
export type Colony = ColonySave;

/** True for a kept table, false for a tank kept before tables had several colonies (one `Save`). */
export function isTable(kept: Save | TableSave): kept is TableSave {
  return Array.isArray((kept as TableSave).colonies);
}

/**
 * A kept tank as a table. A tank kept before tables (T5) becomes a table
 * with its one colony in the first place, named as the tank was.
 */
export function asTable(kept: Save | TableSave): TableSave {
  if (isTable(kept)) return kept;
  const name = kept.name ?? `Tank ${kept.seed}`;
  return { version: kept.version, name, savedAt: kept.savedAt, colonies: [{ name, slot: 0, seed: kept.seed, log: kept.log ?? [], world: kept.world }] };
}

/**
 * The colonies of a kept table, ready to run, or null when one of them is
 * from a format this code cannot read (`loadWorld`).
 */
export function loadTable(table: TableSave): Colony[] | null {
  if (table.version !== SAVE_VERSION) return null;
  const colonies: Colony[] = [];
  for (const c of table.colonies) {
    const world = loadWorld({ version: table.version, seed: c.seed, savedAt: table.savedAt, log: c.log, world: c.world });
    if (!world) return null;
    colonies.push({ name: c.name, slot: c.slot, seed: c.seed, log: c.log ?? [], world });
  }
  return colonies.length > 0 ? sortBySlot(colonies) : null;
}

/** The colonies in the order of their places on the table. */
export function sortBySlot<T extends { slot: number }>(colonies: T[]): T[] {
  return [...colonies].sort((a, b) => a.slot - b.slot);
}

/** The places on the table no colony takes, in order. */
export function freeSlots(colonies: readonly { slot: number }[]): number[] {
  const out: number[] = [];
  for (let s = 0; s < MAX_COLONIES; s++) if (!colonies.some((c) => c.slot === s)) out.push(s);
  return out;
}

/** A seed no colony in `seeds` has: one past the largest. */
export function nextSeed(seeds: readonly number[]): number {
  return Math.max(0, ...seeds) + 1;
}

/** Lets every colony live `steps` steps, one colony after another (they never touch, so the order changes nothing). */
export function stepColonies(colonies: readonly { world: World }[], steps: number): void {
  for (const c of colonies) for (let i = 0; i < steps; i++) step(c.world);
}

/** The table as it is kept. The worlds are not copied: the store copies what it keeps. */
export function tableSave(name: string, savedAt: number, colonies: readonly Colony[]): TableSave {
  return { version: SAVE_VERSION, name, savedAt, colonies: colonies.map((c) => ({ name: c.name, slot: c.slot, seed: c.seed, log: c.log, world: c.world })) };
}

/** What happened to each colony while the table was closed: one colony's report as it was, or each colony's under its name. */
export function tableReport(table: readonly Colony[], before: readonly Census[]): string[] {
  const reports = table.map((k, i) => awayReport(before[i]!, census(k.world), k.world.params.daySeconds));
  if (reports.length === 1) return reports[0]!;
  return [reports[0]![0]!, ...table.flatMap((k, i) => [`${k.name}:`, ...reports[i]!.slice(1)])];
}
