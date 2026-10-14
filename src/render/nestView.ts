/**
 * The bought nests lying flat on the desk (DESIGN.md 3.5, N3, N8), with the
 * tubes between them, seen from the front and above at the arena's angle,
 * or straight from above. The view is
 * a parallel projection of the table: a point (u, v) on the floor,
 * lifted h mm, goes to (x0 + S u, y0 + S (v sin t - h cos t)) in the scene.
 * That is the same squash everywhere, so the floor, the brood, the mould and
 * the ants are drawn in a container that maps the nest's mm straight onto
 * the desk, and the walls are a picture over them, so a wall hides the ants
 * behind it.
 */
import { Container, Graphics, Matrix, Sprite, Texture } from 'pixi.js';
import { type NestMaterial, TEST_TUBE } from '../sim/nest';
import type { NestShape, TableShape } from '../worker/protocol';
import { TUBE_WIDTH, pointAlong, tubeLength } from '../sim/table';
import { paintNest } from './nestPaint';

/** Where the table's modules and tubes end on the desk, to the right and in front, in scene mm, and scene mm per table mm. */
export const NEST_VIEW = { right: 345, front: 390, scale: 1.05 } as const;
/** Pixels per mm of the block's pictures. */
const PX = 4;

export class NestView {
  readonly root = new Container();
  /** The table's floor, in table mm: what lies and walks on it goes in here, between the floors and the walls. */
  readonly floor = new Container();
  private readonly desk = new Graphics();
  private readonly floors = new Container();
  /** The tubes' insides, under the ants in them, and their clear walls and cotton plugs, over them. */
  private readonly tubeBeds = new Graphics();
  private readonly tubeGlass = new Graphics();
  private readonly walls = new Container();
  private readonly front = new Graphics();
  private readonly lid = new Graphics();
  /** The covers over the lids, tinted, where the keeper has not lifted them (N7). */
  private readonly cover = new Graphics();
  /** The keeper's marks over the table: a nest being placed, and the nests it can be joined to (U5). */
  private readonly marks = new Graphics();
  /** Where things lie on the floor: under the ants and brood, over the floor picture. */
  readonly below = new Container();
  /** Keeps what is drawn on the floor (the warmth or damp reading) to the chambers and tubes. */
  private readonly belowMask = new Graphics();
  /** The brood, the ants and what lies about, added by the tank view. */
  readonly above = new Container();
  private tilt = 40;
  private table: TableShape | undefined;
  private width = 0;
  private height = 0;
  private material: Uint8Array | undefined;
  private moisture: Uint8Array | undefined;
  private mat: { x: number; width: number } | null = null;
  private lit: { module: number; from: number; to: number }[] | null = null;
  /** The table point drawn at the view's anchor (`NEST_VIEW.right`, `front`): the right and front of what lies on it. */
  private anchor = { u: 0, v: 0 };

  constructor() {
    this.floor.addChild(this.desk, this.floors, this.tubeBeds, this.below, this.belowMask, this.above, this.tubeGlass, this.walls, this.front, this.lid, this.cover, this.marks);
    this.below.mask = this.belowMask;
    this.root.addChild(this.floor);
  }

  /** What lies on the table: its modules, tubes and the arena's port. */
  get shape(): TableShape | undefined {
    return this.table;
  }

  /** True while the nest is seen at an angle. */
  get angled(): boolean {
    return this.tilt !== 90;
  }

  set angled(on: boolean) {
    this.tilt = on ? 40 : 90;
    this.layout();
  }

  /** Redraws the table from the farm's layers (they change only when the keeper changes the table). */
  setTable(table: TableShape, width: number, height: number, material: Uint8Array, moisture: Uint8Array): void {
    this.table = table;
    this.width = width;
    this.height = height;
    this.material = material;
    this.moisture = moisture;
    let u = 0;
    let v = 0;
    for (const m of table.modules) {
      u = Math.max(u, m.x + m.width);
      v = Math.max(v, m.y + m.height);
    }
    for (const t of table.tubes) {
      for (let k = 0; k < t.path.length; k += 2) {
        u = Math.max(u, t.path[k]! + TUBE_WIDTH);
        v = Math.max(v, t.path[k + 1]! + TUBE_WIDTH);
      }
    }
    this.anchor = { u, v };
    this.layout();
  }

