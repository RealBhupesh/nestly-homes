import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listAllPhotos, deletePhotoAdmin } from "@/lib/admin.functions";
import { Trash2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/photos")({ component: AdminPhotos });

type Row = Awaited<ReturnType<typeof listAllPhotos>>[number];

function AdminPhotos() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);

  async function load() {
    setRows(null);
    try {
      setRows(await listAllPhotos());
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this photo? This also removes the file from storage.")) return;
    try {
      await deletePhotoAdmin({ data: { id } });
      setRows((r) => r?.filter((x) => x.id !== id) ?? null);
      setPreview(null);
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Content</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight text-ink">Photos</h1>
        <p className="mt-1 text-[13px] text-ink/60">{rows?.length ?? 0} recent uploads</p>
      </header>

      {rows === null && <p className="text-sm text-ink/50">Loading…</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {rows?.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreview(p)}
            className="group relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted"
          >
            <img
              src={p.url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left text-[10px] font-medium text-white opacity-0 group-hover:opacity-100">
              {new Date(p.created_at).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
      {rows?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-sm text-ink/50">
          No photos yet.
        </p>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={preview.url} alt="" className="max-h-[70vh] w-full object-contain bg-black" />
            <div className="flex items-center justify-between gap-3 border-t border-border/70 p-4 text-[13px]">
              <div className="min-w-0 truncate text-ink/60">{preview.storage_path}</div>
              <div className="flex items-center gap-2">
                <Link
                  to="/listing/$id"
                  params={{ id: preview.listing_id }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-ink hover:bg-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open listing
                </Link>
                <button
                  onClick={() => remove(preview.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-cream hover:bg-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
