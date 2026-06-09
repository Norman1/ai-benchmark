import test from "node:test";
import assert from "node:assert/strict";
import { WarGame, createDraft } from "../src/engine/game.js";

test("starting territories and neutral armies are initialized correctly", () => {
  const draft = createDraft(1);
  const pickOrders = [draft.availablePicks.slice(0, 6), draft.availablePicks.slice(6, 12)];
  const game = new WarGame({ seed: 1, draft, pickOrders });
  assert.equal(game.allocation.starts[0].length, 3);
  assert.equal(game.allocation.starts[1].length, 3);
  for (const territoryId of game.allocation.starts.flat()) {
    assert.equal(game.territories[territoryId].armies, 4);
    assert.notEqual(game.territories[territoryId].owner, null);
  }
  for (const territoryId of draft.wastelands) {
    if (!game.allocation.starts.flat().includes(territoryId)) {
      assert.equal(game.territories[territoryId].armies, 10);
    }
  }
});

test("replay starts with territory distribution and submitted pick frames", () => {
  const draft = createDraft(1);
  const pickOrders = [draft.availablePicks.slice(0, 6), draft.availablePicks.slice(6, 12)];
  const game = new WarGame({ seed: 1, draft, pickOrders });
  assert.equal(game.replay.frames[0].phase, "distribution");
  assert.equal(game.replay.frames[0].turn, 0);
  assert.equal(game.replay.frames[0].revealedEventCount, 0);
  assert.equal(game.replay.frames.filter((frame) => frame.phase === "pick").length, 12);
  assert.equal(game.replay.frames.find((frame) => frame.phase === "pick").events.length, 12);
  assert.equal(game.replay.frames.find((frame) => frame.phase === "initial").turn, 1);
  assert.deepEqual(game.replay.setup.submittedPicks, pickOrders);
});

test("deployments happen before attacks and a 3v2 straight-round attack captures", () => {
  const draft = createDraft(2);
  const pickOrders = [draft.availablePicks.slice(0, 6), draft.availablePicks.slice(6, 12)];
  const game = new WarGame({ seed: 2, draft, pickOrders });
  const source = game.allocation.starts[0][0];
  const target = game.map.adjacency[source].find((territoryId) => game.territories[territoryId].owner === null);
  assert.ok(target);
  game.territories[source].armies = 4;
  game.territories[target].armies = 2;
  game.runTurn([
    {
      deployments: [{ territoryId: source, armies: 1 }],
      orders: [{ from: source, to: target, armies: 3 }]
    },
    { deployments: [], orders: [] }
  ]);
  assert.equal(game.territories[target].owner, 0);
  assert.equal(game.territories[target].armies, 2);
});

test("replay records a frame for each executed order", () => {
  const draft = createDraft(2);
  const pickOrders = [draft.availablePicks.slice(0, 6), draft.availablePicks.slice(6, 12)];
  const game = new WarGame({ seed: 2, draft, pickOrders });
  const source = game.allocation.starts[0][0];
  const target = game.map.adjacency[source].find((territoryId) => game.territories[territoryId].owner === null);
  assert.ok(target);
  game.territories[source].armies = 4;
  game.territories[target].armies = 2;

  game.runTurn([
    {
      deployments: [{ territoryId: source, armies: 1 }],
      orders: [{ from: source, to: target, armies: 3 }]
    },
    { deployments: [], orders: [] }
  ]);

  const orderFrames = game.replay.frames.filter((frame) => {
    const event = frame.events[frame.currentEventIndex];
    return event && event.type !== "pick";
  });
  assert.ok(orderFrames.length >= 2);
  assert.equal(orderFrames[0].events[orderFrames[0].currentEventIndex].type, "deploy");
  assert.equal(orderFrames.at(-1).events[orderFrames.at(-1).currentEventIndex].type, "attack");
});
