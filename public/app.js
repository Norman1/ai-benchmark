const els = {
  status: document.getElementById("status"),
  botA: document.getElementById("botA"),
  botB: document.getElementById("botB"),
  seed: document.getElementById("seed"),
  runMatch: document.getElementById("runMatch"),
  runTournament: document.getElementById("runTournament"),
  playPause: document.getElementById("playPause"),
  stepBack: document.getElementById("stepBack"),
  stepForward: document.getElementById("stepForward"),
  scrubber: document.getElementById("scrubber"),
  speed: document.getElementById("speed"),
  resultList: document.getElementById("resultList"),
  turnTitle: document.getElementById("turnTitle"),
  board: document.getElementById("board"),
  scoreGrid: document.getElementById("scoreGrid"),
  territoryDetails: document.getElementById("territoryDetails"),
  eventLog: document.getElementById("eventLog"),
  tournamentResults: document.getElementById("tournamentResults")
};

const SVG_NS = "http://www.w3.org/2000/svg";
const COLORS = {
  sea: "#0a1111",
  route: "rgba(215, 199, 55, 0.65)",
  event: "rgba(246, 222, 94, 0.88)",
  neutral: "#cfcfca",
  neutralText: "#111111",
  selected: "#ffe276",
  player: [
    { fill: "#6f18b7", text: "#f8f0ff", stroke: "#241133" },
    { fill: "#0aa3ad", text: "#f2feff", stroke: "#06363c" }
  ]
};

let mapPayload = null;
let geometryPayload = null;
let replay = null;
let frameIndex = 0;
let selectedTerritoryId = null;
let timer = null;
let board = null;

els.runMatch.addEventListener("click", runMatch);
els.runTournament.addEventListener("click", runTournament);
els.playPause.addEventListener("click", togglePlayback);
els.stepBack.addEventListener("click", () => setFrame(frameIndex - 1));
els.stepForward.addEventListener("click", () => setFrame(frameIndex + 1));
els.scrubber.addEventListener("input", () => setFrame(Number(els.scrubber.value)));

await boot();

async function boot() {
  setStatus("Loading");
  const [bots, mapResponse, geometryResponse] = await Promise.all([
    fetchJson("/api/bots"),
    fetchJson("/api/map"),
    fetchJson("/assets/medium-earth-geometry.json")
  ]);
  mapPayload = mapResponse;
  geometryPayload = geometryResponse;
  board = buildBoard(mapPayload.map, geometryPayload);
  fillBotSelects(bots);
  setStatus("Ready");
  await runMatch();
}

function fillBotSelects(bots) {
  for (const select of [els.botA, els.botB]) {
    select.innerHTML = bots.map((bot) => `<option value="${escapeHtml(bot.id)}">${escapeHtml(bot.name)}</option>`).join("");
  }
  els.botA.value = bots.find((bot) => bot.id === "starter-greedy")?.id ?? bots[0]?.id;
  els.botB.value = bots.find((bot) => bot.id === "starter-random")?.id ?? bots[1]?.id ?? bots[0]?.id;
}

async function runMatch() {
  stopPlayback();
  setBusy(true);
  setStatus("Running match");
  try {
    const result = await fetchJson("/api/match", {
      method: "POST",
      body: JSON.stringify({
        botA: els.botA.value,
        botB: els.botB.value,
        seed: els.seed.value || Date.now()
      })
    });
    replay = result.replay;
    frameIndex = 0;
    selectedTerritoryId = null;
    els.scrubber.max = String(replay.frames.length - 1);
    renderResult(result.summary);
    setFrame(0);
    setStatus("Replay ready");
  } catch (error) {
    setStatus("Error");
    els.eventLog.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
  } finally {
    setBusy(false);
  }
}

