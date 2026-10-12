"use client";

import { useSyncExternalStore } from "react";

/** Tiny external store so the 60fps playhead doesn't re-render the whole workspace. */
export function createTimeStore() {
  let time = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => time,
    set(t: number) {
      if (t === time) return;
      time = t;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export type TimeStore = ReturnType<typeof createTimeStore>;

export function useTime(store: TimeStore) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
