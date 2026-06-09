import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { loadBotManifestById, normalizeManifest } from "./bots.js";

const execFileAsync = promisify(execFile);

export async function promoteBotBaseline(botId, options = {}) {
  const baselineId = sanitizeBaselineId(options.baselineId ?? "baseline");
  const baselinesDir = path.resolve(options.baselinesDir ?? "bot-baselines");
  const bot = await loadBotManifestById(botId, options.botsDir);
  const baselineDir = path.join(baselinesDir, bot.id, baselineId);

  await rm(baselineDir, { recursive: true, force: true });
  await mkdir(path.dirname(baselineDir), { recursive: true });
  await cp(bot.sourceDir, baselineDir, {
    recursive: true,
    errorOnExist: false,
    force: true
  });

  const metadata = {
    id: baselineId,
    botId: bot.id,
    name: bot.name,
    promotedAt: new Date().toISOString(),
    sourceDir: bot.sourceDir,
    git: await gitInfo()
  };
  await writeFile(path.join(baselineDir, "baseline.json"), JSON.stringify(metadata, null, 2), "utf8");

  return {
    ...metadata,
    path: baselineDir
  };
}

export async function getBotBaseline(botId, options = {}) {
  const baselineId = sanitizeBaselineId(options.baselineId ?? "baseline");
  const baselineDir = path.join(path.resolve(options.baselinesDir ?? "bot-baselines"), botId, baselineId);
  try {
    const metadata = JSON.parse(await readFile(path.join(baselineDir, "baseline.json"), "utf8"));
    return { ...metadata, id: baselineId, botId, path: baselineDir };
  } catch {
    return {
      id: baselineId,
      botId,
      path: baselineDir,
      exists: false
    };
  }
}

export async function loadBotBaselineManifest(botId, baselineId = "baseline", options = {}) {
  const baseline = await getBotBaseline(botId, { ...options, baselineId });
  if (baseline.exists === false) throw new Error(`Baseline not found for ${botId}: ${baselineId}`);
  const manifest = JSON.parse(await readFile(path.join(baseline.path, "bot.json"), "utf8"));
  return {
    ...normalizeManifest(manifest, baseline.path, {
      id: `${botId}@${baseline.id}`,
      name: `${manifest.name ?? botId} (${baseline.id})`,
      description: `Baseline of ${botId}: ${baseline.id}`
    }),
    baseline
  };
}

export async function resolveSelfPlayOpponents(botId, against = "baseline", options = {}) {
  const baselineId = against || "baseline";
  return [await loadBotBaselineManifest(botId, baselineId, options)];
}

function sanitizeBaselineId(value) {
  const sanitized = String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!sanitized) throw new Error("Baseline id cannot be empty.");
  return sanitized;
}

async function gitInfo() {
  try {
    const [branch, commit] = await Promise.all([
      execGit(["rev-parse", "--abbrev-ref", "HEAD"]),
      execGit(["rev-parse", "HEAD"])
    ]);
    return { branch, commit };
  } catch {
    return null;
  }
}

async function execGit(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: path.resolve(".") });
  return stdout.trim();
}
