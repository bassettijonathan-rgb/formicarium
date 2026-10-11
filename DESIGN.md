# DESIGN.md: Formicarium, a living ant farm in the browser

Status: approved by Marco on 2026-10-11, with PixiJS chosen for rendering (D11).

Scope set by Marco: the classic hobby setup (a formicarium nest joined by a tube to a foraging arena, both on screen), one species, and colony behaviour that emerges only from individual ant behaviour.

## 0. What this is

An aquarium you keep, but with ants. You set up a glass ant farm, drop in a
mated queen and a handful of workers, and then watch. Nobody scripts the nest:
tunnels, chambers, foraging trails, brood piles, the rubbish heap and the
division of labour all come out of what each ant does on its own, using only
what a real ant can sense (smells at its antennae, touch, temperature, its own
sense of how far it has walked).

There is no score and no win. You tend the tank (food, water, warmth, fresh
soil) and the colony grows, struggles, or dies depending on how you keep it
and on luck. The fun is the same as an aquarium plus the same as Dwarf
Fortress: looking closely and seeing why something happened.

**Reading taken:** "aquarium simulator" means a living tank you watch and
tend, not a game you win. If you meant something more game-like (several
colonies competing, you steering one), say so; section 1 shows where it would
change.

### Design principles

1. **Only local rules.** An ant never reads global state. No "go to nearest
   food" pathfinding, no central planner. If the colony looks smart, it has to
   be emergent.
2. **Real biology where it is known.** Each mechanism cites the study it comes
   from. Where we simplify, the doc says so.
3. **Check emergence against real experiments.** The sim must reproduce a few
   classic lab results (section 9) before we call a feature done.
4. **Deterministic.** Same seed and same player actions give the same tank,
   so any surprising event can be replayed and inspected.

---

## 1. Decisions for Marco

Each row has a recommendation. Approving the doc as written accepts all of them.

| # | Question | Recommendation | Alternative |
|---|---|---|---|
| D1 | What do you look at? | **Side view of a two-pane glass ant farm** (soil cross-section) with a strip of surface on top and a separate **arena** (outworld) joined by a tube, where food goes. Digging is the main show and only a side view shows it. | Top-down only (good for trails, hides the nest). |
| D2 | Which species? | **Lasius niger** (black garden ant): the best-studied trail-laying ant, single queen, small same-size workers, digs in soil. Species is a data file so others can be added. | Messor (seed harvesters, nice granaries) or Pheidole (soldier caste) later as data. |
| D3 | How do ants find home? | **Path integration** (each ant keeps a noisy vector back to the nest, as real ants do) plus nest odour near the entrance. Food trails use real **trail pheromone laid only on the way back from food**. | The common "two pheromones" shortcut (a home trail and a food trail). Simpler, but real ants do not do it, and it makes trails look fake. |
| D4 | How does digging work? | **Grain-level soil** (each cell is ~1 mm of sand, loam or clay with moisture) and **stigmergic digging**: ants pick up grains where others dug recently and drop them where pellets pile up, guided by a short-lived building pheromone in the soil (Khuong et al. 2016). Unsupported soil collapses, dry sand more than damp clay. | Ants dig along a pre-made tunnel template. Easier, but nothing emerges. |
| D5 | Who does which job? | **Response thresholds** (Bonabeau et al. 1996): each ant has its own threshold per task stimulus (hungry larvae, dirty chamber, food smell) and that threshold drifts with age and experience. Young ants nurse, old ants forage, with no rule saying so. | Fixed castes by age. |
| D6 | Two clocks | Ants **move in real time** (1 s of sim = 1 s of ant life at 1x). Development (egg to adult, queen laying rate, ageing) runs **compressed**, default 1 real day of the tank = 1 hour of play, adjustable. Every ratio inside each clock stays real. | One clock: real Lasius takes ~2 months egg to worker and years to grow, too slow to watch. |
| D7 | Does the tank live while the tab is closed? | **Yes, capped.** On reopening, the sim catches up headless at max speed for the time you were away, up to 3 tank-days, then shows a short log of what happened ("12 workers eclosed, mould in chamber 3"). | Paused while closed (no aquarium feeling). |
| D8 | Scale | Tank 30 x 20 cm at 1 mm cells (300 x 200 soil grid), arena 20 x 20 cm. Up to **2,000 ants** at 60 fps. Real Lasius colonies reach 10,000+; this is a young colony, which is what ant farms hold anyway. | Bigger tanks later if performance allows. |
| D9 | What can you do? | Feed (sugar water, protein: insects, seeds), water the soil, move the heat mat, add fresh soil, clean the arena, start a new tank. Observation tools: pheromone and temperature overlays, follow an ant, ant inspector with its life history, colony graphs, timelapse. | Interventions like "introduce a second colony" or "add a predator" are M7, after the core is solid. |
| D10 | Can the colony die? | **Yes.** Starvation, drying out, overheating, mould, or the queen dying of age. A dead tank stays viewable with its history. | Invulnerable queen. |
| D11 | Rendering | **PixiJS (WebGL)**: ants drawn by code (head, thorax, waist, gaster, elbowed antennae, six legs in a tripod gait), smooth zoom from the whole tank down to one ant's legs, cheap overlays such as glowing trails. Soil and smell layers are uploaded from typed arrays as textures. Chosen by Marco 2026-10-11. | Canvas 2D: simpler, but about 2,000 animated ants is its limit and smooth zoom and glow are costly. |
| D12 | Repo | A **new repo** (e.g. `bassettijonathan-rgb/formicarium`), deployed to GitHub Pages so you can open the tank from a link. You create it once you approve this doc. | Reuse colony repo. |

