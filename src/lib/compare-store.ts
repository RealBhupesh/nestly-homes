import { useSyncExternalStore } from "react";

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
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, MAX) : [];
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