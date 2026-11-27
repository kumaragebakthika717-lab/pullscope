"use client";

import type { MatchAnalysis, SpeedSession } from "./types";

const DB_NAME = "pullscope-analysis";
const DB_VERSION = 1;
const SPEED = "speed_sessions";
const MATCHES = "match_analyses";
const VIDEOS = "videos";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser blocked local storage (IndexedDB)."));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SPEED)) db.createObjectStore(SPEED, { keyPath: "id" });
      if (!db.objectStoreNames.contains(MATCHES)) db.createObjectStore(MATCHES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(VIDEOS)) db.createObjectStore(VIDEOS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
  return dbPromise;
}

async function run<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = fn(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage request failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Local storage transaction was aborted."));
  });
}

export async function listSpeedSessions(): Promise<SpeedSession[]> {
  const rows = await run<SpeedSession[]>(SPEED, "readonly", (store) => store.getAll() as IDBRequest<SpeedSession[]>);
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at));
}

export async function saveSpeedSession(session: SpeedSession): Promise<void> {
  await run(SPEED, "readwrite", (store) => store.put(session));
}

export async function deleteSpeedSession(id: string): Promise<void> {
  await run(SPEED, "readwrite", (store) => store.delete(id));
}

export async function listMatchAnalyses(): Promise<MatchAnalysis[]> {
  const rows = await run<MatchAnalysis[]>(MATCHES, "readonly", (store) => store.getAll() as IDBRequest<MatchAnalysis[]>);
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at));
}

export async function getMatchAnalysis(id: string): Promise<MatchAnalysis | null> {
  const row = await run<MatchAnalysis | undefined>(MATCHES, "readonly", (store) => store.get(id) as IDBRequest<MatchAnalysis | undefined>);
  return row ?? null;
}

export async function saveMatchAnalysis(analysis: MatchAnalysis): Promise<void> {
  await run(MATCHES, "readwrite", (store) => store.put(analysis));
}

export async function deleteMatchAnalysis(id: string): Promise<void> {
  await run(MATCHES, "readwrite", (store) => store.delete(id));
  await deleteVideo(id).catch(() => undefined);
}

export async function putVideo(id: string, blob: Blob): Promise<void> {
  await run(VIDEOS, "readwrite", (store) => store.put(blob, id));
}

export async function getVideo(id: string): Promise<Blob | null> {
  const blob = await run<Blob | undefined>(VIDEOS, "readonly", (store) => store.get(id) as IDBRequest<Blob | undefined>);
  return blob ?? null;
}

export async function deleteVideo(id: string): Promise<void> {
  await run(VIDEOS, "readwrite", (store) => store.delete(id));
}

export async function clearAnalysisData(): Promise<void> {
  await Promise.all([
    run(SPEED, "readwrite", (store) => store.clear()),
    run(MATCHES, "readwrite", (store) => store.clear()),
    run(VIDEOS, "readwrite", (store) => store.clear()),
  ]);
}
