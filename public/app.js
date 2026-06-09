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

let mapPayload = null;
let replay = null;
let frameIndex = 0;
let selectedTerritoryId = null;
let timer = null;

els.runMatch.addEventListener("click", runMatch);
els.runTournament.addEventListener("click", runTournament);
els.playPause.addEventListener("click", togglePlayback);
els.stepBack.addEventListener("click", () => setFrame(frameIndex - 1));
els.stepForward.addEventListener("click", () => setFrame(frameIndex + 1));
els.scrubber.addEventListener("input", () => setFrame(Number(els.scrubber.value)));

await boot();

async function boot() {
  setStatus("Loading");
  const [bots, mapResponse] = await Promise.all([
    fetchJson("/api/bots"),
    fetchJson("/api/map")
  ]);
  mapPayload = mapResponse;
  fillBotSelects(bots);
  drawEmptyBoard();
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

function drawEmptyBoard() {
  const map = mapPayload.map;
  els.board.innerHTML = `
    <rect class="sea" x="0" y="0" width="${map.viewBox.width}" height="${map.viewBox.height}"></rect>
    <image class="map-image" href="${mapPayload.rules.mapImage}" x="0" y="0" width="${map.viewBox.width}" height="${map.viewBox.height}" preserveAspectRatio="none"></image>
  `;
}

function setFrame(nextIndex) {
  if (!replay) return;
  frameIndex = Math.max(0, Math.min(replay.frames.length - 1, nextIndex));
  els.scrubber.value = String(frameIndex);
  renderFrame();
}

function renderFrame() {
  const frame = replay.frames[frameIndex];
  const map = replay.map;
  const setup = replay.setup;
  const wastelands = new Set(setup.wastelands);

  const territoryById = new Map(map.territories.map((territory) => [territory.id, territory]));
  const eventEdges = frame.events
    .filter((event) => event.from && event.to)
    .map((event) => {
      const from = territoryById.get(event.from);
      const to = territoryById.get(event.to);
      if (!from || !to) return "";
      return `<line class="event-edge" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>`;
    })
    .join("");

  const ownerPatches = map.territories.map((territory) => {
    const state = frame.territories[territory.id];
    if (state.owner !== 0 && state.owner !== 1) return "";
    const rx = territory.bonusId === "zero" ? 18 : 28;
    const ry = territory.bonusId === "zero" ? 14 : 22;
    return `<ellipse class="owner-patch p${state.owner}" cx="${territory.x}" cy="${territory.y}" rx="${rx}" ry="${ry}"></ellipse>`;
  }).join("");

  const markers = map.territories.map((territory) => {
    const state = frame.territories[territory.id];
    const ownerClass = state.owner === 0 ? "p0" : state.owner === 1 ? "p1" : "neutral";
    const classes = [
      "marker",
      ownerClass,
      wastelands.has(territory.id) && state.owner === null ? "wasteland" : "",
      selectedTerritoryId === territory.id ? "selected" : ""
    ].filter(Boolean).join(" ");
    const radius = Math.max(13, Math.min(24, 11 + Math.sqrt(state.armies) * 2.2));
    return `
      <g class="${classes}" data-territory-id="${territory.id}" transform="translate(${territory.x} ${territory.y})">
        <circle class="outer" r="${radius + 3}"></circle>
        <circle class="inner" r="${radius}"></circle>
        <text>${state.armies}</text>
      </g>`;
  }).join("");

  els.board.innerHTML = `
    <rect class="sea" x="0" y="0" width="${mapPayload.map.viewBox.width}" height="${mapPayload.map.viewBox.height}"></rect>
    <image class="map-image" href="${mapPayload.rules.mapImage}" x="0" y="0" width="${mapPayload.map.viewBox.width}" height="${mapPayload.map.viewBox.height}" preserveAspectRatio="none"></image>
    ${ownerPatches}
    ${eventEdges}
    ${markers}
  `;
  els.board.querySelectorAll(".marker").forEach((marker) => {
    marker.addEventListener("click", () => {
      selectedTerritoryId = marker.dataset.territoryId;
      renderFrame();
    });
  });

  els.turnTitle.textContent = frame.phase === "initial"
    ? `Setup: picks allocated, ${setup.wastelands.length} wastelands`
    : `Turn ${frame.turn}: ${frame.events.length} executed orders`;
  renderScores(frame);
  renderEvents(frame);
  renderTerritoryDetails(frame);
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
    els.territoryDetails.textContent = "Select a marker on the board.";
    return;
  }
  const territory = replay.map.territories.find((candidate) => candidate.id === selectedTerritoryId);
  const state = frame.territories[selectedTerritoryId];
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
  return replay.map.territories.find((territory) => territory.id === territoryId)?.name ?? territoryId;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
