import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { createSavedSearch, type SavedSearchParams } from "@/lib/saved-searches.functions";

export function SaveSearchButton({
  params,
  resultCount,
}: {
  params: SavedSearchParams;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const create = useServerFn(createSavedSearch);
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });

  async function openDialog() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      toast("Sign in to save searches", {
        action: {
          label: "Sign in",
          onClick: () => navigate({ to: "/auth", search: { redirect: href } as never }),
        },
      });
      return;
    }
    setName(defaultName(params));
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const row = await create({ data: { name, params } });
      setSavedId(row.id);
      toast.success("Search saved");
      setTimeout(() => setOpen(false), 900);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-ink transition hover:-translate-y-0.5 hover:shadow-tactile"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Save search
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => !saving && setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lift"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">Save this search</h3>
                <p className="mt-0.5 text-xs text-ink/55">
                  {resultCount} {resultCount === 1 ? "home matches" : "homes match"} right now.
                  We'll show you what's new next time you visit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-ink/50 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-ink/50">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={saving || !name.trim() || !!savedId}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-cream shadow-tactile disabled:opacity-60"
            >
              {savedId ? (
                <>
                  <Check className="h-4 w-4" /> Saved
                </>
              ) : saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save search"
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function defaultName(p: SavedSearchParams): string {
  const bits: string[] = [];
  if (p.q) bits.push(p.q);
  if (p.type && p.type !== "any") bits.push(p.type.replace(/,/g, "/"));
  bits.push(p.mode === "sale" ? "for sale" : "for rent");
  if (p.max && p.max > 0) bits.push(`under ${p.max.toLocaleString("en-IN")}`);
  return bits.join(" · ").slice(0, 80) || "My search";
}
