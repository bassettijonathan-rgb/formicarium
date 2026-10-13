/**
 * Draws the tank (DESIGN.md D1, D11, A3, 3.5): the nest on the left, the
 * arena seen from above at an angle on the right, joined by a tube. The nest
 * is a bought nest lying on the desk, seen at the arena's angle; a tank
 * kept from before bought nests still has its sand farm, standing in side
 * view. Units in the scene are millimetres; the camera scales them to pixels.
 * The tank stands in the keeper's room (DESIGN.md section 8.1), which is
 * drawn behind it; the farm's headspace is clear glass, so the window shows
 * through it.
 */
import { Container, Graphics, type Renderer, Sprite, Texture } from 'pixi.js';
import { FARM_HEIGHT, FARM_WIDTH, TUBE } from '../sim/tank';
import { Place } from '../sim/ants';
import type { FarmSnapshot, HeatSnapshot } from '../worker/protocol';
import { NestView } from './nestView';
import { AntLayer } from './antLayer';
import { BroodLayer } from './broodLayer';
import { HeatLayer } from './heatLayer';
import { ArenaLayer } from './arenaLayer';
import { clearHeadspace, paintSoil } from './soilColors';

/** Thickness of the farm's frame, in mm. */
const FRAME = 8;

export class TankView {
  readonly root = new Container();
  /** Everything the room's light falls on: tinted as the light changes. */
  readonly lit = new Container();
  readonly arena: ArenaLayer;
  /** Ants in the farm: on the glass, in the tunnels and in the headspace. */
  readonly farmAnts: AntLayer;
  /** Eggs, larvae and pupae lying in the nest. */
  readonly brood = new BroodLayer();
  /** The heat mat and the temperature overlay. */
  readonly heat = new HeatLayer(FARM_HEIGHT + FRAME);
  /** A ring round the ant in the inspector (M6b), drawn by the page to suit the zoom. */
  readonly marker = new Graphics();
  private readonly soil = new Sprite();
  private readonly tube = new Graphics();
  private soilCanvas: HTMLCanvasElement | undefined;
  /** The sand farm, standing (tanks kept from before bought nests). */
  private readonly sand = new Container();
  /** The bought nest, lying on the desk. */
  readonly nest = new NestView();
  /** The nest's size, mm, and whether it is a bought nest (else the sand farm). */
  private farmWidth = FARM_WIDTH;
  private bought = false;

  constructor(renderer: Renderer) {
    const lit = this.lit;
    this.farmAnts = new AntLayer(renderer, Place.farm);
    this.sand.addChild(this.heat.mat, this.drawFarmFrame(), this.soil, this.drawGlass());
    lit.addChild(this.sand);
    this.nest.root.visible = false;
    lit.addChild(this.nest.root);
    this.placeFarmLayers();
    lit.addChild(this.tube);
    this.arena = new ArenaLayer(renderer);
    lit.addChild(this.arena.root);
    this.arena.onLayout = () => this.drawTube();
    this.drawTube();
    this.root.addChild(lit);
    this.marker.visible = false;
    this.root.addChild(this.marker);
  }

  /**
   * Puts the layers drawn on the nest's floor (mould, brood, ants, and the
   * warmth or damp overlay) in the sand farm or in the bought nest. In the
   * farm the overlay is a reading laid over the tank, out of the room's
   * light; in a bought nest it lies on the chambers' floor, under the walls.
   */
  private placeFarmLayers(): void {
    if (this.bought) {
      this.nest.below.addChild(this.heat.overlay, this.heat.mould);
      this.nest.above.addChild(this.brood.root, this.farmAnts.root);
    } else {
      // Under the glass reflections: the soil's sprite is followed by them in `sand`.
      const at = this.sand.getChildIndex(this.soil) + 1;
      this.sand.addChildAt(this.farmAnts.root, at);
      this.sand.addChildAt(this.brood.root, at);
      this.sand.addChildAt(this.heat.mould, at);
      this.root.addChild(this.heat.overlay);
      this.root.addChild(this.marker);
    }
  }

  /** The tank and the window behind it, in mm, for fitting the camera. */
  get bounds(): { x: number; y: number; width: number; height: number } {
    const a = this.arena.bounds;
    // A bought nest lies on the desk, low in the picture: show less of the window over it.
    const x = this.bought ? Math.min(-20, this.nest.bounds.x - 30) : -50;
    const y = this.bought ? -150 : -315;
    return { x, y, width: Math.max(a.x + a.width + 20, 790) - x, height: Math.max(a.y + a.height + 20, FARM_HEIGHT + FRAME + 60) - y };
  }

  /** True while the nest and the arena are seen at an angle; false shows both straight from above. */
  get angled(): boolean {
    return this.arena.angled;
  }

