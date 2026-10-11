/**
 * Geometry of the tank (DESIGN.md sections 2, 3 and D8).
 *
 * One cell is 1 mm. The farm is a side view: x runs left to right, y runs
 * downward from the lid. The arena is a top view with its own x and y. Both
 * are drawn on screen in millimetres, side by side, joined by the tube.
 */

/** Farm (side view): 30 x 20 cm between two glass panes. */
export const FARM_WIDTH = 300;
export const FARM_HEIGHT = 200;

/** Mean depth of the air gap between the lid and the soil surface, in mm. */
export const HEADSPACE = 30;

/** Arena (top view): 20 x 20 cm. */
export const ARENA_SIZE = 200;

/** Gap between the farm and the arena on screen, in mm. */
export const ARENA_GAP = 60;

/**
 * The tube leaves the farm's right wall in the headspace and enters the
 * arena's left wall halfway down. Inner diameter 8 mm, like the vinyl tubing
 * ant keepers use for small colonies.
 */
export const TUBE = {
  farmY: 14,
  arenaY: ARENA_SIZE / 2,
  diameter: 8,
} as const;
