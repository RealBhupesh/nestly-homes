import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const paramsSchema = z.object({
  mode: z.string().optional(),
  q: z.string().optional(),
  type: z.string().optional(),
  max: z.number().optional(),
  furn: z.string().optional(),
  sort: z.string().optional(),
  view: z.string().optional(),
});

export type SavedSearchParams = z.infer<typeof paramsSchema>;

export interface SavedSearchRow {
  id: string;
  name: string;
  params: SavedSearchParams;
  last_seen_at: string;
  created_at: string;
  alert_frequency: AlertFrequency;
  last_notified_at: string | null;
  last_match_count: number;
}

export type AlertFrequency = "off" | "instant" | "daily";
const alertSchema = z.enum(["off", "instant", "daily"]);

const SELECT_COLS =
  "id, name, params, last_seen_at, created_at, alert_frequency, last_notified_at, last_match_count";

export const listSavedSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("saved_searches")
      .select(SELECT_COLS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SavedSearchRow[];
  });

export const createSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { name: string; params: SavedSearchParams; alertFrequency?: AlertFrequency }) => ({
      name: input.name.trim().slice(0, 80) || "Untitled search",
      params: paramsSchema.parse(input.params ?? {}),
      alertFrequency: alertSchema.parse(input.alertFrequency ?? "off"),
    }),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("saved_searches")
      .insert({
        user_id: context.userId,
        name: data.name,
        params: data.params,
        alert_frequency: data.alertFrequency,
      })
      .select(SELECT_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as SavedSearchRow;
  });

export const setSavedSearchAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; frequency: AlertFrequency }) => ({
    id: z.string().uuid().parse(input.id),
    frequency: alertSchema.parse(input.frequency),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_searches")
      .update({ alert_frequency: data.frequency })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: z.string().uuid().parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("saved_searches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const touchSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: z.string().uuid().parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_searches")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
