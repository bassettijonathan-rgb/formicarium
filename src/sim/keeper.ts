/**
 * The keeper's tank and the keeper's actions (DESIGN.md section 8 and D7).
 *
 * Every tool on the page is a `KeeperCommand`, applied between steps and
 * logged with the step it was applied at. A tank's seed and its log are
 * enough to rebuild it exactly, which is how saves stay deterministic.
 */
import { createArena, isBlocked, reliefAt } from './arena';
import { layDecorations, stampDecorations } from './decor';
import { TANK_ARENA } from './tank';
import {
  cleanArena,
  createWorld,
  placeProtein,
  placeSugar,
  removeFood,
  setHeatMat,
  step,
  water,
  type World,
} from './world';

export type KeeperCommand =
  /** A sugar drop in the arena, at arena coordinates in mm. */
  | { type: 'sugar'; x: number; y: number; volume: number; concentration: number }
  /** A crushed insect (protein) in the arena. */
  | { type: 'protein'; x: number; y: number; volume: number }
  /** All food taken out of the arena. */
  | { type: 'clearFood' }
  /** The heat mat under the farm with its left edge at `x` mm, or taken away (null). */
  | { type: 'heatMat'; x: number | null }
  /** Water poured on the farm from above at `x` mm (M5b). */
  | { type: 'water'; x: number }
  /** The arena cleaned: the dead lying there and mouldy food taken out (M5c). */
  | { type: 'clean' };

/** A keeper's action and the step it was applied at, before that step ran. */
export interface LoggedCommand {
  step: number;
  command: KeeperCommand;
}

/** The page's tank: room temperature, °C, and where the heat mat starts (its left edge, mm). */
export const TANK_ROOM = 22;
export const TANK_MAT_X = 110;

/** Where a new tank's first sugar drop goes: 10 cm in from the tube and 4.5 cm toward the back. */
export const FIRST_DROP = { x: 100, y: TANK_ARENA.height / 2 - 45 } as const;

/**
 * The keeper's tank as the page sets it up: a queen and 60 workers in a room a
 * little cool for Lasius niger, the heat mat under the middle of the farm, a
 * 40 x 30 cm arena with stones, bark, leaves and moss laid out from the seed
 * (DESIGN.md A1, A4), and a first sugar drop, so a new tank has something to
 * find. The soil's water moves, but the farm waters itself and stays as damp
 * as it was poured (DESIGN.md 7.7), what is left to rot goes mouldy, and the
 * colony can die.
 */
export function createTank(seed: number): World {
  const world = createWorld(seed, {
    queen: true,
    params: { roomTemperature: TANK_ROOM, waterFlow: true, selfWatering: true, mould: true, mortal: true },
  });
  setHeatMat(world, TANK_MAT_X);
  furnishArena(world, []);
  placeSugar(world, FIRST_DROP.x, FIRST_DROP.y, 40, 1);
  return world;
}

/**
 * Gives a tank the keeper's big arena and lays out its decorations, clear of
 * the tube's mouth, the first drop and any `keepClear` spots (things already
 * in the arena when an old tank moves into the new box).
 */
export function furnishArena(world: World, keepClear: { x: number; y: number; radius: number }[]): void {
  world.arena = createArena(TANK_ARENA.width, TANK_ARENA.height);
  const clear = [{ x: world.arena.entranceX, y: world.arena.entranceY, radius: 45 }, { ...FIRST_DROP, radius: 30 }, ...keepClear];
  world.decor = layDecorations(world.seed, world.arena.width, world.arena.height, clear);
  stampDecorations(world.arena, world.decor);
}

/** True if (x, y) is open floor: in the box and not on anything standing on it. */
function onFloor(world: World, x: number, y: number): boolean {
  return !isBlocked(world.arena, x, y) && reliefAt(world.arena, x, y) === 0;
}

/** Applies a keeper's action to the world. */
export function applyCommand(world: World, command: KeeperCommand): void {
  switch (command.type) {
    case 'sugar':
      // Food put down on a stone, the bark or the water tube would roll off, so it is refused.
      if (onFloor(world, command.x, command.y)) placeSugar(world, command.x, command.y, command.volume, command.concentration);
      break;
    case 'protein':
      if (onFloor(world, command.x, command.y)) placeProtein(world, command.x, command.y, command.volume);
      break;
    case 'clearFood':
      for (const d of [...world.food]) removeFood(world, d.id);
      break;
    case 'heatMat':
      setHeatMat(world, command.x);
      break;
    case 'water':
      water(world, command.x);
      break;
    case 'clean':
      cleanArena(world);
      break;
  }
}

/**
 * Rebuilds a keeper's tank from its seed and log, up to `steps`: each
 * command is applied just before the step it was logged at, as the page did.
 */
export function replayTank(seed: number, log: readonly LoggedCommand[], steps: number): World {
  const world = createTank(seed);
  let next = 0;
  while (world.step < steps) {
    while (next < log.length && log[next]!.step <= world.step) applyCommand(world, log[next++]!.command);
    step(world);
  }
  while (next < log.length && log[next]!.step <= world.step) applyCommand(world, log[next++]!.command);
  return world;
}
