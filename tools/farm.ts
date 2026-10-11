/**
 * Runs a farm colony headless and prints how the nest develops, with a
 * coarse picture of the farm (# soil, . air, o loose grain, a ant).
 *
 *   npm run farm -- --seed 1 --ants 60 --hours 3 [--every 30] [--no-crowd]
 */
import { AntState, Place } from '../src/sim/ants';
import { excavatedArea } from '../src/sim/farm';
import { Material } from '../src/sim/materials';
import { STEPS_PER_SECOND } from '../src/sim/time';
import { createWorld, step, type World } from '../src/sim/world';

const args = process.argv.slice(2);
const opt = (name: string, fallback: number) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? Number(args[k + 1]) : fallback;
};
const world = createWorld(opt('seed', 1), {
  ants: opt('ants', 60),
  params: args.includes('--no-crowd') ? { crowdControl: false } : {},
});
const hours = opt('hours', 3);
const every = opt('every', 30);

function picture(w: World): string {
  const { farm, ants } = w;
  const sx = opt('sx', 3);
  const sy = opt('sy', 5);
  const antCell = new Set<number>();
  for (let i = 0; i < ants.count; i++) {
    if (ants.place[i] === Place.farm) antCell.add(Math.floor(ants.y[i]!) * 1000 + Math.floor(ants.x[i]!));
  }
  const rows: string[] = [];
  for (let y = opt('y0', 0); y < opt('y0', 0) + opt('rows', farm.height); y += sy) {
    let row = '';
    for (let x = opt('x0', 0); x < Math.min(farm.width, opt('x0', 0) + opt('cols', farm.width)); x += sx) {
      let ant = false;
      for (let dy = 0; dy < sy; dy++) for (let dx = 0; dx < sx; dx++) if (antCell.has((y + dy) * 1000 + x + dx)) ant = true;
      if (ant) {
        row += 'a';
        continue;
      }
      let air = 0;
      let loose = 0;
      for (let dy = 0; dy < sy && y + dy < farm.height; dy++) {
        for (let dx = 0; dx < sx && x + dx < farm.width; dx++) {
          const i = (y + dy) * farm.width + x + dx;
          if (farm.material[i] === Material.air) air++;
          else if (farm.loose[i]) loose++;
        }
      }
      row += air > (sx * sy) / 2 ? '.' : loose > (sx * sy) / 3 ? 'o' : '#';
    }
    rows.push(row);
  }
  return rows.join('\n');
}

function census(w: World): string {
  const counts = new Map<string, number>();
  const names = Object.entries(AntState).reduce<Record<number, string>>((m, [k, v]) => ((m[v] = k), m), {});
  for (let i = 0; i < w.ants.count; i++) {
    const where = ['arena', 'farm', 'tube'][w.ants.place[i]!];
    const key = `${where}:${names[w.ants.state[i]!]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort().map(([k, v]) => `${k} ${v}`).join(', ');
}

const stepsPerReport = every * 60 * STEPS_PER_SECOND;
for (let r = 1; r <= (hours * 60) / every; r++) {
  for (let s = 0; s < stepsPerReport; s++) step(world);
  let crowd = 0;
  for (let i = 0; i < world.ants.count; i++) crowd += world.ants.encounters[i]!;
  console.log(
    `\n== ${((r * every) / 60).toFixed(2)} h: ${excavatedArea(world.farm)} mm² dug out, ` +
      `mean contacts ${(crowd / world.ants.count).toFixed(2)}; ${census(world)}`,
  );
}
console.log(picture(world));
