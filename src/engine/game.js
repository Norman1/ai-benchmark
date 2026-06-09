import { MEDIUM_EARTH_MAP, getTerritory } from "./map.js";
import { SeededRandom, normalizeSeed } from "./random.js";
import { RULES, straightRound } from "./rules.js";

export function createDraft(seed = 1, map = MEDIUM_EARTH_MAP) {
  const rng = new SeededRandom(seed);
  const distribution = [];
  for (const bonusId of map.distributionBonusIds) {
    const bonus = map.bonuses.find((candidate) => candidate.id === bonusId);
    distribution.push(rng.pick(bonus.territories));
  }

  const allTerritories = map.territories.map((territory) => territory.id);
  const wastelands = [];
  const wastelandSet = new Set();
  while (wastelands.length < RULES.wastelandCount) {
    const territoryId = rng.pick(allTerritories);
    if (!wastelandSet.has(territoryId)) {
      wastelandSet.add(territoryId);
      wastelands.push(territoryId);
    }
  }

  const firstPicker = rng.int(2);
  const availablePicks = distribution.filter((territoryId) => !wastelandSet.has(territoryId));

  return {
    seed: normalizeSeed(seed),
    distribution,
    availablePicks,
    wastelands,
    firstPicker
  };
}

export function allocatePicks(draft, pickOrders, map = MEDIUM_EARTH_MAP) {
  const available = new Set(draft.availablePicks);
  const assigned = [[], []];
  const remaining = new Set(draft.availablePicks);
  const rng = new SeededRandom(`${draft.seed}:pick-fallback`);

  for (let round = 0; round < RULES.startsPerPlayer; round += 1) {
    const order = round % 2 === 0
      ? [draft.firstPicker, 1 - draft.firstPicker]
      : [1 - draft.firstPicker, draft.firstPicker];
    for (const playerId of order) {
      const choice = firstAvailablePick(pickOrders[playerId] ?? [], available, remaining);
      const territoryId = choice ?? rng.pick([...remaining]);
      if (!territoryId) throw new Error("Not enough distribution territories to allocate starts.");
      assigned[playerId].push(territoryId);
      remaining.delete(territoryId);
    }
  }

  return {
    starts: assigned,
    firstMovePlayer: 1 - draft.firstPicker,
    allocationOrder: buildAllocationOrder(draft.firstPicker)
  };
}

