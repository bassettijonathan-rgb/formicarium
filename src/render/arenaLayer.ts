/**
 * The keeper's arena (DESIGN.md A1, A3, A4): a glass box on the desk, seen
 * from above at an angle. The simulation's arena is a flat floor in mm; a
 * projection places everything on it: the sand floor and its flat
 * decorations, the trail, the food, the stones, bark and water tube standing
 * up from it, and the ants. Things that stand up and ants are drawn nearest
 * last, so an ant behind a stone is hidden by it. A switch shows the arena
 * straight from above instead, as before, which reads trails best.
 */
import { Container, Graphics, PerspectiveMesh, type Renderer, Texture } from 'pixi.js';
import { Place } from '../sim/ants';
import { type Decoration, buildRelief } from '../sim/decor';
import { dropRadius } from '../sim/food';
import { TANK_ARENA, TUBE } from '../sim/tank';
import type { ArenaSnapshot } from '../worker/protocol';
import { AntLayer } from './antLayer';
import { paintFloor } from './arenaFloor';
import { type Projection, makeProjection } from './projection';

/** Where the arena stands on the desk, in scene mm: its front edge's middle, and the scale there. */
export const ARENA_VIEW = { frontX: 600, frontY: 390, scale: 1.05 } as const;
/** Degrees above the desk the angled view looks down from (A3). */
export const ANGLED_TILT = 40;
/** Height above the floor of the middle of the tube's mouth in the left wall, mm. */
const MOUTH_HEIGHT = TUBE.diameter / 2 + 1;
/** The slippery band (fluon) round the top of the walls inside, mm. */
const FLUON = 18;

export class ArenaLayer {
  readonly root = new Container();
  readonly ants: AntLayer;
  private projection: Projection;
  private width: number = TANK_ARENA.width;
  private height: number = TANK_ARENA.height;
  /** The floor's size, mm. */
  get floorWidth(): number {
    return this.width;
  }
  get floorHeight(): number {
    return this.height;
  }
  private readonly back = new Graphics();
  private readonly floor: PerspectiveMesh;
  private readonly trail: PerspectiveMesh;
  private readonly food = new Graphics();
  /** The stones, bark and tube standing on the floor, sorted with the ants. */
  private obstacles: Graphics[] = [];
  private readonly front = new Graphics();
  private readonly floorCanvas = document.createElement('canvas');
  private readonly trailCanvas = document.createElement('canvas');
  private decor: Decoration[] = [];
  private decorKey = '';
  /** The ground's height over each mm of floor (the simulation's relief, from the same shapes), and which decoration stands there (index + 1, 0 for none). */
  private relief: Float32Array = new Float32Array(0);
  private standing = new Uint8Array(0);
  private last: ArenaSnapshot | undefined;
  /** Called after the view changes (angled or from above), so the tube can follow its mouth. */
  onLayout: (() => void) | undefined;

  constructor(renderer: Renderer) {
    this.ants = new AntLayer(renderer, Place.arena);
    this.ants.root.sortableChildren = true;
    this.projection = this.makeProjection(ANGLED_TILT);
    this.floor = new PerspectiveMesh({ texture: Texture.WHITE, verticesX: 24, verticesY: 24 });
    this.trail = new PerspectiveMesh({ texture: Texture.EMPTY, verticesX: 24, verticesY: 24 });
    this.trail.alpha = 0.6;
    this.root.addChild(this.back, this.floor, this.trail, this.food, this.ants.root, this.front);
    this.layout();
  }

  set showTrails(on: boolean) {
    this.trail.visible = on;
  }

  /** True while the arena is seen at an angle, false when seen straight from above. */
  get angled(): boolean {
    return this.projection.tilt !== 90;
  }

  set angled(on: boolean) {
    if (on === this.angled) return;
    this.projection = this.makeProjection(on ? ANGLED_TILT : 90);
    this.layout();
    if (this.last) this.setArena(this.last);
  }

  /** The floor point (arena mm) under a scene point, for taps. */
  toFloor(x: number, y: number): { u: number; v: number } {
    return this.projection.toFloor(x, y);
  }

