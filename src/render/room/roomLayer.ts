/**
 * The keeper's room (DESIGN.md section 8.1, V1 and V6): a wall with a big
 * window onto Legnano, a roller shutter part way down, a marble sill, and the
 * wooden desk the tank stands on. The room's light follows the real sky; at
 * dusk a desk lamp comes on over the tank so the ants are always visible.
 *
 * Scene units are mm, with the farm's inner top-left corner at (0, 0). The
 * room is drawn in daylight colours and dimmed with tints, which cost nothing.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { type Sky, skyAt } from '../../room/sky';
import type { Weather } from '../../room/weather';
import { GLASS, GLASS_PX_PER_MM, OutsideView, daylight, smooth, sunsetGlow } from './outside';

/** The window's glass in the scene, mm. */
export const WINDOW = {
  x: -25,
  y: -292.5,
  width: GLASS.width / GLASS_PX_PER_MM,
  height: GLASS.height / GLASS_PX_PER_MM,
} as const;
/** Width of the window's wooden frame, mm. */
const FRAME = 15;
/** Where the desk meets the wall, mm below the top of the farm. */
export const DESK_BACK = 150;
/** How far the room reaches in every direction, so zooming out never shows an edge. */
const FAR = 4000;

/** How often the view out of the window is repainted, ms: faster when rain or snow is falling. */
const REPAINT_CALM = 250;
const REPAINT_FALLING = 66;

/** Multiplies a 0xrrggbb colour channel by channel by `level` and blends it toward `warm` by `t`. */
function lightColour(level: number, warm: number, t: number): number {
  const wr = (warm >> 16) & 255;
  const wg = (warm >> 8) & 255;
  const wb = warm & 255;
  const ch = (w: number) => Math.round(Math.min(255, 255 * level * (1 - t) + w * level * t));
  return (ch(wr) << 16) | (ch(wg) << 8) | ch(wb);
}

export class RoomLayer {
  /** Everything behind the tank. */
  readonly root = new Container();
  /** The lamp's warm pool of light, over the tank and the desk. */
  readonly lampGlow: Sprite;
  private readonly outside = new OutsideView();
  private readonly view: Sprite;
  private readonly walls = new Container();
  private readonly desk = new Graphics();
  private lastPaint = -Infinity;
  private lastNow = 0;

  /** The light falling on the tank, as a tint (0xffffff in full daylight). */
  tankTint = 0xffffff;

  constructor() {
    this.view = new Sprite(Texture.from(this.outside.canvas, true));
    this.view.position.set(WINDOW.x, WINDOW.y);
    this.view.width = WINDOW.width;
    this.view.height = WINDOW.height;
    this.walls.addChild(this.drawWall(), this.drawShutter(), this.drawFrame(), this.drawSill());
    this.drawDesk();
    this.lampGlow = new Sprite(glowTexture());
    this.lampGlow.anchor.set(0.5);
    this.lampGlow.position.set(380, 120);
    this.lampGlow.width = 1500;
    this.lampGlow.height = 1000;
    this.lampGlow.blendMode = 'add';
    this.lampGlow.tint = 0xffb46e;
    this.lampGlow.alpha = 0;
    this.root.addChild(this.view, this.walls, this.desk);
  }

  /**
   * Brings the room up to date: `ms` is the real time (Unix ms) that sets the
   * sky, `now` a steady clock in ms for the animation.
   */
  update(ms: number, now: number, weather: Weather): Sky {
    const sky = skyAt(ms);
    const falling = weather.rain > 0 || weather.snow > 0 || weather.storm > 0;
    if (now - this.lastPaint >= (falling ? REPAINT_FALLING : REPAINT_CALM)) {
      this.outside.paint(sky, weather, now, now - this.lastNow);
      this.lastNow = now;
      this.lastPaint = now;
      this.view.texture.source.update();
    }
    // The room's light: the sky's, a little warmer at sunset, a flicker of lightning.
    const day = Math.min(1, daylight(sky, weather) + 0.4 * this.outside.lightning);
    const level = 0.12 + 0.88 * day;
    const sunset = sunsetGlow(sky, weather);
    const lamp = smooth(0.42, 0.12, day);
    const room = lightColour(level, 0xffc89a, 0.35 * sunset);
    this.walls.tint = room;
    this.desk.tint = lightColour(level + 0.25 * lamp, 0xffc48a, Math.max(0.35 * sunset, 0.5 * lamp));
    // The tank is lit by the room, and by the lamp once the room grows dark.
    const tank = Math.max(level, 0.88 * lamp);
    this.tankTint = lightColour(Math.min(1, tank + 0.08), 0xffd9b0, Math.max(0.3 * sunset, 0.4 * lamp * (1 - day)));
    this.lampGlow.alpha = 0.12 * lamp;
    return sky;
  }