export class WarGame {
  constructor({ seed = 1, draft = createDraft(seed), pickOrders = [[], []], botNames = ["Player 1", "Player 2"], map = MEDIUM_EARTH_MAP } = {}) {
    this.map = map;
    this.seed = normalizeSeed(seed);
    this.draft = draft;
    this.botNames = botNames;
    this.allocation = allocatePicks(draft, pickOrders, map);
    this.turn = 1;
    this.finished = false;
    this.result = null;
    this.territories = {};
    this.conqueredThisTurn = [false, false];
    this.events = [];

    this.#initializeTerritories();
    this.replay = {
      version: 1,
      game: "war-app-ai-benchmark",
      rules: {
        startsPerPlayer: RULES.startsPerPlayer,
        picksPerPlayer: RULES.picksPerPlayer,
        baseIncome: RULES.baseIncome,
        offensiveKillRate: RULES.offensiveKillRate,
        defensiveKillRate: RULES.defensiveKillRate,
        luck: "0% straight round",
        moveOrder: "cycle",
        cards: "off"
      },
      seed: this.seed,
      map: {
        id: map.id,
        name: map.name,
        territories: map.territories,
        bonuses: map.bonuses,
        adjacency: map.adjacency,
        edges: map.edges,
        routeEdges: map.routeEdges
      },
      players: this.botNames,
      setup: {
        distribution: draft.distribution,
        availablePicks: draft.availablePicks,
        wastelands: draft.wastelands,
        firstPicker: draft.firstPicker,
        allocation: this.allocation
      },
      frames: [this.#frame("initial", [], [])],
      result: null
    };
  }

  get firstMovePlayer() {
    return this.turn % 2 === 1 ? this.allocation.firstMovePlayer : 1 - this.allocation.firstMovePlayer;
  }

  calculateIncome(playerId) {
    let income = RULES.baseIncome;
    const completedBonuses = [];
    for (const bonus of this.map.bonuses) {
      if (bonus.value <= 0) continue;
      const complete = bonus.territories.every((territoryId) => this.territories[territoryId]?.owner === playerId);
      if (complete) {
        income += bonus.value;
        completedBonuses.push(bonus.id);
      }
    }
    return { total: income, base: RULES.baseIncome, completedBonuses };
  }

  getPlayerTerritories(playerId) {
    return Object.entries(this.territories)
      .filter(([, state]) => state.owner === playerId)
      .map(([territoryId]) => territoryId);
  }

  buildObservation(playerId) {
    const owned = new Set(this.getPlayerTerritories(playerId));
    const visible = new Set(owned);
    for (const territoryId of owned) {
      for (const neighbor of this.map.adjacency[territoryId] ?? []) visible.add(neighbor);
    }

    return {
      playerId,
      turn: this.turn,
      income: this.calculateIncome(playerId),
      firstMovePlayer: this.firstMovePlayer,
      map: publicMapForBots(this.map),
      territories: this.map.territories.map((territory) => {
        const state = this.territories[territory.id];
        const isVisible = visible.has(territory.id);
        return {
          id: territory.id,
          name: territory.name,
          bonusId: territory.bonusId,
          x: territory.x,
          y: territory.y,
          neighbors: this.map.adjacency[territory.id],
          visible: isVisible,
          mine: state.owner === playerId,
          owner: isVisible ? state.owner : "unknown",
          armies: isVisible ? state.armies : null
        };
      })
    };
  }

  runTurn(rawOrdersByPlayer) {
    if (this.finished) return this.result;

    const incomes = [this.calculateIncome(0), this.calculateIncome(1)];
    const parsed = [
      normalizeTurnOrders(rawOrdersByPlayer?.[0]),
      normalizeTurnOrders(rawOrdersByPlayer?.[1])
    ];
    const turnEvents = [];
    const pushStepFrame = (phase) => {
      this.replay.frames.push(this.#frame(phase, parsed, turnEvents, turnEvents.length - 1));
    };

    this.#applyDeployments(0, parsed[0].deployments, incomes[0].total, turnEvents, pushStepFrame);
    this.#applyDeployments(1, parsed[1].deployments, incomes[1].total, turnEvents, pushStepFrame);

    const movable = this.#initializeMovableArmies();
    const queues = [parsed[0].orders.slice(), parsed[1].orders.slice()];
    let round = 0;
    let safety = 0;
    while ((queues[0].length || queues[1].length) && safety < 1000) {
      safety += 1;
      const order = round % 2 === 0
        ? [this.firstMovePlayer, 1 - this.firstMovePlayer]
        : [1 - this.firstMovePlayer, this.firstMovePlayer];
      for (const playerId of order) {
        this.#executeNextOrder(playerId, queues[playerId], movable, turnEvents, pushStepFrame);
      }
      round += 1;
    }

    const eliminated = [0, 1].filter((playerId) => this.getPlayerTerritories(playerId).length === 0);
    if (eliminated.length === 1) {
      this.#finish({
        winner: 1 - eliminated[0],
        loser: eliminated[0],
        reason: "elimination",
        turn: this.turn
      });
    } else if (this.turn >= RULES.maxTurns) {
      const counts = [this.getPlayerTerritories(0).length, this.getPlayerTerritories(1).length];
      const incomesNow = [this.calculateIncome(0).total, this.calculateIncome(1).total];
      const winner = incomesNow[0] === incomesNow[1]
        ? (counts[0] === counts[1] ? null : (counts[0] > counts[1] ? 0 : 1))
        : (incomesNow[0] > incomesNow[1] ? 0 : 1);
      this.#finish({
        winner,
        loser: winner === null ? null : 1 - winner,
        reason: winner === null ? "max_turn_draw" : "max_turn_tiebreak",
        turn: this.turn
      });
    }

    if (turnEvents.length === 0) {
      this.replay.frames.push(this.#frame("turn-end", parsed, turnEvents));
    }
    this.turn += 1;
    if (this.finished) this.replay.result = this.result;
    return this.result;
  }

  #initializeTerritories() {
    const wastelandSet = new Set(this.draft.wastelands);
    const distributionSet = new Set(this.draft.distribution);
    const startsByTerritory = new Map();
    for (let playerId = 0; playerId < 2; playerId += 1) {
      for (const territoryId of this.allocation.starts[playerId]) startsByTerritory.set(territoryId, playerId);
    }

    for (const territory of this.map.territories) {
      const starter = startsByTerritory.get(territory.id);
      if (starter !== undefined) {
        this.territories[territory.id] = { owner: starter, armies: RULES.initialArmiesPerStart };
      } else if (wastelandSet.has(territory.id)) {
        this.territories[territory.id] = { owner: null, armies: RULES.wastelandArmies };
      } else if (distributionSet.has(territory.id)) {
        this.territories[territory.id] = { owner: null, armies: RULES.distributionNeutralArmies };
      } else {
        this.territories[territory.id] = { owner: null, armies: RULES.neutralArmies };
      }
    }
  }

  #applyDeployments(playerId, deployments, income, events, pushStepFrame) {
    let remaining = income;
    for (const deployment of deployments) {
      if (remaining <= 0) break;
      const territory = this.territories[deployment.territoryId];
      if (!territory || territory.owner !== playerId) continue;
      const armies = Math.min(remaining, deployment.armies);
      if (armies <= 0) continue;
      territory.armies += armies;
      remaining -= armies;
      events.push({ type: "deploy", playerId, territoryId: deployment.territoryId, armies });
      pushStepFrame("deploy");
    }
    if (remaining > 0) {
      const fallback = this.getPlayerTerritories(playerId)[0];
      if (fallback) {
        this.territories[fallback].armies += remaining;
        events.push({ type: "deploy", playerId, territoryId: fallback, armies: remaining, fallback: true });
        pushStepFrame("deploy");
      }
    }
  }

  #initializeMovableArmies() {
    const movable = [{}, {}];
    for (const [territoryId, state] of Object.entries(this.territories)) {
      if (state.owner === 0 || state.owner === 1) {
        movable[state.owner][territoryId] = Math.max(0, state.armies - 1);
      }
    }
    return movable;
  }

  #executeNextOrder(playerId, queue, movable, events, pushStepFrame) {
    while (queue.length) {
      const order = queue.shift();
      const result = this.#executeAttackTransfer(playerId, order, movable, events, pushStepFrame);
      if (result.executed) return result;
      if (result.consumedDelay) return result;
    }
    return { executed: false };
  }

  #executeAttackTransfer(playerId, order, movable, events, pushStepFrame) {
    const source = this.territories[order.from];
    const target = this.territories[order.to];
    if (!source || !target || source.owner !== playerId) return { executed: false };
    if (!this.map.adjacency[order.from]?.includes(order.to)) return { executed: false };

    const targetOwnedByPlayer = target.owner === playerId;
    if (order.mode === "transferOnly" && !targetOwnedByPlayer) return { executed: false };
    if (order.mode === "attackOnly" && targetOwnedByPlayer) return { executed: false };

    const maxMovable = Math.min(movable[playerId][order.from] ?? 0, Math.max(0, source.armies - 1));
    const requested = order.byPercent
      ? straightRound(maxMovable * order.percent / 100)
      : order.armies;
    const armies = Math.min(maxMovable, requested);
    if (armies <= 0) return { executed: false };

    source.armies -= armies;
    movable[playerId][order.from] = Math.max(0, (movable[playerId][order.from] ?? 0) - armies);

    if (targetOwnedByPlayer) {
      target.armies += armies;
      events.push({
        type: "transfer",
        playerId,
        from: order.from,
        to: order.to,
        armies,
        mode: order.mode,
        byPercent: order.byPercent
      });
      pushStepFrame("transfer");
      return { executed: true };
    }

    const defenderOwner = target.owner;
    const defendingArmies = target.armies;
    const killedDefenders = Math.min(defendingArmies, straightRound(armies * RULES.offensiveKillRate));
    const killedAttackers = Math.min(armies, straightRound(defendingArmies * RULES.defensiveKillRate));
    const survivingAttackers = armies - killedAttackers;
    const captures = killedDefenders >= defendingArmies && survivingAttackers > 0;

    if (captures) {
      target.owner = playerId;
      target.armies = survivingAttackers;
      movable[playerId][order.to] = 0;
      if (defenderOwner === 0 || defenderOwner === 1) movable[defenderOwner][order.to] = 0;
      this.conqueredThisTurn[playerId] = true;
    } else {
      target.armies = Math.max(1, defendingArmies - killedDefenders);
      if (defenderOwner === 0 || defenderOwner === 1) {
        movable[defenderOwner][order.to] = Math.min(
          movable[defenderOwner][order.to] ?? 0,
          Math.max(0, target.armies - 1)
        );
      }
    }

    events.push({
      type: "attack",
      playerId,
      from: order.from,
      to: order.to,
      armies,
      defenderOwner,
      defendingArmies,
      killedAttackers,
      killedDefenders,
      captured: captures,
      remainingAttackers: captures ? survivingAttackers : 0,
      remainingDefenders: captures ? 0 : target.armies,
      mode: order.mode,
      byPercent: order.byPercent
    });
    pushStepFrame("attack");
    return { executed: true };
  }

  #finish(result) {
    this.finished = true;
    this.result = result;
  }

  #frame(phase, orders, events, currentEventIndex = null) {
    return {
      turn: this.turn,
      phase,
      firstMovePlayer: this.firstMovePlayer,
      incomes: [this.calculateIncome(0), this.calculateIncome(1)],
      orders,
      events,
      currentEventIndex,
      territories: Object.fromEntries(
        Object.entries(this.territories).map(([territoryId, state]) => [
          territoryId,
          { owner: state.owner, armies: state.armies }
        ])
      )
    };
  }
}

