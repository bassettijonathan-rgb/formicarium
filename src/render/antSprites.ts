/**
 * Ant textures (DESIGN.md D11): a Lasius niger worker seen from above, drawn
 * by code in a few walking poses. Legs move in an alternating tripod gait:
 * front and hind legs on one side swing with the middle leg on the other.
 *
 * Drawing units: the body runs from about -30 (gaster tip) to +23 (head),
 * heading along +x. `ANT_SCALE` converts units to mm (a ~4.4 mm worker).
 *
 * Crematogaster scutellaris (DESIGN.md 4.4) is drawn on the same frame:
 * a red head on a black body, two waist nodes and a heart-shaped gaster,
 * which a disturbed worker raises over its back. It is drawn smaller
 * (`speciesSize`).
 *
 * Messor barbarus (DESIGN.md 4.4) too: a big, glossy black harvester with a
 * broad square head and strong mandibles, two waist nodes and an oval
 * gaster; drawn bigger.
 */
import { type Renderer, Graphics, Rectangle, type Texture } from 'pixi.js';
import { Species } from '../sim/species';

export const ANT_SCALE = 4.4 / 53;
export const GAIT_FRAMES = 8;
/** Distance walked per full stride, mm (one cycle of the gait). */
export const STRIDE = 2.4;

/** A hardened worker's colours, and a callow's: pale brown for its first days out of the cocoon. */
const DARK = { body: 0x2a1c15, leg: 0x3b2a20, shine: 0x6b5446 };
const PALE = { body: 0x8c6c52, leg: 0x9c7d62, shine: 0xc9ae94 };
type Palette = typeof DARK & { head?: number };
/** Crematogaster scutellaris: a red head on a black body; its callows are pale amber. */
const CREMA = { body: 0x1c1513, leg: 0x3a2620, shine: 0x6e5a52, head: 0x9c3a1e };
const CREMA_PALE = { body: 0x8a6448, leg: 0x9c7458, shine: 0xc9a88c, head: 0xc87a4e };
/** Messor barbarus: glossy black, its head a little browner; callows pale grey-brown. */
const MESSOR = { body: 0x141110, leg: 0x2c221e, shine: 0x7a6c66, head: 0x22140f };
const MESSOR_PALE = { body: 0x7c6a5e, leg: 0x8c7a6c, shine: 0xc4b4a6, head: 0x806452 };
/** A Messor major: the same black body under a big red-brown head (keepers' photos). */
const MESSOR_MAJOR = { ...MESSOR, head: 0x4a1d10 };

/**
 * How long the species' workers are drawn, relative to a Lasius niger worker (~4.4 mm), and its
 * queen relative to its worker. Crematogaster scutellaris workers are 3-5 mm, the queen 8-10 mm (keepers' care sheets; rough).
 * Messor barbarus workers are 3-12 mm and its queen 14-15 mm (AntsDavey care sheet): a worker is drawn at its own length
 * (`workerLength`), one of a tank kept before sizes as a media of about 7 mm.
 */
export function speciesSize(species: number): { worker: number; queen: number } {
  if (species === Species.messor) return { worker: 7 / 4.4, queen: 14.5 / 7 };
  return species === Species.crematogaster ? { worker: 0.85, queen: 2.4 } : { worker: 1, queen: 2 };
}
export const CROP = 0xd9a441;

/** How long worker `size` (tenths of a mm, 0 for the species' standard worker; `Ants.size`) is drawn, relative to a Lasius niger worker. */
export function workerLength(species: number, size: number): number {
  return size > 0 ? size / 10 / 4.4 : speciesSize(species).worker;
}

/** Messor workers this long (mm) or longer are majors, drawn with a big head (sizes.ts). */
export const MAJOR_LENGTH = 8;

/** Leg attachment and resting foot positions (left side, y < 0); the right side mirrors them. */
const LEGS: { base: [number, number]; knee: [number, number]; foot: [number, number] }[] = [
  { base: [8, -2], knee: [14, -10], foot: [21, -14] },
  { base: [4, -2], knee: [4, -12], foot: [0, -19] },
  { base: [0, -2], knee: [-8, -12], foot: [-17, -18] },
];

