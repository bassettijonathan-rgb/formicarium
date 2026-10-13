/**
 * Runs a validation experiment over several seeds and prints each run.
 *
 *   npm run experiment -- bridge [--runs 10] [--no-trail]
 *   npm run experiment -- symmetric | choice | equal-choice | decay
 *   npm run experiment -- nest [--ants 40] [--hours 12] [--no-crowd]
 *   npm run experiment -- spread [--ants 50] [--minutes 60] [--no-sharing] [--satiated]
 *   npm run experiment -- growth [--days 50] [--no-protein] [--room 22] [--mat 110] [--soil-water | --water 5]
 *   npm run experiment -- division [--days 4] [--after 6] [--no-fat]
 *   npm run experiment -- sorting [--hours 3] [--mixed]
 *   npm run experiment -- cemetery [--hours 30] [--corpses 100] [--no-piles]
 *   npm run experiment -- midden [--hours 3]
 *   npm run experiment -- warmth [--hours 3] [--no-thermo]
 *   npm run experiment -- damp [--hours 3] [--no-hygro]
 *   npm run experiment -- hygiene [--days 4] [--no-removal]
 *   npm run experiment -- starvation [--days 30] [--fed]
 *   npm run experiment -- prey [--insect fly|cricket|mealworm] [--cut whole|halved|pieces] [--minutes 180]
 *   growth takes --mortal: adults die of hunger, drying out and heat (M5c)
 *   any of them: [--param name=value] to try a different ant parameter, [--seed N] to start from seed N
 */
