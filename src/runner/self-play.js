import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadBotManifestById } from "./bots.js";
import { runMatch } from "./match.js";
import { resolveSelfPlayOpponents } from "./snapshots.js";
import { RULES } from "../engine/rules.js";

export async function runSelfPlay(botId, options = {}) {
  const candidate = await loadBotManifestById(botId, options.botsDir);
  const opponents = await resolveSelfPlayOpponents(botId, options.against ?? "latest", options);
  const gamesPerOpponent = positiveInteger(options.games ?? options.gamesPerOpponent, 20);
  const seedBase = String(options.seed ?? "selfplay");
  const games = [];
  const byOpponent = {};
  const totals = emptyStats();

  for (const opponent of opponents) {
    const opponentStats = emptyStats();
    byOpponent[opponent.snapshot.id] = opponentStats;

    for (let gameIndex = 0; gameIndex < gamesPerOpponent; gameIndex += 1) {
      const candidatePlayer = gameIndex % 2 === 0 ? 0 : 1;
      const pair = candidatePlayer === 0 ? [candidate, opponent] : [opponent, candidate];
      const seed = `${seedBase}:${botId}:${opponent.snapshot.id}:${gameIndex}`;
      const match = await runMatch(pair, {
        ...options,
        seed,
        writeReplay: options.writeReplay ?? false,
        maxTurns: positiveInteger(options.maxTurns, RULES.maxTurns)
      });

      const outcome = candidateOutcome(match.summary.result.winner, candidatePlayer);
      recordOutcome(totals, outcome);
      recordOutcome(opponentStats, outcome);
      games.push({
        index: games.length + 1,
        opponentSnapshot: opponent.snapshot.id,
        candidatePlayer,
        seed: match.summary.seed,
        outcome,
        summary: match.summary
      });
    }
  }

  const result = {
    botId,
    candidate: {
      id: candidate.id,
      name: candidate.name,
      sourceDir: candidate.sourceDir
    },
    against: options.against ?? "latest",
    opponents: opponents.map((opponent) => ({
      id: opponent.id,
      name: opponent.name,
      snapshotId: opponent.snapshot.id,
      path: opponent.snapshot.path,
      git: opponent.snapshot.git
    })),
    gamesPerOpponent,
    totals,
    byOpponent,
    games
  };

  if (options.writeRun !== false) {
    const runPath = await writeSelfPlayRun(result, options);
    result.runPath = runPath;
  }
  return result;
}

function candidateOutcome(winner, candidatePlayer) {
  if (winner === null || winner === undefined) return "draw";
  return winner === candidatePlayer ? "candidate" : "opponent";
}

function emptyStats() {
  return {
    games: 0,
    candidateWins: 0,
    opponentWins: 0,
    draws: 0,
    candidateScore: 0
  };
}

function recordOutcome(stats, outcome) {
  stats.games += 1;
  if (outcome === "candidate") {
    stats.candidateWins += 1;
    stats.candidateScore += 1;
  } else if (outcome === "opponent") {
    stats.opponentWins += 1;
  } else {
    stats.draws += 1;
    stats.candidateScore += 0.5;
  }
}

async function writeSelfPlayRun(result, options) {
  const runDir = path.resolve(options.runDir ?? path.join("runs", "selfplay", result.botId));
  await mkdir(runDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(runDir, `${timestamp}.json`);
  await writeFile(filePath, JSON.stringify(result, null, 2), "utf8");
  return filePath;
}

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value ?? fallback));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
