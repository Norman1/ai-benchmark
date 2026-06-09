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

  const bonusPresence = countBonusPresence(mine);
  const virtualArmies = new Map(mine.map((territory) => [territory.id, positiveInt(territory.armies)]));
  const income = positiveInt(observation.income?.total);
  const deployments = planDeployments({
    income,
    mine,
    byId,
    owned,
    bonusById,
    bonusPresence,
    playerId,
    virtualArmies
  });

  const orders = [];
  const plannedTargets = new Set();
  const attackSources = [...mine].sort((a, b) => (
    sourcePriority(b, byId, owned, bonusById, bonusPresence, playerId)
    - sourcePriority(a, byId, owned, bonusById, bonusPresence, playerId)
  ));

  for (const source of attackSources) {
    let movable = Math.max(0, (virtualArmies.get(source.id) ?? source.armies) - 1);
    if (movable <= 0) continue;

    const targets = visibleTargets(source, byId, owned)
      .filter((target) => !plannedTargets.has(target.id))
      .sort((a, b) => compareTargets(a, b, bonusById, bonusPresence, playerId));

    for (const target of targets) {
      if (movable <= 0) break;
      const needed = requiredAttackers(target.armies);
      if (movable < needed) continue;
      orders.push({ from: source.id, to: target.id, armies: needed, mode: "attackTransfer" });
      movable -= needed;
      plannedTargets.add(target.id);
    }

    if (movable > 0) {
      const fallbackTargets = visibleTargets(source, byId, owned)
        .sort((a, b) => compareTargets(a, b, bonusById, bonusPresence, playerId));
      const fallbackTarget = fallbackTargets.find((target) => !plannedTargets.has(target.id)) ?? fallbackTargets[0];
      if (fallbackTarget) {
        orders.push({ from: source.id, to: fallbackTarget.id, armies: movable, mode: "attackTransfer" });
        movable = 0;
      }
    }

    virtualArmies.set(source.id, movable + 1);
  }

  moveInteriorArmies({ mine, byId, owned, playerId, virtualArmies, orders });
  return { deployments, orders };
}

function planDeployments({ income, mine, byId, owned, bonusById, bonusPresence, playerId, virtualArmies }) {
  const deploymentById = new Map();
  for (let army = 0; army < income; army += 1) {
    const target = chooseDeploymentTarget({
      mine,
      byId,
      owned,
      bonusById,
      bonusPresence,
      playerId,
      virtualArmies
    });
    if (!target) break;
    virtualArmies.set(target.id, (virtualArmies.get(target.id) ?? target.armies) + 1);
    deploymentById.set(target.id, (deploymentById.get(target.id) ?? 0) + 1);
  }
  return [...deploymentById.entries()].map(([territoryId, armies]) => ({ territoryId, armies }));
}

function chooseDeploymentTarget({ mine, byId, owned, bonusById, bonusPresence, playerId, virtualArmies }) {
  const candidates = mine.map((territory) => {
    const targets = visibleTargets(territory, byId, owned);
    return {
      territory,
      targets,
      armies: virtualArmies.get(territory.id) ?? territory.armies,
      need: neededExpansionArmies(territory, byId, owned, bonusById, bonusPresence, playerId, virtualArmies),
      pressure: sourcePriority(territory, byId, owned, bonusById, bonusPresence, playerId)
    };
  });

  const needingExpansion = candidates
    .filter((candidate) => candidate.targets.length && candidate.need.armies > 0)
    .sort((a, b) => {
      if (a.need.armies !== b.need.armies) return a.need.armies - b.need.armies;
      if (a.need.value !== b.need.value) return b.need.value - a.need.value;
      return b.pressure - a.pressure;
    });
  if (needingExpansion.length) return needingExpansion[0].territory;

  const activeFronts = candidates.filter((candidate) => candidate.targets.length);
  const balancePool = activeFronts.length ? activeFronts : candidates;
  balancePool.sort((a, b) => {
    if (a.armies !== b.armies) return a.armies - b.armies;
    return b.pressure - a.pressure;
  });
  return balancePool[0]?.territory ?? mine[0];
}

function neededExpansionArmies(source, byId, owned, bonusById, bonusPresence, playerId, virtualArmies) {
  let movable = Math.max(0, (virtualArmies.get(source.id) ?? source.armies) - 1);
  let armies = 0;
  let value = 0;
  const targets = valuableTargets(source, byId, owned, bonusById, bonusPresence, playerId);
  for (const target of targets) {
    const needed = requiredAttackers(target.armies);
    if (movable >= needed) {
      movable -= needed;
      continue;
    }

    armies += needed - movable;
    value += targetValue(target, bonusById, bonusPresence, playerId);
    movable = 0;
  }
  return { armies, value };
}

function valuableTargets(source, byId, owned, bonusById, bonusPresence, playerId) {
  return visibleTargets(source, byId, owned)
    .filter((target) => targetValue(target, bonusById, bonusPresence, playerId) > 0)
    .sort((a, b) => compareTargets(a, b, bonusById, bonusPresence, playerId));
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

function sourcePriority(source, byId, owned, bonusById, bonusPresence, playerId) {
  const targets = visibleTargets(source, byId, owned);
  if (!targets.length) return source.armies * 0.1;
  return targets.reduce((total, target) => total + targetValue(target, bonusById, bonusPresence, playerId), 0)
    + Math.max(0, source.armies - 1) * 0.5;
}

function compareTargets(a, b, bonusById, bonusPresence, playerId) {
  const needed = requiredAttackers(a.armies) - requiredAttackers(b.armies);
  if (needed !== 0) return needed;
  return targetValue(b, bonusById, bonusPresence, playerId) - targetValue(a, bonusById, bonusPresence, playerId);
}

function targetValue(target, bonusById, bonusPresence, playerId) {
  const bonus = bonusById.get(target.bonusId);
  const bonusValue = bonus?.value ?? target.bonusValue ?? 0;
  const ownedInBonus = bonusPresence.get(target.bonusId) ?? 0;
  const missingAfterCapture = bonus ? Math.max(0, bonus.territories.length - ownedInBonus - 1) : 99;
  const presenceValue = ownedInBonus > 0
    ? 12 + ownedInBonus * 2 + (missingAfterCapture <= 1 ? 10 : 0)
    : 0;
  const enemyValue = target.owner !== null && target.owner !== playerId ? 18 : 0;
  const wastelandPenalty = target.armies >= 10 ? 12 : 0;
  return 10 + bonusValue + presenceValue + enemyValue - target.armies * 1.5 - wastelandPenalty;
}

function countBonusPresence(mine) {
  const counts = new Map();
  for (const territory of mine) {
    counts.set(territory.bonusId, (counts.get(territory.bonusId) ?? 0) + 1);
  }
  return counts;
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