---

## 2. Units and scales

| Quantity | Value | Source / note |
|---|---|---|
| Cell | 1 mm | Lasius workers are 3-5 mm; a soil grain is ~0.5-1 mm |
| Ant body | ~4 cells long | |
| Walking speed | 10-30 mm/s, temperature dependent | Ant speed roughly doubles from 15 to 30 °C (Hurlbert et al. 2008) |
| Sim step | 1/20 s of ant time | ants move ≤1.5 cells per step |
| Load | 1 grain or 1 food item or 1 brood item | |
| Crop (social stomach) | ~0.2 µL sugar water | rough |
| Sugar burnt | ~0.05 µL of 1 M sucrose per worker per tank day | rough, from resting metabolic rates; runs on the life clock (D6) |
| Development at 25 °C | egg ~3 wk, larva ~3 wk, pupa ~2 wk | Lasius niger, rough; scaled by temperature |
| Worker lifespan | ~1 year | queen ~15+ years (Lasius queens are famous for living 28) |

---

## 3. The tank

### 3.1 Layers (all typed-array grids)

- **Soil:** material (air, sand, loam, clay, glass, food, refuse, corpse),
  moisture 0-1, packed/loose flag.
- **Temperature:** diffuses from the heat mat and room; soil conducts, air
  less so. Ants move brood along it.
- **Humidity:** from soil moisture; dries over time unless watered.
- **Pheromone fields** (section 5): trail, alarm, building, nest odour, and
  the necrophoric cue from corpses.

### 3.2 Soil physics

Falling-sand style cellular automaton, but slow and cohesive (`src/sim/soil.ts`):

- A **loose** grain (dropped by an ant, or fallen) with air below falls. Dry
  grains slide down a 45° slope. Damp grains stick to any grain beside them,
  and a free one only topples off a drop of two cells, so damp spoil stands in
  steep heaps and does not pour into tunnel mouths.
- A **packed** grain with air below is ceiling. It holds while the gap under
  it is no wider than its material can span: about 8 cm for damp clay, 4 cm
  for damp loam, 1 cm for damp sand, a quarter of that when dry. The spans are
  generous because in a thin farm damp soil also clings to the glass.

Dry sand caves in, damp clay holds wide chambers. This is why ant-farm keepers
pick damp sand-loam mixes, and the sim shows it. (Ants packing the walls they
walk on, so used tunnels get sturdier, is left for later.)

### 3.3 The arena and the tube

A flat, top-down foraging arena joined to the farm by a tube. Food goes here.
Most trail-pheromone behaviour (D3) plays out here, so it is drawn top-down
next to the side-view farm.

