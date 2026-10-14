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
| D1 | What do you look at? | **Side view of a two-pane glass ant farm** (soil cross-section) with a strip of surface on top and a separate **arena** (outworld) joined by a tube, where food goes. Digging is the main show and only a side view shows it. Since 2026-10-13 new tanks use a bought nest lying on the desk instead (section 3.5). | Top-down only (good for trails, hides the nest). |
| D2 | Which species? | **Lasius niger** (black garden ant): the best-studied trail-laying ant, single queen, small same-size workers, digs in soil. Species is a data file so others can be added. | Messor (seed harvesters, nice granaries) or Pheidole (soldier caste) later as data. |
| D3 | How do ants find home? | **Path integration** (each ant keeps a noisy vector back to the nest, as real ants do) plus nest odour near the entrance. Food trails use real **trail pheromone laid only on the way back from food**. | The common "two pheromones" shortcut (a home trail and a food trail). Simpler, but real ants do not do it, and it makes trails look fake. |
| D4 | How does digging work? | **Grain-level soil** (each cell is ~1 mm of sand, loam or clay with moisture) and **stigmergic digging**: ants pick up grains where others dug recently and drop them where pellets pile up, guided by a short-lived building pheromone in the soil (Khuong et al. 2016). Unsupported soil collapses, dry sand more than damp clay. | Ants dig along a pre-made tunnel template. Easier, but nothing emerges. |
| D5 | Who does which job? | **Response thresholds** (Bonabeau et al. 1996): each ant has its own threshold per task stimulus (hungry larvae, dirty chamber, food smell) and that threshold drifts with age and experience. Young ants nurse, old ants forage, with no rule saying so. | Fixed castes by age. |
| D6 | Two clocks | Ants **move in real time** (1 s of sim = 1 s of ant life at 1x). Development (egg to adult, queen laying rate, ageing) runs **compressed**, default 1 real day of the tank = 1 hour of play, adjustable. Every ratio inside each clock stays real. | One clock: real Lasius takes ~2 months egg to worker and years to grow, too slow to watch. |
| D7 | Does the tank live while the tab is closed? | **Yes, capped.** On reopening, the sim catches up headless at max speed for the time you were away, up to 3 tank-days, then shows a short log of what happened ("12 workers eclosed, mould in chamber 3"). | Paused while closed (no aquarium feeling). |
| D8 | Scale | Tank 30 x 20 cm at 1 mm cells (300 x 200 soil grid), arena 20 x 20 cm (40 x 30 cm from L2, section 3.3; the validation experiments keep 20 x 20). Up to **2,000 ants** at 60 fps. Real Lasius colonies reach 10,000+; this is a young colony, which is what ant farms hold anyway. | Bigger tanks later if performance allows. |
| D9 | What can you do? | Feed (sugar water, protein: insects, seeds), water the soil (since 2026-10-13 the farm waters itself, section 7.7), move the heat mat, add fresh soil, clean the arena, start a new tank. Observation tools: pheromone and temperature overlays, follow an ant, ant inspector with its life history, colony graphs, timelapse. | Interventions like "introduce a second colony" or "add a predator" are M7, after the core is solid. |
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
- **Humidity:** from soil moisture. The page's farm waters itself and never dries (section 7.7); in the experiments soil can dry unless watered.
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

A flat foraging arena joined to the farm by a tube. Food goes here. Most
trail-pheromone behaviour (D3) plays out here.

Asked by Marco on 2026-10-13: a bigger arena, seen from an angle, with
decorations inside. Approved the same day (choices A1 to A4, L2):

- **A1 Size.** The keeper's arena is 40 x 30 cm of floor with 10 cm glass
  walls (`TANK_ARENA`), a common outworld size. The tube enters halfway along
  the left wall. The lab experiments of section 9 keep their 20 x 20 cm
  arena, so their results are unchanged.
- **A2 Old tanks.** A tank saved with the old arena moves into the new one
  when loaded: the old floor lands against the left wall, centred on the
  tube, so ants, food and trails keep their places relative to the tube.
  Decorations are laid round where ants and food already are.
- **A3 The view.** A pinhole camera 1.3 m away looks down at the desk at 40
  degrees (`src/render/projection.ts`): the far end is smaller, the glass
  walls stand up and the near wall is drawn over everything inside. The
  floor, its decorations and the trail are pictures laid on it in perspective
  (PixiJS `PerspectiveMesh`). Each ant is placed by the camera and flattened
  in depth. Ants and the things standing on the floor are drawn far to near,
  so a stone hides an ant behind it. A tap is mapped back to the floor point
  under it, for feeding and the inspector. The desk's planks run to the same
  vanishing point. A switch shows the arena straight from above, as before,
  which reads trails best. The simulation stays a flat floor in mm: the
  camera is drawing only.
- **A4 Decorations.** Each new tank lays out from its seed (`src/sim/decor.ts`):
  a water tube with a cotton plug along the back wall, a piece of cork bark,
  5 to 7 stones, 3 to 5 dry leaves, 2 twigs and 2 cushions of moss, on a
  fine-sand floor. The tube's mouth and the first drop of sugar are kept
  clear, and obstacles leave at least 12 mm between each other and the walls.
  The stones, the bark and the water tube stand up from the floor and are
  climbed (A5; until then they were walls the ants walked round). Leaves,
  twigs and moss are flat and walked over. Food put down on a stone, the
  bark or the tube is refused: it would roll off.
- **A5 Climbing** (Arena 1, B1-B2 below). The arena keeps a relief: the
  height of the ground over each mm of floor, 0 on the sand. Stones and bark
  are half ellipsoids over their outlines and the water tube a cylinder
  lying on the floor, the same shapes the page draws (`reliefOf` in
  `src/sim/decor.ts`). An ant walks over the relief with its usual stride;
  going up or down, the same walking crosses less floor (`floorStep`), so a
  climb costs its height. Its path integrator counts the floor it crossed,
  not the ground it walked, as desert ants do over hills (Wohlgemuth,
  Ronacher & Wehner 2001), so it heads straight home from the top of a
  stone. Trail is laid on the ground wherever the ant is. Ants walk over
  things, not under them: there are no overhangs. The page draws an ant on
  a stone at its height, over the stone where the viewer would see it. Tanks
  saved before this keep their decorations, which become climbable. Checks
  (`tests/arena.test.ts`): crossing a stone costs its surface length to
  within 3%; in 6 lab colonies foraging over the decorated arena for 10
  minutes, 38-40 of 40 workers in each climbed something, 5-11% of the ants
  out were on top of something at any moment, 66-95% of those that climbed
  were back in the nest by the end, and all 6 found sugar 36 cm away (5 of 6
  did when the decorations were walls). With no relief (the lab
  experiments) nothing changes, checked bit for bit.

### 3.4 Objects, feeders and feeder insects (Marco, 2026-10-13)

Marco asked to "be able to put object inside and have the ants crawl on the
object", for "the typical feeder or trays that are used to feed ants", and
for feeder insects "like the one you buy... pieces or whole and in that case
they took them apart". He approved this plan as drafted
(`/mnt/project-files/ants/arena-objects.md`), to be built in three steps:

- **Arena 1 (built, A5): climbing.** B1: a relief (height map), not full 3D.
  B2: stones, bark and the water tube are climbed; the glass walls are not
  (fluon); no overhangs.
