/**
 * Starts the page: a PixiJS view of the tank, fed by the simulation worker.
 * URL options: ?seed=N picks the tank (default: the kept tank, or tank 1);
 * ?seed=N&new starts tank N afresh.
 */
import { Application } from 'pixi.js';
import { Camera } from './render/camera';
import { ARENA_X, TankView } from './render/tankView';
import { ARENA_SIZE, FARM_HEIGHT, FARM_WIDTH } from './sim/tank';
import { STEPS_PER_SECOND, formatAntTime } from './sim/time';
import type { KeeperCommand } from './sim/keeper';
import type { AntCard } from './sim/inspect';
import { drawGraphs } from './ui/graphs';
import { Timelapse } from './ui/timelapse';
import { DEFAULT_ANT_PARAMS } from './sim/params';
import { Cause } from './sim/ants';
import { BroodStage } from './sim/brood';
import { BROOD_STRIDE, type FromWorker, type HistorySnapshot, type ToWorker } from './worker/protocol';
import { RoomLayer } from './render/room/roomLayer';
import { legnanoClock } from './room/sky';
import { CLEAR, REFRESH_MS, type Weather, fetchLegnanoWeather } from './room/weather';

/** A keeper's sugar drop: 10 µL, about the size of a lentil. */
const DROP_VOLUME = 10;
/** A crushed fruit fly or a piece of mealworm: about 3 µL of juices the ants can drink (rough). */
const INSECT_VOLUME = 3;
/** Seconds of ant time in a tank day (DESIGN.md D6). */
const DAY_SECONDS = DEFAULT_ANT_PARAMS.daySeconds;