async function runTournament() {
  setBusy(true);
  setStatus("Running Elo test");
  try {
    const result = await fetchJson("/api/tournament", {
      method: "POST",
      body: JSON.stringify({ seed: els.seed.value || "web", gamesPerPair: 2 })
    });
    els.tournamentResults.innerHTML = `
      <table>
        <thead><tr><th>Bot</th><th>Elo</th><th>W</th><th>L</th><th>D</th></tr></thead>
        <tbody>
          ${result.ratings.map((row) => `
            <tr>
              <td>${escapeHtml(row.id)}</td>
              <td>${row.rating}</td>
              <td>${row.wins}</td>
              <td>${row.losses}</td>
              <td>${row.draws}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
    setStatus("Elo ready");
  } catch (error) {
    setStatus("Error");
    els.tournamentResults.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

function setFrame(nextIndex) {
  if (!replay || !board) return;
  frameIndex = Math.max(0, Math.min(replay.frames.length - 1, nextIndex));
  els.scrubber.value = String(frameIndex);
  renderFrame();
}

function renderFrame() {
  const frame = replay.frames[frameIndex];
  const setup = replay.setup;
  renderMapState(frame);

  els.turnTitle.textContent = frame.phase === "initial"
    ? `Setup: picks allocated, ${setup.wastelands.length} wastelands`
    : `Turn ${frame.turn}: ${frame.events.length} executed orders`;
  renderScores(frame);
  renderEvents(frame);
  renderTerritoryDetails(frame);
}

function renderMapState(frame) {
  for (const territory of board.territoryList) {
    const state = frame.territories[territory.id];
    if (!state) continue;
    const owned = state.owner === 0 || state.owner === 1;
    const fill = owned ? COLORS.player[state.owner].fill : COLORS.neutral;
    const textFill = owned ? COLORS.player[state.owner].text : COLORS.neutralText;
    const textStroke = owned ? COLORS.player[state.owner].stroke : "rgba(245, 245, 241, 0.9)";
    const selected = selectedTerritoryId === territory.id;
    const ownerName = owned ? `player-${state.owner}` : "neutral";

    territory.path.style.fill = fill;
    territory.path.dataset.owner = ownerName;
    territory.path.dataset.armies = String(state.armies);
    territory.path.classList.toggle("selected", selected);
    territory.label.textContent = String(state.armies);
    territory.label.style.fill = textFill;
    territory.label.style.stroke = selected ? COLORS.selected : textStroke;
    territory.label.dataset.owner = ownerName;
    territory.label.dataset.armies = String(state.armies);
    territory.label.classList.toggle("selected", selected);
  }
  renderEventEdges(frame);
}

function renderEventEdges(frame) {
  board.eventLayer.replaceChildren();
  for (const event of frame.events) {
    if (!event.from || !event.to) continue;
    const from = board.territories.get(event.from);
    const to = board.territories.get(event.to);
    if (!from || !to) continue;
    const line = svg("line", {
      x1: from.labelPoint.x,
      y1: from.labelPoint.y,
      x2: to.labelPoint.x,
      y2: to.labelPoint.y,
      class: "event-edge"
    });
    board.eventLayer.append(line);
  }
}

function buildBoard(map, geometry) {
  const viewBox = geometry.viewBox ?? map.viewBox;
  els.board.setAttribute("viewBox", `0 0 ${viewBox.width} ${viewBox.height}`);
  els.board.replaceChildren();

  const sea = svg("rect", { x: 0, y: 0, width: viewBox.width, height: viewBox.height, class: "sea" });
  const routeLayer = svg("g", { class: "route-layer" });
  const territoryLayer = svg("g", { class: "territory-layer" });
  const bonusLayer = svg("g", { class: "bonus-layer" });
  const eventLayer = svg("g", { class: "event-layer" });
  const labelLayer = svg("g", { class: "label-layer" });
  els.board.append(sea, routeLayer, territoryLayer, bonusLayer, eventLayer, labelLayer);

  const mapTerritories = new Map(map.territories.map((territory) => [territory.id, territory]));
  const geometryById = new Map(geometry.territories.map((territory) => [territory.id, territory]));
  const territories = new Map();
  const territoryList = [];

  for (const territory of map.territories) {
    const territoryGeometry = geometryById.get(territory.id);
    if (!territoryGeometry) continue;
    const path = svg("path", {
      d: territoryGeometry.path,
      class: "territory",
      "data-id": territory.id
    });
    path.style.stroke = territory.color;
    path.addEventListener("click", () => selectTerritory(territory.id));

    const label = svg("text", {
      x: territoryGeometry.label.x,
      y: territoryGeometry.label.y,
      class: "army-label",
      "data-id": territory.id
    });
    label.addEventListener("click", () => selectTerritory(territory.id));
    territoryLayer.append(path);
    labelLayer.append(label);

    const merged = {
      ...territory,
      path,
      label,
      labelPoint: territoryGeometry.label
    };
    territories.set(territory.id, merged);
    territoryList.push(merged);
  }

  drawRouteHints(map, geometry, territories, routeLayer);
  drawBonusMarkers(map, geometry, bonusLayer);

  return { territories, territoryList, eventLayer };
}

function drawRouteHints(map, geometry, territories, routeLayer) {
  if (geometry.routes?.length) {
    for (const route of geometry.routes) {
      routeLayer.append(svg("path", {
        d: route.path,
        class: "route"
      }));
    }
    return;
  }

  for (const [fromId, toId] of map.routeEdges ?? []) {
    const from = territories.get(fromId);
    const to = territories.get(toId);
    if (!from || !to) continue;
    routeLayer.append(svg("line", {
      x1: from.labelPoint.x,
      y1: from.labelPoint.y,
      x2: to.labelPoint.x,
      y2: to.labelPoint.y,
      class: "route"
    }));
  }
}

function drawBonusMarkers(map, geometry, bonusLayer) {
  const bonusById = new Map(map.bonuses.map((bonus) => [bonus.id, bonus]));
  for (const marker of geometry.bonusLinks) {
    const bonus = bonusById.get(marker.id);
    if (!bonus) continue;
    const path = svg("path", { d: marker.path, class: "bonus-marker" });
    path.style.fill = bonus.color;
    const text = svg("text", {
      x: marker.label.x,
      y: marker.label.y + 0.8,
      class: "bonus-marker-text"
    });
    text.textContent = String(bonus.value);
    bonusLayer.append(path, text);
  }
}

function selectTerritory(territoryId) {
  selectedTerritoryId = territoryId;
  if (replay) renderFrame();
}

function renderScores(frame) {
  const counts = [0, 0];
  const armies = [0, 0];
  for (const state of Object.values(frame.territories)) {
    if (state.owner === 0 || state.owner === 1) {
      counts[state.owner] += 1;
      armies[state.owner] += state.armies;
    }
  }
  els.scoreGrid.innerHTML = [0, 1].map((playerId) => `
    <div class="score">
      <strong>${escapeHtml(replay.players[playerId])}</strong>
      <dl>
        <dt>Income</dt><dd>${frame.incomes[playerId].total}</dd>
        <dt>Territories</dt><dd>${counts[playerId]}</dd>
        <dt>Armies</dt><dd>${armies[playerId]}</dd>
        <dt>Completed</dt><dd>${frame.incomes[playerId].completedBonuses.length}</dd>
      </dl>
    </div>
  `).join("");
}

function renderEvents(frame) {
  if (!frame.events.length) {
    els.eventLog.innerHTML = "<li>No executed orders in this frame.</li>";
    return;
  }
  els.eventLog.innerHTML = frame.events.slice(-24).map((event) => `<li>${escapeHtml(describeEvent(event))}</li>`).join("");
}

function renderTerritoryDetails(frame) {
  if (!selectedTerritoryId) {
    els.territoryDetails.textContent = "Select a territory on the board.";
    return;
  }
  const territory = board.territories.get(selectedTerritoryId);
  const state = frame.territories[selectedTerritoryId];
  if (!territory || !state) return;
  const owner = state.owner === null ? "Neutral" : replay.players[state.owner];
  const neighbors = replay.map.adjacency[selectedTerritoryId] ?? [];
  els.territoryDetails.innerHTML = `
    <strong>${escapeHtml(territory.name)}</strong><br>
    Bonus: ${escapeHtml(territory.bonusName)} (+${territory.bonusValue})<br>
    Owner: ${escapeHtml(owner)}<br>
    Armies: ${state.armies}<br>
    Borders: ${neighbors.length}
  `;
}

function renderResult(summary) {
  const result = summary.result;
  const winner = result.winner === null ? "Draw" : summary.players[result.winner];
  els.resultList.innerHTML = `
    <dt>Winner</dt><dd>${escapeHtml(winner)}</dd>
    <dt>Reason</dt><dd>${escapeHtml(result.reason)}</dd>
    <dt>Turns</dt><dd>${summary.turns}</dd>
    <dt>Seed</dt><dd>${summary.seed}</dd>
  `;
}

function describeEvent(event) {
  const player = replay.players[event.playerId] ?? `P${event.playerId}`;
  if (event.type === "deploy") {
    return `${player} deployed ${event.armies} to ${name(event.territoryId)}${event.fallback ? " (fallback)" : ""}.`;
  }
  if (event.type === "transfer") {
    return `${player} transferred ${event.armies} from ${name(event.from)} to ${name(event.to)}.`;
  }
  if (event.type === "attack") {
    const captureText = event.captured ? `captured ${name(event.to)}` : `hit ${name(event.to)}`;
    return `${player} attacked from ${name(event.from)} with ${event.armies}, killed ${event.killedDefenders}, lost ${event.killedAttackers}, and ${captureText}.`;
  }
  return event.type;
}

function name(territoryId) {
  return board.territories.get(territoryId)?.name ?? territoryId;
}

function togglePlayback() {
  if (timer) {
    stopPlayback();
    return;
  }
  if (!replay) return;
  els.playPause.textContent = "Pause";
  timer = setInterval(() => {
    if (frameIndex >= replay.frames.length - 1) {
      stopPlayback();
      return;
    }
    setFrame(frameIndex + 1);
  }, Number(els.speed.value));
}

function stopPlayback() {
  if (timer) clearInterval(timer);
  timer = null;
  els.playPause.textContent = "Play";
}

function setBusy(busy) {
  for (const button of [els.runMatch, els.runTournament]) button.disabled = busy;
}

function setStatus(text) {
  els.status.textContent = text;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? response.statusText);
  return data;
}

function svg(tagName, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tagName);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  return node;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
