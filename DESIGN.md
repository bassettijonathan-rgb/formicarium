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
| Development at 25 °C | egg ~16 days, larva ~12 days if fed, pupa ~14 days: first workers about 6 weeks after laying | Lasius niger, rough, from keepers' records at 24-27 °C; scaled by degree-days above 12 °C |
| Larva's food | ~0.05 µL of protein-rich food over its stage | rough |
| Queen's laying | up to ~10 eggs a tank day when fed, ~0.005 µL of protein per egg | rough, for a young colony |
| Worker lifespan | ~1 year: mean 310 tank days in the sim (M4c) | lab workers, Quque et al. 2023 (rough); queen ~15+ years (Lasius queens are famous for living 28), and does not die of age in the sim |

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
  for foraging, fixed at birth; M4 lets it drift with the worker's fat body,
  which follows its age and what it does (section 7.5).
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

**M3b: the queen and the brood.** The queen is an ant like the others with
a few differences: she never leaves the farm, digs or feeds a nestmate, walks
at half speed and rests ten times as long. She begs like a worker; the
protein she is fed goes into her body reserve, and while she rests she lays
eggs where she lies as long as the reserve covers them. Workers pile the
brood the way Deneubourg et al. (1991) found ants sort items: a worker that
touches a brood item picks it up the more readily the fewer other items lie
round it, and puts it down the more readily the more do, so scattered eggs
end up in piles (sorting the piles by stage is M4). Hungry larvae give off a scent;
a worker carrying protein follows it to them and feeds the larvae it
touches, and a worker that smells the brood's hunger goes out for protein
the way a hungry worker goes out for sugar (section 7.3). A worker touching
a pupa that is ready helps the new worker out of its cocoon.

**The nest round the queen (M3c's cue, brought into M3b).** In M2 the nest
was wherever workers rested. With a queen, food did not reach her. Tracing
where everyone was showed why, one cause after another:

- Workers back out in the open (a forager home from the tube, a digger that
  has dumped its grain) wandered in the headspace above the spoil for days.
  Now an ant remembers, by its path integrator, the hole it last came out
  of the soil by, walks back to it and goes in, and out in the open it
  follows the colony odour as strongly as a forager coming home. If spoil
  has buried that hole, an ant standing over it digs it open again, alone
  (other digging needs company).
- Smells spread through solid soil, so workers carrying protein in the
  headspace pressed against the soil right above the brood pile. Now colony
  odour and brood scent spread only through air: along tunnels, through the
  open, and through loose sand, which air seeps between (without that, a
  queen walled into a pocket by sand that slid into her tunnel could not be
  smelt, and starved there unvisited).
- The queen lived alone: she touched a worker 7-20% of the time and lay
  about 50 mm from her brood, and the workers that did touch her were empty
  while half the colony carried protein elsewhere, so she got about three
  eggs' worth a day. Now workers settle on brood (Lasius niger brood-tenders
  form one large, stable cluster where foragers form small, passing ones:
  Depickère, Fresneau & Deneubourg 2004), at up to 21 times the rate
  elsewhere (rough), and the queen counts as five brood items to the ants
  near her, both for settling and for piling, so her eggs are piled round
  her and her workers gather there (rough). The queen lives among the
  larvae and pupae, where the nurses are: she follows the brood scent to
  them, settles there, and settles elsewhere only a tenth as readily as a
  worker would (rough; she must lie somewhere to lay before there are
  larvae). Where she rests she leaves 20 times a worker's colony odour
  (rough). Workers touching her while she is short of protein feed her
  from their crop, as they feed a larva.
- With the queen fed, the eggs piled up but the larvae starved: the colony
  had split into two settlements, the queen, brood and empty nurses in one
  tunnel system and the fed foragers in another nearer the tube, with no
  brood scent reaching them. Now a worker carrying protein follows the
  brood scent inside the soil when it comes home as well as when it
  wanders, and it does not settle to rest until it is by the brood (rough).
  Since M4a it follows the brood scent out in the open too (section 7.5).
- Protein carriers spent two thirds of their time out in the open, because
  they took up digging on the way and then carried spoil. Now an ant with
  protein for the brood takes it there before it digs, though it still
  clears loose grains that block a tunnel; clearing a blocked way, unlike
  new digging, needs no company.
- Over three weeks the spoil filled much of the headspace, and a heap
  against the end wall buried the tube's mouth: the colony was shut in and
  starved. Ants never dropped spoil by the mouth; now they drop none
  anywhere above it either, where a grain could fall or slide onto it.
