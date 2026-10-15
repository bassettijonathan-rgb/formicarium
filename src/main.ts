/**
 * Starts the page: a PixiJS view of the tank, fed by the simulation worker.
 * The page opens on the keeper's tanks (U1); a tank fills the screen with a
 * bar on top and six tabs of tools at the bottom (U4). Tapping a nest, a tube
 * or a thing in the arena opens a card for it (U5).
 */
import { Application } from 'pixi.js';
import { Camera } from './render/camera';
import { TankView } from './render/tankView';
import { ArenaLayer } from './render/arenaLayer';
import { STEPS_PER_SECOND, formatAntTime } from './sim/time';
import type { KeeperCommand } from './sim/keeper';
import type { Item } from './sim/objects';
import type { Cut, Insect, SeedMix } from './sim/prey';
import { type Decoration, decorationAt } from './sim/decor';
import type { AntCard } from './sim/inspect';
import { drawGraphs } from './ui/graphs';
import { Timelapse } from './ui/timelapse';
import { DEFAULT_ANT_PARAMS } from './sim/params';
import { Cause } from './sim/ants';
import { BroodStage } from './sim/brood';
import { Material } from './sim/materials';
import { BROOD_STRIDE, type FarmSnapshot, type FromWorker, type HistorySnapshot, type NestShape, type ToWorker } from './worker/protocol';
import type { ShelfEntry } from './worker/store';
import { RoomLayer } from './render/room/roomLayer';
import { NEST_SIZES, type NestLayout, type NestMaterial, type NestSetup, type NestSize, TEST_TUBE_SETUP } from './sim/nest';
import { MAT_WIDTH } from './sim/heat';
import { legnanoClock } from './room/sky';
import { CLEAR, REFRESH_MS, type Weather, fetchLegnanoWeather } from './room/weather';
import { download, readTankFile, tankFile } from './ui/tankFile';
import { WholeTable } from './ui/wholeTable';
import { SPECIES_NAMES, Species, type SpeciesId } from './sim/species';

/** A keeper's sugar drop: 10 µL, about the size of a lentil. */
const DROP_VOLUME = 10;
/** Seconds of ant time in a tank day (DESIGN.md D6). */
const DAY_SECONDS = DEFAULT_ANT_PARAMS.daySeconds;
/** Bare table the worker keeps round a nest, mm (`CLEAR` in table.ts). */
const NEST_CLEAR = 4;
/** How far, mm, a nest being placed slips to the nearest spot where it fits. */
const SNAP = 12;

type Tab = 'watch' | 'feed' | 'arena' | 'nests' | 'climate' | 'colony';

