import { MEDIUM_EARTH_MAP_DATA } from "./medium-earth-map.generated.js";

export const MEDIUM_EARTH_MAP = deepFreeze(MEDIUM_EARTH_MAP_DATA);

export function getTerritory(map, id) {
  return map.territories.find((territory) => territory.id === id);
}

export function getBonus(map, id) {
  return map.bonuses.find((bonus) => bonus.id === id);
}

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

  for (const bonus of map.bonuses) {
    for (const territoryId of bonus.territories) {
      if (!territoryIds.has(territoryId)) errors.push(`Bonus ${bonus.id} references missing territory ${territoryId}`);
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
