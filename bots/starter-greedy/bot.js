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
      const exits = territory.neighbors.length;
      return {
        id,
        score: efficiency * 120 + bonus.value * 8 + exits - bonus.territories.length * 2
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, message.requiredPicks ?? 6)
    .map((pick) => pick.id);
}

function chooseTurn(observation) {
  const playerId = observation.playerId;
  const byId = new Map(observation.territories.map((territory) => [territory.id, territory]));
  const bonusById = new Map((observation.map?.bonuses ?? []).map((bonus) => [bonus.id, bonus]));
  const mine = observation.territories.filter((territory) => territory.mine);
  const owned = new Set(mine.map((territory) => territory.id));
  if (!mine.length) return { deployments: [], orders: [] };

  const virtualArmies = new Map(mine.map((territory) => [territory.id, positiveInt(territory.armies)]));
  const income = positiveInt(observation.income?.total);
  const deployments = planDeployments({
    income,
    mine,
    byId,
    owned,
    bonusById,
    playerId,
    virtualArmies
  });

  const orders = [];
  const plannedTargets = new Set();
  const attackSources = [...mine].sort((a, b) => sourcePriority(b, byId, owned, bonusById, playerId) - sourcePriority(a, byId, owned, bonusById, playerId));

  for (const source of attackSources) {
    let movable = Math.max(0, (virtualArmies.get(source.id) ?? source.armies) - 1);
    if (movable <= 0) continue;

    const targets = visibleTargets(source, byId, owned)
      .filter((target) => !plannedTargets.has(target.id))
      .sort((a, b) => compareTargets(a, b, bonusById, playerId));

    for (const target of targets) {
      if (movable <= 0) break;
      const needed = requiredAttackers(target.armies);
      if (movable < needed) continue;
      orders.push({ from: source.id, to: target.id, armies: needed, mode: "attackTransfer" });
      movable -= needed;
      plannedTargets.add(target.id);
    }

    virtualArmies.set(source.id, movable + 1);
  }

  moveInteriorArmies({ mine, byId, owned, playerId, virtualArmies, orders });
  return { deployments, orders };
}

function planDeployments({ income, mine, byId, owned, bonusById, playerId, virtualArmies }) {
  const deploymentById = new Map();
  for (let army = 0; army < income; army += 1) {
    const target = chooseDeploymentTarget(mine, byId, owned, bonusById, playerId, virtualArmies);
    if (!target) break;
    virtualArmies.set(target.id, (virtualArmies.get(target.id) ?? target.armies) + 1);
    deploymentById.set(target.id, (deploymentById.get(target.id) ?? 0) + 1);
  }
  return [...deploymentById.entries()].map(([territoryId, armies]) => ({ territoryId, armies }));
}

function chooseDeploymentTarget(mine, byId, owned, bonusById, playerId, virtualArmies) {
  let best = null;
  for (const territory of mine) {
    const targets = visibleTargets(territory, byId, owned);
    if (!targets.length) {
      const fallbackScore = -10000 + territory.armies * 0.01;
      if (!best || fallbackScore > best.score) best = { territory, score: fallbackScore };
      continue;
    }

    const movable = Math.max(0, (virtualArmies.get(territory.id) ?? territory.armies) - 1);
    const before = simulateCaptures(territory, movable, byId, owned, bonusById, playerId);
    const after = simulateCaptures(territory, movable + 1, byId, owned, bonusById, playerId);
    const deficit = nextCaptureDeficit(territory, movable, byId, owned);
    const pressure = sourcePriority(territory, byId, owned, bonusById, playerId);
    const score = (after.count - before.count) * 1000
      + (after.value - before.value) * 10
      - Math.max(0, deficit) * 18
      + pressure * 0.08;

    if (!best || score > best.score) best = { territory, score };
  }
  return best?.territory ?? mine[0];
}

function simulateCaptures(source, movableArmies, byId, owned, bonusById, playerId) {
  let remaining = movableArmies;
  let count = 0;
  let value = 0;
  const targets = visibleTargets(source, byId, owned).sort((a, b) => compareTargets(a, b, bonusById, playerId));
  for (const target of targets) {
    const needed = requiredAttackers(target.armies);
    if (remaining < needed) continue;
    remaining -= needed;
    count += 1;
    value += targetValue(target, bonusById, playerId);
  }
  return { count, value, remaining };
}

