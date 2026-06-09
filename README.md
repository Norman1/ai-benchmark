# War.app AI Benchmark

A local testbench for black-box AI bots playing a War.app / Warzone-style 1v1 Medium Earth Traditional match.

## Run

```powershell
npm start
```

Open `http://localhost:4173`.

## CLI

```powershell
npm run match -- --botA starter-greedy --botB starter-random --seed 42 --timeLimitMs 5000
npm run tournament -- --gamesPerPair 10 --timeLimitMs 5000
npm run snapshot -- starter-greedy baseline
npm run selfplay -- starter-greedy latest 100
npm test
```

## Building Bots

Read `BOT_API.md` before implementing a bot. It documents the stdin/stdout protocol, simultaneous pick submission, cycle allocation, normal-fog observations, legal orders, timing limits, and starter bot examples.

For local source separation, each match runs every bot from its own random temporary copy of that bot's folder. This prevents ordinary sibling-folder reads between bots, but it is not a hardened sandbox for hostile code.

## Bot Iteration

The intended private-benchmark workflow is git based:

1. Let one agent improve a bot on its own feature branch.
2. Let another agent improve another bot on a different feature branch.
3. When you want to evaluate them, bring both bot folders into one benchmark checkout and run matches or tournaments.

This prevents accidental source peeking during ordinary development. A bot author could still actively inspect other branches or git history if they tried; that is outside the threat model for this project.

For self-play, freeze a previous bot version as a local snapshot:

```powershell
npm run snapshot -- my-bot baseline
npm run selfplay -- my-bot latest 100
```

Snapshots are copied to `bot-snapshots/<bot-id>/<snapshot-id>/`. Self-play run reports are written to `runs/selfplay/<bot-id>/` unless `--writeRun false` is passed. Both directories are local generated artifacts and ignored by git by default.

Useful self-play variants:

```powershell
npm run snapshots -- my-bot
npm run selfplay -- my-bot all 20
node src/cli.js selfplay --bot my-bot --against 0001-baseline --games 50 --writeReplay true
```

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
- 5 second bot request timeout by default, configurable per match
- one army must stand guard
- multi-attack off
- cycle move order
- 0% luck, straight round, 60% offensive kill rate, 70% defensive kill rate
- winner is decided by elimination only; reaching the max turn safety limit is a draw

The fixed map topology is maintained in `src/engine/medium-earth-topology.js`. It contains territory IDs, bonus membership, bonus values, adjacency lists, and explicit overseas route edges. Engine behavior is in `src/engine/game.js`; bot process isolation is in `src/runner`.

The spectator board renders SVG territory paths from `public/assets/medium-earth-geometry.json`. That file is rendering geometry only. The engine never derives rules, bonuses, or connections from the SVG paths.
