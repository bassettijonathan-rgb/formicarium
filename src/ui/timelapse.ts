/**
 * The timelapse of the nest (M6c): the pictures of the nest the world keeps,
 * played on a canvas. Each picture is one bit per cell (solid or air); the
 * soil is coloured as it was when the tank was set up, and solid cells that
 * were air then (spoil the ants dumped) as loose grains.
 */
import { Material } from '../sim/materials';
import { paintSoil } from '../render/soilColors';

/** Moisture the timelapse draws soil at: a little damp. */
const DAMP = 70;

export class Timelapse {
  private frame = 0;
  private timer: number | undefined;
  private readonly image: ImageData;
  private readonly material: Uint8Array;
  private readonly loose: Uint8Array;
  private readonly moisture: Uint8Array;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly width: number,
    private readonly height: number,
    /** The farm's soil when the tank was set up. */
    private readonly soil: Uint8Array,
    private frames: Uint8Array[],
    private steps: number[],
    private readonly onFrame: (step: number, n: number, of: number) => void,
  ) {
    canvas.width = width;
    canvas.height = height;
    this.image = new ImageData(width, height);
    this.material = new Uint8Array(width * height);
    this.loose = new Uint8Array(width * height);
    this.moisture = new Uint8Array(width * height).fill(DAMP);
    this.show(frames.length - 1);
  }

  get length(): number {
    return this.frames.length;
  }

  /** Takes in newer pictures, keeping the current one in view. */
  update(frames: Uint8Array[], steps: number[]): void {
    const at = this.steps[this.frame];
    this.frames = frames;
    this.steps = steps;
    const n = at === undefined ? frames.length - 1 : steps.findIndex((s) => s >= at);
    this.show(n < 0 ? frames.length - 1 : n);
  }

  show(n: number): void {
    if (this.frames.length === 0) return;
    this.frame = Math.max(0, Math.min(this.frames.length - 1, n));
    const bits = this.frames[this.frame]!;
    for (let c = 0; c < this.material.length; c++) {
      const solid = (bits[c >> 3]! >> (c & 7)) & 1;
      const was = this.soil[c]!;
      this.material[c] = solid ? (was === Material.air ? Material.sand : was) : Material.air;
      this.loose[c] = solid && was === Material.air ? 1 : 0;
    }
    paintSoil(this.material, this.moisture, this.image.data, this.loose);
    this.canvas.getContext('2d')!.putImageData(this.image, 0, 0);
    this.onFrame(this.steps[this.frame]!, this.frame, this.frames.length);
  }

  get playing(): boolean {
    return this.timer !== undefined;
  }

  /** Plays from the start (or from where it is, if not at the end) at about 12 pictures a second. */
  play(): void {
    this.stop();
    if (this.frame >= this.frames.length - 1) this.show(0);
    this.timer = window.setInterval(() => {
      if (this.frame < this.frames.length - 1) return this.show(this.frame + 1);
      this.stop();
      this.show(this.frame); // tells the page it has stopped
    }, 80);
  }

  stop(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }
}
