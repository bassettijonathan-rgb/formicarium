/**
 * Runs the simulation off the page's thread and sends snapshots to the renderer.
 * The simulation itself never sees real time; this loop decides how many
 * steps to run per real interval.
 */
import { AntState, Caste, Place } from '../sim/ants';
import { BroodStage } from '../sim/brood';
import { STEPS_PER_SECOND } from '../sim/time';
import { FIELD_CELL, createFarm } from '../sim/farm';
import { colonyCrop, deathsBy, type World } from '../sim/world';
import { type KeeperCommand, applyCommand, createTank } from '../sim/keeper';
import { Species } from '../sim/species';
import { catchUpSteps, census } from '../sim/save';
import { type Colony, MAX_COLONIES, type TableSave, asTable, freeSlots, loadTable, nextSeed, stepColonies, tableReport, tableSave } from '../sim/colonies';
import { ANT_STRIDE, type ColonyView, type FromWorker, Look, type PieceView, type TableShape, type ToWorker } from './protocol';
import { edible } from '../sim/prey';
import { type Kept, type ShelfEntry, deleteTank, freeName, newId, readShelf, readTank, renameTank, setAside, writeTank } from './store';
import { inspectAnt } from '../sim/inspect';
import { type NestSetup, nestMaterialName } from '../sim/nest';
import { Purpose, Rng } from '../sim/rng';

const INTERVAL_MS = 50;
/** The arena (trail, food, counts) and changed soil are sent every this many intervals. */
const ARENA_EVERY = 4;
/** Most steps run in one interval; beyond this the simulation runs slower than asked rather than freezing the page. */
const MAX_STEPS_PER_INTERVAL = 2000;
/** The tank is kept this often while it runs, ms of real time. */
const SAVE_EVERY_MS = 15_000;
/** Catching up runs in slices of this many steps, so the page sees progress and can say skip. */
const CATCH_UP_SLICE = 2000;

/** The colonies on the running table (DESIGN.md 3.6), in the order of their places. */
let colonies: Colony[] = [];
/** The colony the page shows and the keeper's tools act on. */
let chosen: Colony | undefined;
/** The world of the chosen colony. */
let world: World | undefined;
/** The running table's place on the shelf: its id and name. */
let current: { id: string; name: string } | undefined;
/** True while the page shows the whole table, which then hears where every colony's ants are. */
let overview = false;
let speed = 1;
let owed = 0;
let intervals = 0;
let farmVersion = -1;
const pending: KeeperCommand[] = [];
/** While the tank catches up on the time it was closed. */
/** The ant in the inspector, or -1. */
let inspected = -1;
let catching: { done: number; total: number; before: ReturnType<typeof census>[]; skip: boolean } | undefined;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  postMessage(msg, transfer);
}

function sendFarm(w: World): void {
  farmVersion = w.farm.version;
  const material = w.farm.material.slice();
  const moisture = w.farm.moisture.slice();
  const loose = w.farm.loose.slice();
  const table = tableShape(w);
  post({ type: 'farm', width: w.farm.width, height: w.farm.height, material, moisture, loose, table }, [
    material.buffer,
    moisture.buffer,
    loose.buffer,
  ]);
}

/** What the page needs to draw a colony's table of nests besides its cells, or null for a sand farm. */
function tableShape(w: World): TableShape | null {
  const t = w.farm.table;
  return t
    ? {
        modules: t.modules.map((n) => ({
          id: n.id,
          kind: n.kind,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          ports: n.ports.map((p) => ({ ...p })),
          size: n.size,
          layout: n.layout,
          material: nestMaterialName(n.material),
          depth: n.depth,
          thickness: n.thickness,
          waterX: n.waterX,
          waterY: n.waterY,
          waterRadius: n.waterRadius,
        })),
        tubes: t.tubes.map((tube) => ({ id: tube.id, a: { ...tube.a }, b: { ...tube.b }, path: [...tube.path], plugged: tube.plugged })),
        arena: { ...t.arena },
      }
    : null;
}

