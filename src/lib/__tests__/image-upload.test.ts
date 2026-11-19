import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  checkImageFile,
  extensionForMime,
  fitWithin,
  mapWithConcurrency,
} from "@/lib/image-upload";

describe("fitWithin", () => {
  it("never upscales small images", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2000, 1000)).toEqual({ width: 2000, height: 1000 });
  });

  it("scales the long edge down to the limit, keeping aspect ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(1000, 500, 100)).toEqual({ width: 100, height: 50 });
  });

  it("handles degenerate sizes", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(10000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
});

describe("extensionForMime", () => {
  it("maps output MIME types to extensions", () => {
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/heic")).toBe("heic");
    expect(extensionForMime("IMAGE/WEBP; charset=binary")).toBe("webp");
  });

  it("defaults to jpg for unknown types", () => {
    expect(extensionForMime("")).toBe("jpg");
    expect(extensionForMime("application/x-evil")).toBe("jpg");
  });
});

describe("checkImageFile", () => {
  it("accepts images up to 8MB", () => {
    expect(checkImageFile({ name: "a.jpg", type: "image/jpeg", size: MAX_UPLOAD_BYTES })).toEqual({
      ok: true,
    });
  });

  it("rejects non-images and oversize files", () => {
    expect(checkImageFile({ name: "a.pdf", type: "application/pdf", size: 10 }).ok).toBe(false);
    expect(
      checkImageFile({ name: "a.jpg", type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 }),
    ).toEqual({
      ok: false,
      reason: "a.jpg is over 8MB",
    });
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const items = [30, 5, 20, 1, 10, 15, 2];
    const out = await mapWithConcurrency(items, 3, async (ms, i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, ms));
      active--;
      return `${i}:${ms}`;
    });
    expect(out).toEqual(items.map((ms, i) => `${i}:${ms}`));
    expect(peak).toBe(3);
  });

  it("handles empty input", async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });
});
