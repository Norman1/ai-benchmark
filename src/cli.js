import { runMatchByIds, runTournament } from "./runner/match.js";
import { loadBotManifests } from "./runner/bots.js";
import { runSelfPlay } from "./runner/self-play.js";
import { getBotBaseline, promoteBotBaseline } from "./runner/baselines.js";
import { RULES } from "./engine/rules.js";

const command = process.argv[2] ?? "help";
const options = parseArgs(process.argv.slice(3));

if (command === "bots") {
  const bots = await loadBotManifests();
  console.log(JSON.stringify(bots.map(({ id, name, description }) => ({ id, name, description })), null, 2));
} else if (command === "match") {
  const botA = options.botA ?? options.a ?? options._[0] ?? "starter-greedy";
  const botB = options.botB ?? options.b ?? options._[1] ?? "starter-greedy";
  const seed = options.seed ?? options._[2] ?? 1;
  const result = await runMatchByIds(botA, botB, {
    seed,
    writeReplay: booleanFlag(options.writeReplay, true),
    timeLimitMs: positiveNumber(options.timeLimitMs ?? options.botTimeLimitMs ?? options._[3], RULES.botTimeLimitMs)
  });
  console.log(JSON.stringify(result.summary, null, 2));
} else if (command === "tournament") {
  const result = await runTournament({
    gamesPerPair: positiveNumber(options.gamesPerPair ?? options.games ?? options._[0], 50),
    seed: options.seed ?? options._[1] ?? "cli-tournament",
    includeStarterBots: booleanFlag(options.includeStarterBots, false),
    writeReplay: booleanFlag(options.writeReplay, false),
    timeLimitMs: positiveNumber(options.timeLimitMs ?? options.botTimeLimitMs ?? options._[2], RULES.botTimeLimitMs)
  });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "promote") {
  const botId = options.bot ?? options._[0] ?? "starter-greedy";
  const result = await promoteBotBaseline(botId, {
    baselineId: options.baseline ?? options.id ?? options._[1] ?? "baseline",
    botsDir: options.botsDir,
    baselinesDir: options.baselinesDir ?? options._[2]
  });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "baseline") {
  const botId = options.bot ?? options._[0] ?? "starter-greedy";
  const result = await getBotBaseline(botId, {
    baselineId: options.baseline ?? options.id ?? options._[1] ?? "baseline",
    baselinesDir: options.baselinesDir ?? options._[2]
  });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "selfplay") {
  const botId = options.bot ?? options._[0] ?? "starter-greedy";
  const result = await runSelfPlay(botId, {
    against: options.against ?? options._[1] ?? "baseline",
    games: positiveNumber(options.games ?? options.gamesPerOpponent ?? options._[2], 20),
    seed: options.seed ?? options._[3] ?? "cli-selfplay",
    writeReplay: booleanFlag(options.writeReplay, false),
    writeRun: booleanFlag(options.writeRun, true),
    botsDir: options.botsDir,
    baselinesDir: options.baselinesDir ?? options._[6],
    runDir: options.runDir ?? options._[7],
    maxTurns: positiveNumber(options.maxTurns ?? options._[4], RULES.maxTurns),
    timeLimitMs: positiveNumber(options.timeLimitMs ?? options.botTimeLimitMs ?? options._[5], RULES.botTimeLimitMs)
  });
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Usage:
  node src/cli.js bots
  node src/cli.js match --botA starter-greedy --botB starter-greedy --seed 42 --timeLimitMs 5000
  node src/cli.js tournament --gamesPerPair 50 --timeLimitMs 5000
  node src/cli.js promote my-bot
  node src/cli.js selfplay my-bot baseline 100
`);
}

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      parsed[key] = next === undefined || next.startsWith("--") ? true : args[++i];
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

function booleanFlag(value, fallback) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}
