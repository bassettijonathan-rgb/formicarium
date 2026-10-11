/**
 * The ants in one place (the arena or the farm), drawn from the worker's
 * snapshots. Motion is interpolated between the last two snapshots so ants
 * glide smoothly at any simulation speed. Positions are in that place's mm;
 * the layer is put where the place is in the scene.
 */
import { Container, Graphics, type Renderer, Sprite, type Texture } from 'pixi.js';
import { AntState } from '../sim/ants';
import { ANT_STRIDE, type AntsSnapshot } from '../worker/protocol';
import { ANT_SCALE, GAIT_FRAMES, STRIDE, makeAntTextures } from './antSprites';
import { grainColor } from './soilColors';

/** Where a carried grain sits, ahead of the head, in mm. */
const GRAIN_AHEAD = 2.6;

let shared: Texture[][] | undefined;

export class AntLayer {
  readonly root = new Container();
  private readonly ants: { body: Container; sprite: Sprite; grain: Graphics; material: number }[] = [];
  private readonly textures: Texture[][];

  /** The two latest snapshots and when the newer one arrived. */
  private previous: AntsSnapshot | undefined;
  private current: AntsSnapshot | undefined;
  private arrivedAt = 0;
  private interval = 50;

  /** `place` is the `Place` whose ants this layer draws. */
  constructor(
    renderer: Renderer,
    private readonly place: number,
  ) {
    this.textures = shared ??= makeAntTextures(renderer);
  }

  setAnts(snapshot: AntsSnapshot, now: number): void {
    if (this.current) this.interval = Math.min(200, Math.max(16, now - this.arrivedAt));
    this.previous = this.current;
    this.current = snapshot;
    this.arrivedAt = now;
    while (this.ants.length < snapshot.full.length) {
      const sprite = new Sprite(this.textures[0]![0]);
      sprite.anchor.set(0.5);
      sprite.scale.set(ANT_SCALE);
      const grain = new Graphics();
      const body = new Container();
      body.addChild(sprite, grain);
      this.ants.push({ body, sprite, grain, material: 0 });
      this.root.addChild(body);
    }
  }

  /** Places the ants for this frame. */
  update(now: number): void {
    const cur = this.current;
    if (!cur) return;
    const prev = this.previous && this.previous.full.length === cur.full.length ? this.previous : cur;
    const t = Math.min(1, (now - this.arrivedAt) / this.interval);
    for (let i = 0; i < this.ants.length; i++) {
      const ant = this.ants[i]!;
      const o = i * ANT_STRIDE;
      ant.body.visible = cur.ants[o + 5] === this.place && cur.ants[o + 3] !== AntState.inNest;
      if (!ant.body.visible) continue;
      // Interpolate only if the ant was here in the previous snapshot too.
      const k = prev.ants[o + 5] === this.place && prev.ants[o + 3] !== AntState.inNest ? t : 1;
      const x = prev.ants[o]! + (cur.ants[o]! - prev.ants[o]!) * k;
      const y = prev.ants[o + 1]! + (cur.ants[o + 1]! - prev.ants[o + 1]!) * k;
      let dh = cur.ants[o + 2]! - prev.ants[o + 2]!;
      dh -= 2 * Math.PI * Math.round(dh / (2 * Math.PI));
      const walked = prev.ants[o + 4]! + (cur.ants[o + 4]! - prev.ants[o + 4]!) * k;
      ant.body.position.set(x, y);
      ant.body.rotation = prev.ants[o + 2]! + dh * k;
      const frame = Math.floor(((walked % STRIDE) / STRIDE) * GAIT_FRAMES) % GAIT_FRAMES;
      ant.sprite.texture = this.textures[cur.full[i]!]![frame]!;
      const material = cur.ants[o + 6]!;
      if (material !== ant.material) {
        ant.material = material;
        ant.grain.clear();
        // A grain of soil held in the mandibles.
        if (material > 0) ant.grain.circle(GRAIN_AHEAD, 0, 0.55).fill(grainColor(material));
      }
    }
  }
}
