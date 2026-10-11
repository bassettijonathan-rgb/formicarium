/**
 * Headless runner: runs a tank in Node and prints a summary.
 *
 * Same start as the page: the default colony and one rich sugar drop.
 *
 *   npm run sim -- --seed 42 --seconds 600
 */
import { Place } from '../src/sim/ants';
import { excavatedArea } from '../src/sim/farm';
import { MATERIAL_COUNT, MATERIAL_NAMES } from '../src/sim/materials';
import { hashHex, hashState } from '../src/sim/hash';
import { STEPS_PER_SECOND, formatAntTime } from '../src/sim/time';
import { colonyCrop, createWorld, placeSugar, step } from '../src/sim/world';

function parseArgs(argv: string[]): { seed: number; seconds: number } {
  let seed = 42;
  let seconds = 60;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = Number(argv[++i]);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${flag} needs a whole number`);
    if (flag === '--seed') seed = value;
    else if (flag === '--seconds') seconds = value;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return { seed, seconds };
}

const { seed, seconds } = parseArgs(process.argv.slice(2));
const world = createWorld(seed);
placeSugar(world, 140, 55, 40, 1);
for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) step(world);

const counts = new Array<number>(MATERIAL_COUNT).fill(0);
for (const m of world.farm.material) counts[m]!++;
const cells = world.farm.material.length;

console.log(`formicarium headless run`);
console.log(`seed        ${seed}`);
console.log(`ant time    ${formatAntTime(world.step)}`);
console.log(`farm soil   ${counts.map((c, m) => `${MATERIAL_NAMES[m]} ${((100 * c) / cells).toFixed(1)}%`).join(', ')}`);
let out = 0;
for (const p of world.ants.place) if (p !== Place.farm) out++;
let trail = 0;
for (const v of world.arena.trail) trail += v;
console.log(`nest        ${excavatedArea(world.farm)} mm² dug out`);
console.log(`ants        ${world.ants.count - out} in the farm, ${out} out foraging`);
console.log(`sugar       ${colonyCrop(world).toFixed(1)} µL in the workers' crops, ${world.food.reduce((a, d) => a + d.volume, 0).toFixed(1)} µL left in the arena`);
console.log(`trail       ${trail.toFixed(0)} units on the arena floor`);
console.log(`state hash  ${hashHex(hashState(world))}`);
