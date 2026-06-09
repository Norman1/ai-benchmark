import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MEDIUM_EARTH_MAP, assertMapIntegrity } from "../src/engine/map.js";
import { createDraft } from "../src/engine/game.js";
import { RULES } from "../src/engine/rules.js";

test("map graph is internally consistent", () => {
  assert.equal(assertMapIntegrity(MEDIUM_EARTH_MAP), true);
  assert.equal(MEDIUM_EARTH_MAP.bonuses.filter((bonus) => bonus.value > 0).length, 23);
  assert.equal(MEDIUM_EARTH_MAP.territories.length, 131);
  assert.equal(MEDIUM_EARTH_MAP.bonuses.length, 27);
  for (const territory of MEDIUM_EARTH_MAP.territories) {
    assert.ok(MEDIUM_EARTH_MAP.adjacency[territory.id].length > 0, `${territory.id} must have at least one neighbor`);
  }
});

test("official geometry covers every engine territory", async () => {
  const geometry = JSON.parse(await readFile(new URL("../public/assets/medium-earth-geometry.json", import.meta.url), "utf8"));
  const geometryIds = new Set(geometry.territories.map((territory) => territory.id));
  for (const territory of MEDIUM_EARTH_MAP.territories) {
    assert.ok(geometryIds.has(territory.id), `${territory.id} is missing SVG geometry`);
  }
});

test("random warlords and wastelands follow benchmark settings", () => {
  const draft = createDraft(123);
  assert.equal(draft.distribution.length, 23);
  assert.equal(new Set(draft.distribution).size, 23);
  assert.equal(draft.wastelands.length, RULES.wastelandCount);
  assert.equal(new Set(draft.wastelands).size, RULES.wastelandCount);
  for (const territoryId of draft.availablePicks) {
    assert.ok(!draft.wastelands.includes(territoryId));
  }
});
