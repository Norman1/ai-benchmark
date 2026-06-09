import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

const state = {
  map: null,
  model: null,
  playerId: null,
  opponentId: null,
  wastelands: new Set(),
  pickOrder: [],
  seen: new Map()
};

rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.type === "pick") {
    rememberPickContext(message);
    reply({ picks: choosePicks(message) });
  } else if (message.type === "turn") {
    reply({ orders: chooseTurn(message.observation) });
  }
});

function rememberPickContext(message) {
  state.map = message.map;
  state.model = buildModel(message.map);
  state.playerId = message.playerId;
  state.opponentId = 1 - message.playerId;
  state.wastelands = new Set(message.wastelands ?? []);
}

function choosePicks(message) {
  const model = state.model ?? buildModel(message.map);
  const available = [...message.availablePicks];
  const ranked = available
    .map((id) => ({ id, score: pickScore(id, model, message) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.id);

  state.pickOrder = ranked.slice(0, message.requiredPicks ?? 6);
  return state.pickOrder;
}

function pickScore(id, model, message) {
  const territory = model.territories.get(id);
  const bonus = model.bonuses.get(territory.bonusId);
  const bonusShape = model.bonusShape.get(bonus.id);
  const wastelands = new Set(message.wastelands ?? []);
  const wastedInBonus = bonus.territories.filter((territoryId) => wastelands.has(territoryId)).length;
  const wastedNeighbors = territory.neighbors.filter((neighborId) => wastelands.has(neighborId)).length;
  const sameBonusNeighbors = territory.neighbors.filter((neighborId) => model.territories.get(neighborId)?.bonusId === bonus.id).length;
  const outsideNeighbors = territory.neighbors.length - sameBonusNeighbors;
  const neighboringBonusValue = unique(territory.neighbors
    .map((neighborId) => model.territories.get(neighborId)?.bonusId)
    .filter((bonusId) => bonusId && bonusId !== bonus.id))
    .reduce((total, bonusId) => total + Math.max(0, model.bonuses.get(bonusId)?.value ?? 0), 0);

  return (
    bonus.value * 24
    + (bonus.value / Math.max(1, bonus.territories.length)) * 185
    - bonus.territories.length * 10
    - bonusShape.borderTerritories * 5.5
    - bonusShape.externalEdges * 1.1
    - wastedInBonus * 22
    - wastedNeighbors * 5
    + sameBonusNeighbors * 5
    - outsideNeighbors * 2.5
    + Math.min(18, neighboringBonusValue) * 0.8
    + stableNoise(`${message.botSeed}:${id}`, 0.001)
  );
}

function chooseTurn(observation) {
  if (!observation?.territories?.length) return { deployments: [], orders: [] };
  state.playerId = observation.playerId;
  state.opponentId = 1 - observation.playerId;
  state.map = observation.map;
  state.model = buildModel(observation.map);
  updateMemory(observation);

  const context = buildTurnContext(observation);
  if (!context.mine.length) return { deployments: [], orders: [] };

  const deployments = planDeployments(context);
  const orders = planAttacks(context);
  moveInteriorArmies(context, orders);
  return { deployments, orders };
}

function updateMemory(observation) {
  for (const territory of observation.territories) {
    if (!territory.visible) continue;
    state.seen.set(territory.id, {
      owner: territory.owner,
      armies: territory.armies,
      turn: observation.turn
    });
  }
}

function buildTurnContext(observation) {
  const model = state.model;
  const byId = new Map(observation.territories.map((territory) => [territory.id, territory]));
  const mine = observation.territories.filter((territory) => territory.mine);
  const owned = new Set(mine.map((territory) => territory.id));
  const virtualArmies = new Map(mine.map((territory) => [territory.id, positiveInt(territory.armies)]));
  const deploymentsById = new Map();
  const plannedTargets = new Set();
  const bonusStats = new Map();

  for (const bonus of model.bonuses.values()) {
    const stats = {
      bonus,
      mine: 0,
      visibleNeutral: 0,
      visibleEnemy: 0,
      fogged: 0,
      knownEnemyArmies: 0,
      visibleMissing: [],
      ownedTerritories: []
    };
    for (const territoryId of bonus.territories) {
      const territory = byId.get(territoryId);
      if (owned.has(territoryId)) {
        stats.mine += 1;
        stats.ownedTerritories.push(territoryId);
      } else if (!territory?.visible) {
        stats.fogged += 1;
      } else if (territory.owner === state.opponentId) {
        stats.visibleEnemy += 1;
        stats.knownEnemyArmies += positiveInt(territory.armies);
        stats.visibleMissing.push(territoryId);
      } else {
        stats.visibleNeutral += 1;
        stats.visibleMissing.push(territoryId);
      }
    }
    bonusStats.set(bonus.id, stats);
  }

  return {
    observation,
    model,
    byId,
    mine,
    owned,
    virtualArmies,
    deploymentsById,
    plannedTargets,
    bonusStats,
    income: positiveInt(observation.income?.total),
    completedBonuses: new Set(observation.income?.completedBonuses ?? [])
  };
}

function planDeployments(context) {
  for (let army = 0; army < context.income; army += 1) {
    const target = chooseDeploymentTarget(context, context.income - army);
    if (!target) break;
    context.virtualArmies.set(target.id, (context.virtualArmies.get(target.id) ?? positiveInt(target.armies)) + 1);
    context.deploymentsById.set(target.id, (context.deploymentsById.get(target.id) ?? 0) + 1);
  }
  return [...context.deploymentsById.entries()].map(([territoryId, armies]) => ({ territoryId, armies }));
}

function chooseDeploymentTarget(context, remainingIncome) {
  let best = null;
  for (const territory of context.mine) {
    const score = deploymentScore(territory, context, remainingIncome);
    if (!best || score > best.score) best = { territory, score };
  }
  return best?.territory ?? context.mine[0];
}

function deploymentScore(territory, context, remainingIncome) {
  const currentArmies = context.virtualArmies.get(territory.id) ?? positiveInt(territory.armies);
  const movable = Math.max(0, currentArmies - 1);
  const defense = defenseNeed(territory, context, currentArmies);
  if (defense.need > 0) return 900 + defense.value * 10 - currentArmies;

  const targets = orderedTargetsForSource(territory, context);
  const bestNeeded = targets
    .map((target) => {
      const required = requiredAttackers(target.armies);
      const need = Math.max(0, required - movable);
      return {
        target,
        need,
        value: targetValue(territory, target, context)
      };
    })
    .filter((entry) => entry.need > 0 && entry.need <= remainingIncome + 1 && entry.value > 0)
    .sort((a, b) => (b.value / b.need) - (a.value / a.need))[0];

  if (bestNeeded) {
    return 450 + bestNeeded.value * 3 - bestNeeded.need * 12 - currentArmies * 0.2;
  }

  const bestReady = targets[0];
  if (bestReady) {
    return 110 + targetValue(territory, bestReady, context) * 0.7 - currentArmies * 0.55;
  }

  const distance = distanceToNearestFront(territory, context);
  return 12 - distance * 2 - currentArmies * 0.8;
}

function defenseNeed(territory, context, defenders) {
  const enemyNeighbors = territory.neighbors
    .map((id) => context.byId.get(id))
    .filter((neighbor) => neighbor?.visible && neighbor.owner === state.opponentId && neighbor.armies !== null);

  if (!enemyNeighbors.length) return { need: 0, value: 0 };

  let needed = 0;
  const maxAttackers = Math.max(...enemyNeighbors.map((enemy) => Math.max(0, positiveInt(enemy.armies) - 1)));
  while (canCapture(maxAttackers, defenders + needed) && needed < 50) needed += 1;

  const bonusStats = context.bonusStats.get(territory.bonusId);
  const completed = context.completedBonuses.has(territory.bonusId);
  const nearComplete = bonusStats && bonusStats.bonus.value > 0 && bonusStats.mine >= bonusStats.bonus.territories.length - 1;
  const value = (
    (completed ? 16 : 0)
    + (nearComplete ? 10 : 0)
    + (bonusStats?.bonus.value ?? 0)
    + enemyNeighbors.reduce((total, enemy) => total + positiveInt(enemy.armies), 0) * 0.4
  );
  return { need: needed, value };
}

function planAttacks(context) {
  const orders = [];
  const sources = [...context.mine].sort((a, b) => sourcePressure(b, context) - sourcePressure(a, context));

  for (const source of sources) {
    let movable = Math.max(0, (context.virtualArmies.get(source.id) ?? positiveInt(source.armies)) - 1);
    if (movable <= 0) continue;

    while (movable > 0) {
      const targets = orderedTargetsForSource(source, context)
        .filter((target) => !context.plannedTargets.has(target.id));
      const capture = targets.find((target) => requiredAttackers(target.armies) <= movable && targetValue(source, target, context) > 0);
      if (!capture) break;

      const required = requiredAttackers(capture.armies);
      orders.push({ from: source.id, to: capture.id, armies: required, mode: "attackTransfer" });
      context.plannedTargets.add(capture.id);
      movable -= required;
    }

    if (movable > 0) {
      const pressure = orderedTargetsForSource(source, context)
        .filter((target) => target.owner === state.opponentId)
        .filter((target) => pressureAttackWorthwhile(source, target, movable, context))[0];
      if (pressure) {
        orders.push({ from: source.id, to: pressure.id, armies: movable, mode: "attackTransfer" });
        movable = 0;
      }
    }

    context.virtualArmies.set(source.id, movable + 1);
  }

  return orders;
}

function orderedTargetsForSource(source, context) {
  return source.neighbors
    .map((id) => context.byId.get(id))
    .filter((target) => target?.visible && !context.owned.has(target.id) && target.armies !== null)
    .sort((a, b) => {
      const valueDiff = targetValue(source, b, context) - targetValue(source, a, context);
      if (Math.abs(valueDiff) > 0.001) return valueDiff;
      return requiredAttackers(a.armies) - requiredAttackers(b.armies);
    });
}

function targetValue(source, target, context) {
  const bonusStats = context.bonusStats.get(target.bonusId);
  const bonus = bonusStats?.bonus ?? context.model.bonuses.get(target.bonusId);
  const defenders = positiveInt(target.armies);
  const missingAfter = bonus ? Math.max(0, bonus.territories.length - (bonusStats?.mine ?? 0) - 1) : 99;
  const sameBonus = source.bonusId === target.bonusId;
  const ownedPresence = bonusStats?.mine ?? 0;
  const enemy = target.owner === state.opponentId;
  const neutral = target.owner === null;
  const wasteland = neutral && defenders >= 10;
  const completes = bonus?.value > 0 && missingAfter === 0 && (bonusStats?.fogged ?? 0) === 0;
  const nearlyCompletes = bonus?.value > 0 && missingAfter === 1 && (bonusStats?.fogged ?? 0) === 0;
  const breaksLikelyBonus = enemy && bonus?.value > 0 && (bonusStats?.visibleEnemy ?? 0) >= Math.max(2, bonus.territories.length - 2);
  const expansionExits = target.neighbors.filter((id) => !context.owned.has(id)).length;
  const required = requiredAttackers(defenders);
  const dominant = context.income >= 24 || context.mine.length >= 35;

  return (
    9
    + (enemy ? 30 : 0)
    + (enemy && dominant ? 32 + Math.min(45, context.income) * 0.65 : 0)
    + (neutral ? 4 : 0)
    + (sameBonus ? 23 : 0)
    + ownedPresence * 4
    + (bonus?.value ?? 0) * (sameBonus ? 7.5 : 3.2)
    + (completes ? 110 + (bonus?.value ?? 0) * 22 : 0)
    + (nearlyCompletes ? 48 + (bonus?.value ?? 0) * 11 : 0)
    + (breaksLikelyBonus ? 70 + (bonus?.value ?? 0) * 14 : 0)
    + Math.min(6, expansionExits) * 1.3
    - defenders * (enemy ? 1.15 : 1.9)
    - required * 2.8
    - (wasteland ? 48 : 0)
    - ((bonusStats?.fogged ?? 0) > 0 && sameBonus ? 10 : 0)
  );
}

function pressureAttackWorthwhile(source, target, movable, context) {
  if (movable <= 1) return false;
  const value = targetValue(source, target, context);
  const killedDefenders = Math.min(positiveInt(target.armies), straightRound(movable * 0.6));
  const killedAttackers = Math.min(movable, straightRound(positiveInt(target.armies) * 0.7));
  if (target.owner === state.opponentId && (context.income >= 24 || context.mine.length >= 35)) {
    return value > 18 && killedDefenders > 0;
  }
  return value > 45 && killedDefenders >= killedAttackers;
}

function sourcePressure(source, context) {
  const targets = orderedTargetsForSource(source, context);
  if (!targets.length) return -distanceToNearestFront(source, context);
  const movable = Math.max(0, (context.virtualArmies.get(source.id) ?? positiveInt(source.armies)) - 1);
  return targets.slice(0, 3).reduce((total, target) => total + Math.max(0, targetValue(source, target, context)), 0)
    + movable * 0.8;
}

function moveInteriorArmies(context, orders) {
  const distances = distancesToFront(context);
  const transferSources = [...context.mine]
    .filter((territory) => !hasOutgoingOrder(orders, territory.id))
    .sort((a, b) => (distances.get(b.id) ?? 0) - (distances.get(a.id) ?? 0));

  for (const source of transferSources) {
    const distance = distances.get(source.id) ?? 0;
    if (distance <= 0) continue;
    const movable = Math.max(0, (context.virtualArmies.get(source.id) ?? positiveInt(source.armies)) - 1);
    if (movable <= 0) continue;

    const target = source.neighbors
      .map((id) => context.byId.get(id))
      .filter((neighbor) => neighbor && context.owned.has(neighbor.id) && (distances.get(neighbor.id) ?? Infinity) < distance)
      .sort((a, b) => {
        const distanceDiff = (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity);
        if (distanceDiff !== 0) return distanceDiff;
        return sourcePressure(b, context) - sourcePressure(a, context);
      })[0];

    if (!target) continue;
    orders.push({ from: source.id, to: target.id, armies: movable, mode: "transferOnly" });
    context.virtualArmies.set(source.id, 1);
  }
}

function distancesToFront(context) {
  const distances = new Map();
  const queue = [];
  for (const territory of context.mine) {
    if (orderedTargetsForSource(territory, context).length || visibleEnemyNeighbor(territory, context)) {
      distances.set(territory.id, 0);
      queue.push(territory);
    }
  }

  if (!queue.length) {
    for (const territory of context.mine) distances.set(territory.id, 0);
    return distances;
  }

  for (let index = 0; index < queue.length; index += 1) {
    const territory = queue[index];
    const nextDistance = (distances.get(territory.id) ?? 0) + 1;
    for (const neighborId of territory.neighbors) {
      if (!context.owned.has(neighborId) || distances.has(neighborId)) continue;
      const neighbor = context.byId.get(neighborId);
      if (!neighbor) continue;
      distances.set(neighborId, nextDistance);
      queue.push(neighbor);
    }
  }
  return distances;
}

function distanceToNearestFront(territory, context) {
  const distances = distancesToFront(context);
  return distances.get(territory.id) ?? 99;
}

function visibleEnemyNeighbor(territory, context) {
  return territory.neighbors.some((id) => context.byId.get(id)?.owner === state.opponentId);
}

function hasOutgoingOrder(orders, territoryId) {
  return orders.some((order) => order.from === territoryId);
}

function buildModel(map) {
  const territories = new Map(map.territories.map((territory) => [territory.id, territory]));
  const bonuses = new Map(map.bonuses.map((bonus) => [bonus.id, bonus]));
  const bonusShape = new Map();

  for (const bonus of bonuses.values()) {
    let borderTerritories = 0;
    let externalEdges = 0;
    for (const territoryId of bonus.territories) {
      const territory = territories.get(territoryId);
      const outside = (territory?.neighbors ?? []).filter((neighborId) => territories.get(neighborId)?.bonusId !== bonus.id).length;
      if (outside > 0) borderTerritories += 1;
      externalEdges += outside;
    }
    bonusShape.set(bonus.id, { borderTerritories, externalEdges });
  }

  return { territories, bonuses, bonusShape };
}

function requiredAttackers(defenders) {
  const defendingArmies = positiveInt(defenders);
  for (let attackers = 1; attackers <= 250; attackers += 1) {
    const killedDefenders = straightRound(attackers * 0.6);
    const killedAttackers = straightRound(defendingArmies * 0.7);
    if (killedDefenders >= defendingArmies && attackers > killedAttackers) return attackers;
  }
  return Math.ceil(defendingArmies / 0.6) + 1;
}

function canCapture(attackers, defenders) {
  if (attackers <= 0 || defenders <= 0) return false;
  const killedDefenders = Math.min(defenders, straightRound(attackers * 0.6));
  const killedAttackers = Math.min(attackers, straightRound(defenders * 0.7));
  return killedDefenders >= defenders && attackers - killedAttackers > 0;
}

function straightRound(value) {
  return Math.floor(value + 0.5);
}

function positiveInt(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function unique(values) {
  return [...new Set(values)];
}

function stableNoise(seed, scale) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * scale;
}

function reply(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
