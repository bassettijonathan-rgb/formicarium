/**
 * The species a colony can be (DESIGN.md 4.4, Marco 2026-10-14 and
 * 2026-10-15): Lasius niger, the first, the Mediterranean acrobat ant,
 * Crematogaster scutellaris, the harvester ant Messor barbarus and Pheidole
 * pallidula, with minors and big-headed majors. A species is a set of parameters over the Lasius model:
 * where the papers measured a difference it is here, and everything else
 * (brood times, food, growth) is Lasius niger's.
 *
 * Saved in each world: append-only, never reorder or reuse a value.
 */
import type { AntParams } from './params';
import { TANK_ARENA } from './tank';

export const Species = {
  lasiusNiger: 0,
  crematogaster: 1,
  messor: 2,
  pheidole: 3,
} as const;
export type SpeciesId = (typeof Species)[keyof typeof Species];

export const SPECIES_NAMES: Record<SpeciesId, string> = {
  [Species.lasiusNiger]: 'Lasius niger',
  [Species.crematogaster]: 'Crematogaster scutellaris',
  [Species.messor]: 'Messor barbarus',
  [Species.pheidole]: 'Pheidole pallidula',
};

/**
 * The keeper's arena for a colony of `species`: 40 x 30 cm (DESIGN.md A1),
 * and 60 x 40 cm for Messor barbarus, whose long foraging trails want room
 * (Marco, 2026-10-15). Fixed when the tank is set up.
 */
export function arenaFor(species: number): { width: number; height: number; wallHeight: number } {
  return species === Species.messor ? { width: 600, height: 400, wallHeight: TANK_ARENA.wallHeight } : TANK_ARENA;
}

/** The species' differences from the Lasius niger parameters. */
export function speciesParams(species: number): Partial<AntParams> {
  if (species === Species.messor) return MESSOR;
  if (species === Species.pheidole) return PHEIDOLE;
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

/** Messor barbarus (DESIGN.md 4.4): a harvester ant that lives on seeds. */
const MESSOR: Partial<AntParams> = {
  // Trails from the Dufour gland (Heredia & Detrain 2000) mark lasting trunk trails, used even when empty
  // (Detrain et al. 2000). Rough: no lifetime was measured in the lab; an hour, against Lasius niger's 15 minutes.
  trailHalfLife: 60 * 60,
  // Seeds are carried home, stored and cracked (Reyes-López & Fernández-Haeger 2002), and gathered whether or
  // not the colony is hungry: harvesters forage on most days of the season, laying in stores.
  seeds: true,
  seedHoard: 0.5,
  // Minors, medias and majors (Heredia & Detrain 2000), sized at eclosion (sizes.ts).
  polymorph: true,
  // Stores kept in air drier than this; the default, written here so experiments can read Messor's own (rough).
  seedDryHumidity: 0.6,
  // Kept drier than Lasius niger (keepers: nest 40-70% humid, with a damper part for the brood). Rough.
  broodHumidity: 0.7,
  broodDryHumidity: 0.45,
};

/**
 * Pheidole pallidula (DESIGN.md 4.4): minors and big-headed majors. Minors
 * scout, lay trail and swarm to food (a mass recruiter, Beckers et al. 1989);
 * majors lay no trail and go out only when minors back from prey too big to
 * take home invite them, with a higher threshold (Detrain & Pasteels 1991),
 * and cut the prey up where it lies.
 */
const PHEIDOLE: Partial<AntParams> = {
  dimorphic: true,
  // Seeds taken from the arena when the brood wants protein, and cracked by the majors (keepers); not hoarded.
  seeds: true,
  seedHoard: 0,
};