function nextCaptureDeficit(source, movableArmies, byId, owned) {
  const deficits = visibleTargets(source, byId, owned)
    .map((target) => requiredAttackers(target.armies) - movableArmies)
    .filter((deficit) => deficit > 0);
  return deficits.length ? Math.min(...deficits) : 0;
}

function moveInteriorArmies({ mine, byId, owned, playerId, virtualArmies, orders }) {
  const distances = distanceToFront(mine, byId, owned, playerId);
  const transferSources = [...mine].sort((a, b) => (distances.get(b.id) ?? 0) - (distances.get(a.id) ?? 0));

  for (const source of transferSources) {
    const sourceDistance = distances.get(source.id) ?? 0;
    if (sourceDistance <= 0) continue;
    let movable = Math.max(0, (virtualArmies.get(source.id) ?? source.armies) - 1);
    if (movable <= 0) continue;

    const target = source.neighbors
      .map((id) => byId.get(id))
      .filter((neighbor) => neighbor && owned.has(neighbor.id) && (distances.get(neighbor.id) ?? Infinity) < sourceDistance)
      .sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity))[0];

    if (!target) continue;
    orders.push({ from: source.id, to: target.id, armies: movable, mode: "transferOnly" });
    virtualArmies.set(source.id, 1);
  }
}

function distanceToFront(mine, byId, owned, playerId) {
  const distances = new Map();
  const queue = [];
  for (const territory of mine) {
    if (visibleTargets(territory, byId, owned).length) {
      distances.set(territory.id, 0);
      queue.push(territory);
    }
  }

  if (!queue.length) {
    for (const territory of mine) distances.set(territory.id, 0);
    return distances;
  }

  for (let index = 0; index < queue.length; index += 1) {
    const territory = queue[index];
    const nextDistance = (distances.get(territory.id) ?? 0) + 1;
    for (const neighborId of territory.neighbors) {
      if (!owned.has(neighborId) || distances.has(neighborId)) continue;
      const neighbor = byId.get(neighborId);
      if (!neighbor || neighbor.owner !== playerId) continue;
      distances.set(neighborId, nextDistance);
      queue.push(neighbor);
    }
  }
  return distances;
}

function visibleTargets(source, byId, owned) {
  return source.neighbors
    .map((id) => byId.get(id))
    .filter((target) => target?.visible && !owned.has(target.id) && target.armies !== null);
}

function sourcePriority(source, byId, owned, bonusById, playerId) {
  const targets = visibleTargets(source, byId, owned);
  if (!targets.length) return source.armies * 0.1;
  return targets.reduce((total, target) => total + targetValue(target, bonusById, playerId), 0)
    + Math.max(0, source.armies - 1) * 0.5;
}

function compareTargets(a, b, bonusById, playerId) {
  const needed = requiredAttackers(a.armies) - requiredAttackers(b.armies);
  if (needed !== 0) return needed;
  return targetValue(b, bonusById, playerId) - targetValue(a, bonusById, playerId);
}

function targetValue(target, bonusById, playerId) {
  const bonusValue = bonusById.get(target.bonusId)?.value ?? target.bonusValue ?? 0;
  const enemyValue = target.owner !== null && target.owner !== playerId ? 18 : 0;
  const wastelandPenalty = target.armies >= 10 ? 12 : 0;
  return 10 + bonusValue + enemyValue - target.armies * 1.5 - wastelandPenalty;
}

function requiredAttackers(defenders) {
  const defendingArmies = positiveInt(defenders);
  for (let attackers = 1; attackers <= 200; attackers += 1) {
    const killedDefenders = Math.floor(attackers * 0.6 + 0.5);
    const killedAttackers = Math.floor(defendingArmies * 0.7 + 0.5);
    if (killedDefenders >= defendingArmies && attackers > killedAttackers) return attackers;
  }
  return Math.ceil(defendingArmies / 0.6) + 1;
}

function positiveInt(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function reply(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
