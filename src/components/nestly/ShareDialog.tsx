import { useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  listingId: string;
  title: string;
  city?: string;
  price?: number;
  mode?: "rent" | "sale";
}

export function ShareDialog({ open, onClose, listingId, title, city, price, mode }: Props) {
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/listing/${listingId}`;
  }, [listingId]);

  const message = useMemo(() => {
    const parts: string[] = [];
    parts.push(`🏠 ${title}`);
    if (city) parts.push(`📍 ${city}`);
    if (price && mode)
      parts.push(`💸 ₹${price.toLocaleString("en-IN")}${mode === "rent" ? "/mo" : ""}`);
    parts.push("");
    parts.push("Zero brokerage. See photos + details on Nestly:");
    parts.push(url);
    return parts.join("\n");
  }, [title, city, price, mode, url]);

  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy");
    }
  }

  function downloadQR() {
    const canvas = document.querySelector<HTMLCanvasElement>("#nestly-share-qr canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `nestly-${listingId.slice(0, 8)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-border bg-background p-6 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] tracking-wide text-ink/50">Share listing</p>
            <h3 className="mt-1 text-lg font-medium text-ink">Send it in one tap</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-ink/50 hover:bg-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex gap-5">
          <div id="nestly-share-qr" className="rounded-xl border border-border bg-white p-3">
            <QRCodeCanvas
              value={url}
              size={128}
              bgColor="#ffffff"
              fgColor="#1D1D28"
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="truncate text-[13px] font-medium text-ink">{title}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink/50">
                {url.replace(/^https?:\/\//, "")}
              </p>
            </div>
            <button
              onClick={downloadQR}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] font-medium text-ink hover:bg-muted"
            >
              Download QR
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-[13px] font-medium text-white hover:brightness-95"
          >
            <MessageCircle className="h-4 w-4" />
            Share on WhatsApp
          </a>
          <button
            onClick={copyLink}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-muted"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}
