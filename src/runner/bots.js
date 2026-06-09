import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function loadBotManifests(rootDir = path.resolve("bots")) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const bots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const botDir = path.join(rootDir, entry.name);
    try {
      const manifest = JSON.parse(await readFile(path.join(botDir, "bot.json"), "utf8"));
      bots.push(normalizeManifest(manifest, botDir));
    } catch {
      // Folders without a bot manifest are ignored so private workspaces can sit beside starter bots.
    }
  }
  return bots.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadBotManifestById(id, rootDir = path.resolve("bots")) {
  const bots = await loadBotManifests(rootDir);
  const bot = bots.find((candidate) => candidate.id === id);
  if (!bot) throw new Error(`Bot not found: ${id}`);
  return bot;
}

function normalizeManifest(manifest, botDir) {
  if (!manifest.id || !manifest.command) {
    throw new Error(`Invalid bot manifest in ${botDir}: id and command are required.`);
  }
  const workingDirectory = String(manifest.workingDirectory ?? ".");
  return {
    id: String(manifest.id),
    name: String(manifest.name ?? manifest.id),
    command: String(manifest.command),
    args: Array.isArray(manifest.args) ? manifest.args.map(String) : [],
    sourceDir: path.resolve(botDir),
    workingDirectory,
    cwd: path.resolve(botDir, workingDirectory),
    description: String(manifest.description ?? "")
  };
}
