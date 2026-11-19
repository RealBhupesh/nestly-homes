import { describe, expect, it } from "vitest";
import { editDistance, typoBudget, tokenScore, fieldsScore } from "@/lib/fuzzy";

describe("editDistance", () => {
  it("is 0 for identical strings", () => {
    expect(editDistance("kothrud", "kothrud")).toBe(0);
  });

  it("counts substitutions, insertions and deletions", () => {
    expect(editDistance("baner", "banar")).toBe(1);
    expect(editDistance("aundh", "aund")).toBe(1);
    expect(editDistance("wakad", "wakadd")).toBe(1);
  });

  it("treats an adjacent transposition as a single edit", () => {
    expect(editDistance("viman", "vimna")).toBe(1);
  });

  it("returns max + 1 once the distance exceeds the bound", () => {
    expect(editDistance("hinjewadi", "kharadi", 2)).toBe(3);
    expect(editDistance("a", "abcdefgh", 3)).toBe(4);
  });
});

describe("typoBudget", () => {
  it("scales the allowed typos with word length", () => {
    expect(typoBudget(3)).toBe(0);
    expect(typoBudget(4)).toBe(1);
    expect(typoBudget(5)).toBe(1);
    expect(typoBudget(6)).toBe(2);
    expect(typoBudget(9)).toBe(2);
    expect(typoBudget(10)).toBe(3);
  });
});

describe("tokenScore", () => {
  it("scores an exact substring as 1", () => {
    expect(tokenScore("baner", "2bhk flat in baner pune")).toBe(1);
  });

  it("returns 0 for empty input", () => {
    expect(tokenScore("", "anything")).toBe(0);
    expect(tokenScore("baner", "")).toBe(0);
  });

  it("does not fuzzy-match short tokens", () => {
    expect(tokenScore("pgx", "studio near station")).toBe(0);
  });

  it("gives a partial score to a typo within budget", () => {
    const s = tokenScore("kothrd", "flat in kothrud");
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
  });

  it("returns 0 when nothing is close", () => {
    expect(tokenScore("hinjewadi", "flat in kothrud")).toBe(0);
  });
});

describe("fieldsScore", () => {
  it("sums weighted scores across matching fields only", () => {
    const fields: Array<[string, number]> = [
      ["baner", 3],
      ["a quiet flat", 1],
    ];
    expect(fieldsScore("baner", fields)).toBe(3);
    expect(fieldsScore("zzzz", fields)).toBe(0);
  });
});
