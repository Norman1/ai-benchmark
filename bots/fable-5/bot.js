// Fable 5 — Warzone-style 1v1 bot.
// v7: preemptive siege strikes, economy-dead hunt trigger, enemy bonus denial,
// all pre-contact income into expansion.
import readline from "node:readline";

const VERSION = "v9";
const ENABLE_FORTRESS = false;
const ENABLE_ASSAULT = true;

const state = {
  playerId: null,
  enemyId: null,
  turn: 0,
  map: null,
  distribution: new Set(),
  wastelands: new Set(),
  intel: new Map() // id -> { owner, armies, turn }
};

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  try {
    if (message.type === "pick") {
      reply({ picks: handlePick(message) });
    } else if (message.type === "turn") {
      reply({ orders: handleTurn(message) });
    }
  } catch (error) {
    process.stderr.write(`fable-5 ${VERSION} error: ${error.stack}\n`);
    if (message.type === "pick") reply({ picks: message.availablePicks?.slice(0, message.requiredPicks ?? 6) ?? [] });
    else if (message.type === "turn") reply({ orders: { deployments: [], orders: [] } });
  }
});

function reply(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

// ---------------------------------------------------------------------------
// Combat math (0% luck, straight round, 60% offense / 70% defense)

function straightRound(value) {
  return Math.floor(value + 0.5);
}

function attackersNeeded(defenders) {
  const d = Math.max(0, Math.floor(defenders));
  if (d <= 0) return 1;
  const toKillAll = Math.ceil((d - 0.5) / 0.6);
  const toSurvive = straightRound(d * 0.7) + 1;
  return Math.max(toKillAll, toSurvive);
}

function defendersNeeded(attackers) {
  const a = Math.max(0, Math.floor(attackers));
  return straightRound(a * 0.6) + 1;
}

// ---------------------------------------------------------------------------
// Map + intel

function buildMap(mapData) {
  const byId = new Map();
  const adjacency = new Map();
  for (const territory of mapData.territories) {
    byId.set(territory.id, territory);
    adjacency.set(territory.id, territory.neighbors ?? []);
  }
  const bonuses = (mapData.bonuses ?? []).filter((bonus) => (bonus.value ?? 0) > 0);
  state.map = {
    byId,
    adjacency,
    bonuses,
    bonusById: new Map(bonuses.map((bonus) => [bonus.id, bonus])),
    territoryIds: mapData.territories.map((territory) => territory.id)
  };
}

function initIntel() {
  for (const id of state.map.territoryIds) {
    let armies = 2;
    if (state.wastelands.has(id)) armies = 10;
    else if (state.distribution.has(id)) armies = 4;
    state.intel.set(id, { owner: null, armies, turn: 0 });
  }
}

function updateIntel(observation) {
  for (const territory of observation.territories) {
    if (territory.visible) {
      state.intel.set(territory.id, { owner: territory.owner, armies: territory.armies, turn: observation.turn });
    } else {
      const known = state.intel.get(territory.id);
      if (known && known.owner === state.playerId) {
        state.intel.set(territory.id, { owner: state.enemyId, armies: null, turn: observation.turn });
      }
    }
  }
}

function believedArmies(id) {
  const known = state.intel.get(id);
  if (!known || known.armies === null) {
    if (state.wastelands.has(id)) return 10;
    if (state.distribution.has(id)) return 4;
    return 2;
  }
  return known.armies;
}

function believedOwner(id) {
  return state.intel.get(id)?.owner ?? null;
}

// ---------------------------------------------------------------------------
// Picking

function handlePick(message) {
  state.playerId = message.playerId;
  state.enemyId = 1 - message.playerId;
  buildMap(message.map);
  state.distribution = new Set(message.distribution);
  state.wastelands = new Set(message.wastelands);
  initIntel();

  const scored = message.availablePicks.map((id) => ({ id, score: scorePick(id) }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, message.requiredPicks ?? 6).map((pick) => pick.id);
}

function scorePick(id) {
  const territory = state.map.byId.get(id);
  const bonus = state.map.bonusById.get(territory.bonusId);
  if (!bonus) return -100;

  const cost = bonusCompletionCost(bonus, new Set([id]));
  const exposure = bonusExternalNeighbors(bonus).length;
  const hasWasteland = bonus.territories.some((tid) => state.wastelands.has(tid));

  const neighborScores = [];
  for (const other of state.map.bonuses) {
    if (other.id === bonus.id) continue;
    if (!bonusesTouch(bonus, other)) continue;
    const otherCost = bonusCompletionCost(other, new Set());
    neighborScores.push((other.value * 10) / (otherCost + 4));
  }
  neighborScores.sort((a, b) => b - a);
  const nearby = (neighborScores[0] ?? 0) + (neighborScores[1] ?? 0) * 0.5;

  return (bonus.value * 16) / (cost + 4)
    + bonus.value * 0.8
    + nearby * 2.2
    - exposure * 0.4
    - (hasWasteland ? 5 : 0);
}

function bonusCompletionCost(bonus, ownedSet) {
  let cost = 0;
  for (const tid of bonus.territories) {
    if (ownedSet.has(tid)) continue;
    cost += attackersNeeded(believedArmies(tid));
  }
  return cost;
}

function bonusExternalNeighbors(bonus) {
  const inside = new Set(bonus.territories);
  const outside = new Set();
  for (const tid of bonus.territories) {
    for (const neighbor of state.map.adjacency.get(tid) ?? []) {
      if (!inside.has(neighbor)) outside.add(neighbor);
    }
  }
  return [...outside];
}

function bonusesTouch(a, b) {
  const inB = new Set(b.territories);
  for (const tid of a.territories) {
    for (const neighbor of state.map.adjacency.get(tid) ?? []) {
      if (inB.has(neighbor)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Turn planning

function handleTurn(message) {
  const observation = message.observation;
  state.playerId = observation.playerId;
  state.enemyId = 1 - observation.playerId;
  state.turn = observation.turn;
  if (!state.map) {
    buildMap({ territories: observation.territories, bonuses: observation.map?.bonuses ?? [] });
    initIntel();
  }
  updateIntel(observation);
  return planTurn(observation);
}

function planTurn(observation) {
  const obsById = new Map(observation.territories.map((territory) => [territory.id, territory]));
  const mine = observation.territories.filter((territory) => territory.mine);
  const mineSet = new Set(mine.map((territory) => territory.id));
  if (!mine.length) return { deployments: [], orders: [] };

  const income = Math.max(0, Math.floor(observation.income?.total ?? 0));
  const enemyIncomeEst = estimateEnemyIncome();
  const incomeLead = income - enemyIncomeEst;
  const knownEnemyIds = [...state.intel.entries()]
    .filter(([, info]) => info.owner === state.enemyId)
    .map(([id]) => id);
  const enemyDistance = knownEnemyIds.length ? bfsTowardTargets(new Set(knownEnemyIds)) : new Map();
  const myTotalArmies = mine.reduce((sum, territory) => sum + territory.armies, 0);
  const knownEnemyArmies = knownEnemyIds.reduce((sum, id) => sum + believedArmies(id), 0);
  const huntMode = knownEnemyIds.length > 0
    && ((state.turn >= 10 && income >= enemyIncomeEst * 1.3)
      || (state.turn >= 25 && enemyIncomeEst <= 9 && income >= 15)
      || (state.turn >= 15 && myTotalArmies >= 2.5 * (knownEnemyArmies + enemyIncomeEst * 4)));
  // Far behind on income: dig in, expand only where it is safe, and make every
  // enemy assault overpay. A draw beats a loss; attrition can reopen the game.
  const fortressMode = ENABLE_FORTRESS && !huntMode && state.turn >= 8 && enemyIncomeEst - income >= 10;

  const virtual = new Map(mine.map((territory) => [territory.id, territory.armies]));
  const reserve = new Map(mine.map((territory) => [territory.id, 1]));
  const deployments = new Map();
  let budget = income;

  const deploy = (id, amount) => {
    const spend = Math.min(amount, budget);
    if (spend <= 0) return 0;
    budget -= spend;
    deployments.set(id, (deployments.get(id) ?? 0) + spend);
    virtual.set(id, (virtual.get(id) ?? 0) + spend);
    return spend;
  };
  const spare = (id) => Math.max(0, (virtual.get(id) ?? 0) - (reserve.get(id) ?? 1));
  const commit = (id, amount) => {
    virtual.set(id, (virtual.get(id) ?? 0) - amount);
  };

  const enemyAttackOrders = [];
  const neutralAttackOrders = [];
  const transferOrders = [];

  // --- Contact analysis.
  const enemyAdjacent = new Map();
  for (const territory of mine) {
    let power = 0;
    for (const neighborId of territory.neighbors) {
      const neighbor = obsById.get(neighborId);
      if (neighbor?.visible && neighbor.owner === state.enemyId) power += Math.max(0, neighbor.armies - 1);
    }
    if (power > 0) enemyAdjacent.set(territory.id, power);
  }
  const myCompletedBonusTerritories = completedBonusTerritories(observation, mineSet);

  // --- 1. Garrisons: 2 armies on the *border* of bonus land near the enemy
  //     turn 2-army nibbles into failed attacks. Interior land cannot be hit
  //     directly and stays at 1 so the armies keep working.
  if (knownEnemyIds.length && !huntMode) {
    for (const territory of mine) {
      const distance = enemyDistance.get(territory.id) ?? Infinity;
      if (distance > 2) continue;
      if (!myCompletedBonusTerritories.has(territory.id)) continue;
      if (!territory.neighbors.some((id) => !mineSet.has(id))) continue;
      reserve.set(territory.id, Math.max(reserve.get(territory.id) ?? 1, 2));
      if ((virtual.get(territory.id) ?? 0) < 2) deploy(territory.id, 2 - (virtual.get(territory.id) ?? 0));
    }
  }

  // --- 2. Expansion: complete the most efficient bonuses first.
  const plans = scoreExpansionBonuses(observation, mineSet, obsById);
  const claimed = new Set();

  // Denial: a neutral hole in a bonus the enemy nearly completed is worth far
  // more than its capture cost - it stalls their income compounding.
  for (const bonus of state.map.bonuses) {
    if (bonus.value < 3) continue;
    const enemyOwned = bonus.territories.filter((tid) => believedOwner(tid) === state.enemyId).length;
    if (enemyOwned < bonus.territories.length - 2 || enemyOwned < 2) continue;
    for (const tid of bonus.territories) {
      if (claimed.has(tid)) continue;
      const observed = obsById.get(tid);
      if (!observed?.visible || observed.owner !== null) continue;
      const adjacentMine = observed.neighbors.filter((id) => mineSet.has(id));
      if (!adjacentMine.length) continue;
      const sources = adjacentMine
        .map((id) => ({ id, spare: spare(id) }))
        .filter((source) => source.spare > 0)
        .sort((a, b) => b.spare - a.spare);
      const split = planCapture(observed.armies, sources, budget);
      if (!split) continue;
      for (const part of split.parts) {
        if (part.deploy > 0) deploy(part.id, part.deploy);
        neutralAttackOrders.push({ from: part.id, to: tid, armies: part.armies, mode: "attackTransfer", key: bonus.value * 4 });
        commit(part.id, part.armies);
      }
      claimed.add(tid);
    }
  }
  const unfunded = [];
  // The best plan that cannot be funded reserves its deficit from the budget;
  // lower plans may only spend the excess. Income concentrates without
  // starving cheap captures elsewhere.
  let reservedBudget = 0;
  for (const plan of plans) {
    if (huntMode && plan.score < 6) break;
    for (const target of plan.targets) {
      if (claimed.has(target.id)) continue;
      const sources = target.adjacentMine
        .map((id) => ({ id, spare: spare(id) }))
        .filter((source) => source.spare > 0)
        .sort((a, b) => b.spare - a.spare);
      if (fortressMode && plan.enemyTouches) continue;
      const split = planCapture(target.armies, sources, Math.max(0, budget - reservedBudget));
      if (!split) {
        unfunded.push({ target, plan });
        if (reservedBudget === 0) {
          const need = attackersNeeded(target.armies);
          const bestSpare = sources[0]?.spare ?? 0;
          reservedBudget = Math.min(budget, Math.max(0, need - bestSpare));
        }
        continue;
      }
      for (const part of split.parts) {
        if (part.deploy > 0) deploy(part.id, part.deploy);
        neutralAttackOrders.push({ from: part.id, to: target.id, armies: part.armies, mode: "attackTransfer", key: plan.score });
        commit(part.id, part.armies);
      }
      claimed.add(target.id);
    }
  }

  // --- 3. Enemy jobs: retake holes, break bonuses, raid, delete sieges.
  if (knownEnemyIds.length) {
    const enemyTargets = [];
    for (const territory of observation.territories) {
      if (!territory.visible || territory.owner !== state.enemyId) continue;
      const adjacentMine = territory.neighbors.filter((id) => mineSet.has(id));
      if (!adjacentMine.length) continue;
      enemyTargets.push({
        territory,
        adjacentMine,
        value: enemyTargetValue(territory, mineSet, myCompletedBonusTerritories, incomeLead)
      });
    }
    enemyTargets.sort((a, b) => b.value - a.value);
    for (const { territory, adjacentMine, value } of enemyTargets) {
      if (claimed.has(territory.id)) continue;
      if (value < (fortressMode ? 10 : 5) && !huntMode) continue;
      // Big stacks are where the enemy banks its income; assume a full top-up
      // there. Thin frontier territories rarely get more than a trickle.
      let deployGuess;
      if (territory.armies >= 8) deployGuess = 1.0;
      else if (territory.armies >= 5) deployGuess = 0.5;
      else if (territory.armies >= 3) deployGuess = 0.25;
      else deployGuess = 0.12;
      if (huntMode) deployGuess /= 2;
      const assumedDefense = territory.armies + Math.round(enemyIncomeEst * deployGuess);
      const need = attackersNeeded(assumedDefense);
      const sources = adjacentMine.map((id) => ({ id, spare: spare(id) })).sort((a, b) => b.spare - a.spare);
      const source = sources[0];
      if (!source) continue;
      let force = source.spare;
      if (force < need && budget > 0 && value >= 8) {
        const extra = Math.min(need - force, budget);
        if (force + extra >= need) {
          deploy(source.id, extra);
          force += extra;
        }
      }
      if (force >= need) {
        const isSiege = territory.armies >= 8;
        const send = huntMode || isSiege ? force : Math.min(force, need + 2);
        enemyAttackOrders.push({ from: source.id, to: territory.id, armies: send, mode: "attackTransfer" });
        commit(source.id, send);
        claimed.add(territory.id);
      } else if (ENABLE_ASSAULT && (huntMode || incomeLead >= 4) && value >= 8 && sources.length >= 2) {
        // Combined-arms assault: several stacks gang up on a target none of
        // them could take alone. Lead hits soften, the last one captures.
        const parts = planAssault(assumedDefense, sources);
        if (parts) {
          for (const part of parts) {
            enemyAttackOrders.push({ from: part.id, to: territory.id, armies: part.armies, mode: "attackOnly" });
            commit(part.id, part.armies);
          }
          claimed.add(territory.id);
        }
      }
    }
  }

  // --- 4. Walls: only completed-bonus borders, and only if they can hold.
  if (enemyAdjacent.size > 0 && !huntMode) {
    const walls = [...enemyAdjacent.entries()]
      .map(([id, power]) => {
        const territory = obsById.get(id);
        const bonus = state.map.bonusById.get(territory?.bonusId);
        const protectedValue = myCompletedBonusTerritories.has(id) ? (bonus?.value ?? 0) : 0;
        return { id, power, protectedValue };
      })
      .filter((wall) => wall.protectedValue > 0)
      .sort((a, b) => b.protectedValue - a.protectedValue);
    for (const wall of walls) {
      const calibrated = attackersNeeded(obsById.get(wall.id)?.armies ?? 0) + Math.round(enemyIncomeEst * 0.3);
      const worstCase = wall.power + Math.round(enemyIncomeEst * 0.6);
      const predicted = Math.min(calibrated, worstCase);
      const needHold = defendersNeeded(predicted);
      const current = virtual.get(wall.id) ?? 0;
      const deficit = needHold - current;
      if (deficit > Math.floor(budget * (fortressMode ? 1 : 0.6))) continue; // cannot realistically hold: stay mobile
      if (deficit > 0) deploy(wall.id, deficit);
      reserve.set(wall.id, Math.max(reserve.get(wall.id) ?? 1, Math.min(virtual.get(wall.id) ?? 1, needHold)));
    }
  }

  // --- 5. Remaining budget: place it where it buys income fastest - saving up
  //     for the best local plan or pushing toward a better remote bonus.
  const remoteObjectiveIds = [];
  if (budget > 0 && !huntMode) {
    const saveTarget = unfunded[0] ?? null;
    const remote = remoteBonusStep(mineSet, claimed);
    const saveScore = saveTarget ? saveTarget.plan.score : -1;
    const remoteScore = remote ? remote.score : -1;
    if (remote && remoteScore > saveScore) {
      const sources = (state.map.adjacency.get(remote.step) ?? [])
        .filter((id) => mineSet.has(id))
        .map((id) => ({ id, spare: spare(id) }))
        .sort((a, b) => b.spare - a.spare);
      if (sources.length) {
        remoteObjectiveIds.push(sources[0].id);
        const split = planCapture(believedArmies(remote.step), sources, budget);
        if (split) {
          for (const part of split.parts) {
            if (part.deploy > 0) deploy(part.id, part.deploy);
            neutralAttackOrders.push({ from: part.id, to: remote.step, armies: part.armies, mode: "attackTransfer", key: 1 });
            commit(part.id, part.armies);
          }
          claimed.add(remote.step);
        } else {
          deploy(sources[0].id, enemyAdjacent.size === 0 ? budget : Math.ceil(budget * 0.7));
        }
      }
    } else if (saveTarget) {
      const sourceId = saveTarget.target.adjacentMine
        .map((id) => ({ id, spare: spare(id) }))
        .sort((a, b) => b.spare - a.spare)[0]?.id;
      if (sourceId) {
        const share = enemyAdjacent.size === 0 ? budget : Math.ceil(budget * 0.7);
        deploy(sourceId, share);
        remoteObjectiveIds.push(sourceId);
      }
    }
  }

  if (budget > 0) {
    const frontline = [...mine].sort((a, b) => {
      const contactA = enemyAdjacent.has(a.id) ? 0 : 1;
      const contactB = enemyAdjacent.has(b.id) ? 0 : 1;
      if (contactA !== contactB) return contactA - contactB;
      const distA = enemyDistance.get(a.id) ?? Infinity;
      const distB = enemyDistance.get(b.id) ?? Infinity;
      if (distA !== distB) return distA - distB;
      return (virtual.get(b.id) ?? 0) - (virtual.get(a.id) ?? 0);
    })[0];
    deploy((frontline ?? mine[0]).id, budget);
  }

  // --- 6. Transfers: armies flow toward expansion, then toward the enemy.
  const objectives = new Set();
  if (!huntMode) {
    for (const { target } of unfunded) {
      for (const id of target.adjacentMine) objectives.add(id);
    }
    for (const plan of plans) {
      for (const target of plan.targets) {
        if (!claimed.has(target.id)) {
          for (const id of target.adjacentMine) objectives.add(id);
        }
      }
    }
  }
  for (const id of remoteObjectiveIds) objectives.add(id);
  for (const id of enemyAdjacent.keys()) objectives.add(id);
  if (!objectives.size) {
    if (knownEnemyIds.length) {
      let bestDistance = Infinity;
      for (const territory of mine) {
        const distance = enemyDistance.get(territory.id);
        if (distance !== undefined && distance < bestDistance) bestDistance = distance;
      }
      for (const territory of mine) {
        if ((enemyDistance.get(territory.id) ?? Infinity) === bestDistance) objectives.add(territory.id);
      }
    } else {
      for (const territory of mine) {
        if (territory.neighbors.some((nid) => !mineSet.has(nid))) objectives.add(territory.id);
      }
    }
  }
  const distances = bfsDistances(objectives, mineSet);
  for (const territory of mine) {
    const distance = distances.get(territory.id);
    if (distance === undefined || distance <= 0) continue;
    const movable = spare(territory.id);
    if (movable <= 0) continue;
    const next = territory.neighbors
      .filter((id) => mineSet.has(id) && (distances.get(id) ?? Infinity) < distance)
      .sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity))[0];
    if (!next) continue;
    transferOrders.push({ from: territory.id, to: next, armies: movable, mode: "transferOnly" });
    commit(territory.id, movable);
  }

  // --- 7. March: if totally idle, open a path toward the enemy.
  if (!neutralAttackOrders.length && !enemyAttackOrders.length && !enemyAdjacent.size && knownEnemyIds.length) {
    const step = nextStepTowardEnemy(mineSet, knownEnemyIds);
    if (step) {
      const sources = (state.map.adjacency.get(step) ?? [])
        .filter((id) => mineSet.has(id))
        .map((id) => ({ id, spare: spare(id) }))
        .sort((a, b) => b.spare - a.spare);
      const split = planCapture(believedArmies(step), sources, budget);
      if (split) {
        for (const part of split.parts) {
          if (part.deploy > 0) deploy(part.id, part.deploy);
          neutralAttackOrders.push({ from: part.id, to: step, armies: part.armies, mode: "attackTransfer", key: 0 });
          commit(part.id, part.armies);
        }
      }
    }
  }

  neutralAttackOrders.sort((a, b) => b.key - a.key);
  const orders = [
    ...enemyAttackOrders,
    ...neutralAttackOrders.map(({ key, ...order }) => order),
    ...transferOrders
  ];
  return {
    deployments: [...deployments.entries()].map(([territoryId, armies]) => ({ territoryId, armies })),
    orders
  };
}

// Multi-source attack on a defended target; returns parts or null. The lead
// hits soften the defense, the final part must capture on its own math, and
// the whole plan must not be a pyrrhic trade.
function planAssault(defenders, sources) {
  let remaining = defenders;
  let lost = 0;
  const parts = [];
  for (const source of sources.slice(0, 4)) {
    if (remaining <= 0) break;
    const finish = attackersNeeded(remaining);
    if (source.spare >= finish) {
      lost += straightRound(remaining * 0.7);
      parts.push({ id: source.id, armies: finish });
      remaining = 0;
      break;
    }
    if (source.spare < 3) continue;
    const kills = straightRound(source.spare * 0.6);
    if (kills <= 0) continue;
    lost += Math.min(source.spare, straightRound(remaining * 0.7));
    parts.push({ id: source.id, armies: source.spare });
    remaining -= kills;
  }
  if (remaining > 0) return null;
  if (lost > defenders * 1.25 + 2) return null;
  return parts;
}

function planCapture(defenders, sources, budget) {
  if (!sources.length) return null;
  const single = sources[0];
  const need = attackersNeeded(defenders);
  if (single.spare >= need) {
    return { parts: [{ id: single.id, armies: need, deploy: 0 }] };
  }
  if (single.spare + budget >= need) {
    return { parts: [{ id: single.id, armies: need, deploy: need - single.spare }] };
  }
  let remaining = defenders;
  const parts = [];
  for (const source of sources.slice(0, 3)) {
    if (remaining <= 0) break;
    const finishNeed = attackersNeeded(remaining);
    if (source.spare >= finishNeed) {
      parts.push({ id: source.id, armies: finishNeed, deploy: 0 });
      remaining = 0;
      break;
    }
    if (source.spare < 2) continue;
    const kills = straightRound(source.spare * 0.6);
    if (kills <= 0) continue;
    parts.push({ id: source.id, armies: source.spare, deploy: 0 });
    remaining -= kills;
  }
  if (remaining > 0) return null;
  return { parts };
}

function completedBonusTerritories(observation, mineSet) {
  const result = new Set();
  for (const bonusId of observation.income?.completedBonuses ?? []) {
    const bonus = state.map.bonusById.get(bonusId);
    if (!bonus) continue;
    for (const tid of bonus.territories) {
      if (mineSet.has(tid)) result.add(tid);
    }
  }
  return result;
}

// Evidence-based: credit bonuses by the fraction we know the enemy holds,
// plus an early ramp. Never mirror our own income.
function estimateEnemyIncome() {
  let estimate = 5;
  for (const bonus of state.map.bonuses) {
    let enemyKnown = 0;
    let mineOrNeutralKnown = 0;
    for (const tid of bonus.territories) {
      const info = state.intel.get(tid);
      if (info?.owner === state.enemyId) enemyKnown += 1;
      else if (info?.owner === state.playerId || (info?.owner === null && info.turn > 0)) mineOrNeutralKnown += 1;
    }
    if (enemyKnown === 0) continue;
    if (mineOrNeutralKnown > 0 && enemyKnown < bonus.territories.length) {
      estimate += (bonus.value * enemyKnown) / bonus.territories.length / 2;
      continue;
    }
    estimate += (bonus.value * enemyKnown) / bonus.territories.length;
  }
  const ramp = Math.min(5 + state.turn * 1.4, 28);
  return Math.max(estimate, Math.min(ramp, estimate + 6));
}

function scoreExpansionBonuses(observation, mineSet, obsById) {
  const plans = [];
  for (const bonus of state.map.bonuses) {
    const missing = bonus.territories.filter((tid) => !mineSet.has(tid));
    if (!missing.length) continue;
    let cost = 0;
    let enemyInside = false;
    let enemyTouches = false;
    const targets = [];
    for (const tid of missing) {
      const owner = believedOwner(tid);
      if (owner === state.enemyId) {
        enemyInside = true;
        cost += attackersNeeded(believedArmies(tid) + 3);
        continue;
      }
      const armies = believedArmies(tid);
      cost += attackersNeeded(armies);
      const adjacentMine = (state.map.adjacency.get(tid) ?? []).filter((id) => mineSet.has(id));
      const observed = obsById.get(tid);
      if (adjacentMine.length && observed?.visible && observed.owner === null) {
        targets.push({ id: tid, armies: observed.armies, adjacentMine });
      }
      for (const nid of state.map.adjacency.get(tid) ?? []) {
        if (believedOwner(nid) === state.enemyId) enemyTouches = true;
      }
    }
    if (!targets.length) continue;
    let score = (bonus.value * 12) / (cost + 3);
    if (enemyInside) score *= 0.5;
    else if (enemyTouches) score *= 0.75;
    targets.sort((a, b) => attackersNeeded(a.armies) - attackersNeeded(b.armies));
    plans.push({ bonus, score, targets, enemyTouches: enemyTouches || enemyInside });
  }
  plans.sort((a, b) => b.score - a.score);
  return plans;
}

function enemyTargetValue(territory, mineSet, myCompletedBonusTerritories, incomeLead) {
  let value = 2;
  const bonus = state.map.bonusById.get(territory.bonusId);
  if (bonus) {
    if (bonus.territories.every((tid) => tid === territory.id || believedOwner(tid) === state.enemyId)) {
      value += bonus.value * 3; // breaks a completed enemy bonus
    }
    const mineInBonus = bonus.territories.filter((tid) => mineSet.has(tid)).length;
    if (mineInBonus > 0) value += 3 + mineInBonus;
    const otherwiseMine = bonus.territories.every((tid) => tid === territory.id || mineSet.has(tid));
    if (otherwiseMine) value += 6 + bonus.value * 4; // retake a hole in my bonus
  }
  if (territory.armies >= 8) {
    const threatened = (territory.neighbors ?? [])
      .filter((tid) => myCompletedBonusTerritories.has(tid))
      .map((tid) => state.map.bonusById.get(state.map.byId.get(tid)?.bonusId)?.value ?? 0);
    const threat = Math.max(0, ...threatened);
    if (incomeLead >= 4) value += territory.armies * (threat > 0 ? 0.8 : 0.3);
    else if (incomeLead >= 0 && threat >= 4) value += territory.armies * 0.5 + threat;
  }
  value -= territory.armies * 0.4;
  return value;
}

function bfsTowardTargets(targetSet) {
  const distances = new Map();
  const queue = [];
  for (const id of targetSet) {
    distances.set(id, 0);
    queue.push(id);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    const next = (distances.get(id) ?? 0) + 1;
    for (const neighborId of state.map.adjacency.get(id) ?? []) {
      if (distances.has(neighborId)) continue;
      distances.set(neighborId, next);
      queue.push(neighborId);
    }
  }
  return distances;
}

// Cheapest first step toward the most valuable bonus not adjacent to my land.
// Paths avoid enemy territory and wastelands.
function remoteBonusStep(mineSet, claimed) {
  const distance = new Map();
  const firstStep = new Map();
  const queue = [];
  for (const id of mineSet) {
    distance.set(id, 0);
    firstStep.set(id, null);
    queue.push(id);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    for (const neighborId of state.map.adjacency.get(id) ?? []) {
      if (distance.has(neighborId)) continue;
      if (believedOwner(neighborId) === state.enemyId) continue;
      if (state.wastelands.has(neighborId) && believedArmies(neighborId) >= 10) continue;
      distance.set(neighborId, (distance.get(id) ?? 0) + 1);
      firstStep.set(neighborId, mineSet.has(id) ? neighborId : firstStep.get(id));
      queue.push(neighborId);
    }
  }

  let best = null;
  for (const bonus of state.map.bonuses) {
    const missing = bonus.territories.filter((tid) => !mineSet.has(tid));
    if (!missing.length) continue;
    if (missing.some((tid) => believedOwner(tid) === state.enemyId)) continue;
    let cost = 0;
    for (const tid of missing) cost += attackersNeeded(believedArmies(tid));
    let entry = null;
    for (const tid of bonus.territories) {
      const d = distance.get(tid);
      if (d === undefined || d < 1) continue;
      if (!entry || d < entry.d) entry = { d, step: firstStep.get(tid) };
    }
    if (!entry || !entry.step || claimed.has(entry.step)) continue;
    if (entry.d <= 1) continue; // adjacent bonuses are handled by regular plans
    const score = (bonus.value * 12) / (cost + entry.d * 3 + 3);
    if (!best || score > best.score) best = { bonus, step: entry.step, score };
  }
  return best;
}

function nextStepTowardEnemy(mineSet, knownEnemyIds) {
  const enemyDistances = bfsTowardTargets(new Set(knownEnemyIds));
  let best = null;
  for (const id of mineSet) {
    for (const neighborId of state.map.adjacency.get(id) ?? []) {
      if (mineSet.has(neighborId)) continue;
      if (believedOwner(neighborId) === state.enemyId) continue;
      const distance = enemyDistances.get(neighborId);
      if (distance === undefined) continue;
      const cost = attackersNeeded(believedArmies(neighborId));
      const score = distance * 10 + cost;
      if (!best || score < best.score) best = { id: neighborId, score };
    }
  }
  return best?.id ?? null;
}

function bfsDistances(objectiveSet, mineSet) {
  const distances = new Map();
  const queue = [];
  for (const id of objectiveSet) {
    if (!mineSet.has(id)) continue;
    distances.set(id, 0);
    queue.push(id);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    const next = (distances.get(id) ?? 0) + 1;
    for (const neighborId of state.map.adjacency.get(id) ?? []) {
      if (!mineSet.has(neighborId) || distances.has(neighborId)) continue;
      distances.set(neighborId, next);
      queue.push(neighborId);
    }
  }
  return distances;
}
