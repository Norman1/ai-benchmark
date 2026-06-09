# War.app AI Benchmark

A local testbench for black-box AI bots playing a War.app / Warzone-style 1v1 Medium Earth Traditional match.

## Run

```powershell
npm start
```

Open `http://localhost:4173`.

## CLI

```powershell
npm run match -- --botA starter-greedy --botB starter-random --seed 42
npm run tournament -- --gamesPerPair 4
npm test
```

## Building Bots

Read `BOT_API.md` before implementing a bot. It documents the stdin/stdout protocol, simultaneous pick submission, cycle allocation, normal-fog observations, legal orders, timing limits, and starter bot examples.

## Current Rules

- 1v1 only
- Medium Earth Traditional-style fixed map
- Manual random warlords distribution: 1 distribution territory per non-zero bonus
- 3 starting territories per player, 6 ordered picks
- 7 wastelands of 10 armies, placed after warlords
- neutral non-distribution territories start with 2
- unpicked distribution territories start with 4
- player starts begin with 4
- base income 5 plus completed bonus income
- no cards
- normal fog observations for bots
- one army must stand guard
- multi-attack off
- cycle move order
- 0% luck, straight round, 60% offensive kill rate, 70% defensive kill rate

The fixed map topology is maintained in `src/engine/medium-earth-topology.js`. It contains territory IDs, bonus membership, bonus values, adjacency lists, and explicit overseas route edges. Engine behavior is in `src/engine/game.js`; bot process isolation is in `src/runner`.

The spectator board renders SVG territory paths from `public/assets/medium-earth-geometry.json`. That file is rendering geometry only. The engine never derives rules, bonuses, or connections from the SVG paths.
