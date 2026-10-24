"use client";

import type { Project } from "@/lib/types";

/**
 * Keeps the imported project in the browser only: in memory for the current tab,
 * and in IndexedDB so a reload of /city still works. Nothing is sent to a server.
 */
let memory: Project | null = null;
const DB = "codelens";
const STORE = "projects";
const KEY = "current";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(p: Project): Promise<void> {
  memory = p;
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(p, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[codelens] could not persist project; it stays in memory only", e);
  }
}

export async function loadProject(): Promise<Project | null> {
  if (memory) return memory;
  try {
    const db = await open();
    const p = await new Promise<Project | null>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Project) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    memory = p;
    return p;
  } catch {
    return null;
  }
}
