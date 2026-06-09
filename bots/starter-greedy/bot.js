import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.type === "pick") {
    reply({ picks: choosePicks(message) });
  } else if (message.type === "turn") {
    reply({ orders: chooseTurn(message.observation) });
  }
});

function choosePicks(message) {
  const territoryById = new Map(message.map.territories.map((territory) => [territory.id, territory]));
  const bonusById = new Map(message.map.bonuses.map((bonus) => [bonus.id, bonus]));
  return [...message.availablePicks]
    .map((id) => {
      const territory = territoryById.get(id);
      const bonus = bonusById.get(territory.bonusId);
      const efficiency = bonus.value / Math.max(1, bonus.territories.length);
      return { id, score: efficiency * 100 + bonus.value - bonus.territories.length };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, message.requiredPicks ?? 6)
    .map((pick) => pick.id);
}

function chooseTurn(observation) {
  const byId = new Map(observation.territories.map((territory) => [territory.id, territory]));
  const mine = observation.territories.filter((territory) => territory.mine);
  if (!mine.length) return { deployments: [], orders: [] };

  const candidateSources = mine
    .map((territory) => ({
      territory,
      enemyNeighbors: territory.neighbors.map((id) => byId.get(id)).filter((target) => target?.visible && target.owner !== observation.playerId)
    }))
    .filter((entry) => entry.enemyNeighbors.length);

  const deployTarget = chooseDeployTarget(candidateSources, mine);
  const deployments = [{ territoryId: deployTarget.id, armies: observation.income.total }];
  const virtualArmies = new Map(mine.map((territory) => [territory.id, territory.armies]));
  virtualArmies.set(deployTarget.id, deployTarget.armies + observation.income.total);

  const orders = [];
  const sources = [...mine].sort((a, b) => (virtualArmies.get(b.id) ?? b.armies) - (virtualArmies.get(a.id) ?? a.armies));
  for (const source of sources) {
    let movable = Math.max(0, (virtualArmies.get(source.id) ?? source.armies) - 1);
    if (movable <= 0) continue;

    const targets = source.neighbors
      .map((id) => byId.get(id))
      .filter((target) => target?.visible && target.owner !== observation.playerId)
      .sort((a, b) => targetScore(a, observation.playerId) - targetScore(b, observation.playerId));

    for (const target of targets) {
      if (movable <= 0) break;
      const needed = requiredAttackers(target.armies);
      if (movable >= needed) {
        orders.push({ from: source.id, to: target.id, armies: needed, mode: "attackTransfer" });
        movable -= needed;
      } else if (target.owner !== null && movable >= 3) {
        orders.push({ from: source.id, to: target.id, armies: movable, mode: "attackTransfer" });
        movable = 0;
      }
    }
  }

  return { deployments, orders };
}

function chooseDeployTarget(candidateSources, mine) {
  if (!candidateSources.length) return mine[0];
  candidateSources.sort((a, b) => {
    const aEnemy = a.enemyNeighbors.some((target) => target.owner !== null);
    const bEnemy = b.enemyNeighbors.some((target) => target.owner !== null);
    if (aEnemy !== bEnemy) return aEnemy ? -1 : 1;
    return b.territory.armies - a.territory.armies;
  });
  return candidateSources[0].territory;
}

function targetScore(target, playerId) {
  if (target.owner !== null && target.owner !== playerId) return -100 + target.armies;
  return target.armies;
}

function requiredAttackers(defenders) {
  for (let attackers = 1; attackers <= 50; attackers += 1) {
    const killedDefenders = Math.floor(attackers * 0.6 + 0.5);
    const killedAttackers = Math.floor(defenders * 0.7 + 0.5);
    if (killedDefenders >= defenders && attackers > killedAttackers) return attackers;
  }
  return Math.ceil(defenders / 0.6) + 1;
}

function reply(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
