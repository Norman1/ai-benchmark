const els = {
  status: document.getElementById("status"),
  botA: document.getElementById("botA"),
  botB: document.getElementById("botB"),
  seed: document.getElementById("seed"),
  timeLimitMs: document.getElementById("timeLimitMs"),
  runMatch: document.getElementById("runMatch"),
  runTournament: document.getElementById("runTournament"),
  playPause: document.getElementById("playPause"),
  stepTurnBack: document.getElementById("stepTurnBack"),
  stepBack: document.getElementById("stepBack"),
  stepForward: document.getElementById("stepForward"),
  stepTurnForward: document.getElementById("stepTurnForward"),
  beginning: document.getElementById("beginning"),
  end: document.getElementById("end"),
  scrubber: document.getElementById("scrubber"),
  speed: document.getElementById("speed"),
  perspective: document.getElementById("perspective"),
  historyMeta: document.getElementById("historyMeta"),
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
  distribution: "#00a713",
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
let selectedBonusId = null;
let timer = null;
let board = null;

els.runMatch.addEventListener("click", runMatch);
els.runTournament.addEventListener("click", runTournament);
els.playPause.addEventListener("click", togglePlayback);
els.stepTurnBack.addEventListener("click", () => setFrame(findTurnStep(-1)));
els.stepBack.addEventListener("click", () => setFrame(frameIndex - 1));
els.stepForward.addEventListener("click", () => setFrame(frameIndex + 1));
els.stepTurnForward.addEventListener("click", () => setFrame(findTurnStep(1)));
els.beginning.addEventListener("click", () => setFrame(0));
els.end.addEventListener("click", () => replay && setFrame(replay.frames.length - 1));
els.scrubber.addEventListener("input", () => setFrame(Number(els.scrubber.value)));
els.perspective.addEventListener("change", () => replay && renderFrame());
els.board.addEventListener("click", (event) => {
  if (event.target === els.board || event.target.classList.contains("sea") || event.target.classList.contains("route")) {
    clearSelection();
  }
});

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
  els.timeLimitMs.value = String(mapPayload.rules.botTimeLimitMs);
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
        seed: els.seed.value || Date.now(),
        timeLimitMs: configuredTimeLimit()
      })
    });
    replay = result.replay;
    frameIndex = 0;
    selectedTerritoryId = null;
    selectedBonusId = null;
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
      body: JSON.stringify({ seed: els.seed.value || "web", gamesPerPair: 2, timeLimitMs: configuredTimeLimit() })
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

  const lastTurn = lastTurnNumber();
  const currentOrder = Number.isInteger(frame.currentEventIndex)
    ? `, order ${frame.currentEventIndex + 1} of ${frame.events.length}`
    : "";
  if (isDistributionFrame(frame)) {
    els.turnTitle.textContent = "History: Territory Distribution";
    els.historyMeta.textContent = frame.phase === "allocation"
      ? `Allocation ${frame.currentEventIndex + 1} of ${frame.events.length}`
      : "Submitted picks";
  } else if (frame.phase === "initial") {
    els.turnTitle.textContent = `Setup: picks allocated, ${setup.wastelands.length} wastelands`;
    els.historyMeta.textContent = `Beginning of ${lastTurn} turns`;
  } else {
    els.turnTitle.textContent = `Turn ${frame.turn}: ${frame.events.length} executed orders`;
    els.historyMeta.textContent = `Turn ${frame.turn} of ${lastTurn}${currentOrder}`;
  }
  renderScores(frame);
  renderEvents(frame);
  renderTerritoryDetails(frame);
}

