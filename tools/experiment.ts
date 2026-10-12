/**
 * Runs a validation experiment over several seeds and prints each run.
 *
 *   npm run experiment -- bridge [--runs 10] [--no-trail]
 *   npm run experiment -- symmetric | choice | equal-choice | decay
 *   npm run experiment -- nest [--ants 40] [--hours 12] [--no-crowd]
 *   npm run experiment -- spread [--ants 50] [--minutes 60] [--no-sharing] [--satiated]
 *   npm run experiment -- growth [--days 50] [--no-protein]
 *   npm run experiment -- division [--days 4] [--after 6] [--no-fat]
 *   npm run experiment -- sorting [--hours 3] [--mixed]
 *   npm run experiment -- cemetery [--hours 30] [--corpses 100] [--no-piles]
 *   npm run experiment -- midden [--hours 3]
 *   any of them: [--param name=value] to try a different ant parameter, [--seed N] to start from seed N
 */
import type { AntParams } from '../src/sim/params';
import {
  runBroodSorting,
  runCemetery,
  runColonyGrowth,
  runDivision,
  runDoubleBridge,
  runFoodChoice,
  runFoodSpread,
  runMidden,
  runNestVolume,
  runTrailDecay,
} from '../src/sim/experiments';

const [name, ...rest] = process.argv.slice(2);
let runs = 10;
let first = 1;
let ants = 0;
let hours = 0;
let minutes = 60;
let satiated = false;
let days = 0;
let after = 6;
let protein = true;
let corpses = 100;
const params: Partial<AntParams> = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--runs') runs = Number(rest[++i]);
  else if (rest[i] === '--seed') first = Number(rest[++i]);
  else if (rest[i] === '--ants') ants = Number(rest[++i]);
  else if (rest[i] === '--hours') hours = Number(rest[++i]);
  else if (rest[i] === '--no-trail') params.trailLaying = false;
  else if (rest[i] === '--no-crowd') params.crowdControl = false;
  else if (rest[i] === '--no-sharing') params.sharing = false;
  else if (rest[i] === '--minutes') minutes = Number(rest[++i]);
  else if (rest[i] === '--satiated') satiated = true;
  else if (rest[i] === '--days') days = Number(rest[++i]);
  else if (rest[i] === '--no-protein') protein = false;
  else if (rest[i] === '--after') after = Number(rest[++i]);
  else if (rest[i] === '--no-fat') params.fatDrift = false;
  else if (rest[i] === '--corpses') corpses = Number(rest[++i]);
  else if (rest[i] === '--no-piles') params.corpseClustering = false;
  else if (rest[i] === '--mixed') {
    // The control of section 9.6: count brood of every stage, as piling does.
    params.broodOtherWeight = 1;
    params.broodSortRadius = 5;
  }
  else if (rest[i] === '--param') {
    // --param name=value: any ant parameter, for trying values out.
    const [key, value] = rest[++i]!.split('=');
    (params as Record<string, number>)[key!] = Number(value);
  }
  else throw new Error(`Unknown argument: ${rest[i]}`);
}

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;

for (let seed = first; seed < first + runs; seed++) {
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
    const r = runNestVolume({ seed, ants: ants || 40, hours: hours || 12, params });
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
  } else if (name === 'growth') {
    const length = days || 50;
    const r = runColonyGrowth({ seed, ants: ants || 60, days: length, protein, params });
    const every = Math.max(1, Math.round(length / 10));
    const rows = r.filter((d) => d.day % every === 0 || d.day === length);
    console.log(
      `seed ${seed}: ` +
        rows.map((d) => `d${d.day} ${d.eggs}e ${d.larvae}l ${d.pupae}p ${d.workers}w ${d.dead} dead (${d.deadInFarm} in) q${d.reserve.toFixed(2)} c${Math.round(100 * d.crops)}%`).join(' | '),
    );
  } else if (name === 'division') {
    const r = runDivision({ seed, ants: ants || 60, days: days || 4, afterDays: after, removeShare: 0.2, params });
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const removed = new Set(r.removed);
    const kept = r.tripsBefore.map((_, n) => n).filter((n) => !removed.has(n));
    const busiest = [...kept].sort((a, b) => r.tripsAfter[b]! - r.tripsAfter[a]! || a - b);
    const top = busiest.slice(0, r.removed.length);
    const rest = busiest.slice(r.removed.length);
    const tripsAfter = mean(kept.map((n) => r.tripsAfter[n]!)) * kept.length;
    const newcomers = kept.filter((n) => r.tripsBefore[n] === 0).reduce((a, n) => a + r.tripsAfter[n]!, 0);
    console.log(
      `seed ${seed}: trips by day ${r.tripsByDay.join(' ')}; crops by day ${r.cropsByDay.map(pct).join(' ')}\n` +
        `  before: busiest fifth fat ${mean(r.removed.map((n) => r.fatBefore[n]!)).toFixed(2)}, ` +
        `the rest ${mean(kept.map((n) => r.fatBefore[n]!)).toFixed(2)}\n` +
        `  after: new busiest fifth fat ${mean(top.map((n) => r.fatAfter[n]!)).toFixed(2)}, the rest ` +
        `${mean(rest.map((n) => r.fatAfter[n]!)).toFixed(2)}; trips by workers that had made none ${pct(newcomers / Math.max(1, tripsAfter))}`,
    );
  } else if (name === 'sorting') {
    const r = runBroodSorting({ seed, hours: hours || 3, params });
    console.log(
      `seed ${seed}: same-stage neighbours ${r.sameBefore.toFixed(2)} -> ${r.sameAfter.toFixed(2)} ` +
        `(mixed at random ${r.random.toFixed(2)}); pile purity ${r.purityBefore.toFixed(2)} -> ${r.purityAfter.toFixed(2)}; ${r.piles} piles`,
    );
  } else if (name === 'cemetery') {
    const r = runCemetery({ seed, hours: hours || 30, corpses, ...(ants ? { ants } : {}), params });
    console.log(
      `seed ${seed}: piles by hour ${r.pilesByHour.join(' ')}; share in piles ${r.inPilesByHour.map(pct).join(' ')}; ` +
        `distance from the entrance ${r.distanceBefore.toFixed(0)} -> ${r.distanceAfter.toFixed(0)} mm`,
    );
  } else if (name === 'midden') {
    const r = runMidden({ seed, settleHours: 3, hours: hours || 3, deaths: 10, ...(ants ? { ants } : {}), params });
    console.log(
      `seed ${seed}: 10 dead; in the farm by hour ${r.inFarmByHour.join(' ')}, in the arena ${r.inArenaByHour.join(' ')}; ` +
        `${r.arenaDistance.toFixed(0)} mm from the entrance, ${r.piles} piles`,
    );
  } else {
    throw new Error('Experiment must be bridge, symmetric, choice, equal-choice, decay, nest, spread, growth, division, sorting, cemetery or midden');
  }
}
