import test from "node:test";
import assert from "node:assert/strict";
import { runMatchByIds } from "../src/runner/match.js";

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
