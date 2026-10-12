# formicarium: conventions for Claude Code

A living ant farm in the browser: a side-view sand formicarium joined by a tube to a top-view
arena, with a Lasius niger colony whose behaviour emerges only from each ant's local rules.
**DESIGN.md is the approved design**; read the relevant section before changing a model, and
update DESIGN.md in the same pull request when a model changes.

## Commands

- `npm run dev`: run in the browser (`?seed=N` picks the tank)
- `npm test`: Vitest
- `npm run typecheck`, `npm run lint`: must pass before every push
- `npm run sim -- --seed 42 --seconds 600`: headless run in Node, prints a summary and state hash
- `npm run experiment -- bridge|symmetric|choice|equal-choice|decay [--no-trail]`: validation experiments over 10 seeds
- `npm run experiment -- nest --ants 40 --hours 8 --runs 3 [--no-crowd]`: nest size over time (slow: minutes per run)
- `npm run experiment -- spread [--no-sharing] [--satiated]`: food spreading through a starved colony (M3); any experiment takes `--param name=value`
- `npm run experiment -- growth --runs 2 --days 60 [--no-protein]`: a queen's colony fed daily, brood and workers by day (slow: about 20 min per run)
- `npm run experiment -- division --runs 3 [--no-fat]`: foragers' fat, then the busiest fifth taken out (M4a; a few minutes per run)
- `npm run experiment -- sorting --runs 3 [--mixed]`: scattered brood sorted by stage over 3 hours (M4b; about a minute per run)
- `npm run farm -- --seed 1 --ants 60 --hours 3`: a farm colony headless, with a text picture of the nest
- `npm run build`: production build (deployed to GitHub Pages from `main`)

## Layout

- `src/sim/`: the simulation (world, soil, ants, pheromones), seeded RNG, state hash. Pure and deterministic.
- `src/worker/`: runs the simulation in a Web Worker and posts snapshots.
- `src/render/`: PixiJS drawing. Reads snapshots only; never changes simulation state.
- `src/main.ts`, `index.html`: the page.
- `tools/`: Node runners. `tests/`: Vitest; validation experiments (DESIGN.md section 9) go in `tests/science/`.

## Rules

1. **Deterministic.** Same seed and same player commands give the same state hash.
   - Randomness only from `Rng` (`src/sim/rng.ts`), seeded from a tuple such as `(seed, Purpose.x)`.
   - No real time in `src/sim/`: no `Date`, `performance.now`, timers. Time is counted in steps (20 per ant second).
   - Iterate in data order or sorted by id; never key a `Map`/`Set` by object identity.
   - Lint enforces this for `src/sim/`.
2. **No browser code in `src/sim/`.** It runs in the worker, in Node and in tests.
3. **World state is plain data**: numbers, strings, arrays, plain objects, `Map`s, typed arrays.
   It must save, hash (`hashState`) and copy.
4. **Only local rules for ants** (DESIGN.md section 0). An ant reads only what it could sense at
   its own position: smells at its antennae, touch, temperature, its own path integrator. No
   global pathfinding or colony-level planners.
5. **Units:** 1 cell = 1 mm; time in steps. Cite the paper in a comment where a constant comes from one.
6. **Science first.** Every rule gets a test. A feature is done when its validation experiment
   (DESIGN.md section 9) passes. If one cannot pass with plausible parameters, stop and report.
7. **Saved enums are append-only** (`Material` and later ones): never reorder or reuse a value.
8. **One milestone per pull request** (or a few small ones). Marco merges.
