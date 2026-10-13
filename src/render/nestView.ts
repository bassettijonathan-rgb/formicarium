/**
 * A bought nest lying flat on the desk (DESIGN.md 3.5, N3), seen from the
 * front and above at the arena's angle, or straight from above. The view is
 * a parallel projection of the nest's floor: a point (u, v) on the floor,
 * lifted h mm, goes to (x0 + S u, y0 + S (v sin t - h cos t)) in the scene.
 * That is the same squash everywhere, so the floor, the brood, the mould and
 * the ants are drawn in a container that maps the nest's mm straight onto
 * the desk, and the walls are a picture over them, so a wall hides the ants
 * behind it.
 */
import { Container, Graphics, Matrix, Sprite, Texture } from 'pixi.js';
import type { NestMaterial } from '../sim/nest';
import type { NestShape } from '../worker/protocol';
import { paintNest } from './nestPaint';

/** Where the nest lies on the desk: its right edge and its front edge, in scene mm, and scene mm per nest mm. */
export const NEST_VIEW = { right: 345, front: 390, scale: 1.05 } as const;
/** Pixels per mm of the block's pictures. */
const PX = 4;

export class NestView {
  readonly root = new Container();
  /** The floor of the carving, in nest mm: what lies and walks on it goes in here, between the floor and the walls. */
  readonly floor = new Container();
  private readonly desk = new Graphics();
  private readonly floorSprite = new Sprite();
  private readonly walls = new Sprite();
  private readonly front = new Graphics();
  private readonly lid = new Graphics();
  /** The cover over the lid, tinted, where the keeper has not lifted it (N7). */
  private readonly cover = new Graphics();
  /** Where things lie on the floor: under the ants and brood, over the floor picture. */
  readonly below = new Container();
  /** The brood, the ants and what lies about, added by the tank view. */
  readonly above = new Container();
  private tilt = 40;
  private shape: NestShape | undefined;
  private width = 0;
  private height = 0;
  private material: Uint8Array | undefined;
  private moisture: Uint8Array | undefined;
  private mat: { x: number; width: number } | null = null;
  private lit: { from: number; to: number } | null = null;

  constructor() {
    this.floor.addChild(this.desk, this.floorSprite, this.below, this.above, this.walls, this.front, this.lid, this.cover);
    this.root.addChild(this.floor);
  }

  /** True while the nest is seen at an angle. */
  get angled(): boolean {
    return this.tilt !== 90;
  }

  set angled(on: boolean) {
    this.tilt = on ? 40 : 90;
    this.layout();
  }

  /** Redraws the block from the farm's layers (they change only when a new tank is opened). */
  setNest(shape: NestShape, width: number, height: number, material: Uint8Array, moisture: Uint8Array): void {
    this.shape = shape;
    this.width = width;
    this.height = height;
    this.material = material;
    this.moisture = moisture;
    this.layout();
  }

  /** The heat mat under the nest, or none. */
  setMat(mat: { x: number; width: number } | null): void {
    const same = mat === this.mat || (mat && this.mat && mat.x === this.mat.x && mat.width === this.mat.width);
    if (same) return;
    this.mat = mat;
    this.drawDesk();
  }

  /** Where the cover is lifted (mm across), or null. */
  setCover(lit: { from: number; to: number } | null): void {
    if (lit === this.lit || (lit && this.lit && lit.from === this.lit.from && lit.to === this.lit.to)) return;
    this.lit = lit;
    this.drawCover();
  }

  /** Scene point of the nest point (u, v) lifted h mm. */
  toScene(u: number, v: number, h = 0): { x: number; y: number } {
    const t = (this.tilt * Math.PI) / 180;
    const S = NEST_VIEW.scale;
    const x0 = NEST_VIEW.right - S * this.width;
    const y0 = NEST_VIEW.front - S * this.height * Math.sin(t);
    return { x: x0 + S * u, y: y0 + S * (v * Math.sin(t) - h * Math.cos(t)) };
  }

  /** The point of the nest's floor under a scene point. */
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

  /** The nest's floor mapped onto the scene, for the containers that draw on it. */
  private floorMatrix(): Matrix {
    const t = (this.tilt * Math.PI) / 180;
    const S = NEST_VIEW.scale;
    const o = this.toScene(0, 0, this.floorHeight);
    return new Matrix(S, 0, 0, S * Math.sin(t), o.x, o.y);
  }

  /** Height of the chambers' floor above the desk, mm. */
  private get floorHeight(): number {
    return this.shape ? this.shape.thickness - this.shape.depth : 0;
  }

  /** How far up the screen, in floor mm, a thing `h` mm above the floor shows. */
  private lift(h: number): number {
    const t = (this.tilt * Math.PI) / 180;
    return (h * Math.cos(t)) / Math.sin(t);
  }

