# CLAUDE.md

Local benchmark harness where black-box AI bot processes play a Warzone-style 1v1 game on a fixed Medium Earth map. Dependency-free Node.js ESM. `README.md` covers rules and workflow; `BOT_API.md` covers the bot stdio protocol — read both before touching bots or the engine.

## Commands

- `npm start` — spectator server at http://localhost:4173 (page load auto-runs a match and writes a replay)
- `npm run match -- --botA <id> --botB <id> --seed 42 --timeLimitMs 5000`
- `npm run tournament -- --gamesPerPair 10`
- `npm run promote -- <bot-id>` then `npm run selfplay -- <bot-id> baseline 100`
- `npm test` — all tests; single file: `node --test test/engine.test.js`

CLI boolean flags accept `--flag`, `--flag true`, or `--flag false`. Replay writing defaults on for single `match`, off for tournament/selfplay; run reports (`--writeRun`) default on.

## Architecture

Dependency direction: `src/cli.js` / `src/server.js` → `src/runner/` → `src/engine/`. The spectator SPA (`public/app.js`) talks only to the HTTP API and renders the replay object returned by `POST /api/match`.

- `src/engine/` — pure, deterministic game logic: no I/O, no child processes, no RNG during turns (0% luck). Keep it pure; all mutation flows through `WarGame.runTurn()`, and the replay (full state snapshot per event) is the single source of truth for the UI.
  - `game.js` — draft creation, snake-draft pick allocation (`A B B A A B`), fog observations, cyclic move order, combat, replay frames
  - `medium-earth-topology.js` — hand-maintained map data (131 territories, 27 bonuses). Edits must keep `assertMapIntegrity()` (`map.js`) and the pinned regression sets in `test/map.test.js` passing
  - `rules.js` — all tunables in frozen `RULES`, plus `straightRound()`
  - `random.js` — `SeededRandom` LCG; `normalizeSeed()` maps any seed (incl. strings) to a non-zero uint32
- `src/runner/` — orchestration: `match.js` (match/tournament conductor, replay writing), `bot-process.js` (JSON-lines stdio, per-request timeout, 1 MiB line cap), `bot-isolation.js` (each bot runs from a random temp-dir copy of its folder), `baselines.js` + `self-play.js` (promote/selfplay with automatic side-swapping)
- `src/server.js` — zero-dep HTTP server: `GET /api/bots`, `GET /api/map`, `POST /api/match`, `POST /api/tournament`
- `public/assets/medium-earth-geometry.json` — SVG rendering geometry only; the engine never derives rules, bonuses, or connections from it
- `bots/<id>/` (manifest `bot.json` + sources) are bot packages; `bot-baselines/`, `runs/`, `replays/` are git-ignored generated artifacts

## Determinism

One match seed drives everything (draft RNG, pick-fallback RNG, per-game selfplay/tournament seeds). Bots receive derived seeds (`normalizeSeed("<seed>:bot:<playerId>:...")`), never the engine seed. Same seed + same bots reproduces a match exactly.

## Engine behavior worth knowing

- Failed attacks retreat surviving attackers to the source, but those armies stay committed and cannot move again that turn (`game.js` `#executeAttackTransfer`).
- Two turn limits: the engine draws at `RULES.maxTurns` (120); the runner's `--maxTurns` only stops the request loop earlier. Values above 120 have no effect.
- Underspent income is force-deployed onto the first owned territory; overspend is truncated in submitted order. Invalid orders are skipped, not fatal — but a timeout, malformed JSON line, or process exit loses the game (`bot_failure`).
- Turn-1 first mover is the player who picked second; move order alternates by turn and within a turn by round, and is deliberately hidden from observations.
- Fresh deploys can attack the same turn; captured territories and received transfers cannot move again (multi-attack off).

## Workflow conventions

Bots are developed on separate git branches and only brought into one checkout for evaluation (README "Bot Iteration"); `main` ships only `bots/starter-greedy`. On a fresh clone, run `npm run promote -- <bot>` before `selfplay` — baselines live in the git-ignored `bot-baselines/<id>/baseline/` slot and are overwritten by each promote.