function sendAnts(w: World): void {
  const { ants } = w;
  const data = new Float32Array(ants.count * ANT_STRIDE);
  const full = new Uint8Array(ants.count);
  const callow = new Uint8Array(ants.count);
  const alarmed = new Uint8Array(ants.count);
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
    alarmed[i] = ants.alarm[i]! > w.params.alarmShow ? 1 : 0;
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
  const prey: PieceView[] = [];
  const carried: { ant: number; piece: PieceView }[] = [];
  for (const p of w.prey) {
    const view: PieceView = {
      x: p.x,
      y: p.y,
      angle: p.angle,
      place: p.place,
      insect: p.insect,
      part: p.part,
      length: p.length,
      width: p.width,
      look: p.mouldy ? Look.mouldy : !edible(p) ? Look.husk : p.cuts > 0 ? Look.open : Look.closed,
    };
    if (p.carriedBy >= 0) carried.push({ ant: p.carriedBy, piece: view });
    else prey.push(view);
  }
  post({ type: 'ants', step: w.step, ants: data, full, caste, callow, alarmed, species: w.species, brood: broodData, prey, carried }, [
    data.buffer,
    full.buffer,
    caste.buffer,
    callow.buffer,
    alarmed.buffer,
    broodData.buffer,
  ]);
}

function sendArena(w: World): void {
  const trail = Float32Array.from(w.arena.trail);
  let out = 0;
  let alive = 0;
  let queen = false;
  for (let i = 0; i < w.ants.count; i++) {
    if (w.ants.place[i] === Place.gone || w.ants.state[i] === AntState.dead) continue;
    if (w.ants.caste[i] === Caste.queen) {
      queen = true;
      continue;
    }
    alive++;
    if (w.ants.place[i] === Place.arena || w.ants.place[i] === Place.tube) out++;
  }
  post(
    {
      type: 'arena',
      width: w.arena.width,
      height: w.arena.height,
      trail,
      decor: w.decor,
      food: w.food.map((d) => ({ ...d })),
      ants: alive,
      out,
      stores: w.nestMode === 'farm' ? colonyCrop(w) : w.nest.stores,
      queen,
      deaths: deathsBy(w),
      diedOut: w.diedOut,
    },
    [trail.buffer],
  );
}

function sendHeat(w: World): void {
  const temperature = Float32Array.from(w.farm.temperature);
  const mould = w.farm.mouldy > 0 ? Float32Array.from(w.farm.mould) : null;
  const humidity = Float32Array.from(w.farm.humidity);
  post(
    {
      type: 'heat',
      width: w.farm.fieldWidth,
      height: w.farm.fieldHeight,
      cell: FIELD_CELL,
      temperature,
      mat: w.heatMat ? { ...w.heatMat } : null,
      lit: w.farm.table ? w.farm.table.modules.map((n) => ({ module: n.id, from: n.litFrom, to: n.litTo })) : null,
      room: w.params.roomTemperature,
      mould,
      humidity,
    },
    mould ? [temperature.buffer, humidity.buffer, mould.buffer] : [temperature.buffer, humidity.buffer],
  );
}

/** Keeper actions are applied to the chosen colony between steps, in the order they arrived, and logged with it. */
function applyPending(c: Colony): boolean {
  const w = c.world;
  const any = pending.length > 0;
  for (const command of pending.splice(0)) {
    const ok = applyCommand(w, command);
    c.log.push({ step: w.step, command });
    if (TABLE_COMMANDS.has(command.type)) post({ type: 'result', command: command.type, ok });
  }
  return any;
}

/** The keeper's changes to the table, which can be refused; the page hears whether each was done. */
const TABLE_COMMANDS: ReadonlySet<KeeperCommand['type']> = new Set(['addNest', 'removeNest', 'moveNest', 'connect', 'plug', 'removeTube', 'arenaTube']);

