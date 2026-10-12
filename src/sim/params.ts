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
  /**
   * A forager out for sugar that comes on prey takes it instead if its
   * feeling for the brood's hunger is at least this (rough).
   */
  preyNeed: number;
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
  /**
   * Extra settling next to brood, times n/(n + `broodDropHalf`) for n brood
   * items within `broodSenseRadius`: workers gather on the brood, so the nest
   * forms round it. Lasius niger brood-tenders form one large, stable cluster
   * (Depickère, Fresneau & Deneubourg 2004); the gain is rough.
   */
  broodRestGain: number;
  /**
   * The queen counts as this many brood items to the ants near her, both for
   * piling and for settling: her eggs are kept round her and her workers
   * gather there (rough).
   */
  queenBroodWeight: number;
  /** How readily the queen settles where there is no brood, relative to a worker (she seeks her brood). */
  queenSettleAlone: number;
  /** How much more colony odour the resting queen leaves than a resting worker (rough). */
  queenOdourGain: number;
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

  // --- Queen and brood (M3b) ---

  /**
   * Temperature in the nest, °C. Fixed until M5 brings the heat mat and a
   * temperature field; development rates scale with it.
   */
  nestTemperature: number;
  /**
   * Below this temperature, °C, brood does not develop. Development speed
   * rises in a straight line above it (the degree-day model used for ant
   * brood by Kipyatkov & Lopatina; rough value for Lasius niger).
   */
  developmentZero: number;
  /**
   * Days each stage takes at 25 °C, on the life clock (rough, from Lasius
   * niger kept at 24-27 °C: eggs hatch after about 2 weeks and the first
   * workers appear 5-6 weeks after laying). Larvae take this long only when
   * fed enough.
   */
  eggDays: number;
  larvaDays: number;
  pupaDays: number;
  /** Protein a larva eats over its whole stage, µL of protein-rich food (rough). */
  larvaFood: number;
  /** A larva begs while it holds less than this fraction of `larvaFood`. */
  larvaBegBelow: number;
  /**
   * Days a larva survives without food; then the nurses that touch it eat it
   * and take its protein back (rough: starved colonies cannibalise brood).
   */
  larvaStarveDays: number;
  /**
   * Brood piling (Deneubourg et al. 1991): a resting or wandering worker
   * touching a brood item picks it up at `broodPickRate` per second times
   * (k/(k+n))², where n is the other brood within `broodSenseRadius` and k is
   * `broodPickHalf`; a carrier puts it down at `broodDropRate` times
   * (n/(k+n))² with k = `broodDropHalf`, or after `broodCarryMax` seconds.
   * Sorting (M4b): when picking up or putting down an item, n counts only
   * brood of the item's own stage within `broodSortRadius` (Deneubourg et
   * al.'s sorting rule), and brood of other stages at `broodOtherWeight`. At
   * 0.1 or more the stages end up in one mixed pile (DESIGN.md 9.6); at 1, with
   * a 5 mm radius, this is M3b's piling, which ignores stages.
   */
  broodPickRate: number;
  broodPickHalf: number;
  broodDropRate: number;
  broodDropHalf: number;
  broodSenseRadius: number;
  broodCarryMax: number;
  broodOtherWeight: number;
  /** How far round a worker sorting brood feels for brood of the same stage, mm: what its antennae reach (rough). */
  broodSortRadius: number;
  /** Chance per second that a worker touching a begging larva feeds it, if it has protein in its crop. */
  nurseRate: number;
  /** Protein food passed to a larva in one feed, µL at most. */
  nurseLoad: number;
  /** Most eggs a well-fed queen lays per day (rough for a young Lasius niger colony). */
  layRate: number;
  /** Protein a queen spends on one egg, µL of protein-rich food (rough). */
  eggCost: number;
  /** Protein a queen starts with in her body (wing muscles and fat), µL, enough for her first eggs. */
  queenReserve: number;
  /** Most protein a queen's body stores, µL (rough): beyond it what she is fed stays in her crop. */
  queenReserveMax: number;
  /** Colony odour a brood item gives off per second, like `odourDeposit` for a resting worker. */
  broodOdour: number;
  /** Scent a hungry larva gives off, per second (field units; only its gradient matters). */
  broodScentDeposit: number;
  /** Half-life of the brood scent, seconds. */
  broodScentHalfLife: number;
  /** How fast the brood scent spreads through the nest, mm² per second (capped by the field update). */
  broodScentDiffusion: number;
  /** Brood scent at which a worker feels the brood's need for protein half as strongly as it can. */
  broodNeedScent: number;
  /** Fraction of a nestmate's feeling for the brood's hunger an ant takes on when they touch. */
  needRelay: number;
  /** Half-life of an ant's feeling for the brood's hunger once nothing renews it, seconds. */
  needHalfLife: number;
  /** Turning towards stronger brood scent by a wandering worker carrying protein, radians per second. */
  nurseTurn: number;
  /** How fast a queen walks, as a fraction of a worker's speed. */
  queenSpeed: number;

  // --- Division of labour (M4) ---

  /**
   * Fat body (Blanchard et al. 2000; Robinson et al. 2009; Bernadou et al.
   * 2020): a worker's foraging threshold is its own θ times its fat over
   * `fatRef`, so lean workers forage and fat ones stay in. Fat is built at
   * `fatGain` per tank day times how full the crop is times what is left to
   * fill, while the ant is in the farm; it is spent at `fatBurn` per tank day,
   * and `fatBurnOut` more while the ant is out of the farm. All rough, chosen
   * so that a worker that stays in with a half-full crop settles at `fatRef`,
   * four days without food take off only a quarter of that (Planckaert et al.
   * 2019's colonies, starved four days, still sent out only a fifth of their
   * workers), and a worker out a tenth of its time runs empty within days.
   */
  fatGain: number;
  fatBurn: number;
  fatBurnOut: number;
  fatRef: number;
  /** False holds every worker's fat where it starts: fixed thresholds, the control for M4. */
  fatDrift: boolean;
  /**
   * Days a newly emerged (callow) worker stays in the nest, pale and soft,
   * before it will go out (rough; callows of Camponotus and Lasius stay
   * inside, Mersch et al. 2013).
   */
  callowDays: number;
  /** Ages of the workers the keeper starts with, tank days: drawn evenly between these (rough). */
  startAgeMin: number;
  startAgeMax: number;

  /**
   * Workers die of old age (M4c). Each worker's lifespan is drawn when it
   * emerges (or, for the keeper's workers, given the age it already has)
   * from a Weibull distribution with this mean, tank days, and shape: the
   * risk of dying rises steeply with age, as in ageing ants. Lasius niger
   * workers live about a year in the lab (Quque et al. 2023; rough); the
   * queen does not die of age in the sim.
   */
  lifespanMean: number;
  lifespanShape: number;
  /**
   * A corpse smells dead only after this long, tank days: workers ignore a
   * fresh corpse until the fatty acids of decay build up on it (Wilson et al.
   * 1958; rough). The cue is a contact cue, felt by the antennae.
   */
  corpseCueDays: number;
  /**
   * Corpse carrying after Deneubourg et al. (1991) and Theraulaz et al.
   * (2002): a worker touching a corpse that smells dead picks it up at
   * `corpsePickRate` per second times (`corpsePickHalf` / (`corpsePickHalf`
   * + n))², and a carrier out of the nest puts it down at
   * `corpseDropSpont` + `corpseDropRate` × (n / (`corpseDropHalf` + n))²
   * per second, for n other corpses within `corpseSenseRadius` mm. Theraulaz
   * et al. measured the spontaneous drop rate, 0.012/s; the others are rough.
   */
  corpsePickRate: number;
  corpsePickHalf: number;
  corpseDropRate: number;
  corpseDropHalf: number;
  corpseDropSpont: number;
  corpseSenseRadius: number;
  /** In the farm a carrier takes its corpse out to the tube; it gives up and drops it after this long, seconds (rough). */
  corpseCarryMax: number;
  /** False makes picking up and dropping ignore other corpses: the control for cemetery formation. */
  corpseClustering: boolean;
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
  preyNeed: 0.3,
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
  broodRestGain: 20,
  queenBroodWeight: 5,
  queenSettleAlone: 0.1,
  queenOdourGain: 20,
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

  nestTemperature: 25,
  developmentZero: 12,
  eggDays: 16,
  larvaDays: 12,
  pupaDays: 14,
  larvaFood: 0.05,
  larvaBegBelow: 0.3,
  larvaStarveDays: 4,
  broodPickRate: 0.2,
  broodPickHalf: 0.5,
  broodDropRate: 1,
  broodDropHalf: 1,
  broodSenseRadius: 5,
  broodOtherWeight: 0,
  broodSortRadius: 2.5,
  broodCarryMax: 120,
  nurseRate: 0.5,
  nurseLoad: 0.01,
  layRate: 10,
  eggCost: 0.005,
  queenReserve: 0.1,
  queenReserveMax: 0.1,
  broodOdour: 1,
  broodScentDeposit: 1,
  broodScentHalfLife: 6 * 3600,
  broodScentDiffusion: 1,
  broodNeedScent: 5,
  needRelay: 0.8,
  needHalfLife: 600,
  nurseTurn: 4,
  queenSpeed: 0.5,

  fatGain: 0.5,
  fatBurn: 0.05,
  fatBurnOut: 3,
  fatRef: 0.8,
  fatDrift: true,
  callowDays: 7,
  startAgeMin: 14,
  startAgeMax: 200,

  lifespanMean: 310,
  lifespanShape: 3,
  corpseCueDays: 1,
  corpsePickRate: 0.2,
  corpsePickHalf: 6,
  corpseDropRate: 1,
  corpseDropHalf: 3,
  corpseDropSpont: 0.012,
  corpseSenseRadius: 5,
  corpseCarryMax: 300,
  corpseClustering: true,
};
