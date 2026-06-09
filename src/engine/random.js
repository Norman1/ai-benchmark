export class SeededRandom {
  constructor(seed = 1) {
    this.state = normalizeSeed(seed);
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  pick(items) {
    return items[this.int(items.length)];
  }
}

export function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0 || 1;
  const text = String(seed ?? "1");
  if (/^\d+$/.test(text)) return Number(text) >>> 0 || 1;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}