function sendInspected(w: World): void {
  if (inspected >= 0 && inspected < w.ants.count) post({ type: 'ant', id: inspected, card: inspectAnt(w, inspected) });
}

/** The soil of the running tank as it was set up, for the timelapse. */
let soilAtStart: { seed: number; material: Uint8Array } | undefined;

function sendHistory(w: World): void {
  // (A bought nest keeps its shape: its cells now are as it was set up.)
  if (soilAtStart?.seed !== w.seed || w.farm.table) {
    soilAtStart = { seed: w.seed, material: w.farm.table ? w.farm.material.slice() : createFarm(new Rng(w.seed, Purpose.soil)).material };
  }
  const h = w.history;
  post({
    type: 'history',
    censuses: h.censuses,
    frames: h.frames,
    frameSteps: h.frameSteps,
    width: w.farm.width,
    height: w.farm.height,
    soil: soilAtStart.material,
    daySeconds: w.params.daySeconds,
    cropLoad: w.params.cropLoad,
    bought: w.farm.table !== null,
  });
}

function sendAll(w: World): void {
  sendFarm(w);
  sendAnts(w);
  sendArena(w);
  sendHeat(w);
  sendInspected(w);
}

function save(): Promise<void> {
  if (colonies.length === 0 || !current || catching) return Promise.resolve();
  const kept = tableSave(current.name, Date.now(), colonies);
  return writeTank(kept, entryFor(kept, current.id)).catch(() => undefined); // storage full or blocked: the tank runs on unkept
}

/** The shelf's line for a kept table. */
function entryFor(kept: TableSave, id: string): ShelfEntry {
  return { id, name: kept.name, savedAt: kept.savedAt, ...summary(kept) };
}

/** What the tank list shows of a kept table: its age, and its workers and queens all together. */
function summary(kept: Kept): Omit<ShelfEntry, 'id' | 'name' | 'savedAt'> {
  const table = asTable(kept);
  let workers = 0;
  let queen = false;
  for (const c of table.colonies) {
    const n = census(c.world);
    workers += n.workers;
    queen ||= n.queen;
  }
  return {
    seed: Math.max(...table.colonies.map((c) => c.seed)),
    step: Math.max(...table.colonies.map((c) => c.world.step)),
    workers,
    queen,
    colonies: table.colonies.length,
  };
}

/** The colonies on the table, for the page's chips and the whole table's picture. */
function sendColonies(): void {
  post({ type: 'colonies', chosen: chosen?.slot ?? -1, colonies: colonies.map((c) => ({ name: c.name, slot: c.slot, species: c.world.species })), free: freeSlots(colonies) });
}

/** Where every colony's setup and ants are, for the picture of the whole table. */
function sendOverview(): void {
  const views: ColonyView[] = colonies.map((c) => {
    const w = c.world;
    const dots: number[] = [];
    let workers = 0;
    let queen = false;
    for (let i = 0; i < w.ants.count; i++) {
      const place = w.ants.place[i]!;
      if (place === Place.gone || w.ants.state[i] === AntState.dead) continue;
      if (w.ants.caste[i] === Caste.queen) queen = true;
      else workers++;
      if (place === Place.arena || place === Place.farm) dots.push(w.ants.x[i]!, w.ants.y[i]!, place);
    }
    return {
      name: c.name,
      slot: c.slot,
      species: c.world.species,
      workers,
      queen,
      nestWidth: w.farm.width,
      nestHeight: w.farm.height,
      table: tableShape(w),
      arenaWidth: w.arena.width,
      arenaHeight: w.arena.height,
      ants: Float32Array.from(dots),
    };
  });
  post({ type: 'overview', colonies: views }, views.map((v) => v.ants.buffer));
}

/** Shows colony `c`: the page draws it, and the keeper's tools act on it. */
function choose(c: Colony): void {
  if (chosen && chosen !== c) applyPending(chosen);
  chosen = c;
  world = c.world;
  inspected = -1;
  farmVersion = -1;
  sendColonies();
  sendAll(c.world);
}

