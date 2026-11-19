import { toast } from "sonner";
import { COMPARE_MAX, toggleCompare, useCompareIds } from "@/lib/compare-store";

export function CompareToggle({ id, title }: { id: string; title: string }) {
  const ids = useCompareIds();
  const active = ids.includes(id);

  return (
    <button
      type="button"
      aria-label={active ? `Remove ${title} from compare` : `Add ${title} to compare`}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const res = toggleCompare(id);
        if (res.full) {
          toast.warning(`Compare tray is full (${COMPARE_MAX} max)`, {
            description: "Remove one to add another.",
          });
        } else if (res.added) {
          toast.success("Added to compare");
        }
      }}
      className={`grid h-9 w-9 place-items-center rounded-full shadow-tactile backdrop-blur transition hover:scale-110 ${
        active
          ? "bg-ink text-cream ring-2 ring-primary/60"
          : "bg-card/95 text-ink hover:text-primary"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 3 4 7l4 4" />
        <path d="M4 7h16" />
        <path d="m16 21 4-4-4-4" />
        <path d="M20 17H4" />
      </svg>
    </button>
  );
}