---

## 4. One ant

### 4.1 Body and senses

Each ant has position, heading, and two **antennae** at fixed offsets ahead
and to each side. It smells each pheromone field at each antenna and turns
toward the stronger side (osmotropotaxis, as Lasius do). Antennal contact
with another ant gives its colony odour, task state and crop fullness.

Movement is a **correlated random walk** (Bovet & Benhamou 1988) biased by
pheromone gradients, path integration, temperature and walls. Ants climb glass
walls and soil faces; they can't cross water.

In the farm an ant also feels (M2):

- **Soil around it:** which way its antennae touch soil, and how hemmed in it
  is (firm soil within 3 mm in 8 directions). Loose spoil does not count as
  shelter.
- **Open air:** whether there is nothing but air straight above it, and,
  underground, which way the air is fresher. Real ants find the way out by
  the draught and the CO2 that builds up deep in a nest; the sim stands in for
  that with a field that is 1 in the open and loses 15% per 2 mm along the
  tunnels, rebuilt from the soil every 2 s.
- **Nestmates it touches** (within 3 mm), averaged over the last 30 s: how
  crowded it has been lately.

### 4.2 Internal state

- Age, caste (worker, queen, male later), body reserves, crop contents.
- **Path integrator:** a vector updated each step, with noise that grows with
  distance walked (Müller & Wehner 1988), so long excursions return less
  precisely and ants use trail and nest odour for the last stretch.
- **Task thresholds** (D5), one per task. M3 gives each worker its threshold
  for foraging, fixed at birth; M4 lets thresholds drift with age and
  experience.
