/**
 * The colony's history (M6c; DESIGN.md section 8): a census taken every so
 * often for the colony graphs, and a picture of the nest for the timelapse.
 * Both are kept in the world, so they are saved with it and come out the same
 * on every run of a tank. When either grows long, the interval doubles and
 * the entries off the new interval are dropped, so a tank of any age keeps a
 * few hundred, evenly spaced.
 */
import { ACTIVITY_COUNT, AntState, Caste, Cause, Place, activityOf } from './ants';
import { BroodStage } from './brood';
import { excavatedArea, type Farm } from './farm';
import { Material } from './materials';
import { STEPS_PER_SECOND } from './time';
import type { World } from './world';

/** What the keeper sees of a tank at a glance. */
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
  /** Living workers' mean fat body, 0-1. */
  fat: number;
  /** Living workers at each `Activity` right now. */
  activity: number[];
}

export function census(world: World): Census {
  const { ants, brood, farm } = world;
  let workers = 0;
  let queen = false;
  let crops = 0;
  let fat = 0;
  const deaths = Object.values(Cause).map(() => 0);
  const activity = new Array<number>(ACTIVITY_COUNT).fill(0);
  for (let i = 0; i < ants.count; i++) {
    if (ants.state[i] === AntState.dead) deaths[ants.cause[i]!]!++;
    else if (ants.place[i] !== Place.gone) {
      crops += ants.crop[i]!;
      if (ants.caste[i] === Caste.queen) queen = true;
      else {
        workers++;
        fat += ants.fat[i]!;
        activity[activityOf(ants.place[i]!, ants.state[i]!)]!++;
      }
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
    crops,
    arenaFood: world.food.reduce((sum, d) => sum + d.volume, 0),
    nest: world.nestMode === 'farm' ? excavatedArea(farm) : 0,
    mould: farm.mouldy,
    soilWater: soil > 0 ? water / (255 * soil) : 0,
    diedOut: world.diedOut,
    fat: workers > 0 ? fat / workers : 0,
    activity,
  };
}

export interface History {
  /** Steps between censuses, and the censuses, oldest first. */
  every: number;
  censuses: Census[];
  /** Steps between pictures of the nest, and the pictures: one bit per farm cell, 1 where it is solid. */
  frameEvery: number;
  frames: Uint8Array[];
  /** The step each picture was taken at. */
  frameSteps: number[];
}

/** A census every tenth of a tank day to start with (6 minutes of ant time). */
const CENSUS_EVERY = 6 * 60 * STEPS_PER_SECOND;
/** A picture of the nest every 5 minutes of ant time to start with. */
const FRAME_EVERY = 5 * 60 * STEPS_PER_SECOND;
/** At most this many censuses and pictures are kept before thinning. */
export const MAX_CENSUSES = 600;
export const MAX_FRAMES = 240;

export function createHistory(): History {
  return { every: CENSUS_EVERY, censuses: [], frameEvery: FRAME_EVERY, frames: [], frameSteps: [] };
}

/** One bit per cell of the farm, 1 where it is solid. */
export function nestPicture(farm: Farm): Uint8Array {
  const bits = new Uint8Array(Math.ceil(farm.material.length / 8));
  for (let c = 0; c < farm.material.length; c++) if (farm.material[c] !== Material.air) bits[c >> 3]! |= 1 << (c & 7);
  return bits;
}

/** Records what is due at this step; called after every step. */
export function recordHistory(world: World): void {
  const h = world.history;
  if (world.step % h.every === 0) {
    h.censuses.push(census(world));
    if (h.censuses.length > MAX_CENSUSES) {
      h.every *= 2;
      h.censuses = h.censuses.filter((c) => c.step % h.every === 0);
    }
  }
  // A bought nest keeps its shape, so only the sand farm's nest is pictured.
  if (world.nestMode === 'farm' && !world.farm.table && world.step % h.frameEvery === 0) {
    h.frames.push(nestPicture(world.farm));
    h.frameSteps.push(world.step);
    if (h.frames.length > MAX_FRAMES) {
      h.frameEvery *= 2;
      const keep = h.frameSteps.map((s) => s % h.frameEvery === 0);
      h.frames = h.frames.filter((_, n) => keep[n]);
      h.frameSteps = h.frameSteps.filter((_, n) => keep[n]);
    }
  }
}
