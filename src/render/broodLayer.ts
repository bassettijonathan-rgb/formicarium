/**
 * Brood in the farm (DESIGN.md section 7.1), drawn from the worker's
 * snapshots: eggs as tiny white grains, larvae as white grubs that grow as
 * they are fed, pupae as pale cocoons. Sizes are real, in mm.
 */
import { Graphics } from 'pixi.js';
import { BroodStage } from '../sim/brood';
import { BROOD_STRIDE } from '../worker/protocol';

const EGG = 0xf4f1e8;
const LARVA = 0xf2ede0;
const SEGMENT = 0xd8d0bd;
const COCOON = 0xd9c9a3;

export class BroodLayer {
  readonly root = new Graphics();

  setBrood(brood: Float32Array): void {
    const g = this.root;
    g.clear();
    for (let o = 0; o < brood.length; o += BROOD_STRIDE) {
      const x = brood[o]!;
      const y = brood[o + 1]!;
      const stage = brood[o + 2]!;
      const size = brood[o + 3]!;
      if (stage === BroodStage.egg) {
        g.ellipse(x, y, size / 2, size / 3).fill(EGG);
      } else if (stage === BroodStage.larva) {
        // A plump, curled grub: body, a few segment lines, a small head at one end.
        g.ellipse(x, y, size / 2, size / 3).fill(LARVA);
        for (let s = -1; s <= 1; s++) g.rect(x + (s * size) / 6 - 0.04, y - size / 3.5, 0.08, size / 1.75).fill(SEGMENT);
        g.circle(x + size / 2, y - size / 8, size / 7).fill(0xe6dccb);
      } else if (stage === BroodStage.pupa) {
        g.ellipse(x, y, size / 2, size / 4.5).fill(COCOON);
        g.ellipse(x - size / 3, y, size / 10, size / 7).fill({ color: 0x5a4632, alpha: 0.6 }); // the dark meconium spot
      }
    }
  }
}