- In one tank the protein foragers never found the insect, although many
  passed within a few mm of it on their way home after giving up the
  search. Now an ant going home empty takes food of its kind that it walks
  into (the M1 trail experiments are unchanged).

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
| Brood scent | hungry larvae | half-life 6 h | leads workers carrying protein to the brood; workers who smell it go out for prey (M3b, rough) |

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
   other spoil, so heaps grow. Ants never drop spoil by the tube's mouth or
   above it, and clear any that blocks it.
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

What M3b builds (`src/sim/brood.ts`, `src/sim/farmAnts.ts`):

1. **Development** runs on the life clock at a rate proportional to the
   degrees above 12 °C (degree-days), so the stage lengths of section 2 hold
   at 25 °C and stretch in a cooler nest. The farm is at 25 °C until the heat
   mat comes in M5. At 1 tank day per hour of play, the first new workers
   appear about 42 hours after the first eggs.
2. **Larvae eat their way through their stage.** A larva grows only while it
   has food in it, using about 0.05 µL of protein-rich food over the stage,
   and begs (gives off brood scent) when it holds less than a third of a
   meal. An unfed larva waits, for up to 4 days; then the nurses that touch
   it eat it and take its protein back, as starved colonies cannibalise
   brood (rough). So the brood a colony keeps is the brood it can feed.
3. **Nurses.** A resting or wandering worker that touches a begging larva
   feeds it, at about one feed every 2 s of contact, up to 0.01 µL from the
   protein in its crop. Sugar alone feeds no larva.
4. **The queen** starts with 0.1 µL of protein in her body, enough for about
   20 eggs, which is how a claustral queen raises her first workers from her
   wing muscles. She stores up to 0.1 µL from what she is fed and lays up
   to 10 eggs a day while her reserve covers them: she lays as well as she
   is fed. While her store is under half full she gives off brood scent
   like a hungry larva, so food is brought to her (rough), and the workers
   touching her feed her protein the way nurses feed a larva.
5. **Eclosion.** A pupa that has finished waits until a worker touches it;
   the new worker appears where it lay, with its own foraging threshold
   drawn like any worker's, aged 0 and with a full fat body (section 7.5).
6. **Brood piling and the nest round the queen**, as in section 4.3: piling
   after Deneubourg et al. (1991), with pick-up rate 0.2/s × (0.5/(0.5+n))²
   and drop rate 1/s × (n/(1+n))² for n items within 5 mm (the queen
   counting as 5); a carrier gives up after 2 minutes (4 out in the open,
   where it never puts brood down). Workers settle on brood at
   1 + 20·n/(1+n) times their usual rate; a worker carrying protein at only
   20·n/(1+n), and the queen at 0.1 + 20·m/(1+m) for m larvae and pupae.

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

5. **Protein (M3b).** Insects are food like sugar water, but what a worker
   drinks from one counts as protein too. Protein is shared along with the
   rest of the crop, burnt like sugar by workers (a simplification: insect
   juice also fuels them), and only protein feeds larvae and the queen's
   eggs. A worker feels the brood's hunger by smelling it (brood scent) or
   from nestmates it touches, who pass on four fifths of what they feel; the
   feeling fades with a half-life of 10 minutes once nothing renews it. So
   nurses feel it most and foragers learn of it by touch, as larval demand
   reaches the foragers in real colonies (Dussutour & Simpson 2009). It
   drives a worker out like its own hunger does, less so the more protein
   it already carries. It goes out for
   whichever need is the stronger, sugar for its own hunger or protein for
   the brood's: back to food of that kind it remembers, or else exploring,
   and it passes sugar by when out for protein. One out for sugar that comes
   on prey takes it instead if it feels the brood's hunger (at 0.3 or more,
   rough); without this, a colony whose few protein scouts missed the
   insect went days without protein while its sugar foragers walked past
   it. A scout out for protein searches
   on its own rather than follow the trail, which leads to sugar as often as
   not (the trail does not say what it leads to). Lasius niger colonies with
   larvae to feed forage more for protein (Portha et al. 2002), and workers
   live on carbohydrate: colonies fed only protein die (Dussutour & Simpson
   2012). A worker carrying protein in the nest follows the brood scent to
   the larvae.

There is no colony store: the colony's food is what is in its workers'
crops, and the page shows that total.

### 7.4 Brood sorting and the midden

Nurses sort brood by stage into rings or piles (Franks & Sendova-Franks 1992)
and carry it toward the preferred temperature. Cleaners take refuse and
corpses to an outside pile.

