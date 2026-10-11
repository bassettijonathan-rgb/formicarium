/**
 * Starts the page: a PixiJS view of the tank, fed by the simulation worker.
 * URL options: ?seed=N picks the tank (default 1).
 */
import { Application } from 'pixi.js';
import { Camera } from './render/camera';
import { ARENA_X, TankView } from './render/tankView';
import { ARENA_SIZE } from './sim/tank';
import { formatAntTime } from './sim/time';
import { BroodStage } from './sim/brood';
import { BROOD_STRIDE, type FromWorker, type ToWorker } from './worker/protocol';

/** A keeper's sugar drop: 10 µL, about the size of a lentil. */
const DROP_VOLUME = 10;
/** A crushed fruit fly or a piece of mealworm: about 3 µL of juices the ants can drink (rough). */
const INSECT_VOLUME = 3;

async function start(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const status = document.getElementById('status')!;
  const counts = document.getElementById('counts')!;
  const seed = parseSeed(new URLSearchParams(location.search).get('seed'));

  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x111317, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  stage.appendChild(app.canvas);

  const view = new TankView(app.renderer);
  app.stage.addChild(view.root);
  const camera = new Camera(view.root, stage);
  const hud = document.getElementById('hud')!;
  const fit = () => camera.fit(TankView.bounds, hud.getBoundingClientRect().bottom);
  fit();
  document.getElementById('fit')!.addEventListener('click', fit);

  const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
  const send = (msg: ToWorker) => worker.postMessage(msg);
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type === 'farm') view.setSoil(msg);
    else if (msg.type === 'ants') {
      const now = performance.now();
      view.arena.ants.setAnts(msg, now);
      view.farmAnts.setAnts(msg, now);
      view.brood.setBrood(msg.brood);
      const n = [0, 0, 0, 0];
      for (let o = 2; o < msg.brood.length; o += BROOD_STRIDE) n[msg.brood[o]!]!++;
      status.textContent =
        `Tank ${seed} · ant time ${formatAntTime(msg.step)} · ` +
        `brood: ${n[BroodStage.egg]} eggs, ${n[BroodStage.larva]} larvae, ${n[BroodStage.pupa]} pupae`;
    } else if (msg.type === 'arena') {
      view.arena.setArena(msg);
      counts.textContent =
        `${msg.ants - msg.out} ants in the farm, ${msg.out} out foraging · ` +
        `${msg.stores.toFixed(1)} µL of sugar water in their crops`;
    }
  };
  send({ type: 'start', seed });

  app.ticker.add(() => {
    const now = performance.now();
    view.arena.ants.update(now);
    view.farmAnts.update(now);
  });

  // Feeding: tap the arena floor to put a drop (or an insect) there.
  let food = '1';
  camera.onTap = (px, py) => {
    const p = view.root.toLocal({ x: px, y: py });
    const x = p.x - ARENA_X;
    const y = p.y;
    if (x > 2 && y > 2 && x < ARENA_SIZE - 2 && y < ARENA_SIZE - 2) {
      if (food === 'protein') send({ type: 'protein', x, y, volume: INSECT_VOLUME });
      else send({ type: 'sugar', x, y, volume: DROP_VOLUME, concentration: Number(food) });
    }
  };
  const sugarButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-sugar]')];
  for (const button of sugarButtons) {
    button.addEventListener('click', () => {
      food = button.dataset.sugar ?? '1';
      for (const b of sugarButtons) b.setAttribute('aria-pressed', String(b === button));
    });
  }
  document.getElementById('clear')!.addEventListener('click', () => send({ type: 'clearFood' }));
  const trailsButton = document.getElementById('trails')!;
  trailsButton.addEventListener('click', () => {
    const on = trailsButton.getAttribute('aria-pressed') !== 'true';
    trailsButton.setAttribute('aria-pressed', String(on));
    view.arena.showTrails = on;
  });

  const speedButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-speed]')];
  for (const button of speedButtons) {
    button.addEventListener('click', () => {
      send({ type: 'speed', value: Number(button.dataset.speed) });
      for (const b of speedButtons) b.setAttribute('aria-pressed', String(b === button));
    });
  }
}

function parseSeed(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 0 ? n : 1;
}

void start();
