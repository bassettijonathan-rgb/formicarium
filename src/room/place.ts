/**
 * Where the window looks out (DESIGN.md section 8.1, V7). Each player picks a
 * city in the Climate tab; the choice is kept only in that player's browser
 * (never in a tank or a tank file), so the code and a shared tank say nothing
 * of where anyone lives. Until a city is picked the window shows the sky at
 * the player's own clock time, with no name and no weather report.
 *
 * Decoration only: nothing in the simulation reads it (V5).
 */

/** A place the window can look out from: degrees north and east, and its IANA time zone. */
export interface Place {
  /** As the player will read it, e.g. "Bergen, Vestland, Norway". */
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

/** Where the browser keeps the player's choice. */
export const PLACE_KEY = 'formicarium.window';

/**
 * The window before a city is picked: the computer's own time zone, and the
 * sky as seen at 45° north on that zone's meridian (15° of longitude for each
 * hour of standard time), so the sun rises in the morning and sets in the
 * evening of the player's clock.
 */
export function defaultPlace(timeZone: string, standardOffsetMinutes: number): Place {
  return { name: '', latitude: 45, longitude: standardOffsetMinutes / 4, timeZone };
}

/** The computer's default place, from its clock (standard time: the smaller of January's and July's UTC offsets). */
export function computerPlace(year: number): Place {
  const offset = (month: number) => -new Date(year, month, 1).getTimezoneOffset();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return defaultPlace(zone, Math.min(offset(0), offset(6)));
}

function isPlace(v: unknown): v is Place {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.name === 'string' &&
    p.name !== '' &&
    typeof p.latitude === 'number' &&
    Math.abs(p.latitude) <= 90 &&
    typeof p.longitude === 'number' &&
    Math.abs(p.longitude) <= 180 &&
    typeof p.timeZone === 'string' &&
    validZone(p.timeZone)
  );
}

function validZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The place the player picked, or null if none (or the browser keeps nothing). */
export function loadPlace(storage: Pick<Storage, 'getItem'> | null): Place | null {
  try {
    const raw = storage?.getItem(PLACE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return isPlace(v) ? { name: v.name, latitude: v.latitude, longitude: v.longitude, timeZone: v.timeZone } : null;
  } catch {
    return null;
  }
}

/** Keeps the player's pick in the browser, or forgets it (null). */
export function savePlace(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, place: Place | null): void {
  try {
    if (place) storage?.setItem(PLACE_KEY, JSON.stringify(place));
    else storage?.removeItem(PLACE_KEY);
  } catch {
    // A browser that keeps nothing: the pick lasts until the page closes.
  }
}

/** Open-Meteo's geocoding search (free, no account, open to the browser): up to five places by name. */
export function geocodingUrl(name: string): string {
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`;
}

/** The places in an Open-Meteo geocoding answer that the window can use. */
export function placesFromGeocoding(response: unknown): Place[] {
  const results = (response as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: Place[] = [];
  for (const r of results as Record<string, unknown>[]) {
    if (typeof r !== 'object' || r === null || typeof r.name !== 'string') continue;
    const name = [r.name, r.admin1, r.country].filter((x) => typeof x === 'string' && x !== '').join(', ');
    const place = { name, latitude: r.latitude, longitude: r.longitude, timeZone: r.timezone };
    if (isPlace(place)) out.push(place);
  }
  return out;
}

/** Looks a city up by name. Returns an empty list when offline or on any error. */
export async function searchPlaces(name: string): Promise<Place[]> {
  try {
    const res = await fetch(geocodingUrl(name.trim()));
    if (!res.ok) return [];
    return placesFromGeocoding(await res.json());
  } catch {
    return [];
  }
}
