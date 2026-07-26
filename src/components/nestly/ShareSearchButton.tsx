import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { toast } from "sonner";

export function ShareSearchButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: "Nestly search", url });
          return;
        } catch {
          /* fall through to clipboard */
        }
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Search link copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-ink transition hover:-translate-y-0.5 hover:shadow-tactile"
      title="Copy this search link with your radius and location"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Share search"}
    </button>
  );
}