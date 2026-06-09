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