  /** The scene rectangle the nest covers. */
  get bounds(): { x: number; y: number; width: number; height: number } {
    const a = this.toScene(0, 0, this.shape?.thickness ?? 0);
    const b = this.toScene(this.width, this.height, 0);
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  }

  /** Where the tube leaves the nest: its port in the right end, in the scene. */
  get port(): { x: number; y: number } {
    const s = this.shape;
    return s ? this.toScene(this.width, s.tubeY, this.floorHeight + s.depth / 2) : { x: 0, y: 0 };
  }

  private layout(): void {
    const s = this.shape;
    if (!s || !this.material || !this.moisture) return;
    const m = this.floorMatrix();
    this.floor.setFromMatrix(m);
    const lift = Math.round(this.lift(s.depth) * PX);
    const p = paintNest(this.material, this.moisture, this.width, this.height, PX, lift, s.material);
    this.floorSprite.texture = canvasTexture(p.width, p.floorHeight, p.floor);
    this.floorSprite.scale.set(1 / PX);
    this.walls.texture = canvasTexture(p.width, p.wallHeight, p.walls);
    this.walls.scale.set(1 / PX);
    this.walls.position.set(0, -lift / PX);
    this.drawDesk();
    this.drawBlock();
    this.drawCover();
  }

  /** The heat mat and the block's shadow, on the desk under the floor. */
  private drawDesk(): void {
    const g = this.desk.clear();
    const s = this.shape;
    if (!s) return;
    const down = this.lift(-this.floorHeight); // the desk, in floor mm (negative lift: lower on screen)
    if (this.mat) {
      // A silicone mat longer than the nest is deep, its heating wire showing as faint lines.
      const { x, width } = this.mat;
      g.roundRect(x, -down - 12, width, this.height + 30, 2).fill(0x8a3b22);
      for (let wx = x + 4; wx < x + width - 2; wx += 6) g.rect(wx, -down - 10, 0.8, this.height + 26).fill({ color: 0xd9824f, alpha: 0.6 });
    }
    for (const [d, alpha] of [
      [10, 0.07],
      [6, 0.09],
      [3, 0.12],
    ] as const) g.rect(d / 2, -down + d, this.width + d / 2, this.height).fill({ color: 0x1a0f08, alpha });
  }

  /** The front face of the block, the water hole (or the sponge) and the glass lid. */
  private drawBlock(): void {
    const s = this.shape!;
    const top = this.lift(s.depth); // the block's top, above the floor
    const desk = this.lift(-this.floorHeight);
    const f = this.front.clear();
    const face = FRONT[s.material];
    // The front face, a little darker toward the desk; clear acrylic shows its layers as lines.
    f.rect(0, this.height - top, this.width, top - desk).fill({ color: face.colour, alpha: face.alpha });
    f.rect(0, this.height - desk - 3, this.width, 3).fill({ color: face.edge, alpha: 0.6 });
    f.rect(0, this.height - top, this.width, 0.8).fill({ color: 0xffffff, alpha: 0.35 });
    if (s.material === 'acrylic') {
      for (const z of [s.depth, 0, -(this.floorHeight / 2)]) f.rect(0, this.height - this.lift(z), this.width, 0.5).fill({ color: 0xffffff, alpha: 0.45 });
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
    // The glass lid on the top: a faint sheen and two reflections.
    const lid = this.lid.clear();
    const z = this.lift(s.depth + 0.5);
    lid.rect(0, -z, this.width, this.height).fill({ color: 0xcfe3ef, alpha: 0.06 });
    lid.poly([this.width * 0.15, -z, this.width * 0.45, -z, this.width * 0.2, this.height - z, 0, this.height - z, 0, this.height * 0.7 - z]).fill({
      color: 0xffffff,
      alpha: 0.05,
    });
    lid.rect(0, -z, this.width, this.height).stroke({ color: 0xe9f1f7, alpha: 0.4, width: 0.8 });
  }

  /** The cover on the lid, where it is not lifted: tinted, so the keeper still sees in (N7). */
  private drawCover(): void {
    const g = this.cover.clear();
    const s = this.shape;
    if (!s || !this.lit) return;
    const z = this.lift(s.depth + 1.5);
    const from = Math.max(0, this.lit.from);
    const to = Math.min(this.width, this.lit.to);
    const parts = to <= from ? [[0, this.width]] : [[0, from], [to, this.width]];
    for (const [a, b] of parts) {
      if (b! - a! <= 0) continue;
      g.rect(a!, -z, b! - a!, this.height).fill({ color: COVER[s.material], alpha: 0.32 });
      g.rect(a!, -z, b! - a!, this.height).stroke({ color: COVER[s.material], alpha: 0.6, width: 0.8 });
    }
  }
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