**Sorting (M4b).** The piling of section 7.1 (item 6) becomes sorting with one
change, Deneubourg et al.'s (1991) own rule for sorting: when a worker
decides whether to pick an item up or put it down, it counts only brood of
that item's stage, and only what lies under its antennae (2.5 mm). An egg
among larvae is picked up as readily as an egg lying alone, and put down
where eggs lie thick. The queen still counts as five eggs, so the egg pile
stays by her, and workers still settle on brood of any stage. Counting the
other stages even a little (a tenth as much) was enough to keep all stages
in one mixed pile (section 9.6). Temperature, which real nurses also sort
by, comes with the heat mat in M5. Food left inside too long grows **mould** that
spreads in damp soil and kills brood. Overfeeding is a real ant-keeping
mistake, and the sim should punish it the same way.

**Death and the midden (M4c).** Workers die of old age, each at an age drawn
when it emerges from a Weibull distribution with a mean of 310 tank days and
shape 3, so the risk of dying climbs steeply after the first months (about a
year in the lab, Quque et al. 2023; rough). The queen does not die of age.
A dead ant lies where it fell. For its first tank day it smells like a
nestmate and is left alone; then the fatty acids of decay build up on it
(Wilson et al. 1958), a cue felt only by touch. A worker that touches such a
corpse picks it up, the less readily the more corpses lie round it, and
carries it out the way a forager goes: up the fresh air, by the tube's
draught and by its path integrator to the tube. In the arena it walks away
from the entrance, as Lasius and Myrmica carriers do (Diez et al. 2012), and
puts the corpse down now and then for no reason (0.012 per second, measured
by Theraulaz et al. 2002) and much more readily where corpses already lie
(Deneubourg et al. 1991). Nothing says where the midden is: corpses dropped
at random draw more, and the arena's dead gather into a few piles, mostly
against the far walls (section 9.7). A carrier that has not found the way
out after 5 minutes puts its corpse down and another takes it up later.
Refuse other than corpses (leftover prey) comes with mould in M5.

### 7.5 Who does what: fat, age and foraging (M4a)

Nothing assigns a worker a job. Each has its own foraging threshold θ (M3a)
and a **fat body** F, from 0 to 1, and the threshold it acts on is
θ·F/0.8: lean workers forage, fat ones stay in. In ants and bees, foragers
are the lean workers and nest workers the fat ones (Blanchard et al. 2000),
the workers that take up foraging when a colony needs more food are the
leaner ones whatever their age (Robinson et al. 2009), and making a worker
lean makes it forage, while foragers that go back to nursing grow fat again
(Bernadou et al. 2020).

What `src/sim/ants.ts` and `farmAnts.ts` do (`AntParams.fatGain` and the
rest; all rough):

1. **Fat follows food and work.** In the farm a worker builds fat at
   0.5 × crop fullness × (1 − F) per tank day. Every worker spends 0.05 a
   day, and 3 a day more while it is out of the farm. So a worker that stays
   in with a half-full crop settles at F = 0.8; four days without food take
   off only 0.2, so a starved colony does not turn every worker into a
   forager (Planckaert et al. 2019's starved colonies still sent out a fifth
   of their workers); and a worker out a tenth of its time runs empty within
   a few days. The fat is a measure of the body, not a store the model
   draws on: `burnRate` already charges the crop for all metabolism.
2. **So foragers specialise.** A worker that goes out grows lean, which makes
   it go out more: the same loop as threshold reinforcement in models of
   division of labour (Theraulaz et al. 1998), but through the body. A
   forager that stays home well fed grows fat again and stops.
3. **Age.** A worker emerges from its cocoon with F = 1 and spends its first
   7 days as a pale **callow** that never leaves the nest (in Lasius niger
   too, young workers mostly work inside and older ones outside: Quque et
   al. 2023; Mersch et al. 2013 in Camponotus). After that only its fat matters, so here a young
   worker turns forager within a couple of weeks if it goes out at all: age
   polyethism is weaker than in real colonies, where nursing lasts weeks
   to months. The keeper's starting workers are 14-200 days old, with
   F = 0.8.
4. **Protein goes to the brood first.** Lean foragers, keen to go out,
   carried the insect's juice back and forth: in the short growth test the
   colonies' workers held 3-5 µL of protein while the larvae starved, and
   one colony raised no workers at all. Now a worker carrying protein for the
   brood does not go out again until it has given it away, and it follows
   the scent of hungry larvae in the open as well as in the soil, so it finds
   brood in another part of the nest (one colony had dug a second tunnel
   system by the tube, with no way through underground). With both, the
   queen stays fed and the short test's colonies raise about 30 workers each
   in 20 days, where M3b's raised 1-11.
5. **Trips** out of the farm are counted per worker, for the experiments and
   the ant inspector (M6).

### 7.6 Warmth (M5a)

What M5a builds (`src/sim/heat.ts`):

