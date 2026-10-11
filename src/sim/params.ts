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

  // --- In the farm (M2) ---

  /** Two ants closer than this, mm, touch antennae. */
  contactRadius: number;
  /** Time over which an ant averages how often it meets nestmates, seconds. */
  encounterMemory: number;
  /**
   * Excitement an ant gains per second of touching a forager just back with
   * food. Replaces the whole-nest excitement of the lab nest: in the farm,
   * recruitment happens by real contacts.
   */
  recruitPerContact: number;
  /** How long a forager back with food keeps exciting the nestmates it meets, seconds. */
  recruitTime: number;

  /** Turning up (carrying soil out) or down (going home), radians per second, scaled like goalTurn. */
  geotaxis: number;
  /** Turning towards stronger colony odour when going home or staying in, scaled by (L - R) / (L + R). */
  odourTurn: number;
  /** Colony odour a resting ant leaves per second (arbitrary units). */
  odourDeposit: number;
  odourHalfLife: number;
  /** Spread of colony odour through the air, mm²/s. */
  odourDiffusion: number;
  /** Colony odour at which a returning ant knows it is home. */
  homeOdour: number;

  /**
   * Chance per second of picking up a grain at a soil face the antennae touch,
   * for an ant that meets nestmates often. Digging rises with crowding, so a
   * colony digs until it has room and then slows down (Buhl et al. 2004;
   * Rasse & Deneubourg 2001).
   */
  digRate: number;
  /** Encounters per second at which digging runs at half its full rate. */
  crowdHalf: number;
  /** Switch for control experiments: when false, digging ignores crowding. */
  crowdControl: boolean;
  /** How sharply digging rises with how hemmed in the ant is (power of `enclosure`, 0-1). */
  hemmedPower: number;
  /** Width of a worker's body, mm; it widens passages narrower than this. Lasius niger workers are ~1 mm wide. */
  bodyWidth: number;
  /** Extra digging per unit of fresh dig mark nearby (digging attracts digging). */
  digMarkGain: number;
  digMarkHalfLife: number;
  /** Once out in the open, a digger carries its grain at least this far along the surface before dropping it, mm (rough). */
  spoilDistance: number;
  /** After this long carrying, seconds, a digger drops its grain wherever it is. */
  maxCarryTime: number;
  /** Chance per second of dropping a carried grain out in the open. */
  dropRate: number;
  /** How long a digger keeps trying to get back to the face it dug, seconds, before giving up. */
  digReturnTime: number;
  /** Extra dropping per loose grain already lying next to the ant: spoil piles up in heaps. */
  pileGain: number;

  /** Chance per second that a wandering ant settles to rest, in a fully enclosed spot. */
  restRate: number;
  /** Extra settling per unit of colony odour: ants rest where nestmates rest. */
  restOdourGain: number;
  /** Mean length of a rest, seconds. */
  restLength: number;
  /** Time for a forager to walk through the tube, seconds. */
  tubeTime: number;

  // --- Food flow in the farm (M3) ---

  /**
   * Seconds of ant time per tank day on the life clock (D6): development,
   * ageing and metabolism run this much faster than walking. Default 3600:
   * one tank day passes in an hour of play.
   */
  daySeconds: number;
  /**
   * Sugar water (1 M sucrose) an ant burns per tank day, µL (rough: a 1 mg
   * worker's resting metabolism of about 0.5 µL O2 an hour comes to about
   * 0.04 µL of 1 M sucrose a day, a little more when active).
   */
  burnRate: number;
  /** Crop contents of the workers poured into a new tank, as a fraction of a full crop. */
  startCrop: number;
  /** Switch for control experiments: when false, nestmates never share food. */
  sharing: boolean;
  /**
   * Chance per second that a hungry ant begs from a nestmate it touches, per
   * unit of difference in hunger (hunger = empty fraction of the crop).
   */
  begRate: number;
  /** Below this difference in hunger, an ant does not beg. */
  begMargin: number;
  /**
   * Mean length of a trophallaxis, seconds. In Lasius niger the chance of
   * ending an exchange is the same every second, whatever the food
   * (Buffin et al. 2011), so lengths are exponential (rough mean).
   */
  shareTime: number;
  /**
   * Flow during trophallaxis, as a fraction of the receiver's empty crop per
   * second. Exchanges fill a set fraction of the receiver's free space
   * whatever the donor holds (Greenwald et al. 2018, in Camponotus); with
   * `shareTime` this gives about 40% of the free space per exchange (rough).
   */
  shareFlow: number;
  /**
   * Response thresholds for going out to forage (Bonabeau et al. 1996): each
   * worker gets a threshold θ, log-uniform between these. Its propensity to
   * forage is its response to the strongest stimulus, 1 / (1 + θⁿ) with n =
   * `forageSteepness`, and it sets off at `forageRate` times that propensity
   * times its hunger (see `scoutShare`). Low-θ workers become the foragers;
   * high-θ workers stay in and are fed by them. M4 lets θ change with age.
   */
  forageThresholdMin: number;
  forageThresholdMax: number;
  forageSteepness: number;
  /**
   * In the farm, the chance per second that a starving forager (threshold
   * far below its hunger) sets off. Hungry Camponotus foragers set off about
   * every 4 minutes (Greenwald et al. 2018). Replaces `leaveRate`, which
   * stays for the lab nest of the M1 experiments.
   */
  forageRate: number;
  /**
   * Scouting: a worker goes out even when fed, at this fraction of the rate
   * it would if starving; in between, the rate rises in step with hunger.
   * Camponotus foragers' trip rate rose linearly with how empty the colony
   * was, and well-fed ones still made about a fifth as many trips as hungry
   * ones (Greenwald et al. 2018), so a fed colony keeps a few scouts out.
   */
  scoutShare: number;
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

  contactRadius: 3,
  encounterMemory: 30,
  recruitPerContact: 2,
  recruitTime: 30,

  geotaxis: 1.5,
  odourTurn: 4,
  odourDeposit: 1,
  odourHalfLife: 30 * 60,
  odourDiffusion: 1,
  homeOdour: 5,

  digRate: 2,
  crowdHalf: 0.3,
  crowdControl: true,
  hemmedPower: 6,
  bodyWidth: 1.5,
  digMarkGain: 3,
  digMarkHalfLife: 10 * 60,
  spoilDistance: 20,
  maxCarryTime: 120,
  dropRate: 0.5,
  digReturnTime: 60,
  pileGain: 0.5,

  restRate: 0.05,
  restOdourGain: 0.5,
  restLength: 60,
  tubeTime: 7,

  daySeconds: 3600,
  burnRate: 0.05,
  startCrop: 0.3,
  sharing: true,
  begRate: 0.5,
  begMargin: 0.2,
  shareTime: 30,
  shareFlow: 0.02,
  forageThresholdMin: 1,
  forageThresholdMax: 20,
  forageSteepness: 4,
  forageRate: 1 / 240,
  scoutShare: 0.2,
};
