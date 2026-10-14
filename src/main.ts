/**
 * Starts the page: a PixiJS view of the tank, fed by the simulation worker.
 * URL options: ?seed=N picks the tank (default: the kept tank, or tank 1);
 * ?seed=N&new starts tank N afresh, in a bought nest of `size` (S, M or L)
 * and `layout` (classic, organic or honeycomb), medium classic by default.
 */
import { Application } from 'pixi.js';
import { Camera } from './render/camera';
import { TankView } from './render/tankView';
import { ArenaLayer } from './render/arenaLayer';
import { STEPS_PER_SECOND, formatAntTime } from './sim/time';
import type { KeeperCommand } from './sim/keeper';
import type { Item } from './sim/objects';
import type { Cut } from './sim/prey';
import { type Decoration, decorationAt } from './sim/decor';
import type { AntCard } from './sim/inspect';
import { drawGraphs } from './ui/graphs';
import { Timelapse } from './ui/timelapse';
import { DEFAULT_ANT_PARAMS } from './sim/params';
import { Cause } from './sim/ants';
import { BroodStage } from './sim/brood';
import { BROOD_STRIDE, type FromWorker, type HistorySnapshot, type ToWorker } from './worker/protocol';
import { RoomLayer } from './render/room/roomLayer';
import { DEFAULT_NEST, NEST_MATERIALS, NEST_SIZES, type NestLayout, type NestMaterial, type NestSetup, type NestSize, TEST_TUBE_SETUP } from './sim/nest';
import { MAT_WIDTH } from './sim/heat';
import { legnanoClock } from './room/sky';
import { CLEAR, REFRESH_MS, type Weather, fetchLegnanoWeather } from './room/weather';