1. **The farm's temperature** is a field on the 2 mm grid. The room is at
   one temperature (25 °C in the experiments, 22 °C on the page). The heat
   mat lies under part of the farm's bottom edge and holds the soil it
   touches at 33 °C (rough: a keeper's mat warms the glass about 8 °C above
   the room). Heat spreads through the farm at 0.5 mm²/s, the diffusivity of
   damp sandy soil, and leaks out through the glass to the room (its excess
   halves in 20 minutes; rough). Between two panes a few mm apart the glass
   wins, so the mat makes a warm patch reaching about 3 cm up, not a warm
   farm: 28 °C some 15 mm above it, room temperature 10 cm up. The patch
   builds within the hour after the mat goes on. The arena and the tube are
   at room temperature. The keeper moves the mat (left, middle, right, off)
   and can show the temperatures as an overlay.
2. **Brood develops at the temperature where it lies**, on the degree-days
   of section 7.1, so brood on the warm patch develops faster than brood in
   the cool soil above.
3. **Ants walk faster where it is warm**, twice as fast every 15 °C
   (Hurlbert et al. 2008); the speeds of section 2 are at 25 °C.
4. **Nurses keep brood warm, but not too warm.** A worker feels the
   temperature at its antennae and body and notices differences of 0.2 °C
   (Roces & Núñez 1995). Brood lying more than 1 °C from 28 °C (rough:
   Camponotus mus nurses move brood to 27.5-30.8 °C, Roces & Núñez 1989;
   keepers raise Lasius niger brood at 25-28 °C) is picked up up to 5 times
   as readily where the nurse feels which way is better; a carrier turns
   towards the better side and puts its load down up to 10 times less
   readily while it still feels a better temperature ahead. Where the farm
   is all one temperature none of this does anything, whatever that
   temperature is: at an even 25 °C the colony behaves exactly as it did
   before M5a (checked bit for bit).

Metabolism does not yet depend on temperature, and nothing yet dies of heat
or cold; overheating comes with colony death in M5c.

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
8. **Colony growth:** a queen and workers given sugar water and insects raise
   new workers about six weeks (tank days) after the first eggs; given sugar
   only, the larvae never grow.
9. **Division of labour** (Blanchard et al. 2000; Robinson et al. 2009):
   foragers are lean and nest workers fat; when the busiest foragers are
   taken out, others take over and grow lean, and the colony goes on
   feeding itself.
10. **Brood thermotaxis** (Roces & Núñez 1989): in a temperature gradient,
   nurses carry the brood to the temperature they keep it at.

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
the size of the farm, not by its own regulation. M3c was to replace the crowding cue with one that
should settle: brood and resting nestmates. It was folded into M3b as the nest forming round the queen
and brood (section 4.3); the digging cue itself is unchanged, and over weeks the nest still grows
slowly (section 9.4). Groups of 5 dig much less per ant than
groups of 40 (`tests/farmAnts.test.ts`), the social facilitation Chen 1937
described.

### 9.3 Results so far (food flow, 10 colonies of 50 workers per condition, re-run with M4a)

`npm run experiment -- spread [--no-sharing] [--satiated]`;
`tests/science/foodFlow.test.ts` checks seeds 1-3. Each colony digs for an
hour, then every crop is emptied (standing in for the 4 days of starvation in
Planckaert et al. 2019) and a drop of 1 M sucrose goes in the arena 6 cm from
the tube. "Fed" means a worker has had at least a tenth of a crop since.

| | Fed after 30 min | Fed after 60 min | Workers that went out | Departures in the hour |
|---|---|---|---|---|
| Starved, sharing | 56-100% (mean 74%) | 72-100% (mean 91%) | 24-38% (mean 31%) | 105-184 (mean 149) |
| Control: no sharing | 18-34% (mean 24%) | 18-46% (mean 31%) | 22-46% (mean 32%) | 67-187 (mean 119) |
| Control: well fed | | | 16-26% (mean 19%), scouts | 30-67 (mean 49) |
| M3b, starved | 0-86% (mean 43%) | 66-98% (mean 81%) | 20-34% (mean 27%) | 37-102 (mean 58) |
| M3b, well fed | | | 6-24% (mean 15%) | 9-26 (mean 14) |
| Planckaert et al. 2019 | about 58% (naive workers fall exponentially, mean 35 min) | about 82% (44 of 53 took part) | about 20% | |

Food reaches the colony a little faster than in the real one (91% fed by
the hour against 82%), and a few more workers go out (31% rather than
about 20%): a minority forages, the rest are fed mouth to mouth, and
without sharing seven in ten workers are still hungry after an hour. The
colonies that start slowly are the ones whose first foragers take longest
to find the drop.

