/**
 * Everything drawn inside the arena: inner walls (lab setups), the trail
 * overlay, sugar drops and the ants. Positions are arena mm; the layer is
 * placed at the arena's position in the scene.
 */
import { Container, Graphics, type Renderer, Sprite, Texture } from 'pixi.js';
import { Place } from '../sim/ants';
import { dropRadius } from '../sim/food';
import type { ArenaSnapshot } from '../worker/protocol';
import { AntLayer } from './antLayer';

export class ArenaLayer {
  readonly root = new Container();
  readonly ants: AntLayer;
  private readonly walls = new Sprite();
  private readonly trail = new Sprite();
  private readonly food = new Graphics();
  private trailCanvas: HTMLCanvasElement | undefined;
  private wallCanvas: HTMLCanvasElement | undefined;
  private wallKey = '';

  constructor(renderer: Renderer) {
    this.ants = new AntLayer(renderer, Place.arena);
    this.trail.alpha = 0.6;
    this.root.addChild(this.walls, this.trail, this.food, this.ants.root);
  }

  set showTrails(on: boolean) {
    this.trail.visible = on;
  }

  setArena(snapshot: ArenaSnapshot): void {
    this.drawTrail(snapshot);
    this.drawWalls(snapshot);
    this.food.clear();
    for (const d of snapshot.food) {
      const r = dropRadius(d.volume);
      if (d.protein > 0 && d.mouldy) {
        // An insect gone mouldy: grey and furred with pale threads.
        this.food.ellipse(d.x, d.y, r * 1.3, r * 0.8).fill({ color: 0x4a4a3c, alpha: 0.95 });
        this.food.ellipse(d.x, d.y, r * 1.6, r * 1.1).fill({ color: 0xd6e2be, alpha: 0.45 });
        for (let a = 0; a < 6; a++) {
          this.food.circle(d.x + r * Math.cos(a) * 0.9, d.y + r * Math.sin(a * 1.7) * 0.6, r * 0.25).fill({ color: 0xeef3e2, alpha: 0.6 });
        }
        continue;
      }
      if (d.protein > 0) {
        // A crushed insect: a dark body with a glistening wet patch where the ants drink.
        this.food.ellipse(d.x, d.y, r * 1.3, r * 0.8).fill({ color: 0x3a2418, alpha: 0.95 });
        this.food.ellipse(d.x + r * 0.2, d.y, r * 0.7, r * 0.45).fill({ color: 0x8a4a2a, alpha: 0.8 });
        this.food.circle(d.x - r * 0.4, d.y - r * 0.25, r * 0.2).fill({ color: 0xffffff, alpha: 0.35 });
        continue;
      }
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