  /** The heat mat under the nest, or none. */
  setMat(mat: { x: number; width: number } | null): void {
    const same = mat === this.mat || (mat && this.mat && mat.x === this.mat.x && mat.width === this.mat.width);
    if (same) return;
    this.mat = mat;
    this.drawDesk();
  }

  /** Where each module's cover is lifted (mm across it), or null. */
  setCover(lit: { module: number; from: number; to: number }[] | null): void {
    if (JSON.stringify(lit) === JSON.stringify(this.lit)) return;
    this.lit = lit;
    this.drawCover();
  }

  /**
   * Draws a nest being placed (`ghost`, its corner and size in table mm, green
   * where it fits) and rings round the modules it can be joined to, the chosen
   * ones solid, and, while placing, the stretch of table a nest can go on
   * (`room`); nothing when all are empty.
   */
  setMarks(
    ghost: { x: number; y: number; width: number; height: number; ok: boolean } | null,
    targets: { id: number; chosen: boolean }[],
    room: { width: number; height: number } | null = null,
  ): void {
    const g = this.marks.clear();
    const px = 1 / NEST_VIEW.scale;
    if (room) g.rect(0, 0, room.width, room.height).fill({ color: 0xffffff, alpha: 0.07 }).stroke({ width: 1.5 * px, color: 0xffffff, alpha: 0.35 });
    if (ghost) {
      const colour = ghost.ok ? 0x5fb57a : 0xd8644f;
      g.rect(ghost.x, ghost.y, ghost.width, ghost.height).fill({ color: colour, alpha: 0.3 }).stroke({ width: 2.5 * px, color: colour });
    }
    for (const t of targets) {
      const m = this.table?.modules.find((n) => n.id === t.id);
      if (!m) continue;
      g.roundRect(m.x - 4, m.y - 4, m.width + 8, m.height + 8, 4).stroke({ width: (t.chosen ? 4 : 2) * px, color: t.chosen ? 0xe8a83c : 0xffffff, alpha: t.chosen ? 1 : 0.8 });
    }
  }

  /** Scene point of the table point (u, v) lifted h mm. */
  toScene(u: number, v: number, h = 0): { x: number; y: number } {
    const t = (this.tilt * Math.PI) / 180;
    const S = NEST_VIEW.scale;
    const x0 = NEST_VIEW.right - S * this.anchor.u;
    const y0 = NEST_VIEW.front - S * this.anchor.v * Math.sin(t);
    return { x: x0 + S * u, y: y0 + S * (v * Math.sin(t) - h * Math.cos(t)) };
  }

  /** The point of the floor under a scene point. */
  toFloor(x: number, y: number): { u: number; v: number } {
    const t = (this.tilt * Math.PI) / 180;
    const S = NEST_VIEW.scale;
    const o = this.toScene(0, 0, this.floorHeight);
    return { u: (x - o.x) / S, v: (y - o.y) / (S * Math.sin(t)) };
  }

  /** The scene point of the floor point (u, v), for the ants' marker. */
  floorToScene(u: number, v: number): { x: number; y: number } {
    return this.toScene(u, v, this.floorHeight);
  }

  /** The module whose block covers the scene point (x, y), or undefined. */
  moduleAt(x: number, y: number): NestShape | undefined {
    const p = this.toFloor(x, y);
    return this.table?.modules.find((m) => p.u >= m.x && p.u < m.x + m.width && p.v >= m.y - this.lift(this.depth) && p.v < m.y + m.height);
  }