  set angled(on: boolean) {
    this.arena.angled = on;
    this.nest.angled = on;
    this.drawTube();
  }

  /** The farm ant drawn nearest the scene point (x, y) within `reach` scene mm, or -1. */
  farmAntAt(x: number, y: number, reach: number): number {
    if (!this.bought) return this.farmAnts.nearest(x, y, reach);
    const p = this.nest.toFloor(x, y);
    return this.farmAnts.nearest(p.u, p.v, reach / 0.7);
  }

  /** Where farm ant `i` is drawn, in the scene, or null when it is not in the nest. */
  farmAntPosition(i: number): { x: number; y: number } | null {
    const p = this.farmAnts.positionOf(i);
    if (!p || !this.bought) return p;
    return this.nest.floorToScene(p.x, p.y);
  }

  /** Width of the nest, mm (where the heat mat can go). */
  get nestWidth(): number {
    return this.farmWidth;
  }

  /** True for a bought nest, false for the sand farm. */
  get boughtNest(): boolean {
    return this.bought;
  }

  /** Draws the warmth: the heat mat, the overlay and the mould. */
  setHeat(snapshot: HeatSnapshot): void {
    this.heat.setHeat(snapshot);
    this.nest.setMat(snapshot.mat);
    this.nest.setCover(snapshot.lit);
  }

  /** Repaints the soil, or the bought nest, from a snapshot of the farm's layers. */
  setSoil(snapshot: FarmSnapshot): void {
    const { width, height, material, moisture, loose, nest } = snapshot;
    this.farmWidth = width;
    if ((nest !== null) !== this.bought) {
      this.bought = nest !== null;
      this.sand.visible = !this.bought;
      this.nest.root.visible = this.bought;
      this.placeFarmLayers();
    }
    if (nest) {
      this.nest.setNest(nest, width, height, material, moisture);
      this.drawTube();
      return;
    }
    const canvas = (this.soilCanvas ??= document.createElement('canvas'));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    paintSoil(material, moisture, image.data, loose);
    clearHeadspace(material, width, height, image.data);
    ctx.putImageData(image, 0, 0);
    const texture = Texture.from(canvas, true);
    // Crisp grains when zoomed in, instead of a blur.
    texture.source.scaleMode = 'nearest';
    texture.source.update();
    this.soil.texture = texture;
  }

  private drawFarmFrame(): Graphics {
    // A dark plastic frame round clear glass, a lid strip along the top, and two feet on the desk.
    return new Graphics()
      .roundRect(-FRAME, -FRAME, FARM_WIDTH + 2 * FRAME, FARM_HEIGHT + 2 * FRAME, 3)
      .fill(0x2b2f36)
      .rect(0, 0, FARM_WIDTH, FARM_HEIGHT)
      .cut()
      .rect(-FRAME, -FRAME, FARM_WIDTH + 2 * FRAME, FRAME)
      .fill(0x3a404a)
      .roundRect(-FRAME - 9, FARM_HEIGHT + FRAME - 4, 45, 6, 1.5)
      .fill(0x23262b)
      .roundRect(FARM_WIDTH + FRAME - 36, FARM_HEIGHT + FRAME - 4, 45, 6, 1.5)
      .fill(0x23262b)
      .rect(0, 0, FARM_WIDTH, FARM_HEIGHT)
      .fill({ color: 0xbfd4e6, alpha: 0.05 });
  }

  private drawGlass(): Graphics {
    // Faint diagonal reflections on the front pane.
    const g = new Graphics();
    g.poly([60, 0, 100, 0, 40, FARM_HEIGHT, 0, FARM_HEIGHT]).fill({ color: 0xffffff, alpha: 0.04 });
    g.poly([120, 0, 132, 0, 72, FARM_HEIGHT, 60, FARM_HEIGHT]).fill({ color: 0xffffff, alpha: 0.03 });
    g.rect(0, 0, FARM_WIDTH, FARM_HEIGHT).stroke({ color: 0xbfd4e6, alpha: 0.25, width: 0.6 });
    return g;
  }

  private drawTube(): void {
    // Clear vinyl tubing from the farm's headspace, or the bought nest's port, across the desk into the arena's left wall.
    const end = this.arena.mouth;
    const start = this.bought ? this.nest.port : { x: FARM_WIDTH, y: TUBE.farmY };
    const reach = Math.min(70, (end.x - start.x) / 2.5);
    const path = (g: Graphics) => g.moveTo(start.x, start.y).bezierCurveTo(start.x + reach, start.y, end.x - reach, end.y, end.x, end.y);
    const g = this.tube.clear();
    path(g).stroke({ color: 0xbfd4e6, alpha: 0.35, width: TUBE.diameter + 2 });
    path(g).stroke({ color: 0x15171a, alpha: 0.9, width: TUBE.diameter });
  }
}
