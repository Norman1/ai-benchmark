import { MEDIUM_EARTH_TOPOLOGY } from "./medium-earth-topology.js";

export const MEDIUM_EARTH_MAP = deepFreeze(MEDIUM_EARTH_TOPOLOGY);

export function assertMapIntegrity(map = MEDIUM_EARTH_MAP) {
  const territoryIds = new Set(map.territories.map((territory) => territory.id));
  const errors = [];

  if (!map.viewBox?.width || !map.viewBox?.height) {
    errors.push("Map is missing a viewBox.");
  }

  for (const territory of map.territories) {
    if (!Array.isArray(map.adjacency[territory.id])) {
      errors.push(`Missing adjacency for ${territory.id}`);
    }
    if (!territory.bonusId || !map.bonuses.some((bonus) => bonus.id === territory.bonusId)) {
      errors.push(`Unknown bonus for ${territory.id}: ${territory.bonusId}`);
    }
  }

  for (const [territoryId, neighbors] of Object.entries(map.adjacency)) {
    if (!territoryIds.has(territoryId)) errors.push(`Unknown territory in adjacency: ${territoryId}`);
    for (const neighbor of neighbors) {
      if (!territoryIds.has(neighbor)) errors.push(`Unknown neighbor ${neighbor} from ${territoryId}`);
      if (!map.adjacency[neighbor]?.includes(territoryId)) {
        errors.push(`Adjacency is not symmetric: ${territoryId} -> ${neighbor}`);
      }
    }
  }

  const bonusMembership = new Map();
  for (const bonus of map.bonuses) {
    for (const territoryId of bonus.territories) {
      if (!territoryIds.has(territoryId)) errors.push(`Bonus ${bonus.id} references missing territory ${territoryId}`);
      if (bonusMembership.has(territoryId)) {
        errors.push(`${territoryId} belongs to multiple bonuses: ${bonusMembership.get(territoryId)}, ${bonus.id}`);
      }
      bonusMembership.set(territoryId, bonus.id);
    }
  }

  for (const territory of map.territories) {
    if (bonusMembership.get(territory.id) !== territory.bonusId) {
      errors.push(`Bonus membership mismatch for ${territory.id}: territory=${territory.bonusId}, bonus=${bonusMembership.get(territory.id)}`);
    }
  }

  for (const [from, to] of map.routeEdges ?? []) {
    if (!territoryIds.has(from) || !territoryIds.has(to)) {
      errors.push(`Route edge references missing territory: ${from} -> ${to}`);
    } else if (!map.adjacency[from]?.includes(to) || !map.adjacency[to]?.includes(from)) {
      errors.push(`Route edge is not in adjacency: ${from} -> ${to}`);
    }
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return true;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
