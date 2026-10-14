/**
 * Runs the simulation off the page's thread and sends snapshots to the renderer.
 * The simulation itself never sees real time; this loop decides how many
 * steps to run per real interval.
 */
import { AntState, Caste, Place } from '../sim/ants';
import { BroodStage } from '../sim/brood';
import { STEPS_PER_SECOND } from '../sim/time';
import { FIELD_CELL, createFarm } from '../sim/farm';
import { colonyCrop, deathsBy, step, type World } from '../sim/world';
import { type KeeperCommand, type LoggedCommand, applyCommand, createTank } from '../sim/keeper';
import { SAVE_VERSION, type Save, awayReport, catchUpSteps, census, loadWorld } from '../sim/save';
import { ANT_STRIDE, type FromWorker, Look, type PieceView, type ToWorker } from './protocol';
import { edible } from '../sim/prey';
import { type ShelfEntry, deleteTank, freeName, newId, readShelf, readTank, renameTank, setAside, writeTank } from './store';
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

let world: World | undefined;
/** The running tank's place on the shelf: its id and name. */
let current: { id: string; name: string } | undefined;
/** The keeper's actions on this tank since it was set up. */
let log: LoggedCommand[] = [];
let speed = 1;
let owed = 0;
let intervals = 0;
let farmVersion = -1;
const pending: KeeperCommand[] = [];
/** While the tank catches up on the time it was closed. */
/** The ant in the inspector, or -1. */
let inspected = -1;
let catching: { done: number; total: number; before: ReturnType<typeof census>; skip: boolean } | undefined;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  postMessage(msg, transfer);
}

function sendFarm(w: World): void {
  farmVersion = w.farm.version;
  const material = w.farm.material.slice();
  const moisture = w.farm.moisture.slice();
  const loose = w.farm.loose.slice();
  const t = w.farm.table;
  const table = t
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
  post({ type: 'farm', width: w.farm.width, height: w.farm.height, material, moisture, loose, table }, [
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
  post({ type: 'ants', step: w.step, ants: data, full, caste, callow, brood: broodData, prey, carried }, [
    data.buffer,
    full.buffer,
    caste.buffer,
    callow.buffer,
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

/** Keeper actions are applied between steps, in the order they arrived, and logged. */
function applyPending(w: World): boolean {
  const any = pending.length > 0;
  for (const command of pending.splice(0)) {
    const ok = applyCommand(w, command);
    log.push({ step: w.step, command });
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
  if (!world || !current || catching) return Promise.resolve();
  const kept: Save = { version: SAVE_VERSION, seed: world.seed, name: current.name, savedAt: Date.now(), log, world };
  return writeTank(kept, entryFor(kept, current.id)).catch(() => undefined); // storage full or blocked: the tank runs on unkept
}

/** The shelf's line for a save. */
function entryFor(save: Save, id: string): ShelfEntry {
  return { id, name: save.name ?? `Tank ${save.seed}`, savedAt: save.savedAt, ...summary(save) };
}

/** What the tank list shows of a save's world. */
function summary(save: Save): Omit<ShelfEntry, 'id' | 'name' | 'savedAt'> {
  const c = census(save.world);
  return { seed: save.seed, step: save.world.step, workers: c.workers, queen: c.queen };
}

function begin(w: World, savedLog: LoggedCommand[], resumed: boolean, note?: string): void {
  world = w;
  inspected = -1;
  log = savedLog;
  owed = 0;
  post({ type: 'tank', id: current!.id, name: current!.name, seed: w.seed, resumed, ...(note ? { note } : {}) });
  sendAll(w);
}

/** Real seconds a tank must have been closed before the page says what happened while it was (a quick look at the tank list is not being away). */
const REPORT_AFTER = 10 * 60;

/** Lets the tank live through `total` steps as fast as it can, in slices, then, if `report`, says how far it has got and what happened. */
function catchUp(w: World, total: number, report: boolean): void {
  const c = { done: 0, total, before: census(w), skip: false };
  catching = c;
  const slice = () => {
    if (catching !== c) return; // the tank was closed
    const n = Math.min(CATCH_UP_SLICE, c.total - c.done);
    for (let i = 0; i < n; i++) step(w);
    c.done += n;
    if (report) post({ type: 'catchUp', done: c.done, total: c.total });
    sendAll(w);
    if (c.done < c.total && !c.skip) {
      setTimeout(slice, 0);
      return;
    }
    catching = undefined;
    if (report) post({ type: 'away', lines: awayReport(c.before, census(w), w.params.daySeconds) });
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
  current = { id, name: kept.name ?? `Tank ${kept.seed}` };
  const w = loadWorld(kept);
  if (w) {
    begin(w, kept.log ?? [], true);
    const seconds = (Date.now() - kept.savedAt) / 1000;
    const away = catchUpSteps(w, seconds);
    if (away > 0) catchUp(w, away, seconds >= REPORT_AFTER);
    return;
  }
  await setAside(kept).catch(() => undefined);
  begin(createTank(kept.seed, null), [], false, 'This tank was saved by an older version that cannot be carried over, so it starts again with a new colony. The old save is set aside in the browser.');
  await save();
}

/** Sets up a new tank on the shelf, with the next seed after those kept. */
async function create(name: string, nest: NestSetup): Promise<void> {
  await close();
  const shelf = await readShelf(summary);
  const seed = Math.max(0, ...shelf.map((e) => e.seed)) + 1;
  current = { id: newId(shelf), name: freeName(name, shelf) };
  begin(createTank(seed, nest), [], false);
  await save();
}

/** Keeps a tank read from a file as a new tank, and opens it. */
async function importTank(file: Save, name: string): Promise<void> {
  if (!loadWorld(structuredClone(file))) {
    post({ type: 'importFailed' });
    return;
  }
  const shelf = await readShelf(summary);
  const id = newId(shelf);
  const kept: Save = { ...file, name: freeName(name, shelf) };
  await writeTank(kept, entryFor(kept, id));
  await open(id);
}

/** Keeps the running tank and stops it. */
async function close(): Promise<void> {
  if (catching) catching.skip = true;
  catching = undefined;
  await save();
  world = undefined;
  current = undefined;
  pending.length = 0;
}

onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'list') void list();
  else if (msg.type === 'open') void open(msg.id);
  else if (msg.type === 'create') void create(msg.name, msg.nest);
  else if (msg.type === 'import') void importTank(msg.save, msg.name);
  else if (msg.type === 'close') void close().then(list);
  else if (msg.type === 'rename') {
    if (current?.id === msg.id) current.name = msg.name;
    void renameTank(msg.id, msg.name).then(list);
  } else if (msg.type === 'delete') void deleteTank(msg.id).then(list);
  else if (msg.type === 'export') {
    if (world && current) post({ type: 'exported', name: current.name, save: { version: SAVE_VERSION, seed: world.seed, name: current.name, savedAt: Date.now(), log, world } });
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
  if (!world || catching) return;
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
    sendHeat(world);
    sendInspected(world);
    if (world.farm.version !== farmVersion) sendFarm(world);
  }
}, INTERVAL_MS);

setInterval(save, SAVE_EVERY_MS);
