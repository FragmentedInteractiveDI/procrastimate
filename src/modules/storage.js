// src/modules/storage.js
// Tiny JSON helpers + “please don’t evict me” request.
const ls = {
  getJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  setJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  }
};

// Ask the browser for persistent storage (so data isn’t cleared under pressure)
export async function ensurePersistentStorage() {
  if (!('storage' in navigator) || !navigator.storage.persist) return false;
  try { return await navigator.storage.persist(); } catch { return false; }
}

export function getJSON(key, fallback) { return ls.getJSON(key, fallback); }
export function setJSON(key, value) { ls.setJSON(key, value); }
export function remove(key) { ls.remove(key); }
