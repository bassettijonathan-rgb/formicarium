/**
 * Nest size regulation (DESIGN.md section 9, test 4; Rasse & Deneubourg 2001):
 * a colony digs fast while cramped and slows as the nest gets roomier, so a
 * bigger colony digs a bigger nest. Switching off the crowding cue (the
 * control) lets a small colony keep digging.
 */
import { describe, expect, it } from 'vitest';
import { runNestVolume } from '../../src/sim/experiments';

const HOURS = 6;
const final = (ants: number, crowdControl = true) =>
  runNestVolume({ seed: 1, ants, hours: HOURS, params: { crowdControl } }).areaByHour.at(-1)!;

describe('nest size', () => {
  it(
    'crowding holds a small colony back; without it the colony keeps digging',
    () => {
      expect(final(20)).toBeLessThan(0.6 * final(20, false));
    },
    300_000,
  );

  it(
    'a bigger colony digs a bigger nest',
    () => {
      expect(final(40)).toBeGreaterThan(1.8 * final(20));
    },
    300_000,
  );
});
