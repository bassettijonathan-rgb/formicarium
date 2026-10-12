/**
 * Draws the classic setup (DESIGN.md D1, D11): the sand farm in side view on
 * the left, the arena in top view on the right, joined by a tube. Units in
 * the scene are millimetres; the camera scales them to pixels.
 */
import { Container, Graphics, type Renderer, Sprite, Text, Texture } from 'pixi.js';
import { ARENA_GAP, ARENA_SIZE, FARM_HEIGHT, FARM_WIDTH, TUBE } from '../sim/tank';
import { Place } from '../sim/ants';
import type { FarmSnapshot } from '../worker/protocol';
import { AntLayer } from './antLayer';
import { BroodLayer } from './broodLayer';
import { HeatLayer } from './heatLayer';
import { ArenaLayer } from './arenaLayer';
import { paintSoil } from './soilColors';

/** Thickness of the farm's frame and the arena's walls, in mm. */
const FRAME = 8;
export const ARENA_X = FARM_WIDTH + ARENA_GAP;

export class TankView {
  readonly root = new Container();
  readonly arena: ArenaLayer;
  /** Ants in the farm: on the glass, in the tunnels and in the headspace. */
  readonly farmAnts: AntLayer;
  /** Eggs, larvae and pupae lying in the nest. */
  readonly brood = new BroodLayer();
  /** The heat mat and the temperature overlay. */
  readonly heat = new HeatLayer(FARM_HEIGHT + FRAME);
  private readonly soil = new Sprite();
  private soilCanvas: HTMLCanvasElement | undefined;

  constructor(renderer: Renderer) {
    this.root.addChild(this.heat.mat);
    this.root.addChild(this.drawFarmFrame());
    this.root.addChild(this.soil);
    this.root.addChild(this.heat.overlay);
    this.root.addChild(this.brood.root);
    this.farmAnts = new AntLayer(renderer, Place.farm);
    this.root.addChild(this.farmAnts.root);
    this.root.addChild(this.drawGlass());
    this.root.addChild(this.drawArena());
    this.arena = new ArenaLayer(renderer);
    this.arena.root.position.set(ARENA_X, 0);
    this.root.addChild(this.arena.root);
    this.root.addChild(this.drawBarrier());
    this.root.addChild(this.drawTube());
    this.root.addChild(label('Formicarium · side view', 0, -FRAME - 14));
    this.root.addChild(label('Arena · top view', ARENA_X, -FRAME - 14));
  }

  /** Total extent of the scene in mm, for fitting the camera. */
  static readonly bounds = {
    x: -FRAME - 10,
    y: -FRAME - 24,
    width: ARENA_X + ARENA_SIZE + 2 * FRAME + 20,
    height: FARM_HEIGHT + 2 * FRAME + 40,
  };

  /** Repaints the soil from a snapshot of the farm's layers. */
  setSoil({ width, height, material, moisture, loose }: FarmSnapshot): void {
    const canvas = (this.soilCanvas ??= document.createElement('canvas'));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    paintSoil(material, moisture, image.data, loose);
    ctx.putImageData(image, 0, 0);
    const texture = Texture.from(canvas, true);
    // Crisp grains when zoomed in, instead of a blur.
    texture.source.scaleMode = 'nearest';
    texture.source.update();
    this.soil.texture = texture;
  }

  private drawFarmFrame(): Graphics {
    // A dark plastic frame, with a lid strip along the top.
    return new Graphics()
      .roundRect(-FRAME, -FRAME, FARM_WIDTH + 2 * FRAME, FARM_HEIGHT + 2 * FRAME, 3)
      .fill(0x2b2f36)
      .rect(-FRAME, -FRAME, FARM_WIDTH + 2 * FRAME, FRAME)
      .fill(0x3a404a);
  }

  private drawGlass(): Graphics {
    // Faint diagonal reflections on the front pane.
    const g = new Graphics();
    g.poly([60, 0, 100, 0, 40, FARM_HEIGHT, 0, FARM_HEIGHT]).fill({ color: 0xffffff, alpha: 0.04 });
    g.poly([120, 0, 132, 0, 72, FARM_HEIGHT, 60, FARM_HEIGHT]).fill({ color: 0xffffff, alpha: 0.03 });
    g.rect(0, 0, FARM_WIDTH, FARM_HEIGHT).stroke({ color: 0xbfd4e6, alpha: 0.25, width: 0.6 });
    return g;
  }

  private drawArena(): Graphics {
    const g = new Graphics();
    // Walls seen from above, then the floor: a pale plaster base, as many keepers use.
    g.roundRect(ARENA_X - FRAME, -FRAME, ARENA_SIZE + 2 * FRAME, ARENA_SIZE + 2 * FRAME, 3).fill(0x2b2f36);
    g.rect(ARENA_X, 0, ARENA_SIZE, ARENA_SIZE).fill(0xd9d2c3);
    return g;
  }

  /** The escape barrier: a slippery band (fluon or oil) round the top of the arena's walls. */
  private drawBarrier(): Graphics {
    return new Graphics()
      .rect(ARENA_X - 3, -3, ARENA_SIZE + 6, ARENA_SIZE + 6)
      .stroke({ color: 0xe8eef4, alpha: 0.5, width: 2 });
  }

  private drawTube(): Graphics {
    // Clear vinyl tubing from the farm's headspace to the arena's left wall.
    const x0 = FARM_WIDTH + FRAME;
    const x1 = ARENA_X - FRAME;
    const mid = (x0 + x1) / 2;
    const path = (g: Graphics) =>
      g.moveTo(x0 - FRAME, TUBE.farmY).bezierCurveTo(mid, TUBE.farmY, mid, TUBE.arenaY, x1 + FRAME, TUBE.arenaY);
    const g = new Graphics();
    path(g).stroke({ color: 0xbfd4e6, alpha: 0.35, width: TUBE.diameter + 2 });
    path(g).stroke({ color: 0x15171a, alpha: 0.9, width: TUBE.diameter });
    return g;
  }
}

function label(text: string, x: number, y: number): Text {
  const t = new Text({ text, style: { fill: 0x9aa4b1, fontSize: 9, fontFamily: 'system-ui, sans-serif' }, resolution: 8 });
  t.position.set(x, y);
  return t;
}