- Memory of where the last food was (a remembered vector, like real
  foragers' route fidelity).

### 4.3 Behaviour states

A small state machine per ant, entered by thresholds and stimuli:

- **Rest** (most ants spend most time idle, which is true in real colonies:
  Charbonneau & Dornhaus 2015).
- **Explore / forage:** random walk outward, follow trail if smelled.
- **Return:** home vector, lays trail **only if it found food**, laying more
  for better food (Beckers et al. 1993).
- **Dig:** pick a grain where stimulated, carry it, drop it (section 6).
- **Nurse:** feed larvae, groom eggs, carry brood to the right temperature.
- **Clean:** carry refuse and corpses to the midden, outside the nest.
- **Share food:** trophallaxis with nestmates that beg.

**M1 stand-in for the nest.** Until M3 builds the inside of the nest, a
resting ant leaves on its own at a low rate, sooner if it remembers food,
and sooner still when foragers have recently come home with food. That last
effect is one "excitement" number for the whole nest, standing in for the
contacts between nestmates in a small chamber (Lasius niger recruits by
those contacts plus the trail). It is the only colony-level number in the
model and goes away when the nest is simulated.

**M2: the nest in the farm.** In the farm there is no nest box: the nest is
wherever the colony gathers. A wandering ant settles to rest where it is
hemmed in by soil and where colony odour is strong, and a resting ant leaves
colony odour, so resting spots attract more resters and a nest forms where
the colony dug. An ant coming in from the tube is home when the odour is
strong or it touches a resting nestmate. Recruitment works by contact: a
forager back with food excites the nestmates it touches for 30 s, and
excited ants set off for the tube. The lab experiments of section 9.1 keep
the M1 nest box.

**M3: hunger and food sharing.** Each worker burns the sugar in its crop on
the life clock and gets hungry. Workers with a low foraging threshold go out
more the hungrier they are, and scout now and then even when fed; contact
with a forager back with food (recruitment) raises the same urge. Workers
with a high threshold mostly stay in. A hungry ant begs from the better-fed
nestmates it touches, and they share (section 7.3). So a forager that cannot unload, because everyone at
home is full, stays in, and a hungry colony sends out more foragers with no
colony-level number involved.

Each ant logs short events (born, first foraging trip, found food, died) so
you can open any ant and read its life.

---

## 5. Chemistry

| Field | Laid by | Evaporates | Role |
|---|---|---|---|
| Trail | returning successful foragers | minutes | recruitment to food; trails that stop paying fade |
| Nest odour | the colony continuously in the nest | slowly | finding the entrance, nestmate check |
| Building | soil freshly dropped by diggers | ~30 min | where to keep building (Khuong et al. 2016) |
| Alarm | ants that are attacked or crushed | seconds | scatter or attack |
| Death cue (oleic acid) | corpses, after ~1 day | slowly | triggers carrying to midden (Wilson et al. 1958) |

Each field diffuses and evaporates every few steps on its grid. Evaporation
rates are the main tuning knobs; section 9 pins them against known results.

Colony odour: each colony has a hydrocarbon profile (a small vector). Ants
compare profiles on contact; this is how a second colony (M7) would be
recognised as enemy.

---

## 6. Digging and nest architecture

Rules per ant (after Buhl et al. 2004, Rasse & Deneubourg 2001 and Khuong et
al. 2016), in `src/sim/farmAnts.ts`:

1. **Where to dig.** A wandering ant may pick up the grain its antennae touch
   straight ahead, or, where the passage is narrower than its body, the wall
   beside it, so tunnels end up about a body's width wide. The chance rises
   steeply with how hemmed in it is (a dead end: soil on most sides; a flat
   open face is mostly left alone), with fresh dig marks nearby (digging
   attracts digging, the short-lived building cue), and with how often it has
   met nestmates lately (crowding). Debris that fell into a tunnel is cleared
   wherever it lies.
2. **Carrying out.** The digger turns round and carries the grain up the
   fresh-air gradient until it is out in the open, walks at least 2 cm along
   the surface away from its hole, then drops the grain, more readily next to
   other spoil, so heaps grow. Ants never drop spoil by the tube's mouth and
   clear any that blocks it.
3. **Site fidelity.** After dropping its grain, a digger walks back to the
   face it was digging by its path integrator (for up to a minute), as real
   diggers return to the same face.
4. **Regulation.** Digging needs crowding, so a colony digs fast while
   cramped and slows as the nest gets roomier: no target size is coded.

Emergent result (section 9.2): branching tunnels from a few entrances, small
chambers where tunnels meet, spoil heaps on the surface with the entrances
kept open, and nests that grow with colony size.

## 7. The colony's life

### 7.1 Lifecycle

Queen lays eggs at a rate that depends on her food intake and temperature.
Eggs, larvae, pupae and adults follow temperature-dependent durations
(D6 compresses them). Larvae must be fed protein to grow; underfed larvae
develop slower or die (are eaten, as real ants recycle brood). New workers
are pale callows that stay inside and nurse first.

### 7.2 Founding

Lasius queens found claustrally: alone in a sealed chamber, living off their
wing muscles, raising a first batch of tiny "nanitic" workers. Starting a
tank lets you choose a founding queen (slow, authentic) or a queen plus
20 workers (faster start).

### 7.3 Food flow

Food spreads through the colony as a contact network, not a global stockpile
(`src/sim/farmAnts.ts`, M3):

1. **Metabolism.** Every worker burns about 0.05 µL of sugar water a tank day
   (life clock, D6), so a full crop lasts about four tank days.
2. **Going out.** Each worker has its own threshold θ for foraging
   (response thresholds, Bonabeau et al. 1996), spread log-uniformly from 1
   to 20; its propensity to forage is 1 / (1 + θ⁴). A resting or wandering
   worker sets off for the tube at up to one trip every 4 minutes times its
   propensity, times a factor that rises in step with its hunger (how empty
   its crop is) from a fifth when full to one when empty: Camponotus
   foragers' trip rate rose linearly with how empty the colony was, and
   well-fed ones still made about a fifth as many trips (Greenwald et al.
   2018). So under a third of a starved colony goes out and the rest wait
   to be fed, as in Lasius niger, where about 20% of workers forage
   (Planckaert et al. 2019), and a fed colony still scouts and finds new
   food before it is hungry. Recruitment by a forager back with food raises
   the same rate.
3. **Begging and sharing.** A hungry ant that touches a nestmate whose crop
   is fuller by at least a fifth begs, more readily the bigger the
   difference. Both stop and face each other. The fuller one regurgitates at
   a rate set by the room left in the receiver's crop (exchanges fill a set
   fraction of the receiver's free space whatever the donor holds: Greenwald
   et al. 2018), never past the point where both hold the same. The exchange
   ends at a constant rate per second, whatever is shared (Buffin et al.
   2011): about 30 s on average.