- **Arena 2 (built): placing objects.** B3: a "Put in the arena" row on the
  page puts in a feeding dish, a sugar feeder, a stone, cork bark or a
  branch (6 mm thick, 9-13 cm long, a bridge to climb), and moves or takes
  out any of them, the tank's own decorations included. Each is a logged
  keeper command (`put`, `move`, `remove`, `refill`), so replays stay exact;
  a stone's, bark's or branch's shape comes from the seed and the step. An
  object is refused over the tube's mouth (25 mm), against the glass, on
  anything else that stands up, or on food; leaves and moss lie flat and can
  be covered. After each change the relief is rebuilt. B4: the dish is 35 mm
  across, a 1.2 mm wall 4 mm high round a 1 mm floor; food tapped inside
  stays inside and moves with the dish, and Clean arena empties it.
  B5: the feeder is a test tube 80 mm long and 15 mm across lying on the
  floor, its cotton plug at the left end; its 2 mL of sugar water is one
  food source the ants drink from at the cotton's face (reach 7.5 mm, the
  tube's radius), so it never spreads; its level shows through the glass,
  and Refill tops every feeder up with the sugar chosen on the page.
  Tested: ants climb into a dish to sugar in it (3 of 3 lab colonies in
  15 minutes) and drink at a feeder's cotton.
- **Arena 3 (built): feeder insects** (`src/sim/prey.ts`). B6: the page's
  food row offers a fruit fly (2.5 mm, 1 mg, one piece), a small cricket
  (12 mm, 40 mg: head, thorax, abdomen, two hind legs of 1.8 mg, four legs of
  0.45 mg) and a mealworm (22 mm, 120 mg: a 2 mg head and six sections), all
  rough masses; a cricket or mealworm is given whole, cut in two or in
  pieces (the parts laid a little apart). Each piece's juice (haemolymph
  and soft tissue) is its mass less its skin (15-50%); what is left when it
  is drunk is a husk. B7, by touch alone, a forager at an insect:
  1. carries the piece it touches home if it is free and at most
     `preyCarryMax` (2 mg): a fly goes whole;
  2. else bites at the joint of a part that would be that light once off
     (a leg), several ants together faster (30-60 ant-seconds for a
     cricket's legs, 600 for a mealworm's head); the cut leaves a wound on
     both sides, and it carries the part home;
  3. else drinks at a wound if a place is free there (two workers at each),
     for `preyDrinkTime` (300 s: the juice is chewed out of the tissue; rough),
     from any piece still joined (an insect's blood is not in vessels);
  4. else bites a new hole through the skin (15-90 ant-seconds for a
     cricket, 600 for a mealworm).
  One that has bitten for `preyGiveUp` (120 s) and got nothing goes home for
  help, laying trail at `preyTrail` (0.6, on the scale of a full crop of the
  best sugar). One carrying a piece lays that trail if it touched the rest
  of the insect, still too big to take, where it picked it up; none if it
  took the whole thing. So trail follows whether one ant can take the find
  home (Detrain & Deneubourg 1997), which brings a crowd to a cricket and
  nobody but the finder to a fly. As before, a forager takes insects only if
  it set out for protein or feels the brood's hunger (M3b): a colony with
  no hungry brood leaves them lying. No group carrying: Lasius neoniger
  carries prey in groups (Traniello 1983), but Lasius niger keepers see
  prey cut up, so this is left out. B8: a carrier takes its piece through
  the tube to the brood, by the brood's smell as a nurse with protein does,
  and puts it down by the brood (or after 300 s anyway); workers that touch
  it drink from it now and then (`pieceSipRate`, 0.2 per second) and feed
  the protein on to the larvae; the husk, and a piece gone mouldy, is
  carried out to the midden as a corpse is. A piece left uneaten goes mouldy
  after `preyMouldDays` (2 tank days at 25 °C), and in the damp nest feeds
  mould as a corpse does. Clean arena takes out husks and mouldy pieces;
  Clear food takes out every insect lying in the arena. B9: old tanks load
  with no insects; an old insect puddle stays a puddle (the protein drop is
  kept as a command for old saves and the experiments, off the page).
  Validation: section 9, test 14. Not reproduced: cutting an insect does
  not make it go faster here. A hungry colony bites holes through even a
  mealworm's skin within minutes, so the time to strip it is set by how
  many workers come and how long each drinks: 10 hungry workers took a
  cricket's juice in 97-115 minutes whole or in pieces, and a mealworm's in
  about 5.5 hours either way.

### 3.5 Bought nests (Marco, 2026-10-13)

Marco asked to "move forward from the diggable sand ... towards the classic
formicarium that you can buy in ytong, wood, plastic, etc. Of different
sizes and styles and modular". He approved the plan as drafted
(`/mnt/project-files/ants/bought-nests.md`, decisions N1-N10), to be built
in three steps: Nests 1, one ytong nest; Nests 2, plaster, acrylic and wood
with covers and light; Nests 3, modules, tubes, cotton plugs, the test-tube
start and moving house. In a bought nest the chambers are carved already:
the ants cannot dig, so what the colony does is choose where to live in it.

**Nests 1 (built): one ytong nest** (`src/sim/nest.ts`).

- **The block (N1, N3, N4).** New tanks start in a bought nest of
  aerated concrete (ytong) instead of the sand farm, which stays for tanks
  kept from before and for the experiments. It lies flat on the desk to
  the left of the arena, under a glass lid, and the page draws it at the
  arena's 40° (a parallel projection; "From above" shows it as a plan, as
  it does the arena). Sizes: small 10 x 10 cm, medium 20 x 15 cm (the
  default), large 30 x 20 cm; the block is 25 mm thick and its chambers
  5 mm deep. The same 1 mm `Farm` grid holds it, seen from above, so the
  fields (smells, warmth, humidity, mould) work as in the farm; `farm.nest`
  says what nest it is (null for the sand farm). Ytong is a new `Material`
  (4), a hard wall: `isSoil` is false for it, so nothing digs it.
- **Layouts (N5),** carved from the tank's seed (`Purpose.nest`): *rooms*
  (classic), rounded rectangles in a loose grid joined by 3.8 mm corridors;
  *organic*, uneven rounded chambers with bent 3.5 mm corridors; and
  *honeycomb*, hexagonal cells 21 mm across (17 mm in the small nest) with
  2.6 mm doors through the walls between them. The links are a random
  spanning tree over neighbouring chambers, so every chamber can be
  reached, plus some extra (30% of the other neighbours, 12% in the
  honeycomb) so there are loops. A 4 mm corridor joins the nearest
  chamber to the tube's port in the right end, a third of the way from the
  back; the left 30 mm are kept for the water hole. Nothing else comes
  within 3 mm of the block's edge.
- **Water (N6).** The water hole (radius 9 mm, 7 mm in the small
  nest) at the left end refills itself, so the ytong's water does not
  change: 60% of saturation at the hole's edge, falling by e every 45 mm
  (rough, so a medium nest is wet at the water end and dry at the far end,
  as keepers describe ytong nests). The air in a chamber takes the pore
  humidity of the ytong under it (as for soil, section 7.7: saturated until
  the ytong is nearly dry), mixed along the chambers over about 20 mm
  (rough), and the room's air (50%) comes in only through the tube, as far
  as the fresh air reaches (`fresh`: 1 at the tube's mouth, falling by 0.85
  per 2 mm along the corridors). A medium nest is damp (95% and up) over
  its first 12 cm, dries over the next 3 cm, and is at 40-60% beyond. The
  page darkens the ytong where it is wet and shows the hole's water.
