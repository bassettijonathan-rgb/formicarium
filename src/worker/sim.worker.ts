/**
 * Runs the simulation off the page's thread and sends snapshots to the renderer.
 * The simulation itself never sees real time; this loop decides how many
 * steps to run per real interval.
 */
import { STEPS_PER_SECOND } from '../sim/time';
import { createWorld, step, type World } from '../sim/world';
import type { FromWorker, ToWorker } from './protocol';

const INTERVAL_MS = 50;

let world: World | undefined;
let speed = 1;
let owed = 0;

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

onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    world = createWorld(msg.seed);
    sendFarm(world);
    post({ type: 'tick', step: world.step });
  } else if (msg.type === 'speed') {
    speed = msg.value;
  }
};

setInterval(() => {
  if (!world || speed <= 0) return;
  owed += (speed * STEPS_PER_SECOND * INTERVAL_MS) / 1000;
  while (owed >= 1) {
    step(world);
    owed -= 1;
  }
  post({ type: 'tick', step: world.step });
}, INTERVAL_MS);