  /** The table's floor mapped onto the scene, for the containers that draw on it. */
  private floorMatrix(): Matrix {
    const t = (this.tilt * Math.PI) / 180;
    const S = NEST_VIEW.scale;
    const o = this.toScene(0, 0, this.floorHeight);
    return new Matrix(S, 0, 0, S * Math.sin(t), o.x, o.y);
  }

  /** Height of the chambers' floor above the desk, mm (the same in every module). */
  private get floorHeight(): number {
    const m = this.table?.modules[0];
    return m ? m.thickness - m.depth : 0;
  }

  /** Depth of the chambers, mm. */
  private get depth(): number {
    return this.table?.modules[0]?.depth ?? 0;
  }

  /** How far up the screen, in floor mm, a thing `h` mm above the floor shows. */
  private lift(h: number): number {
    const t = (this.tilt * Math.PI) / 180;
    return (h * Math.cos(t)) / Math.sin(t);
  }

  /** The scene rectangle the modules and tubes cover. */
  get bounds(): { x: number; y: number; width: number; height: number } {
    let u0 = this.anchor.u;
    let v0 = this.anchor.v;
    for (const m of this.table?.modules ?? []) {
      u0 = Math.min(u0, m.x);
      v0 = Math.min(v0, m.y);
    }
    const a = this.toScene(u0, v0, this.table?.modules[0]?.thickness ?? 0);
    const b = this.toScene(this.anchor.u, this.anchor.v, 0);
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  }

  /** Where the arena's tube leaves the table: the port it is plugged into, in the scene. */
  get port(): { x: number; y: number } {
    const t = this.table;
    const m = t?.modules.find((n) => n.id === t.arena.module);
    const p = m?.ports[t!.arena.port];
    return m && p ? this.toScene(p.x + 1.5 * p.dx, p.y + 1.5 * p.dy, this.floorHeight + m.depth / 2) : { x: 0, y: 0 };
  }

  private layout(): void {
    const t = this.table;
    if (!t || !this.material || !this.moisture) return;
    this.floor.setFromMatrix(this.floorMatrix());
    const lift = Math.round(this.lift(this.depth) * PX);
    for (const c of this.floors.removeChildren()) c.destroy({ texture: true, textureSource: true });
    for (const c of this.walls.removeChildren()) c.destroy({ texture: true, textureSource: true });
    for (const m of t.modules) {
      if (m.kind === 'tube') {
        this.floors.addChild(testTubeFloor(m));
        continue;
      }
      const cells = (layer: Uint8Array) => crop(layer, this.width, m.x, m.y, m.width, m.height);
      const p = paintNest(cells(this.material), cells(this.moisture), m.width, m.height, PX, lift, m.material);
      const floor = new Sprite(canvasTexture(p.width, p.floorHeight, p.floor));
      floor.scale.set(1 / PX);
      floor.position.set(m.x, m.y);
      const walls = new Sprite(canvasTexture(p.width, p.wallHeight, p.walls));
      walls.scale.set(1 / PX);
      walls.position.set(m.x, m.y - lift / PX);
      this.floors.addChild(floor);
      this.walls.addChild(walls);
    }
    const mask = this.belowMask.clear();
    for (const m of t.modules) mask.rect(m.x, m.y, m.width, m.height).fill(0xffffff);
    for (const tube of t.tubes) tubePath(mask, tube.path).stroke({ color: 0xffffff, width: TUBE_WIDTH });
    this.drawDesk();
    this.drawBlocks();
    this.drawTubes();
    this.drawCover();
  }