function begin(table: Colony[], resumed: boolean, note?: string): void {
  colonies = table;
  owed = 0;
  overview = false;
  post({ type: 'tank', id: current!.id, name: current!.name, seed: table[0]!.seed, resumed, ...(note ? { note } : {}) });
  choose(table[0]!);
}

/** Real seconds a tank must have been closed before the page says what happened while it was (a quick look at the tank list is not being away). */
const REPORT_AFTER = 10 * 60;

/**
 * Lets every colony on the table live through `total` steps as fast as it
 * can, in slices, then, if `report`, says how far it has got and what
 * happened to each colony.
 */
function catchUp(table: Colony[], total: number, report: boolean): void {
  const c = { done: 0, total, before: table.map((k) => census(k.world)), skip: false };
  catching = c;
  // A slice does about the same work however many colonies there are, so the page stays as quick to answer.
  const per = Math.max(1, Math.ceil(CATCH_UP_SLICE / table.length));
  const slice = () => {
    if (catching !== c) return; // the tank was closed
    const n = Math.min(per, c.total - c.done);
    stepColonies(table, n);
    c.done += n;
    if (report) post({ type: 'catchUp', done: c.done, total: c.total });
    if (world) sendAll(world);
    if (c.done < c.total && !c.skip) {
      setTimeout(slice, 0);
      return;
    }
    catching = undefined;
    if (report) post({ type: 'away', lines: tableReport(table, c.before) });
    void save();
  };
  setTimeout(slice, 0);
}

async function list(): Promise<void> {
  post({ type: 'tanks', tanks: await readShelf(summary) });
}

/** Opens kept tank `id`: it lives through the time it was closed, then runs on. */
async function open(id: string): Promise<void> {
  await close();
  const kept = await readTank(id);
  if (!kept) {
    await list();
    return;
  }
  const table = asTable(kept);
  current = { id, name: table.name };
  const loaded = loadTable(table);
  if (loaded) {
    begin(loaded, true);
    const seconds = (Date.now() - table.savedAt) / 1000;
    const away = catchUpSteps(loaded[0]!.world, seconds);
    if (away > 0) catchUp(loaded, away, seconds >= REPORT_AFTER);
    return;
  }
  await setAside(kept).catch(() => undefined);
  const seed = table.colonies[0]?.seed ?? 1;
  begin(
    [{ name: table.name, slot: 0, seed, log: [], world: createTank(seed, null) }],
    false,
    'This tank was saved by an older version that cannot be carried over, so it starts again with a new colony. The old save is set aside in the browser.',
  );
  await save();
}

/** Sets up a new tank on the shelf, with the next seed after those kept. */
async function create(name: string, nest: NestSetup, species: number): Promise<void> {
  await close();
  const shelf = await readShelf(summary);
  const seed = nextSeed(shelf.map((e) => e.seed));
  current = { id: newId(shelf), name: freeName(name, shelf) };
  begin([{ name: 'Colony 1', slot: 0, seed, log: [], world: createTank(seed, nest, species) }], false);
  await save();
}

/**
 * Sets up a new colony in free place `slot` of the running table (T3): a
 * colony as keepers buy one, in a test tube joined to its own new arena,
 * or moved straight into a bought nest. Its seed is one no other colony
 * on the shelf or the table has.
 */
async function addColony(name: string, slot: number, nest: NestSetup, species: number): Promise<void> {
  if (!current || catching || colonies.length >= MAX_COLONIES || !freeSlots(colonies).includes(slot)) return;
  const shelf = await readShelf(summary);
  const seed = nextSeed([...shelf.map((e) => e.seed), ...colonies.map((c) => c.seed)]);
  const taken = colonies.map((c) => c.name);
  let free = name;
  for (let n = 2; taken.includes(free); n++) free = `${name} (${n})`;
  const c: Colony = { name: free, slot, seed, log: [], world: createTank(seed, nest, species) };
  colonies = [...colonies, c].sort((a, b) => a.slot - b.slot);
  choose(c);
  await save();
}

