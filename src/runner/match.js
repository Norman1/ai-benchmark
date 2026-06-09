import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { WarGame, createDraft, summarizeReplay } from "../engine/game.js";
import { MEDIUM_EARTH_MAP } from "../engine/map.js";
import { RULES } from "../engine/rules.js";
import { BotProcess } from "./bot-process.js";
import { loadBotManifestById, loadBotManifests } from "./bots.js";
import { expectedScore, updateElo } from "../rating/elo.js";

export async function runMatchByIds(botAId, botBId, options = {}) {
  const [botA, botB] = await Promise.all([
    loadBotManifestById(botAId, options.botsDir),
    loadBotManifestById(botBId, options.botsDir)
  ]);
  return await runMatch([botA, botB], options);
}

export async function runMatch(botManifests, options = {}) {
  const seed = options.seed ?? Date.now();
  const maxTurns = options.maxTurns ?? RULES.maxTurns;
  const draft = createDraft(seed, MEDIUM_EARTH_MAP);
  const bots = botManifests.map((manifest) => new BotProcess(manifest, { timeLimitMs: options.timeLimitMs }));
  const pickOrders = [[], []];
  const failures = [];

  try {
    for (let playerId = 0; playerId < 2; playerId += 1) {
      const response = await safeRequest(bots[playerId], {
        type: "pick",
        protocolVersion: 1,
        playerId,
        seed,
        rules: RULES,
        map: publicMap(),
        distribution: draft.distribution,
        availablePicks: draft.availablePicks,
        wastelands: draft.wastelands,
        requiredPicks: RULES.picksPerPlayer
      }, failures);
      pickOrders[playerId] = normalizePicks(response?.picks, draft.availablePicks);
    }

    const game = new WarGame({
      seed,
      draft,
      pickOrders,
      botNames: botManifests.map((bot) => bot.name)
    });
    game.replay.setup.submittedPicks = pickOrders;

    while (!game.finished && game.turn <= maxTurns) {
      const turnOrders = [];
      for (let playerId = 0; playerId < 2; playerId += 1) {
        const response = await safeRequest(bots[playerId], {
          type: "turn",
          protocolVersion: 1,
          playerId,
          seed,
          turn: game.turn,
          timeLimitMs: options.timeLimitMs ?? RULES.botTimeLimitMs,
          observation: game.buildObservation(playerId)
        }, failures);
        turnOrders[playerId] = response?.orders ?? response ?? {};
      }
      game.runTurn(turnOrders);
      if (failures.some((failure) => failure.fatal)) break;
    }

    if (!game.finished && failures.some((failure) => failure.fatal)) {
      const firstFatal = failures.find((failure) => failure.fatal);
      const loser = firstFatal.playerId;
      game.finished = true;
      game.result = {
        winner: 1 - loser,
        loser,
        reason: "bot_failure",
        detail: firstFatal.error,
        turn: game.turn
      };
      game.replay.result = game.result;
    } else if (!game.finished) {
      const finalFrame = game.replay.frames.at(-1);
      game.finished = true;
      game.result = {
        winner: null,
        loser: null,
        reason: "turn_limit_draw",
        turn: finalFrame?.turn ?? maxTurns
      };
      game.replay.result = game.result;
    }

    game.replay.botFailures = failures;
    await Promise.allSettled(bots.map((bot, playerId) => bot.request({
      type: "gameOver",
      playerId,
      result: game.result
    }, { expectReply: false })));

    const replay = game.replay;
    const summary = summarizeReplay(replay);
    if (options.writeReplay !== false) {
      const replayDir = path.resolve(options.replayDir ?? "replays");
      await mkdir(replayDir, { recursive: true });
      const fileName = `${Date.now()}-${botManifests[0].id}-vs-${botManifests[1].id}-seed-${summary.seed}.json`;
      const replayPath = path.join(replayDir, sanitizeFileName(fileName));
      await writeFile(replayPath, JSON.stringify(replay, null, 2), "utf8");
      summary.replayPath = replayPath;
    }

    return { summary, replay };
  } finally {
    for (const bot of bots) bot.stop();
  }
}

export async function runTournament(options = {}) {
  const bots = await loadBotManifests(options.botsDir);
  const ratings = Object.fromEntries(bots.map((bot) => [bot.id, { rating: 1500, games: 0, wins: 0, losses: 0, draws: 0 }]));
  const games = [];
  const gamesPerPair = options.gamesPerPair ?? 2;
  for (let i = 0; i < bots.length; i += 1) {
    for (let j = i + 1; j < bots.length; j += 1) {
      for (let gameIndex = 0; gameIndex < gamesPerPair; gameIndex += 1) {
        const sideSwap = gameIndex % 2 === 1;
        const pair = sideSwap ? [bots[j], bots[i]] : [bots[i], bots[j]];
        const seed = `${options.seed ?? "tournament"}:${i}:${j}:${gameIndex}`;
        const match = await runMatch(pair, { ...options, seed, writeReplay: options.writeReplay ?? false });
        const winnerId = match.summary.result.winner === null ? null : pair[match.summary.result.winner].id;
        updateRatings(ratings, pair, match.summary.result.winner);
        games.push({ bots: pair.map((bot) => bot.id), winnerId, summary: match.summary });
      }
    }
  }
  return {
    ratings: Object.entries(ratings)
      .map(([id, rating]) => ({ id, ...rating }))
      .sort((a, b) => b.rating - a.rating),
    games
  };
}

async function safeRequest(bot, message, failures) {
  try {
    return await bot.request(message);
  } catch (error) {
    const playerId = message.playerId;
    failures.push({
      playerId,
      botId: bot.manifest.id,
      fatal: true,
      error: error.message
    });
    return null;
  }
}

function normalizePicks(picks, availablePicks) {
  const available = new Set(availablePicks);
  const normalized = [];
  for (const pick of Array.isArray(picks) ? picks : []) {
    const territoryId = String(pick);
    if (available.has(territoryId) && !normalized.includes(territoryId)) normalized.push(territoryId);
  }
  return normalized.slice(0, RULES.picksPerPlayer);
}

function publicMap() {
  return {
    id: MEDIUM_EARTH_MAP.id,
    name: MEDIUM_EARTH_MAP.name,
    bonuses: MEDIUM_EARTH_MAP.bonuses,
    territories: MEDIUM_EARTH_MAP.territories.map((territory) => ({
      id: territory.id,
      name: territory.name,
      bonusId: territory.bonusId,
      bonusName: territory.bonusName,
      bonusValue: territory.bonusValue,
      x: territory.x,
      y: territory.y,
      neighbors: MEDIUM_EARTH_MAP.adjacency[territory.id]
    }))
  };
}

function updateRatings(ratings, pair, winnerIndex) {
  const [a, b] = pair;
  const aRating = ratings[a.id].rating;
  const bRating = ratings[b.id].rating;
  const scoreA = winnerIndex === null ? 0.5 : (winnerIndex === 0 ? 1 : 0);
  const scoreB = 1 - scoreA;
  ratings[a.id].rating = updateElo(aRating, expectedScore(aRating, bRating), scoreA);
  ratings[b.id].rating = updateElo(bRating, expectedScore(bRating, aRating), scoreB);
  ratings[a.id].games += 1;
  ratings[b.id].games += 1;
  if (winnerIndex === null) {
    ratings[a.id].draws += 1;
    ratings[b.id].draws += 1;
  } else {
    ratings[pair[winnerIndex].id].wins += 1;
    ratings[pair[1 - winnerIndex].id].losses += 1;
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-z0-9._-]+/gi, "_");
}