/**
 * Textures indexed [crop full ? 1 : 0][gait frame]; `pale` draws a callow, `raised` a
 * Crematogaster worker with its gaster raised in alarm, `major` a Messor major.
 */
export function makeAntTextures(renderer: Renderer, pale = false, species: number = Species.lasiusNiger, raised = false, major = false): Texture[][] {
  const crema = species === Species.crematogaster;
  const messor = species === Species.messor;
  const palette = crema ? (pale ? CREMA_PALE : CREMA) : messor ? (pale ? MESSOR_PALE : major ? MESSOR_MAJOR : MESSOR) : pale ? PALE : DARK;
  return [0, 1].map((full) =>
    Array.from({ length: GAIT_FRAMES }, (_, f) => {
      const phase = (f / GAIT_FRAMES) * 2 * Math.PI;
      const g = crema ? drawCrematogaster(phase, full === 1, palette, raised) : messor ? drawMessor(phase, full === 1, palette, major) : drawAnt(phase, full === 1, palette);
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
export function makeDeadTexture(renderer: Renderer, species: number = Species.lasiusNiger): Texture {
  const crema = species === Species.crematogaster;
  const messor = species === Species.messor;
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
  if (crema) heart(g, -9, 17, 9).fill(CREMA.body);
  else g.ellipse(-17, 0, 11, 8).fill(DARK.body);
  g.ellipse(-5, 0, 2.6, 2.6).fill(DARK.body);
  g.ellipse(4, 0, 8, 3.8).fill(DARK.body);
  if (messor) g.roundRect(11, -6.5, 12, 13, 5).fill(MESSOR.head);
  else g.ellipse(16, 0, 6, 5.5).fill(crema ? CREMA.head : DARK.body);
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

/** Legs and antennae, as in `drawAnt`. */
function limbs(g: Graphics, phase: number, leg: number): void {
  const swing = 0.35 * Math.sin(phase);
  for (const side of [-1, 1]) {
    LEGS.forEach((l, k) => {
      const tripodA = (side === -1) === (k !== 1);
      const angle = (tripodA ? swing : -swing) * -side;
      const pts = [l.base, l.knee, l.foot].map(([x, y]) => rotateAbout([x, y * -side], l.base, angle));
      g.moveTo(pts[0]![0], pts[0]![1]).lineTo(pts[1]![0], pts[1]![1]).lineTo(pts[2]![0], pts[2]![1]);
    });
  }
  g.stroke({ color: leg, width: 1.2, cap: 'round', join: 'round' });
  const flick = 1.5 * Math.sin(phase * 2);
  for (const side of [-1, 1]) {
    g.moveTo(21, 2.5 * side)
      .lineTo(26, (9 + flick) * side)
      .lineTo(33, (5 - flick) * side);
  }
  g.stroke({ color: leg, width: 1, cap: 'round', join: 'round' });
}

/**
 * A heart-shaped gaster seen from above: its broad, notched front at `front`, its point `length`
 * behind (or ahead, for a negative length), `half` wide each side.
 */
function heart(g: Graphics, front: number, length: number, half: number): Graphics {
  const tip = front - length;
  const k = Math.sign(length);
  g.moveTo(front - 1.5 * k, 0)
    .bezierCurveTo(front + 1 * k, -half * 0.6, front - 0.2 * length, -half * 1.15, front - 0.45 * length, -half * 0.85)
    .bezierCurveTo(front - 0.7 * length, -half * 0.6, tip + 0.1 * length, -half * 0.2, tip, 0)
    .bezierCurveTo(tip + 0.1 * length, half * 0.2, front - 0.7 * length, half * 0.6, front - 0.45 * length, half * 0.85)
    .bezierCurveTo(front - 0.2 * length, half * 1.15, front + 1 * k, half * 0.6, front - 1.5 * k, 0)
    .closePath();
  return g;
}

/**
 * A Crematogaster scutellaris worker from above: a red, squarish head, a black mesosoma with two
 * short spines, two waist nodes (petiole and postpetiole) and a heart-shaped gaster. Disturbed, it holds the
 * gaster up over its back, pointed forward: from above it lies short over the mesosoma.
 */
function drawCrematogaster(phase: number, full: boolean, { body: BODY, leg: LEG, shine: SHINE, head: HEAD }: Palette, raised: boolean): Graphics {
  const g = new Graphics();
  limbs(g, phase, LEG);
  // Waist: petiole and postpetiole.
  g.ellipse(-3.5, 0, 2.2, 2).fill(BODY);
  g.ellipse(-7, 0, 2.4, 2.6).fill(BODY);
  if (!raised) {
    const half = full ? 10.5 : 9;
    if (full) {
      heart(g, -8.5, 19, half).fill(CROP);
      heart(g, -9.5, 17, half - 1).fill({ color: BODY, alpha: 0.75 });
    } else heart(g, -8.5, 17, half).fill(BODY);
    g.ellipse(-15, -3, 4, 2).fill({ color: SHINE, alpha: 0.45 });
  }
  g.ellipse(4, 0, 7.5, 3.6).fill(BODY);
  // Two short spines at the back of the thorax.
  for (const side of [-1, 1]) g.moveTo(-1, 1.6 * side).lineTo(-4, 3.6 * side);
  g.stroke({ color: BODY, width: 1, cap: 'round' });
  g.roundRect(11.5, -5, 11, 10, 4).fill(HEAD ?? BODY);
  g.ellipse(18, -1.8, 2.4, 1.4).fill({ color: SHINE, alpha: 0.4 });
  g.ellipse(4, -1.2, 3.6, 1.1).fill({ color: SHINE, alpha: 0.4 });
  if (raised) {
    // The gaster tipped up and forward over the mesosoma, foreshortened, its point towards the head.
    heart(g, -6, -11, full ? 8.5 : 7.5).fill(BODY);
    g.ellipse(-2, -2.6, 3, 1.6).fill({ color: SHINE, alpha: 0.5 });
  }
  return g;
}

/**
 * A Messor barbarus worker from above: a broad, square head with strong mandibles, a smooth mesosoma
 * without spines, two waist nodes and a glossy oval gaster. A major's head is wider than its body,
 * its mandibles heavier.
 */
function drawMessor(phase: number, full: boolean, { body: BODY, leg: LEG, shine: SHINE, head: HEAD }: Palette, major = false): Graphics {
  const g = new Graphics();
  limbs(g, phase, LEG);
  // Mandibles: two curved blades closed in front of the head.
  const jaw = major ? 1.3 : 1;
  for (const side of [-1, 1]) g.moveTo(22, 4 * jaw * side).quadraticCurveTo(22 + 5 * jaw, 3.5 * jaw * side, 22 + 4 * jaw, 0.6 * side);
  g.stroke({ color: LEG, width: 1.4 * jaw, cap: 'round' });
  g.ellipse(-3.5, 0, 2.2, 2).fill(BODY);
  g.ellipse(-7, 0, 2.5, 2.6).fill(BODY);
  if (full) {
    g.ellipse(-18, 0, 12, 9.5).fill(CROP);
    g.ellipse(-18, 0, 11, 8.5).fill({ color: BODY, alpha: 0.75 });
  } else g.ellipse(-17.5, 0, 10.5, 8).fill(BODY);
  g.ellipse(4, 0, 7.5, 3.8).fill(BODY);
  if (major) g.roundRect(9.5, -9.5, 14.5, 19, 7).fill(HEAD ?? BODY);
  else g.roundRect(11, -6.5, 12, 13, 5).fill(HEAD ?? BODY);
  // Gloss.
  g.ellipse(-19, -3, 5, 2.2).fill({ color: SHINE, alpha: 0.5 });
  g.ellipse(4, -1.2, 3.8, 1.1).fill({ color: SHINE, alpha: 0.4 });
  g.ellipse(17, major ? -3.6 : -2.4, major ? 4 : 3, major ? 2.2 : 1.6).fill({ color: SHINE, alpha: 0.4 });
  return g;
}

function rotateAbout([x, y]: [number, number], [cx, cy]: [number, number], a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}
