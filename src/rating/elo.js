export function expectedScore(rating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function updateElo(rating, expected, actual, k = 32) {
  return Math.round(rating + k * (actual - expected));
}
