import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.type === "pick") {
    reply({ picks: message.availablePicks.slice(0, message.requiredPicks ?? 6) });
  } else if (message.type === "turn") {
    reply({ orders: chooseTurn(message.observation) });
  }
});

function chooseTurn(observation) {
  const byId = new Map(observation.territories.map((territory) => [territory.id, territory]));
  const mine = observation.territories.filter((territory) => territory.mine);
  const expandable = mine
    .map((territory) => ({
      territory,
      targets: territory.neighbors
        .map((id) => byId.get(id))
        .filter((target) => target?.visible && target.owner !== observation.playerId && target.armies <= 4)
    }))
    .filter((entry) => entry.targets.length);

  const deployTarget = (expandable[0]?.territory ?? mine[0]);
  const deployments = deployTarget ? [{ territoryId: deployTarget.id, armies: observation.income.total }] : [];
  const orders = [];
  if (!deployTarget) return { deployments, orders };

  let movable = deployTarget.armies + observation.income.total - 1;
  const targets = expandable.find((entry) => entry.territory.id === deployTarget.id)?.targets ?? [];
  targets.sort((a, b) => a.armies - b.armies);
  for (const target of targets) {
    const needed = target.armies <= 2 ? 3 : 6;
    if (movable >= needed) {
      orders.push({ from: deployTarget.id, to: target.id, armies: needed });
      movable -= needed;
    }
  }
  return { deployments, orders };
}

function reply(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
