import { describe, expect, it } from 'vitest';
import { makeProjection } from '../src/render/projection';

const options = { width: 400, height: 300, frontX: 600, frontY: 390, scale: 1.05 };

describe('the angled view of the arena (DESIGN.md A3)', () => {
  it('puts the middle of the front edge where asked, at the asked scale', () => {
    const p = makeProjection({ tilt: 40, ...options });
    const q = p.toScene(200, 300);
    expect(q.x).toBeCloseTo(600, 9);
    expect(q.y).toBeCloseTo(390, 9);
    // The far edge is smaller than the near one; walls stand up (a point above the floor is higher on screen).
    const near = p.toScene(400, 300).x - p.toScene(0, 300).x;
    const far = p.toScene(400, 0).x - p.toScene(0, 0).x;
    expect(far).toBeLessThan(near * 0.9);
    expect(p.toScene(0, 0, 100).y).toBeLessThan(p.toScene(0, 0).y);
  });

  it('maps a tap back to the floor point under it', () => {
    for (const tilt of [40, 90]) {
      const p = makeProjection({ tilt, ...options });
      for (const [u, v] of [
        [0, 0],
        [400, 300],
        [123.4, 56.7],
        [350, 10],
      ] as const) {
        const q = p.toScene(u, v);
        const f = p.toFloor(q.x, q.y);
        expect(f.u).toBeCloseTo(u, 6);
        expect(f.v).toBeCloseTo(v, 6);
      }
    }
  });

  it('stretches things lying on the floor as the floor itself is stretched', () => {
    const p = makeProjection({ tilt: 40, ...options });
    for (const [u, v] of [
      [100, 50],
      [300, 250],
    ] as const) {
      const e = 0.01;
      const s = p.stretch(u, v);
      expect((p.toScene(u + e, v).x - p.toScene(u - e, v).x) / (2 * e)).toBeCloseTo(s.sx, 4);
      expect((p.toScene(u, v + e).y - p.toScene(u, v - e).y) / (2 * e)).toBeCloseTo(s.sy, 4);
    }
  });

  it('draws the floor straight from above with the switch, at one scale everywhere', () => {
    const p = makeProjection({ tilt: 90, ...options });
    expect(p.stretch(10, 10).sx).toBeCloseTo(1.05, 9);
    expect(p.stretch(390, 290).sy).toBeCloseTo(1.05, 9);
    expect(p.vanishingPoint.y).toBe(-Infinity);
  });

  it('runs lines going away from the viewer toward one vanishing point', () => {
    const p = makeProjection({ tilt: 40, ...options });
    const vp = p.vanishingPoint;
    for (const u of [0, 150, 400]) {
      const a = p.toScene(u, 300);
      const b = p.toScene(u, 0);
      // The point where the line through a and b reaches the vanishing point's height.
      const t = (vp.y - a.y) / (b.y - a.y);
      expect(a.x + t * (b.x - a.x)).toBeCloseTo(vp.x, 6);
    }
  });
});