function renderMapState(frame) {
  const visible = visibleTerritories(frame);
  const distribution = distributionRenderState(frame);
  for (const territory of board.territoryList) {
    const state = frame.territories[territory.id];
    if (!state) continue;
    const fogged = visible && !visible.has(territory.id);
    const picked = distribution?.picksByTerritory.has(territory.id);
    const owned = state.owner === 0 || state.owner === 1;
    const playerId = state.owner;
    const distributionBase = distribution?.availablePicks.has(territory.id) && !distribution?.wastelands.has(territory.id) && !owned;
    const fill = distributionBase ? COLORS.distribution : (owned ? COLORS.player[playerId].fill : COLORS.neutral);
    const textFill = owned ? COLORS.player[playerId].text : COLORS.neutralText;
    const textStroke = owned ? COLORS.player[playerId].stroke : "rgba(245, 245, 241, 0.9)";
    const selected = selectedTerritoryId === territory.id;
    const ownerName = owned ? `player-${playerId}` : "neutral";

    territory.path.style.fill = fill;
    territory.path.dataset.owner = ownerName;
    territory.path.dataset.armies = String(state.armies);
    territory.path.classList.toggle("selected", selected);
    territory.path.classList.toggle("bonus-highlight", selectedBonusId === territory.bonusId);
    territory.path.classList.toggle("fogged", fogged);
    territory.path.classList.toggle("distribution", distributionBase);
    territory.path.classList.toggle("pick", Boolean(picked));
    territory.label.textContent = fogged ? "" : String(state.armies);
    territory.label.style.fill = textFill;
    territory.label.style.stroke = selected ? COLORS.selected : textStroke;
    territory.label.dataset.owner = ownerName;
    territory.label.dataset.armies = String(state.armies);
    territory.label.classList.toggle("selected", selected);
    territory.label.classList.toggle("bonus-highlight", selectedBonusId === territory.bonusId);
    territory.label.classList.toggle("fogged", fogged);
    territory.label.classList.toggle("pick", Boolean(picked));
  }
  renderPickMarkers(distribution);
  for (const [bonusId, marker] of board.bonusMarkers) {
    const selected = selectedBonusId === bonusId;
    marker.path.classList.toggle("selected", selected);
    marker.text.classList.toggle("selected", selected);
  }
  renderSelectionOverlay();
  renderEventEdges(frame);
}

function renderEventEdges(frame) {
  board.eventLayer.replaceChildren();
  if (!Number.isInteger(frame.currentEventIndex)) return;
  const event = frame.events[frame.currentEventIndex];
  if (!event?.from || !event?.to) return;
  const from = board.territories.get(event.from);
  const to = board.territories.get(event.to);
  if (!from || !to) return;
  board.eventLayer.append(svg("line", {
    x1: from.labelPoint.x,
    y1: from.labelPoint.y,
    x2: to.labelPoint.x,
    y2: to.labelPoint.y,
    class: "event-edge",
    "marker-end": "url(#neighbor-arrowhead)"
  }));
}

