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
  /** Plaster or dental stone cast in a mould: porous like ytong, it soaks water up a little faster (Nests 2). */
  plaster: 5,
  /** Clear acrylic layers: holds no water; a sponge in one chamber keeps the air near it humid (Nests 2). */
  acrylic: 6,
  /** A carved wooden board: holds a little water, unevenly (Nests 2). */
  wood: 7,
} as const;

export type Material = (typeof Material)[keyof typeof Material];

export const MATERIAL_COUNT = 8;

export const MATERIAL_NAMES: readonly string[] = ['air', 'sand', 'loam', 'clay', 'ytong', 'plaster', 'acrylic', 'wood'];

/** True for soil an ant can dig: sand, loam and clay, not the hard walls of a bought nest. */
export function diggable(material: number): boolean {
  return material !== Material.air && material < Material.ytong;
}
