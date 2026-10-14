import { describe, expect, it } from 'vitest';
import { hashState } from '../src/sim/hash';
import { createTank } from '../src/sim/keeper';
import { SAVE_VERSION, type Save, loadWorld } from '../src/sim/save';
import { step } from '../src/sim/world';
import { readTankFile, tankFile } from '../src/ui/tankFile';

describe('a tank saved to a file (U2)', () => {
  it('loads back to the same tank', async () => {
    const world = createTank(7);
    for (let i = 0; i < 200; i++) step(world);
    const save: Save = { version: SAVE_VERSION, seed: 7, savedAt: 123, name: 'Kitchen tank', log: [], world: structuredClone(world) };
    const back = await readTankFile(await tankFile(save));
    expect(back).not.toBeNull();
    expect(back!.name).toBe('Kitchen tank');
    expect(back!.savedAt).toBe(123);
    expect(hashState(loadWorld(back!)!)).toBe(hashState(world));
  });

  it('turns down a file that is not a tank', async () => {
    expect(await readTankFile(new Blob(['not a tank']))).toBeNull();
    const gz = await new Response(new Blob(['{"hello":1}']).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    expect(await readTankFile(gz)).toBeNull();
  });
});