/** Gives colony `slot` away: it leaves the table (T4). A table keeps at least one colony. */
async function removeColony(slot: number): Promise<void> {
  const c = colonies.find((k) => k.slot === slot);
  if (!c || colonies.length <= 1 || catching) return;
  colonies = colonies.filter((k) => k !== c);
  if (chosen === c) {
    pending.length = 0;
    chosen = undefined;
    choose(colonies[0]!);
  } else sendColonies();
  await save();
}

/** Keeps a tank read from a file as a new tank, and opens it. */
async function importTank(file: Kept, name: string): Promise<void> {
  if (!loadTable(structuredClone(asTable(file)))) {
    post({ type: 'importFailed' });
    return;
  }
  const shelf = await readShelf(summary);
  const id = newId(shelf);
  const kept: TableSave = { ...asTable(file), name: freeName(name, shelf) };
  await writeTank(kept, entryFor(kept, id));
  await open(id);
}

/** Keeps the running tank and stops it. */
async function close(): Promise<void> {
  if (catching) catching.skip = true;
  catching = undefined;
  await save();
  colonies = [];
  chosen = undefined;
  world = undefined;
  current = undefined;
  overview = false;
  pending.length = 0;
}

onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'list') void list();
  else if (msg.type === 'open') void open(msg.id);
  else if (msg.type === 'create') void create(msg.name, msg.nest, msg.species ?? Species.lasiusNiger);
  else if (msg.type === 'import') void importTank(msg.save, msg.name);
  else if (msg.type === 'close') void close().then(list);
  else if (msg.type === 'rename') {
    if (current?.id === msg.id) current.name = msg.name;
    void renameTank(msg.id, msg.name).then(list);
  } else if (msg.type === 'delete') void deleteTank(msg.id).then(list);
  else if (msg.type === 'export') {
    if (colonies.length > 0 && current) post({ type: 'exported', name: current.name, save: tableSave(current.name, Date.now(), colonies) });
  } else if (msg.type === 'choose') {
    const c = colonies.find((k) => k.slot === msg.slot);
    if (c) choose(c);
  } else if (msg.type === 'addColony') void addColony(msg.name, msg.slot, msg.nest, msg.species ?? Species.lasiusNiger);
  else if (msg.type === 'removeColony') void removeColony(msg.slot);
  else if (msg.type === 'overview') {
    overview = msg.on;
    if (overview && colonies.length > 0) sendOverview();
  } else if (msg.type === 'speed') speed = msg.value;
  else if (msg.type === 'command') pending.push(msg.command);
  else if (msg.type === 'skip') {
    if (catching) catching.skip = true;
  } else if (msg.type === 'save') void save();
  else if (msg.type === 'history') {
    if (world) sendHistory(world);
  } else if (msg.type === 'inspect') {
    inspected = msg.id ?? -1;
    if (world) sendInspected(world);
  }
};

setInterval(() => {
  if (!world || !chosen || catching) return;
  const keeperActed = applyPending(chosen);
  if (speed > 0) {
    // Every colony on the table lives at the same speed; the most work in one interval is shared among them.
    owed += (speed * STEPS_PER_SECOND * INTERVAL_MS) / 1000;
    owed = Math.min(owed, Math.max(1, Math.floor(MAX_STEPS_PER_INTERVAL / colonies.length)));
    const n = Math.floor(owed);
    stepColonies(colonies, n);
    owed -= n;
  }
  sendAnts(world);
  if (++intervals % ARENA_EVERY === 0 || keeperActed) {
    sendArena(world);
    sendHeat(world);
    sendInspected(world);
    if (world.farm.version !== farmVersion) sendFarm(world);
    if (overview) sendOverview();
  }
}, INTERVAL_MS);

setInterval(save, SAVE_EVERY_MS);
