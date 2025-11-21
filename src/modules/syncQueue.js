// src/modules/syncQueue.js
// Offline queue: enqueue events while offline, auto-flush when back online.
import { getJSON, setJSON } from "./storage";

const KEY = "pm_sync_queue_v1";

// In your real backend, replace this with a fetch() to your API.
async function sendToServer(event) {
  // Simulate network work
  await new Promise(r => setTimeout(r, 120));
  // Pretend success
  return { ok: true };
}

export function enqueue(type, payload) {
  const q = getJSON(KEY, []);
  q.push({ id: crypto.randomUUID?.() || String(Date.now()) + Math.random(), type, payload, at: Date.now() });
  setJSON(KEY, q);
}

export async function flushQueue() {
  const q = getJSON(KEY, []);
  if (!q.length) return;

  const remaining = [];
  for (const evt of q) {
    try {
      // If offline, stop and keep the rest.
      if (!navigator.onLine) { remaining.push(evt); continue; }
      const res = await sendToServer(evt);
      if (!res?.ok) remaining.push(evt);
    } catch {
      remaining.push(evt);
    }
  }
  setJSON(KEY, remaining);
}

export function startQueueAutoFlush() {
  // Flush now, then on every “online”
  flushQueue();
  window.addEventListener("online", flushQueue);
}
