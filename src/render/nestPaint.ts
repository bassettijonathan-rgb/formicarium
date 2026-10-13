/**
 * Pictures of a bought nest's block (DESIGN.md 3.5), as RGBA pixels: the
 * floor of the carving, and the walls (their tops and the inner faces the
 * viewer sees). Pure functions, so they can be tested without a browser.
 *
 * The nest is drawn in its own floor coordinates, `scale` pixels per mm; the
 * page squashes the pictures in depth to show the nest at an angle. Seen from
 * the front and above, a wall's top shows `lift` pixels higher up than its
 * foot on the floor: the floor just behind a wall is hidden by it, and the
 * inner face of the far wall of each chamber shows above the floor.
 */
import { Material } from '../sim/materials';

/** Ytong as [r, g, b]: the block's sawn top, the chamber floors, and the walls' faces in shadow. */
const TOP = [222, 219, 210] as const;
const FLOOR = [196, 191, 180] as const;
const FACE = [160, 155, 146] as const;
/** How much the wettest ytong darkens, as a fraction of its dry brightness. */
const WET_DARKENING = 0.42;
/** Water (fraction of saturation) at which ytong looks wettest. */
const WETTEST = 0.6;

export interface NestPictures {
  width: number;
  /** The floor: `width` × `floorHeight` pixels, clear where there is wall. */
  floorHeight: number;
  floor: Uint8ClampedArray;
  /** The walls: `width` × `wallHeight` pixels; its first `lift` rows lie above the nest's back edge. */
  wallHeight: number;
  walls: Uint8ClampedArray;
}

/**
 * Paints a nest of `w` × `h` mm cells (`material`, and `moisture` per cell, 0-255) at
 * `scale` pixels per mm, its walls standing `lift` pixels tall on screen.
 */
export function paintNest(
  material: Uint8Array,
  moisture: Uint8Array,
  w: number,
  h: number,
  scale: number,
  lift: number,
): NestPictures {
  const W = w * scale;
  const H = h * scale;
  // The cells are a mm across; a carving's edges are smooth curves. Blur the open-or-wall cells a little
  // (a 5 × 5 binomial kernel, about 1 mm wide) so the edge drawn halfway between open and wall is round.
  const raw = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) raw[i] = material[i] === Material.air ? 1 : 0;
  const blurred = blur(blur(raw, w, h, 1, 0), w, h, 0, 1);
  const open = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? blurred[y * w + x]! : 0);
  // How open each pixel is: the open-or-wall cells blended between their middles, so edges are smooth.
  const openness = new Float32Array(W * H);
  const wet = new Float32Array(W * H);
  for (let py = 0; py < H; py++) {
    const fy = (py + 0.5) / scale - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let px = 0; px < W; px++) {
      const fx = (px + 0.5) / scale - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const a = open(x0, y0) * (1 - tx) + open(x0 + 1, y0) * tx;
      const b = open(x0, y0 + 1) * (1 - tx) + open(x0 + 1, y0 + 1) * tx;
      openness[py * W + px] = a * (1 - ty) + b * ty;
      const cx = Math.min(w - 1, Math.max(0, Math.floor((px + 0.5) / scale)));
      const cy = Math.min(h - 1, Math.max(0, Math.floor((py + 0.5) / scale)));
      wet[py * W + px] = Math.min(1, moisture[cy * w + cx]! / 255 / WETTEST);
    }
  }
  /** How much of a pixel is wall, 0-1, with a soft edge a pixel or so wide. */
  const wallAt = (px: number, py: number) => (py < 0 || py >= H ? 0 : 1 - smooth(openness[py * W + px]!));

  const floor = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const k = shade(i, wet[i]!);
    floor[4 * i] = FLOOR[0] * k;
    floor[4 * i + 1] = FLOOR[1] * k;
    floor[4 * i + 2] = FLOOR[2] * k;
    floor[4 * i + 3] = 255; // opaque: the walls are drawn over it, and nothing under the block shows through their edges
  }

  const wallHeight = H + lift;
  const walls = new Uint8ClampedArray(W * wallHeight * 4);
  for (let r = 0; r < wallHeight; r++) {
    for (let px = 0; px < W; px++) {
      const o = 4 * (r * W + px);
      // Row r shows the top of the wall over floor row r, and the faces of the walls up to `lift` rows above it.
      const fr = r - lift;
      const top = wallAt(px, fr + lift);
      // The face copy lifted highest is drawn last: look from the top of the face down to the floor.
      let face = 0;
      let depth = 0;
      for (let k = lift - 1; k >= 0; k--) {
        const f = wallAt(px, fr + k);
        if (f <= 0.01) continue;
        if (face === 0) depth = 1 - k / lift;
        face = Math.max(face, f);
        if (face > 0.99) break;
      }
      const at = Math.min(H - 1, Math.max(0, r)) * W + px;
      if (top > 0) {
        const k = shade(at + 7919, wet[at]!) * (0.94 + 0.12 * jitter(at * 31 + 3));
        mix(walls, o, TOP, k, top, face, depth);
      } else if (face > 0) {
        mix(walls, o, TOP, 0, 0, face, depth);
      }
    }
  }
  return { width: W, floorHeight: H, floor, wallHeight, walls };
}

/** Writes a wall pixel: the top (`top` of it) over a face in shadow (`face` of it, darker deeper down). */
function mix(out: Uint8ClampedArray, o: number, rgb: readonly number[], k: number, top: number, face: number, depth: number): void {
  const f = 0.92 - 0.25 * depth;
  const alpha = Math.max(top, face);
  for (let c = 0; c < 3; c++) {
    const faceColour = FACE[c]! * f;
    const v = top * rgb[c]! * k + (1 - top) * faceColour;
    out[o + c] = alpha > 0 ? v : 0;
  }
  out[o + 3] = 255 * alpha;
}

/** Brightness of ytong at a pixel: darker where wet, with the fine pores' speckle. */
function shade(i: number, wet: number): number {
  return (1 - WET_DARKENING * wet) * (0.9 + 0.1 * jitter(i)) * (jitter(i + 104729) < 0.04 ? 0.82 : 1);
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, (t - 0.35) / 0.3));
  return x * x * (3 - 2 * x);
}

/** A fixed pseudo-random value in [0, 1) per pixel. */
function jitter(i: number): number {
  let x = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x165667b1);
  x ^= x >>> 13;
  return (x >>> 0) / 0x1_0000_0000;
}

/** A 1-4-6-4-1 blur of `field` along (dx, dy); beyond the edges counts as wall (0). */
function blur(field: Float32Array, w: number, h: number, dx: number, dy: number): Float32Array {
  const out = new Float32Array(w * h);
  const kernel = [1, 4, 6, 4, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = x + k * dx;
        const yy = y + k * dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) sum += kernel[k + 2]! * field[yy * w + xx]!;
      }
      out[y * w + x] = sum / 16;
    }
  }
  return out;
}
