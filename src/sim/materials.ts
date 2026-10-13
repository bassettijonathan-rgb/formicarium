/**
 * What a cell of the farm's soil grid holds (DESIGN.md section 3.1).
 *
 * The numbers are stored in saves, so this list is append-only: never reorder
 * or reuse a value. The soils (sand, loam, clay) can be dug; the materials of
 * bought nests, from ytong on, are hard walls ants cannot dig (DESIGN.md 3.5).
 */
export const Material = {
  air: 0,
  sand: 1,
  loam: 2,
  clay: 3,
  /** Aerated concrete, the commonest bought nest: porous, it soaks water up from the nest's water hole. */
  ytong: 4,
} as const;

export type Material = (typeof Material)[keyof typeof Material];

export const MATERIAL_COUNT = 5;

export const MATERIAL_NAMES: readonly string[] = ['air', 'sand', 'loam', 'clay', 'ytong'];

/** True for soil an ant can dig: sand, loam and clay, not the hard walls of a bought nest. */
export function diggable(material: number): boolean {
  return material !== Material.air && material < Material.ytong;
}
