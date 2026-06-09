import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBotManifests } from "./runner/bots.js";
import { runMatchByIds, runTournament } from "./runner/match.js";
import { MEDIUM_EARTH_MAP } from "./engine/map.js";
import { RULES } from "./engine/rules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const port = Number(process.env.PORT ?? 4173);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/bots" && req.method === "GET") {
      return sendJson(res, (await loadBotManifests()).map(({ id, name, description }) => ({ id, name, description })));
    }
    if (url.pathname === "/api/map" && req.method === "GET") {
      return sendJson(res, { map: MEDIUM_EARTH_MAP, rules: RULES });
    }
    if (url.pathname === "/api/match" && req.method === "POST") {
      const body = await readJson(req);
      const result = await runMatchByIds(body.botA ?? "starter-random", body.botB ?? "starter-greedy", {
        seed: body.seed ?? Date.now(),
        writeReplay: body.writeReplay ?? true,
        maxTurns: Number(body.maxTurns ?? RULES.maxTurns)
      });
      return sendJson(res, result);
    }
    if (url.pathname === "/api/tournament" && req.method === "POST") {
      const body = await readJson(req);
      const result = await runTournament({
        seed: body.seed ?? "web-tournament",
        gamesPerPair: Number(body.gamesPerPair ?? 2),
        writeReplay: false
      });
      return sendJson(res, result);
    }
    return serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: error.message }, 500);
  }
});

server.listen(port, () => {
  console.log(`War.app AI Benchmark running at http://localhost:${port}`);
});

async function serveStatic(res, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const resolved = path.resolve(publicDir, relativePath);
  if (!resolved.startsWith(publicDir)) return sendText(res, "Forbidden", 403);
  try {
    const bytes = await readFile(resolved);
    res.writeHead(200, { "Content-Type": mimeType(resolved) });
    res.end(bytes);
  } catch {
    sendText(res, "Not found", 404);
  }
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, { "Content-Type": "text/plain" });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".map": "application/octet-stream",
    ".svg": "image/svg+xml"
  }[ext] ?? "application/octet-stream";
}
