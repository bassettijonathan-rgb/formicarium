/**
 * The view out of the keeper's window (DESIGN.md section 8.1, V2-V4): the sky
 * at the real time over the place the player picked, with the real sun and
 * moon, the live weather, far mountains on the horizon, and a town. Painted with Canvas 2D on its own
 * canvas, which the room shows as a texture.
 *
 * The painter works in "window pixels": the glass is GLASS.width x GLASS.height,
 * 1.6 px per mm of the scene. The window looks west-north-west, so sunsets
 * happen in it, with the highest of the far mountains near the middle.
 */
import type { Sky } from '../../room/sky';
import type { Weather } from '../../room/weather';

/** The window's glass, in window pixels; it is 762.5 x 398.75 mm in the scene. */
export const GLASS = { width: 1220, height: 638 } as const;
/** Window pixels per scene mm. */
export const GLASS_PX_PER_MM = 1.6;

const D2R = Math.PI / 180;
/** The horizon, px from the top of the glass. */
const HOR = 476;
/** Window pixels per degree of sky, both ways. */
const PPD = 15;
/** Azimuth at the left edge of the glass; the right edge is ~326°. */
const AZ0 = 245;
/** The direction the window faces. */
const FACING = 286;

type RGB = [number, number, number];
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
/** Smoothstep from e0 to e1 (either way round). */
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function keyed(keys: [number, RGB][], x: number): RGB {
  if (x <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [x1, c1] = keys[i]!;
    if (x <= x1) {
      const [x0, c0] = keys[i - 1]!;
      return mix(c0, c1, (x - x0) / (x1 - x0));
    }
  }
  return keys[keys.length - 1]![1];
}
const K = (pairs: [number, string][]): [number, RGB][] => pairs.map(([x, h]) => [x, hex(h)]);
/** A small fixed random sequence, so the town looks the same every visit. */
function sequence(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const azX = (az: number) => (az - AZ0) * PPD;
const altY = (alt: number) => HOR - alt * PPD;

// Sky colours by the sun's altitude: overhead, and at the horizon toward and away from the sun.
const SKY_TOP = K([[-18, '#03050b'], [-12, '#0a1026'], [-6, '#1a2452'], [-2, '#2e4282'], [3, '#4465a8'], [10, '#4b7fc5'], [30, '#3a75c6']]);
const HOR_SUN = K([[-18, '#080c18'], [-12, '#1a213f'], [-6, '#7a4a62'], [-2, '#d47d55'], [2, '#f0a868'], [8, '#ecd0aa'], [30, '#b9d3ea']]);
const HOR_AWAY = K([[-18, '#080c18'], [-12, '#171d38'], [-6, '#3f4166'], [-2, '#a98aa6'], [3, '#d6b4b8'], [10, '#d4d7df'], [30, '#b9d3ea']]);

/**
 * How bright daylight is in the room, 0 (night) to 1 (full day): the sun's
 * height, dimmed by cloud and rain, plus a little moonlight on clear nights.
 */
export function daylight(sky: Sky, wx: Weather): number {
  const day = smooth(-10, 8, sky.sun.alt);
  const moon = sky.moon.alt > 0 ? 0.06 * sky.illumination : 0;
  return clamp(day * (1 - 0.45 * wx.fill - 0.15 * wx.rain) + moon * (1 - wx.fill));
}

/** How warm (orange) the light is: strongest around sunset, if the sky is open. */
export function sunsetGlow(sky: Sky, wx: Weather): number {
  return smooth(-4, 1, sky.sun.alt) * (1 - smooth(6, 16, sky.sun.alt)) * (1 - wx.fill);
}

interface House {
  x: number;
  w: number;
  eave: number;
  ridge: number;
  color: RGB;
  wins: { x: number; y: number; lit: boolean; warm: number }[];
  pots: { x: number; h: number }[];
  antenna: number;
}
interface Cloud {
  x: number;
  y: number;
  rank: number;
  speed: number;
  puffs: { dx: number; dy: number; r: number }[];
}

/** The town and the weather's particles, laid out once. Window pixels. */
function layOut() {
  const r = sequence(11);
  const W = GLASS.width;
  // A range of far mountains, the highest about 2.4° high; drawn 1.8 times taller so it clears the roofs.
  const alps: [number, number][] = [];
  const peaks: [number, number, number][] = [[268, 0.9, 40], [276, 1.2, 30], [283, 1.5, 34], [291, 2.1, 22], [295, 2.45, 26], [299, 2.2, 18], [304, 1.6, 30], [312, 1.3, 36], [320, 0.9, 40]];
  for (let x = -10; x <= W + 10; x += 4) {
    const az = AZ0 + x / PPD;
    let h = 0.12 + 0.06 * Math.sin(x * 0.05);
    for (const [paz, ph, w] of peaks) h = Math.max(h, ph * Math.max(0, 1 - (Math.abs(az - paz) * PPD) / w) ** 1.15 + (r() - 0.5) * 0.08);
    alps.push([x, HOR - 1.8 * h * PPD]);
  }
  const far: { x: number; w: number; h: number }[] = [];
  for (let x = -20; x < W + 20; ) {
    const w = 18 + r() * 50;
    far.push({ x, w, h: 4 + r() * 14 });
    x += w + r() * 10;
  }
  const trees = Array.from({ length: 16 }, () => ({ x: r() * W, y: HOR + 34 + r() * 20, r: 16 + r() * 26 }));
  const houses: House[] = [];
  const facades = ['#d8b77a', '#d6a37c', '#cdbfa6', '#e2c597', '#c99b75', '#d9c8a5'];
  for (let x = -40; x < W + 40; ) {
    const w = 120 + r() * 150;
    const eave = 548 + r() * 40;
    const ridge = 26 + r() * 26;
    const wins: House['wins'] = [];
    for (let wx = x + 22; wx < x + w - 30; wx += 46 + r() * 10) wins.push({ x: wx, y: eave + 22, lit: r() < 0.45, warm: r() });
    const pots = Array.from({ length: 1 + Math.floor(r() * 2.2) }, () => ({ x: x + 20 + r() * (w - 40), h: 16 + r() * 14 }));
    houses.push({ x, w, eave, ridge, color: hex(facades[Math.floor(r() * facades.length)]!), wins, pots, antenna: r() < 0.5 ? x + 30 + r() * (w - 60) : -1 });
    x += w + 2;
  }
  const clouds: Cloud[] = [];
  for (let i = 0; i < 30; i++) {
    const n = 6 + Math.floor(r() * 7);
    const w = 90 + r() * 260;
    const puffs = Array.from({ length: n }, (_, k) => {
      const t = k / (n - 1) - 0.5;
      return { dx: t * w + (r() - 0.5) * 30, dy: -Math.cos(t * Math.PI) * (12 + r() * 20) + (r() - 0.5) * 10, r: 22 + r() * 30 * Math.cos(t * 2.4) };
    });
    clouds.push({ x: r() * 1900 - 300, y: 38 + r() * 380, puffs, rank: r(), speed: 0.6 + r() * 0.8 });
  }
  clouds.sort((a, b) => a.y - b.y);
  const stars = Array.from({ length: 220 }, () => ({ x: r() * W, y: r() * HOR, b: r() }));
  const drops = Array.from({ length: 170 }, () => ({ x: r() * W, y: r() * GLASS.height, r: 1.2 + r() * 3.6, run: r() < 0.08 ? 20 + r() * 40 : 0 }));
  const streaks = Array.from({ length: 260 }, () => ({ x: r(), y: r(), l: 14 + r() * 26, s: 0.7 + r() * 0.6 }));
  const flakes = Array.from({ length: 240 }, () => ({ x: r(), y: r(), r: 1 + r() * 2.4, s: 0.4 + r() * 0.6, p: r() * 6 }));
  return { alps, far, trees, houses, clouds, stars, drops, streaks, flakes };
}

export class OutsideView {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly town = layOut();
  /** Lightning: how bright the current flash is, and how long it has left (s). */
  private flash = 0;
  private flashLeft = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    // One canvas pixel per window pixel: the view is far behind the tank, so it may soften when you zoom in.
    this.canvas.width = GLASS.width;
    this.canvas.height = GLASS.height;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** The brightness of the lightning flash on the last paint, 0 to 1 (the room flickers with it). */
  get lightning(): number {
    return this.flash;
  }

  /**
   * Paints the view for the sky and weather at real time `now` (ms, any
   * steady clock; it moves the clouds, rain and snow). `dt` is the time since
   * the last paint, for the lightning.
   */
  paint(sky: Sky, wx: Weather, now: number, dt: number): void {
    const c = this.ctx;
    const k = this.canvas.width / GLASS.width;
    c.setTransform(k, 0, 0, k, 0, 0);
    const W = GLASS.width;
    const H = GLASS.height;
    const town = this.town;

    if (wx.storm > 0) {
      if (this.flashLeft <= 0 && Math.random() < dt / 6000) this.flashLeft = 0.35;
      this.flashLeft -= dt / 1000;
      this.flash = this.flashLeft > 0 ? (Math.sin(this.flashLeft * 60) > 0 ? 1 : 0.4) * clamp(this.flashLeft / 0.35) : 0;
    } else this.flash = 0;

    const sunAlt = sky.sun.alt;
    const towardSun = Math.cos((sky.sun.az - FACING) * D2R);
    const day = smooth(-10, 8, sunAlt);
    const grey = mix(hex('#0b0d12'), hex('#9ba2ab'), day * (1 - 0.35 * wx.rain - 0.3 * wx.storm));
    let top = keyed(SKY_TOP, sunAlt);
    let hor = mix(keyed(HOR_AWAY, sunAlt), keyed(HOR_SUN, sunAlt), clamp(0.5 + 0.5 * towardSun));
    top = mix(top, scale(grey, 0.82), wx.fill);
    hor = mix(hor, grey, wx.fill * 0.92);
    if (wx.fog) hor = mix(hor, mix(grey, hex('#c9ccd0'), day * 0.5), wx.fog * 0.6);

    const g = c.createLinearGradient(0, 0, 0, HOR + 40);
    g.addColorStop(0, rgb(top));
    g.addColorStop(0.75, rgb(mix(top, hor, 0.6)));
    g.addColorStop(1, rgb(hor));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // Stars on clear nights.
    const starA = smooth(-6, -14, sunAlt) * (1 - wx.cloud * 0.9) * (1 - wx.fill) * (1 - wx.fog);
    if (starA > 0.01) {
      for (const s of town.stars) {
        const twinkle = 0.6 + 0.4 * Math.sin(now * 0.002 + s.b * 40);
        const size = s.b > 0.85 ? 2 : 1.3;
        c.fillStyle = `rgba(235,240,255,${starA * (0.25 + 0.75 * s.b) * twinkle})`;
        c.fillRect(s.x, s.y, size, size);
      }
    }

    // The glow round the sun near the horizon, then the sun.
    const sx = azX(sky.sun.az);
    const sy = altY(sunAlt);
    if (sunAlt > -10 && sx > -300 && sx < W + 300) {
      const a = smooth(-10, -1, sunAlt) * (1 - smooth(10, 30, sunAlt)) * (1 - wx.fill * 0.85);
      const gy = Math.min(sy, HOR);
      const glow = c.createRadialGradient(sx, gy, 0, sx, gy, 420);
      glow.addColorStop(0, `rgba(255,180,110,${0.55 * a})`);
      glow.addColorStop(1, 'rgba(255,160,90,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, W, H);
    }
    if (sunAlt > -1.5 && sx > -40 && sx < W + 40) {
      const a = 1 - wx.fill * 0.9;
      const col = mix(hex('#ff7a3c'), hex('#fff6e0'), smooth(0, 14, sunAlt));
      const halo = c.createRadialGradient(sx, sy, 0, sx, sy, 90);
      halo.addColorStop(0, rgb(col, 0.65 * a));
      halo.addColorStop(1, rgb(col, 0));
      c.fillStyle = halo;
      c.fillRect(sx - 90, sy - 90, 180, 180);
      c.fillStyle = rgb(col, a);
      c.beginPath();
      c.arc(sx, sy, 12, 0, Math.PI * 2);
      c.fill();
    }

    // The moon, lit on the side toward the sun.
    const mx = azX(sky.moon.az);
    const my = altY(sky.moon.alt);
    if (sky.moon.alt > -1 && mx > -20 && mx < W + 20 && sky.illumination > 0.02) {
      const a = (1 - wx.fill * 0.85) * (0.35 + 0.65 * (1 - day));
      const r = 11;
      const kk = Math.cos(sky.elongation);
      const side = sky.waxing ? 1 : -1;
      c.fillStyle = `rgba(120,130,150,${0.15 * a})`;
      c.beginPath();
      c.arc(mx, my, r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = `rgba(244,240,226,${a})`;
      c.beginPath();
      c.moveTo(mx, my - r);
      c.arc(mx, my, r, -Math.PI / 2, Math.PI / 2, side < 0);
      c.ellipse(mx, my, r * Math.abs(kk), r, 0, Math.PI / 2, -Math.PI / 2, side * kk > 0);
      c.fill();
    }

    // The far mountains: pink at sunrise, dark against the sunset, gone in haze.
    const alpsA = wx.alps * (1 - wx.fog);
    if (alpsA > 0.01) {
      const morning = sky.sun.az < 180;
      const glow = morning ? smooth(-5, 0, sunAlt) * (1 - smooth(4, 12, sunAlt)) : 0;
      const back = morning ? 0 : smooth(25, 2, sunAlt);
      let snow = mix(hex('#f4f6fa'), hex('#f2a39a'), glow);
      snow = mix(snow, mix(hor, hex('#3d4766'), 0.55), back);
      snow = mix(scale(snow, 0.25), snow, day);
      const rock = mix(snow, hor, 0.55);
      c.fillStyle = rgb(mix(hor, rock, 0.6 * alpsA));
      c.beginPath();
      c.moveTo(0, HOR + 2);
      for (const [x, y] of town.alps) c.lineTo(x, y);
      c.lineTo(W, HOR + 2);
      c.closePath();
      c.fill();
      c.save();
      c.clip();
      const sg = c.createLinearGradient(0, HOR - 70, 0, HOR - 18);
      sg.addColorStop(0, rgb(mix(hor, snow, alpsA)));
      sg.addColorStop(1, rgb(mix(hor, snow, alpsA), 0));
      c.fillStyle = sg;
      c.fillRect(0, HOR - 72, W, 56);
      c.restore();
    }

    // Clouds, drifting with the wind.
    if (wx.cloud > 0.02) {
      const tint = smooth(-6, -1, sunAlt) * (1 - smooth(6, 16, sunAlt));
      let lit = mix(hex('#ffffff'), hex('#ffb08a'), tint * (0.4 + 0.6 * clamp(0.5 + 0.5 * towardSun)));
      lit = mix(hex('#1b2030'), lit, clamp(day + 0.08));
      lit = mix(lit, scale(grey, 1.05), wx.fill * 0.75);
      const shade = mix(scale(lit, 0.62), hor, 0.25);
      const a = wx.fill > 0.5 ? 0.75 : 0.92;
      for (const cl of town.clouds) {
        if (cl.rank > wx.cloud + 0.02) continue;
        const span = 1900;
        const x = ((((cl.x + now * 0.0012 * wx.wind * cl.speed) % span) + span) % span) - 300;
        c.fillStyle = rgb(shade, a);
        for (const p of cl.puffs) {
          c.beginPath();
          c.arc(x + p.dx, cl.y + p.dy + 8, Math.max(1, p.r), 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = rgb(lit, a * 0.9);
        for (const p of cl.puffs) {
          c.beginPath();
          c.arc(x + p.dx - 3, cl.y + p.dy - 4, Math.max(1, p.r * 0.86), 0, Math.PI * 2);
          c.fill();
        }
      }
    }

    // The town: far roofs in the haze, an old mill chimney, a domed church, trees, then the houses across the street.
    const amb = daylight(sky, wx);
    const haze = (col: RGB, h: number) => mix(scale(col, 0.18 + 0.82 * amb), hor, h);
    c.fillStyle = rgb(haze(hex('#7f8a96'), 0.62 + 0.3 * wx.fog));
    for (const b of town.far) c.fillRect(b.x, HOR - b.h + 6, b.w, b.h + 80);
    c.fillStyle = rgb(haze(hex('#8a5a44'), 0.45 + 0.4 * wx.fog));
    c.beginPath();
    c.moveTo(208, HOR + 30);
    c.lineTo(213, HOR - 128);
    c.lineTo(225, HOR - 128);
    c.lineTo(230, HOR + 30);
    c.fill();
    c.fillRect(210, HOR - 134, 18, 6);
    // The church: an octagonal drum and dome with its lantern, and the bell tower.
    const church = haze(hex('#b0694a'), 0.3 + 0.45 * wx.fog);
    const roof = haze(hex('#6f7a7d'), 0.3 + 0.45 * wx.fog);
    c.fillStyle = rgb(church);
    c.fillRect(800, 448, 120, 110);
    c.fillRect(822, 400, 76, 52);
    c.fillStyle = rgb(roof);
    c.beginPath();
    c.ellipse(860, 402, 40, 34, 0, Math.PI, 0);
    c.fill();
    c.fillStyle = rgb(church);
    c.fillRect(854, 356, 12, 16);
    c.beginPath();
    c.moveTo(852, 358);
    c.lineTo(860, 344);
    c.lineTo(868, 358);
    c.fill();
    c.fillRect(962, 300, 34, 260);
    c.fillStyle = rgb(haze(hex('#2a2422'), 0.3 + 0.45 * wx.fog));
    c.fillRect(969, 320, 8, 20);
    c.fillRect(981, 320, 8, 20);
    c.fillStyle = rgb(roof);
    c.beginPath();
    c.moveTo(958, 302);
    c.lineTo(979, 248);
    c.lineTo(1000, 302);
    c.fill();
    c.strokeStyle = rgb(roof);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(979, 248);
    c.lineTo(979, 234);
    c.moveTo(974, 239);
    c.lineTo(984, 239);
    c.stroke();
    for (const t of town.trees) {
      c.fillStyle = rgb(haze(hex('#3f5a35'), 0.32 + 0.4 * wx.fog));
      c.beginPath();
      c.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      c.fill();
    }
    const night = 1 - amb;
    for (const h of town.houses) {
      const facade = haze(h.color, 0.08 + 0.25 * wx.fog);
      c.fillStyle = rgb(facade);
      c.fillRect(h.x, h.eave, h.w, 200);
      const tile = haze(hex('#a4553a'), 0.08 + 0.25 * wx.fog);
      c.fillStyle = rgb(tile);
      c.beginPath();
      c.moveTo(h.x - 8, h.eave + 2);
      c.lineTo(h.x + h.w * 0.5, h.eave - h.ridge);
      c.lineTo(h.x + h.w + 8, h.eave + 2);
      c.fill();
      if (wx.snow > 0) {
        c.fillStyle = rgb(mix(hex('#f4f6f8'), hor, 0.2), 0.9 * wx.snow);
        c.beginPath();
        c.moveTo(h.x - 8, h.eave);
        c.lineTo(h.x + h.w * 0.5, h.eave - h.ridge - 3);
        c.lineTo(h.x + h.w + 8, h.eave);
        c.lineTo(h.x + h.w * 0.5, h.eave - h.ridge + 6);
        c.fill();
      }
      for (const p of h.pots) {
        // Chimney pots with a little tiled roof.
        const y = h.eave - h.ridge * (1 - Math.abs((p.x - h.x) / h.w - 0.5) * 2);
        c.fillStyle = rgb(haze(hex('#9a6a52'), 0.1));
        c.fillRect(p.x, y - p.h, 10, p.h + 4);
        c.fillStyle = rgb(tile);
        c.fillRect(p.x - 3, y - p.h - 4, 16, 5);
      }
      if (h.antenna > 0) {
        c.strokeStyle = rgb(haze(hex('#3c3f44'), 0.1));
        c.lineWidth = 1.5;
        const y = h.eave - h.ridge * 0.8;
        c.beginPath();
        c.moveTo(h.antenna, y);
        c.lineTo(h.antenna, y - 40);
        for (let i = 0; i < 4; i++) {
          c.moveTo(h.antenna - 12 + i * 2, y - 36 + i * 7);
          c.lineTo(h.antenna + 12 - i * 2, y - 36 + i * 7);
        }
        c.stroke();
      }
      for (const w of h.wins) {
        const lit = w.lit && night > 0.35;
        c.fillStyle = lit ? rgb(mix(hex('#ffcf7a'), hex('#ffe9b8'), w.warm), 0.55 + 0.4 * night) : rgb(scale(facade, 0.38));
        c.fillRect(w.x, w.y, 18, 30);
        // Green shutters, open.
        c.fillStyle = rgb(haze(hex('#3f6b4a'), 0.12));
        c.fillRect(w.x - 9, w.y, 8, 30);
        c.fillRect(w.x + 19, w.y, 8, 30);
      }
    }

    // Fog, rain, snow and lightning.
    if (wx.fog > 0) {
      const fg = c.createLinearGradient(0, HOR - 200, 0, H);
      const fc = mix(grey, hex('#d5d8dc'), 0.3 * day);
      fg.addColorStop(0, rgb(fc, 0));
      fg.addColorStop(0.45, rgb(fc, 0.62 * wx.fog));
      fg.addColorStop(1, rgb(fc, 0.42 * wx.fog));
      c.fillStyle = fg;
      c.fillRect(0, 0, W, H);
    }
    if (wx.rain > 0) {
      c.strokeStyle = `rgba(200,210,225,${0.22 + 0.25 * wx.rain})`;
      c.lineWidth = 1;
      const slant = Math.min(0.6, wx.wind * 0.02);
      c.beginPath();
      const n = Math.round(town.streaks.length * wx.rain);
      for (let i = 0; i < n; i++) {
        const s = town.streaks[i]!;
        const y = ((s.y + now * 0.0016 * s.s) % 1) * H;
        const x = ((s.x + now * 0.00005 * wx.wind) % 1) * W;
        c.moveTo(x, y);
        c.lineTo(x - s.l * slant, y + s.l);
      }
      c.stroke();
    }
    if (wx.snow > 0) {
      c.fillStyle = 'rgba(245,247,252,0.9)';
      const n = Math.round(town.flakes.length * wx.snow);
      for (let i = 0; i < n; i++) {
        const f = town.flakes[i]!;
        const y = ((f.y + now * 0.00006 * f.s) % 1) * H;
        const x = ((((f.x + 0.012 * Math.sin(now * 0.001 * f.s + f.p)) % 1) + 1) % 1) * W;
        c.beginPath();
        c.arc(x, y, f.r, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (this.flash > 0) {
      c.fillStyle = `rgba(225,232,255,${0.55 * this.flash})`;
      c.fillRect(0, 0, W, H);
    }
    // Drops on the glass.
    if (wx.rain > 0) {
      const n = Math.round(town.drops.length * wx.rain);
      for (let i = 0; i < n; i++) {
        const d = town.drops[i]!;
        const y = d.run ? (d.y + (now * 0.02 * d.run) / 30) % H : d.y;
        c.fillStyle = 'rgba(20,26,36,0.35)';
        c.beginPath();
        c.arc(d.x, y, d.r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(230,238,250,0.45)';
        c.beginPath();
        c.arc(d.x - d.r * 0.3, y - d.r * 0.35, d.r * 0.4, 0, Math.PI * 2);
        c.fill();
        if (d.run) {
          c.strokeStyle = 'rgba(210,222,240,0.18)';
          c.lineWidth = d.r * 0.8;
          c.beginPath();
          c.moveTo(d.x, y - d.run);
          c.lineTo(d.x, y);
          c.stroke();
        }
      }
    }
  }
}
