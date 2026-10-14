import { describe, expect, it } from 'vitest';
import { MAX_COLONIES, asTable, freeSlots, loadTable, nextSeed, stepColonies, tableReport, tableSave } from '../src/sim/colonies';
import { hashState } from '../src/sim/hash';
import { createTank } from '../src/sim/keeper';
import { TEST_TUBE_SETUP } from '../src/sim/nest';
import { SAVE_VERSION, type Save, census } from '../src/sim/save';
import { step } from '../src/sim/world';

describe('several colonies on one table (DESIGN.md 3.6)', () => {
  it('runs each colony exactly as it would alone on the table', () => {
    const a = createTank(3, TEST_TUBE_SETUP);
    const b = createTank(4);
    const table = [
      { name: 'Nigra', slot: 0, seed: 3, log: [], world: a },
      { name: 'Bruna', slot: 1, seed: 4, log: [], world: b },
    ];
    stepColonies(table, 400);
    const alone = createTank(3, TEST_TUBE_SETUP);
    for (let i = 0; i < 400; i++) step(alone);
    const otherAlone = createTank(4);
    for (let i = 0; i < 400; i++) step(otherAlone);
    expect(hashState(a)).toBe(hashState(alone));
    expect(hashState(b)).toBe(hashState(otherAlone));
  });

  it('keeps a tank from before tables as a table of one colony, named as the tank was (T5)', () => {
    const world = createTank(9);
    const old: Save = { version: SAVE_VERSION, seed: 9, name: 'Kitchen tank', savedAt: 5, log: [{ step: 0, command: { type: 'clean' } }], world };
    const table = asTable(old);
    expect(table.name).toBe('Kitchen tank');
    expect(table.savedAt).toBe(5);
    expect(table.colonies).toHaveLength(1);
    expect(table.colonies[0]).toMatchObject({ name: 'Kitchen tank', slot: 0, seed: 9 });
    expect(table.colonies[0]!.log).toHaveLength(1);
    expect(asTable(table)).toBe(table);
  });

  it('loads a kept table back to the same colonies, in the order of their places', () => {
    const a = createTank(1);
    const b = createTank(2, TEST_TUBE_SETUP);
    for (let i = 0; i < 100; i++) step(b);
    const kept = structuredClone(tableSave('Bench', 7, [
      { name: 'Right', slot: 3, seed: 2, log: [], world: b },
      { name: 'Left', slot: 0, seed: 1, log: [], world: a },
    ]));
    const back = loadTable(kept)!;
    expect(back.map((c) => c.name)).toEqual(['Left', 'Right']);
    expect(hashState(back[1]!.world)).toBe(hashState(b));
    expect(loadTable({ ...kept, version: SAVE_VERSION + 1 })).toBeNull();
  });

  it('holds at most four colonies, each in its own place, with seeds of their own', () => {
    expect(MAX_COLONIES).toBe(4);
    expect(freeSlots([{ slot: 0 }, { slot: 2 }])).toEqual([1, 3]);
    expect(freeSlots([0, 1, 2, 3].map((slot) => ({ slot })))).toEqual([]);
    expect(nextSeed([3, 8, 5])).toBe(9);
    expect(nextSeed([])).toBe(1);
  });

  it('says what happened to each colony while the table was closed', () => {
    const table = [
      { name: 'Nigra', slot: 0, seed: 1, log: [], world: createTank(1) },
      { name: 'Bruna', slot: 1, seed: 2, log: [], world: createTank(2) },
    ];
    const before = table.map((c) => census(c.world));
    stepColonies(table, 200);
    const lines = tableReport(table, before);
    expect(lines[0]).toMatch(/^The tank lived/);
    expect(lines).toContain('Nigra:');
    expect(lines).toContain('Bruna:');
    expect(lines.filter((l) => l.startsWith('The tank lived'))).toHaveLength(1);
    expect(tableReport(table.slice(0, 1), before.slice(0, 1))[0]).toMatch(/^The tank lived/);
  });
});
