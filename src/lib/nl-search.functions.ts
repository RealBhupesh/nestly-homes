import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  query: z.string().min(2).max(500),
});

// Models sometimes answer with everyday words; map them onto the DB enum.
const TYPE_ALIASES: Record<string, string> = {
  flat: "apartment",
  bhk: "apartment",
  "1bhk": "apartment",
  apartments: "apartment",
  villa: "house",
  bungalow: "house",
  independent: "house",
  "1rk": "studio",
  rk: "studio",
  hostel: "pg",
  "paying guest": "pg",
  shared: "room",
};

const FilterSchema = z.object({
  mode: z.enum(["rent", "sale"]).nullable().optional(),
  q: z.string().nullable().optional(),
  // Matches the DB enum public.property_type (plus "any").
  type: z.preprocess(
    (v) => (typeof v === "string" ? (TYPE_ALIASES[v.toLowerCase()] ?? v.toLowerCase()) : v),
    z.enum(["any", "room", "studio", "apartment", "house", "pg", "other"]).nullable().optional(),
  ),
  furn: z.enum(["any", "furnished", "semi", "unfurnished"]).nullable().optional(),
  max: z.number().nullable().optional(),
  sort: z.enum(["fresh", "price-asc", "price-desc", "distance"]).nullable().optional(),
});

export type ParsedFilters = z.infer<typeof FilterSchema>;

export const parseNaturalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { chatCompletion, parseModelJson } = await import("@/lib/ai.server");
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    await enforceRateLimit(
      `ai:nl:${context.userId}`,
      30,
      600,
      "Too many AI searches in a short time. Please wait a few minutes.",
    );

    const system = `You convert a renter/buyer's natural-language request into a JSON filter for a housing search.
Prices are in Indian Rupees. "15k" = 15000, "1.2 lakh" = 120000, "1 cr" = 10000000.
Only fill fields you are confident about. Use null for anything not specified.

Field values:
- mode: "rent" or "sale" (default null → keep current)
- q: short landmark/neighborhood/campus keyword, e.g. "COEP", "Koregaon Park". Null if none.
- type: "any" | "room" | "studio" | "apartment" | "house" | "pg" | "other"
  ("flat"/"BHK" = "apartment", "1RK" = "studio", "PG"/"hostel" = "pg", "villa"/"bungalow" = "house")
- furn: "any" | "furnished" | "semi" | "unfurnished"
- max: numeric max price (rupees). For rent this is per month. Null if unspecified.
- sort: "fresh" | "price-asc" | "price-desc" | "distance" (use "distance" if user mentions "near/close to <place>")

Return ONLY JSON, no prose.`;

    const userText = `Query: ${data.query}
Return JSON matching:
{ "mode": ..., "q": ..., "type": ..., "furn": ..., "max": ..., "sort": ... }`;

    const raw = await chatCompletion({
      json: true,
      timeoutMs: 20_000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    });
    const parsed: unknown = parseModelJson(raw);

    // Validate field-by-field so one odd value doesn't throw away the rest.
    const filters: ParsedFilters = {};
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      for (const key of Object.keys(FilterSchema.shape) as Array<keyof typeof FilterSchema.shape>) {
        const r = FilterSchema.shape[key].safeParse(obj[key]);
        if (r.success && r.data !== undefined) (filters as Record<string, unknown>)[key] = r.data;
      }
    }

    // Build a patch of only defined non-null fields
    const patch: Record<string, string | number> = {};
    if (filters.mode) patch.mode = filters.mode;
    if (filters.q) patch.q = filters.q;
    if (filters.type) patch.type = filters.type;
    if (filters.furn) patch.furn = filters.furn;
    if (typeof filters.max === "number" && filters.max > 0) patch.max = Math.round(filters.max);
    if (filters.sort) patch.sort = filters.sort;

    return { filters, patch };
  });
