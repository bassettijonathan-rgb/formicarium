/**
 * The sky over Legnano (DESIGN.md section 8.1, V3): where the sun and the moon
 * are, and the moon's phase, at a real moment. Low-precision formulas (the
 * Astronomical Almanac's solar position and a truncated lunar theory, as in
 * Meeus, Astronomical Algorithms, ch. 25 and 47), good to a fraction of a
 * degree, which is far below what the window shows.
 *
 * This is decoration only: nothing in the simulation reads it (V5).
 */

/** Legnano, Lombardy: the keeper's window. */
export const LEGNANO = { latitude: 45.5967, longitude: 8.9139, timeZone: 'Europe/Rome' } as const;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** A body's place in the sky, in degrees: altitude above the horizon, azimuth clockwise from north. */
export interface SkyPosition {
  alt: number;
  az: number;
}

export interface Sky {
  sun: SkyPosition;
  moon: SkyPosition;
  /** The moon's elongation from the sun, radians in [0, 2π): 0 new, π full. */
  elongation: number;
  /** Fraction of the moon's disc that is lit, 0 to 1. */
  illumination: number;
  /** True from new moon to full moon. */
  waxing: boolean;
}

/** Days since J2000.0 (2000-01-01 12:00 UT) for a time in Unix milliseconds. */
function daysSinceJ2000(ms: number): number {
  return ms / 86_400_000 + 2440587.5 - 2451545;
}

function sunEquatorial(n: number): { ra: number; dec: number; longitude: number } {
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) * D2R;
  const longitude = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * n) * D2R;
  return {
    ra: Math.atan2(Math.cos(eps) * Math.sin(longitude), Math.cos(longitude)),
    dec: Math.asin(Math.sin(eps) * Math.sin(longitude)),
    longitude,
  };
}

function moonEquatorial(n: number): { ra: number; dec: number; longitude: number } {
  const L = (218.316 + 13.176396 * n) * D2R;
  const M = (134.963 + 13.064993 * n) * D2R;
  const F = (93.272 + 13.22935 * n) * D2R;
  const longitude = L + 6.289 * D2R * Math.sin(M);
  const latitude = 5.128 * D2R * Math.sin(F);
  const eps = 23.4397 * D2R;
  return {
    ra: Math.atan2(Math.sin(longitude) * Math.cos(eps) - Math.tan(latitude) * Math.sin(eps), Math.cos(longitude)),
    dec: Math.asin(Math.sin(latitude) * Math.cos(eps) + Math.cos(latitude) * Math.sin(eps) * Math.sin(longitude)),
    longitude,
  };
}

function horizontal(n: number, ra: number, dec: number): SkyPosition {
  const siderealTime = (280.46061837 + 360.98564736629 * n) * D2R + LEGNANO.longitude * D2R;
  const hourAngle = siderealTime - ra;
  const phi = LEGNANO.latitude * D2R;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle));
  // Azimuth from the south, westward; turned to clockwise from the north.
  const fromSouth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { alt: alt * R2D, az: (((fromSouth * R2D + 180) % 360) + 360) % 360 };
}

/**
 * The moon is close enough that seen from the Earth's surface rather than its
 * centre it sits lower by its horizontal parallax, about 0.95°, times cos(altitude).
 */
function lowered(p: SkyPosition): SkyPosition {
  return { alt: p.alt - 0.95 * Math.cos(p.alt * D2R), az: p.az };
}

/** The sun and the moon as seen from Legnano at a moment given in Unix milliseconds. */
export function skyAt(ms: number): Sky {
  const n = daysSinceJ2000(ms);
  const sun = sunEquatorial(n);
  const moon = moonEquatorial(n);
  let elongation = (moon.longitude - sun.longitude) % (2 * Math.PI);
  if (elongation < 0) elongation += 2 * Math.PI;
  return {
    sun: horizontal(n, sun.ra, sun.dec),
    moon: lowered(horizontal(n, moon.ra, moon.dec)),
    elongation,
    illumination: (1 - Math.cos(elongation)) / 2,
    waxing: elongation < Math.PI,
  };
}

/** Legnano's wall clock at a moment: hours and minutes, and the zone's name (CET or CEST). */
export function legnanoClock(ms: number): { hours: number; minutes: number; zone: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LEGNANO.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const offset = get('timeZoneName');
  return {
    hours: Number(get('hour')),
    minutes: Number(get('minute')),
    zone: offset === 'GMT+2' ? 'CEST' : offset === 'GMT+1' ? 'CET' : offset,
  };
}
