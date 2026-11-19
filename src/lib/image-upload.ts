// Client-side photo preparation for listing uploads:
//  - downscale to MAX_EDGE px on the long edge,
//  - re-encode to WebP (which also drops EXIF, including the owner's GPS location),
//  - fall back to the original file when the browser can't decode it (e.g. HEIC
//    outside Safari), while still enforcing type and size limits.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_EDGE = 2000;
export const WEBP_QUALITY = 0.82;
export const UPLOAD_CONCURRENCY = 3;

const MIME_EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** File extension for an image MIME type (never derived from the user's file name). */
export function extensionForMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  return MIME_EXT[base] ?? "jpg";
}

/** Scale (w, h) so the long edge is at most `maxEdge`, preserving aspect ratio. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type FileCheck = { ok: true } | { ok: false; reason: string };

/** Basic validation applied to both the original and the processed file. */
export function checkImageFile(file: { name: string; type: string; size: number }): FileCheck {
  if (!file.type.startsWith("image/")) return { ok: false, reason: `${file.name} isn't an image` };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: `${file.name} is over 8MB` };
  return { ok: true };
}

/** Run `worker` over `items` with at most `limit` in flight. Results keep input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function canvasToBlob(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    draw(ctx);
    return canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  draw(ctx);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
}

/**
 * Downscale + re-encode to WebP. Returns the original file if decoding or encoding
 * isn't possible, or if the browser silently produced PNG instead of WebP (old Safari).
 */
export async function prepareImageForUpload(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  // GIFs may be animated; re-encoding would keep only the first frame.
  if (file.type === "image/gif") return file;
  let bitmap: ImageBitmap | undefined;
  try {
    // "from-image" applies the EXIF orientation before we drop the metadata.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (!width || !height) return file;
    const bmp = bitmap;
    const blob = await canvasToBlob(width, height, (ctx) => {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, width, height);
    });
    if (!blob || blob.type !== "image/webp") return file;
    return blob;
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
