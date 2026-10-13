/**
 * Geometry of the tank (DESIGN.md sections 2, 3 and D8).
 *
 * One cell is 1 mm. The farm is a side view: x runs left to right, y runs
 * downward from the lid. The arena is a floor seen from above with its own
 * x (left to right) and y (from the back wall toward the keeper); the page
 * draws it at an angle (DESIGN.md A3), joined to the farm by the tube.
 */

/** Farm (side view): 30 x 20 cm between two glass panes. */
export const FARM_WIDTH = 300;
export const FARM_HEIGHT = 200;

/**
 * Mean depth of the air gap between the lid and the soil surface, in mm.
 * Keepers leave a generous gap: the colony piles everything it digs out on top.
 */
export const HEADSPACE = 50;

/** The lab arena (top view) of the validation experiments: 20 x 20 cm. */
export const ARENA_SIZE = 200;

/**
 * The keeper's arena (DESIGN.md A1): 40 x 30 cm of floor with 10 cm walls,
 * a common size for an outworld. The tube enters halfway along its left wall.
 */
export const TANK_ARENA = { width: 400, height: 300, wallHeight: 100 } as const;

/**
 * The tube leaves the farm's right wall in the headspace and enters the
 * arena's left wall halfway along. Inner diameter 8 mm, like the vinyl tubing
 * ant keepers use for small colonies.
 */
export const TUBE = {
  farmY: 20,
  diameter: 8,
} as const;