  /** The heat mat and the blocks' and tubes' shadows, on the desk under the floor. */
  private drawDesk(): void {
    const g = this.desk.clear();
    const t = this.table;
    if (!t) return;
    const down = this.lift(-this.floorHeight); // the desk, in floor mm (negative lift: lower on screen)
    if (this.mat) {
      // A silicone mat longer than the table is deep, its heating wire showing as faint lines.
      const { x, width } = this.mat;
      g.roundRect(x, -down - 12, width, this.anchor.v + 30, 2).fill(0x8a3b22);
      for (let wx = x + 4; wx < x + width - 2; wx += 6) g.rect(wx, -down - 10, 0.8, this.anchor.v + 26).fill({ color: 0xd9824f, alpha: 0.6 });
    }
    for (const m of t.modules) {
      for (const [d, alpha] of [
        [10, 0.07],
        [6, 0.09],
        [3, 0.12],
      ] as const) g.rect(m.x + d / 2, m.y - down + d, m.width + d / 2, m.height).fill({ color: 0x1a0f08, alpha });
    }
    for (const tube of t.tubes) {
      const shadow = tube.path.map((c, k) => (k % 2 ? c - down + 3 : c + 1.5));
      tubePath(g, shadow).stroke({ color: 0x1a0f08, alpha: 0.1, width: TUBE_WIDTH + 3, join: 'round' });
    }
  }

  /** Each block's front face, its water hole (or sponge), its glass lid, and caps on the ports nothing is plugged into. */
  private drawBlocks(): void {
    const t = this.table!;
    const f = this.front.clear();
    const lid = this.lid.clear();
    for (const s of t.modules) {
      if (s.kind === 'tube') {
        this.drawTestTube(s);
        continue;
      }
      const top = this.lift(s.depth); // the block's top, above the floor
      const desk = this.lift(-this.floorHeight);
      const face = FRONT[s.material];
      const x = s.x;
      const bottom = s.y + s.height;
      // The front face, a little darker toward the desk; clear acrylic shows its layers as lines.
      f.rect(x, bottom - top, s.width, top - desk).fill({ color: face.colour, alpha: face.alpha });
      f.rect(x, bottom - desk - 3, s.width, 3).fill({ color: face.edge, alpha: 0.6 });
      f.rect(x, bottom - top, s.width, 0.8).fill({ color: 0xffffff, alpha: 0.35 });
      if (s.material === 'acrylic') {
        for (const z of [s.depth, 0, -(this.floorHeight / 2)]) f.rect(x, bottom - this.lift(z), s.width, 0.5).fill({ color: 0xffffff, alpha: 0.45 });
        // A yellow sponge on the chamber floor, wet and darker at its middle.
        const r = s.waterRadius;
        f.roundRect(s.waterX - r, s.waterY - r - this.lift(1.5), 2 * r, 2 * r, 1.5).fill(0xd9b43a);
        f.roundRect(s.waterX - r + 1.2, s.waterY - r + 1.2 - this.lift(1.5), 2 * r - 2.4, 2 * r - 2.4, 1).fill({ color: 0xa8842a, alpha: 0.6 });
        for (let k = 0; k < 9; k++) f.circle(s.waterX - r + 1.5 + ((k * 3.7) % (2 * r - 3)), s.waterY - r + 1.5 + ((k * 5.3) % (2 * r - 3)) - this.lift(1.5), 0.5).fill({ color: 0x6e5418, alpha: 0.7 });
      } else {
        // The water hole in the top, its water a few mm down.
        const water = this.lift(s.depth - 6);
        f.circle(s.waterX, s.waterY - top, s.waterRadius).fill(face.hole);
        f.circle(s.waterX, s.waterY - water, s.waterRadius - 1.5).fill(0x3d6f99);
        f.circle(s.waterX - 2.5, s.waterY - water - 2.5, 2.2).fill({ color: 0xffffff, alpha: 0.35 });
      }
      // Ports with nothing in them are closed with a white cap.
      s.ports.forEach((p, k) => {
        const used = (e: { module: number; port: number }) => e.module === s.id && e.port === k;
        if (used(t.arena) || t.tubes.some((tube) => used(tube.a) || used(tube.b))) return;
        const h = this.lift(s.depth / 2);
        f.roundRect(p.x + 1.5, p.y - h - 2.5, 2.5, 5, 0.8).fill(0xe8e6e0);
        f.roundRect(p.x + 1.5, p.y - h - 2.5, 2.5, 5, 0.8).stroke({ color: 0x8f8a80, width: 0.4 });
      });
      // The glass lid on the top: a faint sheen and two reflections.
      const z = this.lift(s.depth + 0.5);
      const w = s.width;
      const y = s.y - z;
      lid.rect(x, y, w, s.height).fill({ color: 0xcfe3ef, alpha: 0.06 });
      lid.poly([x + w * 0.15, y, x + w * 0.45, y, x + w * 0.2, y + s.height, x, y + s.height, x, y + s.height * 0.7]).fill({ color: 0xffffff, alpha: 0.05 });
      lid.rect(x, y, w, s.height).stroke({ color: 0xe9f1f7, alpha: 0.4, width: 0.8 });
    }
  }