M4a changed these numbers. The workers that went out while the colony dug
for its first hour have grown lean (section 7.5), and a lean forager goes
out as readily as its threshold allows: the colony makes two to three
times as many trips as in M3b, and food reaches it faster (74% fed at 30
minutes rather than 43%). A well-fed colony now sends out about a third as
many workers as a starved one (49 departures against 149), all scouts; in
M3a it was a fifth, in M3b a quarter. Each fed forager still sets off a
fifth as often as a hungry one, as Greenwald et al. 2018 measured, but the
lean scouts that find the drop go back to it again and again, so a fed
colony's departures climb through the hour (2-8 per 10 minutes at first,
8-19 at the end). The test asks for a third, which seeds 1-3 pass by a
small margin (135 against 41); a quarter was our own choice in M3a, not a
measured ratio, and whether fed lean foragers should keep revisiting a
drop they cannot drink from is open.

In M3a, over 4 hours a starved colony's crops levelled off at 40-70% full,
where what it brings in matches what it burns: hunger regulating foraging,
with nothing counting the colony's food. Greenwald et al. 2018 saw
Camponotus colonies fill up and nearly stop within 3-4 hours; ours keeps
foraging at 5-15 departures every 10 minutes because the life clock burns
a tank day of sugar every hour.


### 9.4 Results so far (colony growth; 3 colonies of 60 workers and a queen, 60 tank days each, re-run with M4a)

`npm run experiment -- growth --days 60 [--no-protein]`; real development
times (egg 16, larva 12, pupa 14 tank days at 25 °C). Every tank day the
keeper puts out fresh sugar water and one insect. Workers at day 60 count
the 60 the colony started with.

| Colony | Eggs by day 12 | First larvae | First new workers | Workers at day 60 | Brood at day 60 |
|---|---|---|---|---|---|
| Seed 1 | 57 | day 18 | by day 48 | 139 | 128 eggs, 82 larvae, 103 pupae |
| Seed 2 | 39 | day 18 | by day 48 | 95 | 86 eggs, 76 larvae, 72 pupae |
| Seed 3 | 64 | day 18 | by day 48 | 156 | 117 eggs, 119 larvae, 100 pupae |
| Control: no insects (seed 1) | 19 | day 18 | none | 60 | none: the 10 larvae never grow and are gone by day 30 |
| Expected | up to 10 a day | after 16 days | about 42 days after the first eggs | | |
| M3b, before the fixes of section 7.5 | 40-59 | day 18 | by day 48 | 71-115 | |

What holds: all three colonies raise their first workers about six weeks
after the first eggs, as the stage durations predict, and grow by 60-160%
in 60 days on one insect a day, with 70-100 more pupae on the way. Since
M4a sends protein to the brood before its carriers go out again (section
7.5), the queen's store stays at or near full and growth is steady; in M3b she
ran out for a week or more while big batches of larvae were fed, and the
colonies grew in pulses. The day-by-day protein trace that led here
(section 4.3, "The nest round the queen") showed a chain of separate
failures, each of which stopped every colony before: a queen alone, the
fed foragers settled away from the brood, protein carriers digging and
lost in the open, the tube buried under spoil, a queen walled in by fallen
sand, and prey passed by.

What is weaker: once the brood is large, the workers' crops run low (10-15%
full from about day 30, against 40-60% in the first weeks), although sugar
is left over every day. Feeding a large brood may tie up workers that hold
a little protein and so no longer go out (rough; to look at with M4b). The
nest keeps growing slowly: about 140-165 mm² per worker by day 20 (M3b)
against 100-140 at 8 hours, and the spoil fills much of the headspace in
three weeks, so a colony that keeps growing will run out of room in this
farm.

The short version in `tests/science/colonyGrowth.test.ts` (30 workers,
eggs and pupae eight times faster, larvae at their real 12 days, 20 days)
raises new workers in all three colonies: about 30 each with M4a, 1-11
with M3b. An earlier version squeezed the
larval stage too, which asks the nurses for protein eight times faster
than any real colony feeds its larvae, and one of the three colonies raised
no workers in it.

### 9.5 Results so far (division of labour, M4a; 3 colonies of 60 workers, a queen and brood per condition)

`npm run experiment -- division [--no-fat]`; `tests/science/division.test.ts`
checks seeds 1-3. Each tank day the keeper puts out sugar water and an
insect. After 4 days the keeper takes out the fifth of the workers that made
the most trips out of the farm, and the colony runs 6 days more.

