// src/modules/ls.js
// Lightweight localStorage helpers with defaulting and namespace.

const NS = "pm_v21";
const fullKey = (k) => `${NS}:${k}`;

// --- core helpers ---
export function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(fullKey(key));
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(fullKey(key), JSON.stringify(value));
  } catch {}
}

export function lsRemove(key) {
  try {
    localStorage.removeItem(fullKey(key));
  } catch {}
}

// --- back-compat export for legacy imports ---
export const ls = {
  get: lsGet,
  set: lsSet,
  remove: lsRemove,
  del: lsRemove,
  key: fullKey,
  has(key) {
    try {
      return localStorage.getItem(fullKey(key)) != null;
    } catch {
      return false;
    }
  },
};
