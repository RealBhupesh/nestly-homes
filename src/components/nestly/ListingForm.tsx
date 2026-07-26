import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Star, ImageIcon, Sparkles, GripVertical } from "lucide-react";
import {
  listingSchema,
  AMENITY_OPTIONS,
  PROPERTY_TYPES,
  FURNISHINGS,
  type ListingInput,
} from "@/lib/listing-schema";
import { autofillListingFromPhotos } from "@/lib/ai-listing.functions";
import { AddressPicker } from "./AddressPicker";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { X as XIcon, MapPin, Check, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const SIGNED_URL_YEARS = 60 * 60 * 24 * 365 * 10; // 10 years

const AUTOSAVE_PREFIX = "nestly:listing-draft:v1";
const AUTOSAVE_DEBOUNCE_MS = 800;

function autosaveKey(userId: string, listingId?: string) {
  return `${AUTOSAVE_PREFIX}:${userId}:${listingId ?? "new"}`;
}

export interface ExistingPhoto {
  id: string;
  url: string;
  storage_path: string;
  position: number;
}

interface Props {
  userId: string;
  listingId?: string;
  initial?: Partial<ListingInput> & { cover_photo_url?: string | null };
  initialPhotos?: ExistingPhoto[];
}

const defaults: ListingInput = {
  title: "",
  description: "",
  mode: "rent",
  status: "draft",
  property_type: "apartment",
  furnishing: "unfurnished",
  bedrooms: 1,
  bathrooms: 1,
  area_sqft: null,
  price_amount: 0,
  deposit_amount: null,
  seeking_count: null,
  address_line: "",
  city: "",
  state: null,
  country: "India",
  postal_code: null,
  latitude: null,
  longitude: null,
  amenities: [],
  nearby: [],
  available_from: null,
  contact_name: null,
  contact_phone: null,
};

export function ListingForm({ userId, listingId, initial, initialPhotos = [] }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<ListingInput>({ ...defaults, ...(initial ?? {}) } as ListingInput);
  const [photos, setPhotos] = useState<ExistingPhoto[]>(initialPhotos);
  const [coverUrl, setCoverUrl] = useState<string | null>(initial?.cover_photo_url ?? initialPhotos[0]?.url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const runAutofill = useServerFn(autofillListingFromPhotos);
  const [nearbyQuery, setNearbyQuery] = useState("");
  const [autosavedAt, setAutosavedAt] = useState<number | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const hydratedRef = useRef(false);

  // Restore autosaved draft on mount
  useEffect(() => {
    if (typeof window === "undefined" || hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(autosaveKey(userId, listingId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { form?: Partial<ListingInput>; savedAt?: number };
      if (!parsed?.form) return;
      setForm((f) => ({ ...f, ...parsed.form }));
      setRestoredAt(parsed.savedAt ?? Date.now());
      toast("Restored your unsaved draft", {
        action: {
          label: "Discard",
          onClick: () => {
            localStorage.removeItem(autosaveKey(userId, listingId));
            setForm({ ...defaults, ...(initial ?? {}) } as ListingInput);
            setRestoredAt(null);
            setAutosavedAt(null);
            toast.success("Discarded draft");
          },
        },
      });
    } catch {
      // ignore corrupt payloads
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave to localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !hydratedRef.current) return;
    const handle = setTimeout(() => {
      try {
        const savedAt = Date.now();
        localStorage.setItem(
          autosaveKey(userId, listingId),
          JSON.stringify({ form, savedAt }),
        );
        setAutosavedAt(savedAt);
      } catch {
        // storage full or blocked — silent
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [form, userId, listingId]);

  function clearAutosave() {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(autosaveKey(userId, listingId));
    } catch {
      /* noop */
    }
    setAutosavedAt(null);
    setRestoredAt(null);
  }

  const update = <K extends keyof ListingInput>(key: K, value: ListingInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleAmenity = (a: string) =>
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a],
    }));

  async function ensureListing(): Promise<string> {
    if (listingId) return listingId;
    // create a stub draft so photos have somewhere to attach
    const { data, error } = await supabase
      .from("listings")
      .insert({
        owner_id: userId,
        title: form.title || "Untitled draft",
        mode: form.mode,
        status: "draft",
        property_type: form.property_type,
        furnishing: form.furnishing,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        price_amount: form.price_amount || 0,
        address_line: form.address_line || "TBD",
        city: form.city || "TBD",
        country: form.country || "India",
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("Could not create draft");
    navigate({ to: "/dashboard/$id/edit", params: { id: data.id }, replace: true });
    return data.id;
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const id = await ensureListing();
      const nextPos = photos.length;
      const uploads: ExistingPhoto[] = [];
      let i = 0;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`${file.name} is over 8MB`);
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${userId}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("listing-photos")
          .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
        if (upErr) {
          toast.error(upErr.message);
          continue;
        }
        const { data: signed } = await supabase.storage
          .from("listing-photos")
          .createSignedUrl(path, SIGNED_URL_YEARS);
        const url = signed?.signedUrl ?? "";
        const { data: row, error: dbErr } = await supabase
          .from("listing_photos")
          .insert({ listing_id: id, owner_id: userId, storage_path: path, url, position: nextPos + i })
          .select("id, url, storage_path, position")
          .single();
        if (dbErr || !row) {
          toast.error(dbErr?.message ?? "Save failed");
          continue;
        }
        uploads.push(row);
        i++;
      }
      setPhotos((p) => [...p, ...uploads]);
      if (!coverUrl && uploads[0]) {
        setCoverUrl(uploads[0].url);
        await supabase.from("listings").update({ cover_photo_url: uploads[0].url }).eq("id", id);
      }
      if (uploads.length) toast.success(`Uploaded ${uploads.length} photo${uploads.length > 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto(p: ExistingPhoto) {
    if (!confirm("Remove this photo?")) return;
    await supabase.storage.from("listing-photos").remove([p.storage_path]);
    await supabase.from("listing_photos").delete().eq("id", p.id);
    setPhotos((all) => all.filter((x) => x.id !== p.id));
    if (coverUrl === p.url) {
      const next = photos.find((x) => x.id !== p.id)?.url ?? null;
      setCoverUrl(next);
      if (listingId) await supabase.from("listings").update({ cover_photo_url: next }).eq("id", listingId);
    }
  }

  async function setCover(p: ExistingPhoto) {
    setCoverUrl(p.url);
    if (listingId) await supabase.from("listings").update({ cover_photo_url: p.url }).eq("id", listingId);
    toast.success("Cover photo updated");
  }

  async function reorderPhotos(fromId: string, toId: string) {
    const oldIdx = photos.findIndex((p) => p.id === fromId);
    const newIdx = photos.findIndex((p) => p.id === toId);
    if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
    const reordered = arrayMove(photos, oldIdx, newIdx);
    setPhotos(reordered);
    // Persist new positions
    await Promise.all(
      reordered.map((p, i) =>
        supabase.from("listing_photos").update({ position: i }).eq("id", p.id),
      ),
    );
  }

  async function runAiAutofill() {
    if (photos.length === 0) {
      toast.error("Upload a few photos first");
      return;
    }
    setAiLoading(true);
    try {
      const result = await runAutofill({
        data: {
          photoUrls: photos.slice(0, 6).map((p) => p.url),
          mode: form.mode,
          city: form.city || null,
        },
      });
      // Merge, but never overwrite user's non-empty text.
      setForm((f) => ({
        ...f,
        title: f.title.trim() || result.title,
        description: f.description.trim() || result.description,
        property_type: result.property_type,
        furnishing: result.furnishing,
        bedrooms: result.bedrooms,
        bathrooms: result.bathrooms,
        amenities: Array.from(new Set([...(f.amenities ?? []), ...result.amenities])),
      }));
      toast.success("Filled in from your photos — review & tweak");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI autofill failed");
    } finally {
      setAiLoading(false);
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  function handleDragEnd(evt: DragEndEvent) {
    const { active, over } = evt;
    if (over && active.id !== over.id) reorderPhotos(String(active.id), String(over.id));
  }

  async function save(publish: boolean) {
    setSaving(true);
    try {
      const parsed = listingSchema.safeParse(form);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Check the form");
        return;
      }
      const payload = {
        ...parsed.data,
        status: publish ? "published" as const : (parsed.data.status ?? "draft"),
        cover_photo_url: coverUrl,
        owner_id: userId,
      };
      if (publish && photos.length === 0) {
        toast.error("Add at least one photo before publishing");
        return;
      }
      if (listingId) {
        const { error } = await supabase.from("listings").update(payload).eq("id", listingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("listings").insert(payload).select("id").single();
        if (error || !data) throw error ?? new Error("Insert failed");
        navigate({ to: "/dashboard/$id/edit", params: { id: data.id }, replace: true });
      }
      toast.success(publish ? "Published!" : "Saved");
      clearAutosave();
      if (publish) navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    { id: "basics", num: "01", label: "Basics" },
    { id: "details", num: "02", label: "Details" },
    { id: "pricing", num: "03", label: "Pricing" },
    { id: "location", num: "04", label: "Location" },
    { id: "photos", num: "05", label: "Photos" },
    { id: "contact", num: "06", label: "Contact" },
  ] as const;
  const [activeStep, setActiveStep] = useState<string>("basics");
  const [railOpen, setRailOpen] = useState<boolean>(true);
  const activeIndex = steps.findIndex((s) => s.id === activeStep);
  const isLastStep = activeIndex === steps.length - 1;
  const isFirstStep = activeIndex === 0;
  const goToStep = (id: string) => {
    setActiveStep(id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = () => {
    const n = steps[Math.min(activeIndex + 1, steps.length - 1)];
    if (n) goToStep(n.id);
  };
  const back = () => {
    const p = steps[Math.max(activeIndex - 1, 0)];
    if (p) goToStep(p.id);
  };

  const stepDone = (id: string) => {
    if (id === "basics") return form.title.trim().length >= 4;
    if (id === "details") return form.bedrooms >= 0 && form.bathrooms >= 0;
    if (id === "pricing") return form.price_amount > 0;
    if (id === "location") return form.address_line.trim().length > 3 && !!form.city;
    if (id === "photos") return photos.length > 0;
    if (id === "contact") return !!form.contact_phone;
    return false;
  };
  const completed = steps.filter((s) => stepDone(s.id)).length;

  return (
    <div
      className="listing-form-v2 relative bg-[#fafaf7] text-[#111111]"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
    >
      <div
        className={`relative mx-auto grid max-w-[1080px] gap-0 transition-[grid-template-columns] duration-300 ease-out ${
          railOpen ? "lg:grid-cols-[180px_minmax(0,1fr)]" : "lg:grid-cols-[0px_minmax(0,1fr)]"
        }`}
      >
        {/* Left rail — sidebar stepper */}
        <aside
          className={`hidden overflow-hidden border-r border-black/[0.06] transition-all duration-300 ease-out lg:block ${
            railOpen ? "opacity-100" : "pointer-events-none -translate-x-2 opacity-0"
          }`}
          aria-hidden={!railOpen}
        >
          <div className="sticky top-6 space-y-6 px-6 py-14">
            <div className="h-px w-8 bg-black/[0.12]">
              <div
                className="h-px bg-black transition-all duration-500"
                style={{ width: `${Math.max(8, (completed / 6) * 32)}px` }}
              />
            </div>
            <nav className="space-y-0.5">
              {steps.map((s) => {
                const active = activeStep === s.id;
                const done = stepDone(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goToStep(s.id)}
                    className={`group flex w-full items-center gap-3 py-2 text-left text-[12.5px] transition ${
                      active ? "text-black" : "text-black/55 hover:text-black"
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full text-[9.5px] font-medium tabular-nums transition ${
                        done
                          ? "bg-black text-white"
                          : active
                          ? "border border-black text-black"
                          : "border border-black/15 text-black/40"
                      }`}
                    >
                      {done ? <Check className="h-2.5 w-2.5" strokeWidth={2.5} /> : s.num}
                    </span>
                    <span className="flex-1">{s.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Rail toggle — desktop only */}
        <button
          type="button"
          onClick={() => setRailOpen((v) => !v)}
          aria-label={railOpen ? "Hide steps" : "Show steps"}
          aria-expanded={railOpen}
          className={`fixed top-24 z-30 hidden h-8 items-center gap-1.5 rounded-full border border-black/10 bg-white/90 px-3 text-[11px] font-medium text-black/70 shadow-sm backdrop-blur transition-all duration-300 hover:text-black lg:inline-flex ${
            railOpen ? "left-[196px]" : "left-4"
          }`}
        >
          {railOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
          <span>{railOpen ? "Hide" : "Steps"}</span>
        </button>

        {/* Middle — content column */}
        <div className="min-w-0 space-y-10 px-5 py-10 sm:space-y-14 sm:px-12 sm:py-16 lg:px-20 lg:py-20">
          {/* Mobile progress */}
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-black/50">
              Step {steps.findIndex((s) => s.id === activeStep) + 1} of 6
            </span>
            <AutosaveIndicator savedAt={autosavedAt} restoredAt={restoredAt} />
          </div>

          <div className="space-y-10 sm:space-y-14">
        <Section active={activeStep==="basics"} id="basics" title="Basics" number="01" hint="Title, mode and a short description.">
          <Field label="Listing title">
            <Input value={form.title} onChange={(e) => update("title", e.target.value)} maxLength={120} placeholder="Sunny 2BHK next to COEP" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mode">
              <Select value={form.mode} onValueChange={(v) => update("mode", v as "rent" | "sale")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rent">For rent</SelectItem>
                  <SelectItem value="sale">For sale</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Property type">
              <Select value={form.property_type} onValueChange={(v) => update("property_type", v as ListingInput["property_type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="What makes this place special? Nearby cafes, sunlight, quiet street…"
            />
          </Field>
        </Section>

        <Section active={activeStep==="details"} id="details" title="Details" number="02" hint="Rooms, size and amenities.">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Field label="Bedrooms">
              <Input type="number" min={0} max={20} value={form.bedrooms} onChange={(e) => update("bedrooms", Number(e.target.value))} />
            </Field>
            <Field label="Bathrooms">
              <Input type="number" min={0} max={20} value={form.bathrooms} onChange={(e) => update("bathrooms", Number(e.target.value))} />
            </Field>
            <Field label="Area (sqft)">
              <Input type="number" min={0} value={form.area_sqft ?? ""} onChange={(e) => update("area_sqft", e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Furnishing">
              <Select value={form.furnishing} onValueChange={(v) => update("furnishing", v as ListingInput["furnishing"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FURNISHINGS.map((f) => (<SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Available from">
              <Input type="date" value={form.available_from ?? ""} onChange={(e) => update("available_from", e.target.value || null)} />
            </Field>
          </div>
          <Field label="Amenities">
            <div className="flex flex-wrap gap-2">
              {AMENITY_OPTIONS.map((a) => {
                const active = form.amenities.includes(a);
                return (
                  <button
                    type="button"
                    key={a}
                    onClick={() => toggleAmenity(a)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
                      active
                        ? "border-black bg-black text-white"
                        : "border-black/12 bg-white text-black/65 hover:border-black hover:text-black"
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </Field>
        </Section>

        <Section active={activeStep==="pricing"} id="pricing" title="Pricing" number="03" hint="Set a fair number. You can change it later.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={form.mode === "rent" ? "Monthly rent (₹)" : "Sale price (₹)"}>
              <Input type="number" min={0} placeholder="0" value={form.price_amount || ""} onChange={(e) => update("price_amount", e.target.value ? Number(e.target.value) : 0)} />
            </Field>
            <Field label={form.mode === "rent" ? "Deposit (₹)" : "Booking amount (₹)"}>
              <Input type="number" min={0} value={form.deposit_amount ?? ""} onChange={(e) => update("deposit_amount", e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </div>
          {form.mode === "rent" && (
            <div className="mt-6 border-t border-black/[0.08] pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-sm">
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-black/45">Sharing · optional</p>
                  <h4 className="mt-1.5 text-[16px] font-medium leading-snug text-black">Tenants you're seeking</h4>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-black/55">
                    If you're open to sharing, we'll show a per-person price to seekers.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease"
                    onClick={() =>
                      update("seeking_count", form.seeking_count && form.seeking_count > 1 ? form.seeking_count - 1 : null)
                    }
                    className="grid h-9 w-9 place-items-center rounded-full border border-black/15 bg-white text-black/70 transition hover:border-black hover:text-black"
                  >
                    −
                  </button>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={form.seeking_count ?? ""}
                    placeholder="—"
                    onChange={(e) => {
                      const v = e.target.value ? Math.max(1, Math.min(20, Number(e.target.value))) : null;
                      update("seeking_count", v);
                    }}
                    className="h-9 w-16 border-black/15 bg-white text-center tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label="Increase"
                    onClick={() =>
                      update("seeking_count", Math.min(20, (form.seeking_count ?? 0) + 1))
                    }
                    className="grid h-9 w-9 place-items-center rounded-full border border-black/15 bg-white text-black/70 transition hover:border-black hover:text-black"
                  >
                    +
                  </button>
                </div>
              </div>
              {form.seeking_count && form.seeking_count > 0 ? (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-black/45">
                    Per person / month
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[18px] leading-none text-black/70">₹</span>
                    <Input
                      type="number"
                      min={0}
                      value={form.price_amount && form.seeking_count ? Math.round(form.price_amount / form.seeking_count) : ""}
                      placeholder="0"
                      onChange={(e) => {
                        const per = e.target.value ? Number(e.target.value) : 0;
                        update("price_amount", per * (form.seeking_count ?? 1));
                      }}
                      className="h-10 w-32 border-black/15 bg-white text-right text-[18px] font-medium tabular-nums"
                    />
                    {form.price_amount > 0 ? (
                      <span className="text-[11.5px] text-black/45">
                        × {form.seeking_count} = ₹{Number(form.price_amount).toLocaleString("en-IN")}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Section>

        <Section active={activeStep==="location"} id="location" title="Location" number="04" hint="Drop a pin — we'll fill in the address for you.">
          <AddressPicker
            value={form.latitude != null && form.longitude != null ? { lat: form.latitude, lng: form.longitude } : null}
            onChange={(coords, addr) => {
              setForm((f) => ({
                ...f,
                latitude: coords.lat,
                longitude: coords.lng,
                address_line: addr?.address_line || f.address_line,
                city: addr?.city || f.city,
                state: addr?.state ?? f.state,
                postal_code: addr?.postal_code ?? f.postal_code,
                country: addr?.country || f.country,
              }));
            }}
          />
          <Field label="Address line">
            <Input value={form.address_line} onChange={(e) => update("address_line", e.target.value)} placeholder="Flat 3B, Shivaji Nagar" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City"><Input value={form.city} onChange={(e) => update("city", e.target.value)} /></Field>
            <Field label="State"><Input value={form.state ?? ""} onChange={(e) => update("state", e.target.value || null)} /></Field>
            <Field label="Postal code"><Input value={form.postal_code ?? ""} onChange={(e) => update("postal_code", e.target.value || null)} /></Field>
          </div>
          <div className="border-t border-black/[0.08] pt-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-black/45">Nearby · recommended</p>
                <h4 className="mt-1.5 text-[16px] font-medium leading-snug text-black">Near to</h4>
                <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-black/55">
                  Tag colleges, metro stops, parks — seekers filter by these.
                </p>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-black/45">
                {form.nearby.length}/5
              </span>
            </div>
            <PlaceAutocomplete
              value={nearbyQuery}
              onChange={setNearbyQuery}
              onPick={(p) => {
                setForm((f) => {
                  const exists = f.nearby.some((n) => n.label.toLowerCase() === p.label.toLowerCase());
                  if (exists || f.nearby.length >= 5) return f;
                  return {
                    ...f,
                    nearby: [...f.nearby, { label: p.label, lat: p.lat ?? null, lng: p.lng ?? null }],
                  };
                });
                setNearbyQuery("");
              }}
              placeholder="Search a college, metro, café, park…"
              center={form.latitude != null && form.longitude != null ? { lat: form.latitude, lng: form.longitude } : null}
              radiusKm={2}
            />
            {form.nearby.length === 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-black/40">Try</span>
                {["college", "metro station", "IT park", "hospital", "mall"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNearbyQuery(s)}
                    className="rounded-full border border-black/12 bg-white px-2.5 py-0.5 text-[11px] text-black/60 transition hover:border-black hover:text-black"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {form.nearby.map((n, i) => (
                  <span
                    key={`${n.label}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/12 bg-white py-1 pl-2.5 pr-1 text-[12px] text-black"
                  >
                    <MapPin className="h-3 w-3 text-black/40" />
                    {n.label}
                    <button
                      type="button"
                      aria-label={`Remove ${n.label}`}
                      onClick={() =>
                        setForm((f) => ({ ...f, nearby: f.nearby.filter((_, j) => j !== i) }))
                      }
                      className="grid h-5 w-5 place-items-center rounded-full text-black/40 transition hover:bg-black/[0.06] hover:text-black"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section active={activeStep==="photos"} id="photos" title="Photos" number="05" hint="Drag to reorder. First photo becomes the cover. Up to 8MB each.">
          <div
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-black/15 bg-white p-8 text-center transition hover:border-black/40 sm:p-12"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <ImageIcon className="mb-3 h-5 w-5 text-black/30" strokeWidth={1.5} />
            <p className="text-[13px] text-black/70">Drop images here, or</p>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-black underline underline-offset-4 decoration-black/25 hover:decoration-black"
            >
              {uploading ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>) : (<><Upload className="h-3.5 w-3.5" /> browse from your device</>)}
            </button>
            <p className="mt-3 text-[11px] text-black/40">JPG · PNG · WebP · up to 8MB each</p>
          </div>

          {photos.length > 0 && (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-black/[0.08] py-3">
                <div className="flex items-center gap-2 text-[12px] text-black/60">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Have AI draft your title, description & amenities from these photos.
                </div>
                <button
                  type="button"
                  onClick={runAiAutofill}
                  disabled={aiLoading || uploading}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-black underline underline-offset-4 decoration-black/25 transition hover:decoration-black disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {aiLoading ? "Reading photos…" : "Autofill with AI"}
                </button>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {photos.map((p) => (
                      <SortablePhoto
                        key={p.id}
                        photo={p}
                        isCover={coverUrl === p.url}
                        onSetCover={() => setCover(p)}
                        onRemove={() => removePhoto(p)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}
        </Section>

        <Section active={activeStep==="contact"} id="contact" title="Contact" number="06" hint="How buyers or tenants reach you.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name">
              <Input value={form.contact_name ?? ""} onChange={(e) => update("contact_name", e.target.value || null)} />
            </Field>
            <Field label="Phone number">
              <Input value={form.contact_phone ?? ""} onChange={(e) => update("contact_phone", e.target.value || null)} placeholder="+91 …" />
            </Field>
          </div>
        </Section>
          </div>

          {/* Step navigation */}
          <div className="mt-12 flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={back}
              disabled={isFirstStep}
              className="text-[13px] font-medium text-black/55 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
            >
              ← Back
            </button>
            <div className="hidden items-center gap-4 sm:flex">
              <AutosaveIndicator savedAt={autosavedAt} restoredAt={restoredAt} />
              <button
                type="button"
                onClick={() => save(false)}
                disabled={saving}
                className="text-[13px] font-medium text-black/55 transition hover:text-black disabled:opacity-40"
              >
                Save draft
              </button>
            </div>
            {isLastStep ? (
              <button
                type="button"
                onClick={() => save(true)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-black/85 disabled:opacity-50"
              >
                {saving ? "Publishing…" : "Publish listing"}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-black/85"
              >
                Continue →
              </button>
            )}
          </div>

          <div className="h-16 lg:h-0" />
        </div>

      </div>

    </div>
  );
}

function Section({ id, title, hint, children, active }: { id: string; title: string; number?: string; hint?: string; children: React.ReactNode; active?: boolean }) {
  if (active === false) return null;
  return (
    <section id={id} className="scroll-mt-8">
      <header className="mb-10 sm:mb-12">
        <h2 className="text-[34px] font-medium leading-[1.05] tracking-tight text-black sm:text-[44px] lg:text-[52px]">
          {title}
        </h2>
        {hint && <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-black/50 sm:text-[15px]">{hint}</p>}
      </header>
      <div className="space-y-7">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-[0.16em] text-black/50">
        {label}
      </Label>
      {children}
    </div>
  );
}

function AutosaveIndicator({ savedAt, restoredAt }: { savedAt: number | null; restoredAt: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!savedAt && !restoredAt) return null;
  const ts = savedAt ?? restoredAt!;
  const label = savedAt ? "Draft autosaved" : "Draft restored";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-black/45">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {label} · {formatAgo(ts)}
    </span>
  );
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function SortablePhoto({
  photo,
  isCover,
  onSetCover,
  onRemove,
}: {
  photo: ExistingPhoto;
  isCover: boolean;
  onSetCover: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="group relative overflow-hidden rounded-xl border border-border bg-muted">
      <img src={photo.url} alt="" className="aspect-square w-full object-cover" draggable={false} />
      {isCover && <Badge className="absolute left-2 top-2 bg-coral text-white">Cover</Badge>}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute right-2 top-2 rounded-md bg-white/90 p-1 text-ink/70 opacity-0 transition group-hover:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
        <button type="button" onClick={onSetCover} className="rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-ink hover:bg-white">
          <Star className="mr-1 inline h-3 w-3" /> Cover
        </button>
        <button type="button" onClick={onRemove} className="rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-white">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}