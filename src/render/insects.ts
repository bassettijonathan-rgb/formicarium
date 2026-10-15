/**
 * Feeder insects and their pieces (DESIGN.md 3.4, B6), and seeds (Messor
 * barbarus, DESIGN.md 4.4), drawn procedurally in
 * mm round their own middle, pointing along +x (toward the head). Callers set
 * the transform that puts a piece where it lies.
 */
import type { Graphics } from 'pixi.js';
import type { Insect } from '../sim/prey';
import { Look, type PieceView } from '../worker/protocol';

const COLOURS: Record<Insect, { body: number; dark: number; light: number }> = {
  fly: { body: 0x6b5a3e, dark: 0x2e261c, light: 0xb89a62 },
  cricket: { body: 0x8a6236, dark: 0x4a3218, light: 0xc49a5e },
  mealworm: { body: 0xd2a24a, dark: 0x7a5420, light: 0xeacb82 },
};

/**
 * Seed colours by size (keepers' mixes): poppy and chia (slate), millet
 * (cream), rape and grass seed (brown), canary seed (straw), wheat (gold).
 */
const SEEDS = [
  { most: 1.6, colours: [0x4a4f58, 0x5b5148, 0xe0cf98] },
  { most: 2.6, colours: [0xe0cf98, 0x7a5232, 0x4a4f58] },
  { most: 3.6, colours: [0xcdb67a, 0x7a5232, 0xd8c08a] },
  { most: Infinity, colours: [0xc79a4e, 0xd8c08a, 0xb8894a] },
];

/** A seed: a smooth, shiny ellipse; cracked open it shows its pale kernel; a husk is two split halves of coat. */
function drawSeed(g: Graphics, p: PieceView): void {
  const L = p.length / 2;
  const W = p.width / 2;
  const sizes = SEEDS.find((s) => p.length <= s.most)!;
  // Which seed of the mix this is, from its size: the same seed always looks the same.
  const colour = sizes.colours[Math.floor(p.length * 1000) % sizes.colours.length]!;
  if (p.look === Look.husk) {
    for (const s of [-1, 1]) g.ellipse(0, s * W * 0.55, L, W * 0.45).fill({ color: mix(colour, 0xe8dcc0, 0.4), alpha: 0.7 });
    return;
  }
  g.ellipse(0, 0, L, W).fill(colour);
  g.ellipse(L * 0.6, 0, L * 0.25, W * 0.3).fill({ color: mix(colour, 0x000000, 0.35), alpha: 0.6 });
  g.ellipse(-L * 0.2, -W * 0.35, L * 0.45, W * 0.22).fill({ color: 0xffffff, alpha: 0.35 });
  if (p.look === Look.open) {
    // Cracked: the coat split along its length, the kernel showing.
    g.ellipse(0, 0, L * 0.75, W * 0.45).fill(0xf2e8cc);
    g.moveTo(-L, 0).lineTo(L, 0).stroke({ color: mix(colour, 0x000000, 0.5), width: Math.max(0.08, W * 0.12) });
  }
  if (p.look === Look.mouldy) {
    g.ellipse(0, 0, L * 1.2, W * 1.4 + 0.2).fill({ color: 0xd6e2be, alpha: 0.55 });
    for (let a = 0; a < 5; a++) g.circle(L * 0.8 * Math.cos(a * 2.1), (W + 0.1) * Math.sin(a * 1.7), Math.min(0.4, W * 0.4 + 0.1)).fill({ color: 0xeef3e2, alpha: 0.6 });
  }
}