import { Cause } from '../src/sim/ants';
import type { AntParams } from '../src/sim/params';
import {
  runBroodSorting,
  runBroodDamp,
  runHygiene,
  runStarvation,
  runBroodWarmth,
  runCemetery,
  runColonyGrowth,
  runDivision,
  runDoubleBridge,
  runFoodChoice,
  runFoodSpread,
  runMidden,
  runNestVolume,
  runPrey,
  runTrailDecay,
} from '../src/sim/experiments';
import type { Cut, Insect } from '../src/sim/prey';

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
let matX: number | undefined;
let waterEvery = 0;
let fed = false;
let insect: Insect | undefined;
let cut: Cut = 'whole';
let minutesSet = false;
const params: Partial<AntParams> = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--runs') runs = Number(rest[++i]);
  else if (rest[i] === '--seed') first = Number(rest[++i]);
  else if (rest[i] === '--insect') insect = rest[++i] as Insect;
  else if (rest[i] === '--cut') cut = rest[++i] as Cut;
  else if (rest[i] === '--ants') ants = Number(rest[++i]);
  else if (rest[i] === '--hours') hours = Number(rest[++i]);
  else if (rest[i] === '--no-trail') params.trailLaying = false;
  else if (rest[i] === '--no-crowd') params.crowdControl = false;
  else if (rest[i] === '--no-sharing') params.sharing = false;
  else if (rest[i] === '--minutes') {
    minutes = Number(rest[++i]);
    minutesSet = true;
  }
  else if (rest[i] === '--satiated') satiated = true;
  else if (rest[i] === '--days') days = Number(rest[++i]);
  else if (rest[i] === '--no-protein') protein = false;
  else if (rest[i] === '--mat') matX = Number(rest[++i]);
  else if (rest[i] === '--room') params.roomTemperature = Number(rest[++i]);
  else if (rest[i] === '--after') after = Number(rest[++i]);
  else if (rest[i] === '--no-fat') params.fatDrift = false;
  else if (rest[i] === '--corpses') corpses = Number(rest[++i]);
  else if (rest[i] === '--no-piles') params.corpseClustering = false;
  else if (rest[i] === '--no-thermo') params.thermotaxis = false;
  else if (rest[i] === '--soil-water') params.waterFlow = true;
  else if (rest[i] === '--no-hygro') params.hygrotaxis = false;
  else if (rest[i] === '--no-removal') params.corpsePickRate = 0;
  else if (rest[i] === '--mortal') params.mortal = true;
  else if (rest[i] === '--fed') fed = true;
  else if (rest[i] === '--water') {
    waterEvery = Number(rest[++i]);
    params.waterFlow = true;
  }
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
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

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
    const r = runColonyGrowth({
      seed,
      ants: ants || 60,
      days: length,
      protein,
      params,
      waterEvery,
      ...(matX === undefined ? {} : { matX }),
    });
    const every = Math.max(1, Math.round(length / 10));
    const rows = r.filter((d) => d.day % every === 0 || d.day === length);
    console.log(
      `seed ${seed}: ` +
        rows
          .map(
            (d) =>
              `d${d.day} ${d.eggs}e ${d.larvae}l ${d.pupae}p ${d.workers}w ${d.dead} dead (${d.deadInFarm} in) ` +
              `q${d.reserve.toFixed(2)} c${Math.round(100 * d.crops)}% ${d.broodTemperature.toFixed(1)}°C` +
              (params.waterFlow ? ` RH${Math.round(100 * d.broodHumidity)}% ${d.dried} dried soil ${pct(d.soilWater)}` : '') +
              (params.mortal ? ` died of hunger ${d.deaths[Cause.hunger]}, drying ${d.deaths[Cause.drying]}, heat ${d.deaths[Cause.heat]}` : ''),
          )
          .join(' | '),
    );
  } else if (name === 'division') {
    const r = runDivision({ seed, ants: ants || 60, days: days || 4, afterDays: after, removeShare: 0.2, params });
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
  } else if (name === 'warmth') {
    const r = runBroodWarmth({ seed, hours: hours || 3, ...(ants ? { ants } : {}), params });
    console.log(
      `seed ${seed}: mean brood temperature by hour ${r.meanByHour.map((t) => t.toFixed(1)).join(' ')} °C; ` +
        `within 2 °C of the preferred ${r.nearByHour.map(pct).join(' ')}`,
    );
  } else if (name === 'damp') {
    const r = runBroodDamp({ seed, hours: hours || 3, ...(ants ? { ants } : {}), params });
    console.log(
      `seed ${seed}: mean humidity at the brood by hour ${r.meanByHour.map(pct).join(' ')}; ` +
        `in air damp enough ${r.dampByHour.map(pct).join(' ')}`,
    );
  } else if (name === 'hygiene') {
    const r = runHygiene({ seed, settleHours: 2, days: days || 4, deaths: 5, ...(ants ? { ants } : {}), params });
    console.log(
      `seed ${seed}: ${r.brood} brood; by day: corpses in the farm ${r.corpsesByDay.join(' ')}, ` +
        `mould ${r.mouldByDay.join(' ')} mm², brood killed by mould ${r.killedByDay.join(' ')}`,
    );
  } else if (name === 'starvation') {
    const r = runStarvation({ seed, fedDays: 4, days: days || 30, fed, ...(ants ? { ants } : {}), params });
    // Foragers: the fifth of workers that made most trips while fed; nest workers: those that made none.
    const order = r.trips.map((_, n) => n).sort((a, b) => r.trips[b]! - r.trips[a]! || a - b);
    const foragers = order.slice(0, Math.round(order.length / 5));
    const nest = order.filter((n) => r.trips[n] === 0);
    const median = (xs: number[]) => {
      const v = xs.map((x) => (Number.isNaN(x) ? Infinity : x)).sort((a, b) => a - b);
      const m = v[Math.floor(v.length / 2)];
      return m === undefined || m === Infinity ? 'alive' : `${m.toFixed(1)} d`;
    };
    const hungry = r.cause.filter((c) => c === Cause.hunger).length;
    console.log(
      `seed ${seed}: workers alive by day ${r.aliveByDay.join(' ')}; ${hungry} starved\n` +
        `  foragers (${foragers.length}): fat ${mean(foragers.map((n) => r.fat[n]!)).toFixed(2)}, median survival ${median(foragers.map((n) => r.diedOn[n]!))}; ` +
        `nest workers (${nest.length}): fat ${mean(nest.map((n) => r.fat[n]!)).toFixed(2)}, median survival ${median(nest.map((n) => r.diedOn[n]!))}`,
    );
  } else if (name === 'prey') {
    // Without --insect: a fruit fly for 30 minutes, then a cricket for 3 hours, on the same seed.
    const trials: [Insect, number][] = insect ? [[insect, minutesSet ? minutes : 180]] : [['fly', 30], ['cricket', 180]];
    for (const [kind, length] of trials) {
      const r = runPrey({ seed, insect: kind, cut, minutes: length, ...(ants ? { ants } : {}), params });
      const t = (s: number) => (s < 0 ? 'never' : `${(s / 60).toFixed(1)} min`);
      console.log(
        `seed ${seed} ${kind} (${cut}): found after ${t(r.found)}; most at it at once ${r.mostAtOnce}, workers that came ${r.workers}; ` +
          `most trail ${r.trail.toFixed(0)}; ${r.carried} pieces carried home; ${pct(r.taken)} of its juice taken; half gone after ${t(r.half)}, all after ${t(r.cleared)}`,
      );
    }
  } else {
    throw new Error(
      'Experiment must be bridge, symmetric, choice, equal-choice, decay, nest, spread, growth, division, sorting, cemetery, midden, warmth, damp, hygiene, starvation or prey',
    );
  }
}