  private drawWall(): Graphics {
    // Painted plaster, with the window's opening cut out.
    return new Graphics()
      .rect(-FAR, -FAR, 2 * FAR, FAR + DESK_BACK)
      .fill(0xcfc3ae)
      .rect(WINDOW.x - FRAME, WINDOW.y - FRAME, WINDOW.width + 2 * FRAME, WINDOW.height + 2 * FRAME)
      .cut();
  }

  private drawShutter(): Graphics {
    // A roller shutter (tapparella) let a little way down, its slats showing.
    const g = new Graphics();
    const h = 28.75;
    g.rect(WINDOW.x, WINDOW.y, WINDOW.width, h).fill(0xb9b2a4);
    for (let y = WINDOW.y + 3.75; y < WINDOW.y + h; y += 4.4) g.rect(WINDOW.x, y, WINDOW.width, 0.6).fill(0x8a8478);
    g.rect(WINDOW.x, WINDOW.y + h - 1.5, WINDOW.width, 1.5).fill(0x77716a);
    return g;
  }

  private drawFrame(): Graphics {
    // Painted wood: an outer frame and two casements meeting at a centre post with a brass handle.
    const g = new Graphics();
    const { x, y, width, height } = WINDOW;
    const white = 0xece8e0;
    g.rect(x - FRAME, y - FRAME, width + 2 * FRAME, FRAME).fill(white);
    g.rect(x - FRAME, y + height, width + 2 * FRAME, FRAME).fill(white);
    g.rect(x - FRAME, y - FRAME, FRAME, height + 2 * FRAME).fill(white);
    g.rect(x + width, y - FRAME, FRAME, height + 2 * FRAME).fill(white);
    const post = 356.25;
    g.rect(post - 8.75, y, 17.5, height).fill(white);
    const inner = 0xb8b3aa;
    g.rect(x + 4, y + 4, post - 8.75 - x - 8, height - 8).stroke({ color: inner, width: 1.9 });
    g.rect(post + 12.5, y + 4, x + width - post - 16.5, height - 8).stroke({ color: inner, width: 1.9 });
    g.roundRect(post - 2.5, y + 192, 5, 25, 1.5).fill(0xc9b27a);
    return g;
  }

  private drawSill(): Graphics {
    // A white marble sill, as in most Italian flats.
    return new Graphics()
      .rect(WINDOW.x - 40, WINDOW.y + WINDOW.height + FRAME, WINDOW.width + 80, 10)
      .fill(0xe6e2da)
      .rect(WINDOW.x - 40, WINDOW.y + WINDOW.height + FRAME + 10, WINDOW.width + 80, 1.2)
      .fill(0xb5afa5);
  }

  private drawDesk(): void {
    // A wooden desk top seen from a little above: its planks run toward a point high over the window.
    const g = this.desk;
    const bottom = DESK_BACK + FAR;
    g.rect(-FAR, DESK_BACK, 2 * FAR, FAR).fill(0x8a5f3d);
    g.rect(-FAR, DESK_BACK, 2 * FAR, 2.5).fill(0x4c3423);
    const vx = 443.75;
    const vy = -887.5;
    const front = 300;
    const t = (DESK_BACK - vy) / (front - vy);
    for (let x = -3000; x <= 4000; x += 131) {
      // A plank seam from the wall to the desk's front edge and on, along the same line.
      const x0 = vx + (x - vx) * t;
      const dx = (x - x0) / (front - DESK_BACK);
      g.moveTo(x0, DESK_BACK).lineTo(x0 + dx * (bottom - DESK_BACK), bottom).stroke({ color: 0x6a4a30, width: 1.2 });
    }
    // A soft band of light from the window along the back of the desk.
    for (let i = 0; i < 6; i++) g.rect(-FAR, DESK_BACK + 2.5 + i * 6, 2 * FAR, 6).fill({ color: 0xffffff, alpha: 0.06 - i * 0.01 });
  }
}

/** A round soft spot of light, white in the middle and fading to nothing. */
function glowTexture(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas, true);
}

