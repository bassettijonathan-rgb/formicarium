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
| Crop (social stomach) | ~0.2 mg sugar water | |
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

Falling-sand style cellular automaton, but slow and cohesive: a loose grain
with no support falls; a packed grain only falls if its cohesion (from
material and moisture) is beaten by the unsupported span above it. Damp clay
holds a wide ceiling, dry sand caves in. Ants pack the walls they walk on, so
used tunnels get sturdier. This is why ant-farm keepers pick damp sand-loam
mixes, and the sim should show it.

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

### 4.2 Internal state

- Age, caste (worker, queen, male later), body reserves, crop contents.
- **Path integrator:** a vector updated each step, with noise that grows with
  distance walked (Müller & Wehner 1988), so long excursions return less
  precisely and ants use trail and nest odour for the last stretch.
- **Task thresholds** (D5), one per task.
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

Rules per ant (after Buhl et al. 2004 and Khuong et al. 2016):

1. A digging ant picks up a grain with a probability that rises with
   building pheromone and with the number of ants nearby digging (density
   amplifies digging), and falls with depth and packing.
2. It carries the grain up (anti-gravity) and drops it with a probability that
   rises where pellets already lie, which lays building pheromone there.
3. Total digging slows as the nest's volume per ant grows (Rasse & Deneubourg
   2001): bigger colony, bigger nest, with no target size coded.

Expected emergent result: branching tunnels, chambers where digging clusters,
spoil heaps at the surface, and nest volume growing with colony size. None
of these shapes are coded.

---

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

Foragers fill their crops and share by trophallaxis. Food spreads through the
colony as a contact network, not a global stockpile. Colony hunger is the sum
of individual crops, and it drives foraging thresholds: a hungry colony sends
more foragers. Protein goes mostly to larvae and the queen; sugar fuels
workers.

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
| M3 | Colony life: queen, brood, development, trophallaxis, founding |
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
- Buhl et al. 2004. Self-organized digging activity in ant colonies. Behav. Ecol. Sociobiol.
- Charbonneau & Dornhaus 2015. When doing nothing is something. J. Bioecon.
- Franks & Sendova-Franks 1992. Brood sorting by ants. Behav. Ecol. Sociobiol.
- Goss, Aron, Deneubourg & Pasteels 1989. Self-organized shortcuts in the Argentine ant. Naturwissenschaften.
- Hurlbert, Ballantyne & Powell 2008. Shaking a leg and hot to trot: the effects of body size and temperature on running speed in ants. Ecol. Entomol.
- Khuong et al. 2016. Stigmergic construction and topochemical information shape ant nest architecture. PNAS.
- Müller & Wehner 1988. Path integration in desert ants. PNAS.
- Rasse & Deneubourg 2001. Dynamics of nest excavation and nest size regulation of *Lasius niger*. J. Insect Behav.
- Theraulaz et al. 2002. Spatial patterns in ant colonies. PNAS.
- Wilson, Durlach & Roth 1958. Chemical releasers of necrophoric behavior in ants. Psyche.

Parameter values marked "rough" will be checked against these papers when
each milestone is built.