/** Draws `p` at the origin, its head end toward +x. */
export function drawPiece(g: Graphics, p: PieceView): void {
  if (p.insect === 'seed') {
    drawSeed(g, p);
    return;
  }
  const c = COLOURS[p.insect];
  const husk = p.look === Look.husk;
  const body = husk ? mix(c.body, 0xe8dcc0, 0.55) : c.body;
  const dark = husk ? mix(c.dark, 0xe8dcc0, 0.45) : c.dark;
  const light = husk ? mix(c.light, 0xf4ecd8, 0.5) : c.light;
  const alpha = husk ? 0.75 : 1;
  const L = p.length / 2;
  const W = p.width / 2;
  switch (p.part) {
    case 'fly': {
      // A fruit fly from above: wings folded back over a striped abdomen, red eyes.
      for (const s of [-1, 1]) {
        for (const k of [-0.25, 0.15, 0.5]) g.moveTo(k, 0).lineTo(k + 0.35, s * 0.9).stroke({ color: dark, width: 0.07, alpha });
      }
      g.ellipse(-0.45, 0, 0.75, 0.5).fill({ color: body, alpha });
      for (const k of [-0.8, -0.5, -0.2]) g.rect(k, -0.42, 0.12, 0.84).fill({ color: dark, alpha: 0.7 * alpha });
      g.ellipse(0.45, 0, 0.42, 0.42).fill({ color: light, alpha });
      g.ellipse(0.98, 0, 0.26, 0.36).fill({ color: dark, alpha });
      if (!husk) for (const s of [-1, 1]) g.circle(1.02, s * 0.25, 0.17).fill(0xb2321e);
      for (const s of [-1, 1]) g.ellipse(-0.55, s * 0.32, 0.95, 0.34).fill({ color: 0xdfe6ea, alpha: 0.45 });
      break;
    }
    case 'head': {
      if (p.insect === 'mealworm') {
        g.ellipse(0, 0, L, W).fill({ color: dark, alpha });
        for (const s of [-1, 1]) g.circle(L * 0.6, s * W * 0.45, 0.12).fill(0x1c140c);
        break;
      }
      // A cricket's head: round, with long antennae and dark eyes.
      for (const s of [-1, 1]) {
        g.moveTo(L * 0.8, s * W * 0.3).bezierCurveTo(L + 2, s * W * 0.8, L + 5, s * W * 1.5, L + 8, s * W * 2.6).stroke({ color: dark, width: 0.12, alpha });
      }
      g.ellipse(0, 0, L, W).fill({ color: body, alpha });
      g.ellipse(L * 0.3, 0, L * 0.55, W * 0.6).fill({ color: dark, alpha: 0.5 * alpha });
      for (const s of [-1, 1]) g.ellipse(L * 0.25, s * W * 0.72, 0.35, 0.28).fill(0x1c140c);
      break;
    }
    case 'thorax':
      // The pronotum: a saddle-shaped shield.
      g.roundRect(-L, -W, 2 * L, 2 * W, W * 0.6).fill({ color: body, alpha });
      g.roundRect(-L * 0.7, -W * 0.7, 1.4 * L, 1.4 * W, W * 0.4).fill({ color: dark, alpha: 0.45 * alpha });
      g.moveTo(-L * 0.2, -W * 0.8).lineTo(-L * 0.2, W * 0.8).stroke({ color: light, width: 0.15, alpha: 0.6 * alpha });
      break;
    case 'abdomen': {
      // A long, soft, banded abdomen with two cerci at the tail.
      for (const s of [-1, 1]) g.moveTo(-L, s * 0.4).lineTo(-L - 2.2, s * 1.1).stroke({ color: dark, width: 0.15, alpha });
      g.ellipse(0, 0, L, W).fill({ color: body, alpha });
      for (let k = -3; k <= 3; k++) {
        const x = (k / 4) * L;
        const h = W * Math.sqrt(Math.max(0, 1 - (x / L) ** 2));
        g.moveTo(x, -h).lineTo(x, h).stroke({ color: dark, width: 0.15, alpha: 0.6 * alpha });
      }
      g.ellipse(L * 0.1, -W * 0.35, L * 0.6, W * 0.2).fill({ color: light, alpha: 0.35 * alpha });
      break;
    }
    case 'hindLeg': {
      // The big jumping leg: a thick femur, a thin spiny tibia folded back along it.
      g.moveTo(L * 0.95, 0).bezierCurveTo(L * 0.2, W * 0.6, -L * 0.6, W * 0.5, -L, W * 0.9).stroke({ color: dark, width: 0.28, alpha });
      g.ellipse(L * 0.25, 0, L * 0.72, W * 0.75).fill({ color: body, alpha });
      g.ellipse(L * 0.3, -W * 0.2, L * 0.55, W * 0.25).fill({ color: light, alpha: 0.4 * alpha });
      for (let k = 0; k < 5; k++) {
        const x = -L * 0.8 + k * L * 0.3;
        g.circle(x, W * 0.75 + 0.15 * Math.sin(k), 0.09).fill({ color: dark, alpha });
      }
      break;
    }
    case 'leg':
      g.moveTo(L, 0).lineTo(0, W * 0.6).lineTo(-L, W * 1.2).stroke({ color: body, width: Math.max(0.2, W * 1.1), alpha, cap: 'round', join: 'round' });
      break;
    case 'section':
      // A mealworm's ring of shiny golden skin, edged dark.
      g.roundRect(-L, -W, 2 * L, 2 * W, W * 0.8).fill({ color: body, alpha });
      g.rect(-L, -W * 0.85, L * 0.18, W * 1.7).fill({ color: dark, alpha: 0.6 * alpha });
      g.rect(L * 0.82, -W * 0.85, L * 0.18, W * 1.7).fill({ color: dark, alpha: 0.6 * alpha });
      g.ellipse(0, -W * 0.45, L * 0.7, W * 0.2).fill({ color: light, alpha: 0.6 * alpha });
      break;
  }
  if (p.look === Look.open) {
    // Where it was cut: glistening juice.
    g.ellipse(p.part === 'abdomen' ? L * 0.85 : 0, 0, Math.min(1, L * 0.35), Math.min(0.8, W * 0.6)).fill({ color: 0x9a5a2a, alpha: 0.85 });
    g.circle(p.part === 'abdomen' ? L * 0.8 : -0.1, -0.15, Math.min(0.25, W * 0.25)).fill({ color: 0xffffff, alpha: 0.4 });
  }
  if (p.look === Look.mouldy) {
    // Furred with pale grey-green threads.
    g.ellipse(0, 0, L * 1.15, W * 1.4 + 0.3).fill({ color: 0xd6e2be, alpha: 0.5 });
    for (let a = 0; a < 7; a++) g.circle(L * 0.8 * Math.cos(a * 2.1), (W + 0.2) * Math.sin(a * 1.7), Math.min(0.5, W * 0.4 + 0.1)).fill({ color: 0xeef3e2, alpha: 0.6 });
  }
}

/** Blends two 0xrrggbb colours. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift;
  return ch(16) | ch(8) | ch(0);
}
