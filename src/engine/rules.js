export const RULES = Object.freeze({
  players: 2,
  startsPerPlayer: 3,
  picksPerPlayer: 6,
  baseIncome: 5,
  initialArmiesPerStart: 4,
  neutralArmies: 2,
  distributionNeutralArmies: 4,
  wastelandCount: 7,
  wastelandArmies: 10,
  offensiveKillRate: 0.6,
  defensiveKillRate: 0.7,
  maxTurns: 120,
  botTimeLimitMs: 350,
  maxBotLineLength: 1024 * 1024,
  mapImage: "/assets/medium-earth-clean.png"
});

export function straightRound(value) {
  return Math.floor(value + 0.5);
}
