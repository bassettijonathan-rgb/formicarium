/**
 * Pan and zoom for the scene: drag to pan, wheel or pinch to zoom around the
 * pointer. The scene is in mm; `scale` is pixels per mm.
 */
import type { Container } from 'pixi.js';

const MIN_SCALE = 0.5;
const MAX_SCALE = 120;

export class Camera {
  constructor(
    private readonly target: Container,
    private readonly element: HTMLElement,
  ) {
    element.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    element.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    element.addEventListener('pointermove', (e) => this.onPointerMove(e));
    element.addEventListener('pointerup', (e) => this.onPointerUp(e));
    element.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  private readonly pointers = new Map<number, { x: number; y: number }>();
  /** Where the current press started and whether it has moved enough to be a drag. */
  private press: { x: number; y: number; dragged: boolean } | undefined;

  /** Called with element-relative pixel coordinates when the user clicks or taps without dragging. */
  onTap: ((x: number, y: number) => void) | undefined;

  /** Fits a rectangle (in mm) to the element with a margin, leaving `top` pixels free for the panel. */
  fit(bounds: { x: number; y: number; width: number; height: number }, top = 0): void {
    const w = this.element.clientWidth;
    const h = this.element.clientHeight - top;
    const scale = Math.min(w / bounds.width, h / bounds.height) * 0.94;
    this.target.scale.set(scale);
    this.target.position.set(
      (w - bounds.width * scale) / 2 - bounds.x * scale,
      top + (h - bounds.height * scale) / 2 - bounds.y * scale,
    );
  }

  private zoomAt(px: number, py: number, factor: number): void {
    const old = this.target.scale.x;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, old * factor));
    const k = scale / old;
    this.target.position.set(px - (px - this.target.position.x) * k, py - (py - this.target.position.y) * k);
    this.target.scale.set(scale);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.element.getBoundingClientRect();
    this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
  }

  private onPointerDown(e: PointerEvent): void {
    this.element.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.press = this.pointers.size === 1 ? { x: e.clientX, y: e.clientY, dragged: false } : undefined;
  }

  private onPointerMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 5) this.press.dragged = true;
    if (this.pointers.size === 1) {
      this.target.position.x += e.clientX - prev.x;
      this.target.position.y += e.clientY - prev.y;
    } else if (this.pointers.size === 2) {
      // Pinch: zoom by the change in distance between the two fingers.
      const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        const rect = this.element.getBoundingClientRect();
        if (before > 0) {
          this.zoomAt((e.clientX + other.x) / 2 - rect.left, (e.clientY + other.y) / 2 - rect.top, after / before);
        }
      }
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  private onPointerUp(e: PointerEvent): void {
    const wasTap = e.type === 'pointerup' && this.press && !this.press.dragged && this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    if (wasTap) {
      const rect = this.element.getBoundingClientRect();
      this.onTap?.(e.clientX - rect.left, e.clientY - rect.top);
    }
    if (this.pointers.size === 0) this.press = undefined;
  }
}
