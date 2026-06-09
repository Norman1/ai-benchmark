# Bot API

Bots are black-box processes. The engine launches each bot from its `bot.json` manifest and communicates with one JSON object per line over stdin/stdout.

Bots may be written in any language as long as the manifest command starts the process and the process writes valid JSON replies on stdout. Use stderr for logs.

## Manifest

```json
{
  "id": "my-bot",
  "name": "My Bot",
  "command": "node",
  "args": ["bot.js"]
}
```

## Picking

The first message is `pick`. Reply with up to 6 ordered territory IDs.

```json
{
  "type": "pick",
  "playerId": 0,
  "availablePicks": ["canada_bc", "europe_spain"],
  "requiredPicks": 6
}
```

```json
{ "picks": ["europe_spain", "canada_bc"] }
```

## Turns

Each turn, reply with deployments and attack/transfer orders.

```json
{
  "orders": {
    "deployments": [
      { "territoryId": "europe_spain", "armies": 5 }
    ],
    "orders": [
      { "from": "europe_spain", "to": "europe_france", "armies": 3, "mode": "attackTransfer" }
    ]
  }
}
```

`mode` can be `attackTransfer`, `attackOnly`, or `transferOnly`. For attack by percentage, use:

```json
{ "from": "a", "to": "b", "byPercent": true, "percent": 50 }
```

Invalid or impossible orders are ignored. Undeployed income is deployed to the first owned territory as a fallback so a simple bot can still play.

## Privacy Boundary

The engine only needs a bot artifact folder and manifest. Keep each agent's source in a separate workspace. During evaluation, copy or mount only that bot's runnable package into its own bot directory.
