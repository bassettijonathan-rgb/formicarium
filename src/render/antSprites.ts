/**
 * Ant textures (DESIGN.md D11): a Lasius niger worker seen from above, drawn
 * by code in a few walking poses. Legs move in an alternating tripod gait:
 * front and hind legs on one side swing with the middle leg on the other.
 *
 * Drawing units: the body runs from about -30 (gaster tip) to +23 (head),
 * heading along +x. `ANT_SCALE` converts units to mm (a ~4.4 mm worker).
 */
import { type Renderer, Graphics, Rectangle, type Texture } from 'pixi.js';

export const ANT_SCALE = 4.4 / 53;
export const GAIT_FRAMES = 8;
/** Distance walked per full stride, mm (one cycle of the gait). */
export const STRIDE = 2.4;

/** A hardened worker's colours, and a callow's: pale brown for its first days out of the cocoon. */
const DARK = { body: 0x2a1c15, leg: 0x3b2a20, shine: 0x6b5446 };
const PALE = { body: 0x8c6c52, leg: 0x9c7d62, shine: 0xc9ae94 };
type Palette = typeof DARK;
export const CROP = 0xd9a441;

/** Leg attachment and resting foot positions (left side, y < 0); the right side mirrors them. */
const LEGS: { base: [number, number]; knee: [number, number]; foot: [number, number] }[] = [
  { base: [8, -2], knee: [14, -10], foot: [21, -14] },
  { base: [4, -2], knee: [4, -12], foot: [0, -19] },
  { base: [0, -2], knee: [-8, -12], foot: [-17, -18] },
];

/** Textures indexed [crop full ? 1 : 0][gait frame]; `pale` draws a callow. */
export function makeAntTextures(renderer: Renderer, pale = false): Texture[][] {
  return [0, 1].map((full) =>
    Array.from({ length: GAIT_FRAMES }, (_, f) => {
      const g = drawAnt((f / GAIT_FRAMES) * 2 * Math.PI, full === 1, pale ? PALE : DARK);
      const texture = renderer.generateTexture({ target: g, frame: new Rectangle(-40, -26, 80, 52), resolution: 4 });
      g.destroy();
      return texture;
    }),
  );
}

/**
 * A dead worker: legs and antennae drawn in tight under the body, as a dead
 * ant's curl, and the gloss gone dull.
 */
export function makeDeadTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  for (const side of [-1, 1]) {
    LEGS.forEach((leg) => {
      const [bx, by] = leg.base;
      g.moveTo(bx, by * -side)
        .lineTo(bx + 2, (by - 6) * -side)
        .lineTo(bx - 3, (by - 4) * -side);
    });
    g.moveTo(21, 2.5 * side).lineTo(24, 6 * side).lineTo(20, 7 * side);
  }
  g.stroke({ color: DARK.leg, width: 1.3, cap: 'round', join: 'round' });
  g.ellipse(-17, 0, 11, 8).fill(DARK.body);
  g.ellipse(-5, 0, 2.6, 2.6).fill(DARK.body);
  g.ellipse(4, 0, 8, 3.8).fill(DARK.body);
  g.ellipse(16, 0, 6, 5.5).fill(DARK.body);
  g.ellipse(-18, -2, 5, 2).fill({ color: DARK.shine, alpha: 0.15 });
  const texture = renderer.generateTexture({ target: g, frame: new Rectangle(-40, -26, 80, 52), resolution: 4 });
  g.destroy();
  return texture;
}

function drawAnt(phase: number, full: boolean, { body: BODY, leg: LEG, shine: SHINE }: Palette): Graphics {
  const g = new Graphics();
  // Legs: tripod A = left front, right middle, left hind; tripod B the others.
  const swing = 0.35 * Math.sin(phase);
  for (const side of [-1, 1]) {
    LEGS.forEach((leg, k) => {
      const tripodA = (side === -1) === (k !== 1);
      const angle = (tripodA ? swing : -swing) * -side;
      const pts = [leg.base, leg.knee, leg.foot].map(([x, y]) => rotateAbout([x, y * -side], leg.base, angle));
      g.moveTo(pts[0]![0], pts[0]![1]).lineTo(pts[1]![0], pts[1]![1]).lineTo(pts[2]![0], pts[2]![1]);
    });
  }
  g.stroke({ color: LEG, width: 1.3, cap: 'round', join: 'round' });

  // Elbowed antennae: a long scape, then the funiculus bending forward, flicking with the gait.
  const flick = 1.5 * Math.sin(phase * 2);
  for (const side of [-1, 1]) {
    g.moveTo(21, 2.5 * side)
      .lineTo(27, (9 + flick) * side)
      .lineTo(35, (5 - flick) * side);
  }
  g.stroke({ color: LEG, width: 1.1, cap: 'round', join: 'round' });

  // Body: gaster, petiole (the waist), mesosoma (thorax), head.
  const [rx, ry] = full ? [13.5, 10.5] : [12, 9];
  if (full) {
    // A full crop stretches the gaster until the pale membranes between its plates show.
    g.ellipse(-19, 0, rx, ry).fill(CROP);
    g.ellipse(-19, 0, rx - 1, ry - 1).fill({ color: BODY, alpha: 0.75 });
    for (const x of [-24, -18, -12]) g.rect(x, -ry + 1, 1.2, 2 * ry - 2).fill({ color: CROP, alpha: 0.8 });
  } else {
    g.ellipse(-18, 0, rx, ry).fill(BODY);
  }
  g.ellipse(-5, 0, 2.6, 2.6).fill(BODY);
  g.ellipse(4, 0, 8, 3.8).fill(BODY);
  g.ellipse(17, 0, 6, 5.5).fill(BODY);
  // Highlights so the body reads as round and glossy.
  g.ellipse(-20, -3, 5, 2.4).fill({ color: SHINE, alpha: 0.45 });
  g.ellipse(4, -1.2, 4, 1.2).fill({ color: SHINE, alpha: 0.4 });
  g.ellipse(18, -1.8, 2.6, 1.6).fill({ color: SHINE, alpha: 0.4 });
  return g;
}

function rotateAbout([x, y]: [number, number], [cx, cy]: [number, number], a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}
