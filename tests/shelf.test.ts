import { describe, expect, it } from 'vitest';
import { type ShelfEntry, freeName, newId } from '../src/worker/store';

const entry = (id: string, name: string): ShelfEntry => ({ id, name, seed: 1, step: 0, workers: 20, queen: true, savedAt: 0 });

describe('the list of kept tanks (U2)', () => {
  it('gives each tank an id no other has', () => {
    expect(newId([])).toBe('1');
    expect(newId([entry('1', 'a'), entry('3', 'b')])).toBe('4');
    expect(newId([entry('2', 'a'), entry('3', 'b')])).toBe('4');
    expect(newId([entry('1', 'a'), entry('2', 'b'), entry('4', 'c')])).toBe('5');
  });

  it('numbers a name another tank already has', () => {
    expect(freeName('Kitchen', [])).toBe('Kitchen');
    expect(freeName('Kitchen', [entry('1', 'Kitchen')])).toBe('Kitchen (2)');
    expect(freeName('Kitchen', [entry('1', 'Kitchen'), entry('2', 'Kitchen (2)')])).toBe('Kitchen (3)');
  });
});
