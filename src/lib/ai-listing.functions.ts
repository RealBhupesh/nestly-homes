import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Photos are stored as long-lived signed URLs in Supabase Storage; Gemini can fetch them directly.
const InputSchema = z.object({
  photoUrls: z.array(z.string().url()).min(1).max(6),
  mode: z.enum(["rent", "sale"]).default("rent"),
  city: z.string().optional().nullable(),
});

const AMENITIES = [
  "Wi-Fi",
  "AC",
  "Geyser",
  "Parking",
  "Lift",
  "Power backup",
  "Security",
  "Balcony",
  "Kitchen",
  "Washing machine",
  "Refrigerator",
  "Gym",
  "Pet friendly",
  "Study desk",
];

export const autofillListingFromPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { chatCompletion, parseModelJson } = await import("@/lib/ai.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    await enforceRateLimit(
      `ai:autofill:${context.userId}`,
      15,
      3600,
      "You've used AI autofill a lot this hour. Please try again later.",
    );

    const system = `You are a real-estate copywriter for an Indian housing marketplace called Nestly.
You look at photos of a property and produce a warm, honest, editorial-style listing.
You NEVER invent facts you cannot see (no fake addresses, no fake amenities).
If unsure about a field, use null. Keep description under 90 words.
Amenities MUST be chosen from this closed list: ${AMENITIES.join(", ")}.`;

    const userText = `Write a listing for this property (${data.mode === "rent" ? "for rent" : "for sale"}${data.city ? `, in ${data.city}` : ""}).
Return STRICT JSON only, matching this shape:
{
  "title": string,
  "description": string,
  "property_type": "room"|"studio"|"apartment"|"house"|"pg"|"other",
  "furnishing": "unfurnished"|"semi"|"furnished",
  "bedrooms": number,
  "bathrooms": number,
  "amenities": string[]
}`;

    const raw = await chatCompletion({
      json: true,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...data.photoUrls.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
    });
    const parsed = parseModelJson(raw);

    // Sanitize / clamp so we never trust the model blindly.
    const propTypes = ["room", "studio", "apartment", "house", "pg", "other"] as const;
    const furns = ["unfurnished", "semi", "furnished"] as const;
    const amenSet = new Set(AMENITIES);

    const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
    };
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

    return {
      title: str(parsed.title, 120) || "Untitled listing",
      description: str(parsed.description, 4000),
      property_type: (propTypes as readonly string[]).includes(String(parsed.property_type))
        ? (parsed.property_type as (typeof propTypes)[number])
        : "apartment",
      furnishing: (furns as readonly string[]).includes(String(parsed.furnishing))
        ? (parsed.furnishing as (typeof furns)[number])
        : "semi",
      bedrooms: clampInt(parsed.bedrooms, 0, 20, 1),
      bathrooms: clampInt(parsed.bathrooms, 0, 20, 1),
      amenities: Array.isArray(parsed.amenities)
        ? (parsed.amenities as unknown[])
            .map(String)
            .filter((a) => amenSet.has(a))
            .slice(0, 14)
        : [],
    };
  });
