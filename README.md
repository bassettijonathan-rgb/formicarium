# Formicarium

A living ant farm in the browser. A Lasius niger colony digs, forages and raises brood in a
side-view sand farm joined by a tube to a foraging arena. Nothing about the nest is scripted:
tunnels, trails and division of labour emerge from each ant's own simple rules.

Play: https://bassettijonathan-rgb.github.io/formicarium/ (your tank is kept in the browser and lives on while the page is closed; `?seed=N` picks another tank)

See [DESIGN.md](DESIGN.md) for the model and the milestone plan.

```sh
npm install
npm run dev        # in the browser
npm test           # tests
npm run sim -- --seed 42 --seconds 60   # headless run
```
