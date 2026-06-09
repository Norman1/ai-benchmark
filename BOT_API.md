# Bot Author Guide

Bots are black-box processes. The engine launches each bot from its own `bot.json` manifest and sends one JSON object per line on stdin. The bot must write exactly one JSON reply per request on stdout. Use stderr for logs.

Each bot should live in its own folder. During benchmark evaluation, only that bot folder and its runnable dependencies should be mounted or copied into the benchmark, so competing agents do not see each other's source.

## Manifest

Create a folder under `bots/` with a `bot.json` file:

```json
{
  "id": "my-bot",
  "name": "My Bot",
  "description": "Short description shown in the UI.",
  "command": "node",
  "args": ["bot.js"]
}
```

`command` and `args` run with the bot folder as the working directory. Any language is fine as long as the process can read stdin and write JSON lines to stdout.

## Runtime Contract

- Reply before `botTimeLimitMs` expires. Current default: `5000ms`.
- Maximum stdout line length is `1MB`.
- A malformed JSON reply, timeout, or process exit can lose the game.
- Invalid game orders are ignored by the engine.
- Undeployed income is automatically placed on the first owned territory as a fallback, but strong bots should deploy deliberately.
- Bots never receive the opponent's private code or direct internal state.

## Picking Phase

Both bots receive a `pick` message and submit their full preference list at the same time. They do not know the opponent's picks.

Reply with up to `requiredPicks` territory IDs in preference order:

```json
{ "picks": ["t144", "t12", "t64", "t106", "t145", "t1"] }
```

Important distribution rules:

- Random Warlords: one distribution territory exists per non-zero bonus.
- Wastelands are already applied before picking; wastelanded distribution territories are removed from `availablePicks`.
- Both bots may rank the same territory.
- After both lists are committed, the engine allocates starts by cycle order.
- The first allocator is random for the distribution.
- Allocation alternates in reversed rounds: if player A gets the first allocation, the six allocation slots are `A, B, B, A, A, B`.
- On each allocation slot, the player receives their highest-ranked still-available territory.
- If a bot submits too few valid picks, the engine fills from remaining available picks.

Pick request shape:

```json
{
  "type": "pick",
  "protocolVersion": 1,
  "playerId": 0,
  "seed": 42,
  "rules": {},
  "map": {
    "id": "medium-earth-traditional",
    "bonuses": [],
    "territories": []
  },
  "distribution": ["t144", "t12"],
  "availablePicks": ["t144", "t12"],
  "wastelands": ["t128"],
  "requiredPicks": 6
}
```

Use `map.bonuses`, `map.territories`, and each territory's `neighbors` to evaluate start quality. Territory IDs are stable; names are for display.

## Turn Phase

Each turn, the bot receives a normal-fog observation. It sees owned territories and adjacent territories. Other territory owners and armies are hidden.

Recommended reply shape:

```json
{
  "orders": {
    "deployments": [
      { "territoryId": "t144", "armies": 5 }
    ],
    "orders": [
      { "from": "t144", "to": "t113", "armies": 3, "mode": "attackTransfer" }
    ]
  }
}
```

The runner also accepts the inner object directly, but the wrapped `{ "orders": ... }` form is clearer.

Turn request shape:

```json
{
  "type": "turn",
  "protocolVersion": 1,
  "playerId": 0,
  "seed": 42,
  "turn": 1,
  "timeLimitMs": 5000,
  "observation": {
    "playerId": 0,
    "turn": 1,
    "income": {
      "total": 5,
      "base": 5,
      "completedBonuses": []
    },
    "firstMovePlayer": 0,
    "map": {},
    "territories": []
  }
}
```

Each observed territory has:

```json
{
  "id": "t144",
  "name": "West China 144",
  "bonusId": "west_china",
  "x": 760.337,
  "y": 112.905,
  "neighbors": ["t55", "t119"],
  "visible": true,
  "mine": true,
  "owner": 0,
  "armies": 7
}
```

For fogged territories, `visible` is false, `owner` is `"unknown"`, and `armies` is `null`.

## Legal Orders

Deployments:

```json
{ "territoryId": "t144", "armies": 5 }
```

Attack or transfer:

```json
{ "from": "t144", "to": "t113", "armies": 3, "mode": "attackTransfer" }
```

Modes:

- `attackTransfer`: attack enemies/neutrals, transfer to owned neighbors.
- `attackOnly`: only execute if target is not owned by you.
- `transferOnly`: only execute if target is owned by you.

Percentage orders are supported:

```json
{ "from": "t144", "to": "t113", "byPercent": true, "percent": 50 }
```

Rules that matter for order generation:

- One army must stand guard, so a territory with `N` armies can move at most `N - 1`.
- Multi-attack is off, so armies that capture a territory cannot move again that turn.
- Move order cycles by turn and alternates order queues during execution.
- Offensive kill rate is 60%; defensive kill rate is 70%.
- Luck is 0% with straight rounding.
- There are no cards.
- Income is base 5 plus completed bonus values. There is no territory-count income.

## Game Over

The engine sends a final `gameOver` message and does not require a reply:

```json
{
  "type": "gameOver",
  "playerId": 0,
  "result": {
    "winner": 0,
    "reason": "elimination"
  }
}
```

## Practical Bot Strategy

Start with a deterministic bot before adding randomness. Good early priorities:

- During picking, value compact bonuses, efficient bonus value per territory, safe expansion, and starts that are not trapped by wastelands.
- During turns, spend all income, expand into low neutrals efficiently, defend border territories, and avoid moving armies needed for defense.
- Estimate attacks with straight rounding. For a 2-neutral, 3 attackers capture with 2 survivors because `round(3 * 0.6) = 2` and `round(2 * 0.7) = 1`.
- Keep internal state if useful, but never assume fogged territory armies are unchanged unless you have tracked them from prior visibility.

Use the starter bots as runnable examples:

- `bots/starter-random`
- `bots/starter-expander`
- `bots/starter-greedy`
