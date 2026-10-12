/**
 * Food flow (DESIGN.md section 9, test 7). A starved colony that has dug its
 * nest gets a drop of 1 M sucrose in the arena. In Lasius niger a minority
 * of workers forage, and the food reaches most of the colony within an hour
 * by trophallaxis (Planckaert et al. 2019). Without sharing (the control),
 * only the foragers get fed. A well-fed colony barely forages (Greenwald et
 * al. 2018; Mailleux et al. 2006).
 */
import { describe, expect, it } from 'vitest';
import { type FoodSpreadResult, runFoodSpread } from '../../src/sim/experiments';

const SEEDS = [1, 2, 3];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (params: { sharing?: boolean } = {}, satiated = false): FoodSpreadResult[] =>
  SEEDS.map((seed) => runFoodSpread({ seed, ants: 50, minutes: 60, satiated, params }));
const departures = (r: FoodSpreadResult) => r.departuresByMinute.reduce((a, b) => a + b, 0);

describe('food flow', () => {
  let starved: FoodSpreadResult[];

  it(
    'food reaches most of a starved colony within an hour, carried by a minority of foragers',
    () => {
      starved = spread();
      expect(mean(starved.map((r) => r.fedByMinute.at(-1)!))).toBeGreaterThan(0.5);
      expect(mean(starved.map((r) => r.foragers))).toBeLessThan(0.4);
    },
    300_000,
  );

  it(
    'without sharing, only the foragers get fed',
    () => {
      const fedWith = mean(starved.map((r) => r.fedByMinute.at(-1)!));
      const fedWithout = mean(spread({ sharing: false }).map((r) => r.fedByMinute.at(-1)!));
      // Over 10 colonies 29-31% are fed without sharing against 84-91% with it (DESIGN.md 9.3).
      expect(fedWithout).toBeLessThan(fedWith / 2.5);
    },
    300_000,
  );

  it(
    'a well-fed colony sends out far fewer foragers than a starved one',
    () => {
      const fed = mean(spread({}, true).map(departures));
      // About a third over 10 colonies since M4a (DESIGN.md 9.3; seeds 1-3 give 3.3): lean scouts keep
      // going back to the drop. The literature gives no colony-level ratio to hold it to.
      expect(fed).toBeLessThan(mean(starved.map(departures)) / 3);
    },
    300_000,
  );
});