/** A keeper's sugar drop: 10 µL, about the size of a lentil. */
const DROP_VOLUME = 10;
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
  /** The bought nest a new tank starts in (from the page's address, else the default). */
  const nest = nestFrom(query);

  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x111317, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  stage.appendChild(app.canvas);

  const view = new TankView(app.renderer);
  app.stage.addChild(view.root);
  // The keeper's room behind the tank, lit by Legnano's real sky (DESIGN.md section 8.1).
  const room = new RoomLayer(ArenaLayer.vanishingPoint);
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
  const fit = () => camera.fit(view.bounds, hud.getBoundingClientRect().bottom);
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

  /** Whether the view has been fitted to the tank since it arrived. */
  let framed = false;
  /** True after the keeper adds a nest, so the next picture of the table is framed. */
  let fitAfterTable = false;
  /** The step at which the colony died out, or -1 while it lives (from the arena snapshots). */
  let diedOut = -1;
  /** After the keeper puts in or moves an object: the decorations as they were, until the snapshots show whether it fitted. */
  let fitCheck: { before: readonly Decoration[]; snapshots: number } | null = null;
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
      send(replace ? { type: 'open', seed: msg.seed, fresh: true, nest } : { type: 'open', seed: null, fresh: false });
    } else if (msg.type === 'catchUp') {
      showCatchUp(msg.done, msg.total);
    } else if (msg.type === 'away') {
      showAway(msg.lines);
    } else if (msg.type === 'ant') {
      if (msg.id === inspected) showCard(msg.card);
    } else if (msg.type === 'history') {
      showHistory(msg);
    } else if (msg.type === 'farm') {
      const before = view.boughtNest;
      view.setSoil(msg);
      showNestControls(msg.table?.modules[0]?.material ?? null, msg.table?.modules[0]?.kind === 'tube');
      // The first picture of the tank, a tank of the other kind, or a table with a new nest on it: frame it.
      if (!framed || before !== view.boughtNest || fitAfterTable) fit();
      fitAfterTable = false;
      framed = true;
    }
    else if (msg.type === 'ants') {
      const now = performance.now();
      view.arena.ants.setAnts(msg, now);
      view.farmAnts.setAnts(msg, now);
      view.brood.setBrood(msg.brood, msg.prey);
      view.arena.setPieces(msg.prey);
      const n = [0, 0, 0, 0];
      for (let o = 2; o < msg.brood.length; o += BROOD_STRIDE) n[msg.brood[o]!]!++;
      status.textContent =
        `Tank ${seed} · ant time ${formatAntTime(msg.step)} · ` +
        (diedOut >= 0
          ? `the colony died out at ${formatAntTime(diedOut)}`
          : `brood: ${n[BroodStage.egg]} eggs, ${n[BroodStage.larva]} larvae, ${n[BroodStage.pupa]} pupae`);
    } else if (msg.type === 'heat') {
      view.setHeat(msg);
      showCover(msg.lit);
    } else if (msg.type === 'arena') {
      view.arena.setArena(msg);
      if (fitCheck && view.arena.decorations !== fitCheck.before) fitCheck = null;
      else if (fitCheck && ++fitCheck.snapshots >= 3) {
        fitCheck = null;
        showPutHint("That doesn't fit there: things can't cover the tube's mouth, touch the glass, or stand on each other or on food.", 5000);
      }
      diedOut = msg.diedOut;
      const d = msg.deaths;
      const died = [
        [d[Cause.age], 'of age'],
        [d[Cause.hunger], 'of hunger'],
        [d[Cause.drying], 'dried out'],
        [d[Cause.heat], 'of heat'],
      ].filter(([count]) => (count as number) > 0);
      counts.textContent =
        `${msg.ants - msg.out} workers in the ${view.boughtNest ? 'nest' : 'farm'}, ${msg.out} out foraging, ` +
        `${msg.queen ? 'the queen' : 'no queen'} · ${msg.stores.toFixed(1)} µL of sugar water in their crops` +
        (died.length > 0 ? ` · dead: ${died.map(([count, what]) => `${count} ${what}`).join(', ')}` : '');
    }
  };
  send({ type: 'open', seed: asked, fresh: query.has('new'), nest });
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
    const inFarm = view.farmAntPosition(inspected);
    if (inFarm) return inFarm;
    return view.arena.ants.positionOf(inspected);
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
      lapseLabel.textContent = msg.bought
        ? 'A bought nest keeps its shape, so there is no timelapse of it: the timelapse shows a sand farm being dug.'
        : 'The first picture of the nest is taken after 5 minutes of ant time.';
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

  // Feeding: tap the arena floor to put a drop (or an insect) there. The farm waters itself.
  let food = '1';
  let cut: Cut = 'whole';
  /** The sugar chosen for drops, feeders and refills: rich sugar while an insect is chosen. */
  const sugar = () => (food === '0.1' ? 0.1 : 1);
  // The keeper's objects (DESIGN.md B3): with a tool chosen, the next tap puts an object in, or picks one to move or take out.
  let tool: string | null = null;
  /** The decoration picked to move, waiting for the tap that says where it goes. */
  let moving = -1;
  const putButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-put]')];
  const putHint = document.getElementById('put-hint')!;
  let hintTimer = 0;
  /** Shows a line under the object buttons (none if empty), for `ms` or until the next one. */
  function showPutHint(text: string, ms = 0): void {
    window.clearTimeout(hintTimer);
    putHint.textContent = text;
    putHint.hidden = text === '';
    if (ms > 0) hintTimer = window.setTimeout(() => (putHint.hidden = true), ms);
  }
  const NAMES: Record<string, string> = { stone: 'stone', bark: 'cork bark', tube: 'water tube', dish: 'feeding dish', feeder: 'sugar feeder', branch: 'branch', twig: 'twig', leaf: 'leaf', moss: 'moss' };
  const chooseTool = (next: string | null, hint = '') => {
    tool = next;
    moving = -1;
    for (const b of putButtons) b.setAttribute('aria-pressed', String(b.dataset.put === next));
    showPutHint(hint);
  };
  for (const button of putButtons) {
    button.addEventListener('click', () => {
      const put = button.dataset.put!;
      if (tool === put) chooseTool(null);
      else if (put in TABLE_HINTS) chooseTool(put, TABLE_HINTS[put]);
      else if (put === 'move') chooseTool(put, 'Tap the thing to move.');
      else if (put === 'remove') chooseTool(put, 'Tap the thing to take out.');
      else chooseTool(put, `Tap where the ${NAMES[put]} should go. It can't cover the tube's mouth or stand on something else.`);
    });
  }
  /** The decoration seen under a tap, or -1. */
  const picked = (p: { x: number; y: number }) => {
    const { u, v } = view.arena.surfaceAt(p.x, p.y);
    return decorationAt([...view.arena.decorations], u, v);
  };
  // The table of nests (N8): join two ports with a tube, push a tube's plug in or pull it out, move the arena's tube, take things away.
  const TABLE_HINTS: Record<string, string> = {
    join: 'Tap a free port in the right end of a nest, then another.',
    plug: "Tap a tube to pull its cotton plug out, or push one in.",
    arena: "Tap the port the arena's tube should go into.",
    moveNest: 'Tap an empty nest with nothing plugged in, then the spot where its middle should go.',
    takeAway: 'Tap an empty tube or an empty nest with nothing plugged in to take it away.',
    coverOne: 'Tap a nest or the test tube to take its cover off, or put it back. Ants move out of the light into a dark nest.',
  };
  /** The first port tapped while joining two. */
  let joinFrom: { module: number; port: number } | null = null;
  /** The nest picked up while moving one. */
  let moveFrom: number | null = null;
  /** The port, tube or nest of the table under a tap (within a finger's width), if any. */
  const onTable = (p: { x: number; y: number }) => {
    const t = view.nest.shape;
    if (!t || !view.boughtNest) return {};
    const { u, v } = view.nest.toFloor(p.x, p.y);
    const reach = Math.max(6, 14 / camera.scale);
    let port: { module: number; port: number } | undefined;
    let best = reach;
    for (const m of t.modules) {
      m.ports.forEach((q, k) => {
        const d = Math.hypot(q.x - u, q.y - v);
        if (d < best) [best, port] = [d, { module: m.id, port: k }];
      });
    }
    let tube: number | undefined;
    best = reach;
    for (const tb of t.tubes) {
      for (let k = 2; k < tb.path.length; k += 2) {
        const d = segmentDistance(u, v, tb.path[k - 2]!, tb.path[k - 1]!, tb.path[k]!, tb.path[k + 1]!);
        if (d < best) [best, tube] = [d, tb.id];
      }
    }
    const module = t.modules.find((m) => u >= m.x && u < m.x + m.width && v >= m.y && v < m.y + m.height)?.id;
    return { port, tube, module };
  };
  /** A keeper's tap with a table tool chosen. */
  const useTableTool = (p: { x: number; y: number }) => {
    const { port, tube, module } = onTable(p);
    if (tool === 'join' && port && !joinFrom) {
      joinFrom = port;
      putHint.textContent = 'Now tap the port the tube goes to.';
      return;
    }
    if (tool === 'moveNest' && moveFrom === null && module !== undefined) {
      moveFrom = module;
      putHint.textContent = 'Now tap where its middle should go.';
      return;
    }
    if (tool === 'moveNest' && moveFrom !== null) {
      const m = view.nest.shape!.modules.find((x) => x.id === moveFrom)!;
      const { u, v } = view.nest.toFloor(p.x, p.y);
      command({ type: 'moveNest', module: moveFrom, x: Math.round(u - m.width / 2), y: Math.round(v - m.height / 2) });
    } else if (tool === 'join' && port && joinFrom) {
      command({ type: 'connect', a: joinFrom, b: port, plugged: true });
      showPutHint('The tube has a cotton plug in it: choose "Plug" and tap the tube to open it.', 6000);
    } else if (tool === 'plug' && tube !== undefined) {
      const t = view.nest.shape!.tubes.find((x) => x.id === tube)!;
      command({ type: 'plug', tube, plugged: !t.plugged });
    } else if (tool === 'arena' && port) command({ type: 'arenaTube', to: port });
    else if (tool === 'takeAway' && tube !== undefined) command({ type: 'removeTube', tube });
    else if (tool === 'takeAway' && module !== undefined) command({ type: 'removeNest', module });
    else if (tool === 'coverOne' && module !== undefined) {
      const m = view.nest.shape!.modules.find((x) => x.id === module)!;
      const at = coverLit.find((c) => c.module === module);
      const covered = !at || at.to <= at.from;
      command({ type: 'cover', from: 0, to: covered ? m.width : 0, module });
    }
    joinFrom = null;
    moveFrom = null;
    tool = null;
    for (const b of putButtons) b.setAttribute('aria-pressed', 'false');
    if (putHint.textContent === TABLE_HINTS.join || putHint.textContent === TABLE_HINTS.moveNest || putHint.textContent?.startsWith('Now tap')) showPutHint('');
  };
  /** A keeper's tap with an object tool chosen. */
  const useTool = (p: { x: number; y: number }) => {
    if (tool && tool in TABLE_HINTS) {
      useTableTool(p);
      return;
    }
    const { u: x, v: y } = view.arena.toFloor(p.x, p.y);
    if (tool === 'move' && moving < 0) {
      moving = picked(p);
      const d = view.arena.decorations[moving];
      if (d) {
        putHint.textContent = `Tap where the ${NAMES[d.kind]} should go.`;
        return;
      }
    } else if (tool === 'move') {
      fitCheck = { before: view.arena.decorations, snapshots: 0 };
      command({ type: 'move', index: moving, x, y });
    } else if (tool === 'remove') {
      const k = picked(p);
      if (k >= 0) command({ type: 'remove', index: k });
    } else if (tool) {
      fitCheck = { before: view.arena.decorations, snapshots: 0 };
      command({ type: 'put', item: tool as Item, x, y, concentration: sugar() });
    }
    chooseTool(null);
  };
  camera.onTap = (px, py) => {
    const p = view.root.toLocal({ x: px, y: py });
    if (tool) {
      useTool(p);
      return;
    }
    // A tap on an ant (within a finger's width) opens the inspector on it.
    const reach = Math.max(1.5, 14 / camera.scale);
    let ant = view.farmAntAt(p.x, p.y, reach);
    if (ant < 0) ant = view.arena.ants.nearest(p.x, p.y, reach);
    if (ant >= 0) {
      inspect(ant);
      return;
    }
    // The point of the arena under the tap: on the floor, or in a dish (the worker refuses food put on a stone).
    const { u: x, v: y } = view.arena.surfaceAt(p.x, p.y);
    if (x > 2 && y > 2 && x < view.arena.floorWidth - 2 && y < view.arena.floorHeight - 2) {
      if (food === 'fly' || food === 'cricket' || food === 'mealworm') command({ type: 'insect', insect: food, cut, x, y });
      else command({ type: 'sugar', x, y, volume: DROP_VOLUME, concentration: Number(food) });
    }
  };
  // The liquid feeders filled with the sugar chosen above (rich if an insect is chosen).
  document.getElementById('refill')!.addEventListener('click', () => command({ type: 'refill', concentration: sugar() }));
  const sugarButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-sugar]')];
  const cutRow = document.getElementById('cut-row')!;
  for (const button of sugarButtons) {
    button.addEventListener('click', () => {
      food = button.dataset.sugar ?? '1';
      for (const b of sugarButtons) b.setAttribute('aria-pressed', String(b === button));
      // A fruit fly is given whole; a cricket or a mealworm whole, cut in two, or in pieces (B6).
      cutRow.hidden = food !== 'cricket' && food !== 'mealworm';
    });
  }
  const cutButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-cut]')];
  for (const button of cutButtons) {
    button.addEventListener('click', () => {
      cut = (button.dataset.cut ?? 'whole') as Cut;
      for (const b of cutButtons) b.setAttribute('aria-pressed', String(b === button));
    });
  }
  document.getElementById('clear')!.addEventListener('click', () => command({ type: 'clearFood' }));
  document.getElementById('clean')!.addEventListener('click', () => command({ type: 'clean' }));
  // A new tank, in a bought nest of the size and layout chosen (DESIGN.md 3.5).
  const sizeButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-size]')];
  const layoutButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-layout]')];
  const materialButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-material]')];
  const choose = (buttons: HTMLButtonElement[], pick: (b: HTMLButtonElement) => boolean) => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(pick(b)));
  };
  choose(sizeButtons, (b) => b.dataset.size === nest.size);
  choose(layoutButtons, (b) => b.dataset.layout === nest.layout);
  choose(materialButtons, (b) => b.dataset.material === (nest.material ?? 'ytong'));
  for (const b of materialButtons) b.addEventListener('click', () => choose(materialButtons, (x) => x === b));
  for (const b of sizeButtons) b.addEventListener('click', () => choose(sizeButtons, (x) => x === b));
  for (const b of layoutButtons) b.addEventListener('click', () => choose(layoutButtons, (x) => x === b));
  // A nest of the kind chosen laid on the table, in front of the others (N8).
  document.getElementById('add-nest')!.addEventListener('click', () => {
    const size = (sizeButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.size ?? DEFAULT_NEST.size) as NestSize;
    const layout = (layoutButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.layout ?? DEFAULT_NEST.layout) as NestLayout;
    const material = (materialButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.material ?? 'ytong') as NestMaterial;
    command({ type: 'addNest', nest: { size, layout, material } });
    showPutHint('The new nest lies in front of the others. Choose "Join ports" to lay a tube to it.', 6000);
    fitAfterTable = true;
  });
  document.getElementById('new-tube')!.addEventListener('click', () => {
    if (confirm(`Start a new tank with a young colony in a test tube? The colony in tank ${seed} will be lost.`)) location.search = `?seed=${seed + 1}&new&tube`;
  });
  document.getElementById('new-tank')!.addEventListener('click', () => {
    const size = sizeButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.size ?? DEFAULT_NEST.size;
    const layout = layoutButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.layout ?? DEFAULT_NEST.layout;
    const material = materialButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.material ?? 'ytong';
    if (confirm(`Start a new tank in a new nest? The colony in tank ${seed} will be lost.`)) {
      location.search = `?seed=${seed + 1}&new&size=${size}&layout=${layout}&material=${material}`;
    }
  });
  const trailsButton = document.getElementById('trails')!;
  trailsButton.addEventListener('click', () => {
    const on = trailsButton.getAttribute('aria-pressed') !== 'true';
    trailsButton.setAttribute('aria-pressed', String(on));
    view.arena.showTrails = on;
  });
  // The nest and the arena at an angle (DESIGN.md A3, N3), or straight from above, which shows trails best.
  const aboveButton = document.getElementById('from-above')!;
  aboveButton.addEventListener('click', () => {
    view.angled = !view.angled;
    aboveButton.setAttribute('aria-pressed', String(!view.angled));
    fit();
  });

  /** Says how the nest's water works, which differs between materials and the sand farm; only a bought nest has a cover. */
  function showNestControls(material: NestMaterial | null, testTube = false): void {
    document.getElementById('damp-note')!.textContent = testTube
      ? "The test tube's wet cotton keeps its air damp nearly to the mouth; nests added to the table have their own water."
      : material
        ? DAMP_NOTES[material]
        : 'Soil darkens when damp; the farm waters itself and never dries.';
    document.getElementById('cover-row')!.hidden = material === null;
    document.getElementById('table-row')!.hidden = material === null;
    document.getElementById('add-nest')!.hidden = material === null;
  }

  /** Where each module's cover is lifted, as the worker last said. */
  let coverLit: { module: number; from: number; to: number }[] = [];
  // The covers on the nests (N7): on, lifted from each nest's left or right half, or off. Under them the ants are in the dark.
  const coverButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-cover]')];
  for (const button of coverButtons) {
    button.addEventListener('click', () => {
      for (const m of view.nest.shape?.modules ?? []) {
        const w = m.width;
        const [from, to] = { on: [0, 0], left: [0, w / 2], right: [w / 2, w], off: [0, w] }[button.dataset.cover as 'on'];
        command({ type: 'cover', from: from!, to: to!, module: m.id });
      }
    });
  }
  /** Marks the cover button that matches where the first nest's cover is lifted. */
  function showCover(lit: { module: number; from: number; to: number }[] | null): void {
    coverLit = lit ?? [];
    const first = lit?.[0];
    const m = view.nest.shape?.modules[0];
    if (!first || !m) return;
    const w = m.width;
    const at = first.to <= first.from ? 'on' : first.from <= 0 && first.to >= w ? 'off' : first.from <= 0 ? 'left' : 'right';
    for (const b of coverButtons) b.setAttribute('aria-pressed', String(b.dataset.cover === at));
  }

  // The nest's overlay shows warmth or damp, or neither.
  const overlayButtons = [document.getElementById('warmth')!, document.getElementById('damp')!];
  for (const button of overlayButtons) {
    button.addEventListener('click', () => {
      const on = button.getAttribute('aria-pressed') !== 'true';
      for (const b of overlayButtons) b.setAttribute('aria-pressed', String(on && b === button));
      view.heat.show = on ? (button.id === 'warmth' ? 'warmth' : 'damp') : null;
    });
  }
  // The heat mat under the left end, the middle or the right end of the nest (the sand farm's old places).
  const matButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-mat]')];
  for (const button of matButtons) {
    button.addEventListener('click', () => {
      const at = button.dataset.mat;
      const room = view.nestWidth - MAT_WIDTH;
      const x = view.boughtNest
        ? { left: 0, middle: room / 2, right: room }[at as 'left']
        : { left: 10, middle: 110, right: 210 }[at as 'left'];
      command({ type: 'heatMat', x: at === 'off' ? null : x });
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

/** Distance from (x, y) to the segment from (ax, ay) to (bx, by). */
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

/** The bought nest asked for in the page's address, or (by default) a test tube (N9). */
function nestFrom(query: URLSearchParams): NestSetup {
  if (query.has('tube') || !query.has('size')) return TEST_TUBE_SETUP;
  const size = query.get('size') ?? '';
  const layout = query.get('layout') ?? '';
  const material = query.get('material') ?? '';
  return {
    size: size in NEST_SIZES ? (size as NestSize) : DEFAULT_NEST.size,
    layout: ['classic', 'organic', 'honeycomb'].includes(layout) ? (layout as NestLayout) : DEFAULT_NEST.layout,
    material: material in NEST_MATERIALS ? (material as NestMaterial) : 'ytong',
  };
}

/** How each material holds water, for the note by "Show damp" (DESIGN.md 3.5). */
const DAMP_NOTES: Record<NestMaterial, string> = {
  ytong: 'The ytong is wet near its water hole and drier far from it; the hole refills itself.',
  plaster: 'The plaster soaks water up from its hole a little farther than ytong; the hole refills itself.',
  acrylic: 'Acrylic holds no water: only the air near the wet sponge is humid. The sponge stays wet.',
  wood: 'The wood holds a little water near its hole, unevenly along the grain; the hole refills itself.',
};

function parseSeed(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 0 ? n : 1;
}

void start();
