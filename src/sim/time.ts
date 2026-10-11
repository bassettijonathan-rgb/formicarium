/**
 * The two clocks (DESIGN.md D6 and section 2).
 *
 * Ants move in real time: one step is 1/20 s of ant life. Development and
 * ageing will run on a compressed clock, added in M3.
 */

/** Simulation steps per second of ant time. */
export const STEPS_PER_SECOND = 20;

/** Formats a step count as ant time, e.g. "1 h 02 min 05 s". */
export function formatAntTime(step: number): string {
  const totalSeconds = Math.floor(step / STEPS_PER_SECOND);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h} h ${pad(m)} min ${pad(s)} s` : `${m} min ${pad(s)} s`;
}
