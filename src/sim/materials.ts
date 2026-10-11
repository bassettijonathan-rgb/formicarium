/**
 * What a cell of the farm's soil grid holds (DESIGN.md section 3.1).
 *
 * The numbers are stored in saves, so this list is append-only: never reorder
 * or reuse a value. Later milestones add food, refuse and corpses.
 */
export const Material = {
  air: 0,
  sand: 1,
  loam: 2,
  clay: 3,
} as const;

export type Material = (typeof Material)[keyof typeof Material];

export const MATERIAL_COUNT = 4;

export const MATERIAL_NAMES: readonly string[] = ['air', 'sand', 'loam', 'clay'];
