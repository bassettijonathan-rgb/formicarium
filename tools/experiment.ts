/**
 * Runs a validation experiment over several seeds and prints each run.
 *
 *   npm run experiment -- bridge [--runs 10] [--no-trail]
 *   npm run experiment -- symmetric | choice | equal-choice | decay
 *   npm run experiment -- nest [--ants 40] [--hours 12] [--no-crowd]
 */
import { runDoubleBridge, runFoodChoice, runNestVolume, runTrailDecay } from '../src/sim/experiments';

const [name, ...rest] = process.argv.slice(2);
let runs = 10;
let ants = 40;
let hours = 12;
const params: { trailLaying?: boolean; crowdControl?: boolean } = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--runs') runs = Number(rest[++i]);
  else if (rest[i] === '--ants') ants = Number(rest[++i]);
  else if (rest[i] === '--hours') hours = Number(rest[++i]);
  else if (rest[i] === '--no-trail') params.trailLaying = false;
  else if (rest[i] === '--no-crowd') params.crowdControl = false;
  else throw new Error(`Unknown argument: ${rest[i]}`);
}

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;

for (let seed = 1; seed <= runs; seed++) {
  if (name === 'bridge' || name === 'symmetric') {
    const r = runDoubleBridge({ seed, longRatio: name === 'bridge' ? 2 : 1, params });
    console.log(`seed ${seed}: upper (short) branch ${pct(r.upperShare)} of ${r.crossings} crossings`);
  } else if (name === 'choice' || name === 'equal-choice') {
    const r = runFoodChoice({ seed, concentrationA: 1, concentrationB: name === 'choice' ? 0.1 : 1, params });
    console.log(`seed ${seed}: drop A ${pct(r.shareA)} of ${r.visits} visits`);
  } else if (name === 'decay') {
    const r = runTrailDecay({ seed, params });
    console.log(
      `seed ${seed}: ${r.departuresWithFood.toFixed(1)} departures/min with food, ${r.departuresAfter.toFixed(1)}/min after; ` +
        `trail ${r.trailAtRemoval.toFixed(0)} -> ${r.trailAfter.toFixed(0)}`,
    );
  } else if (name === 'nest') {
    const r = runNestVolume({ seed, ants, hours, params });
    console.log(`seed ${seed}: dug out by hour (mm²) ${r.areaByHour.join(' ')}`);
  } else {
    throw new Error('Experiment must be bridge, symmetric, choice, equal-choice, decay or nest');
  }
}
