import test from "node:test";
import assert from "node:assert/strict";
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
