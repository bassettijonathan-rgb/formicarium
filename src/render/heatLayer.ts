/**
 * Warmth in the farm (DESIGN.md section 7.6): the heat mat under the farm's
 * bottom edge, and an overlay of the farm's temperatures, blue where it is
 * cool and red where it is warm, drawn from the worker's snapshots.
 */
import { Graphics, Sprite, Texture } from 'pixi.js';
import type { HeatSnapshot } from '../worker/protocol';

/** The overlay's colour scale, °C: blue at `COOL` and below, red at `HOT` and above. */
const COOL = 18;
const HOT = 34;

export class HeatLayer {
  /** The temperature overlay, over the soil. */
  readonly overlay = new Sprite();
  /** The heat mat, drawn under the farm. */
  readonly mat = new Graphics();
  private canvas: HTMLCanvasElement | undefined;

  constructor(private readonly farmBottom: number) {
    this.overlay.alpha = 0.45;
    this.overlay.visible = false;
  }

  set showWarmth(on: boolean) {
    this.overlay.visible = on;
  }

  setHeat(snapshot: HeatSnapshot): void {
    this.mat.clear();
    if (snapshot.mat) {
      // A flat silicone mat, its heating wire showing as faint lines.
      const { x, width } = snapshot.mat;
      this.mat.roundRect(x, this.farmBottom, width, 5, 1.5).fill(0x8a3b22);
      for (let wx = x + 4; wx < x + width - 2; wx += 6) this.mat.rect(wx, this.farmBottom + 1, 0.6, 3).fill({ color: 0xd9824f, alpha: 0.7 });
    }
    if (!this.overlay.visible) return;
    const { width, height, cell, temperature } = snapshot;
    const canvas = (this.canvas ??= document.createElement('canvas'));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const f = Math.min(1, Math.max(0, (temperature[i]! - COOL) / (HOT - COOL)));
      image.data[4 * i] = Math.round(40 + 215 * f);
      image.data[4 * i + 1] = Math.round(90 + 60 * (1 - Math.abs(2 * f - 1)));
      image.data[4 * i + 2] = Math.round(230 * (1 - f) + 25);
      image.data[4 * i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const texture = Texture.from(canvas, true);
    texture.source.update();
    this.overlay.texture = texture;
    this.overlay.scale.set(cell);
  }
}