async function start(): Promise<void> {
  const $ = (id: string) => document.getElementById(id)!;
  const stage = $('stage');
  const top = $('top');
  const dock = $('dock');
  const counts = $('counts');
  const card = $('card');
  const away = $('away');
  const inspector = $('inspector');
  const startScreen = $('start');
  const newScreen = $('new');
  const whole = $('whole');

  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x111317, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  stage.appendChild(app.canvas);

  const view = new TankView(app.renderer);
  app.stage.addChild(view.root);
  // The keeper's room behind the tank, lit by Legnano's real sky (DESIGN.md section 8.1).
  const room = new RoomLayer(ArenaLayer.vanishingPoint);
  view.root.addChildAt(room.root, 0);
  view.root.addChildAt(room.lampGlow, view.root.getChildIndex(view.lit) + 1);
  const outsideLine = $('outside');
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
      ? `The room follows the weather outside the window: Legnano, ${time}, ${temperature}${weather.label}.`
      : `The room follows the weather outside the window: Legnano, ${time}. No weather report yet, so the sky is drawn clear.`;
  };

  // The bars take the top and bottom of the screen; the overlays sit between them.
  const camera = new Camera(view.root, stage);
  const barTop = () => (top.hidden ? 0 : top.getBoundingClientRect().bottom);
  const barBottom = () => (dock.hidden ? 0 : dock.getBoundingClientRect().height);
  const fit = () => camera.fit(view.bounds, barTop() + 28, barBottom());
  const placeOverlays = () => {
    counts.style.top = `${barTop() + 6}px`;
    card.style.top = `${barTop() + 6}px`;
    inspector.style.bottom = `${barBottom() + 10}px`;
    away.style.bottom = `${barBottom() + 10}px`;
    whole.style.top = `${barTop()}px`;
    whole.style.bottom = `${barBottom()}px`;
    if (!whole.hidden) wholeTable.draw();
  };
  new ResizeObserver(placeOverlays).observe(top);
  new ResizeObserver(placeOverlays).observe(dock);
  $('fit').addEventListener('click', fit);

  const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
  const send = (msg: ToWorker) => worker.postMessage(msg);
  const command = (c: KeeperCommand) => send({ type: 'command', command: c });

  /** Whether the view has been fitted to the tank since it opened. */
  let framed = false;
  /** True after the keeper changes the table, so the next picture of it is framed. */
  let fitAfterTable = false;
  /** The step at which the colony died out, or -1 while it lives (from the arena snapshots). */
  let diedOut = -1;
  /** After the keeper puts in or moves an object: the decorations as they were, until the snapshots show whether it fitted. */
  let fitCheck: { before: readonly Decoration[]; snapshots: number } | null = null;
  /** The farm's last picture: the table's cells, for whether a nest fits where the keeper points. */
  let farm: FarmSnapshot | undefined;
  /** The brood line, from the ants snapshots, and the colony line, from the arena's. */
  let broodLine = '';
  let colonyLine = '';
  let tanks: ShelfEntry[] = [];
  /** The colonies on the running table, by place; the one shown; the places still free (DESIGN.md 3.6). */
  let colonies: { name: string; slot: number; species: number }[] = [];
  let chosenSlot = -1;
  let freeSlots: number[] = [];
  const wholeTable = new WholeTable($('whole-canvas') as HTMLCanvasElement);
  /** A new colony waiting for the keeper to choose its place on the table. */
  let newColony: { name: string; nest: NestSetup; species: number } | null = null;

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type === 'tanks') showTanks(msg.tanks);
    else if (msg.type === 'tank') enterTank(msg.name, msg.note);
    else if (msg.type === 'result') onResult(msg.command, msg.ok);
    else if (msg.type === 'exported') {
      void tankFile(msg.save).then((blob) => download(blob, `${msg.name.replace(/[\\/:*?"<>|]/g, '_')}.formicarium`));
    } else if (msg.type === 'importFailed') {
      loadNote('That file is a tank this version cannot read.');
    } else if (msg.type === 'catchUp') showCatchUp(msg.done, msg.total);
    else if (msg.type === 'away') showAway(msg.lines);
    else if (msg.type === 'ant') {
      if (msg.id === inspected) showAntCard(msg.card);
    } else if (msg.type === 'history') showHistory(msg);
    else if (msg.type === 'colonies') showColonies(msg.colonies, msg.chosen, msg.free);
    else if (msg.type === 'overview') wholeTable.set(msg.colonies, chosenSlot, freeSlots);
    else if (msg.type === 'farm') {
      const before = view.boughtNest;
      farm = msg;
      view.setSoil(msg);
      showNestControls(msg.table?.modules[0]?.material ?? null, msg.table?.modules[0]?.kind === 'tube');
      // The first picture of the tank, a tank of the other kind, or a table the keeper changed: frame it.
      if (!framed || before !== view.boughtNest || fitAfterTable) fit();
      fitAfterTable = false;
      framed = true;
      if (joinNewest) {
        joinNewest = false;
        const newest = msg.table?.modules.reduce((a, b) => (b.id > a.id ? b : a));
        if (newest) beginJoining(newest.id);
      }
      if (joining) drawMarks();
    } else if (msg.type === 'ants') {
      const now = performance.now();
      view.arena.ants.setAnts(msg, now);
      view.farmAnts.setAnts(msg, now);
      view.brood.setBrood(msg.brood, msg.prey);
      view.arena.setPieces(msg.prey);
      const n = [0, 0, 0, 0];
      for (let o = 2; o < msg.brood.length; o += BROOD_STRIDE) n[msg.brood[o]!]!++;
      $('clock').textContent = `Day ${Math.floor(msg.step / STEPS_PER_SECOND / DAY_SECONDS) + 1} · ant time ${formatAntTime(msg.step)}`;
      broodLine =
        diedOut >= 0 ? `the colony died out at ${formatAntTime(diedOut)}` : `brood ${n[BroodStage.egg]} eggs, ${n[BroodStage.larva]} larvae, ${n[BroodStage.pupa]} pupae`;
      counts.textContent = `${colonyLine} · ${broodLine}`;
    } else if (msg.type === 'heat') {
      view.setHeat(msg);
      coverLit = msg.lit ?? [];
    } else if (msg.type === 'arena') {
      // A colony with an arena of another size (Messor's is bigger): frame the tank again.
      const resized = msg.width !== view.arena.floorWidth || msg.height !== view.arena.floorHeight;
      view.arena.setArena(msg);
      if (resized && framed) fit();
      if (fitCheck && view.arena.decorations !== fitCheck.before) fitCheck = null;
      else if (fitCheck && ++fitCheck.snapshots >= 3) {
        fitCheck = null;
        hint('arena', "That doesn't fit there: things can't cover the tube's mouth, touch the glass, or stand on each other or on food.");
      }
      diedOut = msg.diedOut;
      const d = msg.deaths;
      const died = [
        [d[Cause.age], 'of age'],
        [d[Cause.hunger], 'of hunger'],
        [d[Cause.drying], 'dried out'],
        [d[Cause.heat], 'of heat'],
      ].filter(([count]) => (count as number) > 0);
      colonyLine =
        (colonies.length > 1 ? `${colonies.find((c) => c.slot === chosenSlot)?.name ?? ''}: ` : '') +
        `${msg.ants - msg.out} workers in the ${view.boughtNest ? 'nest' : 'farm'}, ${msg.out} out foraging, ` +
        `${msg.queen ? 'the queen' : 'no queen'} · ${msg.stores.toFixed(1)} µL of sugar water in their crops` +
        (died.length > 0 ? ` · dead: ${died.map(([count, what]) => `${count} ${what}`).join(', ')}` : '');
      counts.textContent = `${colonyLine} · ${broodLine}`;
    }
  };
  // The worker keeps the tank every few seconds; also when the page is hidden or closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send({ type: 'save' });
  });
  addEventListener('pagehide', () => send({ type: 'save' }));

  // ---- The start screen: the kept tanks, a new one, or one from a file (U1-U3).
  const showStart = () => {
    for (const el of [top, dock, counts, card, away, newScreen, whole]) el.hidden = true;
    newColony = null;
    inspect(-1);
    closeHistory();
    cancelModes();
    startScreen.hidden = false;
    send({ type: 'list' });
  };
  function showTanks(list: ShelfEntry[]): void {
    tanks = list;
    const box = $('tank-list');
    if (list.length === 0) {
      box.replaceChildren(text('p', 'No tanks yet. Start one with New tank.'));
      return;
    }
    box.replaceChildren(...list.map(tankRow));
  }
  /** The first of Tank 1, Tank 2… that no kept tank is called. */
  function untakenName(): string {
    let n = 1;
    while (tanks.some((t) => t.name === `Tank ${n}`)) n++;
    return `Tank ${n}`;
  }
  function tankRow(t: ShelfEntry): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tank';
    const days = Math.floor(t.step / STEPS_PER_SECOND / DAY_SECONDS) + 1;
    const many = (t.colonies ?? 1) > 1;
    const colony = many
      ? `${t.colonies} colonies, ${t.workers} workers`
      : t.workers > 0 || t.queen
        ? `${t.workers} workers${t.queen ? '' : ', no queen'}`
        : 'the colony has died out';
    const actions = document.createElement('div');
    actions.className = 'row';
    const plain = () =>
      actions.replaceChildren(
        button('Open', () => send({ type: 'open', id: t.id })),
        button('⋯', () => actions.replaceChildren(button('Rename', rename), button('Delete', remove), button('Back', plain))),
      );
    const rename = () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = t.name;
      const done = () => send({ type: 'rename', id: t.id, name: input.value.trim() || t.name });
      input.addEventListener('keydown', (e) => e.key === 'Enter' && done());
      actions.replaceChildren(input, button('Save', done));
      input.focus();
    };
    const remove = () => actions.replaceChildren(text('span', 'Delete it for good?'), button('Delete', () => send({ type: 'delete', id: t.id })), button('Keep', plain));
    plain();
    row.append(text('b', t.name), text('span', `Day ${days} · ${colony} · kept ${ago(t.savedAt)}`), actions);
    return row;
  }
  const loadNote = (s: string) => {
    const note = $('load-note');
    note.textContent = s;
    note.hidden = s === '';
  };
  $('go-load').addEventListener('click', () => {
    loadNote('');
    $('load-file').click();
  });
  $('load-file').addEventListener('change', async () => {
    const input = $('load-file') as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const save = await readTankFile(file);
    if (!save) {
      loadNote("That file isn't a saved tank. Tanks are saved with \"Save to a file\" and end in .formicarium.");
      return;
    }
    send({ type: 'import', save, name: save.name ?? file.name.replace(/\.formicarium$/, '') });
  });
  // A new tank: a name, and where the colony starts.
  let startIn: 'tube' | 'nest' = 'tube';
  let newSpecies: number = Species.lasiusNiger;
  const speciesButtons = [...newScreen.querySelectorAll<HTMLButtonElement>('button[data-species]')];
  for (const b of speciesButtons) {
    b.addEventListener('click', () => {
      newSpecies = Number(b.dataset.species);
      for (const x of speciesButtons) x.setAttribute('aria-pressed', String(x === b));
    });
  }
  const newPick: Required<Pick<NestSetup, 'size' | 'layout' | 'material'>> = { size: 'M', layout: 'classic', material: 'ytong' };
  $('go-new').addEventListener('click', () => {
    startScreen.hidden = true;
    newScreen.hidden = false;
    ($('new-name') as HTMLInputElement).value = untakenName();
  });
  $('new-back').addEventListener('click', () => {
    newScreen.hidden = true;
    startScreen.hidden = false;
  });
  const startButtons = [...newScreen.querySelectorAll<HTMLButtonElement>('button[data-start]')];
  for (const b of startButtons) {
    b.addEventListener('click', () => {
      startIn = b.dataset.start as 'tube' | 'nest';
      for (const x of startButtons) x.setAttribute('aria-pressed', String(x === b));
      $('new-nest').hidden = startIn !== 'nest';
    });
  }
  $('new-nest').replaceChildren(nestPicker(newPick));
  $('create').addEventListener('click', () => {
    const name = ($('new-name') as HTMLInputElement).value.trim() || untakenName();
    send({ type: 'create', name, nest: startIn === 'tube' ? TEST_TUBE_SETUP : { ...newPick }, species: newSpecies });
  });

  function enterTank(name: string, note?: string): void {
    startScreen.hidden = true;
    newScreen.hidden = true;
    for (const el of [top, dock, counts]) el.hidden = false;
    away.hidden = true;
    whole.hidden = true;
    newColony = null;
    chosenSlot = -1;
    $('tank-name').textContent = name;
    framed = false;
    diedOut = -1;
    lapse = undefined;
    inspect(-1);
    setTab('watch');
    placeOverlays();
    if (note) showAway([note]);
  }
  $('to-tanks').addEventListener('click', () => {
    send({ type: 'close' });
    showStart();
  });
  $('save-file').addEventListener('click', () => send({ type: 'export' }));

  /** The panel that says what happened while the tank was closed. */
  function showCatchUp(done: number, total: number): void {
    const days = (n: number) => (n / STEPS_PER_SECOND / DAY_SECONDS).toFixed(1);
    away.hidden = false;
    away.replaceChildren(
      text('h2', 'Welcome back'),
      text('p', `While the tank was closed ${colonies.length > 1 ? 'its colonies' : 'its colony'} lived on. Catching up: day ${days(done)} of ${days(total)}…`),
      button('Skip the rest', () => send({ type: 'skip' })),
    );
  }
  function showAway(lines: string[]): void {
    away.hidden = false;
    away.replaceChildren(text('h2', 'While you were away'), ...lines.map((l) => text('p', l)), button('Close', () => (away.hidden = true)));
  }

  // ---- Several colonies on one table (DESIGN.md 3.6): a chip for each, the whole table, a new colony, giving one away.
  function showColonies(list: { name: string; slot: number; species: number }[], chosen: number, free: number[]): void {
    const changed = chosen !== chosenSlot;
    colonies = list;
    chosenSlot = chosen;
    freeSlots = free;
    const box = $('colonies');
    box.replaceChildren();
    if (list.length > 1) {
      for (const c of list) {
        const b = button(c.name, () => send({ type: 'choose', slot: c.slot }));
        b.setAttribute('aria-pressed', String(c.slot === chosen));
        b.title = SPECIES_NAMES[c.species as SpeciesId] ?? '';
        box.append(b);
      }
      box.append(button('Whole table', () => openWhole(false)));
    }
    const shown = list.find((c) => c.slot === chosen);
    $('give-away').textContent = shown ? `Give ${shown.name} away` : 'Give this colony away';
    $('colony-hint').textContent = `${shown ? `${shown.name}: ${SPECIES_NAMES[shown.species as SpeciesId] ?? ''}. ` : ''}How the colony has grown since it was set up. A table holds up to four colonies, each with its own nests and arena.`;
    $('new-colony').toggleAttribute('disabled', free.length === 0);
    wholeTable.set(null, chosenSlot, freeSlots);
    if (changed) {
      // Another colony: its own nests, arena, inspector and graphs.
      framed = false;
      diedOut = -1;
      lapse = undefined;
      inspect(-1);
      cancelModes();
      closeHistory();
    }
  }
  /** Shows the whole table; `placing` while the keeper chooses where a new colony goes. */
  function openWhole(placing: boolean): void {
    whole.hidden = false;
    counts.hidden = true;
    wholeTable.placing = placing;
    $('whole-hint').textContent = placing ? 'Tap a free place for the new colony.' : 'Tap a colony to watch it and look after it.';
    placeOverlays();
    send({ type: 'overview', on: true });
  }
  function closeWhole(): void {
    whole.hidden = true;
    counts.hidden = top.hidden;
    wholeTable.placing = false;
    newColony = null;
    send({ type: 'overview', on: false });
  }
  $('whole-close').addEventListener('click', closeWhole);
  $('whole-canvas').addEventListener('click', (e) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const slot = wholeTable.slotAt(e.clientX - r.left, e.clientY - r.top);
    if (slot < 0) return;
    if (newColony) {
      if (!freeSlots.includes(slot)) return;
      send({ type: 'addColony', name: newColony.name, slot, nest: newColony.nest, species: newColony.species });
      closeWhole();
    } else if (colonies.some((c) => c.slot === slot)) {
      if (slot !== chosenSlot) send({ type: 'choose', slot });
      closeWhole();
    }
  });
  $('new-colony').addEventListener('click', () => {
    cancelModes();
    if (freeSlots.length === 0) return;
    let n = colonies.length + 1;
    while (colonies.some((c) => c.name === `Colony ${n}`)) n++;
    const name = document.createElement('input');
    name.type = 'text';
    name.value = `Colony ${n}`;
    let startIn: 'tube' | 'nest' = 'tube';
    let species: number = Species.lasiusNiger;
    const kind = choices<number>(
      [[Species.lasiusNiger, 'Lasius niger'], [Species.crematogaster, 'Crematogaster scutellaris'], [Species.messor, 'Messor barbarus'], [Species.pheidole, 'Pheidole pallidula']],
      () => species,
      (k) => (species = k),
    );
    const pick: Required<Pick<NestSetup, 'size' | 'layout' | 'material'>> = { ...newPick };
    const picker = nestPicker(pick);
    picker.hidden = true;
    const where = choices<'tube' | 'nest'>([['tube', 'In a test tube'], ['nest', 'In a bought nest']], () => startIn, (k) => {
      startIn = k;
      picker.hidden = k !== 'nest';
    });
    showCard('New colony', [
      'A colony as keepers buy one: a queen, her first workers and a little brood, with its own new arena. It never meets the other colonies.',
      name,
      kind,
      where,
      picker,
    ], [
      ['Choose its place', () => {
        newColony = { name: name.value.trim() || `Colony ${n}`, nest: startIn === 'tube' ? TEST_TUBE_SETUP : { ...pick }, species };
        closeCard();
        openWhole(true);
      }, true],
      ['Cancel', closeCard],
    ]);
  });
  $('give-away').addEventListener('click', () => {
    cancelModes();
    const shown = colonies.find((c) => c.slot === chosenSlot);
    if (!shown) return;
    if (colonies.length <= 1) {
      showCard(`Give ${shown.name} away`, ['A table keeps at least one colony. To start again, make a new tank from the list of tanks.'], [['Close', closeCard]]);
      return;
    }
    showCard(`Give ${shown.name} away?`, ['It leaves the table for good, with its nests and its arena.'], [
      ['Give it away', () => {
        send({ type: 'removeColony', slot: shown.slot });
        closeCard();
      }, true],
      ['Keep it', closeCard],
    ]);
  });

  // ---- The tabs (U4): one set of tools at a time.
  let tab: Tab = 'watch';
  const tabButtons = [...document.querySelectorAll<HTMLButtonElement>('#tabs button')];
  const panes = [...document.querySelectorAll<HTMLElement>('.pane')];
  function setTab(next: Tab): void {
    tab = next;
    cancelModes();
    for (const b of tabButtons) b.setAttribute('aria-selected', String(b.dataset.tab === next));
    for (const p of panes) p.hidden = p.dataset.pane !== next;
    placeOverlays();
  }
  for (const b of tabButtons) b.addEventListener('click', () => setTab(b.dataset.tab as Tab));
  // A turned phone or a resized window: the bars change height, and the tank is fitted to the new screen.
  let resizing = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(resizing);
    resizing = requestAnimationFrame(() => {
      placeOverlays();
      if (!top.hidden) fit();
    });
  });
  const HINTS: Record<string, string> = {};
  for (const id of ['arena-hint', 'nests-hint']) HINTS[id] = $(id).textContent ?? '';
  let hintTimer = 0;
  /** Shows a line in place of a tab's hint for a while (or until the next one); '' puts the hint back. */
  function hint(pane: 'arena' | 'nests', s: string, ms = 6000): void {
    const id = `${pane}-hint`;
    window.clearTimeout(hintTimer);
    $(id).textContent = s || HINTS[id]!;
    if (s && ms > 0) hintTimer = window.setTimeout(() => ($(id).textContent = HINTS[id]!), ms);
  }

  // ---- Cards for what the keeper taps (U5).
  function showCard(title: string, body: (HTMLElement | string)[], actions: [string, () => void, boolean?][]): void {
    card.hidden = false;
    const row = document.createElement('div');
    row.className = 'row';
    for (const [label, run, primary] of actions) {
      const b = button(label, run);
      if (primary) b.className = 'primary';
      row.append(b);
    }
    card.replaceChildren(text('h3', title), ...body.map((b) => (typeof b === 'string' ? text('p', b) : b)), row);
  }
  const closeCard = () => (card.hidden = true);
  /** Ends whatever the keeper was in the middle of: placing a nest, joining one, putting a thing in the arena. */
  function cancelModes(): void {
    tool = null;
    moving = -1;
    placing = null;
    joining = null;
    joinNewest = false;
    view.nest.setMarks(null, []);
    for (const b of putButtons) b.setAttribute('aria-pressed', 'false');
    closeCard();
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
  function showAntCard(c: AntCard): void {
    inspector.hidden = false;
    const doing = text('p', `Now: ${c.doing}.`);
    doing.className = 'doing';
    const row = document.createElement('div');
    row.append(followButton, button('Close', () => inspect(-1)));
    inspector.replaceChildren(text('h2', c.title), doing, ...c.lines.map((l) => text('p', l)), row);
  }
  /** Where the inspected ant is drawn, in the scene's mm, or null while it is out of sight (in the tube). */
  const inspectedAt = () => view.farmAntPosition(inspected) ?? view.arena.ants.positionOf(inspected);

  // The colony graphs and the timelapse (M6c), refreshed every few seconds while open.
  const historyPanel = $('history');
  const graphBox = $('graph-box');
  const lapseBox = $('lapse-box');
  const lapseCanvas = $('lapse') as HTMLCanvasElement;
  const lapsePlay = $('lapse-play');
  const lapseAt = $('lapse-at') as HTMLInputElement;
  const lapseLabel = $('lapse-label');
  let showing: 'graphs' | 'timelapse' | null = null;
  let lapse: Timelapse | undefined;
  let refresh: number | undefined;
  const openHistory = (what: 'graphs' | 'timelapse') => {
    if (what !== 'timelapse') lapse?.stop();
    showing = what;
    historyPanel.hidden = false;
    graphBox.hidden = what !== 'graphs';
    lapseBox.hidden = what !== 'timelapse';
    $('history-title').textContent = what === 'graphs' ? 'Colony graphs' : 'Timelapse of the nest';
    send({ type: 'history' });
    clearInterval(refresh);
    refresh = window.setInterval(() => send({ type: 'history' }), 3000);
  };
  function closeHistory(): void {
    showing = null;
    historyPanel.hidden = true;
    clearInterval(refresh);
    lapse?.stop();
    lapsePlay.textContent = 'Play';
  }
  $('graphs').addEventListener('click', () => openHistory('graphs'));
  $('timelapse').addEventListener('click', () => openHistory('timelapse'));
  $('to-graphs').addEventListener('click', () => openHistory('graphs'));
  $('to-lapse').addEventListener('click', () => openHistory('timelapse'));
  $('history-close').addEventListener('click', closeHistory);
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

  // ---- Feed: choose the food, then tap the arena floor or a dish.
  let food = '1';
  let cut: Cut = 'whole';
  /** The sugar chosen for drops, feeders and refills: rich sugar while an insect is chosen. */
  const sugar = () => (food === '0.1' ? 0.1 : 1);
  const sugarButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-sugar]')];
  const cutRow = $('cut-row');
  for (const b of sugarButtons) {
    b.addEventListener('click', () => {
      food = b.dataset.sugar ?? '1';
      for (const x of sugarButtons) x.setAttribute('aria-pressed', String(x === b));
      // A fruit fly is given whole; a cricket or a mealworm whole, cut in two, or in pieces (B6).
      cutRow.hidden = food !== 'cricket' && food !== 'mealworm';
    });
  }
  const cutButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-cut]')];
  for (const b of cutButtons) {
    b.addEventListener('click', () => {
      cut = (b.dataset.cut ?? 'whole') as Cut;
      for (const x of cutButtons) x.setAttribute('aria-pressed', String(x === b));
    });
  }
  $('refill').addEventListener('click', () => command({ type: 'refill', concentration: sugar() }));
  $('clear').addEventListener('click', () => command({ type: 'clearFood' }));

  // ---- Arena: choose a thing, then tap where it goes (DESIGN.md B3); tap one already there for its card.
  let tool: string | null = null;
  /** The decoration being moved, waiting for the tap that says where it goes. */
  let moving = -1;
  const putButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-put]')];
  const NAMES: Record<string, string> = {
    stone: 'stone',
    bark: 'cork bark',
    tube: 'water tube',
    dish: 'feeding dish',
    feeder: 'sugar feeder',
    autoFeeder: 'sugar dispenser',
    dispenser: 'insect dispenser',
    seedDispenser: 'seed dispenser',
    branch: 'branch',
    twig: 'twig',
    leaf: 'leaf',
    moss: 'moss',
  };
  /** What a sugar dispenser is filled with and what an insect dispenser gives, chosen on its card before placing it. */
  const dispense: { concentration: number; insect: Insect; cut: Cut; seeds: SeedMix } = { concentration: 1, insect: 'fly', cut: 'whole', seeds: 'small' };
  const startPutting = (b: HTMLButtonElement, put: string) => {
    tool = put;
    b.setAttribute('aria-pressed', 'true');
    const where = put === 'dispenser' ? ' Its insects drop just in front of it.' : put === 'seedDispenser' ? ' Its seeds drop just in front of it.' : '';
    hint('arena', `Tap where the ${NAMES[put]} should go. It can't cover the tube's mouth or stand on something else.${where}`, 0);
  };
  for (const b of putButtons) {
    b.addEventListener('click', () => {
      const put = b.dataset.put!;
      const on = tool !== put;
      cancelModes();
      if (!on) {
        hint('arena', '', 0);
        return;
      }
      if (put === 'autoFeeder') {
        showCard('Sugar dispenser', [
          'A sugar feeder with a bottle on its end that keeps it full as the ants drink.',
          choices<number>([[1, 'Rich sugar'], [0.1, 'Weak sugar']], () => dispense.concentration, (k) => (dispense.concentration = k)),
        ], [
          ['Place it', () => {
            closeCard();
            startPutting(b, put);
          }, true],
          ['Cancel', closeCard],
        ]);
      } else if (put === 'dispenser') {
        const cutRow = choices<Cut>([['whole', 'whole'], ['halved', 'cut in two'], ['pieces', 'in pieces']], () => dispense.cut, (k) => (dispense.cut = k));
        cutRow.hidden = dispense.insect === 'fly';
        showCard('Insect dispenser', [
          'It drops an insect in front of it, and the next one once the last is gone: carried into the nest or cleaned away. Ants take insects only while they have larvae to feed.',
          choices<Insect>([['fly', 'Fruit fly'], ['cricket', 'Cricket'], ['mealworm', 'Mealworm']], () => dispense.insect, (k) => {
            dispense.insect = k;
            cutRow.hidden = k === 'fly';
          }),
          cutRow,
        ], [
          ['Place it', () => {
            closeCard();
            startPutting(b, put);
          }, true],
          ['Cancel', closeCard],
        ]);
      } else if (put === 'seedDispenser') {
        showCard('Seed dispenser', [
          'It drops a scoop of about 20 seeds in front of it, and the next scoop once every seed of the last has been carried off. Harvester ants (Messor barbarus) take seeds and store them; Pheidole pallidula takes small ones when its larvae want food. Young colonies do best on small seeds.',
          choices<SeedMix>([['small', 'Small (chia, poppy, millet)'], ['mixed', 'Mixed bird seed'], ['big', 'Big (canary, wheat, sunflower)']], () => dispense.seeds, (k) => (dispense.seeds = k)),
        ], [
          ['Place it', () => {
            closeCard();
            startPutting(b, put);
          }, true],
          ['Cancel', closeCard],
        ]);
      } else startPutting(b, put);
    });
  }
  $('clean').addEventListener('click', () => command({ type: 'clean' }));
  /** True when a tap lands on the arena's floor. */
  const onArena = (p: { x: number; y: number }) => {
    const { u, v } = view.arena.toFloor(p.x, p.y);
    return u >= 0 && v >= 0 && u <= view.arena.floorWidth && v <= view.arena.floorHeight;
  };
  /** The decoration seen under a tap, or -1. */
  const picked = (p: { x: number; y: number }) => {
    const { u, v } = view.arena.surfaceAt(p.x, p.y);
    return decorationAt([...view.arena.decorations], u, v);
  };
  function decorationCard(k: number): void {
    const d = view.arena.decorations[k]!;
    const name = d.kind === 'feeder' && d.auto !== undefined ? NAMES.autoFeeder! : d.kind === 'dispenser' && d.seeds ? NAMES.seedDispenser! : (NAMES[d.kind] ?? d.kind);
    const about: string[] = [];
    if (d.kind === 'feeder' && d.auto !== undefined) about.push(`Kept full of ${d.auto >= 0.5 ? 'rich' : 'weak'} sugar water as the ants drink.`);
    if (d.kind === 'dispenser' && d.seeds) {
      about.push(`Drops a scoop of ${{ small: 'small seeds', mixed: 'mixed bird seed', big: 'big seeds' }[d.seeds]} each time the last scoop has been carried off.`);
    } else if (d.kind === 'dispenser') {
      const given = d.insect === 'fly' ? 'a fruit fly' : `a ${d.insect}${{ whole: ', whole', halved: ', cut in two', pieces: ', in pieces' }[d.cut]}`;
      about.push(`Drops ${given} each time the last one is gone.`);
    }
    showCard(name[0]!.toUpperCase() + name.slice(1), about, [
      ['Move', () => {
        closeCard();
        moving = k;
        hint('arena', `Tap where the ${name} should go.`, 0);
      }],
      ['Take out', () => {
        command({ type: 'remove', index: k });
        closeCard();
      }],
      ['Close', closeCard],
    ]);
  }

  // ---- Nests: tap a nest or a tube for its card; add a nest by placing it and choosing what it joins (U5).
  /** Where each module's cover is lifted, as the worker last said. */
  let coverLit: { module: number; from: number; to: number }[] = [];
  /** A nest the keeper is placing on the table (a new one, or one being moved), and the outline that follows the pointer. */
  let placing: { setup: NestSetup | null; module: number | null; width: number; height: number } | null = null;
  let ghost: { x: number; y: number; width: number; height: number; ok: boolean } | null = null;
  /** The nest being joined to others, and the arena and nests chosen for it. */
  let joining: { module: number; chosen: (number | 'arena')[] } | null = null;
  /** After a new nest is laid down: join it once the table's next picture shows it. */
  let joinNewest = false;
  /** The joins sent and not yet answered, and those refused. */
  let joinsOwed = 0;
  let joinsRefused = 0;
  const shape = () => view.nest.shape;
  const moduleById = (id: number) => shape()?.modules.find((m) => m.id === id);
  const nestName = (m: NestShape) =>
    m.kind === 'tube' ? 'Test tube' : `${capital(m.material)} nest, ${{ S: 'small', M: 'medium', L: 'large' }[m.size]}, ${LAYOUT_NAMES[m.layout].toLowerCase()}`;
  /** The ports of module `id` with nothing plugged in. */
  const freePorts = (id: number) => {
    const t = shape();
    const m = moduleById(id);
    if (!t || !m) return [];
    const used = (k: number) =>
      (t.arena.module === id && t.arena.port === k) || t.tubes.some((tb) => (tb.a.module === id && tb.a.port === k) || (tb.b.module === id && tb.b.port === k));
    return m.ports.map((_, k) => k).filter((k) => !used(k));
  };
  /** A nest can be joined when it has a free port, or the arena's tube in a port (which the arena can give up). */
  const joinable = (id: number) => freePorts(id).length > 0 || shape()?.arena.module === id;

  $('add-nest').addEventListener('click', () => {
    cancelModes();
    const pick: Required<Pick<NestSetup, 'size' | 'layout' | 'material'>> = { ...newPick };
    showCard('Add a nest', [nestPicker(pick)], [
      ['Place it on the table', () => {
        closeCard();
        const { width, height } = NEST_SIZES[pick.size];
        startPlacing({ setup: { ...pick }, module: null, width, height });
        hint('nests', 'Move over the table: the outline is green where the nest fits. Tap to put it down.', 0);
      }, true],
      ['Cancel', closeCard],
    ]);
  });
  function nestCard(m: NestShape): void {
    const lit = coverLit.find((c) => c.module === m.id);
    const at = !lit || lit.to <= lit.from ? 'on' : lit.from <= 0 && lit.to >= m.width ? 'off' : lit.from <= 0 ? 'left' : 'right';
    const covers = document.createElement('div');
    covers.className = 'row';
    covers.append(text('span', 'Cover:'));
    for (const [k, label, from, to] of [['on', 'On', 0, 0], ['left', 'Left half off', 0, m.width / 2], ['right', 'Right half off', m.width / 2, m.width], ['off', 'Off', 0, m.width]] as const) {
      const b = button(label, () => {
        command({ type: 'cover', from, to, module: m.id });
        coverLit = [...coverLit.filter((c) => c.module !== m.id), { module: m.id, from, to }];
        nestCard(m);
      });
      b.setAttribute('aria-pressed', String(k === at));
      covers.append(b);
    }
    const about =
      m.kind === 'tube'
        ? 'Uncovered, the colony moves out into a dark nest joined to it, if there is one.'
        : 'The ants keep their brood where it is dark and damp.';
    showCard(nestName(m), [covers, about], [
      ['Join', () => beginJoining(m.id)],
      ['Move', () => {
        closeCard();
        startPlacing({ setup: null, module: m.id, width: m.width, height: m.height });
        hint('nests', 'Tap where the nest should go. Only an empty nest with no tube in it can be moved.', 0);
      }],
      ['Take away', () => {
        command({ type: 'removeNest', module: m.id });
        closeCard();
      }],
      ['Close', closeCard],
    ]);
  }
  function tubeCard(id: number): void {
    const t = shape()?.tubes.find((x) => x.id === id);
    if (!t) return;
    showCard('Tube', [t.plugged ? 'Its cotton plug is in: the ants cannot pass.' : 'Open: the ants walk through it.'], [
      [t.plugged ? 'Pull the plug out' : 'Push a plug in', () => {
        command({ type: 'plug', tube: id, plugged: !t.plugged });
        closeCard();
      }, true],
      ['Take away', () => {
        command({ type: 'removeTube', tube: id });
        closeCard();
      }],
      ['Close', closeCard],
    ]);
  }
  function beginJoining(id: number): void {
    const m = moduleById(id);
    if (!m) return;
    placing = null;
    ghost = null;
    joining = { module: id, chosen: [] };
    joinCard();
    drawMarks();
  }
  function joinCard(): void {
    if (!joining) return;
    const j = joining;
    const m = moduleById(j.module)!;
    const others = (shape()?.modules ?? []).filter((n) => n.id !== m.id && joinable(n.id));
    const free = freePorts(m.id).length + (shape()?.arena.module === m.id ? 1 : 0);
    const chips = document.createElement('div');
    chips.className = 'row';
    const toggle = (t: number | 'arena') => {
      j.chosen = j.chosen.includes(t) ? j.chosen.filter((x) => x !== t) : [...j.chosen, t];
      joinCard();
      drawMarks();
    };
    if (shape()?.arena.module !== m.id) {
      const b = button('The arena', () => toggle('arena'));
      b.setAttribute('aria-pressed', String(j.chosen.includes('arena')));
      chips.append(b);
    }
    for (const n of others) {
      const b = button(nestName(n), () => toggle(n.id));
      b.setAttribute('aria-pressed', String(j.chosen.includes(n.id)));
      chips.append(b);
    }
    const body: (HTMLElement | string)[] = [`Tap the arena or the nests to join ${m.kind === 'tube' ? 'the test tube' : 'this nest'} to, here or on the table.`, chips];
    if (j.chosen.includes('arena')) body.push("The arena has one entrance, so its tube moves here from where it is now.");
    if (j.chosen.length > free) body.push(`It has ${free === 1 ? 'one free port' : `${free} free ports`}, so it can be joined to ${free === 1 ? 'one' : free} of them.`);
    body.push('Each new tube has its cotton plug in; tap the tube to pull it out when you are ready.');
    showCard(`Join ${m.kind === 'tube' ? 'the test tube' : 'it'} to…`, body, [
      ['Done', finishJoining, true],
      ['Not now', () => {
        joining = null;
        drawMarks();
        closeCard();
      }],
    ]);
  }
  function drawMarks(): void {
    const j = joining;
    const targets = j ? (shape()?.modules ?? []).filter((n) => n.id !== j.module && joinable(n.id)).map((n) => ({ id: n.id, chosen: j.chosen.includes(n.id) })) : [];
    view.nest.setMarks(ghost, targets, placing && farm ? placeRoom(placing) : null);
  }
  /** Lays the tubes the keeper chose: the arena's first, since moving it can free the port another tube needs. */
  function finishJoining(): void {
    const j = joining;
    const t = shape();
    joining = null;
    closeCard();
    drawMarks();
    if (!j || !t) return;
    const ports = freePorts(j.module);
    /** Ports freed or taken by the commands sent so far, by module. */
    const taken = new Set<string>();
    const freed: { module: number; port: number }[] = [];
    const nextPort = (id: number) => {
      const extra = freed.filter((f) => f.module === id).map((f) => f.port);
      return [...(id === j.module ? ports : freePorts(id)), ...extra].find((k) => !taken.has(`${id}:${k}`));
    };
    const order = [...j.chosen].sort((a, b) => Number(b === 'arena') - Number(a === 'arena'));
    joinsOwed = 0;
    joinsRefused = 0;
    /** Tubes left out because a nest had no free opening for them. */
    let full = 0;
    for (const target of order) {
      if (target === 'arena') {
        const p = nextPort(j.module);
        if (p === undefined) break;
        taken.add(`${j.module}:${p}`);
        freed.push({ ...t.arena });
        command({ type: 'arenaTube', to: { module: j.module, port: p } });
      } else {
        const p = nextPort(j.module);
        const q = nextPort(target);
        if (p === undefined || q === undefined) {
          full++;
          continue;
        }
        taken.add(`${j.module}:${p}`);
        taken.add(`${target}:${q}`);
        command({ type: 'connect', a: { module: j.module, port: p }, b: { module: target, port: q }, plugged: true });
      }
      joinsOwed++;
    }
    if (full > 0) hint('nests', 'A nest had no free opening for every tube. The arena tube holds one: join the new nest to the arena to free it.');
    fitAfterTable = true;
  }
  /** The worker's answer to a change to the table. */
  function onResult(what: KeeperCommand['type'], ok: boolean): void {
    if (what === 'addNest') {
      if (ok) {
        joinNewest = true;
        fitAfterTable = true;
        hint('nests', '');
      } else hint('nests', "The nest doesn't fit there. Try a spot with bare table all round it.");
    } else if (what === 'moveNest') {
      fitAfterTable = ok;
      hint('nests', ok ? '' : 'Only an empty nest with no tube in it can be moved, onto bare table.');
    } else if (what === 'removeNest' && !ok) hint('nests', 'Only an empty nest with no tube in it can be taken away.');
    else if (what === 'removeTube' && !ok) hint('nests', 'A tube can be taken away only when no ant is in it.');
    else if (what === 'plug' && !ok) hint('nests', 'The plug cannot go in while ants are where it goes.');
    else if (what === 'connect' || what === 'arenaTube') {
      joinsOwed--;
      if (!ok) joinsRefused++;
      if (joinsOwed === 0 && joinsRefused > 0) {
        hint('nests', joinsRefused === 1 ? 'One tube could not be laid: there is no clear way for it. Try moving the nests apart.' : 'Some tubes could not be laid: there is no clear way for them. Try moving the nests apart.');
      }
    }
  }
  /** Whether a nest of `width` × `height` mm fits with its corner at (x, y): bare table all round (or the nest's own place, when moving it). */
  function fits(x: number, y: number, width: number, height: number, own: NestShape | undefined): boolean {
    const t = shape();
    if (!farm || !t || x < 0 || y < 0) return false;
    if (x + width > tableRight(width)) return false;
    for (let cy = y - NEST_CLEAR; cy < y + height + NEST_CLEAR; cy++) {
      for (let cx = x - NEST_CLEAR; cx < x + width + NEST_CLEAR; cx++) {
        if (cx < 0 || cy < 0 || cx >= farm.width || cy >= farm.height) continue;
        if (own && cx >= own.x && cx < own.x + own.width && cy >= own.y && cy < own.y + own.height) continue;
        if (farm.material[cy * farm.width + cx] !== Material.table) return false;
      }
    }
    return true;
  }
  /** The outline of the nest being placed, under the scene point p. */
  const ghostAt = (p: { x: number; y: number }) => {
    const pl = placing!;
    const { u, v } = view.nest.toFloor(p.x, p.y);
    const x = Math.round(u - pl.width / 2);
    const y = Math.round(v - pl.height / 2);
    const own = pl.module === null ? undefined : moduleById(pl.module);
    // Just short of a free spot, the outline slips into it, so the keeper need not aim to the millimetre.
    for (let r = 0; r <= SNAP; r += 2) {
      for (const [dx, dy] of r === 0 ? [[0, 0]] : [[0, r], [0, -r], [r, 0], [-r, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
        if (fits(x + dx!, y + dy!, pl.width, pl.height, own)) return { x: x + dx!, y: y + dy!, width: pl.width, height: pl.height, ok: true };
      }
    }
    return { x, y, width: pl.width, height: pl.height, ok: false };
  };
  /** The stretch of table, from its back left corner, where a nest being placed can go: as wide as the table may grow, and deep enough for one more row of nests. */
  function placeRoom(pl: NonNullable<typeof placing>): { width: number; height: number } {
    return { width: tableRight(pl.width), height: (farm?.height ?? 0) + pl.height + 2 * NEST_CLEAR };
  }
  /**
   * How far right a nest `width` mm wide may reach: the right edge of the
   * nests already on the table, or just room for it when they are narrower
   * (the table grows towards the arena only that far).
   */
  function tableRight(width: number): number {
    return Math.max(width + 2 * NEST_CLEAR, ...(shape()?.modules ?? []).map((m) => m.x + m.width));
  }
  /**
   * Starts placing a nest: the view widens to show the bare table round the
   * nests and room in front of them (drawn faintly), and the outline starts at the first free
   * spot in front, so the keeper sees at once what is being placed.
   */
  function startPlacing(pl: NonNullable<typeof placing>): void {
    placing = pl;
    const t = shape();
    if (!farm || !t) return;
    const room = placeRoom(pl);
    const right = room.width;
    const a = view.nest.floorToScene(0, -10);
    const b = view.nest.floorToScene(room.width, room.height);
    const v = view.bounds;
    const x0 = Math.min(v.x, a.x);
    const y0 = Math.min(v.y, a.y);
    camera.fit({ x: x0, y: y0, width: Math.max(v.x + v.width, b.x) - x0, height: Math.max(v.y + v.height, b.y + 10) - y0 }, barTop() + 28, barBottom());
    const own = pl.module === null ? undefined : moduleById(pl.module);
    const y = farm.height + NEST_CLEAR + 6;
    const x = [0, 40, 80, 120, 160, 200].find((k) => k + pl.width <= right && fits(k, y, pl.width, pl.height, own)) ?? 0;
    ghost = { x, y, width: pl.width, height: pl.height, ok: fits(x, y, pl.width, pl.height, own) };
    drawMarks();
  }
  stage.addEventListener('pointermove', (e) => {
    if (!placing) return;
    const r = stage.getBoundingClientRect();
    ghost = ghostAt(view.root.toLocal({ x: e.clientX - r.left, y: e.clientY - r.top }));
    drawMarks();
  });
  function putDown(p: { x: number; y: number }): void {
    const pl = placing!;
    ghost = ghostAt(p);
    if (!ghost.ok) {
      drawMarks();
      hint('nests', "It doesn't fit there: a nest needs bare table all round it.", 0);
      return;
    }
    if (pl.module === null) command({ type: 'addNest', nest: pl.setup!, x: ghost.x, y: ghost.y });
    else command({ type: 'moveNest', module: pl.module, x: ghost.x, y: ghost.y });
    placing = null;
    ghost = null;
    drawMarks();
  }
  /** The tube or nest of the table under a tap (within a finger's width), if any. */
  const onTable = (p: { x: number; y: number }) => {
    const t = shape();
    if (!t || !view.boughtNest) return {};
    const { u, v } = view.nest.toFloor(p.x, p.y);
    const reach = Math.max(6, 14 / camera.scale);
    let tube: number | undefined;
    let best = reach;
    for (const tb of t.tubes) {
      for (let k = 2; k < tb.path.length; k += 2) {
        const d = segmentDistance(u, v, tb.path[k - 2]!, tb.path[k - 1]!, tb.path[k]!, tb.path[k + 1]!);
        if (d < best) [best, tube] = [d, tb.id];
      }
    }
    const module = view.nest.moduleAt(p.x, p.y);
    return { tube, module };
  };

  // ---- Taps on the tank: what they do depends on the tab and on what the keeper is in the middle of.
  camera.onTap = (px, py) => {
    const p = view.root.toLocal({ x: px, y: py });
    if (placing) {
      putDown(p);
      return;
    }
    if (joining) {
      const m = onTable(p).module;
      if (m && m.id !== joining.module && joinable(m.id)) {
        joining.chosen = joining.chosen.includes(m.id) ? joining.chosen.filter((x) => x !== m.id) : [...joining.chosen, m.id];
        joinCard();
        drawMarks();
      } else if (!m && onArena(p) && shape()?.arena.module !== joining.module) {
        joining.chosen = joining.chosen.includes('arena') ? joining.chosen.filter((x) => x !== 'arena') : [...joining.chosen, 'arena'];
        joinCard();
      }
      return;
    }
    if (tool || moving >= 0) {
      const { u: x, v: y } = view.arena.toFloor(p.x, p.y);
      fitCheck = { before: view.arena.decorations, snapshots: 0 };
      if (moving >= 0) command({ type: 'move', index: moving, x, y });
      else if (tool === 'dispenser') command({ type: 'put', item: 'dispenser', x, y, concentration: 1, insect: dispense.insect, cut: dispense.cut });
      else if (tool === 'seedDispenser') command({ type: 'put', item: 'seedDispenser', x, y, concentration: 1, seeds: dispense.seeds });
      else command({ type: 'put', item: tool as Item, x, y, concentration: tool === 'autoFeeder' ? dispense.concentration : sugar() });
      cancelModes();
      hint('arena', '');
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
    if (tab === 'nests') {
      const { tube, module } = onTable(p);
      if (module) nestCard(module);
      else if (tube !== undefined) tubeCard(tube);
      return;
    }
    if (tab === 'arena') {
      const k = picked(p);
      if (k >= 0) decorationCard(k);
      return;
    }
    if (tab === 'feed') {
      // The point of the arena under the tap: on the floor, or in a dish (the worker refuses food put on a stone).
      const { u: x, v: y } = view.arena.surfaceAt(p.x, p.y);
      if (x > 2 && y > 2 && x < view.arena.floorWidth - 2 && y < view.arena.floorHeight - 2) {
        if (food === 'fly' || food === 'cricket' || food === 'mealworm') command({ type: 'insect', insect: food, cut, x, y });
        else command({ type: 'sugar', x, y, volume: DROP_VOLUME, concentration: Number(food) });
      }
    }
  };

  // ---- Watch: trails, warmth or damp, and the view from above.
  const trailsButton = $('trails');
  trailsButton.addEventListener('click', () => {
    const on = trailsButton.getAttribute('aria-pressed') !== 'true';
    trailsButton.setAttribute('aria-pressed', String(on));
    view.arena.showTrails = on;
  });
  // The nest and the arena at an angle (DESIGN.md A3, N3), or straight from above, which shows trails best.
  const aboveButton = $('from-above');
  aboveButton.addEventListener('click', () => {
    view.angled = !view.angled;
    aboveButton.setAttribute('aria-pressed', String(!view.angled));
    fit();
  });
  const overlayButtons = [$('warmth'), $('damp')];
  for (const b of overlayButtons) {
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      for (const x of overlayButtons) x.setAttribute('aria-pressed', String(on && x === b));
      view.heat.show = on ? (b.id === 'warmth' ? 'warmth' : 'damp') : null;
      $('damp-note').hidden = !(on && b.id === 'damp');
    });
  }
  /** Says how the nest's water works; a sand farm has no nests to add and no table. */
  function showNestControls(material: NestMaterial | null, testTube = false): void {
    $('damp-note').textContent = testTube
      ? "The test tube's wet cotton keeps its air damp nearly to the mouth; nests added to the table have their own water."
      : material
        ? DAMP_NOTES[material]
        : 'Soil darkens when damp; the farm waters itself and never dries.';
    const nestsTab = tabButtons.find((b) => b.dataset.tab === 'nests')!;
    nestsTab.disabled = material === null;
    nestsTab.title = material === null ? 'This tank has a sand farm: its colony digs its own nest.' : '';
    if (material === null && tab === 'nests') setTab('watch');
    $('timelapse').hidden = material !== null;
  }

  // ---- Climate: the heat mat under the left end, the middle or the right end of the nests.
  const matButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-mat]')];
  for (const b of matButtons) {
    b.addEventListener('click', () => {
      const at = b.dataset.mat;
      const room = view.nestWidth - MAT_WIDTH;
      const x = view.boughtNest ? { left: 0, middle: room / 2, right: room }[at as 'left'] : { left: 10, middle: 110, right: 210 }[at as 'left'];
      command({ type: 'heatMat', x: at === 'off' ? null : x });
      for (const m of matButtons) m.setAttribute('aria-pressed', String(m === b));
    });
  }

  const speedButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-speed]')];
  for (const b of speedButtons) {
    b.addEventListener('click', () => {
      send({ type: 'speed', value: Number(b.dataset.speed) });
      for (const x of speedButtons) x.setAttribute('aria-pressed', String(x === b));
    });
  }

  showStart();
}

