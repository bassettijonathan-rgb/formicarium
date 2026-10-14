/** Messages between the page and the simulation worker (DESIGN.md section 10). */

import type { Census } from '../sim/history';
import type { AntCard } from '../sim/inspect';
import type { KeeperCommand } from '../sim/keeper';
import type { Decoration } from '../sim/decor';
import type { Insect, Part } from '../sim/prey';
import type { NestLayout, NestMaterial, NestSetup, NestSize, TubeEnd } from '../sim/nest';
import type { TableSave } from '../sim/colonies';
import type { Kept, ShelfEntry } from './store';

export type ToWorker =
  /** Sends the kept tanks for the start screen (`tanks`) (U1, U2). */
  | { type: 'list' }
  /** Opens kept tank `id`; it catches up on the time it was closed (M6a). */
  | { type: 'open'; id: string }
  /** Sets up a new tank called `name`, its colony in `nest` (a test tube or a bought nest), and opens it (U3). */
  | { type: 'create'; name: string; nest: NestSetup }
  /** Keeps a tank read from a file as a new tank called `name`, and opens it. */
  | { type: 'import'; save: Kept; name: string }
  /** Keeps the running tank and stops it (back to the start screen). */
  | { type: 'close' }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  /** Sends the running tank as a save (`exported`), for the page to write to a file. */
  | { type: 'export' }
  /** Simulation speed: 0 pauses, 1 is real ant time. */
  | { type: 'speed'; value: number }
  /** One of the keeper's tools, applied between steps and logged. */
  | { type: 'command'; command: KeeperCommand }
  /** Stop catching up on the time the tank was closed; go on from here. */
  | { type: 'skip' }
  /** Keep the tank now (the page is being hidden or closed). */
  | { type: 'save' }
  /** Watch one ant in the inspector (M6b), or none. */
  | { type: 'inspect'; id: number | null }
  /** Send the colony's history, for the graphs and the timelapse (M6c). */
  | { type: 'history' }
  /** Show colony `slot` of the table: the snapshots are of it and the keeper's tools act on it (DESIGN.md 3.6). */
  | { type: 'choose'; slot: number }
  /** Set up a new colony called `name` in free place `slot`, its colony in `nest` (T3); it is then shown. */
  | { type: 'addColony'; name: string; slot: number; nest: NestSetup }
  /** Give colony `slot` away (T4). */
  | { type: 'removeColony'; slot: number }
  /** While on, the page hears where every colony's ants are (`overview`), for the picture of the whole table. */
  | { type: 'overview'; on: boolean };

/** Numbers per ant in `AntsSnapshot.ants`. */
export const ANT_STRIDE = 7;

export interface AntsSnapshot {
  type: 'ants';
  step: number;
  /**
   * Per ant: x, y (mm, in the arena or the farm), heading, state, distance
   * walked (mm), place (`Place`), and the `Material` of a carried grain (0 = none).
   * Crop is in `full`.
   */
  ants: Float32Array;
  /** 1 where the ant's crop is more than half full (its gaster is stretched). */
  full: Uint8Array;
  /** Each ant's `Caste`. */
  caste: Uint8Array;
  /** 1 for a callow: a worker in its first days out of the cocoon, still pale. */
  callow: Uint8Array;
  /** Brood in the farm, `BROOD_STRIDE` numbers each: x, y (mm), `BroodStage`, size (mm). */
  brood: Float32Array;
  /** Pieces of feeder insects lying in the arena or the farm (Arena 3). */
  prey: PieceView[];
  /** Pieces being carried, by the ant carrying each. */
  carried: { ant: number; piece: PieceView }[];
}

/** Numbers per brood item in `AntsSnapshot.brood`. */
export const BROOD_STRIDE = 4;

export interface ArenaSnapshot {
  type: 'arena';
  width: number;
  height: number;
  /** Trail pheromone per cell. */
  trail: Float32Array;
  /** The stones, bark, water tube, leaves, twigs and moss on the floor (DESIGN.md A4). */
  decor: Decoration[];
  food: { id: number; x: number; y: number; volume: number; concentration: number; protein: number; mouldy: boolean; reach?: number }[];
  /** All workers; those out foraging (in the arena or the tube); sugar water in the colony's crops (µL). */
  ants: number;
  out: number;
  stores: number;
  /** Whether the queen lives (M5c). */
  queen: boolean;
  /** Ants dead so far of each `Cause`. */
  deaths: number[];
  /** The step at which the colony died out, or -1 while it lives. */
  diedOut: number;
}

export interface FarmSnapshot {
  type: 'farm';
  width: number;
  height: number;
  material: Uint8Array;
  moisture: Uint8Array;
  /** 1 for loose grains (spoil and fallen soil). */
  loose: Uint8Array;
  /** The bought nests the grid holds, on their table (DESIGN.md 3.5, Nests 3), or null for the sand farm. */
  table: TableShape | null;
}

