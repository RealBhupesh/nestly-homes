import { describe, expect, it } from "vitest";
import { COMMUTE_DESTS, commuteMinutes, getDest, haversineKm, isCommuteMode } from "@/lib/commute";

describe("haversineKm", () => {
  it("is 0 for the same point", () => {
    expect(haversineKm({ lat: 18.52, lng: 73.85 }, { lat: 18.52, lng: 73.85 })).toBe(0);
  });

  it("matches a known distance (one degree of latitude ≈ 111.2 km)", () => {
    expect(haversineKm({ lat: 18, lng: 73 }, { lat: 19, lng: 73 })).toBeCloseTo(111.19, 1);
  });

  it("is symmetric", () => {
    const a = { lat: 18.5308, lng: 73.8475 };
    const b = { lat: 18.5913, lng: 73.7389 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
});

describe("commuteMinutes", () => {
  const coep = getDest("coep")!;
  const hinjewadi = getDest("hinjewadi")!;

  it("returns whole minutes", () => {
    expect(Number.isInteger(commuteMinutes(coep, hinjewadi, "bus"))).toBe(true);
  });

  it("is slower on foot than by bike, bus or car", () => {
    const walk = commuteMinutes(coep, hinjewadi, "walk");
    const bike = commuteMinutes(coep, hinjewadi, "bike");
    const drive = commuteMinutes(coep, hinjewadi, "drive");
    expect(walk).toBeGreaterThan(bike);
    expect(bike).toBeGreaterThan(drive);
  });

  it("is 0 for the same place", () => {
    expect(commuteMinutes(coep, coep, "drive")).toBe(0);
  });
});

describe("getDest / isCommuteMode", () => {
  it("finds curated destinations by key", () => {
    expect(getDest("pune-station")?.label).toBe("Pune Railway Station");
    expect(getDest("nope")).toBeUndefined();
  });

  it("has unique keys and coordinates inside Pune", () => {
    const keys = COMMUTE_DESTS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const d of COMMUTE_DESTS) {
      expect(d.lat).toBeGreaterThan(18.3);
      expect(d.lat).toBeLessThan(18.8);
      expect(d.lng).toBeGreaterThan(73.6);
      expect(d.lng).toBeLessThan(74.1);
    }
  });

  it("validates commute modes", () => {
    expect(isCommuteMode("walk")).toBe(true);
    expect(isCommuteMode("drive")).toBe(true);
    expect(isCommuteMode("train")).toBe(false);
    expect(isCommuteMode("")).toBe(false);
  });
});
