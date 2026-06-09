import { runMatchByIds, runTournament } from "./runner/match.js";
import { loadBotManifests } from "./runner/bots.js";

const command = process.argv[2] ?? "help";
const options = parseArgs(process.argv.slice(3));

if (command === "bots") {
  const bots = await loadBotManifests();
  console.log(JSON.stringify(bots.map(({ id, name, description }) => ({ id, name, description })), null, 2));
} else if (command === "match") {
  const botA = options.botA ?? options.a ?? options._[0] ?? "starter-random";
  const botB = options.botB ?? options.b ?? options._[1] ?? "starter-greedy";
  const seed = options.seed ?? 1;
  const result = await runMatchByIds(botA, botB, { seed, writeReplay: options.writeReplay !== "false" });
  console.log(JSON.stringify(result.summary, null, 2));
} else if (command === "tournament") {
  const result = await runTournament({
    gamesPerPair: Number(options.gamesPerPair ?? options.games ?? 2),
    seed: options.seed ?? "cli-tournament",
    writeReplay: options.writeReplay === "true"
  });
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Usage:
  node src/cli.js bots
  node src/cli.js match --botA starter-random --botB starter-greedy --seed 42
  node src/cli.js tournament --gamesPerPair 4
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
