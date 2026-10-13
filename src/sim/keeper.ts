/**
 * The keeper's tank and the keeper's actions (DESIGN.md section 8 and D7).
 *
 * Every tool on the page is a `KeeperCommand`, applied between steps and
 * logged with the step it was applied at. A tank's seed and its log are
 * enough to rebuild it exactly, which is how saves stay deterministic.
 */
import { createArena } from './arena';
import { layDecorations, stampDecorations } from './decor';
import { type Item, canPutFood, emptyDishes, moveDecoration, putItem, refillFeeders, removeDecoration } from './objects';
import { TANK_ARENA } from './tank';
import { MAT_WIDTH } from './heat';
import { Place } from './ants';
import { DEFAULT_NEST, type NestSetup } from './nest';
import type { Cut, Insect } from './prey';
import {
  cleanArena,
  createWorld,
  placeInsect,
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
  /** The arena cleaned: the dead lying there and mouldy food taken out (M5c), and the feeding dishes emptied (B4). */
  | { type: 'clean' }
  /** An object put in the arena with its middle at (x, y); a liquid feeder comes full of sugar water of `concentration` mol/L (B3-B5). */
  | { type: 'put'; item: Item; x: number; y: number; concentration: number }
  /** The decoration at `index` in the tank's list moved so its middle is at (x, y), with any food in it (B3). */
  | { type: 'move'; index: number; x: number; y: number }
  /** The decoration at `index` taken out, with any food in it (B3). */
  | { type: 'remove'; index: number }
  /** The liquid feeders filled to the top with sugar water of `concentration` mol/L (B5). */
  | { type: 'refill'; concentration: number }
  /** A dead feeder insect put in the arena with its middle at (x, y): whole, cut in two or in pieces (B6). */
  | { type: 'insect'; insect: Insect; cut: Cut; x: number; y: number };

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
 * little cool for Lasius niger, in a bought ytong nest of the keeper's choice
 * (`nest`, DESIGN.md 3.5; null for the sand farm of the first tanks), the heat
 * mat under the middle of it, a 40 x 30 cm arena with stones, bark, leaves and
 * moss laid out from the seed (DESIGN.md A1, A4), and a first sugar drop, so a
 * new tank has something to find. The nest waters itself (a sand farm stays as
 * damp as it was poured, DESIGN.md 7.7), what is left to rot goes mouldy, and
 * the colony can die.
 */
export function createTank(seed: number, nest: NestSetup | null = DEFAULT_NEST): World {
  const world = createWorld(seed, {
    queen: true,
    params: { roomTemperature: TANK_ROOM, waterFlow: true, selfWatering: true, mould: true, mortal: true },
    ...(nest ? { bought: nest } : {}),
  });
  setHeatMat(world, nest ? (world.farm.width - MAT_WIDTH) / 2 : TANK_MAT_X);
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

/** Applies a keeper's action to the world. */
export function applyCommand(world: World, command: KeeperCommand): void {
  switch (command.type) {
    case 'sugar':
      // Food put down on a stone, the bark or a tube would roll off, so it is refused; in a dish it stays.
      if (canPutFood(world, command.x, command.y)) placeSugar(world, command.x, command.y, command.volume, command.concentration);
      break;
    case 'protein':
      if (canPutFood(world, command.x, command.y)) placeProtein(world, command.x, command.y, command.volume);
      break;
    case 'clearFood':
      for (const d of [...world.food]) removeFood(world, d.id);
      // And the insects lying in the arena (not those already in an ant's mandibles).
      world.prey = world.prey.filter((p) => p.place !== Place.arena || p.carriedBy >= 0);
      break;
    case 'heatMat':
      setHeatMat(world, command.x);
      break;
    case 'water':
      water(world, command.x);
      break;
    case 'clean':
      cleanArena(world);
      emptyDishes(world);
      break;
    case 'put':
      putItem(world, command.item, command.x, command.y, command.concentration);
      break;
    case 'move':
      moveDecoration(world, command.index, command.x, command.y);
      break;
    case 'remove':
      removeDecoration(world, command.index);
      break;
    case 'refill':
      refillFeeders(world, command.concentration);
      break;
    case 'insect':
      if (canPutFood(world, command.x, command.y)) placeInsect(world, command.insect, command.cut, command.x, command.y);
      break;
  }
}

/**
 * Rebuilds a keeper's tank (in `nest`, as `createTank`) from its seed and log, up to `steps`: each
 * command is applied just before the step it was logged at, as the page did.
 */
export function replayTank(seed: number, log: readonly LoggedCommand[], steps: number, nest: NestSetup | null = DEFAULT_NEST): World {
  const world = createTank(seed, nest);
  let next = 0;
  while (world.step < steps) {
    while (next < log.length && log[next]!.step <= world.step) applyCommand(world, log[next++]!.command);
    step(world);
  }
  while (next < log.length && log[next]!.step <= world.step) applyCommand(world, log[next++]!.command);
  return world;
}
