/**
 * The species a colony can be (DESIGN.md 4.4, Marco 2026-10-14): Lasius
 * niger, the first, and the Mediterranean acrobat ant, Crematogaster
 * scutellaris. A species is a set of parameters over the Lasius model:
 * where the papers measured a difference it is here, and everything else
 * (brood times, food, growth) is Lasius niger's.
 *
 * Saved in each world: append-only, never reorder or reuse a value.
 */
import type { AntParams } from './params';

export const Species = {
  lasiusNiger: 0,
  crematogaster: 1,
} as const;
export type SpeciesId = (typeof Species)[keyof typeof Species];

export const SPECIES_NAMES: Record<SpeciesId, string> = {
  [Species.lasiusNiger]: 'Lasius niger',
  [Species.crematogaster]: 'Crematogaster scutellaris',
};

/** The species' differences from the Lasius niger parameters. */
export function speciesParams(species: number): Partial<AntParams> {
  if (species !== Species.crematogaster) return {};
  return {
    // Trails from the hind tibial gland (Gobin & Billen 1994; 2-tridecanol, Scarano et al. 2024) stop
    // being followed after about 20 minutes (Gobin & Billen 1994): the trail one forager lays fades
    // below what an ant notices in about 20 minutes (DESIGN.md 9, test 20).
    trailHalfLife: 5.5 * 60,
    // A disturbed worker raises its gaster and releases alarm pheromone that brings nestmates
    // (Pasteels et al. 1989; Marlier et al. 2004).
    alarm: true,
    // Kept dry and warm, in dead wood (keepers: nest 30-80% humid; AntsDavey: a dry setup). Rough.
    broodHumidity: 0.65,
    broodDryHumidity: 0.4,
  };
}
