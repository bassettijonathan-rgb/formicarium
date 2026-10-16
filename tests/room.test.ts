import { describe, expect, it } from 'vitest';
import { clockAt, skyAt } from '../src/room/sky';
import { computerPlace, defaultPlace, loadPlace, placesFromGeocoding, savePlace } from '../src/room/place';
import { openMeteoUrl } from '../src/room/weather';
import { CLEAR, weatherFromOpenMeteo } from '../src/room/weather';
import { clearHeadspace } from '../src/render/soilColors';
import { Material } from '../src/sim/materials';

/** Greenwich, London: a test place with well-known almanac times. */
const LONDON = { name: 'London, England, United Kingdom', latitude: 51.5074, longitude: -0.1278, timeZone: 'Europe/London' };

/** London's sunrise and sunset (sun's upper edge at the horizon, with refraction) on a day, as minutes after local midnight. */
function sunTimes(y: number, m: number, d: number, utcOffsetHours: number): { rise: number; set: number; highest: number } {
  let rise = -1;
  let set = -1;
  let highest = -90;
  let prev = NaN;
  for (let min = 0; min < 1440; min++) {
    const alt = skyAt(Date.UTC(y, m - 1, d) + (min - utcOffsetHours * 60) * 60_000, LONDON).sun.alt;
    highest = Math.max(highest, alt);
    if (prev < -0.833 && alt >= -0.833) rise = min;
    if (prev >= -0.833 && alt < -0.833) set = min;
    prev = alt;
  }
  return { rise, set, highest };
}
const at = (h: number, m: number) => h * 60 + m;

describe('the sky outside the window', () => {
  it('rises and sets the sun at the almanac times (London, 2026)', () => {
    // London: 21 June 04:43-21:21 BST, 21 December 08:04-15:53 GMT.
    const june = sunTimes(2026, 6, 21, 1);
    expect(Math.abs(june.rise - at(4, 43))).toBeLessThanOrEqual(4);
    expect(Math.abs(june.set - at(21, 21))).toBeLessThanOrEqual(4);
    const december = sunTimes(2026, 12, 21, 0);
    expect(Math.abs(december.rise - at(8, 4))).toBeLessThanOrEqual(4);
    expect(Math.abs(december.set - at(15, 53))).toBeLessThanOrEqual(4);
  });

  it('puts the noon sun at 90° minus the latitude plus the solar declination', () => {
    // Latitude 51.5°: 61.9° at the June solstice, 15.1° at the December one, 38.5° at the equinox.
    expect(sunTimes(2026, 6, 21, 1).highest).toBeCloseTo(90 - 51.507 + 23.44, 0);
    expect(sunTimes(2026, 12, 21, 0).highest).toBeCloseTo(90 - 51.507 - 23.44, 0);
    expect(sunTimes(2026, 3, 20, 0).highest).toBeCloseTo(90 - 51.507, 0);
  });

  it('has a full moon at the total lunar eclipse of 3 March 2026 and a new moon at the solar eclipse of 12 August 2026', () => {
    expect(skyAt(Date.UTC(2026, 2, 3, 11, 33), LONDON).illumination).toBeGreaterThan(0.99);
    const eclipse = skyAt(Date.UTC(2026, 7, 12, 17, 46), LONDON);
    expect(eclipse.illumination).toBeLessThan(0.01);
    // Seen from London the eclipse is partial and low in the west: the moon sits on the sun.
    expect(Math.abs(eclipse.moon.alt - eclipse.sun.alt)).toBeLessThan(1);
    expect(Math.abs(eclipse.moon.az - eclipse.sun.az)).toBeLessThan(1);
    expect(eclipse.sun.az).toBeGreaterThan(270);
  });

  it("reads the place's clock, summer time included", () => {
    expect(clockAt(Date.UTC(2026, 6, 1, 12, 5), LONDON.timeZone)).toEqual({ hours: 13, minutes: 5, zone: 'BST' });
    expect(clockAt(Date.UTC(2026, 0, 15, 12, 5), LONDON.timeZone)).toEqual({ hours: 12, minutes: 5, zone: 'GMT' });
    expect(clockAt(Date.UTC(2026, 0, 15, 12, 5), 'America/New_York')).toEqual({ hours: 7, minutes: 5, zone: 'GMT-5' });
  });

  it("before a city is picked, shows the sky on the meridian of the computer's own time zone, with no name", () => {
    expect(defaultPlace('America/New_York', -300)).toEqual({ name: '', latitude: 45, longitude: -75, timeZone: 'America/New_York' });
    const home = computerPlace(2026);
    expect(home.name).toBe('');
    expect(Math.abs(home.longitude)).toBeLessThanOrEqual(180);
    expect(() => clockAt(0, home.timeZone)).not.toThrow();
  });
});

