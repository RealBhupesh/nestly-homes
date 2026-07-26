import { createFileRoute } from "@tanstack/react-router";
import { ListingForm } from "@/components/nestly/ListingForm";

export const Route = createFileRoute("/_authenticated/dashboard/new")({
  component: NewListing,
});

function NewListing() {
  const { user } = Route.useRouteContext();
  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between border-b border-border/70 pb-8">
        <div>
          <p className="text-[11px] tracking-wide text-ink/50">Listings / New</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink sm:text-4xl">Post a place</h1>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink/55">
            Six short sections. Save as a draft any time — nothing is published until you say so.
          </p>
        </div>
      </div>
      <ListingForm userId={user.id} />
    </div>
  );
}