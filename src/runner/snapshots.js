import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { loadBotManifestById, normalizeManifest } from "./bots.js";

const execFileAsync = promisify(execFile);

export async function createBotSnapshot(botId, options = {}) {
  const snapshotsDir = path.resolve(options.snapshotsDir ?? "bot-snapshots");
  const bot = await loadBotManifestById(botId, options.botsDir);
  const snapshotId = options.snapshotId
    ? sanitizeSnapshotId(options.snapshotId)
    : await nextSnapshotId(snapshotsDir, bot.id, options.label);
  const botSnapshotDir = path.join(snapshotsDir, bot.id, snapshotId);

  await mkdir(path.dirname(botSnapshotDir), { recursive: true });
  await cp(bot.sourceDir, botSnapshotDir, {
    recursive: true,
    errorOnExist: true,
    force: false
  });

  const metadata = {
    id: snapshotId,
    botId: bot.id,
    name: bot.name,
    label: options.label ? String(options.label) : null,
    createdAt: new Date().toISOString(),
    sourceDir: bot.sourceDir,
    git: await gitInfo()
  };
  await writeFile(path.join(botSnapshotDir, "snapshot.json"), JSON.stringify(metadata, null, 2), "utf8");

  return {
    ...metadata,
    path: botSnapshotDir
  };
}

export async function listBotSnapshots(botId, options = {}) {
  const root = path.join(path.resolve(options.snapshotsDir ?? "bot-snapshots"), botId);
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const snapshots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const snapshotDir = path.join(root, entry.name);
    snapshots.push(await readSnapshotMetadata(botId, entry.name, snapshotDir));
  }
  return snapshots.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadBotSnapshotManifest(botId, snapshotId = "latest", options = {}) {
  const snapshot = await resolveSnapshot(botId, snapshotId, options);
  const manifest = JSON.parse(await readFile(path.join(snapshot.path, "bot.json"), "utf8"));
  return {
    ...normalizeManifest(manifest, snapshot.path, {
      id: `${botId}@${snapshot.id}`,
      name: `${manifest.name ?? botId} (${snapshot.id})`,
      description: `Frozen snapshot of ${botId}: ${snapshot.id}`
    }),
    snapshot
  };
}

export async function resolveSelfPlayOpponents(botId, against = "latest", options = {}) {
  if (against === "all") {
    const snapshots = await listBotSnapshots(botId, options);
    if (!snapshots.length) throw new Error(`No snapshots found for bot: ${botId}`);
    return await Promise.all(snapshots.map((snapshot) => loadBotSnapshotManifest(botId, snapshot.id, options)));
  }
  return [await loadBotSnapshotManifest(botId, against || "latest", options)];
}

async function resolveSnapshot(botId, snapshotId, options) {
  const snapshots = await listBotSnapshots(botId, options);
  if (!snapshots.length) throw new Error(`No snapshots found for bot: ${botId}`);
  if (snapshotId === "latest") return snapshots.at(-1);
  const snapshot = snapshots.find((candidate) => candidate.id === snapshotId);
  if (!snapshot) throw new Error(`Snapshot not found for ${botId}: ${snapshotId}`);
  return snapshot;
}

async function readSnapshotMetadata(botId, snapshotId, snapshotDir) {
  try {
    const metadata = JSON.parse(await readFile(path.join(snapshotDir, "snapshot.json"), "utf8"));
    return { ...metadata, id: snapshotId, botId, path: snapshotDir };
  } catch {
    return {
      id: snapshotId,
      botId,
      name: botId,
      label: null,
      createdAt: null,
      git: null,
      path: snapshotDir
    };
  }
}

async function nextSnapshotId(snapshotsDir, botId, label) {
  const snapshots = await listBotSnapshots(botId, { snapshotsDir });
  const maxNumber = snapshots.reduce((max, snapshot) => {
    const match = /^(\d+)/.exec(snapshot.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const prefix = String(maxNumber + 1).padStart(4, "0");
  const suffix = label ? `-${sanitizeSnapshotId(label)}` : "";
  return `${prefix}${suffix}`;
}

function sanitizeSnapshotId(value) {
  const sanitized = String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!sanitized) throw new Error("Snapshot id cannot be empty.");
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