describe('the city outside the window', () => {
  /** A stand-in for the browser's storage. */
  const memory = () => {
    const kept = new Map<string, string>();
    return {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => void kept.set(k, v),
      removeItem: (k: string) => void kept.delete(k),
      kept,
    };
  };

  it('is kept only in the browser, and forgotten on request', () => {
    const storage = memory();
    expect(loadPlace(storage)).toBeNull();
    savePlace(storage, LONDON);
    expect(loadPlace(storage)).toEqual(LONDON);
    savePlace(storage, null);
    expect(loadPlace(storage)).toBeNull();
    expect(loadPlace(null)).toBeNull();
  });

  it('ignores a kept value it cannot use', () => {
    const storage = memory();
    storage.setItem('formicarium.window', 'not json');
    expect(loadPlace(storage)).toBeNull();
    storage.setItem('formicarium.window', JSON.stringify({ ...LONDON, timeZone: 'Nowhere/Nothing' }));
    expect(loadPlace(storage)).toBeNull();
    storage.setItem('formicarium.window', JSON.stringify({ ...LONDON, latitude: 123 }));
    expect(loadPlace(storage)).toBeNull();
  });

  it("reads Open-Meteo's geocoding answer into places, skipping incomplete ones", () => {
    // The shape Open-Meteo's geocoding search returns (values made up).
    const places = placesFromGeocoding({
      results: [
        { id: 1, name: 'Springfield', latitude: 39.8, longitude: -89.64, timezone: 'America/Chicago', country: 'United States', admin1: 'Illinois' },
        { id: 2, name: 'Springfield', latitude: 42.1, longitude: -72.59, country: 'United States' },
        { id: 3, name: 'Springfield', latitude: -43.3, longitude: 171.92, timezone: 'Pacific/Auckland', country: 'New Zealand' },
      ],
      generationtime_ms: 0.5,
    });
    expect(places.map((p) => p.name)).toEqual(['Springfield, Illinois, United States', 'Springfield, New Zealand']);
    expect(places[0]).toMatchObject({ latitude: 39.8, longitude: -89.64, timeZone: 'America/Chicago' });
    expect(placesFromGeocoding({ generationtime_ms: 0.5 })).toEqual([]);
    expect(placesFromGeocoding(null)).toEqual([]);
  });

  it("asks Open-Meteo for the weather where the player's city is", () => {
    const url = openMeteoUrl(LONDON);
    expect(url).toContain('latitude=51.5074&longitude=-0.1278');
    expect(url).toContain('timezone=Europe%2FLondon');
  });
});

