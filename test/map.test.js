import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MEDIUM_EARTH_MAP, assertMapIntegrity } from "../src/engine/map.js";
import { createDraft } from "../src/engine/game.js";
import { RULES } from "../src/engine/rules.js";

test("map graph is internally consistent", () => {
  assert.equal(assertMapIntegrity(MEDIUM_EARTH_MAP), true);
  assert.equal(MEDIUM_EARTH_MAP.topologySource, "hand-maintained");
  assert.equal(MEDIUM_EARTH_MAP.bonuses.filter((bonus) => bonus.value > 0).length, 23);
  assert.equal(MEDIUM_EARTH_MAP.territories.length, 131);
  assert.equal(MEDIUM_EARTH_MAP.bonuses.length, 27);
  assert.equal(MEDIUM_EARTH_MAP.routeEdges.length, 27);
  for (const territory of MEDIUM_EARTH_MAP.territories) {
    assert.ok(MEDIUM_EARTH_MAP.adjacency[territory.id].length > 0, `${territory.id} must have at least one neighbor`);
  }
});

test("explicit topology includes overseas route connections", () => {
  const expectedRoutes = [
    ["t38", "t72"],
    ["t8", "t114"],
    ["t1", "t8"],
    ["t3", "t93"],
    ["t64", "t77"],
    ["t20", "t91"],
    ["t15", "t20"],
    ["t59", "t85"]
  ];
  for (const [from, to] of expectedRoutes) {
    assert.ok(MEDIUM_EARTH_MAP.adjacency[from].includes(to), `${from} must connect to ${to}`);
    assert.ok(MEDIUM_EARTH_MAP.adjacency[to].includes(from), `${to} must connect to ${from}`);
  }
});

test("north america bonus membership stays stable", () => {
  const bonusById = new Map(MEDIUM_EARTH_MAP.bonuses.map((bonus) => [bonus.id, bonus]));
  assert.deepEqual(new Set(bonusById.get("central_america").territories), new Set(["t6", "t25", "t28", "t31"]));
  assert.deepEqual(new Set(bonusById.get("canada").territories), new Set(["t58", "t61", "t67", "t100", "t107", "t153", "t154"]));
  assert.deepEqual(
    new Set(bonusById.get("west_us").territories),
    new Set(["t16", "t108", "t117", "t124", "t131", "t143", "t152"])
  );
  assert.deepEqual(
    new Set(bonusById.get("east_us").territories),
    new Set(["t35", "t63", "t74", "t106", "t130", "t132", "t146"])
  );
  assert.ok(!bonusById.get("west_us").territories.includes("t25"));
  assert.ok(!bonusById.get("west_us").territories.includes("t31"));
  assert.equal(MEDIUM_EARTH_MAP.territories.find((territory) => territory.id === "t25").bonusId, "central_america");
  assert.equal(MEDIUM_EARTH_MAP.territories.find((territory) => territory.id === "t31").bonusId, "central_america");
  assert.equal(MEDIUM_EARTH_MAP.territories.find((territory) => territory.id === "t100").bonusId, "canada");
  assert.equal(MEDIUM_EARTH_MAP.territories.find((territory) => territory.id === "t130").bonusId, "east_us");
  assert.equal(MEDIUM_EARTH_MAP.territories.find((territory) => territory.id === "t153").bonusId, "canada");
  assert.equal(bonusById.get("west_us").territories.length, 7);
  assert.equal(bonusById.get("east_us").territories.length, 7);
});

test("east africa 148 does not connect directly to middle east 53", () => {
  assert.ok(!MEDIUM_EARTH_MAP.adjacency.t148.includes("t53"));
  assert.ok(!MEDIUM_EARTH_MAP.adjacency.t53.includes("t148"));
});

test("korea 30 belongs to west china", () => {
  const bonusById = new Map(MEDIUM_EARTH_MAP.bonuses.map((bonus) => [bonus.id, bonus]));
  const territory = MEDIUM_EARTH_MAP.territories.find((candidate) => candidate.id === "t30");
  assert.ok(territory);
  assert.equal(territory.name, "Korea 30");
  assert.equal(territory.bonusId, "west_china");
  assert.equal(territory.bonusName, "West China");
  assert.equal(territory.bonusValue, 6);
  assert.equal(territory.zeroBonus, false);
  assert.ok(bonusById.get("west_china").territories.includes("t30"));
  assert.ok(!bonusById.get("korea").territories.includes("t30"));
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
