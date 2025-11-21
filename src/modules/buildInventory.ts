// Single-source inventory with one-time seeding, migration, and safe math.
import { normalizeId, TileId } from "../data/tiles";

const KEY = "pm_build_inv_v2"; // bump only if storage schema changes intentionally

// Starter counts. No "start" tile here.
const STARTER: Record<TileId, number> = {
  road: 20,
  avenue: 0,
  roundabout: 1,
  home: 1,
  house: 0,
  shop: 1,
  park: 2,
  hq: 1,
};

type StoreShape = { version: 1; items: Partial<Record<TileId, number>> };

function clampInt(n: unknown) { return Math.max(0, Math.floor(Number(n) || 0)); }

function readRaw(): StoreShape | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && typeof v === "object" ? (v as StoreShape) : null;
  } catch { return null; }
}
function writeRaw(obj: StoreShape) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
}

function ensureInit() {
  const cur = readRaw();
  if (!cur || !cur.items) {
    writeRaw({ version: 1, items: { ...STARTER } });
    return;
  }
  // normalize keys and merge legacy codes
  const norm: Partial<Record<TileId, number>> = {};
  for (const [k, v] of Object.entries(cur.items)) {
    const id = normalizeId(k) as TileId | "";
    if (!id) continue;
    norm[id] = clampInt((norm[id] ?? 0) + (v as number));
  }
  // ensure new keys exist at least at starter minimums
  (Object.keys(STARTER) as TileId[]).forEach(k => {
    if (norm[k] == null) norm[k] = STARTER[k];
  });
  writeRaw({ version: 1, items: norm });
}
ensureInit();

/* ---------- public API ---------- */

export function getInventory(): Record<TileId, number> {
  ensureInit();
  const raw = readRaw()!;
  const out: Record<TileId, number> = {
    road: 0, avenue: 0, roundabout: 0, home: 0, house: 0, shop: 0, park: 0, hq: 0,
  };
  for (const [k, v] of Object.entries(raw.items || {})) {
    const id = normalizeId(k) as TileId | "";
    if (!id) continue;
    out[id] = clampInt((out[id] ?? 0) + (v as number));
  }
  return out;
}

export function setInventory(next: Partial<Record<string, number>>): void {
  if (!next || typeof next !== "object") return;
  const items: Partial<Record<TileId, number>> = {};
  for (const [k, v] of Object.entries(next)) {
    const id = normalizeId(k) as TileId | "";
    if (!id) continue;
    items[id] = clampInt(v);
  }
  writeRaw({ version: 1, items });
}

export function addItem(id: string, n = 1): void {
  const key = normalizeId(id) as TileId | "";
  if (!key) return;
  const data = readRaw() || { version: 1, items: {} };
  data.items[key] = clampInt((data.items[key] || 0) + n);
  writeRaw(data as StoreShape);
}

export function consume(id: string, n = 1): boolean {
  const key = normalizeId(id) as TileId | "";
  if (!key) return false;
  const data = readRaw() || { version: 1, items: {} };
  const cur = clampInt(data.items[key] || 0);
  if (cur < n) return false;
  data.items[key] = clampInt(cur - n);
  writeRaw(data as StoreShape);
  return true;
}

export function resetInventoryToStarter(): void {
  writeRaw({ version: 1, items: { ...STARTER } });
}