describe('the weather from Open-Meteo', () => {
  // The shape Open-Meteo returns for the URL in src/room/weather.ts (values made up).
  const reading = (current: Record<string, unknown>) => ({
    latitude: 51.5,
    longitude: -0.13,
    timezone: 'Europe/London',
    current_units: { time: 'iso8601', interval: 'seconds', temperature_2m: '°C', weather_code: 'wmo code', cloud_cover: '%', wind_speed_10m: 'km/h', visibility: 'm' },
    current: { time: '2026-10-13T08:45', interval: 900, ...current },
  });

  it('shows a clear day with the far mountains on the horizon', () => {
    const w = weatherFromOpenMeteo(reading({ temperature_2m: 14.3, weather_code: 0, cloud_cover: 3, wind_speed_10m: 5.2, visibility: 24140 }))!;
    expect(w.label).toBe('clear');
    expect(w.temperature).toBe(14.3);
    expect(w.rain + w.snow + w.fog + w.storm).toBe(0);
    expect(w.alps).toBeGreaterThan(0.9);
  });

  it('greys the sky and hides the far mountains in light rain', () => {
    const w = weatherFromOpenMeteo(reading({ temperature_2m: 9.8, weather_code: 61, cloud_cover: 100, wind_speed_10m: 14, visibility: 9000 }))!;
    expect(w.label).toBe('light rain');
    expect(w.rain).toBeGreaterThan(0);
    expect(w.fill).toBeGreaterThan(0.8);
    expect(w.alps).toBe(0);
    expect(w.wind).toBe(14);
  });

  it('brings in fog, and thunder with a storm', () => {
    expect(weatherFromOpenMeteo(reading({ weather_code: 45, cloud_cover: 60, visibility: 200 }))!.fog).toBe(1);
    expect(weatherFromOpenMeteo(reading({ weather_code: 95, cloud_cover: 100 }))!.storm).toBe(1);
    expect(weatherFromOpenMeteo(reading({ weather_code: 73, cloud_cover: 100 }))!.snow).toBeGreaterThan(0.5);
  });

  it('copes with a reading it cannot use', () => {
    expect(weatherFromOpenMeteo(null)).toBeNull();
    expect(weatherFromOpenMeteo({ error: true, reason: 'bad request' })).toBeNull();
    expect(weatherFromOpenMeteo(reading({ weather_code: 42 }))!.label).toBe('cloudy');
    expect(CLEAR.rain).toBe(0);
  });
});

describe("the farm's headspace", () => {
  it('lets the room show through the air above the soil, but not down a narrow shaft', () => {
    // 12 x 6 cells: soil from row 3 down, with a one-cell shaft at column 5 down to row 5.
    const width = 12;
    const height = 6;
    const material = new Uint8Array(width * height);
    for (let y = 3; y < height; y++) for (let x = 0; x < width; x++) material[y * width + x] = x === 5 ? Material.air : Material.sand;
    const rgba = new Uint8ClampedArray(4 * width * height).fill(255);
    clearHeadspace(material, width, height, rgba);
    const alpha = (x: number, y: number) => rgba[4 * (y * width + x) + 3];
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(5, 2)).toBe(0);
    expect(alpha(5, 3)).toBe(255);
    expect(alpha(5, 5)).toBe(255);
    expect(alpha(0, 3)).toBe(255);
  });

  it('clears a narrow slot between two spoil heaps down to the ground, but not a shaft into it', () => {
    // 60 x 30 cells: ground from row 20; two steep heaps up to row 8 with a 3-cell slot between them;
    // a one-cell shaft at column 50 down to row 27; a hollow inside the left heap; a crumb of spoil hanging at (5, 15).
    const width = 60;
    const height = 30;
    const material = new Uint8Array(width * height);
    const solid = (x: number, y: number) => {
      if (y >= 20) return !(x === 50 && y < 28);
      if (x === 5 && y === 15) return true;
      if (y >= 8 && ((x >= 10 && x <= 24) || (x >= 28 && x <= 42))) return !(x === 15 && y === 12);
      return false;
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) material[y * width + x] = solid(x, y) ? Material.sand : Material.air;
    const rgba = new Uint8ClampedArray(4 * width * height).fill(255);
    clearHeadspace(material, width, height, rgba);
    const alpha = (x: number, y: number) => rgba[4 * (y * width + x) + 3];
    expect(alpha(26, 9)).toBe(0);
    expect(alpha(26, 19)).toBe(0);
    expect(alpha(50, 19)).toBe(0);
    expect(alpha(50, 21)).toBe(255);
    expect(alpha(50, 27)).toBe(255);
    expect(alpha(15, 12)).toBe(255);
    expect(alpha(5, 19)).toBe(0);
    expect(alpha(5, 15)).toBe(255);
  });
});
