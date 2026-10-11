/**
 * Runs a validation experiment over several seeds and prints each run.
 *
 *   npm run experiment -- bridge [--runs 10] [--no-trail]
 *   npm run experiment -- symmetric | choice | equal-choice | decay
 *   npm run experiment -- nest [--ants 40] [--hours 12] [--no-crowd]
 *   npm run experiment -- spread [--ants 50] [--minutes 60] [--no-sharing] [--satiated]
 *   any of them: [--param name=value] to try a different ant parameter
 */
import type { AntParams } from '../src/sim/params';
import { runDoubleBridge, runFoodChoice, runFoodSpread, runNestVolume, runTrailDecay } from '../src/sim/experiments';

const [name, ...rest] = process.argv.slice(2);
let runs = 10;
let ants = 0;
let hours = 12;
let minutes = 60;
let satiated = false;
const params: Partial<AntParams> = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--runs') runs = Number(rest[++i]);
  else if (rest[i] === '--ants') ants = Number(rest[++i]);
  else if (rest[i] === '--hours') hours = Number(rest[++i]);
  else if (rest[i] === '--no-trail') params.trailLaying = false;
  else if (rest[i] === '--no-crowd') params.crowdControl = false;
  else if (rest[i] === '--no-sharing') params.sharing = false;
  else if (rest[i] === '--minutes') minutes = Number(rest[++i]);
  else if (rest[i] === '--satiated') satiated = true;
  else if (rest[i] === '--param') {
    // --param name=value: any ant parameter, for trying values out.
    const [key, value] = rest[++i]!.split('=');
    (params as Record<string, number>)[key!] = Number(value);
  }
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
    const r = runNestVolume({ seed, ants: ants || 40, hours, params });
    console.log(`seed ${seed}: dug out by hour (mm²) ${r.areaByHour.join(' ')}`);
  } else if (name === 'spread') {
    const r = runFoodSpread({ seed, ants: ants || 50, minutes, satiated, params });
    const at = (m: number) => pct(r.fedByMinute[Math.min(m, r.fedByMinute.length) - 1]!);
    const per10 = [];
    for (let m = 0; m < r.departuresByMinute.length; m += 10) {
      per10.push(r.departuresByMinute.slice(m, m + 10).reduce((a, b) => a + b, 0));
    }
    console.log(
      `seed ${seed}: fed ${at(15)} at 15 min, ${at(30)} at 30, ${at(60)} at 60; ${pct(r.foragers)} went out; ` +
        `departures per 10 min ${per10.join(' ')}; crops ${r.cropByMinute.at(-1)!.toFixed(2)} µL`,
    );
  } else {
    throw new Error('Experiment must be bridge, symmetric, choice, equal-choice, decay, nest or spread');
  }
}