| | Fat: busiest fifth / the rest, day 4 | After removal: new busiest fifth / the rest | Crops, last 2 days against days 3-4 | Trips, last 3 days against days 2-4 |
|---|---|---|---|---|
| Seed 1 | 0.15 / 0.74 | 0.35 / 0.62 | 30% / 44% (0.67) | 45% |
| Seed 2 | 0.09 / 0.76 | 0.31 / 0.74 | 47% / 67% (0.71) | 43% |
| Seed 3 | 0.17 / 0.71 | 0.35 / 0.60 | 25% / 55% (0.45) | 24% |
| Control: fat held (seeds 1-3) | 0.80 / 0.80 | 0.80 / 0.80 | 0.32, 0.62, 0.37 | 21-32% |

Foragers are lean and the workers that stay in are not, as Blanchard et
al. 2000 found: nothing in the model says who forages beyond each worker's
threshold, and the fifth that forages most ends up with a fifth of the fat
of the rest. When they are taken out, others take up the foraging and grow
lean in their turn (Robinson et al. 2009), and the colony goes on feeding
itself at about two thirds of its crop level before; with fat held at its
start (the control, thresholds fixed as in M3), two of three colonies sink
to a third of it. Trips do not come back to what they were: before the
removal the lean specialists made two to three times the trips the
colony needed (crops 44-67% full against 33-58% in the control), and the
colony settles at fewer trips and emptier crops. Who takes over is set as
much by each worker's own threshold as by its fat, so the new foragers are
mostly ones that had already gone out now and then (19-77% of trips after
the removal were by workers that had made none before).
Age polyethism is weak, as section 7.5 says: only callows are kept in.

### 9.6 Results so far (brood sorting, M4b; 3 chambers of 30 workers, 3 hours each)

`npm run experiment -- sorting [--mixed]`; `tests/science/broodSorting.test.ts`
checks seeds 1-3. A closed chamber 100 mm long and 10 mm high, with no
digging, food or queen, holds 30 workers and 15 eggs, 15 larvae and 15
pupae strewn at random. Two measures: for each item, the share of its three
nearest items that are of its own stage (a third if stages were mixed at
random); and the share of its pile that is of its own stage, items closer
than 4 mm being one pile.

| | Same-stage neighbours, start → 3 h | Pile purity, start → 3 h | Piles |
|---|---|---|---|
| Seed 1 | 0.31 → 1.00 | 0.52 → 1.00 | 3 |
| Seed 2 | 0.36 → 0.80 | 0.52 → 0.67 | 2 |
| Seed 3 | 0.37 → 0.66 | 0.52 → 0.67 | 2 |
| Control: count all stages, 5 mm (M3b piling) | 0.31-0.37 → 0.35-0.42 | → 0.36-0.41 | 2-4 |
| Other stages counted at a tenth | → 0.46-0.63 | → 0.33-0.61 | 1-2 |
| Other stages counted at a quarter | → 0.32-0.38 | → 0.33 | 1 |

With each worker counting only the stage of the item it handles, the brood
ends up sorted: in one chamber into three single-stage piles, in the other
two into a pure pile and a mixed one, as Franks & Sendova-Franks (1992)
describe for Leptothorax brood and Deneubourg et al. (1991) got with this
rule. With piling as it was in M3b the stages stay as mixed as they started.
The result is sensitive in a way worth knowing: workers that let other
stages count even a little build one mixed pile, because the biggest pile
then pulls everything in. Real nurses tell stages apart by touch and smell,
so counting only the right stage is the plausible rule. The radius matters
less (3 mm gave 0.99/0.78/0.60), but a 5 mm one sorts only weakly.

Sorting does not get in the way of raising brood: the three colonies of
section 9.4, re-run with it, had 131, 133 and 136 workers on day 60 (139, 95
and 156 without it). In one of them the queen ran out of protein from day 42
and laid less, so its brood was smaller by the end.

### 9.7 Results so far (cemetery formation and the midden, M4c)

`npm run experiment -- cemetery [--corpses 200] [--no-piles]` and
`midden`; `tests/science/cemetery.test.ts` checks seeds 1-3 (cemetery)
and 1-2 (midden). Corpses dead long enough to smell of death are strewn at
random over the 20 cm arena, with 40 workers in a lab nest behind the
entrance; about a quarter of them are out at a time. A pile is 5 or more
corpses within 5 mm of each other, directly or through others.

| | Piles after 30 h (5 colonies) | Mean | Real (Theraulaz et al. 2002, 25 cm arena) | Share in piles at 1 h / 2 h / 30 h |
|---|---|---|---|---|
| 100 corpses | 2, 2, 1, 2, 2 | 1.8 | 1.73 | 66-76% / 94-97% / 100% |
| 200 corpses | 2, 3, 2, 2, 2 | 2.2 | 2.07 | 56-71% / 84-96% / 99-100% |
| Control: carriers ignore other corpses (100, 3 colonies) | 2-6 groups, changing hour to hour | | | 20-33% / 29-45% / 37-56% |

