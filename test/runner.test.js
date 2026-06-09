import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "../src/engine/rules.js";
import { BotProcess } from "../src/runner/bot-process.js";
import { runMatch, runMatchByIds } from "../src/runner/match.js";
import { runSelfPlay } from "../src/runner/self-play.js";
import { getBotBaseline, promoteBotBaseline } from "../src/runner/baselines.js";

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

test("string-seed matches can be replayed from the numeric summary seed", async () => {
  const original = await runMatchByIds("starter-random", "starter-greedy", {
    seed: "string-seed",
    writeReplay: false,
    maxTurns: 1,
    timeLimitMs: 1000
  });
  const replayed = await runMatchByIds("starter-random", "starter-greedy", {
    seed: original.summary.seed,
    writeReplay: false,
    maxTurns: 1,
    timeLimitMs: 1000
  });

  assert.deepEqual(replayed.replay.setup.submittedPicks, original.replay.setup.submittedPicks);
  assert.deepEqual(replayed.replay.setup.wastelands, original.replay.setup.wastelands);
});

test("fatal pick failures finish before any turn is applied", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "war-bots-"));
  try {
    const slowDir = path.join(tempRoot, "slow");
    const quickDir = path.join(tempRoot, "quick");
    await mkdir(slowDir);
    await mkdir(quickDir);
    await writeFile(path.join(slowDir, "bot.js"), "process.stdin.resume();\n", "utf8");
    await writeFile(path.join(quickDir, "bot.js"), `
const { createInterface } = require("node:readline");
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.type === "pick") {
    process.stdout.write(JSON.stringify({ picks: message.availablePicks.slice(0, 6) }) + "\\n");
  } else if (message.type === "turn") {
    process.stdout.write(JSON.stringify({ orders: { deployments: [], orders: [] } }) + "\\n");
  }
});
`, "utf8");

    const { summary, replay } = await runMatch([
      { id: "slow", name: "Slow", command: process.execPath, args: ["bot.js"], cwd: slowDir },
      { id: "quick", name: "Quick", command: process.execPath, args: ["bot.js"], cwd: quickDir }
    ], {
      seed: 123,
      writeReplay: false,
      timeLimitMs: 25
    });

    assert.equal(summary.result.reason, "bot_failure");
    assert.equal(summary.result.loser, 0);
    assert.equal(summary.result.turn, 0);
    assert.equal(replay.frames.some((frame) => frame.turn > 0 && frame.phase !== "initial"), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("runner launches bots from separate source copies", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "war-bots-"));
  try {
    const stealerDir = path.join(tempRoot, "stealer");
    const victimDir = path.join(tempRoot, "victim");
    await mkdir(stealerDir);
    await mkdir(victimDir);
    await writeFile(path.join(victimDir, "secret.txt"), "private bot notes\n", "utf8");
    await writeFile(path.join(victimDir, "bot.js"), botScript({ reverseOnSiblingRead: false }), "utf8");
    await writeFile(path.join(stealerDir, "bot.js"), botScript({ reverseOnSiblingRead: true }), "utf8");

    const { replay } = await runMatch([
      { id: "stealer", name: "Stealer", command: process.execPath, args: ["bot.js"], cwd: stealerDir },
      { id: "victim", name: "Victim", command: process.execPath, args: ["bot.js"], cwd: victimDir }
    ], {
      seed: 321,
      writeReplay: false,
      maxTurns: 1,
      timeLimitMs: 1000
    });

    assert.deepEqual(
      replay.setup.submittedPicks[0],
      replay.setup.availablePicks.slice(0, 6)
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("bot baseline promotion overwrites one fixed self-play slot", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "war-selfplay-"));
  try {
    const botsDir = path.join(tempRoot, "bots");
    const baselinesDir = path.join(tempRoot, "bot-baselines");
    const runDir = path.join(tempRoot, "runs");
    const botDir = path.join(botsDir, "self-bot");
    await mkdir(botDir, { recursive: true });
    await writeFile(path.join(botDir, "bot.json"), JSON.stringify({
      id: "self-bot",
      name: "Self Bot",
      command: process.execPath,
      args: ["bot.js"]
    }, null, 2), "utf8");
    await writeFile(path.join(botDir, "bot.js"), botScript({ reverseOnSiblingRead: false }), "utf8");
    await writeFile(path.join(botDir, "version.txt"), "one\n", "utf8");

    const firstPromotion = await promoteBotBaseline("self-bot", {
      botsDir,
      baselinesDir
    });
    await writeFile(path.join(firstPromotion.path, "stale.txt"), "remove me\n", "utf8");
    await writeFile(path.join(botDir, "version.txt"), "two\n", "utf8");
    const secondPromotion = await promoteBotBaseline("self-bot", {
      botsDir,
      baselinesDir
    });
    const baseline = await getBotBaseline("self-bot", { baselinesDir });
    const baselineEntries = await readdir(path.join(baselinesDir, "self-bot"));

    assert.equal(firstPromotion.id, "baseline");
    assert.equal(secondPromotion.id, "baseline");
    assert.equal(firstPromotion.path, secondPromotion.path);
    assert.deepEqual(baselineEntries, ["baseline"]);
    assert.equal(baseline.id, "baseline");
    assert.equal(await readFile(path.join(secondPromotion.path, "version.txt"), "utf8"), "two\n");
    await assert.rejects(readFile(path.join(secondPromotion.path, "stale.txt"), "utf8"));

    await writeFile(path.join(botDir, "bot.js"), botScript({ reverseOnSiblingRead: false }), "utf8");
    const result = await runSelfPlay("self-bot", {
      botsDir,
      baselinesDir,
      runDir,
      against: "baseline",
      games: 2,
      maxTurns: 1,
      timeLimitMs: 1000,
      seed: "selfplay-test"
    });

    assert.equal(result.opponents[0].baselineId, "baseline");
    assert.equal(result.games.length, 2);
    assert.deepEqual(result.games.map((game) => game.candidatePlayer), [0, 1]);
    assert.equal(result.totals.games, 2);
    assert.equal(path.dirname(result.runPath), runDir);
    assert.match(path.basename(result.runPath), /\.json$/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
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

function botScript({ reverseOnSiblingRead }) {
  return `
const fs = require("node:fs");
const path = require("node:path");
const { createInterface } = require("node:readline");
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
function canReadSibling() {
  return fs.existsSync(path.resolve(process.cwd(), "../victim/secret.txt"));
}
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.type === "pick") {
    const available = message.availablePicks ?? [];
    const shouldReverse = ${reverseOnSiblingRead ? "canReadSibling()" : "false"};
    const picks = (shouldReverse ? available.slice().reverse() : available).slice(0, 6);
    process.stdout.write(JSON.stringify({ picks }) + "\\n");
  } else if (message.type === "turn") {
    process.stdout.write(JSON.stringify({ orders: { deployments: [], orders: [] } }) + "\\n");
  }
});
`;
}
