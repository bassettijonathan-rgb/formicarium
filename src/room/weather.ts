/**
 * The weather outside the window (DESIGN.md section 8.1, V4) at the place the
 * player picked (`place.ts`), read from
 * Open-Meteo (https://open-meteo.com: free, no account, open to the browser).
 * The reading is turned into what the window draws: how cloudy, how grey,
 * rain, snow, fog, thunder, wind for the clouds, and whether the far mountains show.
 *
 * Decoration only: the simulation never reads the weather (V5).
 */
import type { Place } from './place';

/** What the window draws for a weather. Amounts run from 0 to 1. */
export interface Weather {
  /** Words for the readout, e.g. "light rain". */
  label: string;
  /** Air temperature, °C, or null when unknown. */
  temperature: number | null;
  /** How much of the sky has clouds. */
  cloud: number;
  /** How grey the whole sky is: 0 blue between clouds, 1 one grey deck. */
  fill: number;
  rain: number;
  snow: number;
  fog: number;
  /** 1 in a thunderstorm: lightning now and then. */
  storm: number;
  /** Wind at 10 m, km/h: moves the clouds and slants the rain. */
  wind: number;
  /** How clearly the far mountains stand on the horizon. */
  alps: number;
}

/** What the window shows before the first reading, or with no connection at all. */
export const CLEAR: Weather = { label: 'clear', temperature: null, cloud: 0.06, fill: 0, rain: 0, snow: 0, fog: 0, storm: 0, wind: 6, alps: 1 };

/** The current conditions at a place, with only the fields the window uses. */
export function openMeteoUrl(place: Place): string {
  return (
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${place.latitude}&longitude=${place.longitude}` +
    '&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,visibility' +
    `&timezone=${encodeURIComponent(place.timeZone)}`
  );
}

/** How often the page asks again: Open-Meteo updates its current conditions every 15 minutes. */
export const REFRESH_MS = 15 * 60 * 1000;

interface Kind {
  label: string;
  rain?: number;
  snow?: number;
  fog?: number;
  storm?: number;
  /** Fog, rain and the like hide the sky behind one grey deck, whatever the cloud cover says. */
  fill?: number;
}

/** WMO weather interpretation codes (WMO 4677, as Open-Meteo reports them). */
const KINDS: Record<number, Kind> = {
  0: { label: 'clear' },
  1: { label: 'mainly clear' },
  2: { label: 'partly cloudy' },
  3: { label: 'overcast' },
  45: { label: 'fog', fog: 1, fill: 0.55 },
  48: { label: 'freezing fog', fog: 1, fill: 0.6 },
  51: { label: 'light drizzle', rain: 0.25, fill: 0.85 },
  53: { label: 'drizzle', rain: 0.35, fill: 0.85 },
  55: { label: 'heavy drizzle', rain: 0.45, fill: 0.9 },
  56: { label: 'freezing drizzle', rain: 0.3, fill: 0.9 },
  57: { label: 'freezing drizzle', rain: 0.45, fill: 0.9 },
  61: { label: 'light rain', rain: 0.45, fill: 0.9 },
  63: { label: 'rain', rain: 0.7, fill: 0.95 },
  65: { label: 'heavy rain', rain: 1, fill: 1 },
  66: { label: 'freezing rain', rain: 0.5, fill: 0.95 },
  67: { label: 'freezing rain', rain: 0.8, fill: 1 },
  71: { label: 'light snow', snow: 0.45, fill: 0.85 },
  73: { label: 'snow', snow: 0.75, fill: 0.9 },
  75: { label: 'heavy snow', snow: 1, fill: 0.95 },
  77: { label: 'snow grains', snow: 0.35, fill: 0.85 },
  80: { label: 'rain showers', rain: 0.5, fill: 0.7 },
  81: { label: 'rain showers', rain: 0.75, fill: 0.8 },
  82: { label: 'violent rain showers', rain: 1, fill: 0.9 },
  85: { label: 'snow showers', snow: 0.5, fill: 0.75 },
  86: { label: 'heavy snow showers', snow: 0.9, fill: 0.85 },
  95: { label: 'thunderstorm', rain: 0.9, storm: 1, fill: 1 },
  96: { label: 'thunderstorm with hail', rain: 1, storm: 1, fill: 1 },
  99: { label: 'thunderstorm with hail', rain: 1, storm: 1, fill: 1 },
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * Turns an Open-Meteo forecast response into what the window draws.
 * Returns null if the response has no current conditions.
 */
export function weatherFromOpenMeteo(response: unknown): Weather | null {
  const current = (response as { current?: Record<string, unknown> } | null)?.current;
  if (!current || typeof current !== 'object') return null;
  const code = num(current.weather_code);
  if (code === null) return null;
  const kind = KINDS[code] ?? { label: 'cloudy' };
  const coverPct = num(current.cloud_cover);
  // Without a cloud cover, guess one from the kind of weather.
  const cover = coverPct !== null ? clamp01(coverPct / 100) : code <= 1 ? 0.1 : code === 2 ? 0.5 : 1;
  const visibility = num(current.visibility);
  const fogFromVisibility = visibility !== null ? clamp01((2000 - visibility) / 1500) : 0;
  const fog = Math.max(kind.fog ?? 0, fogFromVisibility, (kind.rain ?? 0) * 0.2, (kind.snow ?? 0) * 0.3);
  const fill = Math.max(kind.fill ?? 0, clamp01((cover - 0.75) / 0.25) * 0.85);
  const rain = kind.rain ?? 0;
  const snow = kind.snow ?? 0;
  // The mountains are far off: they show only through dry air and gaps in the cloud. Open-Meteo caps
  // visibility near 24 km, so "as far as it reports" stands for a clear horizon.
  const far = visibility === null ? 1 : clamp01((visibility - 10_000) / 10_000);
  const alps = rain > 0 || snow > 0 ? 0 : far * clamp01(1 - cover * 1.2) * (1 - fog);
  return {
    label: kind.label,
    temperature: num(current.temperature_2m),
    cloud: Math.max(cover, rain > 0 || snow > 0 ? 0.9 : 0),
    fill,
    rain,
    snow,
    fog,
    storm: kind.storm ?? 0,
    wind: num(current.wind_speed_10m) ?? 6,
    alps,
  };
}

/** Asks Open-Meteo for the weather at a place now. Returns null when offline or on any error. */
export async function fetchWeather(place: Place): Promise<Weather | null> {
  try {
    const res = await fetch(openMeteoUrl(place));
    if (!res.ok) return null;
    return weatherFromOpenMeteo(await res.json());
  } catch {
    return null;
  }
}
