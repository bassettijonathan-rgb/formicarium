/**
 * The ant inspector (M6b; DESIGN.md D9 and section 8): what the keeper can
 * learn about one ant by watching it, in words. Read only; never changes the
 * world.
 */
import type { Part } from './prey';
import { AntState, Caste, Cause, Place } from './ants';
import { BroodStage } from './brood';
import { MATERIAL_NAMES } from './materials';
import type { World } from './world';

export interface AntCard {
  /** "Worker 23", "The queen". */
  title: string;
  /** What it is doing now, e.g. "carrying a grain of clay up out of the nest". */
  doing: string;
  /** Its state and its life so far, one fact per line. */
  lines: string[];
}

const BROOD_NAMES: Record<number, string> = {
  [BroodStage.egg]: 'an egg',
  [BroodStage.larva]: 'a larva',
  [BroodStage.pupa]: 'a cocoon',
};

const CAUSE_NAMES: Record<number, string> = {
  [Cause.none]: 'unknown causes',
  [Cause.age]: 'old age',
  [Cause.hunger]: 'hunger',
  [Cause.drying]: 'drying out',
  [Cause.heat]: 'heat',
  [Cause.killed]: 'the keeper’s hand',
};

const days = (d: number) => `${d < 10 ? d.toFixed(1) : Math.round(d)} ${d === 1 ? 'day' : 'days'}`;
const ul = (v: number) => `${v < 0.1 ? v.toFixed(3) : v.toFixed(2)} µL`;

const PART_NAMES: Record<Part, string> = {
  fly: 'fruit fly',
  head: 'head',
  thorax: 'thorax',
  abdomen: 'abdomen',
  hindLeg: 'hind leg',
  leg: 'leg',
  section: 'piece',
};

/** What ant `i` is doing, in words. */
export function doing(world: World, i: number): string {
  const { ants, brood } = world;
  const state = ants.state[i]!;
  const place = ants.place[i]!;
  if (place === Place.gone) return 'taken out of the tank';
  const farm = place === Place.farm;
  const tube = place === Place.tube;
  const held = world.prey.find((p) => p.id === ants.pieceHeld[i]);
  if (held && state !== AntState.carryingCorpse) {
    const what = held.part === 'fly' ? 'a fruit fly' : `a ${PART_NAMES[held.part]} of a ${held.insect}`;
    return tube ? `in the tube, carrying ${what} home` : farm ? `taking ${what} to the brood` : `carrying ${what} home`;
  }
  switch (state) {
    case AntState.dead:
      return ants.carriedBy[i]! >= 0 ? 'dead, being carried by a nestmate' : 'dead';
    case AntState.inNest:
    case AntState.resting:
      return 'resting in the nest';
    case AntState.wandering:
      return 'walking about the nest';
    case AntState.exploring:
      return tube ? 'in the tube, on its way out' : farm ? 'on its way out to forage' : 'out looking for food';
    case AntState.toFood:
      return tube ? 'in the tube, on its way out to food it knows' : farm ? 'on its way out to food it knows' : 'heading back to food it found before';
    case AntState.feeding: {
      const drop = world.food.find((d) => d.id === ants.foodId[i]);
      return drop && drop.protein > 0 ? 'drinking the juices of an insect' : 'drinking sugar water';
    }
    case AntState.returning:
      return tube ? 'in the tube, bringing food home' : farm ? 'coming in with food' : 'carrying food home, laying a trail';
    case AntState.homing:
      return tube ? 'in the tube, coming home' : farm ? 'coming in from the arena' : 'going home with nothing';
    case AntState.carrying:
      return `carrying a grain of ${MATERIAL_NAMES[ants.grain[i]!] ?? 'soil'} out of the way`;
    case AntState.sharing: {
      const j = ants.partner[i]!;
      if (j < 0) return 'sharing food mouth to mouth';
      const who = ants.caste[j] === Caste.queen ? 'the queen' : `worker ${j}`;
      return ants.crop[i]! < ants.crop[j]! ? `being fed by ${who}, mouth to mouth` : `feeding ${who}, mouth to mouth`;
    }
    case AntState.carryingBrood: {
      const k = ants.broodHeld[i]!;
      return `carrying ${k >= 0 ? (BROOD_NAMES[brood.stage[k]!] ?? 'brood') : 'brood'} to the rest of the brood`;
    }
    case AntState.carryingCorpse:
      return held ? `carrying what is left of a ${held.insect} out of the nest` : 'carrying a dead nestmate out of the nest';
    case AntState.atPrey: {
      const p = world.prey.find((q) => q.id === ants.preyId[i]);
      return p ? `at a ${p.insect}, biting it apart and drinking its juices` : 'at an insect';
    }
    default:
      return 'about its business';
  }
}

/**
 * How readily a worker sets off to forage: its own threshold scaled by its
 * fat (see `AntParams.fatRef`), placed between the colony's extremes.
 */
