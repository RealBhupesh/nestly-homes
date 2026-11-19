import { useSyncExternalStore } from "react";
import { isUuid } from "@/lib/listings-data";

const KEY = "nestly:compare";
const MAX = 4;

type Listener = () => void;
const listeners = new Set<Listener>();
let ids: string[] = [];
let hydrated = false;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Old seed ids ("l-12") from the demo era are dropped silently.
    const valid = Array.isArray(parsed) ? parsed.filter(isUuid).slice(0, MAX) : [];
    if (!Array.isArray(parsed) || valid.length !== parsed.length) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(valid));
      } catch {
        // ignore
      }
    }
    return valid;
  } catch {
    return [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  ids = read();
  hydrated = true;
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function subscribe(cb: Listener) {
  ensureHydrated();
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      ids = read();
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string[] {
  ensureHydrated();
  return ids;
}

const EMPTY: string[] = [];
function getServerSnapshot(): string[] {
  return EMPTY;
}

export const COMPARE_MAX = MAX;

export function useCompareIds(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function toggleCompare(id: string): { added: boolean; full: boolean } {
  ensureHydrated();
  if (!isUuid(id)) return { added: false, full: false };
  if (ids.includes(id)) {
    ids = ids.filter((x) => x !== id);
    emit();
    return { added: false, full: false };
  }
  if (ids.length >= MAX) {
    return { added: false, full: true };
  }
  ids = [...ids, id];
  emit();
  return { added: true, full: false };
}

export function removeCompare(id: string) {
  ensureHydrated();
  if (!ids.includes(id)) return;
  ids = ids.filter((x) => x !== id);
  emit();
}

export function clearCompare() {
  ensureHydrated();
  if (ids.length === 0) return;
  ids = [];
  emit();
}

export function isCompared(id: string, current: string[]): boolean {
  return current.includes(id);
}
/** Drop ids that no longer resolve to a published listing. */
export function retainCompare(validIds: string[]) {
  ensureHydrated();
  const keep = new Set(validIds);
  const next = ids.filter((x) => keep.has(x));
  if (next.length === ids.length) return;
  ids = next;
  emit();
}
