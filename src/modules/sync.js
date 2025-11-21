// src/modules/sync.js
// Lightweight background sync + manual backup/import.
// Also surfaces pending local queues (wallet/stats) for the SyncPanel.

const BACKUP_KEY = "pm_backup_auto_v1";
const META_KEY   = "pm_backup_meta_v1";
const LAST_SYNC_KEY = "pm_backup_last_sync_v1";

// Queues to count (kept in their own modules but we read LS directly)
const WALLET_QUEUE_KEY = "pm_sync_wallet_v1";   // from wallet.js SYNC_KEY
const STATS_QUEUE_KEY  = "pm_stats_queue_v1";   // from stats.js  QUEUE_KEY

// Everything we consider part of the user state to snapshot
const KEYS = [
  "pm_state_v4",
  "pm_dark",
  "pm_tab",
  "pm_boost_v1",
  "pm_boost_v2",
  "pm_wallet_v1",
  "pm_wallet_v2",
  "pm_store_v2",
  "pm_home_v1",
  "pm_stats_v1",
  "pm_stats_v2",
  "pm_history_v1",
  "pm_payouts_v1",
  "pm_city_income_v1",
  "pm_city_income_carry_v1",
  "pm_offline_v1",
  "pm_inventory_v1",
  "pm_profile_v1",
];

const now = () => Date.now();

// ---------- safe LS helpers ----------
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function readJSON(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } }
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {}; return v; }

// tiny non-crypto hash for change detection
function hashString(s) {
  let h = 0, i = 0;
  while (i < s.length) { h = ((h << 5) - h + s.charCodeAt(i++)) | 0; }
  return (h >>> 0).toString(16);
}

// ---------- snapshot / meta ----------
function takeSnapshot() {
  const payload = {};
  for (const k of KEYS) {
    const v = safeGet(k);
    if (v !== null && v !== undefined) payload[k] = v;
  }
  const json = JSON.stringify(payload);
  const meta = {
    ts: now(),
    keys: Object.keys(payload).length,
    bytes: json.length,
    hash: hashString(json),
    ver: 1,
  };
  return { json, meta };
}

function writeToLocalBackup(json, meta) {
  safeSet(BACKUP_KEY, json);
  writeJSON(META_KEY, meta);
}

export function getSyncMeta() {
  return readJSON(META_KEY, { ts: 0, keys: 0, bytes: 0, hash: "", ver: 1 });
}

// ---------- pending counts (used by SyncPanel) ----------
export function getPendingCounts() {
  const walletQ = readJSON(WALLET_QUEUE_KEY, []);
  const statsQ  = readJSON(STATS_QUEUE_KEY, []);
  const wallet = Array.isArray(walletQ) ? walletQ.length : 0;
  const stats  = Array.isArray(statsQ)  ? statsQ.length  : 0;
  return { wallet, stats, total: wallet + stats };
}

// ---------- manual backup/export/import (used by SyncPanel) ----------
export function getBackupSnapshot() {
  // Return a JS object mapping key -> string value (not stringified again)
  const obj = {};
  for (const k of KEYS) {
    const v = safeGet(k);
    if (v !== null && v !== undefined) obj[k] = v;
  }
  return obj;
}

export function restoreBackupSnapshot(map) {
  try {
    if (!map || typeof map !== "object") return { ok: false, msg: "Invalid backup object" };
    let restored = 0;
    for (const k of KEYS) {
      if (k in map) { safeSet(k, String(map[k])); restored++; }
    }
    const { json, meta } = takeSnapshot();
    writeToLocalBackup(json, { ...meta, reason: "manual_import" });
    setLastSync(Date.now());
    return { ok: true, restored };
  } catch {
    return { ok: false, msg: "Restore failed" };
  }
}

export function downloadJSON(filename, obj) {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch { return false; }
}

// ---------- last sync timestamp ----------
export function getLastSync() {
  return readJSON(LAST_SYNC_KEY, 0);
}
export function setLastSync(ts) {
  writeJSON(LAST_SYNC_KEY, Number(ts) || now());
}

// ---------- auto-sync loop ----------
let _timer = null;
let _debounce = null;
let _started = false;

function doSync(reason = "interval") {
  const { json, meta } = takeSnapshot();
  writeToLocalBackup(json, { ...meta, reason });
  // we only mark a "last sync" when we do an explicit "Mark as synced" in UI,
  // but you can uncomment next line if you prefer autosync to update it:
  // setLastSync(meta.ts);
}

export function noteMutation(reason = "mutation") {
  clearTimeout(_debounce);
  _debounce = setTimeout(() => doSync(reason), 1200);
}

export function startAutoSync({ intervalMs = 3 * 60 * 1000 } = {}) {
  if (_started) return;
  _started = true;
  setTimeout(() => doSync("boot"), 1000);
  _timer = setInterval(() => doSync("interval"), intervalMs);
  window.addEventListener("storage", (e) => {
    if (e.key === BACKUP_KEY || e.key === META_KEY) {
      // could surface cross-tab "synced just now" toast if desired
    }
  });
}
