/**
 * The keeper's tank and the keeper's actions (DESIGN.md section 8 and D7).
 *
 * Every tool on the page is a `KeeperCommand`, applied between steps and
 * logged with the step it was applied at. A tank's seed and its log are
 * enough to rebuild it exactly, which is how saves stay deterministic.
 */
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

/**
 * The keeper's tank as the page sets it up: a queen and 60 workers in a room a
 * little cool for Lasius niger, the heat mat under the middle of the farm and
 * a first sugar drop, so a new tank has something to find. The soil dries
 * unless the keeper waters it, what is left to rot goes mouldy, and the
 * colony can die.
 */
export function createTank(seed: number): World {
  const world = createWorld(seed, {
    queen: true,
    params: { roomTemperature: TANK_ROOM, waterFlow: true, mould: true, mortal: true },
  });
  setHeatMat(world, TANK_MAT_X);
  placeSugar(world, 100, 55, 40, 1);
  return world;
}

/** Applies a keeper's action to the world. */
export function applyCommand(world: World, command: KeeperCommand): void {
  switch (command.type) {
    case 'sugar':
      placeSugar(world, command.x, command.y, command.volume, command.concentration);
      break;
    case 'protein':
      placeProtein(world, command.x, command.y, command.volume);
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
