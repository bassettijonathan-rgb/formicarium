/**
 * Everything drawn inside the arena: inner walls (lab setups), the trail
 * overlay, sugar drops and the ants. Positions are arena mm; the layer is
 * placed at the arena's position in the scene.
 */
import { Container, Graphics, type Renderer, Sprite, Texture } from 'pixi.js';
import { AntState } from '../sim/ants';
import { dropRadius } from '../sim/food';
import { ANT_STRIDE, type AntsSnapshot, type ArenaSnapshot } from '../worker/protocol';
import { ANT_SCALE, GAIT_FRAMES, STRIDE, makeAntTextures } from './antSprites';

export class ArenaLayer {
  readonly root = new Container();
  private readonly walls = new Sprite();
  private readonly trail = new Sprite();
  private readonly food = new Graphics();
  private readonly antLayer = new Container();
  private readonly antSprites: Sprite[] = [];
  private readonly textures: Texture[][];
  private trailCanvas: HTMLCanvasElement | undefined;
  private wallCanvas: HTMLCanvasElement | undefined;
  private wallKey = '';

  /** The two latest ant snapshots and when the newer one arrived, for smooth motion between them. */
  private previous: AntsSnapshot | undefined;
  private current: AntsSnapshot | undefined;
  private arrivedAt = 0;
  private interval = 50;

  constructor(renderer: Renderer) {
    this.textures = makeAntTextures(renderer);
    this.trail.alpha = 0.6;
    this.root.addChild(this.walls, this.trail, this.food, this.antLayer);
  }

  set showTrails(on: boolean) {
    this.trail.visible = on;
  }

  setAnts(snapshot: AntsSnapshot, now: number): void {
    if (this.current) this.interval = Math.min(200, Math.max(16, now - this.arrivedAt));
    this.previous = this.current;
    this.current = snapshot;
    this.arrivedAt = now;
    const count = snapshot.full.length;
    while (this.antSprites.length < count) {
      const s = new Sprite(this.textures[0]![0]);
      s.anchor.set(0.5);
      s.scale.set(ANT_SCALE);
      this.antSprites.push(s);
      this.antLayer.addChild(s);
    }
  }

  /** Places the ants for this frame, interpolating between the last two snapshots. */
  update(now: number): void {
    const cur = this.current;
    if (!cur) return;
    const prev = this.previous && this.previous.full.length === cur.full.length ? this.previous : cur;
    const t = Math.min(1, (now - this.arrivedAt) / this.interval);
    for (let i = 0; i < this.antSprites.length; i++) {
      const sprite = this.antSprites[i]!;
      const o = i * ANT_STRIDE;
      const state = cur.ants[o + 3]!;
      sprite.visible = state !== AntState.inNest;
      if (!sprite.visible) continue;
      const wasOut = prev.ants[o + 3] !== AntState.inNest;
      const k = wasOut ? t : 1;
      // Interpolate from the previous snapshot towards the current one.
      const x = prev.ants[o]! + (cur.ants[o]! - prev.ants[o]!) * k;
      const y = prev.ants[o + 1]! + (cur.ants[o + 1]! - prev.ants[o + 1]!) * k;
      let dh = cur.ants[o + 2]! - prev.ants[o + 2]!;
      dh -= 2 * Math.PI * Math.round(dh / (2 * Math.PI));
      const walked = prev.ants[o + 4]! + (cur.ants[o + 4]! - prev.ants[o + 4]!) * k;
      sprite.position.set(x, y);
      sprite.rotation = prev.ants[o + 2]! + dh * k;
      const frame = Math.floor(((walked % STRIDE) / STRIDE) * GAIT_FRAMES) % GAIT_FRAMES;
      sprite.texture = this.textures[cur.full[i]!]![frame]!;
    }
  }

  setArena(snapshot: ArenaSnapshot): void {
    this.drawTrail(snapshot);
    this.drawWalls(snapshot);
    this.food.clear();
    for (const d of snapshot.food) {
      const r = dropRadius(d.volume);
      // A drop of sugar water: amber, richer sugar a deeper colour, with a highlight.
      const color = d.concentration >= 0.5 ? 0xd99a2b : 0xe8cf8a;
      this.food.circle(d.x, d.y, r + 0.3).fill({ color: 0x000000, alpha: 0.15 });
      this.food.circle(d.x, d.y, r).fill({ color, alpha: 0.85 });
      this.food.circle(d.x - r * 0.35, d.y - r * 0.35, r * 0.3).fill({ color: 0xffffff, alpha: 0.5 });
    }
  }

  private drawTrail({ width, height, trail }: ArenaSnapshot): void {
    const canvas = (this.trailCanvas ??= sizedCanvas(width, height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    const px = image.data;
    for (let i = 0; i < trail.length; i++) {
      const v = trail[i]!;
      if (v <= 0) continue;
      // Log scale: faint trails stay visible next to strong ones.
      const a = Math.min(1, Math.log1p(v * 4) / 3);
      px[4 * i] = 80;
      px[4 * i + 1] = 200;
      px[4 * i + 2] = 255;
      px[4 * i + 3] = 255 * a;
    }
    ctx.putImageData(image, 0, 0);
    this.trail.texture = refreshed(this.trail.texture, canvas);
  }

  private drawWalls({ width, height, wall }: ArenaSnapshot): void {
    // Walls only change when a lab setup is built; skip redrawing otherwise.
    let key = '';
    for (let i = 0; i < wall.length; i += 97) key += wall[i];
    if (key === this.wallKey) return;
    this.wallKey = key;
    const canvas = (this.wallCanvas ??= sizedCanvas(width, height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < wall.length; i++) {
      if (!wall[i]) continue;
      image.data[4 * i] = 120;
      image.data[4 * i + 1] = 112;
      image.data[4 * i + 2] = 100;
      image.data[4 * i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.walls.texture = refreshed(this.walls.texture, canvas, 'nearest');
  }
}

function sizedCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/** Returns a texture showing the canvas's current pixels, reusing `old` when it already wraps this canvas. */
function refreshed(old: Texture, canvas: HTMLCanvasElement, scaleMode: 'linear' | 'nearest' = 'linear'): Texture {
  if (old.source.resource === canvas) {
    old.source.update();
    return old;
  }
  const texture = Texture.from(canvas, true);
  texture.source.scaleMode = scaleMode;
  texture.source.update();
  return texture;
}
