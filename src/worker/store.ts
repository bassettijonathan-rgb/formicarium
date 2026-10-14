/**
 * The keeper's tanks in browser storage (IndexedDB), read and written by the
 * worker (M6a, and the tank list, U2). Each tank is kept under its own key,
 * with a short entry in a shelf list so the page can show the tanks without
 * reading every world. A save the code can no longer read is set aside under
 * its own key rather than overwritten.
 */
import type { Save } from '../sim/save';
import type { TableSave } from '../sim/colonies';

/** A kept tank: a table of colonies, or one colony kept before tables had several (DESIGN.md 3.6). */
export type Kept = Save | TableSave;

const DB_NAME = 'formicarium';
const STORE = 'tanks';
/** The one tank kept before there was a list (M6a): moved onto the shelf the first time the list is read. */
const OLD_TANK_KEY = 'tank';
const SET_ASIDE_KEY = 'set-aside';
const SHELF_KEY = 'shelf';
const tankKey = (id: string) => `tank:${id}`;

/** What the tank list shows of a kept tank. */
export interface ShelfEntry {
  id: string;
  name: string;
  seed: number;
  /** The tank's age, steps; its workers and whether its queen lives, when last kept. */
  step: number;
  workers: number;
  queen: boolean;
  /** How many colonies are on the table (absent for entries kept before tables had several: one). */
  colonies?: number;
  /** When it was last kept, ms since 1970 by the page's clock. */
  savedAt: number;
}

let opening: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/**
 * The kept tanks, most recently kept first. A tank kept before the list
 * existed joins it now, named after its seed.
 */
export async function readShelf(summary: (save: Kept) => Omit<ShelfEntry, 'id' | 'name' | 'savedAt'>): Promise<ShelfEntry[]> {
  try {
    let shelf = (await request<ShelfEntry[] | undefined>('readonly', (s) => s.get(SHELF_KEY))) ?? [];
    const old = await request<Save | undefined>('readonly', (s) => s.get(OLD_TANK_KEY));
    if (old) {
      const id = newId(shelf);
      const name = `Tank ${old.seed}`;
      await request('readwrite', (s) => s.put({ ...old, name }, tankKey(id)));
      shelf = [...shelf, { id, name, savedAt: old.savedAt, ...safeSummary(summary, old) }];
      await request('readwrite', (s) => s.put(shelf, SHELF_KEY));
      await request('readwrite', (s) => s.delete(OLD_TANK_KEY));
    }
    return [...shelf].sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** A summary that does not fail on a save too old to read. */
function safeSummary(summary: (save: Kept) => Omit<ShelfEntry, 'id' | 'name' | 'savedAt'>, save: Save): Omit<ShelfEntry, 'id' | 'name' | 'savedAt'> {
  try {
    return summary(save);
  } catch {
    return { seed: save.seed, step: 0, workers: 0, queen: false };
  }
}

/** An id no tank on the shelf has. */
export function newId(shelf: readonly ShelfEntry[]): string {
  let n = shelf.length + 1;
  while (shelf.some((e) => e.id === String(n))) n++;
  return String(n);
}

/** `name`, or `name (2)`, `name (3)`… when a kept tank already has it, so two tanks in the list never look alike. */
export function freeName(name: string, shelf: readonly ShelfEntry[]): string {
  const taken = new Set(shelf.map((e) => e.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

/** The kept tank `id`, or undefined. */
export async function readTank(id: string): Promise<Kept | undefined> {
  try {
    return await request<Kept | undefined>('readonly', (s) => s.get(tankKey(id)));
  } catch {
    return undefined;
  }
}

/**
 * Keeps tank `entry.id` and its line on the shelf. The world is copied when
 * this is called, so the caller can go on stepping it at once.
 */
export async function writeTank(save: TableSave, entry: ShelfEntry): Promise<void> {
  const copy = structuredClone(save);
  await request('readwrite', (s) => s.put(copy, tankKey(entry.id)));
  const shelf = (await request<ShelfEntry[] | undefined>('readonly', (s) => s.get(SHELF_KEY))) ?? [];
  const next = [...shelf.filter((e) => e.id !== entry.id), entry];
  await request('readwrite', (s) => s.put(next, SHELF_KEY));
}

/** Renames tank `id` on the shelf and in its save. */
export async function renameTank(id: string, name: string): Promise<void> {
  const shelf = (await request<ShelfEntry[] | undefined>('readonly', (s) => s.get(SHELF_KEY))) ?? [];
  await request('readwrite', (s) => s.put(shelf.map((e) => (e.id === id ? { ...e, name } : e)), SHELF_KEY));
  const save = await readTank(id);
  if (save) await request('readwrite', (s) => s.put({ ...save, name }, tankKey(id)));
}

/** Throws tank `id` away. */
export async function deleteTank(id: string): Promise<void> {
  const shelf = (await request<ShelfEntry[] | undefined>('readonly', (s) => s.get(SHELF_KEY))) ?? [];
  await request('readwrite', (s) => s.put(shelf.filter((e) => e.id !== id), SHELF_KEY));
  await request('readwrite', (s) => s.delete(tankKey(id)));
}

/** Moves a save this code cannot read out of the way, so it is not overwritten. */
export function setAside(save: Kept): Promise<void> {
  return request('readwrite', (s) => s.put(save, SET_ASIDE_KEY));
}
