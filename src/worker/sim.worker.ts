/**
 * Runs the simulation off the page's thread and sends snapshots to the renderer.
 * The simulation itself never sees real time; this loop decides how many
 * steps to run per real interval.
 */
import { AntState } from '../sim/ants';
import { STEPS_PER_SECOND } from '../sim/time';
import { createWorld, placeSugar, removeFood, step, type World } from '../sim/world';
import { ANT_STRIDE, type FromWorker, type ToWorker } from './protocol';

const INTERVAL_MS = 50;
/** The arena (trail, food, counts) is sent every this many intervals. */
const ARENA_EVERY = 4;

let world: World | undefined;
let speed = 1;
let owed = 0;
let intervals = 0;
const pending: ToWorker[] = [];

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  postMessage(msg, transfer);
}

function sendFarm(w: World): void {
  const material = w.farm.material.slice();
  const moisture = w.farm.moisture.slice();
  post({ type: 'farm', width: w.farm.width, height: w.farm.height, material, moisture }, [
    material.buffer,
    moisture.buffer,
  ]);
}

function sendAnts(w: World): void {
  const { ants } = w;
  const data = new Float32Array(ants.count * ANT_STRIDE);
  const full = new Uint8Array(ants.count);
  for (let i = 0; i < ants.count; i++) {
    const o = i * ANT_STRIDE;
    data[o] = ants.x[i]!;
    data[o + 1] = ants.y[i]!;
    data[o + 2] = ants.heading[i]!;
    data[o + 3] = ants.state[i]!;
    data[o + 4] = ants.walked[i]!;
    full[i] = ants.crop[i]! > 0 ? 1 : 0;
  }
  post({ type: 'ants', step: w.step, ants: data, full }, [data.buffer, full.buffer]);
}

function sendArena(w: World): void {
  const trail = Float32Array.from(w.arena.trail);
  const wall = w.arena.wall.slice();
  let inNest = 0;
  for (let i = 0; i < w.ants.count; i++) if (w.ants.state[i] === AntState.inNest) inNest++;
  post(
    {
      type: 'arena',
      width: w.arena.width,
      height: w.arena.height,
      trail,
      wall,
      food: w.food.map((d) => ({ ...d })),
      ants: w.ants.count,
      inNest,
      stores: w.nest.stores,
    },
    [trail.buffer, wall.buffer],
  );
}

/** Keeper actions are applied between steps, in the order they arrived. */
function applyPending(w: World): boolean {
  const any = pending.length > 0;
  for (const msg of pending.splice(0)) {
    if (msg.type === 'sugar') placeSugar(w, msg.x, msg.y, msg.volume, msg.concentration);
    else if (msg.type === 'clearFood') for (const d of [...w.food]) removeFood(w, d.id);
  }
  return any;
}

onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    world = createWorld(msg.seed);
    // A first sugar drop, so a new tank has something to find.
    placeSugar(world, 140, 55, 40, 1);
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
    while (owed >= 1) {
      step(world);
      owed -= 1;
    }
  }
  sendAnts(world);
  if (++intervals % ARENA_EVERY === 0 || keeperActed) sendArena(world);
}, INTERVAL_MS);
