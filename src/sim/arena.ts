/**
 * The arena: the top-view foraging box (DESIGN.md section 3.3).
 *
 * Two grids at 1 mm per cell: `wall` (1 where an ant cannot walk) and
 * `trail` (trail pheromone on the floor). The nest entrance is where the
 * tube meets the arena's left wall.
 */
import { ARENA_SIZE, TUBE } from './tank';

export interface Arena {
  width: number;
  height: number;
  /** 1 where the floor is blocked. The rim of the box is always blocked. */
  wall: Uint8Array;
  /** Trail pheromone per cell (arbitrary units). */
  trail: Float64Array;
  /** Where the tube opens into the arena, mm. */
  entranceX: number;
  entranceY: number;
}

/** Any 1 mm grid that holds trail pheromone: the arena floor or the farm. */
export interface TrailGrid {
  width: number;
  height: number;
  trail: Float64Array;
}

export function createArena(): Arena {
  const width = ARENA_SIZE;
  const height = ARENA_SIZE;
  return {
    width,
    height,
    wall: new Uint8Array(width * height),
    trail: new Float64Array(width * height),
    entranceX: 1.5,
    entranceY: TUBE.arenaY,
  };
}

/** True if an ant cannot stand at (x, y): outside the box or on a wall. */
export function isBlocked(arena: Arena, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= arena.width || y >= arena.height) return true;
  return arena.wall[Math.floor(y) * arena.width + Math.floor(x)] === 1;
}

/**
 * Trail concentration at a point, interpolated between the four nearest
 * cell centres, so an antenna feels a smooth gradient.
 */
export function sampleTrail(arena: TrailGrid, x: number, y: number): number {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  return (
    cellTrail(arena, x0, y0) * (1 - tx) * (1 - ty) +
    cellTrail(arena, x0 + 1, y0) * tx * (1 - ty) +
    cellTrail(arena, x0, y0 + 1) * (1 - tx) * ty +
    cellTrail(arena, x0 + 1, y0 + 1) * tx * ty
  );
}

function cellTrail(arena: TrailGrid, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= arena.width || cy >= arena.height) return 0;
  return arena.trail[cy * arena.width + cx]!;
}

/** Lays `amount` of trail at a point, split over the four nearest cells (the reverse of `sampleTrail`). */
export function depositTrail(arena: TrailGrid, x: number, y: number, amount: number): void {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  addTrail(arena, x0, y0, amount * (1 - tx) * (1 - ty));
  addTrail(arena, x0 + 1, y0, amount * tx * (1 - ty));
  addTrail(arena, x0, y0 + 1, amount * (1 - tx) * ty);
  addTrail(arena, x0 + 1, y0 + 1, amount * tx * ty);
}

function addTrail(arena: TrailGrid, cx: number, cy: number, amount: number): void {
  if (cx < 0 || cy < 0 || cx >= arena.width || cy >= arena.height) return;
  arena.trail[cy * arena.width + cx]! += amount;
}

/** Evaporates trail over `seconds`, given the pheromone's half-life. */
export function evaporateTrail(arena: TrailGrid, seconds: number, halfLife: number): void {
  const keep = Math.pow(0.5, seconds / halfLife);
  const trail = arena.trail;
  for (let i = 0; i < trail.length; i++) {
    const v = trail[i]! * keep;
    // Flush tiny amounts to zero so they never matter and stay cheap.
    trail[i] = v < 1e-6 ? 0 : v;
  }
}

/**
 * Builds walls everywhere except along corridors, for lab experiments such
 * as the double bridge. Each corridor is a polyline of points with a width.
 */
export function carveCorridors(arena: Arena, corridors: { points: [number, number][]; width: number }[]): void {
  arena.wall.fill(1);
  for (const { points, width } of corridors) {
    const r = width / 2;
    for (let s = 0; s + 1 < points.length; s++) {
      const [ax, ay] = points[s]!;
      const [bx, by] = points[s + 1]!;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx) - r));
      const maxX = Math.min(arena.width - 1, Math.ceil(Math.max(ax, bx) + r));
      const minY = Math.max(0, Math.floor(Math.min(ay, by) - r));
      const maxY = Math.min(arena.height - 1, Math.ceil(Math.max(ay, by) + r));
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          if (distanceToSegment(cx + 0.5, cy + 0.5, ax, ay, bx, by) <= r) arena.wall[cy * arena.width + cx] = 0;
        }
      }
    }
  }
}

/** Opens a disc of floor, e.g. a feeding chamber at the end of a corridor. */
export function carveDisc(arena: Arena, x: number, y: number, radius: number): void {
  for (let cy = Math.max(0, Math.floor(y - radius)); cy <= Math.min(arena.height - 1, Math.ceil(y + radius)); cy++) {
    for (let cx = Math.max(0, Math.floor(x - radius)); cx <= Math.min(arena.width - 1, Math.ceil(x + radius)); cx++) {
      if (Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= radius) arena.wall[cy * arena.width + cx] = 0;
    }
  }
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
