import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  query: z.string().min(2).max(500),
});

const FilterSchema = z.object({
  mode: z.enum(["rent", "sale"]).nullable().optional(),
  q: z.string().nullable().optional(),
  type: z.enum(["any", "room", "pg", "flat", "house"]).nullable().optional(),
  furn: z.enum(["any", "furnished", "semi", "unfurnished"]).nullable().optional(),
  max: z.number().nullable().optional(),
  sort: z.enum(["fresh", "price-asc", "price-desc", "distance"]).nullable().optional(),
});

export type ParsedFilters = z.infer<typeof FilterSchema>;

export const parseNaturalSearch = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const system = `You convert a renter/buyer's natural-language request into a JSON filter for a housing search.
Prices are in Indian Rupees. "15k" = 15000, "1.2 lakh" = 120000, "1 cr" = 10000000.
Only fill fields you are confident about. Use null for anything not specified.

Field values:
- mode: "rent" or "sale" (default null → keep current)
- q: short landmark/neighborhood/campus keyword, e.g. "COEP", "Koregaon Park". Null if none.
- type: "any" | "room" | "pg" | "flat" | "house"
- furn: "any" | "furnished" | "semi" | "unfurnished"
- max: numeric max price (rupees). For rent this is per month. Null if unspecified.
- sort: "fresh" | "price-asc" | "price-desc" | "distance" (use "distance" if user mentions "near/close to <place>")

Return ONLY JSON, no prose.`;

    const userText = `Query: ${data.query}
Return JSON matching:
{ "mode": ..., "q": ..., "type": ..., "furn": ..., "max": ..., "sort": ... }`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" as const },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
      }),
    });
    if (res.status === 429) throw new Error("AI is busy — try again in a minute.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits.");
    if (!res.ok) throw new Error(`AI request failed: ${res.status}`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      try { parsed = JSON.parse(stripped); } catch { parsed = {}; }
    }

    const safe = FilterSchema.safeParse(parsed);
    const filters: ParsedFilters = safe.success ? safe.data : {};

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