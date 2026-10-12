/**
 * The keeper's tank in browser storage (IndexedDB), read and written by the
 * worker (M6a). One tank is kept, as on a shelf; a save the code can no
 * longer read is set aside under its own key rather than overwritten.
 */
import type { Save } from '../sim/save';

const DB_NAME = 'formicarium';
const STORE = 'tanks';
const TANK_KEY = 'tank';
const SET_ASIDE_KEY = 'set-aside';

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

/** The kept tank, or undefined when there is none (or storage is unavailable). */
export async function readSave(): Promise<Save | undefined> {
  try {
    return await request<Save | undefined>('readonly', (s) => s.get(TANK_KEY));
  } catch {
    return undefined;
  }
}

/**
 * Keeps the tank. The world is copied when this is called, so the caller can
 * go on stepping it at once.
 */
export function writeSave(save: Save): Promise<void> {
  const copy = structuredClone(save);
  return request('readwrite', (s) => s.put(copy, TANK_KEY));
}

/** Moves a save this code cannot read out of the way, so a new tank does not overwrite it. */
export function setAside(save: Save): Promise<void> {
  return request('readwrite', (s) => s.put(save, SET_ASIDE_KEY));
}
