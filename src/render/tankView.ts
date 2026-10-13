/**
 * Draws the classic setup (DESIGN.md D1, D11, A3): the sand farm in side view
 * on the left, the arena seen from above at an angle on the right, joined by
 * a tube. Units in
 * the scene are millimetres; the camera scales them to pixels. The tank
 * stands in the keeper's room (DESIGN.md section 8.1), which is drawn behind
 * it; the farm's headspace is clear glass, so the window shows through it.
 */
import { Container, Graphics, type Renderer, Sprite, Texture } from 'pixi.js';
import { FARM_HEIGHT, FARM_WIDTH, TUBE } from '../sim/tank';
import { Place } from '../sim/ants';
import type { FarmSnapshot } from '../worker/protocol';
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

  constructor(renderer: Renderer) {
    const lit = this.lit;
    lit.addChild(this.heat.mat);
    lit.addChild(this.drawFarmFrame());
    lit.addChild(this.soil);
    lit.addChild(this.heat.mould);
    lit.addChild(this.brood.root);
    this.farmAnts = new AntLayer(renderer, Place.farm);
    lit.addChild(this.farmAnts.root);
    lit.addChild(this.drawGlass());
    lit.addChild(this.tube);
    this.arena = new ArenaLayer(renderer);
    lit.addChild(this.arena.root);
    this.arena.onLayout = () => this.drawTube();
    this.drawTube();
    this.root.addChild(lit);
    // The overlays are readings, not things in the room: the room's light doesn't dim them.
    this.root.addChild(this.heat.overlay);
    this.marker.visible = false;
    this.root.addChild(this.marker);
  }

  /** The tank and the window behind it, in mm, for fitting the camera. */
  get bounds(): { x: number; y: number; width: number; height: number } {
    const a = this.arena.bounds;
    const x = -50;
    const y = -315;
    return { x, y, width: Math.max(a.x + a.width + 20, 790) - x, height: Math.max(a.y + a.height + 20, FARM_HEIGHT + FRAME + 60) - y };
  }

  /** Repaints the soil from a snapshot of the farm's layers. */
  setSoil({ width, height, material, moisture, loose }: FarmSnapshot): void {
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
    // Clear vinyl tubing from the farm's headspace, down across the desk, into the arena's left wall.
    const x0 = FARM_WIDTH + FRAME;
    const end = this.arena.mouth;
    const path = (g: Graphics) =>
      g.moveTo(x0 - FRAME, TUBE.farmY).bezierCurveTo(x0 + 70, TUBE.farmY, end.x - 70, end.y, end.x, end.y);
    const g = this.tube.clear();
    path(g).stroke({ color: 0xbfd4e6, alpha: 0.35, width: TUBE.diameter + 2 });
    path(g).stroke({ color: 0x15171a, alpha: 0.9, width: TUBE.diameter });
  }
}