4. **Foragers.** A forager tops up its crop at the food and lays trail and
   recruits by how much it drank. A forager from a hungry colony unloads at
   home, so it drinks a full load next time and lays a strong trail; one from
   a full colony goes out less and drinks less (Mailleux et al. 2000, 2006).

There is no colony store: the colony's food is what is in its workers'
crops, and the page shows that total. Protein, larvae and the queen come in
M3b: protein goes mostly to larvae and the queen; sugar fuels workers.

### 7.4 Brood sorting and the midden

Nurses sort brood by stage into rings or piles (Franks & Sendova-Franks 1992)
and carry it toward the preferred temperature. Cleaners take refuse and
corpses to an outside pile. Food left inside too long grows **mould** that
spreads in damp soil and kills brood. Overfeeding is a real ant-keeping
mistake, and the sim should punish it the same way.

---

## 8. Your role

Tools on the left, overlays on the right. Every tool is an ordinary command
logged with its tick, which keeps saves deterministic and replayable.

- **Feed:** drop sugar drop, insect piece or seeds in the arena.
- **Water:** wet a region of soil.
- **Heat mat:** drag along the bottom; ants move brood along the gradient.
- **Clean:** remove refuse and old food from the arena.
- **Look:** pheromone overlay per field, temperature, humidity; click an ant to
  follow it; colony graphs (population by stage, crop fullness, task mix over
  time); timelapse of nest growth.

---

## 9. Validation: the sim must reproduce real experiments

These run headless as tests, like the Hinton & Nowlan check in the creatures
project. If one fails, we fix the model, not the test.

1. **Double bridge** (Goss et al. 1989): two paths to food of different length;
   the colony converges on the shorter one most of the time.
2. **Food choice** (Beckers et al. 1993): with a rich and a poor sugar source,
   most traffic goes to the rich one.
3. **Trail decay:** remove the food; traffic on the trail decays within
   minutes.
4. **Nest volume scales with colony size** (Rasse & Deneubourg 2001), roughly
   linearly.
5. **Brood sorting:** brood stages end up spatially separated.
6. **Cemetery formation:** corpses end up clustered in one or a few piles
   (Theraulaz et al. 2002).
7. **Food spread** (Planckaert et al. 2019): in a starved Lasius niger
   colony given sugar, a minority of workers forage and the food reaches
   most of the colony within an hour by trophallaxis. A well-fed colony
   barely forages (Greenwald et al. 2018; Mailleux et al. 2006).

### 9.1 Results so far (M1, 10 colonies of 60 workers per condition, 30 min each)

Each experiment runs with trail laying on and, as a control, off. Run them
with `npm run experiment -- <name>`; the tests in `tests/science/` check them.

| Experiment | With trail | Control (no trail) | Paper |
|---|---|---|---|
| Double bridge, long branch 2x | 7 of 10 colonies put >90% of traffic on the short branch and 1 put 74%; 2 locked onto the long one | 60-66% short in every colony, none settles | Goss et al. 1989, Beckers et al. 1992 |
| Equal branches | every colony puts >80% of traffic on one branch (6 upper, 4 lower) | 47-53% each, no choice | Deneubourg et al. 1990 |
| 1 M vs 0.1 M sugar | 98-100% of visits at the rich drop in all 10 | n/a | Beckers et al. 1990, 1993 |
| Two equal drops | 9 of 10 put >80% of visits on one drop (5 on one side, 4 on the other) | n/a | Beckers et al. 1990 |
| Food removed | departures from the nest fall about 10-fold within 20 min; trail fades at its half-life | n/a | |

The occasional lock-in on the long branch is real ant behaviour too: when the
long branch happens to be found first, trail reinforcement can keep a colony
there.