  /** Where lines on the desk running away from the viewer meet in the angled view, for drawing the desk to match. */
  static get vanishingPoint(): { x: number; y: number } {
    return makeProjection({ tilt: ANGLED_TILT, ...TANK_ARENA, ...ARENA_VIEW }).vanishingPoint;
  }

  /** Where the tube meets the arena's left wall, in the scene. */
  get mouth(): { x: number; y: number; k: number } {
    return this.projection.toScene(-2, this.height / 2, MOUTH_HEIGHT);
  }

  /** The scene rectangle the arena box covers. */
  get bounds(): { x: number; y: number; width: number; height: number } {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [u, v] of [[0, 0], [this.width, 0], [this.width, this.height], [0, this.height]] as const) {
      for (const h of [0, TANK_ARENA.wallHeight]) {
        const p = this.projection.toScene(u, v, h);
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }

  setArena(snapshot: ArenaSnapshot): void {
    this.last = snapshot;
    if (snapshot.width !== this.width || snapshot.height !== this.height) {
      this.width = snapshot.width;
      this.height = snapshot.height;
      this.projection = this.makeProjection(this.projection.tilt);
      this.layout();
    }
    const key = JSON.stringify(snapshot.decor);
    if (key !== this.decorKey) {
      this.decorKey = key;
      this.decor = snapshot.decor;
      this.measureRelief();
      paintFloor(this.floorCanvas, this.width, this.height, this.decor);
      this.floor.texture = canvasTexture(this.floorCanvas);
      this.drawObstacles();
    }
    this.drawTrail(snapshot);
    this.drawFood(snapshot);
  }

  private makeProjection(tilt: number): Projection {
    return makeProjection({ tilt, width: this.width, height: this.height, ...ARENA_VIEW });
  }

  /** Re-places everything that depends on the projection. */
  private layout(): void {
    const p = this.projection;
    const corners = [
      p.toScene(0, 0),
      p.toScene(this.width, 0),
      p.toScene(this.width, this.height),
      p.toScene(0, this.height),
    ] as const;
    const flat = corners.flatMap((c) => [c.x, c.y]) as [number, number, number, number, number, number, number, number];
    this.floor.setCorners(...flat);
    this.trail.setCorners(...flat);
    this.ants.project = (x, y) => {
      const at = p.toScene(x, y, this.heightAt(x, y));
      const s = p.stretch(x, y);
      return { x: at.x, y: at.y, sx: s.sx, sy: s.sy, z: this.order(x, y) };
    };
    this.drawGlass();
    this.drawObstacles();
    this.onLayout?.();
  }

  /** Builds the relief map and notes which decoration stands over each cell. */
  private measureRelief(): void {
    const { width: w, height: h } = this;
    this.relief = buildRelief(w, h, this.decor);
    this.standing = new Uint8Array(w * h);
    this.decor.forEach((d, k) => {
      const one = buildRelief(w, h, [d]);
      for (let i = 0; i < one.length; i++) if (one[i]! > 0 && one[i]! >= this.relief[i]!) this.standing[i] = k + 1;
    });
  }

  /** Height of the ground under an ant at (x, y), mm: on a stone, the bark or a tube, it walks on top (A5). */
  private heightAt(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height || this.relief.length === 0) return 0;
    // Bilinear between cell centres, as the simulation samples it.
    const fx = x - 0.5;
    const fy = y - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= this.width || j >= this.height ? 0 : this.relief[j * this.width + i]!);
    return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
  }

  /**
   * Drawing order of an ant at (x, y): its depth on the floor, as for the
   * decorations (`zIndex` is their middle's y). An ant on a decoration is
   * drawn over it where the viewer sees that part: its near half, or its
   * upper part on the far side (the far foot of a stone is out of sight).
   */
  private order(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) return y;
    const k = this.standing[cy * this.width + cx] ?? 0;
    if (k === 0) return y;
    // Only the stones, the bark and the tube stand up, and they are drawn at their middle's y.
    const d = this.decor[k - 1] as Extract<Decoration, { kind: 'stone' | 'bark' | 'tube' }>;
    const top = d.kind === 'tube' ? 2 * d.radius : d.height;
    if (y >= d.y || this.heightAt(x, y) > 0.5 * top) return d.y + 0.5;
    return y;
  }

  /** The glass box: the far walls behind everything, the near wall over it, with the fluon band and the edges. */
  private drawGlass(): void {
    const p = this.projection;
    const W = this.width;
    const D = this.height;
    const H = TANK_ARENA.wallHeight;
    const quad = (g: Graphics, a: [number, number], b: [number, number], h0: number, h1: number) => {
      const pts = [p.toScene(a[0], a[1], h0), p.toScene(b[0], b[1], h0), p.toScene(b[0], b[1], h1), p.toScene(a[0], a[1], h1)];
      return g.poly(pts.flatMap((q) => [q.x, q.y]));
    };
    const edge = (g: Graphics, a: [number, number, number], b: [number, number, number], alpha: number, width = 1.2) => {
      const q0 = p.toScene(...a);
      const q1 = p.toScene(...b);
      g.moveTo(q0.x, q0.y).lineTo(q1.x, q1.y).stroke({ color: 0xe9f1f7, alpha, width: width * q0.k });
    };
    const back = this.back.clear();
    // The box's shadow on the desk, a little toward the front.
    for (const [s, alpha] of [
      [12, 0.06],
      [7, 0.08],
      [3, 0.1],
    ] as const) {
      const foot = [p.toScene(-s / 2, 0), p.toScene(W + s / 2, 0), p.toScene(W + s, D + s), p.toScene(-s, D + s)];
      back.poly(foot.flatMap((q) => [q.x, q.y])).fill({ color: 0x2a1a0e, alpha });
    }
    // The glass bottom's edge, seen at the front.
    quad(back, [0, D], [W, D], -4, 0).fill({ color: 0x9fb4bc, alpha: 0.6 });
    // Far walls: the back and the two sides, faintly blue, each with its fluon band at the top.
    const walls: [[number, number], [number, number]][] = [
      [[0, 0], [W, 0]],
      [[0, D], [0, 0]],
      [[W, 0], [W, D]],
    ];
    for (const [a, b] of walls) {
      quad(back, a, b, 0, H).fill({ color: 0xcfe3ef, alpha: 0.1 });
      quad(back, a, b, H - FLUON, H).fill({ color: 0xffffff, alpha: 0.16 });
    }
    // The tube's mouth: a dark round hole low in the left wall.
    const mouth: number[] = [];
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 12) {
      const q = p.toScene(0, D / 2 + (TUBE.diameter / 2) * Math.cos(a), MOUTH_HEIGHT + (TUBE.diameter / 2) * Math.sin(a));
      mouth.push(q.x, q.y);
    }
    back.poly(mouth).fill({ color: 0x15171a, alpha: 0.85 });
    for (const [a, b] of walls) {
      edge(back, [a[0], a[1], H], [b[0], b[1], H], 0.55);
      edge(back, [a[0], a[1], 0], [b[0], b[1], 0], 0.3);
    }
    edge(back, [0, 0, 0], [0, 0, H], 0.45, 1.6);
    edge(back, [W, 0, 0], [W, 0, H], 0.45, 1.6);

    // The near wall, over everything inside: a faint pane with its band, its edges and two reflections.
    const front = this.front.clear();
    quad(front, [0, D], [W, D], 0, H).fill({ color: 0xcfe3ef, alpha: 0.07 });
    quad(front, [0, D], [W, D], H - FLUON, H).fill({ color: 0xffffff, alpha: 0.14 });
    for (const [u0, u1] of [
      [0.12, 0.2],
      [0.24, 0.27],
    ] as const) {
      const pts = [p.toScene(W * u0 + 30, D, H), p.toScene(W * u1 + 30, D, H), p.toScene(W * u1, D, 0), p.toScene(W * u0, D, 0)];
      front.poly(pts.flatMap((q) => [q.x, q.y])).fill({ color: 0xffffff, alpha: 0.05 });
    }
    edge(front, [0, D, 0], [W, D, 0], 0.5);
    edge(front, [0, D, H], [W, D, H], 0.7);
    edge(front, [0, D, 0], [0, D, H], 0.55, 1.6);
    edge(front, [W, D, 0], [W, D, H], 0.55, 1.6);
    edge(front, [0, 0, H], [0, D, H], 0.6);
    edge(front, [W, 0, H], [W, D, H], 0.6);
  }

  /** The stones, the bark and the water tube, standing up from the floor. */
  private drawObstacles(): void {
    for (const g of this.obstacles) g.destroy();
    this.obstacles = [];
    for (const d of this.decor) {
      let g: Graphics | null = null;
      if (d.kind === 'stone') g = this.stone(d);
      else if (d.kind === 'bark') g = this.bark(d);
      else if (d.kind === 'tube') g = this.waterTube(d);
      if (!g) continue;
      this.obstacles.push(g);
      this.ants.root.addChild(g);
    }
  }

  /**
   * A dome over an outline on the floor, drawn as stacked slices from the
   * bottom up, each a little lighter: `at(a, f)` is the floor point at angle
   * `a` round the outline, shrunk toward its middle by `f`.
   */
  private dome(g: Graphics, at: (a: number, f: number) => [number, number], height: number, dark: number, light: number, slices = 16): void {
    const p = this.projection;
    for (let j = 0; j <= slices; j++) {
      const phi = (j / slices) * (Math.PI / 2) * 0.92;
      const pts: number[] = [];
      for (let k = 0; k < 24; k++) {
        const [u, v] = at((2 * Math.PI * k) / 24, Math.cos(phi));
        const q = p.toScene(u, v, height * Math.sin(phi));
        pts.push(q.x, q.y);
      }
      // Lighter toward the top, fastest near the bottom where the side turns toward the light.
      g.poly(pts).fill(mix(dark, light, Math.sin(((j / slices) * Math.PI) / 2)));
    }
  }

  private stone(d: Extract<Decoration, { kind: 'stone' }>): Graphics {
    const g = new Graphics();
    const n = d.outline.length;
    const radiusAt = (a: number) => {
      const t = (((a / (2 * Math.PI)) * n) % n + n) % n;
      const k = Math.floor(t);
      return d.radius * (d.outline[k]! * (1 - (t - k)) + d.outline[(k + 1) % n]! * (t - k));
    };
    // Grey, beige or brownish, from the stone's own shape.
    const tones = [
      [0x5f5a52, 0xb9b2a4],
      [0x6a5f50, 0xc4b59c],
      [0x55524e, 0xa9a6a0],
    ] as const;
    const [dark, light] = tones[Math.floor(d.outline[0]! * 100) % tones.length]!;
    this.dome(g, (a, f) => [d.x + radiusAt(a) * f * Math.cos(a), d.y + radiusAt(a) * f * Math.sin(a)], d.height, dark, light);
    // A soft highlight toward the window.
    const top = this.projection.toScene(d.x, d.y - d.radius * 0.25, d.height * 0.92);
    g.ellipse(top.x, top.y, d.radius * 0.35 * top.k, d.radius * 0.2 * top.k).fill({ color: 0xffffff, alpha: 0.18 });
    g.zIndex = d.y;
    return g;
  }

  private bark(d: Extract<Decoration, { kind: 'bark' }>): Graphics {
    const g = new Graphics();
    const c = Math.cos(d.angle);
    const s = Math.sin(d.angle);
    const local = (x: number, y: number): [number, number] => [d.x + x * c - y * s, d.y + x * s + y * c];
    this.dome(g, (a, f) => local(d.length * f * Math.cos(a), (d.width / 2) * f * Math.sin(a)), d.height, 0x2e2018, 0x7a5a40);
    // Deep furrows along the cork.
    const p = this.projection;
    for (let row = -2; row <= 2; row++) {
      const y = (row / 3) * (d.width / 2);
      const pts: number[] = [];
      for (let t = -0.9; t <= 0.91; t += 0.1) {
        const lift = Math.sqrt(Math.max(0, 1 - t * t - (y / (d.width / 2)) ** 2));
        const [u, v] = local(t * d.length, y + Math.sin(t * 9 + row) * 1.2);
        const q = p.toScene(u, v, d.height * lift * 0.96);
        pts.push(q.x, q.y);
      }
      g.poly(pts, false).stroke({ color: 0x24180f, alpha: 0.55, width: 1.1 * p.toScene(d.x, d.y).k });
    }
    g.zIndex = d.y;
    return g;
  }

  private waterTube(d: Extract<Decoration, { kind: 'tube' }>): Graphics {
    const g = new Graphics();
    const p = this.projection;
    const r = d.radius;
    const line = (x0: number, x1: number, h: number, dv: number, width: number, colour: number, alpha: number) => {
      const a = p.toScene(x0, d.y + dv, h);
      const b = p.toScene(x1, d.y + dv, h);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: colour, alpha, width: width * a.k, cap: 'round' });
    };
    // Glass, the water filling most of it, the cotton plug at the end toward the middle, and a highlight along the top.
    line(d.x0, d.x1, r, 0, 2 * r, 0xd8e8f0, 0.45);
    line(d.x0 + 16, d.x1 - 1, r * 0.9, 0, 1.6 * r, 0x6f9fbf, 0.55);
    line(d.x0 + 2, d.x0 + 15, r, 0, 1.8 * r, 0xf2eee4, 0.95);
    line(d.x0 + 4, d.x1 - 2, 1.75 * r, -0.35 * r, 0.25 * r, 0xffffff, 0.6);
    g.zIndex = d.y;
    return g;
  }

  private drawTrail({ width, height, trail }: ArenaSnapshot): void {
    const canvas = this.trailCanvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
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
    if (this.trail.texture.source.resource === canvas) this.trail.texture.source.update();
    else this.trail.texture = canvasTexture(canvas);
  }

  private drawFood(snapshot: ArenaSnapshot): void {
    const g = this.food.clear();
    for (const d of snapshot.food) {
      // Each drop is drawn round its own middle, then laid on the floor in perspective.
      const at = this.projection.toScene(d.x, d.y);
      const s = this.projection.stretch(d.x, d.y);
      g.setTransform(s.sx, 0, 0, s.sy, at.x, at.y);
      const r = dropRadius(d.volume);
      if (d.protein > 0 && d.mouldy) {
        // An insect gone mouldy: grey and furred with pale threads.
        g.ellipse(0, 0, r * 1.3, r * 0.8).fill({ color: 0x4a4a3c, alpha: 0.95 });
        g.ellipse(0, 0, r * 1.6, r * 1.1).fill({ color: 0xd6e2be, alpha: 0.45 });
        for (let a = 0; a < 6; a++) {
          g.circle(r * Math.cos(a) * 0.9, r * Math.sin(a * 1.7) * 0.6, r * 0.25).fill({ color: 0xeef3e2, alpha: 0.6 });
        }
      } else if (d.protein > 0) {
        // A crushed insect: a dark body with a glistening wet patch where the ants drink.
        g.ellipse(0, 0, r * 1.3, r * 0.8).fill({ color: 0x3a2418, alpha: 0.95 });
        g.ellipse(r * 0.2, 0, r * 0.7, r * 0.45).fill({ color: 0x8a4a2a, alpha: 0.8 });
        g.circle(-r * 0.4, -r * 0.25, r * 0.2).fill({ color: 0xffffff, alpha: 0.35 });
      } else {
        // A drop of sugar water: amber, richer sugar a deeper colour, with a highlight.
        const color = d.concentration >= 0.5 ? 0xd99a2b : 0xe8cf8a;
        g.circle(0, r * 0.25, r + 0.3).fill({ color: 0x000000, alpha: 0.15 });
        g.circle(0, 0, r).fill({ color, alpha: 0.85 });
        g.circle(-r * 0.35, -r * 0.35, r * 0.3).fill({ color: 0xffffff, alpha: 0.5 });
      }
    }
    g.resetTransform();
  }
}

/** Blends two 0xrrggbb colours. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift;
  return ch(16) | ch(8) | ch(0);
}

function canvasTexture(canvas: HTMLCanvasElement): Texture {
  const texture = Texture.from(canvas, true);
  texture.source.scaleMode = 'linear';
  texture.source.update();
  return texture;
}