const LAYOUT_NAMES: Record<NestLayout, string> = { classic: 'Rooms', organic: 'Organic', honeycomb: 'Honeycomb' };
const SIZE_NAMES: Record<NestSize, string> = { S: 'Small, 10 × 10 cm', M: 'Medium, 20 × 15 cm', L: 'Large, 30 × 20 cm' };
const MATERIAL_COLOURS: Record<NestMaterial, string> = { ytong: '#e9e4da', plaster: '#f4f1ea', acrylic: '#b9d8e3', wood: '#b98a55' };

/** The choice of a bought nest: material, size and layout, written into `pick` as the keeper chooses. */
function nestPicker(pick: Required<Pick<NestSetup, 'size' | 'layout' | 'material'>>): HTMLElement {
  const box = document.createElement('div');
  box.style.display = 'grid';
  box.style.gap = '8px';
  const group = <K extends string>(label: string, options: [K, string][], get: () => K, set: (k: K) => void, swatch?: (k: K) => string) => {
    const row = document.createElement('div');
    row.className = 'row';
    const name = text('span', '');
    name.className = 'note';
    const buttons = options.map(([k, n]) => {
      const b = button(swatch ? '' : n, () => {
        set(k);
        sync();
      });
      if (swatch) {
        b.className = 'swatch';
        b.style.background = swatch(k);
        b.title = n;
        b.setAttribute('aria-label', n);
      }
      return b;
    });
    const sync = () => {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i]![0] === get())));
      name.textContent = swatch ? options.find(([k]) => k === get())![1] : '';
    };
    row.append(...buttons);
    if (swatch) row.append(name);
    sync();
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gap = '4px';
    const l = text('span', label);
    l.className = 'label';
    wrap.append(l, row);
    return wrap;
  };
  box.append(
    group<NestMaterial>('Material', [['ytong', 'Ytong'], ['plaster', 'Plaster'], ['acrylic', 'Acrylic'], ['wood', 'Wood']], () => pick.material, (k) => (pick.material = k), (k) => MATERIAL_COLOURS[k]),
    group<NestSize>('Size', (['S', 'M', 'L'] as NestSize[]).map((k) => [k, SIZE_NAMES[k]]), () => pick.size, (k) => (pick.size = k)),
    group<NestLayout>('Layout', (['classic', 'organic', 'honeycomb'] as NestLayout[]).map((k) => [k, LAYOUT_NAMES[k]]), () => pick.layout, (k) => (pick.layout = k)),
  );
  return box;
}

/** A row of buttons for one choice, the chosen one pressed. */
function choices<K>(options: [K, string][], get: () => K, set: (k: K) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  const buttons = options.map(([k, label]) =>
    button(label, () => {
      set(k);
      sync();
    }),
  );
  const sync = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i]![0] === get())));
  sync();
  row.append(...buttons);
  return row;
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

const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** How long ago `ms` was, in words. */
function ago(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Distance from (x, y) to the segment from (ax, ay) to (bx, by). */
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

/** How each material holds water, for the note by "Show damp" (DESIGN.md 3.5). */
const DAMP_NOTES: Record<NestMaterial, string> = {
  ytong: 'The ytong is wet near its water hole and drier far from it; the hole refills itself.',
  plaster: 'The plaster soaks water up from its hole a little farther than ytong; the hole refills itself.',
  acrylic: 'Acrylic holds no water: only the air near the wet sponge is humid. The sponge stays wet.',
  wood: 'The wood holds a little water near its hole, unevenly along the grain; the hole refills itself.',
};

void start();
