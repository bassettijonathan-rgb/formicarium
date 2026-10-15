/**
 * The ants in one place (the arena or the farm), drawn from the worker's
 * snapshots. Motion is interpolated between the last two snapshots so ants
 * glide smoothly at any simulation speed. Positions are in that place's mm;
 * the layer is put where the place is in the scene. In the angled arena
 * (DESIGN.md A3) a projection places each ant and flattens it in depth, after
 * turning it, so it lies on the floor as seen from above at an angle.
 */
import { Container, Graphics, type Renderer, Sprite, type Texture } from 'pixi.js';
import { AntState, Caste } from '../sim/ants';
import { ANT_STRIDE, type AntsSnapshot, type PieceView } from '../worker/protocol';
import { drawPiece } from './insects';
import { ANT_SCALE, CROP, GAIT_FRAMES, MAJOR_LENGTH, STRIDE, makeAntTextures, makeDeadTexture, speciesSize, workerLength } from './antSprites';
import { grainColor } from './soilColors';

/** Where a carried grain sits, ahead of the head, in mm. */
const GRAIN_AHEAD = 2.6;
/** Where the near end of a carried piece of insect is, ahead of the ant's middle, mm (as `HELD_AHEAD` in prey.ts). */
const PIECE_AHEAD = 2.5;

/** One species' textures: a worker, a callow, one with its gaster raised in alarm, and the dead. */
interface SpeciesTextures {
  normal: Texture[][];
  pale: Texture[][];
  raised: Texture[][];
  /** A Messor major (its big head). */
  major: Texture[][];
  dead: Texture;
}

/** Made once per species, when first needed, and shared by every layer. */
const shared = new Map<number, SpeciesTextures>();

function texturesFor(renderer: Renderer, species: number): SpeciesTextures {
  let t = shared.get(species);
  if (!t) {
    t = {
      normal: makeAntTextures(renderer, false, species),
      pale: makeAntTextures(renderer, true, species),
      raised: makeAntTextures(renderer, false, species, true),
      major: makeAntTextures(renderer, false, species, false, true),
      dead: makeDeadTexture(renderer, species),
    };
    shared.set(species, t);
  }
  return t;
}

/** Where an ant at (x, y) on its floor is drawn, how it is stretched across and in depth, and its drawing order (nearer is higher). */
export type AntProjection = (x: number, y: number) => { x: number; y: number; sx: number; sy: number; z: number };

export class AntLayer {
  readonly root = new Container();
  /** Set for the angled arena; null draws the place flat, as it is. */
  project: AntProjection | null = null;
  private readonly ants: { at: Container; body: Container; sprite: Sprite; grain: Graphics; material: number; piece: Graphics; pieceKey: string }[] = [];
  /** The piece of insect each ant carries, by ant (Arena 3). */
  private carried = new Map<number, PieceView>();

  /** The two latest snapshots and when the newer one arrived. */
  private previous: AntsSnapshot | undefined;
  private current: AntsSnapshot | undefined;
  private arrivedAt = 0;
  private interval = 50;

  /** `place` is the `Place` whose ants this layer draws. */
  constructor(
    private readonly renderer: Renderer,
    private readonly place: number,
  ) {}

  setAnts(snapshot: AntsSnapshot, now: number): void {
    if (this.current) this.interval = Math.min(200, Math.max(16, now - this.arrivedAt));
    this.previous = this.current;
    this.current = snapshot;
    this.arrivedAt = now;
    this.carried = new Map(snapshot.carried.map((c) => [c.ant, c.piece]));
    while (this.ants.length < snapshot.full.length) {
      const sprite = new Sprite(texturesFor(this.renderer, snapshot.species).normal[0]![0]);
      sprite.anchor.set(0.5);
      sprite.scale.set(ANT_SCALE);
      const grain = new Graphics();
      const piece = new Graphics();
      const body = new Container();
      body.addChild(sprite, grain, piece);
      const at = new Container();
      at.addChild(body);
      this.ants.push({ at, body, sprite, grain, material: 0, piece, pieceKey: '' });
      this.root.addChild(at);
    }
  }

  /** Where ant `i` is drawn this frame, in the layer's coordinates, or null when it is not here. */
  positionOf(i: number): { x: number; y: number } | null {
    const ant = this.ants[i];
    return ant && ant.at.visible ? { x: ant.at.position.x, y: ant.at.position.y } : null;
  }

