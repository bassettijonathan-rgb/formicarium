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

  constructor() {
    this.floor.addChild(this.desk, this.floorSprite, this.below, this.above, this.walls, this.front, this.lid);
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
    const p = paintNest(this.material, this.moisture, this.width, this.height, PX, lift);
    this.floorSprite.texture = canvasTexture(p.width, p.floorHeight, p.floor);
    this.floorSprite.scale.set(1 / PX);
    this.walls.texture = canvasTexture(p.width, p.wallHeight, p.walls);
    this.walls.scale.set(1 / PX);
    this.walls.position.set(0, -lift / PX);
    this.drawDesk();
    this.drawBlock();
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

  /** The front face of the block, the water hole and the glass lid. */
  private drawBlock(): void {
    const s = this.shape!;
    const top = this.lift(s.depth); // the block's top, above the floor
    const desk = this.lift(-this.floorHeight);
    const f = this.front.clear();
    // The sawn front face, a little darker toward the desk.
    f.rect(0, this.height - top, this.width, top - desk).fill(0xc9c5bb);
    f.rect(0, this.height - desk - 3, this.width, 3).fill({ color: 0x8f8a80, alpha: 0.6 });
    f.rect(0, this.height - top, this.width, 0.8).fill({ color: 0xffffff, alpha: 0.35 });
    // The water hole in the top, its water a few mm down.
    const water = this.lift(s.depth - 6);
    f.circle(s.waterX, s.waterY - top, s.waterRadius).fill(0x5d5a54);
    f.circle(s.waterX, s.waterY - water, s.waterRadius - 1.5).fill(0x3d6f99);
    f.circle(s.waterX - 2.5, s.waterY - water - 2.5, 2.2).fill({ color: 0xffffff, alpha: 0.35 });
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
}

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