The dead end up in about as many piles as Theraulaz et al. found, and with
more corpses in slightly more piles, as they did. The piles form faster: most
corpses are in piles within two hours, where in the real arenas the piles
grew over most of a day; we do not know how many workers Theraulaz et al.
had out, and more carriers gather corpses faster. Because carriers walk away
from the nest, the piles lie against the far walls, mostly in the corners
(mean distance from the entrance about 210 mm; strewn at random, 110 mm), as
Diez et al. (2012) saw corpses taken to the remote parts of the foraging
area. The control shows the walls are not what makes the piles: carriers
that put corpses down regardless of other corpses still crowd them against
the far walls, but in loose groups that come and go, never more than about
half the dead in piles of 5.

In the farm (`midden`), a colony of 60 settles in for 3 hours, then 10 of
its resting workers die where they lie, in the nest. For the first hour (a
tank day) the dead lie untouched; within the second, nearly all are carried
up, through the tube and out into the arena (3 colonies: 10, 8 and 10 in the
arena after 2 hours, and by 3 hours every corpse but one in one colony).
Out there they end up in one or two piles in the
far corners, about 210 mm from the entrance.

Old age is slow at this scale: in the three 60-day colonies of section 9.4,
re-run with M4c, 2, 4 and 3 workers died, every corpse was carried out to
the arena, and the colonies still grew (157, 95 and 130 workers on day 60).

### 9.8 Results so far (brood thermotaxis, M5a; 3 chambers of 30 workers)

`npm run experiment -- warmth [--no-thermo]`; `tests/science/warmth.test.ts`
checks seeds 1-3. The closed chamber of section 9.6 is held at 16 °C at
one end and 32 °C at the other (temperatures fixed), with 15 eggs, 15
larvae and 15 pupae strewn through it.

| | Mean temperature of the brood, start → 1 h → 3 h | Within 2 °C of 28 °C, start → 1 h → 3 h |
|---|---|---|
| Seed 1 | 23.8 → 28.6 → 28.6 °C | 13% → 100% → 100% |
| Seed 2 | 23.8 → 27.9 → 27.9 °C | 22% → 100% → 100% |
| Seed 3 | 23.3 → 27.8 → 27.8 °C | 24% → 100% → 100% |
| Control: nurses ignore temperature | 23.3-23.8 → 19.2-23.3 → 19.4-23.4 °C | 13-24% → 0% → 0% |

Within an hour the nurses have the brood where it is as warm as they keep
it. Without thermotaxis the brood piles up towards the cold end in two of
three chambers, probably because ants walk slower in the cold, so carriers
linger there and put more of their loads down (nobody built that in).