- **Warmth (N10).** The heat mat lies under the block (left end, middle or
  right end): the floor over it is held at room temperature plus
  `nestMatShare` (0.7, rough) of the mat's excess, 29.7 °C in the keeper's
  22 °C room, and heat spreads and is lost as in the farm (section 7.6).
- **The ants in a flat nest.** Everything in sections 4 and 7 carries over,
  except what came from soil and gravity: there is no open surface (an ant
  is never "outside" in the nest), no pull down into the soil or up out of
  it, and no digging. An ant counts as half sheltered anywhere under the
  lid and fully against a wall (`enclosure`), so resting ants line the
  walls and corners. Ants going out follow the fresh air from the tube, as
  they do along tunnels, and the tube's draught near its mouth. A new
  colony is tipped into the chamber nearest the nest's middle.
- **Not yet:** modules, the test tube and moving house (Nests 3). Because
  a bought nest keeps its shape, it has no timelapse.
- Validation: section 9, test 15.

**Nests 2 (built): plaster, acrylic and wood; the cover and light**
(`NEST_MATERIALS` and `lightAt` in `src/sim/nest.ts`).

- **Materials (N2).** The same carvings come in four materials, each a new
  hard `Material` (plaster 5, acrylic 6, wood 7); "New tank" offers them
  with the sizes and layouts. They differ in four ways (rough values,
  chosen to match how keepers describe them):

  | | Water at the hole, reach | Vapour reach | Mat's warmth (share) | Mould spread, die-back |
  |---|---|---|---|---|
  | Ytong | 60%, 45 mm | 20 mm | 0.70 | 1, 1 |
  | Plaster | 70%, 60 mm | 20 mm | 0.80 | 1.3, 1 |
  | Acrylic | none; a wet sponge | 60 mm | 0.60 | 0.5, 1.5 |
  | Wood | 35%, 30 mm, uneven | 20 mm | 0.56 | 1.5, 0.5 |

  Plaster soaks water up a little farther than ytong, so more of the nest
  is damp. Acrylic holds no water: a sponge (10 mm across) in the chamber
  nearest the water end keeps the air on it saturated, and with no porous
  walls to take the vapour up it spreads farther along the chambers, so
  the air is humid round the sponge and the room's elsewhere. Wood holds a
  little, unevenly: its water varies by up to ±60% along the grain (smooth
  bands 30 mm long and 6 mm across, from the tank's seed). Warmth passes
  as the materials conduct when damp (plaster about 0.5 W/m·K, damp ytong
  0.3, acrylic 0.19, beech 0.16). Mould creeps readily through damp porous
  plaster, hardly over smooth acrylic, and feeds on damp wood itself, so
  it spreads farther and dies back more slowly there. A dry block is as
  dry as the room, no drier (this also lifts the far end of a large ytong
  nest from below the room's humidity to the room's).
- **The cover and light (N7).** Every bought nest has a cover, on when the
  tank starts. The keeper can lift it from the left or the right half, or
  take it off ("Cover" on the page; a keeper command, so it is saved and
  replayed). Under it the nest has 3% of the room's light (`COVER_LEAK`);
  where it is lifted, all of it, fading over 4 mm under the cover's edge.
  The page draws the cover as a tinted lid (a red film on acrylic, which
  ants barely see), so the keeper still sees in. The sand farm's nest is
  dark: it is dug into the soil.
- **The ants and light.** Nest workers shun light and carry brood out of
  it (keepers see it every time they lift a cover; Temnothorax colonies
  choose a dark nest over a light one, Franks et al. 2003). An ant in the
  light (above `lightSense`, 10% of the room's, fully at 20%): picks up
  brood there as readily as an item lying alone, however thick the pile
  (`lightPick`); counts it as a reason to move brood, as heat, dryness and
  mould are (section 7.7), so it carries it on rather than putting it
  down; and settles to rest a tenth as readily (`lightRest`). A brood
  carrier sees which way is darker, 6 mm ahead and to each side
  (`lightSight`), and turns that way, as it turns toward the right warmth
  and damp. Light outweighs damp: with the cover lifted from the wet end
  the brood goes to the dark, drier end (9.14).
- Validation: section 9, test 16.

**Keeping together (built, Nests 3a).** In the first bought nests a small
colony spread through a big nest (20 workers over 8-9 of 20 chambers,
9.13), because every chamber is shelter and the rest of the model drew
resting workers only to shelter, colony odour and brood. Lasius niger
workers also stop more readily, and stay stopped longer, beside nestmates
already resting (Depickère et al. 2004). So in a bought nest, a wandering
worker touching `n` resting nestmates settles 0.2 + 3n times as readily
as it would alone in the sand farm, and rests 1 + 5n times as long
(`restAlone`, `restJoin`, `restStay`, rough): on its own it seldom stops,
and walks on until it meets resting nestmates. Packed too tight (more than
5 touching, Nests 3 below) it does not settle; and wandering workers turn toward
colony odour as strongly as ants going home, not a quarter as strongly. A
colony now gathers in a few chambers and fills more as it grows (9.13).
(The first version, with lone workers settling as readily as in the sand
and joining 1 + 2n times as readily up to 4, kept 20 workers in 1-2
chambers only in the two tanks it was tried on; in six more it used 3-10.
Nests 3 checked eight tanks and strengthened it.) The sand farm keeps its old rules: its validations
(digging, nest size, food flow, 9.1-9.3) were tuned without these, and in a
dug nest the tunnels themselves keep the colony together.

**Nests 3 (built): the table, tubes and plugs, the test tube, moving house**
(`src/sim/table.ts`; `farm.table` replaces `farm.nest`).

- **The table (N8).** The bought nests lie on a table: the farm's 1 mm
  grid, seen from above, holds every module, with bare table
  (`Material.table`, 9) between them. Each module (a carved nest, or a test
  tube) has its corner and size on the table and its ports: a nest has two,
  in its right end a third and three quarters of the way from the back,
  each joined to the nearest chamber by a 4 mm corridor. "Add it to the
  table" puts a nest of any material, size and layout in front of the
  others (25 mm apart); the grid grows to the right and to the front and
  never moves what is on it, so a module keeps its cells, fields and ants.
  A module with no tube in it and nothing in it can be taken away.
- **Tubes and plugs.** The keeper joins two free ports with a tube ("Join
  ports"): a 6 mm channel of air through the table, 12 mm straight out of
  each port and then with one bend (whichever of the two ways keeps 4 mm
  clear of the other modules and tubes). A tube starts plugged: 8 mm of
  cotton (`Material.cotton`, 8) at its middle that ants cannot pass, so a
  new module can be joined before the colony is let in; "Plug" pulls it out
  or pushes it back. An empty tube can be taken away. The arena's tube is
  one of the keeper's tubes too ("Arena tube" moves it to another port):
  its mouth is where foragers come and go (`farm.tubeX`, `tubeY`) and the
  only place the room's air comes in, so fresh air (and the dry room air
  with it) reaches only the modules it can flow to along open tubes.
  Tubes are clear, so they are as light as the room; humidity spreads
  along them from module to module (vapour reach 20 mm) and so does warmth.
- **The test tube (N9).** New tanks start in a test tube: 15 cm of glass,
  14 mm across inside, with 40 mm of water behind a 12 mm wet cotton plug
  at the closed end and its mouth as its one port, joined to the arena. A
  queen, 20 workers and a little brood (8 eggs, 6 larvae, 4 pupae) start in
  it. Glass holds no water and takes up no vapour, so its air is saturated
  from the cotton nearly to the mouth (95% to 3 cm from it, 64% at it); it
  has a cover like the nests (keepers wrap test tubes in foil or card),
  passes warmth well and hardly grows mould. The keeper connects a nest
  when the colony needs one: add it, join a port to the tube's mouth and
  move the arena's tube to the nest's other port. "Start new tank in it"
  still starts straight in a bought nest.
- **Room to lie down.** Resting workers lie at most one loose layer deep
  and each needs about a body's width of floor: a worker counts as packed
  too tight with more than 5 resting nestmates touching (`restCrowd`) or
  more than one closer than 1.2 mm (`restSpace`, a Lasius niger worker's
  width). Packed too tight it does not settle, and if nestmates settle
  round it while it rests it gets up sooner, 1 + n² times as fast for n
  too many (the leaving rate of a crowded shelter rises with crowding, Amé
  et al. 2006; the values are rough). So the 16 mm test tube holds about
  480 resting workers, lined along the glass and between.
- **No room: looking further off.** A worker that has wandered among
  nestmates packed too tight to settle by for 30 s (`restlessAfter`)
  stops keeping to the colony odour and wanders off, remembering where the
  crowd was by its path integrator; it calms down again where there is
  room, at half the rate. When it settles at last, more than 25 mm from the
  crowd (`siteFar`), it remembers that spot as a new site; when it wakes it
  goes back to the crowd, and there it picks up brood it touches (as
  readily as an item lying alone) and carries it to its site by its path
  integrator, then goes back for more, until it settles down unhurried
  somewhere, which ends it. The brood a few workers bring draws the nurses
  and the queen after it (they settle by brood, section 4.4). This is how
  Temnothorax colonies move (workers who know the new site carry the
  brood, Pratt et al. 2002); Lasius niger keepers see their colonies move
  into a connected nest when the old one is crowded, but the details have
  not been measured as far as I know. A worker going out through the
  arena's tube forgets its site: its path integrator starts again.
- **Not yet:** connecting an old sand-farm tank to a bought nest, and
  moving a module once it is on the table.
- Validation: section 9, tests 17 and 18.

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

### 7.7 Water (M5b)

What M5b builds (`src/sim/water.ts`). It runs on the life clock (D6), like
brood development, because a farm dries over days, not minutes.

1. **Water seeps through the soil** from cell to cell down its water
   potential: wetter soil gives to drier, gravity pulls water down, and clay
   holds more than sand at the same potential. Left alone, soil settles back
   to the drained state it is poured in (section 3.2: wetter with depth,
   clay wetter than sand). Water seeps at 50 mm² per tank day, far slower
   than through real damp sand, to keep the update cheap (rough); dry soil
   passes it slower still (its pores have emptied), so a dry crust slows
   further drying, as in real soil.
2. **It evaporates where soil meets the air**, at up to a whole saturation
   per tank day from a wet face open to the headspace at 25 °C (rough: set so
   the top of an unwatered farm dries in a few days and the depths hardly
   change in a month), twice as fast every 12 °C warmer (the vapour
   pressure of water, Tetens 1930), and slower down the tunnels, in
   proportion to how much fresh air reaches the face (section 4.1). A face
   stops giving water once its pores' air dries. So the surface dries
   first, the soil over the heat mat faster, and the deep nest last.
3. **Dry soil is weak.** A ceiling that dries is checked again; dry sand
   spans only a quarter of what damp sand does (section 3.2), so the
   tunnels of an unwatered farm cave in.
4. **The air's humidity follows the soil**, on the 2 mm grid. The air in
   soil pores is saturated until the soil is nearly dry (below 5% of
   saturation, rough). The headspace under the lid is one body of air: it
   takes up water from the soil surface and loses it to the room (50%
   humidity) through the lid's vents, which sets it a quarter of the way
   from the surface's pores to the room (rough): 88% over a damp surface,
   less as the surface dries. Air in the tunnels has the humidity of the
   soil around it, mixed with the headspace's as far as fresh air reaches.
5. **The farm waters itself** on the page (`selfWatering`; Marco's choice,
   2026-10-13: "I don't like to have to water the formicarium. I think it's
   better if the humidity is always optimal"). A reservoir under the sand
   tops every soil cell back up to the drained state it was poured in, the
   profile a water table at the bottom of the farm holds (section 3.2:
   wetter with depth, clay wetter than sand). Water still seeps and
   evaporates, so wetter patches settle and the surface gives water to the
   headspace, but no cell dries below its drained state: the nest's air
   stays saturated, the headspace at 88%, brood and adults never dry out,
   and tunnels never cave in from drying. A tank saved before this is wetted
   back up when it is next opened. Without it (the experiments with water
   flow on), the keeper waters the farm: tap the farm and
   1 mL soaks into the soil below, deepest under the pour, wetting each cell
   it reaches up to 70% of saturation (field capacity, rough). One cell of
   a farm 5 mm thick with 40% pore space holds 2 µL.
6. **Brood dries out.** An egg, larva or pupa that has lain in air drier
   than 75% humidity for a tank day (net of time in damp air) dies (rough:
   keepers find brood shrivels within a day in a dry nest).
7. **Nurses carry brood to damp air.** As with warmth, a nurse feels the
   humidity at its antennae and body and notices differences of 2% (rough:
   insect hygroreceptors respond to changes of a few percent). Brood lying
   in air drier than 90% is picked up sooner where the nurse feels which way
   is damper, and carriers turn towards the damper side and hold on to
   their loads while they still feel damper air ahead (the same strengths
   as for warmth; the stronger of the two pulls counts).

With water flow off, the farm stays as poured and its air saturated: the
earlier milestones ran this way, the experiments still do unless they say
otherwise, and with it off the colony behaves exactly as before M5b
(checked bit for bit). The page turns it on, with the farm watering itself
(item 5).

### 7.8 Mould (M5b)

What grows mould, as Marco chose: uneaten prey and corpses (`src/sim/mould.ts`).

1. **Corpses left in the nest.** A dead worker that has lain in the farm
   for 2 tank days (rough) in damp air (90% or more) grows mould, which
   covers it in about two days (a logistic rise, twice as fast every 10 °C
   warmer: a Q10 of about 2, as for most fungi; rough). From the corpse it
   spreads through damp soil and air on the 2 mm grid (50 mm² a tank day),
   and away from anything to feed on it dies back (by half in about a tank
   day, ten times faster in dry air), so it reaches about a cm round the
   corpse. Once the corpse is carried off, the mould fades within days.
   Carrying the dead out before mould grows is what the midden of section
   7.4 is for: colonies kept from removing corpses fare worse (Myrmica
   rubra, Diez et al. 2014).
2. **Brood in mould dies.** An egg, larva or pupa lying where the mould is
   20% thick or more for a tank day (net of time out of it) dies (rough).
3. **Nurses carry brood out of mould.** A worker standing in mould (5% or
   more) treats brood there like brood that is too cold or too dry: it picks
   it up readily and holds on to it while it is still in mould.
4. **Prey in the arena.** An insect left for 2 tank days at 25 °C (rough:
   keepers take prey out after a day or two) goes mouldy, grey and furred,
   and ants no longer take it; the keeper should clear it away. Ants drink
   prey where it lies rather than carrying pieces home, so overfeeding
   wastes food but brings no mould into the nest.

Like water flow, mould is off in the experiments unless they say otherwise
(with it off nothing changes, checked bit for bit); the page turns it on.

### 7.9 Colony death and the keeper's tools (M5c)

How a colony dies (D10), each from what one ant feels where it is
(`endure` in `src/sim/corpses.ts`):

1. **Hunger.** A worker whose crop is empty and whose fat is spent
   starves, and dies after 2 tank days of it (rough); any food in its crop
   ends its hunger. Fat lasts 20 tank days from full in the nest and far
   less out foraging (section 7.5), so when food stops, the lean foragers
   die first and the fat nest workers last, as Dussutour et al. (2016)
   found in starved Lasius niger. The queen does not starve: founding
   queens live for months on their body reserves.
2. **Drying out.** An adult in air drier than 30% (rough) loses water, and
   dies after 2 tank days of it (rough); in damper air it drinks and
   recovers four times as fast. This needs the soil's water to move
   (section 7.7). The queen dries out like a worker.
3. **Heat.** An adult in air above 40 °C (rough: Lasius niger workers'
   critical thermal maximum is in the low 40s) dies within about an hour.
   The page's room and heat mat never get that hot; the rule is there for
   tanks that will.
4. **Mould** kills brood, not adults (section 7.8). The queen does not die
   of age (section 2).
5. A dying ant dies at a moment its mouth is free and it is out of the
   tube, as with old age; what it died of is kept with its corpse. The tank
   notes when its last ant and last brood have died: the colony has died
   out, and the tank stays on the page, with its dead, to look at.

All this is `mortal`, off in the experiments unless they say otherwise
(with it off nothing changes, checked bit for bit); the page turns it on.

6. **A lost forager gives up.** A worker heading out through the farm that
   has not reached the tube in 10 minutes (rough; the trip normally takes
   under one) turns back among its nestmates and stops trusting its path
   integrator to the tube; next time it finds the way by climbing, by the
   tube's draught and by the trail. This holds in every tank. It came from
   the first fed colonies with hunger on: an ant whose integrator had
   drifted over weeks in the nest could be drawn into a top corner of the
   headspace, far from the tube, and stay there until it starved (section
   9.11). It changes nothing in the first 30 minutes of a tank (checked bit
   for bit).
7. **An ant shut in by sand digs its way up.** An ant that has been in a
   closed pocket of air (under 20 mm², none of it leading on) for a minute
   takes the grain above it, pushes it down behind itself and climbs into
   the space, a grain at a time at the digging rate, until it is out. Ants
   buried by a cave-in or by spoil that slid onto them get out this way;
   before, they could stay shut in for days (section 9.11). A worker at the
   tip of a tunnel it is digging is not shut in, as its tunnel leads on.
   The minute matters: in an ordinary nest ants squeeze through closed
   pockets a few thousand times a day, nearly always for under a second,
   and an ant that dug up at once each time ate into the earlier results
   (busy foragers kept more fat, a fed colony sent out more foragers). Over
   two days, 60-ant colonies on three seeds had two or three spells of a
   minute or more each; this holds in every tank.

The keeper's tools (section 8) on the page after M5c: food (rich or weak
sugar, an insect), clear food, **clean the arena** (the dead lying there and
food gone mouldy are taken out; fresh food stays), the heat mat,
overlays for trails, warmth and **damp**, and **a new tank** (the next
seed). The Water tool was taken off the page on 2026-10-13, when the farm
began to water itself (section 7.7). The page shows the living workers, whether the queen lives, and the
dead so far by cause. Seeds are not offered: Lasius niger hardly eats them;
they come with a seed-harvesting species (M7).

### 7.10 Keeping the tank (M6a)

What M6a builds (`src/sim/keeper.ts`, `src/sim/save.ts`, `src/worker/store.ts`):

1. **One tank, kept.** The page keeps one tank, as on a shelf, in the
   browser's storage (IndexedDB). It is kept every 15 s while it runs and
   when the page is hidden or closed, so at most a few seconds are lost.
   Opening the page again opens the kept tank. Asking for another tank
   (`?seed=N`, or the New tank button) asks first, since the kept colony
   is lost.
2. **What a save holds:** the seed, the keeper's log (every tool used, with
   the step it was used at) and a snapshot of the world, which is plain
   data stored as it is. The seed and the log rebuild the tank exactly
   (`replayTank`); a test checks this, and that a tank loaded from a save
   goes on exactly as it would have without being saved.
3. **Saves outlive model changes.** State a save lacks (a model added
   since) starts as in a new tank, state the model no longer has is
   dropped, and the parameters are always the current model's: they are
   the model, not the tank. A change that cannot be carried over raises
   the save format; an old save is then set aside, not overwritten, and the
   page says so.
4. **Catching up (D7).** On reopening, the tank lives through the time it
   was closed, at 1× (an hour away is a tank day), up to 3 tank days. It
   runs as fast as it can, about a minute for 3 days with a young colony;
   the page shows the progress and can skip the rest. It lives through it
   even if it was paused, since a real tank does not pause.
5. **The report.** Then the page says what happened while it was closed:
   workers out of the cocoon, deaths by cause, the queen's death or the
   colony's, the brood then and now, brood lost to drying or mould, mould
   appearing or gone, food running out, nest dug and the soil drying.

### 7.11 The ant inspector (M6b)

What M6b builds (`src/sim/inspect.ts`): tap an ant, in the farm or the
arena, and a panel says who it is and what it is doing now ("carrying a
grain of clay out of the way", "feeding worker 12, mouth to mouth"), and the
view follows it until you drag. The panel shows what a keeper could learn
by watching it:

1. **How it is:** its age and whether it came out of its cocoon in this tank,
   how full its crop is and how much of that is insect juices, its fat body
   and so how readily it goes out to forage (its own threshold scaled by its
   fat, section 7.5), and whether it is starving, drying out or too hot. For
   the queen, the protein she holds for making eggs. For the dead, what
   killed them and when.
2. **Its life so far:** trips out to forage, grains of soil dug or cleared,
   food given to nestmates, insect juices fed to larvae, brood carried, and
   the dead carried out.
3. **Its time:** the share of its life spent resting, about the nest, out
   foraging (or on its way through the nest to the tube or back), digging,
   carrying brood, sharing food and carrying the dead.
   This is where division of labour shows in one ant: a lean forager is out
   much of its time, a fat nurse rests among the brood.

These are counters no rule reads; a test checks that the inspector only
reads the world, and the ants behave exactly as before.

### 7.12 Colony graphs and the timelapse (M6c)

What M6c builds (`src/sim/history.ts`, `src/ui/`):

1. **History in the world.** Every tenth of a tank day (6 minutes of ant
   time) the world takes a census: workers, the queen, brood by stage,
   deaths by cause, food in crops and arena, mean fat, the nest's area,
   mould, soil water, and how many workers are at each activity (the
   inspector's categories). Every 5 minutes of ant time it keeps a picture
   of the nest, one bit per cell. Both are saved with the tank and come out
   the same on every run. When either grows long (600 censuses, 240
   pictures) the interval doubles and the entries off it are dropped, so a
   tank of any age keeps a few hundred, evenly spaced; at most about 2 MB.
2. **Colony graphs:** the colony by stage (workers, eggs, larvae, pupae);
   how full the workers' crops are and their fat; what the workers are
   doing, as shares; and the nest dug out, in cm².
3. **Timelapse:** the pictures played in order, the soil coloured as it was
   when the tank was set up and the spoil the ants dumped as loose grains,
   with a slider to go through them by hand.

---

## 8. Your role

Tools on the left, overlays on the right. Every tool is an ordinary command
logged with its tick, which keeps saves deterministic and replayable.

- **Feed:** drop sugar drop, insect piece or seeds in the arena.
- **Water:** wet a region of soil (off the page since the farm waters itself, section 7.7; kept as a command for old saves and the experiments).
- **Heat mat:** drag along the bottom; ants move brood along the gradient.
- **Clean:** remove refuse and old food from the arena, and empty the feeding dishes.
- **Put in the arena:** a feeding dish, a sugar feeder, a stone, cork bark or a branch; move or take out anything standing there; refill the feeders (section 3.4).
- **Look:** pheromone overlay per field, temperature, humidity; click an ant to
  follow it; colony graphs (population by stage, crop fullness, task mix over
  time); timelapse of nest growth.

### 8.1 The room and the window

Asked by Marco on 2026-10-13: no black screen behind the formicarium but a
window showing the real time and weather of Legnano. Approved the same day
(choices V1 to V6; mockup at https://claude.ai/artifact/CzJXMFQ8LGotkGeSbMhrCi).
All of it is drawing: nothing here reaches the simulation.

- **V1 The room.** The tank stands on a wooden desk in front of a big window
  (`src/render/room/`). The farm's frame is clear glass. The air above the
  soil is see-through, so the window shows through the headspace, down into
  the gaps between spoil heaps as far as the ground nearby. Tunnel mouths and
  shafts into the ground narrower than 6 mm stay dark.
- **V2 The view.** West-north-west over Legnano: roofs and chimney pots, San
  Magno's bell tower and dome, an old mill chimney, and Monte Rosa on the
  horizon. Monte Rosa is 4634 m high and 90 km away, at azimuth ~295° and
  2.4° high; it is drawn 1.8 times taller so it clears the roofs. The view is
  stylised, not a photograph. The window spans azimuth 245° to 326°, so
  sunsets happen in it.
- **V3 Real time, real sky.** Legnano's clock is Europe/Rome, with summer time.
  Sun and moon positions and the moon's phase come from low-precision formulas
  (`src/room/sky.ts`; Meeus 1998, ch. 25 and 47), with the moon lowered by its
  parallax. Tests check them against almanac sunrise and sunset times, noon
  heights at the solstices and equinox, and the 2026 eclipses. The tank's own
  clock (D6) is untouched.
- **V4 Live weather.** Every 15 minutes the page asks Open-Meteo (free, no
  account) for Legnano's current conditions: WMO weather code, cloud cover,
  wind, visibility and temperature. `src/room/weather.ts` turns them into
  clouds and their drift, a grey deck, drizzle, rain, snow, fog, lightning,
  and whether the Alps show. A HUD line gives time, temperature and
  conditions. Offline, it keeps the last reading; before the first, the sky is
  clear.
- **V5 Looks only.** The weather and the clock never touch the simulation. The
  tank is indoors, and replay from seed plus keeper log stays exact (D10).
- **V6 Light.** Tints multiply the room and the tank by the daylight. Clouds
  make it greyer and sunset makes it warmer. When the room grows dark, a desk
  lamp lights the tank warmly, so the ants stay visible. Overlays (warmth,
  damp, trails' markers) are readings and are not dimmed.

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
11. **Brood hygrotaxis** (M5b; a qualitative check, as keepers describe it):
   in a humidity gradient, nurses carry the brood to damp air.
12. **Hygiene** (Diez et al. 2014): workers carry their dead out of the
   nest before mould grows on them; dead left in the nest grow mould that
   kills brood.
13. **Starvation** (Dussutour et al. 2016): when a colony's food stops, its
   lean foragers die before its fat nest workers; a fed colony loses none
   to hunger.
14. **Prey size and recruitment** (Detrain & Deneubourg 1997; Traniello
   1983): prey one worker can carry is taken home by its finder with little
   recruitment; prey none can carry draws trail laying and a crowd that cut
   it up where it lies.
15. **A bought nest** (Nests 1; checks 1 and 3 of the bought-nests plan):
   in a ytong nest wet at one end, nurses carry the brood into the damp
   chambers; and the floor a colony takes up grows in proportion to its
   workers, in a nest far bigger than it needs (Temnothorax colonies choose
   a nest whose area matches their size, Mallon & Franks 2000).
16. **Darkness** (Nests 2; check 2 of the bought-nests plan): with the
   cover lifted from half of a nest, most brood is under the cover within
   an hour (Temnothorax colonies offered a dark and a light cavity choose
   the dark one, Franks et al. 2003).

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

Re-run with M5c (10 colonies per condition): 62% fed at 30 minutes and 84%
at 60, 31% of workers went out, 154 departures; without sharing 29% fed at
60 minutes; well fed, 40 departures (a quarter of the starved colonies').
The no-sharing control was asked to feed under a third as many workers as
sharing, but over 10 colonies it was about a third both before M5c (31%
against 91%) and after (29% against 84%), so seeds 1-3 passed or failed it
by chance; since M5c the test asks for under 1/2.5.

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

**Re-run with M5c, seeds 1-6.** The rules M5c adds for every tank (lost
foragers give up, shut-in ants dig out) change no averages, but any change
to the rules sends each colony down a different path, and what happens
after the removal varies a lot from colony to colony. Over seeds 1-6 the
busiest fifth before the removal had 0.04-0.23 fat against 0.68-0.76 for the
rest. After it, the new busiest fifth had 0.25-0.69 of the others' fat
(mean 0.43; 0.12-0.47 without the dig-out rule, mean 0.38), and crops at
the end were 0.36-0.73 of what they were before (0.49-1.7 without it). Seed
1 drew the worst of both: its new busiest fifth kept 0.44 fat against 0.64,
and its crops fell to about a third. So since M5c the test asks the
before-removal contrast of each colony, and the two after-removal checks
(new busiest fifth under 0.6 of the others' fat, crops over 0.4 of before)
of the three colonies on average: 0.49 and 0.53.
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

### 9.9 Results so far (water, M5b)

**Brood hygrotaxis.** `npm run experiment -- damp [--no-hygro]`;
`tests/science/damp.test.ts` checks seeds 1-3. The closed chamber of
section 9.6, its air held at 60% humidity at one end and saturated at the
other, with 15 eggs, 15 larvae and 15 pupae strewn through it.

| | Mean humidity at the brood, start → 1 h → 2 h | In air of 85% or more, start → 1 h → 2 h |
|---|---|---|
| Seed 1 | 80% → 92% → 92% | 29% → 100% → 100% |
| Seed 2 | 79% → 96% → 96% | 38% → 100% → 100% |
| Seed 3 | 78% → 94% → 94% | 29% → 100% → 100% |
| Control: nurses ignore humidity | 78-80% → 75-84% → 82-86% | 29-38% → 13-33% → 29-46% |

With a coarser sense of humidity, first tried (differences of 5% rather
than 2%), one chamber in three kept a third of its brood in the dry: the
gradient here is gentle, and antennae 2 mm apart feel well under 1% across it.

**A colony that is watered, and one that is not.** Section 9.4's colonies
on the page's terms (room at 22 °C, mat under the middle), with the soil's
water moving, for 30 tank days; `npm run experiment -- growth --days 30
--room 22 --mat 110 --soil-water` (unwatered) or `--water 5` (the keeper
pours 1 mL at each of three spots every 5 days).

| | Brood dead of drying out by day 30 | Eggs + larvae on day 30 | Soil water on day 30 |
|---|---|---|---|
| Unwatered, seeds 1-3 | 23, 79, 73 | 13, 25, 23 | 35-38% |
| Watered every 5 days, seeds 1-3 | 0, 25, 23 | 83, 45, 104 | 42-43% |

An unwatered farm loses only a few percent of its water in a month, but
it loses it from the surface, where this colony keeps its brood: its nest
at 22 °C is a shallow pit open to the headspace (section 9.8), so the brood
lies in the headspace's air, which dries with the surface. Eggs are what
die, mostly in piles round the queen. Watering keeps the surface damp, and
the colonies raise three to eight times as much brood. A first version gave
air with no soil near it the room's humidity; then even watered colonies
lost their egg piles in the open pit, until the headspace was made one
body of air between the surface's and the room's (section 7.7).

### 9.10 Results so far (hygiene, M5b; 3 colonies of 60 workers)

`npm run experiment -- hygiene [--no-removal]`; `tests/science/hygiene.test.ts`
checks seeds 1-3 with removal and seeds 1-2 for the control. Each colony
settles in the farm for 2 hours; the keeper puts 30 brood items where most
workers rest, and the 5 workers resting nearest them die there. Sugar water
every day, temperature 25 °C, air saturated, mould on.

| | Corpses left in the farm, day 1 → 6 | Mould (20% or thicker), day 3 → 6 | Brood killed by mould by day 6 |
|---|---|---|---|
| Workers carry their dead out | 0, 0 and 3 → 0, 0 and 1 | 0, 0, 0.1 cm² → 0, 0, 1.2 cm² | 0, 0, 0 of 30 |
| Dead left in place (no removal) | all 5-6 | 0.2-0.7 → 7-10 cm² | 0, 11, 0 |
| No removal, and nurses blind to mould | all 5-6 | 0.2-0.7 → 7-10 cm² | 19, 23, 22 |

The workers carry their dead out within a day (section 9.7), before mould
can start, and the nest stays clean. Where one or two corpses stay in the
farm (seed 3), a small patch of mould grows round them, away from the
brood. Left in the brood pile, the dead grow mould that spreads over
several cm², yet the nurses, carrying brood out of mould, save nearly all
of it in two colonies of three; blind to mould, they lose two thirds of it.

### 9.11 Results so far (starvation and colony death, M5c; colonies of 60 workers)

`npm run experiment -- starvation [--fed]`; `tests/science/starvation.test.ts`
checks seeds 1-2 (fed 3 days, then starved 6) and a fed control. A queen
and her workers in the farm at 25 °C are given sugar water and an insect
every tank day for 4 days, then the food stops. Foragers are the fifth of
workers that went out most while food came; nest workers, those that never
went out.

| | Fat when the food stops, foragers / nest workers | Median survival, foragers / nest workers | Last worker dead |
|---|---|---|---|
| Seed 1 | 0.07 / 0.77 | 4.4 / 14.7 days | day 19 |
| Seed 2 | 0.15 / 0.81 | 4.8 / 14.6 days | day 19 |
| Seed 3 | 0.04 / 0.75 | 4.4 / 13.3 days | day 20 |
| Fed on (control, seed 1) | 0.07 / 0.77 | all alive at day 27 | one starved on day 28 |

As in Dussutour et al. (2016), the lean foragers die first and the fat nest
workers last. How long it takes is rough: the fat and hunger parameters are
not taken from a paper, and the whole colony starves within three weeks
(19 to 20 days). The queen lives on. (Re-run with the final rules of
section 7.9; the first runs, before shut-in ants dug out, gave the same
picture: 4.5-4.7 days against 13.6-15.7.)

**A fed colony on the page's terms** (room at 22 °C, mat under the middle,
the soil's water moving; seed 1, 26 tank days). With hunger first switched
on, a colony fed every day lost 2 workers to hunger even when watered, both
pressed into the top of the headspace far from the tube by a path
integrator that had drifted (section 7.9, item 6). With lost foragers
giving up, the watered colony lost none. Left unwatered, it lost 4 of 59,
from day 20 on: workers that kept digging in one spot for days until they
starved. The two looked at closely were shut in small pockets in loose
sand, which builds up where dry sand falls. Once shut-in ants dig their way
up (section 7.9, item 7), unwatered colonies lost none to hunger in 26
days (seeds 1 and 2).

### 9.12 Results so far (prey size and recruitment, Arena 3)

`npm run experiment -- prey`; `tests/science/prey.test.ts` checks seeds
1-3. A lab colony of 40 workers behind the entrance of the keeper's bare
40 x 30 cm arena, all out for protein (Detrain & Deneubourg starved their
colonies 3 days first), and one dead insect 10 cm from the entrance; a fruit
fly for 30 minutes, a cricket for 3 hours.

| Seed | Fly: found | Fly: workers that came / trail | Cricket: most at it at once / workers that came | Cricket: most trail | Cricket: drunk dry |
|---|---|---|---|---|---|
| 1 | 1.2 min | 1 / none | 36 / 37 | 8805 | 35 min |
| 2 | 4.4 min | 1 / none | 34 / 37 | 11361 | 40 min |
| 3 | 5.7 min | 1 / none | 33 / 37 | 10680 | 41 min |
| 4 | 1.7 min | 1 / none | 35 / 37 | 9108 | 37 min |
| 5 | 3.3 min | 1 / none | 33 / 37 | 10972 | 39 min |

As in Detrain & Deneubourg (1997), the prey a worker can carry goes home
with its finder and no recruitment, while the prey nobody can carry draws a
trail and most of the colony, which cut off its six legs and carry them
home and drink the rest where it lies, leaving the head, thorax and abdomen
as husks. They saw the same contrast (5.8 against 12.4 workers arriving per
3 minutes, a plateau of about 250 at a cockroach in a colony of 2000-3000);
here nearly the whole of a small, hungry colony comes. In the keeper's tank
a colony comes to insects only as its brood is hungry: with 12 larvae it
carried a fly into the farm within 2 tank hours, drank it by the brood and
carried its husk out to the arena, and took the cricket's legs one by one
over the day.

### 9.13 Results so far (a bought nest, Nests 1; re-run with Nests 3a)

**Brood in a ytong nest.** `npm run experiment -- nest-damp`;
`tests/science/nestDamp.test.ts` checks seeds 1-3 over 2 hours. A medium
classic ytong nest (65% of its floor in air at least 85% humid, the rest
drier toward the tube), 60 workers and 45 eggs, larvae and pupae strewn
through all its chambers; the brood neither develops nor dries out, so
where it lies is all that is measured. Share of the brood in air at least
85% humid, at the start and after each hour:

| Seed | Nurses as modelled | Nurses ignoring humidity (control) |
|---|---|---|
| 1 | 62% → 100% → 96% → 100% | 62% → 67% → 73% → 47% |
| 2 | 73% → 93% → 98% → 100% | 73% → 40% → 47% → 82% |
| 3 | 62% → 98% → 100% → 100% | 62% → 33% → 60% → 78% |

Within an hour nearly all the brood is in the damp chambers, mean humidity
at the brood 97-100%, as keepers see brood kept on the wet side of a ytong
nest. Without hygrotaxis the colony still gathers its brood in one place,
but that place is wherever the piles happen to grow, damp or not.

**Room to grow.** `npm run experiment -- nest-room`;
`tests/science/nestRoom.test.ts` checks seeds 1-2 at 20 and 160 workers,
and the control. Workers and a queen strewn through a large classic nest
(20 chambers), after 3 hours. Floor under the colony = floor within
1.5 mm of a resting worker (about its body and legs):

| Workers | Floor under the colony (resting), seeds 1, 2 | mm² per resting worker | Chambers holding 90% of them |
|---|---|---|---|
| 20 | 80 (19), 56 (17) | 3.3-4.2 | 2, 2 |
| 40 | 165 (39), 102 (35) | 2.9-4.2 | 4, 2 |
| 80 | 320 (75), 277 (66) | 4.2-4.3 | 6, 7 |
| 160 | 501 (145), 713 (146) | 3.5-4.9 | 7, 11 |
| 20, not settling beside nestmates (control) | 92 (14), 99 (15) | 6.6 | 8, 9 |

The colony keeps together and fills more of the nest as it grows: the
floor under it grows in proportion to its workers (3-5 mm² each, ants
lying close, a few deep in places), as nests (dug, 9.2, or chosen, Mallon
& Franks 2000) match the colony; 20 workers keep to 1-2 chambers of 20.
Before Nests 3a (the control row) a small colony spread through 8-9
chambers, lying apart. How deep Lasius niger workers pile up in a resting
cluster has not been measured as far as I know; `restCrowd` is the
model's guess.

### 9.14 Results so far (darkness, Nests 2)

`npm run experiment -- nest-dark`; `tests/science/nestDark.test.ts` checks
seeds 1-3 over 1 hour (the control over 5 tanks). A medium classic nest with its cover lifted from the
left half (the water end), 60 workers and 45 eggs, larvae and pupae strewn
through all its chambers (more of the floor is in the right half, so more
than half starts under the cover). Share of the brood under the cover, at
the start and after each hour:

| Seed | Soaked ytong, as modelled | Soaked, ants ignoring light (control) | Ytong wet at the lit end | Acrylic, sponge at the lit end |
|---|---|---|---|---|
| 1 | 64% → 98% → 100% | 64% → 56% → 64% | 64% → 98% → 100% | 64% → 87% → 82% |
| 2 | 58% → 100% → 100% | 58% → 82% → 69% | 58% → 96% → 100% | 58% → 91% → 91% |
| 3 | 71% → 100% → 98% | 71% → 71% → 64% | 71% → 98% → 100% | 71% → 98% → 100% |
| 4 | | 73% → 29% → 33% | | |
| 5 | | 64% → 62% → 67% | | |

(Re-run with Nests 3a.) Within an hour nearly all the brood is in the
dark, and 98-100% of the resting workers with it; without the dislike of
light the colony gathers on one side or the other (29-82% under the cover
after an hour, 5 tanks). When the lit end is also the damp end, light wins:
the brood goes to the dark, drier half, which in ytong is still damp near
the cover's edge, and in acrylic is at the room's humidity. Keepers report
that a colony moves its brood away from a lifted cover within minutes; how
it weighs light against damp has not, as far as I know, been measured in
Lasius niger, so that balance is the model's guess.

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
| M5 | Tending: temperature, humidity, mould, feeding tools, colony death. In parts: M5a warmth (heat mat, temperature field, brood thermotaxis); M5b water (soil water, humidity, watering, brood drying out and hygrotaxis) and mould (prey and corpses); M5c colony death (hunger, drying out, heat) and the keeper's tools (clean the arena, damp overlay, new tank) |
| M6 | Keeping it: saves, offline catch-up, ant inspector, graphs, timelapse. In parts: M6a saves and catching up while closed, with a report of what happened; M6b the ant inspector; M6c colony graphs and timelapse |
| M7 | Optional extras: second colony and war, other species, nuptial flights |
| L | Looks (asked by Marco 2026-10-13, section 8.1): L1 the room and the window onto Legnano with its real sky and weather; L2 a bigger arena seen at an angle, with decorations |
| A | The arena (asked by Marco 2026-10-13, section 3.4): Arena 1 climbing; Arena 2 dishes, feeders and placing objects; Arena 3 feeder insects |
| N | Bought nests (asked by Marco 2026-10-13, section 3.5): Nests 1 one ytong nest, in three sizes and three layouts; Nests 2 plaster, acrylic and wood, covers and light; Nests 3a keeping together (settling beside resting nestmates); Nests 3 modules, tubes and cotton plugs, the test-tube start and moving house |

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
- Diez, Lejeune & Detrain 2014. Keep the nest clean: survival advantages of corpse removal in ants. Biol. Lett. 10, 20140306.
- Dussutour, Poissonnier, Buhl & Simpson 2016. Resistance to nutritional stress in ants: when being fat is advantageous. J. Exp. Biol. 219, 824-833.
- Dussutour & Simpson 2009. Communal nutrition in ants. Curr. Biol.
- Dussutour & Simpson 2012. Ant workers die young and colonies collapse when fed a high-protein diet. Proc. R. Soc. B.
- Franks & Sendova-Franks 1992. Brood sorting by ants. Behav. Ecol. Sociobiol.
- Franks, Mallon, Bray, Hamilton & Mischler 2003. Strategies for choosing between alternatives with different attributes: exemplified by house-hunting ants. Anim. Behav. 65, 215-223.
- Goss, Aron, Deneubourg & Pasteels 1989. Self-organized shortcuts in the Argentine ant. Naturwissenschaften.
- Greenwald, Eckmann & Feinerman 2018. Individual crop loads provide local control for collective food intake in ant colonies. eLife.
- Hurlbert, Ballantyne & Powell 2008. Shaking a leg and hot to trot: the effects of body size and temperature on running speed in ants. Ecol. Entomol.
- Khuong et al. 2016. Stigmergic construction and topochemical information shape ant nest architecture. PNAS.
- Mailleux, Deneubourg & Detrain 2000. How do ants assess food volume? Anim. Behav.
- Mailleux, Detrain & Deneubourg 2006. Starvation drives a threshold triggering communication. J. Exp. Biol.
- Meeus 1998. Astronomical Algorithms, 2nd ed. Willmann-Bell (ch. 25 the sun, ch. 47 the moon; low-precision forms).
- Mallon & Franks 2000. Ants estimate area using Buffon's needle. Proc. R. Soc. B 267, 765-770.
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
