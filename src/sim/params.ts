/**
 * Parameters of an ant's behaviour (DESIGN.md sections 4 and 5).
 *
 * Every value here is a property of one ant (how fast it walks, how it turns,
 * how much trail it lays), never of the colony. Values marked "rough" are
 * plausible for Lasius niger but not yet pinned to a measurement; the
 * validation experiments in tests/science/ check that they give the
 * published colony-level results.
 *
 * Params live in the world as plain data so experiments can switch a
 * mechanism off (for example trail laying, as a control).
 */

export interface AntParams {
  /** Walking speed, mm/s. Lasius niger workers walk at roughly 1-2 cm/s at 25 °C (rough). */
  speed: number;
  /** Random turning: standard deviation of heading change per second of walking, radians. */
  wiggle: number;

  /** Distance from the ant's centre to each antenna tip, mm. A 4 mm worker reaches ~2.5 mm ahead. */
  antennaReach: number;
  /** Angle of each antenna either side of the heading, radians. */
  antennaAngle: number;
  /** Below this summed concentration at the two antennae, the ant does not notice a trail. */
  trailThreshold: number;
  /**
   * Turning towards the stronger antenna, radians per second, scaled by (L - R) / (L + R).
   * The ratio form (Weber's law) fitted trail following best in Perna et al. 2012.
   */
  trailTurn: number;

  /** Trail pheromone laid per mm walked by a returning forager on the best food (arbitrary units). */
  trailDeposit: number;
  /** Half-life of trail pheromone on the arena floor, seconds (rough; Lasius trails fade within the hour). */
  trailHalfLife: number;
  /** Switch for control experiments: when false, nobody lays trail. */
  trailLaying: boolean;

  /** Turning towards a goal the ant knows from path integration, radians per second, scaled by sin(angle off goal). */
  goalTurn: number;
  /** Weak pull away from the nest while exploring, radians per second, scaled like goalTurn. */
  outwardTurn: number;
  /**
   * Chance per second of a U-turn when heading directly away from a known goal;
   * scaled by how far the heading points away. U-turns are a key part of path
   * choice in Lasius niger (Beckers et al. 1992).
   */
  uTurnRate: number;
  /** Path integration error: standard deviation of the heading the ant believes it walked, radians per step. */
  piNoise: number;

  /** An ant smells a food drop and walks to it from this far, mm. */
  foodSenseRange: number;
  /** Time to fill the crop at a sugar drop, seconds (rough: about a minute). */
  feedTime: number;
  /** Sugar water taken per visit, µL (rough). */
  cropLoad: number;
  /** Sucrose concentration (mol/L) at which a drop is "half as good" as the best: quality = c / (c + this). */
  qualityHalf: number;

  /** Mean time an ant explores before giving up and heading home, seconds. */
  exploreTime: number;
  /** Radius around the nest entrance within which a homing ant smells the nest, mm. */
  nestScentRange: number;

  /** Minimum rest in the nest after a trip, seconds. */
  restTime: number;
  /** Chance per second that a resting ant leaves the nest on its own. */
  leaveRate: number;
  /** Chance per second that a forager who knows where food is goes back to it. */
  returnToFoodRate: number;
  /**
   * Extra chance per second of leaving, per unit of nest excitement. Successful
   * foragers excite nestmates on return (Lasius niger mass recruitment). Until
   * M3 models the inside of the nest, excitement is one number for the whole
   * nest: a stand-in for contacts in a small, well-mixed chamber.
   */
  recruitRate: number;
  /** Excitement added by a returning forager, scaled by food quality. */
  recruitPerReturn: number;
  /** Half-life of nest excitement, seconds. */
  excitementHalfLife: number;
}

export const DEFAULT_ANT_PARAMS: AntParams = {
  speed: 15,
  wiggle: 1.2,

  antennaReach: 2.5,
  antennaAngle: 0.6,
  trailThreshold: 0.05,
  trailTurn: 6,

  trailDeposit: 1,
  trailHalfLife: 15 * 60,
  trailLaying: true,

  goalTurn: 2,
  outwardTurn: 0.4,
  uTurnRate: 0.5,
  piNoise: 0.15,

  foodSenseRange: 4,
  feedTime: 60,
  cropLoad: 0.2,
  qualityHalf: 0.25,

  exploreTime: 180,
  nestScentRange: 25,

  restTime: 10,
  leaveRate: 1 / 600,
  returnToFoodRate: 1 / 30,
  recruitRate: 0.05,
  recruitPerReturn: 1,
  excitementHalfLife: 60,
};
