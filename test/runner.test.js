import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { RULES } from "../src/engine/rules.js";
import { BotProcess } from "../src/runner/bot-process.js";
import { runMatchByIds } from "../src/runner/match.js";

test("default bot request timeout is five seconds", () => {
  assert.equal(RULES.botTimeLimitMs, 5000);
});

test("bot subprocess requests enforce the configured timeout", async () => {
  const bot = new BotProcess({
    id: "slow-test-bot",
    command: process.execPath,
    args: ["-e", "process.stdin.resume();"],
    cwd: process.cwd()
  }, { timeLimitMs: 25 });

  try {
    await assert.rejects(
      bot.request({ type: "turn", playerId: 0 }),
      /timed out after 25ms/
    );
  } finally {
    bot.stop();
  }
});

test("runner max turn safety limit produces a draw", async () => {
  const { summary } = await runMatchByIds("starter-greedy", "starter-random", {
    seed: 42,
    writeReplay: false,
    maxTurns: 1,
    timeLimitMs: 1000
  });

  assert.equal(summary.result.winner, null);
  assert.equal(summary.result.loser, null);
  assert.equal(summary.result.reason, "turn_limit_draw");
  assert.equal(summary.result.turn, 1);
});

test("starter greedy prefers capturable territories in bonuses where it already has presence", async () => {
  const bot = starterGreedyBot();

  try {
    const response = await bot.request({
      type: "turn",
      playerId: 0,
      observation: {
        playerId: 0,
        turn: 1,
        income: { total: 0, base: 0, completedBonuses: [] },
        map: {
          bonuses: [
            { id: "owned_bonus", value: 5, territories: ["owned", "same_bonus"] },
            { id: "other_bonus", value: 5, territories: ["other_bonus_target"] }
          ]
        },
        territories: [
          {
            id: "owned",
            name: "Owned",
            bonusId: "owned_bonus",
            visible: true,
            mine: true,
            owner: 0,
            armies: 4,
            neighbors: ["same_bonus", "other_bonus_target"]
          },
          {
            id: "same_bonus",
            name: "Same Bonus",
            bonusId: "owned_bonus",
            visible: true,
            mine: false,
            owner: null,
            armies: 2,
            neighbors: ["owned"]
          },
          {
            id: "other_bonus_target",
            name: "Other Bonus Target",
            bonusId: "other_bonus",
            visible: true,
            mine: false,
            owner: null,
            armies: 2,
            neighbors: ["owned"]
          }
        ]
      }
    });

    assert.equal(response.orders.orders[0].to, "same_bonus");
  } finally {
    bot.stop();
  }
});

test("starter greedy attacks with all otherwise unused border armies", async () => {
  const bot = starterGreedyBot();

  try {
    const response = await bot.request({
      type: "turn",
      playerId: 0,
      observation: {
        playerId: 0,
        turn: 1,
        income: { total: 0, base: 0, completedBonuses: [] },
        map: { bonuses: [{ id: "front", value: 5, territories: ["owned", "hard_target"] }] },
        territories: [
          {
            id: "owned",
            name: "Owned",
            bonusId: "front",
            visible: true,
            mine: true,
            owner: 0,
            armies: 4,
            neighbors: ["hard_target"]
          },
          {
            id: "hard_target",
            name: "Hard Target",
            bonusId: "front",
            visible: true,
            mine: false,
            owner: null,
            armies: 10,
            neighbors: ["owned"]
          }
        ]
      }
    });

    assert.deepEqual(response.orders.orders, [
      { from: "owned", to: "hard_target", armies: 3, mode: "attackTransfer" }
    ]);
  } finally {
    bot.stop();
  }
});

test("starter greedy balances surplus deployments across expansion fronts", async () => {
  const bot = starterGreedyBot();

  try {
    const response = await bot.request({
      type: "turn",
      playerId: 0,
      observation: {
        playerId: 0,
        turn: 1,
        income: { total: 6, base: 6, completedBonuses: [] },
        map: {
          bonuses: [
            { id: "front_a", value: 5, territories: ["owned_a", "target_a"] },
            { id: "front_b", value: 5, territories: ["owned_b", "target_b"] }
          ]
        },
        territories: [
          {
            id: "owned_a",
            name: "Owned A",
            bonusId: "front_a",
            visible: true,
            mine: true,
            owner: 0,
            armies: 4,
            neighbors: ["target_a"]
          },
          {
            id: "owned_b",
            name: "Owned B",
            bonusId: "front_b",
            visible: true,
            mine: true,
            owner: 0,
            armies: 4,
            neighbors: ["target_b"]
          },
          {
            id: "target_a",
            name: "Target A",
            bonusId: "front_a",
            visible: true,
            mine: false,
            owner: null,
            armies: 2,
            neighbors: ["owned_a"]
          },
          {
            id: "target_b",
            name: "Target B",
            bonusId: "front_b",
            visible: true,
            mine: false,
            owner: null,
            armies: 2,
            neighbors: ["owned_b"]
          }
        ]
      }
    });

    assert.deepEqual(deploymentsByTerritory(response.orders.deployments), new Map([
      ["owned_a", 3],
      ["owned_b", 3]
    ]));
  } finally {
    bot.stop();
  }
});

test("starter bots can complete a subprocess match", async () => {
  const { summary, replay } = await runMatchByIds("starter-greedy", "starter-random", {
    seed: 777,
    writeReplay: false,
    maxTurns: 40,
    timeLimitMs: 1000
  });
  assert.ok(replay.frames.length > 1);
  assert.ok(summary.result);
  assert.equal(replay.players.length, 2);
  assert.equal(replay.setup.allocation.starts[0].length, 3);
  assert.equal(replay.setup.allocation.starts[1].length, 3);
});

function starterGreedyBot() {
  return new BotProcess({
    id: "starter-greedy-test",
    command: process.execPath,
    args: ["bot.js"],
    cwd: fileURLToPath(new URL("../bots/starter-greedy/", import.meta.url))
  }, { timeLimitMs: 1000 });
}

function deploymentsByTerritory(deployments) {
  return new Map(deployments.map((deployment) => [deployment.territoryId, deployment.armies]));
}
