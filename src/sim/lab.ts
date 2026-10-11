/**
 * Lab setups for the validation experiments (DESIGN.md section 9).
 *
 * Each setup builds walls in the arena and places food the way the original
 * experiment did, scaled to our 20 x 20 cm arena. `Tally` counts what an
 * observer would count by watching: ants entering a zone, ants starting to
 * feed at each drop. It only reads the world.
 */
import { AntState } from './ants';
import { carveCorridors, carveDisc } from './arena';
import { type World, placeSugar } from './world';

/** Corridor width, mm: wide enough for two ants to pass, as on the bridges used in the lab. */
const CORRIDOR = 6;

export interface Zone {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The double bridge (Goss et al. 1989; Beckers et al. 1992): the nest reaches
 * a feeding chamber over a bridge that forks into two branches. Both branches
 * leave the fork at the same angle, so an ant cannot tell at the fork which
 * is shorter. With `longRatio` 1 the branches are mirror images.
 */
export function doubleBridge(world: World, longRatio: number): { zones: Zone[]; foodId: number } {
  const y = world.arena.entranceY;
  const upper: [number, number][] = [
    [30, y],
    [42, y - 8],
    [88, y - 8],
    [100, y],
  ];
  // The long branch dips away from the axis; its depth sets the length ratio.
  const shortLength = branchLength(upper);
  const depth = longRatio === 1 ? 8 : 8 + ((longRatio - 1) * shortLength) / 2;
  const lower: [number, number][] = [
    [30, y],
    [42, y + 8],
    [42, y + depth],
    [88, y + depth],
    [88, y + 8],
    [100, y],
  ];
  carveCorridors(world.arena, [
    { points: [[0, y], [30, y]], width: CORRIDOR },
    { points: upper, width: CORRIDOR },
    { points: longRatio === 1 ? mirror(upper, y) : lower, width: CORRIDOR },
    { points: [[100, y], [140, y]], width: CORRIDOR },
  ]);
  carveDisc(world.arena, 155, y, 16);
  const foodId = placeSugar(world, 160, y, 100_000, 1);
  const lowY = longRatio === 1 ? y + 8 : y + depth;
  return {
    foodId,
    zones: [
      { name: 'upper', x0: 60, y0: y - 8 - CORRIDOR, x1: 70, y1: y - 8 + CORRIDOR },
      { name: 'lower', x0: 60, y0: lowY - CORRIDOR, x1: 70, y1: lowY + CORRIDOR },
    ],
  };
}

/**
 * Food choice (Beckers et al. 1990, 1993): a Y-shaped bridge leads to two
 * feeding chambers at the same distance, each with a sugar drop.
 */
export function foodChoice(world: World, concentrationA: number, concentrationB: number): { ids: [number, number] } {
  const y = world.arena.entranceY;
  carveCorridors(world.arena, [
    { points: [[0, y], [40, y]], width: CORRIDOR },
    { points: [[40, y], [100, y - 50]], width: CORRIDOR },
    { points: [[40, y], [100, y + 50]], width: CORRIDOR },
  ]);
  carveDisc(world.arena, 110, y - 55, 13);
  carveDisc(world.arena, 110, y + 55, 13);
  const a = placeSugar(world, 114, y - 57, 100_000, concentrationA);
  const b = placeSugar(world, 114, y + 57, 100_000, concentrationB);
  return { ids: [a, b] };
}

function branchLength(points: [number, number][]): number {
  let length = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    length += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  }
  return length;
}

function mirror(points: [number, number][], axisY: number): [number, number][] {
  return points.map(([x, y]) => [x, 2 * axisY - y]);
}

/** Counts zone entries and feeding visits, like an observer with a clicker. */
export class Tally {
  /** Entries into each zone, indexed like the zones passed in. */
  readonly entries: number[];
  /** Feeding visits per food id. */
  readonly visits = new Map<number, number>();
  /** Ants that left the nest. */
  departures = 0;
  private readonly lastZone: Int8Array;
  private readonly lastState: Uint8Array;

  constructor(
    world: World,
    private readonly zones: Zone[] = [],
  ) {
    this.entries = zones.map(() => 0);
    this.lastZone = new Int8Array(world.ants.count).fill(-1);
    this.lastState = new Uint8Array(world.ants.state);
  }

  /** Call after each step. */
  observe(world: World): void {
    const { ants } = world;
    for (let i = 0; i < ants.count; i++) {
      const state = ants.state[i]!;
      let zone = -1;
      if (state !== AntState.inNest) {
        const x = ants.x[i]!;
        const y = ants.y[i]!;
        zone = this.zones.findIndex((z) => x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1);
      }
      if (zone >= 0 && zone !== this.lastZone[i]) this.entries[zone]!++;
      this.lastZone[i] = zone;
      if (state !== AntState.inNest && this.lastState[i] === AntState.inNest) this.departures++;
      if (state === AntState.feeding && this.lastState[i] !== AntState.feeding) {
        const id = ants.foodId[i]!;
        this.visits.set(id, (this.visits.get(id) ?? 0) + 1);
      }
      this.lastState[i] = state;
    }
  }

  /** Zone entries and visits so far, so a window can be measured as a difference. */
  snapshot(): { entries: number[]; visits: Map<number, number>; departures: number } {
    return { entries: [...this.entries], visits: new Map(this.visits), departures: this.departures };
  }
}
