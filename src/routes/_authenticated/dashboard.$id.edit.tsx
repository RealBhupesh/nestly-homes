import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ListingForm, type ExistingPhoto } from "@/components/nestly/ListingForm";
import type { ListingInput } from "@/lib/listing-schema";

export const Route = createFileRoute("/_authenticated/dashboard/$id/edit")({
  component: EditListing,
});

function EditListing() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const [state, setState] = useState<{
    initial: (Partial<ListingInput> & { cover_photo_url?: string | null }) | null;
    photos: ExistingPhoto[];
    loading: boolean;
    error?: string;
  }>({ initial: null, photos: [], loading: true });

  useEffect(() => {
    (async () => {
      const [{ data: listing, error: e1 }, { data: photos, error: e2 }] = await Promise.all([
        supabase.from("listings").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("listing_photos")
          .select("id, url, storage_path, position")
          .eq("listing_id", id)
          .order("position"),
      ]);
      if (e1 || e2 || !listing) {
        setState({
          initial: null,
          photos: [],
          loading: false,
          error: e1?.message ?? e2?.message ?? "Not found",
        });
        return;
      }
      setState({
        initial: listing as unknown as Partial<ListingInput> & { cover_photo_url?: string | null },
        photos: (photos ?? []) as ExistingPhoto[],
        loading: false,
      });
    })();
  }, [id]);

  if (state.loading) return <p className="text-sm text-ink/40">Loading…</p>;
  if (state.error || !state.initial) {
    return (
      <div className="rounded-xl border border-border/70 p-14 text-center">
        <p className="text-lg font-medium text-ink">Listing not found</p>
        <Link
          to="/dashboard"
          className="mt-3 inline-block text-[13px] text-ink/70 underline underline-offset-4 hover:text-ink"
        >
          Back to listings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between border-b border-border/70 pb-8">
        <div>
          <p className="text-[11px] tracking-wide text-ink/50">
            <Link to="/dashboard" className="hover:text-ink">
              Listings
            </Link>{" "}
            / Edit
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            {state.initial.title || "Untitled"}
          </h1>
        </div>
      </div>
      <ListingForm
        userId={user.id}
        listingId={id}
        initial={state.initial}
        initialPhotos={state.photos}
      />
    </div>
  );
}
