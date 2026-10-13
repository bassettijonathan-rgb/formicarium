/**
 * The angled view of the arena (DESIGN.md A3): a pinhole camera looking down
 * at the desk. The simulation's arena is a flat floor in mm (x across, y from
 * the back wall toward you); this maps floor points, and points `h` mm above
 * the floor, to the scene, and scene points back to the floor for taps.
 *
 * Pure maths, so it can be tested without a browser.
 */

/** How far the camera is from the middle of the arena, mm: far enough for a gentle perspective. */
const CAMERA_DISTANCE = 1300;

export interface Projection {
  /** Degrees above the desk the camera looks down from (90 is straight down). */
  readonly tilt: number;
  /** Scene position of the floor point (u, v) lifted `h` mm, and the scene mm per arena mm there. */
  toScene(u: number, v: number, h?: number): { x: number; y: number; k: number };
  /** The floor point under a scene point (the inverse of `toScene` at h = 0). */
  toFloor(x: number, y: number): { u: number; v: number };
  /** How much a small thing lying on the floor at (u, v) is stretched across (`sx`) and in depth (`sy`) on screen. */
  stretch(u: number, v: number): { sx: number; sy: number };
  /** Where lines on the floor running away from the viewer meet (y is -Infinity when looking straight down). */
  readonly vanishingPoint: { x: number; y: number };
}

export interface ProjectionOptions {
  tilt: number;
  /** The arena's floor, mm. */
  width: number;
  height: number;
  /** Where the middle of the floor's front edge goes in the scene, and the scene mm per arena mm in the middle of the floor. */
  frontX: number;
  frontY: number;
  scale: number;
}

export function makeProjection(o: ProjectionOptions): Projection {
  const th = (o.tilt * Math.PI) / 180;
  const st = Math.sin(th);
  const ct = Math.cos(th);
  const R = CAMERA_DISTANCE;
  const S = o.scale;
  // Camera space: x across, z toward the viewer from the floor's middle, h up.
  const raw = (u: number, v: number, h: number) => {
    const x = u - o.width / 2;
    const z = v - o.height / 2;
    const depth = R - h * st - z * ct;
    return { X: (R * x) / depth, Y: (R * (z * st - h * ct)) / depth, depth };
  };
  const front = raw(o.width / 2, o.height, 0);
  const ax = o.frontX - S * front.X;
  const ay = o.frontY - S * front.Y;
  return {
    tilt: o.tilt,
    vanishingPoint: { x: ax, y: ct > 1e-9 ? ay - (S * R * st) / ct : -Infinity },
    toScene(u, v, h = 0) {
      const p = raw(u, v, h);
      return { x: ax + S * p.X, y: ay + S * p.Y, k: (S * R) / p.depth };
    },
    toFloor(x, y) {
      const X = (x - ax) / S;
      const Y = (y - ay) / S;
      const z = (Y * R) / (R * st + Y * ct);
      return { u: (X * (R - z * ct)) / R + o.width / 2, v: z + o.height / 2 };
    },
    stretch(u, v) {
      const depth = R - (v - o.height / 2) * ct;
      return { sx: (S * R) / depth, sy: (S * R * R * st) / (depth * depth) };
    },
  };
}