async function start(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const status = document.getElementById('status')!;
  const counts = document.getElementById('counts')!;
  const away = document.getElementById('away')!;
  const inspector = document.getElementById('inspector')!;
  const query = new URLSearchParams(location.search);
  const asked = query.has('seed') ? parseSeed(query.get('seed')) : null;
  /** The tank running, once the worker has said which. */
  let seed = asked ?? 1;

  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x111317, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  stage.appendChild(app.canvas);

  const view = new TankView(app.renderer);
  app.stage.addChild(view.root);
  // The keeper's room behind the tank, lit by Legnano's real sky (DESIGN.md section 8.1).
  const room = new RoomLayer();
  view.root.addChildAt(room.root, 0);
  view.root.addChildAt(room.lampGlow, view.root.getChildIndex(view.lit) + 1);
  const outsideLine = document.getElementById('outside')!;
  let weather: Weather = CLEAR;
  let weatherKnown = false;
  const refreshWeather = async () => {
    const w = await fetchLegnanoWeather();
    if (w) {
      weather = w;
      weatherKnown = true;
    }
  };
  void refreshWeather();
  setInterval(() => void refreshWeather(), REFRESH_MS);
  let lastLine = 0;
  const showOutside = (ms: number) => {
    const { hours, minutes, zone } = legnanoClock(ms);
    const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${zone}`;
    const temperature = weather.temperature !== null ? `${Math.round(weather.temperature)} °C, ` : '';
    outsideLine.textContent = weatherKnown
      ? `Outside the window: Legnano, ${time}, ${temperature}${weather.label}.`
      : `Outside the window: Legnano, ${time}. No weather report yet, so the sky is drawn clear.`;
  };
  const camera = new Camera(view.root, stage);
  const hud = document.getElementById('hud')!;
  const fit = () => camera.fit(TankView.bounds, hud.getBoundingClientRect().bottom);
  fit();
  document.getElementById('fit')!.addEventListener('click', fit);
  // The controls fold away to a line, to leave the window and the tank in view.
  const hudToggle = document.getElementById('hud-toggle')!;
  hudToggle.addEventListener('click', () => {
    const small = hud.classList.toggle('small');
    hudToggle.textContent = small ? 'Show controls' : 'Hide controls';
    hudToggle.setAttribute('aria-expanded', String(!small));
    fit();
  });

  /** The step at which the colony died out, or -1 while it lives (from the arena snapshots). */
  let diedOut = -1;
  const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
  const send = (msg: ToWorker) => worker.postMessage(msg);
  const command = (c: KeeperCommand) => send({ type: 'command', command: c });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type === 'tank') {
      seed = msg.seed;
      history.replaceState(null, '', `?seed=${seed}`);
      inspect(-1);
      lapse = undefined;
      if (msg.note) showAway([msg.note]);
    } else if (msg.type === 'ask') {
      const k = msg.kept;
      const replace = confirm(
        `You keep tank ${k.seed} (ant time ${formatAntTime(k.step)}, ${k.workers} workers). ` +
          `Replace it with a new tank ${msg.seed}? The colony in tank ${k.seed} will be lost.`,
      );
      send(replace ? { type: 'open', seed: msg.seed, fresh: true } : { type: 'open', seed: null, fresh: false });
    } else if (msg.type === 'catchUp') {
      showCatchUp(msg.done, msg.total);
    } else if (msg.type === 'away') {
      showAway(msg.lines);
    } else if (msg.type === 'ant') {
      if (msg.id === inspected) showCard(msg.card);
    } else if (msg.type === 'history') {
      showHistory(msg);
    } else if (msg.type === 'farm') view.setSoil(msg);
    else if (msg.type === 'ants') {
      const now = performance.now();
      view.arena.ants.setAnts(msg, now);
      view.farmAnts.setAnts(msg, now);
      view.brood.setBrood(msg.brood);
      const n = [0, 0, 0, 0];
      for (let o = 2; o < msg.brood.length; o += BROOD_STRIDE) n[msg.brood[o]!]!++;
      status.textContent =
        `Tank ${seed} · ant time ${formatAntTime(msg.step)} · ` +
        (diedOut >= 0
          ? `the colony died out at ${formatAntTime(diedOut)}`
          : `brood: ${n[BroodStage.egg]} eggs, ${n[BroodStage.larva]} larvae, ${n[BroodStage.pupa]} pupae`);
    } else if (msg.type === 'heat') {
      view.heat.setHeat(msg);
    } else if (msg.type === 'arena') {
      view.arena.setArena(msg);
      diedOut = msg.diedOut;
      const d = msg.deaths;
      const died = [
        [d[Cause.age], 'of age'],
        [d[Cause.hunger], 'of hunger'],
        [d[Cause.drying], 'dried out'],
        [d[Cause.heat], 'of heat'],
      ].filter(([count]) => (count as number) > 0);
      counts.textContent =
        `${msg.ants - msg.out} workers in the farm, ${msg.out} out foraging, ` +
        `${msg.queen ? 'the queen' : 'no queen'} · ${msg.stores.toFixed(1)} µL of sugar water in their crops` +
        (died.length > 0 ? ` · dead: ${died.map(([count, what]) => `${count} ${what}`).join(', ')}` : '');
    }
  };
  send({ type: 'open', seed: asked, fresh: query.has('new') });
  // The worker keeps the tank every few seconds; also when the page is hidden or closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send({ type: 'save' });
  });
  addEventListener('pagehide', () => send({ type: 'save' }));

  /** The panel that says what happened while the tank was closed. */
  function showCatchUp(done: number, total: number): void {
    const days = (n: number) => (n / STEPS_PER_SECOND / DAY_SECONDS).toFixed(1);
    away.hidden = false;
    away.replaceChildren(
      text('h2', 'Welcome back'),
      text('p', `While the tank was closed its colony lived on. Catching up: day ${days(done)} of ${days(total)}…`),
      button('Skip the rest', () => send({ type: 'skip' })),
    );
  }
  function showAway(lines: string[]): void {
    away.hidden = false;
    away.replaceChildren(text('h2', 'While you were away'), ...lines.map((l) => text('p', l)), button('Close', () => (away.hidden = true)));
  }

  // The ant inspector (M6b): tap an ant to see what it is doing and its life so far; the view follows it.
  let inspected = -1;
  let following = false;
  const followButton = button('Follow', () => {
    following = !following;
    followButton.setAttribute('aria-pressed', String(following));
  });
  const inspect = (id: number) => {
    inspected = id;
    following = id >= 0;
    followButton.setAttribute('aria-pressed', String(following));
    send({ type: 'inspect', id: id >= 0 ? id : null });
    if (id < 0) inspector.hidden = true;
  };
  camera.onDrag = () => {
    following = false;
    followButton.setAttribute('aria-pressed', 'false');
  };
  function showCard(card: AntCard): void {
    inspector.hidden = false;
    const doing = text('p', `Now: ${card.doing}.`);
    doing.className = 'doing';
    const row = document.createElement('div');
    row.append(followButton, button('Close', () => inspect(-1)));
    inspector.replaceChildren(text('h2', card.title), doing, ...card.lines.map((l) => text('p', l)), row);
  }
  /** Where the inspected ant is drawn, in the scene's mm, or null while it is out of sight (in the tube). */
  const inspectedAt = () => {
    const inFarm = view.farmAnts.positionOf(inspected);
    if (inFarm) return inFarm;
    const inArena = view.arena.ants.positionOf(inspected);
    return inArena ? { x: inArena.x + ARENA_X, y: inArena.y } : null;
  };

  // The colony graphs and the timelapse (M6c), refreshed every few seconds while open.
  const historyPanel = document.getElementById('history')!;
  const graphBox = document.getElementById('graph-box')!;
  const lapseBox = document.getElementById('lapse-box')!;
  const lapseCanvas = document.getElementById('lapse') as HTMLCanvasElement;
  const lapsePlay = document.getElementById('lapse-play')!;
  const lapseAt = document.getElementById('lapse-at') as HTMLInputElement;
  const lapseLabel = document.getElementById('lapse-label')!;
  let showing: 'graphs' | 'timelapse' | null = null;
  let lapse: Timelapse | undefined;
  let refresh: number | undefined;
  const openHistory = (what: 'graphs' | 'timelapse') => {
    if (what !== 'timelapse') lapse?.stop();
    showing = what;
    historyPanel.hidden = false;
    graphBox.hidden = what !== 'graphs';
    lapseBox.hidden = what !== 'timelapse';
    document.getElementById('history-title')!.textContent = what === 'graphs' ? 'Colony graphs' : 'Timelapse of the nest';
    send({ type: 'history' });
    clearInterval(refresh);
    refresh = window.setInterval(() => send({ type: 'history' }), 3000);
  };
  const closeHistory = () => {
    showing = null;
    historyPanel.hidden = true;
    clearInterval(refresh);
    lapse?.stop();
    lapsePlay.textContent = 'Play';
  };
  document.getElementById('graphs')!.addEventListener('click', () => openHistory('graphs'));
  document.getElementById('timelapse')!.addEventListener('click', () => openHistory('timelapse'));
  document.getElementById('to-graphs')!.addEventListener('click', () => openHistory('graphs'));
  document.getElementById('to-lapse')!.addEventListener('click', () => openHistory('timelapse'));
  document.getElementById('history-close')!.addEventListener('click', closeHistory);
  lapsePlay.addEventListener('click', () => {
    if (!lapse) return;
    if (lapse.playing) lapse.stop();
    else lapse.play();
    lapsePlay.textContent = lapse.playing ? 'Pause' : 'Play';
  });
  lapseAt.addEventListener('input', () => {
    lapse?.stop();
    lapsePlay.textContent = 'Play';
    lapse?.show(Number(lapseAt.value));
  });
  function showHistory(msg: HistorySnapshot): void {
    if (showing === 'graphs') drawGraphs(graphBox, msg.censuses, msg.daySeconds, msg.cropLoad);
    if (showing !== 'timelapse') return;
    if (msg.frames.length === 0) {
      lapseLabel.textContent = 'The first picture of the nest is taken after 5 minutes of ant time.';
      return;
    }
    if (lapse && !lapse.playing) lapse.update(msg.frames, msg.frameSteps);
    else if (!lapse) {
      lapse = new Timelapse(lapseCanvas, msg.width, msg.height, msg.soil, msg.frames, msg.frameSteps, (step, n, of) => {
        lapseAt.max = String(of - 1);
        lapseAt.value = String(n);
        lapseLabel.textContent = `${formatAntTime(step)} of ant time (day ${(step / STEPS_PER_SECOND / msg.daySeconds).toFixed(1)}), picture ${n + 1} of ${of}`;
        if (n === of - 1 && !lapse?.playing) lapsePlay.textContent = 'Play';
      });
    }
  }

  let markerScale = 0;
  app.ticker.add(() => {
    const now = performance.now();
    const ms = Date.now();
    room.update(ms, now, weather);
    view.lit.tint = room.tankTint;
    if (now - lastLine > 1000) {
      lastLine = now;
      showOutside(ms);
    }
    view.arena.ants.update(now);
    view.farmAnts.update(now);
    const at = inspected >= 0 ? inspectedAt() : null;
    view.marker.visible = at !== null;
    if (at && camera.scale !== markerScale) {
      // The ring keeps a steady width on screen and never shrinks below a fingertip.
      markerScale = camera.scale;
      const s = markerScale;
      view.marker.clear().circle(0, 0, Math.max(14, 2.5 * s) / s).stroke({ width: 2 / s, color: 0xffd36b, alpha: 0.9 });
    }
    if (at) {
      view.marker.position.set(at.x, at.y);
      if (following) camera.centreOn(at.x, at.y);
    }
  });

  // Feeding: tap the arena floor to put a drop (or an insect) there. Watering: with the Water tool, tap the farm.
  let food = '1';
  let watering = false;
  camera.onTap = (px, py) => {
    const p = view.root.toLocal({ x: px, y: py });
    // A tap on an ant (within a finger's width) opens the inspector on it.
    const reach = Math.max(1.5, 14 / camera.scale);
    let ant = view.farmAnts.nearest(p.x, p.y, reach);
    if (ant < 0) ant = view.arena.ants.nearest(p.x - ARENA_X, p.y, reach);
    if (ant >= 0 && !watering) {
      inspect(ant);
      return;
    }
    if (watering && p.x >= 0 && p.x < FARM_WIDTH && p.y >= 0 && p.y < FARM_HEIGHT) {
      command({ type: 'water', x: p.x });
      return;
    }
    const x = p.x - ARENA_X;
    const y = p.y;
    if (x > 2 && y > 2 && x < ARENA_SIZE - 2 && y < ARENA_SIZE - 2) {
      if (food === 'protein') command({ type: 'protein', x, y, volume: INSECT_VOLUME });
      else command({ type: 'sugar', x, y, volume: DROP_VOLUME, concentration: Number(food) });
    }
  };
  const sugarButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-sugar]')];
  for (const button of sugarButtons) {
    button.addEventListener('click', () => {
      food = button.dataset.sugar ?? '1';
      for (const b of sugarButtons) b.setAttribute('aria-pressed', String(b === button));
    });
  }
  document.getElementById('clear')!.addEventListener('click', () => command({ type: 'clearFood' }));
  document.getElementById('clean')!.addEventListener('click', () => command({ type: 'clean' }));
  document.getElementById('new-tank')!.addEventListener('click', () => {
    if (confirm(`Start a new tank? The colony in tank ${seed} will be lost.`)) location.search = `?seed=${seed + 1}&new`;
  });
  const waterButton = document.getElementById('water')!;
  waterButton.addEventListener('click', () => {
    watering = waterButton.getAttribute('aria-pressed') !== 'true';
    waterButton.setAttribute('aria-pressed', String(watering));
  });
  const trailsButton = document.getElementById('trails')!;
  trailsButton.addEventListener('click', () => {
    const on = trailsButton.getAttribute('aria-pressed') !== 'true';
    trailsButton.setAttribute('aria-pressed', String(on));
    view.arena.showTrails = on;
  });

  // The farm's overlay shows warmth or damp, or neither.
  const overlayButtons = [document.getElementById('warmth')!, document.getElementById('damp')!];
  for (const button of overlayButtons) {
    button.addEventListener('click', () => {
      const on = button.getAttribute('aria-pressed') !== 'true';
      for (const b of overlayButtons) b.setAttribute('aria-pressed', String(on && b === button));
      view.heat.show = on ? (button.id === 'warmth' ? 'warmth' : 'damp') : null;
    });
  }
  const matButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-mat]')];
  for (const button of matButtons) {
    button.addEventListener('click', () => {
      const at = button.dataset.mat;
      command({ type: 'heatMat', x: at === 'off' ? null : Number(at) });
      for (const b of matButtons) b.setAttribute('aria-pressed', String(b === button));
    });
  }

  const speedButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-speed]')];
  for (const button of speedButtons) {
    button.addEventListener('click', () => {
      send({ type: 'speed', value: Number(button.dataset.speed) });
      for (const b of speedButtons) b.setAttribute('aria-pressed', String(b === button));
    });
  }
}

function text(tag: string, content: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = content;
  return el;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function parseSeed(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 0 ? n : 1;
}

void start();