### 9.2 Results so far (nest size; 3 farms per condition, 8 h of ant time each, re-run with M3's hunger and sharing)

`npm run experiment -- nest --ants N --hours 8 --runs 3 [--no-crowd]`;
`tests/science/nestVolume.test.ts` checks a shorter version. Area is what the
colony dug out below the original surface, in mm² (the farm is a 2D slice).
There is no food in these runs, so after a couple of hours the workers are
hungry and the foragers among them come and go.

| Colony | Nest after 8 h, crowding on | Per ant | Control: crowding off | M2 (before hunger), crowding on |
|---|---|---|---|---|
| 20 workers | 1,800-2,990 (mean 2,590) | 129 | 4,830-5,860 (mean 5,420), still digging fast | 1,640-2,190 (mean 1,920) |
| 40 workers | 4,660-6,410 (mean 5,530) | 138 | 7,390-7,820 (mean 7,620) | 4,860-6,370 (mean 5,550) |
| 80 workers | 7,060-8,670 (mean 7,990) | 100 | 7,570-8,780 (mean 8,340) | 7,970-8,300 (mean 8,140) |

What holds: tunnels, side branches and small chambers emerge with no shape
coded; spoil ends up in heaps on the surface with the entrances kept open;
a bigger colony digs a bigger nest, and per worker the nests are within about
±20% of each other (100-138 mm²); without the crowding cue a small colony
digs about twice as much. What is weaker than in Rasse & Deneubourg 2001:
the nests are still growing at 8 h rather than flat (in the 20-worker farms,
hours 6-8 add about half as much as hours 2-4; one farm stopped at 1,800 mm²
while another was still digging fast), and an 80-worker colony is stopped by
the size of the farm, not by its own regulation. M3c replaces the crowding cue with one that should
settle: brood and resting nestmates. Groups of 5 dig much less per ant than
groups of 40 (`tests/farmAnts.test.ts`), the social facilitation Chen 1937
described.

### 9.3 Results so far (M3 food flow, 10 colonies of 50 workers per condition)

`npm run experiment -- spread [--no-sharing] [--satiated]`;
`tests/science/foodFlow.test.ts` checks seeds 1-3. Each colony digs for an
hour, then every crop is emptied (standing in for the 4 days of starvation in
Planckaert et al. 2019) and a drop of 1 M sucrose goes in the arena 6 cm from
the tube. "Fed" means a worker has had at least a tenth of a crop since.

| | Fed after 30 min | Fed after 60 min | Workers that went out | Departures in the hour |
|---|---|---|---|---|
| Starved, sharing | 22-96% (mean 55%) | 78-100% (mean 91%) | 24-40% (mean 29%) | 37-98 (mean 63) |
| Control: no sharing | 2-20% (mean 10%) | 4-30% (mean 19%) | 18-34% (mean 25%) | 18-69 (mean 39) |
| Control: well fed | | | 6-20% (mean 13%), scouts | 4-27 (mean 12) |
| Planckaert et al. 2019 | about 58% (naive workers fall exponentially, mean 35 min) | about 82% (44 of 53 took part) | about 20% | |

Food reaches the colony about as fast as in the real one, a little faster
by the hour, and a few more workers go out (29% rather than about 20%): a
minority forages, the rest are fed mouth to mouth, and without sharing four
in five workers are still hungry after an hour. The colonies that start
slowly are the ones whose first foragers take longest to find the drop. A
well-fed colony sends out about a fifth as many workers as a starved one, all
scouts, as Greenwald et al. 2018 measured. Over 4 hours a starved colony's
crops level off at 40-70% full,
where what it brings in matches what it burns: hunger regulating foraging,
with nothing counting the colony's food. Greenwald et al. 2018 saw
Camponotus colonies fill up and nearly stop within 3-4 hours; ours keeps
foraging at 5-15 departures every 10 minutes because the life clock burns
a tank day of sugar every hour.

---

## 10. Architecture

- TypeScript + Vite, Vitest, ESLint; same setup as the spikingbrain repo.
- `src/sim/`: pure deterministic core (seeded RNG, no `Math.random`, no real
  time), runs in a Web Worker in the browser and in Node for tests and
  headless runs.
