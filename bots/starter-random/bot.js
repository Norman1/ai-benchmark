import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let rng = makeRng(1);

rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.type === "pick") {
    rng = makeRng(`${message.seed}:random:${message.playerId}`);
    const picks = shuffle(message.availablePicks ?? [], rng).slice(0, message.requiredPicks ?? 6);
    reply({ picks });
  } else if (message.type === "turn") {
    reply({ orders: chooseTurn(message.observation) });
  }
});

function chooseTurn(observation) {
  const mine = observation.territories.filter((territory) => territory.mine);
  const income = observation.income.total;
  if (!mine.length) return { deployments: [], orders: [] };

  const border = mine.filter((territory) => territory.neighbors.some((id) => {
    const neighbor = byId(observation, id);
    return neighbor?.visible && neighbor.owner !== observation.playerId;
  }));
  const deployTarget = pick(border.length ? border : mine, rng);
  const deployments = [{ territoryId: deployTarget.id, armies: income }];

  const virtualArmies = new Map(mine.map((territory) => [territory.id, territory.armies]));
  virtualArmies.set(deployTarget.id, deployTarget.armies + income);

  const orders = [];
  for (const territory of shuffle(mine, rng)) {
    let movable = Math.max(0, (virtualArmies.get(territory.id) ?? territory.armies) - 1);
    if (movable <= 0) continue;
    const candidates = territory.neighbors
      .map((id) => byId(observation, id))
      .filter((neighbor) => neighbor?.visible && neighbor.owner !== observation.playerId);
    if (!candidates.length) continue;
    const target = pick(candidates, rng);
    const armies = Math.max(1, Math.min(movable, target.armies >= 4 ? 6 : 3));
    orders.push({ from: territory.id, to: target.id, armies, mode: "attackTransfer" });
    movable -= armies;
  }

  return { deployments, orders };
}

function byId(observation, id) {
  return observation.territories.find((territory) => territory.id === id);
}

function reply(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function makeRng(seed) {
  let state = 2166136261;
  for (const char of String(seed)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (1664525 * (state >>> 0) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