function buildBoard(map, geometry) {
  const viewBox = geometry.viewBox ?? map.viewBox;
  els.board.setAttribute("viewBox", `0 0 ${viewBox.width} ${viewBox.height}`);
  els.board.replaceChildren();

  const sea = svg("rect", { x: 0, y: 0, width: viewBox.width, height: viewBox.height, class: "sea" });
  const routeLayer = svg("g", { class: "route-layer" });
  const territoryLayer = svg("g", { class: "territory-layer" });
  const bonusLayer = svg("g", { class: "bonus-layer" });
  const selectionLayer = svg("g", { class: "selection-layer" });
  const eventLayer = svg("g", { class: "event-layer" });
  const labelLayer = svg("g", { class: "label-layer" });
  const pickLayer = svg("g", { class: "pick-layer" });
  const defs = svg("defs");
  const arrowMarker = svg("marker", {
    id: "neighbor-arrowhead",
    viewBox: "0 0 10 10",
    refX: "8.5",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse"
  });
  arrowMarker.append(svg("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "neighbor-arrowhead" }));
  defs.append(arrowMarker);
  els.board.append(defs, sea, routeLayer, territoryLayer, bonusLayer, labelLayer, pickLayer, selectionLayer, eventLayer);

  const mapTerritories = new Map(map.territories.map((territory) => [territory.id, territory]));
  const geometryById = new Map(geometry.territories.map((territory) => [territory.id, territory]));
  const territories = new Map();
  const bonusMarkers = new Map();
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
    path.addEventListener("click", (event) => selectTerritory(event, territory.id));
    territoryLayer.append(path);
    const labelPoint = chooseLabelPoint(path, territoryGeometry.label);

    const label = svg("text", {
      x: labelPoint.x,
      y: labelPoint.y,
      class: "army-label",
      "data-id": territory.id
    });
    label.addEventListener("click", (event) => selectTerritory(event, territory.id));
    labelLayer.append(label);

    const merged = {
      ...territory,
      path,
      label,
      labelPoint
    };
    territories.set(territory.id, merged);
    territoryList.push(merged);
  }

  drawRouteHints(map, geometry, territories, routeLayer);
  drawBonusMarkers(map, geometry, bonusLayer, bonusMarkers);

  return { territories, territoryList, bonusMarkers, pickLayer, selectionLayer, eventLayer };
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

function drawBonusMarkers(map, geometry, bonusLayer, bonusMarkers) {
  const bonusById = new Map(map.bonuses.map((bonus) => [bonus.id, bonus]));
  for (const marker of geometry.bonusLinks) {
    const bonus = bonusById.get(marker.id);
    if (!bonus) continue;
    const path = svg("path", { d: marker.path, class: "bonus-marker", "data-bonus-id": bonus.id });
    path.style.fill = bonus.color;
    path.addEventListener("click", (event) => selectBonus(event, bonus.id));
    const text = svg("text", {
      x: marker.label.x,
      y: marker.label.y + 0.8,
      class: "bonus-marker-text",
      "data-bonus-id": bonus.id
    });
    text.textContent = String(bonus.value);
    text.addEventListener("click", (event) => selectBonus(event, bonus.id));
    bonusLayer.append(path, text);
    bonusMarkers.set(bonus.id, { path, text });
  }
}

function chooseLabelPoint(path, preferred) {
  try {
    const box = path.getBBox();
    if (box.width <= 0 || box.height <= 0) return preferred;

    const edgePoints = samplePath(path);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const columns = Math.max(8, Math.min(30, Math.ceil(box.width / 7)));
    const rows = Math.max(8, Math.min(30, Math.ceil(box.height / 7)));
    let best = null;

    for (let ix = 0; ix < columns; ix += 1) {
      for (let iy = 0; iy < rows; iy += 1) {
        const candidate = {
          x: box.x + (ix + 0.5) * box.width / columns,
          y: box.y + (iy + 0.5) * box.height / rows
        };
        if (!path.isPointInFill(new DOMPoint(candidate.x, candidate.y))) continue;
        const clearance = distanceToNearest(candidate, edgePoints);
        const centerDistance = distance(candidate, center);
        const preferredDistance = distance(candidate, preferred);
        const score = clearance * 2.4 - centerDistance * 0.05 - preferredDistance * 0.01;
        if (!best || score > best.score) best = { ...candidate, score };
      }
    }

    if (!best) return preferred;
    return { x: roundCoord(best.x), y: roundCoord(best.y) };
  } catch {
    return preferred;
  }
}

function samplePath(path) {
  const length = path.getTotalLength();
  const samples = Math.max(48, Math.min(180, Math.ceil(length / 5)));
  const points = [];
  for (let index = 0; index <= samples; index += 1) {
    const point = path.getPointAtLength(length * index / samples);
    points.push({ x: point.x, y: point.y });
  }
  return points;
}

function distanceToNearest(point, others) {
  let nearest = Infinity;
  for (const other of others) {
    const value = distance(point, other);
    if (value < nearest) nearest = value;
  }
  return nearest;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roundCoord(value) {
  return Math.round(value * 1000) / 1000;
}

function selectTerritory(event, territoryId) {
  event.stopPropagation();
  selectedTerritoryId = territoryId;
  selectedBonusId = null;
  if (replay) renderFrame();
}

function selectBonus(event, bonusId) {
  event.stopPropagation();
  selectedBonusId = bonusId;
  selectedTerritoryId = null;
  if (replay) renderFrame();
}

function clearSelection() {
  selectedTerritoryId = null;
  selectedBonusId = null;
  if (replay) renderFrame();
}

function renderSelectionOverlay() {
  board.selectionLayer.replaceChildren();
  if (!selectedTerritoryId) return;
  const source = board.territories.get(selectedTerritoryId);
  if (!source) return;
  const neighbors = replay.map.adjacency[selectedTerritoryId] ?? [];
  for (const neighborId of neighbors) {
    const target = board.territories.get(neighborId);
    if (!target) continue;
    board.selectionLayer.append(svg("line", {
      x1: source.labelPoint.x,
      y1: source.labelPoint.y,
      x2: target.labelPoint.x,
      y2: target.labelPoint.y,
      class: "neighbor-arrow",
      "marker-end": "url(#neighbor-arrowhead)"
    }));
  }
}

function renderPickMarkers(distribution) {
  board.pickLayer.replaceChildren();
  if (!distribution) return;

  for (const [territoryId, picks] of distribution.picksByTerritory) {
    const territory = board.territories.get(territoryId);
    if (!territory) continue;
    const offsets = markerOffsets(picks.length);
    for (let index = 0; index < picks.length; index += 1) {
      const pick = picks[index];
      const offset = offsets[index];
      const x = territory.labelPoint.x + offset.x;
      const y = territory.labelPoint.y + offset.y;
      const current = isCurrentPickMarker(pick);
      const group = svg("g", {
        class: `pick-marker ${current ? "current" : ""}`,
        "data-id": territoryId,
        "data-player": pick.playerId
      });
      const star = svg("path", {
        d: starPath(x, y, 24, 10),
        class: "pick-star"
      });
      star.style.fill = COLORS.player[pick.playerId].fill;
      star.style.stroke = COLORS.player[pick.playerId].stroke;
      const text = svg("text", {
        x,
        y: y + 0.5,
        class: "pick-star-text"
      });
      text.textContent = String(pick.priority);
      group.append(star, text);
      board.pickLayer.append(group);
    }
  }
}

function isCurrentPickMarker(pick) {
  const frame = replay.frames[frameIndex];
  const event = frame.events?.[frame.currentEventIndex];
  if (!event) return false;
  if (event.type === "pick") return pick.eventIndex === frame.currentEventIndex;
  if (event.type === "allocation") {
    return event.playerId === pick.playerId
      && event.territoryId === pick.territoryId
      && event.pickPriority === pick.priority;
  }
  return false;
}

function markerOffsets(count) {
  if (count <= 1) return [{ x: 0, y: 0 }];
  const radius = 9;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function starPath(cx, cy, outerRadius, innerRadius, points = 5) {
  const commands = [];
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + index * Math.PI / points;
    const x = roundCoord(cx + Math.cos(angle) * radius);
    const y = roundCoord(cy + Math.sin(angle) * radius);
    commands.push(`${index === 0 ? "M" : "L"} ${x} ${y}`);
  }
  commands.push("Z");
  return commands.join(" ");
}

function visibleTerritories(frame) {
  if (isDistributionFrame(frame)) return null;
  if (els.perspective.value === "all") return null;
  const playerId = Number(els.perspective.value);
  const visible = new Set();
  for (const [territoryId, state] of Object.entries(frame.territories)) {
    if (state.owner !== playerId) continue;
    visible.add(territoryId);
    for (const neighborId of replay.map.adjacency[territoryId] ?? []) visible.add(neighborId);
  }
  return visible;
}

function distributionRenderState(frame) {
  if (!isDistributionFrame(frame)) return null;
  const perspective = els.perspective.value;
  const picksByTerritory = new Map();
  const pickEvents = frame.pickEvents ?? frame.events;
  const revealedEvents = pickEvents.slice(0, frame.revealedPickCount ?? pickEvents.length);
  for (let eventIndex = 0; eventIndex < revealedEvents.length; eventIndex += 1) {
    const event = revealedEvents[eventIndex];
    if (event.type !== "pick") continue;
    if (perspective !== "all" && event.playerId !== Number(perspective)) continue;
    const territoryPicks = picksByTerritory.get(event.territoryId) ?? [];
    territoryPicks.push({ ...event, eventIndex });
    picksByTerritory.set(event.territoryId, territoryPicks);
  }
  return {
    availablePicks: new Set(replay.setup.availablePicks),
    wastelands: new Set(replay.setup.wastelands),
    picksByTerritory
  };
}

function isDistributionFrame(frame) {
  return frame.phase === "distribution" || frame.phase === "allocation";
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
      <strong><span class="player-swatch" style="--player-color: ${COLORS.player[playerId].fill}"></span>${escapeHtml(replay.players[playerId])}</strong>
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
    els.eventLog.innerHTML = `<li>${isDistributionFrame(frame) ? "No picks shown in this frame." : "No executed orders in this frame."}</li>`;
    return;
  }
  els.eventLog.innerHTML = frame.events.map((event, index) => `
    <li class="order-row ${index === frame.currentEventIndex ? "current-order" : ""}" style="--order-color: ${orderColor(event)}">
      <span class="order-icon ${orderIconClass(event)}" aria-hidden="true"></span>
      <span class="order-text">${escapeHtml(describeEvent(event))}</span>
    </li>
  `).join("");
  els.eventLog.querySelector(".current-order")?.scrollIntoView({ block: "nearest" });
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
  if (event.type === "pick") {
    return `${name(event.territoryId)}`;
  }
  if (event.type === "allocation") {
    const priority = event.pickPriority === null ? "random" : `pick ${event.pickPriority}`;
    return `${name(event.territoryId)} allocated (${priority})`;
  }
  if (event.type === "deploy") {
    return `Deploy ${event.armies} to ${name(event.territoryId)}${event.fallback ? " (fallback)" : ""}`;
  }
  if (event.type === "transfer") {
    return `${formatArmies(event.armies)} transferred to ${name(event.to)} from ${name(event.from)}`;
  }
  if (event.type === "attack") {
    if (event.captured) {
      return `${formatArmies(event.remainingAttackers)} captured ${name(event.to)} from ${name(event.from)}`;
    }
    return `${formatArmies(event.armies)} failed to take ${name(event.to)} from ${name(event.from)}`;
  }
  return player ? `${player}: ${event.type}` : event.type;
}

function orderColor(event) {
  return COLORS.player[event.playerId]?.fill ?? COLORS.neutral;
}

function orderIconClass(event) {
  if (event.type === "deploy" || event.type === "pick" || event.type === "allocation") return event.type;
  return "move";
}

function formatArmies(value) {
  const armies = Number(value);
  return `${armies} ${armies === 1 ? "army" : "armies"}`;
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

function findTurnStep(direction) {
  if (!replay) return 0;
  const currentFrame = replay.frames[frameIndex];
  if (direction > 0 && isSetupFrame(currentFrame)) {
    const firstTurnFrame = replay.frames.findIndex((frame) => !isSetupFrame(frame));
    return firstTurnFrame === -1 ? replay.frames.length - 1 : firstTurnFrame;
  }
  const currentTurn = currentFrame.turn;
  const targetTurns = replay.frames
    .filter((frame) => frame.phase !== "initial")
    .map((frame) => frame.turn)
    .filter((turn) => direction > 0 ? turn > currentTurn : turn < currentTurn);
  if (!targetTurns.length) return direction > 0 ? replay.frames.length - 1 : 0;
  const targetTurn = direction > 0 ? Math.min(...targetTurns) : Math.max(...targetTurns);
  const targetIndex = replay.frames.findIndex((frame) => frame.turn === targetTurn && frame.phase !== "initial");
  return targetIndex === -1 ? frameIndex : targetIndex;
}

function lastTurnNumber() {
  if (!replay?.frames.length) return 0;
  return Math.max(...replay.frames.map((frame) => frame.turn));
}

function isSetupFrame(frame) {
  return isDistributionFrame(frame) || frame.phase === "initial";
}

function setBusy(busy) {
  for (const button of [els.runMatch, els.runTournament]) button.disabled = busy;
}

function setStatus(text) {
  els.status.textContent = text;
}

function configuredTimeLimit() {
  const value = Number(els.timeLimitMs.value);
  return Number.isFinite(value) && value > 0 ? value : mapPayload.rules.botTimeLimitMs;
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