  /** The ant drawn nearest (x, y) within `radius` mm, living ants before the dead, or -1. */
  nearest(x: number, y: number, radius: number): number {
    let best = -1;
    let bestD = radius * radius;
    let bestDead = true;
    for (let i = 0; i < this.ants.length; i++) {
      const at = this.ants[i]!.at;
      if (!at.visible) continue;
      const d = (at.position.x - x) ** 2 + (at.position.y - y) ** 2;
      if (d > radius * radius) continue;
      const dead = this.current?.ants[i * ANT_STRIDE + 3] === AntState.dead;
      if ((bestDead && !dead) || (dead === bestDead && d < bestD)) {
        best = i;
        bestD = d;
        bestDead = dead;
      }
    }
    return best;
  }

  /** Places the ants for this frame. */
  update(now: number): void {
    const cur = this.current;
    if (!cur) return;
    const prev = this.previous && this.previous.full.length === cur.full.length ? this.previous : cur;
    const t = Math.min(1, (now - this.arrivedAt) / this.interval);
    const looks = texturesFor(this.renderer, cur.species);
    const size = speciesSize(cur.species);
    for (let i = 0; i < this.ants.length; i++) {
      const ant = this.ants[i]!;
      const o = i * ANT_STRIDE;
      ant.at.visible = cur.ants[o + 5] === this.place && cur.ants[o + 3] !== AntState.inNest;
      if (!ant.at.visible) continue;
      // Interpolate only if the ant was here in the previous snapshot too.
      const k = prev.ants[o + 5] === this.place && prev.ants[o + 3] !== AntState.inNest ? t : 1;
      const x = prev.ants[o]! + (cur.ants[o]! - prev.ants[o]!) * k;
      const y = prev.ants[o + 1]! + (cur.ants[o + 1]! - prev.ants[o + 1]!) * k;
      let dh = cur.ants[o + 2]! - prev.ants[o + 2]!;
      dh -= 2 * Math.PI * Math.round(dh / (2 * Math.PI));
      const walked = prev.ants[o + 4]! + (cur.ants[o + 4]! - prev.ants[o + 4]!) * k;
      if (this.project) {
        const p = this.project(x, y);
        ant.at.position.set(p.x, p.y);
        ant.at.scale.set(p.sx, p.sy);
        // Nearer ants are drawn over farther ones and over what they walk behind.
        ant.at.zIndex = p.z;
      } else ant.at.position.set(x, y);
      ant.body.rotation = prev.ants[o + 2]! + dh * k;
      const frame = Math.floor(((walked % STRIDE) / STRIDE) * GAIT_FRAMES) % GAIT_FRAMES;
      // An alarmed worker shows it (a Crematogaster raises its gaster); a callow is pale.
      // A Messor major has a big head.
      const length = cur.size[i]! > 0 ? cur.size[i]! / 10 : 0;
      const textures = cur.alarmed[i] ? looks.raised : cur.callow[i] ? looks.pale : length >= MAJOR_LENGTH ? looks.major : looks.normal;
      ant.sprite.texture = textures[cur.full[i]!]![frame]!;
      // A queen is two to three times a worker's length, her gaster always swollen; a worker of a species of many sizes is drawn at its own.
      const queen = cur.caste[i] === Caste.queen;
      const scale = queen ? size.queen * size.worker : workerLength(cur.species, cur.size[i]!);
      ant.sprite.scale.set(scale * ANT_SCALE);
      if (queen) ant.sprite.texture = looks.normal[1]![frame]!;
      if (cur.ants[o + 3] === AntState.dead) ant.sprite.texture = looks.dead;
      // What is at the mouth: a grain of soil (its material), a droplet being shared (-1), or nothing (0).
      const held = cur.ants[o + 3] === AntState.sharing ? -1 : cur.ants[o + 6]!;
      if (held !== ant.material) {
        ant.material = held;
        ant.grain.clear();
        if (held > 0) ant.grain.circle(GRAIN_AHEAD, 0, 0.55).fill(grainColor(held));
        else if (held < 0) ant.grain.circle(GRAIN_AHEAD - 0.4, 0, 0.35).fill({ color: CROP, alpha: 0.9 });
      }
      // A piece of insect in its mandibles, held out ahead.
      const piece = this.carried.get(i);
      const key = piece ? `${piece.insect}:${piece.part}:${piece.look}` : '';
      if (key !== ant.pieceKey) {
        ant.pieceKey = key;
        ant.piece.clear();
        if (piece) {
          drawPiece(ant.piece, piece);
          // Held at its mandibles: further ahead for a bigger worker.
          ant.piece.position.set((PIECE_AHEAD * scale) / size.worker + piece.length / 2, 0);
        }
      }
    }
  }
}
