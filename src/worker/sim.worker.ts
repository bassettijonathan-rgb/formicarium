/**
 * Runs the simulation off the page's thread and sends snapshots to the renderer.
 * The simulation itself never sees real time; this loop decides how many
 * steps to run per real interval.
 */
import { AntState, Caste, Place } from '../sim/ants';
import { BroodStage } from '../sim/brood';
import { STEPS_PER_SECOND } from '../sim/time';
import { colonyCrop, createWorld, placeProtein, placeSugar, removeFood, step, type World } from '../sim/world';
import { ANT_STRIDE, type FromWorker, type ToWorker } from './protocol';

const INTERVAL_MS = 50;
/** The arena (trail, food, counts) and changed soil are sent every this many intervals. */
const ARENA_EVERY = 4;
/** Most steps run in one interval; beyond this the simulation runs slower than asked rather than freezing the page. */
const MAX_STEPS_PER_INTERVAL = 2000;

let world: World | undefined;
let speed = 1;
let owed = 0;
let intervals = 0;
let farmVersion = -1;
const pending: ToWorker[] = [];

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  postMessage(msg, transfer);
}

function sendFarm(w: World): void {
  farmVersion = w.farm.version;
  const material = w.farm.material.slice();
  const moisture = w.farm.moisture.slice();
  const loose = w.farm.loose.slice();
  post({ type: 'farm', width: w.farm.width, height: w.farm.height, material, moisture, loose }, [
    material.buffer,
    moisture.buffer,
    loose.buffer,
  ]);
}

function sendAnts(w: World): void {
  const { ants } = w;
  const data = new Float32Array(ants.count * ANT_STRIDE);
  const full = new Uint8Array(ants.count);
  const callow = new Uint8Array(ants.count);
  for (let i = 0; i < ants.count; i++) {
    const o = i * ANT_STRIDE;
    data[o] = ants.x[i]!;
    data[o + 1] = ants.y[i]!;
    data[o + 2] = ants.heading[i]!;
    data[o + 3] = ants.state[i]!;
    data[o + 4] = ants.walked[i]!;
    data[o + 5] = ants.place[i]!;
    data[o + 6] = ants.state[i] === AntState.carrying ? ants.grain[i]! : 0;
    full[i] = ants.crop[i]! > 0.5 * w.params.cropLoad ? 1 : 0;
    callow[i] = ants.caste[i] === Caste.worker && ants.age[i]! < w.params.callowDays ? 1 : 0;
  }
  const caste = ants.caste.slice();
  const { brood } = w;
  const items: number[] = [];
  for (let k = 0; k < brood.count; k++) {
    const stage = brood.stage[k]!;
    if (stage === BroodStage.none) continue;
    // Sizes in mm: eggs ~0.5, larvae grow from ~1 to ~3.5, cocoons ~3.5 long.
    const size = stage === BroodStage.egg ? 0.5 : stage === BroodStage.larva ? 1 + 2.5 * brood.progress[k]! : 3.5;
    items.push(brood.x[k]!, brood.y[k]!, stage, size);
  }
  const broodData = Float32Array.from(items);
  post({ type: 'ants', step: w.step, ants: data, full, caste, callow, brood: broodData }, [
    data.buffer,
    full.buffer,
    caste.buffer,
    callow.buffer,
    broodData.buffer,
  ]);
}

function sendArena(w: World): void {
  const trail = Float32Array.from(w.arena.trail);
  const wall = w.arena.wall.slice();
  let out = 0;
  let alive = 0;
  for (let i = 0; i < w.ants.count; i++) {
    if (w.ants.place[i] === Place.gone || w.ants.state[i] === AntState.dead) continue;
    alive++;
    if (w.ants.place[i] === Place.arena || w.ants.place[i] === Place.tube) out++;
  }
  post(
    {
      type: 'arena',
      width: w.arena.width,
      height: w.arena.height,
      trail,
      wall,
      food: w.food.map((d) => ({ ...d })),
      ants: alive,
      out,
      stores: w.nestMode === 'farm' ? colonyCrop(w) : w.nest.stores,
    },
    [trail.buffer, wall.buffer],
  );
}

/** Keeper actions are applied between steps, in the order they arrived. */
function applyPending(w: World): boolean {
  const any = pending.length > 0;
  for (const msg of pending.splice(0)) {
    if (msg.type === 'sugar') placeSugar(w, msg.x, msg.y, msg.volume, msg.concentration);
    else if (msg.type === 'protein') placeProtein(w, msg.x, msg.y, msg.volume);
    else if (msg.type === 'clearFood') for (const d of [...w.food]) removeFood(w, d.id);
  }
  return any;
}

onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    world = createWorld(msg.seed, { queen: true });
    // A first sugar drop, so a new tank has something to find.
    placeSugar(world, 100, 55, 40, 1);
    sendFarm(world);
    sendAnts(world);
    sendArena(world);
  } else if (msg.type === 'speed') {
    speed = msg.value;
  } else {
    pending.push(msg);
  }
};

setInterval(() => {
  if (!world) return;
  const keeperActed = applyPending(world);
  if (speed > 0) {
    owed += (speed * STEPS_PER_SECOND * INTERVAL_MS) / 1000;
    owed = Math.min(owed, MAX_STEPS_PER_INTERVAL);
    while (owed >= 1) {
      step(world);
      owed -= 1;
    }
  }
  sendAnts(world);
  if (++intervals % ARENA_EVERY === 0 || keeperActed) {
    sendArena(world);
    if (world.farm.version !== farmVersion) sendFarm(world);
  }
}, INTERVAL_MS);