On the page's terms, a room at 22 °C, the mat helps but less than it
could. Two of section 9.4's colonies, given 60 tank days at 22 °C, had 58
and 77 workers on day 60 (their first new workers came about day 57); with
the mat under the middle of the farm they had 117 and 86. But their brood
lay at 22-24 °C on average: the nest is dug near the surface, and the mat's
warmth reaches only the bottom few cm, too far below for nurses to feel
which way is warmer. Real colonies nest down onto a mat's warmth; here the
colony would have to dig down to it first. Whether the patch should reach
further (a warmer mat, or slower loss through the glass) is open.

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
| M3 | Colony life: queen, brood, development, trophallaxis, founding. In three PRs: M3a food flow (hunger, sharing, forager thresholds); M3b queen, brood and development, with the queen and brood as the heart of the nest (planned as M3c, brought forward by Marco 2026-10-11); M3c brood and the resting nest as the digging cue, folded into M3b (the digging cue itself is still open) |
| M4 | Division of labour: response thresholds, age polyethism, brood sorting, midden. In three PRs: M4a fat, age and who forages (thresholds drift with each worker's fat; callows; protein delivered before going out); M4b brood sorting by stage; M4c corpses and the midden |
| M5 | Tending: temperature, humidity, mould, feeding tools, colony death. In parts: M5a warmth (heat mat, temperature field, brood thermotaxis); M5b water and mould; M5c colony death and the keeper's tools |
| M6 | Keeping it: saves, offline catch-up, ant inspector, graphs, timelapse |
| M7 | Optional extras: second colony and war, other species, nuptial flights |

If a validation test in M1 or M2 cannot be made to pass with plausible
parameters, I stop and report before changing the model.

---

## 12. References

- Beckers, Deneubourg & Goss 1993. Modulation of trail laying in the ant *Lasius niger*. J. Insect Behav.
- Bernadou, Hoffacker, Pable & Heinze 2020. Lipid content influences division of labour in a clonal ant. J. Exp. Biol. 223, jeb219238.
- Blanchard, Orledge, Reynolds & Franks 2000. Division of labour and seasonality in the ant *Leptothorax albipennis*: worker corpulence and its influence on behaviour. Anim. Behav. 59, 723-738.
- Bonabeau, Theraulaz & Deneubourg 1996. Quantitative study of the fixed threshold model for the regulation of division of labour in insect societies. Proc. R. Soc. B.
- Bovet & Benhamou 1988. Spatial analysis of animals' movements using a correlated random walk model. J. Theor. Biol.
- Buffin, Mailleux, Detrain & Deneubourg 2011. Trophallaxis in *Lasius niger*: a variable frequency and constant duration for three food types. Insectes Soc.
- Buhl et al. 2004. Self-organized digging activity in ant colonies. Behav. Ecol. Sociobiol.
- Chen 1937. Social modification of the activity of ants in nest-building. Physiol. Zool.
- Charbonneau & Dornhaus 2015. When doing nothing is something. J. Bioecon.
- Deneubourg, Goss, Franks, Sendova-Franks, Detrain & Chrétien 1991. The dynamics of collective sorting: robot-like ants and ant-like robots. In From Animals to Animats (SAB 1990). MIT Press.
- Depickère, Fresneau & Deneubourg 2004. Dynamics of aggregation in *Lasius niger* (Formicidae): influence of polyethism. Insectes Soc. 51, 81-90.
- Diez, Deneubourg & Detrain 2012. Social prophylaxis through distant corpse removal in ants. Naturwissenschaften 99, 833-842.
- Dussutour & Simpson 2009. Communal nutrition in ants. Curr. Biol.
- Dussutour & Simpson 2012. Ant workers die young and colonies collapse when fed a high-protein diet. Proc. R. Soc. B.
- Franks & Sendova-Franks 1992. Brood sorting by ants. Behav. Ecol. Sociobiol.
- Goss, Aron, Deneubourg & Pasteels 1989. Self-organized shortcuts in the Argentine ant. Naturwissenschaften.
- Greenwald, Eckmann & Feinerman 2018. Individual crop loads provide local control for collective food intake in ant colonies. eLife.
- Hurlbert, Ballantyne & Powell 2008. Shaking a leg and hot to trot: the effects of body size and temperature on running speed in ants. Ecol. Entomol.
- Khuong et al. 2016. Stigmergic construction and topochemical information shape ant nest architecture. PNAS.
- Mailleux, Deneubourg & Detrain 2000. How do ants assess food volume? Anim. Behav.
- Mailleux, Detrain & Deneubourg 2006. Starvation drives a threshold triggering communication. J. Exp. Biol.
- Mersch, Crespi & Keller 2013. Tracking individuals shows spatial fidelity is a key regulator of ant social organization. Science 340, 1090-1093.
- Müller & Wehner 1988. Path integration in desert ants. PNAS.
- Planckaert et al. 2019. A spatiotemporal analysis of the food dissemination process and the trophallactic network in the ant *Lasius niger*. Sci. Rep.
- Portha, Deneubourg & Detrain 2002. Self-organized asymmetries in ant foraging: a functional response to food type and colony needs. Behav. Ecol.
- Quque et al. 2023. Both age and social environment shape the phenotype of ant workers. Sci. Rep. 13, 186.
- Rasse & Deneubourg 2001. Dynamics of nest excavation and nest size regulation of *Lasius niger*. J. Insect Behav.
- Robinson, Feinerman & Franks 2009. Flexible task allocation and the organization of work in ants. Proc. R. Soc. B 276, 4373-4380.
- Roces & Núñez 1989. Brood translocation and circadian variation of temperature preference in the ant *Camponotus mus*. Oecologia 81.
- Roces & Núñez 1995. Thermal sensitivity during brood care in workers of two Camponotus ant species: circadian variation and its ecological correlates. J. Insect Physiol. 41, 659-669.
- Theraulaz, Bonabeau & Deneubourg 1998. Response threshold reinforcement and division of labour in insect societies. Proc. R. Soc. B 265, 327-332.
- Theraulaz et al. 2002. Spatial patterns in ant colonies. PNAS.
- Wilson, Durlach & Roth 1958. Chemical releasers of necrophoric behavior in ants. Psyche.

Parameter values marked "rough" will be checked against these papers when
each milestone is built.
