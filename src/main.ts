/**
 * Starts the page: a PixiJS view of the tank, fed by the simulation worker.
 * URL options: ?seed=N picks the tank (default 1).
 */
import { Application } from 'pixi.js';
import { Camera } from './render/camera';
import { ARENA_X, TankView } from './render/tankView';
import { ARENA_SIZE } from './sim/tank';
import { formatAntTime } from './sim/time';
import type { FromWorker, ToWorker } from './worker/protocol';

/** A keeper's sugar drop: 10 µL, about the size of a lentil. */
const DROP_VOLUME = 10;

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
    if (msg.type === 'farm') view.setSoil(msg.width, msg.height, msg.material, msg.moisture);
    else if (msg.type === 'ants') {
      view.arena.setAnts(msg, performance.now());
      status.textContent = `Tank ${seed} · ant time ${formatAntTime(msg.step)}`;
    } else if (msg.type === 'arena') {
      view.arena.setArena(msg);
      const out = msg.ants - msg.inNest;
      counts.textContent = `${out} ants out, ${msg.inNest} in the nest · ${msg.stores.toFixed(1)} µL of sugar water stored`;
    }
  };
  send({ type: 'start', seed });

  app.ticker.add(() => view.arena.update(performance.now()));

  // Feeding: tap the arena floor to put a drop there.
  let concentration = 1;
  camera.onTap = (px, py) => {
    const p = view.root.toLocal({ x: px, y: py });
    const x = p.x - ARENA_X;
    const y = p.y;
    if (x > 2 && y > 2 && x < ARENA_SIZE - 2 && y < ARENA_SIZE - 2) {
      send({ type: 'sugar', x, y, volume: DROP_VOLUME, concentration });
    }
  };
  const sugarButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-sugar]')];
  for (const button of sugarButtons) {
    button.addEventListener('click', () => {
      concentration = Number(button.dataset.sugar);
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
