// Typo-tolerant text matching helpers (client-side, no deps).

/** Bounded Damerau-Levenshtein distance. Returns `max + 1` when it exceeds `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let prevPrev: number[] = [];
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let curr: number[] = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2] + 1);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = curr;
    curr = new Array(n + 1);
  }
  return prev[n];
}

/** Allowed typos scale with word length: 4-5 chars → 1, 6-9 → 2, 10+ → 3. */
export function typoBudget(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 3;
}

/**
 * Score a single token against a haystack string.
 * 1 = exact substring, 0.9 = prefix, 0.5–0.85 = fuzzy word match, 0 = no match.
 */
export function tokenScore(token: string, haystack: string): number {
  if (!token || !haystack) return 0;
  if (haystack.includes(token)) return 1;
  const budget = typoBudget(token.length);
  if (budget === 0) return 0;
  let best = 0;
  for (const word of haystack.split(/[^a-z0-9]+/)) {
    if (!word) continue;
    if (word.startsWith(token) || token.startsWith(word)) {
      best = Math.max(best, 0.9);
      continue;
    }
    const d = editDistance(token, word, budget);
    if (d <= budget) {
      const ratio = 1 - d / Math.max(token.length, word.length);
      best = Math.max(best, 0.5 + ratio * 0.35);
    }
  }
  return best;
}

/** Highest token score across several fields, each with its own weight. */
export function fieldsScore(token: string, fields: Array<[string, number]>): number {
  let total = 0;
  for (const [text, weight] of fields) {
    const s = tokenScore(token, text);
    if (s > 0) total += s * weight;
  }
  return total;
}