- Ants as struct-of-arrays (typed arrays), grids as typed arrays.
- `src/render/`: PixiJS, reads snapshots from the worker; never changes simulation state.
- `src/ui/`: tools, overlays, inspector, graphs.
- Saves in browser storage: seed + command log + periodic snapshots. Offline
  catch-up (D7) replays from the last snapshot.
- GitHub Actions: lint, typecheck, tests, deploy to Pages.

Performance budget: 2,000 ants plus grid updates under 8 ms per step at 1x,
leaving room for rendering at 60 fps.

---

## 11. Milestones

Each milestone is one or a few small PRs, merged by Marco, with a link to play.

| M | What you can see when it lands |
|---|---|
| M0 | Skeleton: empty tank renders, CI, Pages deploy, determinism test |
| M1 | Arena foraging: ants with path integration and trail pheromone find food and form trails. Double bridge and food choice tests pass |
| M2 | Soil and digging: side-view farm, soil physics, ants dig tunnels and chambers that scale with colony size |
| M3 | Colony life: queen, brood, development, trophallaxis, founding. In three PRs: M3a food flow (hunger, sharing, forager thresholds); M3b queen, brood and development; M3c brood and the resting nest as the digging cue |
| M4 | Division of labour: response thresholds, age polyethism, brood sorting, midden |
| M5 | Tending: temperature, humidity, mould, feeding tools, colony death |
| M6 | Keeping it: saves, offline catch-up, ant inspector, graphs, timelapse |
| M7 | Optional extras: second colony and war, other species, nuptial flights |

If a validation test in M1 or M2 cannot be made to pass with plausible
parameters, I stop and report before changing the model.

---

## 12. References

- Beckers, Deneubourg & Goss 1993. Modulation of trail laying in the ant *Lasius niger*. J. Insect Behav.
- Bonabeau, Theraulaz & Deneubourg 1996. Quantitative study of the fixed threshold model for the regulation of division of labour in insect societies. Proc. R. Soc. B.
- Bovet & Benhamou 1988. Spatial analysis of animals' movements using a correlated random walk model. J. Theor. Biol.
- Buffin, Mailleux, Detrain & Deneubourg 2011. Trophallaxis in *Lasius niger*: a variable frequency and constant duration for three food types. Insectes Soc.
- Buhl et al. 2004. Self-organized digging activity in ant colonies. Behav. Ecol. Sociobiol.
- Chen 1937. Social modification of the activity of ants in nest-building. Physiol. Zool.
- Charbonneau & Dornhaus 2015. When doing nothing is something. J. Bioecon.
- Franks & Sendova-Franks 1992. Brood sorting by ants. Behav. Ecol. Sociobiol.
- Goss, Aron, Deneubourg & Pasteels 1989. Self-organized shortcuts in the Argentine ant. Naturwissenschaften.
- Greenwald, Eckmann & Feinerman 2018. Individual crop loads provide local control for collective food intake in ant colonies. eLife.
- Hurlbert, Ballantyne & Powell 2008. Shaking a leg and hot to trot: the effects of body size and temperature on running speed in ants. Ecol. Entomol.
- Khuong et al. 2016. Stigmergic construction and topochemical information shape ant nest architecture. PNAS.
- Mailleux, Deneubourg & Detrain 2000. How do ants assess food volume? Anim. Behav.
- Mailleux, Detrain & Deneubourg 2006. Starvation drives a threshold triggering communication. J. Exp. Biol.
- Müller & Wehner 1988. Path integration in desert ants. PNAS.
- Planckaert et al. 2019. A spatiotemporal analysis of the food dissemination process and the trophallactic network in the ant *Lasius niger*. Sci. Rep.
- Rasse & Deneubourg 2001. Dynamics of nest excavation and nest size regulation of *Lasius niger*. J. Insect Behav.
- Theraulaz et al. 2002. Spatial patterns in ant colonies. PNAS.
- Wilson, Durlach & Roth 1958. Chemical releasers of necrophoric behavior in ants. Psyche.

Parameter values marked "rough" will be checked against these papers when
each milestone is built.