function keenness(world: World, i: number): string {
  const { ants, params } = world;
  const threshold = (ants.forageThreshold[i]! * ants.fat[i]!) / params.fatRef;
  const k = 1 - Math.log(threshold / params.forageThresholdMin) / Math.log(params.forageThresholdMax / params.forageThresholdMin);
  if (k > 0.66) return 'a keen forager: goes out as soon as the colony is a little hungry';
  if (k > 0.33) return 'goes out to forage when the colony is hungry';
  return 'a stay-at-home: goes out only when the colony is starving';
}

/**
 * How ant `i` has spent its time in the tank, largest share first, e.g.
 * "61% resting, 22% about the nest, 9% out foraging"; shares under 1% are left out.
 */
export function timeBudget(world: World, i: number): string | null {
  const { ants } = world;
  const parts: [number, string][] = [
    [ants.timeResting[i]!, 'resting'],
    [ants.timeAbout[i]!, 'about the nest'],
    [ants.timeOut[i]!, 'foraging or on its way'],
    [ants.timeDigging[i]!, 'digging'],
    [ants.timeBrood[i]!, 'carrying brood'],
    [ants.timeSharing[i]!, 'sharing food'],
    [ants.timeDead[i]!, 'carrying the dead'],
  ];
  const total = parts.reduce((sum, [n]) => sum + n, 0);
  if (total === 0) return null;
  return parts
    .filter(([n]) => n / total >= 0.01)
    .sort((a, b) => b[0] - a[0])
    .map(([n, what]) => `${Math.round((100 * n) / total)}% ${what}`)
    .join(', ');
}

/** What the keeper can tell about ant `i`. */
export function inspectAnt(world: World, i: number): AntCard {
  const { ants, params } = world;
  const queen = ants.caste[i] === Caste.queen;
  const title = queen ? 'The queen' : `Worker ${i}`;
  const lines: string[] = [];
  const dead = ants.state[i] === AntState.dead;
  if (dead) {
    lines.push(
      `Died of ${CAUSE_NAMES[ants.cause[i]!] ?? 'unknown causes'}` +
        (queen ? '' : ` at ${days(ants.age[i]!)} old`) +
        `, ${days(ants.deadFor[i]!)} ago.`,
    );
  } else if (!queen) {
    lines.push(`Age ${days(ants.age[i]!)}; ${ants.born[i] ? 'came out of its cocoon in this tank' : 'was in the tank from the start'}.`);
    if (ants.age[i]! < params.callowDays) lines.push('A callow: still pale, not yet hardened.');
  }
  if (!dead) {
    const crop = ants.crop[i]!;
    const protein = ants.cropProtein[i]!;
    lines.push(
      `Crop ${Math.round((100 * crop) / params.cropLoad)}% full (${ul(crop)})` + (protein > 0.0005 ? `, ${ul(protein)} of it insect juices.` : '.'),
    );
    if (queen) lines.push(`Protein in her body for making eggs: ${ul(ants.reserve[i]!)}.`);
    else {
      lines.push(`Fat body ${Math.round(100 * ants.fat[i]!)}% of a new worker’s; ${keenness(world, i)}.`);
    }
    if (ants.hunger[i]! > 0) lines.push(`Starving: no food left in crop or fat for ${days(ants.hunger[i]!)}.`);
    if (ants.thirst[i]! > 0) lines.push(`Drying out for ${days(ants.thirst[i]!)}: the air round it is too dry.`);
    if (ants.heat[i]! > 0) lines.push(`Too hot for ${days(ants.heat[i]!)}.`);
  }
  if (!queen) {
    const life: string[] = [];
    if (ants.trips[i]! > 0) life.push(`${ants.trips[i]} ${ants.trips[i] === 1 ? 'trip' : 'trips'} out to forage`);
    if (ants.dug[i]! > 0) life.push(`${ants.dug[i]} ${ants.dug[i] === 1 ? 'grain' : 'grains'} of soil dug or cleared`);
    if (ants.gave[i]! >= 0.001) life.push(`${ul(ants.gave[i]!)} of food given to nestmates`);
    if (ants.nursed[i]! >= 0.001) life.push(`${ul(ants.nursed[i]!)} of insect juices fed to larvae`);
    if (ants.broodMoved[i]! > 0) life.push(`brood carried ${ants.broodMoved[i]} ${ants.broodMoved[i] === 1 ? 'time' : 'times'}`);
    if (ants.corpsesCarried[i]! > 0) life.push(`${ants.corpsesCarried[i]} dead ${ants.corpsesCarried[i] === 1 ? 'nestmate' : 'nestmates'} carried out`);
    lines.push(life.length > 0 ? `Its life so far: ${life.join(', ')}.` : 'Its life so far: no trips out, digging, feeding or nursing yet.');
  }
  const budget = timeBudget(world, i);
  if (budget) lines.push(`Its time: ${budget}.`);
  return { title, doing: doing(world, i), lines };
}