/** What the page needs to draw the table besides its cells: the modules, the tubes between them, and where the arena's tube plugs in. */
export interface TableShape {
  modules: NestShape[];
  tubes: { id: number; a: TubeEnd; b: TubeEnd; path: number[]; plugged: boolean }[];
  arena: TubeEnd;
}

/** What the page needs to draw a bought nest module besides its cells. */
export interface NestShape {
  id: number;
  /** A carved nest, or a test tube (N9). */
  kind: 'nest' | 'tube';
  /** Its top left corner on the table, and its size, mm. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Its ports' mouths, table mm, and which way each faces out. */
  ports: { x: number; y: number; dx: number; dy: number }[];
  size: NestSize;
  layout: NestLayout;
  material: NestMaterial;
  /** Depth of the chambers and thickness of the block, mm. */
  depth: number;
  thickness: number;
  waterX: number;
  waterY: number;
  waterRadius: number;
}

export interface HeatSnapshot {
  type: 'heat';
  /** The farm's temperature field: `width` × `height` cells of `cell` mm, °C. */
  width: number;
  height: number;
  cell: number;
  temperature: Float32Array;
  /** Where the heat mat is under the farm, mm, or null. */
  mat: { x: number; width: number } | null;
  /** Where each bought nest module's cover is lifted, mm across it (none when `from` equals `to`); null for the sand farm. */
  lit: { module: number; from: number; to: number }[] | null;
  room: number;
  /** Mould in the farm, on the same grid, 0-1; null while there is none (M5b). */
  mould: Float32Array | null;
  /** Relative humidity of the farm's air, on the same grid, 0-1 (M5b). */
  humidity: Float32Array;
}

export type FromWorker =
  /** The farm's soil layers; sent at start and whenever the soil changes. */
  | FarmSnapshot
  | AntsSnapshot
  | ArenaSnapshot
  | HeatSnapshot
  /** The kept tanks, most recently kept first. */
  | { type: 'tanks'; tanks: ShelfEntry[] }
  /**
   * The tank now running. `resumed` when it is a kept tank; `note` when
   * something about it needs saying (it could not be read).
   */
  | { type: 'tank'; id: string; name: string; seed: number; resumed: boolean; note?: string }
  /** Whether a keeper's change to the table was done (refused: no room, not empty, no free port, no way for a tube). */
  | { type: 'result'; command: KeeperCommand['type']; ok: boolean }
  /** The running tank as a save, to be written to a file. */
  | { type: 'exported'; name: string; save: TableSave }
  /** The colonies on the table by place, the one shown (`chosen`, a place), and the places still free. */
  | { type: 'colonies'; chosen: number; colonies: { name: string; slot: number }[]; free: number[] }
  /** Every colony's setup and ants, for the picture of the whole table. */
  | { type: 'overview'; colonies: ColonyView[] }
  /** A tank from a file could not be read. */
  | { type: 'importFailed' }
  /** Catching up on the time the tank was closed: steps done of `total`. */
  | { type: 'catchUp'; done: number; total: number }
  /** What happened while the tank was closed, line by line. */
  | { type: 'away'; lines: string[] }
  /** The inspected ant, described (M6b). */
  | { type: 'ant'; id: number; card: AntCard }
  | HistorySnapshot;

/** The colony's history (M6c). */
export interface HistorySnapshot {
  type: 'history';
  censuses: Census[];
  /** Pictures of the nest, one bit per farm cell (1: solid), and the step each was taken at. */
  frames: Uint8Array[];
  frameSteps: number[];
  width: number;
  height: number;
  /** The farm's soil when the tank was set up, a `Material` per cell. */
  soil: Uint8Array;
  daySeconds: number;
  cropLoad: number;
  /** True for a bought nest, which keeps its shape: no pictures of it are taken. */
  bought: boolean;
}

/** What the renderer needs of a piece: where it lies, what it is and how it looks. */
export interface PieceView {
  x: number;
  y: number;
  angle: number;
  place: number;
  insect: Insect;
  part: Part;
  length: number;
  width: number;
  /** 0 whole skin, 1 cut open, 2 a dry husk, 3 mouldy. */
  look: number;
}

export const Look = { closed: 0, open: 1, husk: 2, mouldy: 3 } as const;

/** What the picture of the whole table shows of one colony (DESIGN.md 3.6). */
export interface ColonyView {
  name: string;
  slot: number;
  workers: number;
  queen: boolean;
  /** The nests' table (or the sand farm), mm, and its nests and tubes; null for a sand farm. */
  nestWidth: number;
  nestHeight: number;
  table: TableShape | null;
  arenaWidth: number;
  arenaHeight: number;
  /** Per ant in sight: x, y (mm, in the arena or on the nests' table) and `Place`. */
  ants: Float32Array;
}