  /**
   * A test tube lying in a wooden stand: its glass seen from above, the
   * water in its closed end behind the cotton plug, and the stand's front.
   */
  private drawTestTube(s: NestShape): void {
    const f = this.front;
    const lid = this.lid;
    const { glass, water, cotton } = TEST_TUBE;
    const desk = this.lift(-this.floorHeight);
    const r = s.height / 2;
    const top = this.lift(s.depth); // the glass's top, above the floor
    // The stand: a strip of wood under the tube, its front face down to the desk.
    f.rect(s.x - 4, s.y + s.height - this.lift(2), s.width + 8, this.lift(2) - desk).fill(0x9a6a40);
    f.rect(s.x - 4, s.y + s.height - desk - 2, s.width + 8, 2).fill({ color: 0x5e3b20, alpha: 0.7 });
    // The water and the cotton, seen through the glass.
    f.roundRect(s.x + 1, s.y + glass - top / 2, water - 1, s.height - 2 * glass, 3).fill({ color: 0x3d6f99, alpha: 0.75 });
    f.rect(s.x + 6, s.y + glass + 1.5 - top / 2, water - 10, 1.2).fill({ color: 0xffffff, alpha: 0.35 });
    for (let k = 0; k < 7; k++) {
      f.circle(s.x + water + 1.5 + ((k * 4.3) % (cotton - 2)), s.y + glass + 2 + ((k * 5.1) % (s.height - 2 * glass - 3)) - top / 2, 3).fill({ color: 0xf4f1ea, alpha: 0.97 });
    }
    // The glass: rounded at the closed end, open at the mouth; a sheen along its top.
    const y = s.y - top;
    lid.roundRect(s.x, y, s.width, s.height + top, r).fill({ color: 0xcfe3ef, alpha: 0.08 });
    lid.roundRect(s.x, y, s.width, s.height + top, r).stroke({ color: 0xe9f1f7, alpha: 0.55, width: 0.7 });
    lid.rect(s.x + r, y + 2.2, s.width - r - 3, 1.4).fill({ color: 0xffffff, alpha: 0.4 });
    lid.ellipse(s.x + s.width - 0.6, s.y + s.height / 2 - top / 2, 1.2, (s.height + top) / 2).stroke({ color: 0xe9f1f7, alpha: 0.6, width: 0.6 });
  }

  /** The tubes: clear vinyl, the floor of the channel faintly shaded under the ants, a sheen over them, and the cotton plugs. */
  private drawTubes(): void {
    const t = this.table!;
    const bed = this.tubeBeds.clear();
    const glass = this.tubeGlass.clear();
    const up = this.lift(TUBE_WIDTH / 2);
    for (const tube of t.tubes) {
      tubePath(bed, tube.path).stroke({ color: 0x6f7a80, alpha: 0.35, width: TUBE_WIDTH, join: 'round' });
      tubePath(glass, tube.path).stroke({ color: 0xbfd4e6, alpha: 0.35, width: TUBE_WIDTH + 1.6, join: 'round' });
      tubePath(glass, tube.path).stroke({ color: 0x15171a, alpha: 0.05, width: TUBE_WIDTH - 0.6, join: 'round' });
      const sheen = tube.path.map((c, k) => (k % 2 ? c - up : c));
      tubePath(glass, sheen).stroke({ color: 0xffffff, alpha: 0.22, width: 1.2, join: 'round' });
      if (tube.plugged) {
        const mid = pointAlong(tube.path, tubeLength(tube.path) / 2);
        for (const [dx, dy, r] of [
          [-2.2, 0.4, 3.4],
          [2, -0.5, 3.6],
          [0, 0.6, 3.3],
        ] as const) glass.circle(mid.x + dx, mid.y + dy - up / 2, r).fill({ color: 0xf4f1ea, alpha: 0.95 });
        glass.circle(mid.x, mid.y - up / 2, 4.2).stroke({ color: 0xb9b4a8, alpha: 0.6, width: 0.4 });
      }
    }
  }

