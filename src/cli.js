import { runMatchByIds, runTournament } from "./runner/match.js";
import { loadBotManifests } from "./runner/bots.js";
import { runSelfPlay } from "./runner/self-play.js";
import { createBotSnapshot, listBotSnapshots } from "./runner/snapshots.js";
import { RULES } from "./engine/rules.js";

const command = process.argv[2] ?? "help";
const options = parseArgs(process.argv.slice(3));

if (command === "bots") {
  const bots = await loadBotManifests();
  console.log(JSON.stringify(bots.map(({ id, name, description }) => ({ id, name, description })), null, 2));
} else if (command === "match") {
  const botA = options.botA ?? options.a ?? options._[0] ?? "starter-random";
  const botB = options.botB ?? options.b ?? options._[1] ?? "starter-greedy";
  const seed = options.seed ?? options._[2] ?? 1;
  const result = await runMatchByIds(botA, botB, {
    seed,
    writeReplay: options.writeReplay !== "false",
    timeLimitMs: positiveNumber(options.timeLimitMs ?? options.botTimeLimitMs ?? options._[3], RULES.botTimeLimitMs)
  });
  console.log(JSON.stringify(result.summary, null, 2));
} else if (command === "tournament") {
  const result = await runTournament({
    gamesPerPair: positiveNumber(options.gamesPerPair ?? options.games ?? options._[0], 10),
    seed: options.seed ?? options._[1] ?? "cli-tournament",
    writeReplay: options.writeReplay === "true",
    timeLimitMs: positiveNumber(options.timeLimitMs ?? options.botTimeLimitMs ?? options._[2], RULES.botTimeLimitMs)
  });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "snapshot") {
  const botId = options.bot ?? options._[0] ?? "starter-greedy";
  const result = await createBotSnapshot(botId, {
    label: options.label ?? options._[1],
    snapshotId: options.id ?? options.snapshotId,
    botsDir: options.botsDir,
    snapshotsDir: options.snapshotsDir ?? options._[2]
  });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "snapshots") {
  const botId = options.bot ?? options._[0] ?? "starter-greedy";
  const result = await listBotSnapshots(botId, {
    snapshotsDir: options.snapshotsDir ?? options._[1]
  });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "selfplay") {
  const botId = options.bot ?? options._[0] ?? "starter-greedy";
  const result = await runSelfPlay(botId, {
    against: options.against ?? options._[1] ?? "latest",
    games: positiveNumber(options.games ?? options.gamesPerOpponent ?? options._[2], 20),
    seed: options.seed ?? options._[3] ?? "cli-selfplay",
    writeReplay: options.writeReplay === "true",
    writeRun: options.writeRun !== "false",
    botsDir: options.botsDir,
    snapshotsDir: options.snapshotsDir ?? options._[6],
    runDir: options.runDir ?? options._[7],
    maxTurns: positiveNumber(options.maxTurns ?? options._[4], RULES.maxTurns),
    timeLimitMs: positiveNumber(options.timeLimitMs ?? options.botTimeLimitMs ?? options._[5], RULES.botTimeLimitMs)
  });
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Usage:
  node src/cli.js bots
  node src/cli.js match --botA starter-random --botB starter-greedy --seed 42 --timeLimitMs 5000
  node src/cli.js tournament --gamesPerPair 10 --timeLimitMs 5000
  node src/cli.js snapshot my-bot baseline
  node src/cli.js selfplay my-bot latest 100
`);
}

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1]?.startsWith("--") ? true : args[++i];
      parsed[key] = value;
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

function positiveNumber(value, fallback) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