function firstAvailablePick(picks, available, remaining) {
  for (const territoryId of picks) {
    if (available.has(territoryId) && remaining.has(territoryId)) return territoryId;
  }
  return null;
}

function buildAllocationOrder(firstPicker) {
  const order = [];
  for (let round = 0; round < RULES.startsPerPlayer; round += 1) {
    const players = round % 2 === 0 ? [firstPicker, 1 - firstPicker] : [1 - firstPicker, firstPicker];
    for (const playerId of players) order.push(playerId);
  }
  return order;
}

function normalizeTurnOrders(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    deployments: Array.isArray(source.deployments)
      ? source.deployments.map(normalizeDeployment).filter(Boolean)
      : [],
    orders: Array.isArray(source.orders)
      ? source.orders.map(normalizeAttackTransfer).filter(Boolean)
      : []
  };
}

function normalizeDeployment(input) {
  if (!input || typeof input !== "object") return null;
  const territoryId = String(input.territoryId ?? input.to ?? "");
  const armies = Math.floor(Number(input.armies));
  if (!territoryId || !Number.isFinite(armies) || armies <= 0) return null;
  return { territoryId, armies };
}

function normalizeAttackTransfer(input) {
  if (!input || typeof input !== "object") return null;
  const from = String(input.from ?? "");
  const to = String(input.to ?? "");
  if (!from || !to) return null;
  const mode = ["attackTransfer", "attackOnly", "transferOnly"].includes(input.mode)
    ? input.mode
    : "attackTransfer";
  const byPercent = Boolean(input.byPercent || input.percent !== undefined);
  const percent = clamp(Number(input.percent ?? 100), 0, 100);
  const armies = Math.floor(Number(input.armies));
  if (!byPercent && (!Number.isFinite(armies) || armies <= 0)) return null;
  return {
    type: "attackTransfer",
    from,
    to,
    mode,
    byPercent,
    percent,
    armies: byPercent ? 0 : armies
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function publicMapForBots(map) {
  return {
    id: map.id,
    name: map.name,
    bonuses: map.bonuses,
    territories: map.territories.map((territory) => ({
      id: territory.id,
      name: territory.name,
      bonusId: territory.bonusId,
      bonusName: territory.bonusName,
      bonusValue: territory.bonusValue,
      x: territory.x,
      y: territory.y,
      neighbors: map.adjacency[territory.id]
    }))
  };
}

export function summarizeReplay(replay) {
  const finalFrame = replay.frames.at(-1);
  const counts = [0, 0];
  for (const state of Object.values(finalFrame.territories)) {
    if (state.owner === 0 || state.owner === 1) counts[state.owner] += 1;
  }
  return {
    seed: replay.seed,
    turns: finalFrame.turn,
    players: replay.players,
    result: replay.result,
    territoryCounts: counts,
    incomes: finalFrame.incomes.map((income) => income.total)
  };
}

export function territoryInfo(id, map = MEDIUM_EARTH_MAP) {
  return getTerritory(map, id);
}