  /** The covers on the lids, where they are not lifted: tinted, so the keeper still sees in (N7). */
  private drawCover(): void {
    const g = this.cover.clear();
    const t = this.table;
    if (!t || !this.lit) return;
    for (const s of t.modules) {
      const lit = this.lit.find((l) => l.module === s.id) ?? { from: 0, to: 0 };
      const z = this.lift(s.depth + 1.5);
      const from = Math.max(0, lit.from);
      const to = Math.min(s.width, lit.to);
      const parts = to <= from ? [[0, s.width]] : [[0, from], [to, s.width]];
      for (const [a, b] of parts) {
        if (b! - a! <= 0) continue;
        g.rect(s.x + a!, s.y - z, b! - a!, s.height).fill({ color: COVER[s.material], alpha: 0.32 });
        g.rect(s.x + a!, s.y - z, b! - a!, s.height).stroke({ color: COVER[s.material], alpha: 0.6, width: 0.8 });
      }
    }
  }
}

/** The inside of a test tube seen through its glass: the wooden stand under it, a little lighter where the glass is. */
function testTubeFloor(s: NestShape): Graphics {
  const { glass } = TEST_TUBE;
  return new Graphics()
    .rect(s.x, s.y, s.width, s.height)
    .fill(0x8a5c36)
    .rect(s.x, s.y + glass, s.width, s.height - 2 * glass)
    .fill({ color: 0xb08860, alpha: 0.9 });
}

/** Traces a path of x, y pairs on `g`, ready to stroke. */
function tubePath(g: Graphics, path: readonly number[]): Graphics {
  g.moveTo(path[0]!, path[1]!);
  for (let k = 2; k < path.length; k += 2) g.lineTo(path[k]!, path[k + 1]!);
  return g;
}

/** The `w` × `h` cells of `layer` (a grid `width` wide) from (x, y). */
function crop(layer: Uint8Array, width: number, x: number, y: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) out.set(layer.subarray((y + r) * width + x, (y + r) * width + x + w), r * w);
  return out;
}

/** The block's front face by material: its colour (and how clear it is), the edge on the desk, and the water hole's wall. */
const FRONT: Record<NestMaterial, { colour: number; alpha: number; edge: number; hole: number }> = {
  ytong: { colour: 0xc9c5bb, alpha: 1, edge: 0x8f8a80, hole: 0x5d5a54 },
  plaster: { colour: 0xe2dfd8, alpha: 1, edge: 0xa29f98, hole: 0x77746e },
  acrylic: { colour: 0xcfe0e8, alpha: 0.45, edge: 0x7f98a6, hole: 0x5d6a72 },
  wood: { colour: 0x96633a, alpha: 1, edge: 0x5e3b20, hole: 0x4a3220 },
};

/** The cover's tint: smoked board over most nests, red film over acrylic (ants barely see red). */
const COVER: Record<NestMaterial, number> = { ytong: 0x2a2622, plaster: 0x2a2622, acrylic: 0xb3261e, wood: 0x2a2622 };

/** A texture of `pixels` (RGBA) `width` × `height`, smoothed when scaled. */
function canvasTexture(width: number, height: number, pixels: Uint8ClampedArray): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(width, height);
    image.data.set(pixels);
    ctx.putImageData(image, 0, 0);
  }
  const texture = Texture.from(canvas, true);
  texture.source.update();
  return texture;
}
