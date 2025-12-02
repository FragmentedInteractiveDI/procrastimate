// FILE: src/modules/buildInventory.js
// Single-source inventory with one-time seeding, migration, and safe math.

const KEY = "pm_build_inv_v2"; // bump only if storage schema changes intentionally
const EVT = "pm_inventory_changed";

// Starter counts. No "start" tile here.
// These are the free starter pieces you get each run.
// Anything gained later (via MateCoin or USD packs) is layered on top.
// Prestige wipes this key; on next load we re-seed with STARTER.
const STARTER = {
  road: 20,
  home: 1,
  house: 0,        // Generic houses (earned/purchased)
  shop: 1,
  park: 2,
  hq: 1,
  roundabout: 1,
  apb: 0,          // APB station (earned/purchased)
  paintshop: 0,    // Paint shop (earned/purchased)
  garage: 0,       // Garage (earned/purchased)
  bank: 0,         // Investment bank (earned/purchased)
};

// --- id normalization (accept legacy/short codes) ---
function normalizeId(id) {
  if (!id) return "";
  switch (String(id)) {
    case "r": return "road";
    case "av": return "avenue";
    case "st":
    case "start": return "home";
    case "rb":
    case "round": return "roundabout";
    default: return String(id);
  }
}

function readRaw() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
function writeRaw(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {}
}
function clampInt(n) {
  return Math.max(0, Math.floor(Number(n) || 0));
}
function emitChange() {
  try {
    window.dispatchEvent(new Event(EVT));
  } catch {}
}

// Ensure storage exists and migrate any legacy keys to canonical ids.
function ensureInit() {
  const cur = readRaw();
  if (!cur || typeof cur !== "object" || !cur.items) {
    // Fresh run or post-prestige: seed with starter bundle.
    writeRaw({ version: 1, items: { ...STARTER } });
    return;
  }
  const norm = {};
  for (const [k, v] of Object.entries(cur.items || {})) {
    const id = normalizeId(k);
    if (!id) continue;
    norm[id] = clampInt((norm[id] || 0) + (v | 0));
  }
  // Backfill any missing starter items without clobbering existing counts.
  for (const [k, v] of Object.entries(STARTER)) {
    if (norm[k] == null) norm[k] = clampInt(v);
  }
  writeRaw({ version: 1, items: norm });
}
ensureInit();

/* ---------- public API ---------- */

export function getInventory() {
  ensureInit();
  const { items } = readRaw();
  const out = {};
  for (const [k, v] of Object.entries(items || {})) {
    const id = normalizeId(k);
    out[id] = clampInt((out[id] || 0) + (v | 0));
  }
  return out;
}

export function setInventory(next) {
  if (!next || typeof next !== "object") return;
  const items = {};
  for (const [k, v] of Object.entries(next)) {
    const id = normalizeId(k);
    if (!id) continue;
    items[id] = clampInt(v);
  }
  writeRaw({ version: 1, items });
  emitChange();
}

export function addItem(id, n = 1) {
  id = normalizeId(id);
  if (!id) return;
  const data = readRaw() || { version: 1, items: {} };
  data.items[id] = clampInt((data.items[id] || 0) + n);
  writeRaw(data);
  emitChange();
}

export function addItems(bundle = {}) {
  if (!bundle || typeof bundle !== "object") return;
  const data = readRaw() || { version: 1, items: {} };
  for (const [k, v] of Object.entries(bundle)) {
    const id = normalizeId(k);
    if (!id) continue;
    data.items[id] = clampInt((data.items[id] || 0) + (v | 0));
  }
  writeRaw(data);
  emitChange();
}

export function consume(id, n = 1) {
  id = normalizeId(id);
  if (!id) return false;
  const data = readRaw() || { version: 1, items: {} };
  const cur = clampInt(data.items[id] || 0);
  if (cur < n) return false;
  data.items[id] = clampInt(cur - n);
  writeRaw(data);
  emitChange();
  return true;
}

export function has(id, n = 1) {
  id = normalizeId(id);
  const inv = getInventory();
  return clampInt(inv[id] || 0) >= clampInt(n);
}

// Optional: hard reset from UI (debug)
// Note: prestige uses localStorage.removeItem(KEY) instead, which will cause
// ensureInit() to reseed with STARTER on next access.
export function resetInventoryToStarter() {
  writeRaw({ version: 1, items: { ...STARTER } });
  emitChange();
}

// Expose a copy of starter for seeding new slots
export function getStarterInventory() {
  return { ...STARTER };
}

/* ---------- convenience for road packs & bundles ---------- */

// Grant N roads (used by "Road Pack" purchases).
// Whether a given pack is MateCoin vs USD "permanent" is decided in the store;
// this function just adds tile counts.
export function grantRoads(n = 10) {
  addItem("road", clampInt(n));
}

// Grant N avenues
export function grantAvenues(n = 10) {
  addItem("avenue", clampInt(n));
}

// Grant N roundabouts
export function grantRoundabouts(n = 3) {
  addItem("roundabout", clampInt(n));
}

// Grant N generic houses
export function grantHouses(n = 5) {
  addItem("house", clampInt(n));
}

// Grant special buildings (usually 1 at a time)
export function grantAPBStation() {
  addItem("apb", 1);
}

export function grantPaintShop() {
  addItem("paintshop", 1);
}

export function grantGarage() {
  addItem("garage", 1);
}

export function grantBank() {
  addItem("bank", 1);
}

// Grant a mixed builder bundle, e.g., { road: 50, avenue: 10, roundabout: 5 }
export function grantBundle(bundle = {}) {
  addItems(bundle);
}

// Ensure at least minCount roads exist (nice for tutorials/starters)
export function ensureMinRoads(minCount = 10) {
  const inv = getInventory();
  const cur = clampInt(inv.road || 0);
  if (cur < minCount) addItem("road", minCount - cur);
}

/* ---------- building type helpers ---------- */

export function getBuildingTypes() {
  return {
    // Infrastructure
    road: { name: 'Road', category: 'infrastructure', consumable: true },
    roundabout: { name: 'Roundabout', category: 'infrastructure', consumable: true },
    
    // Residential
    home: { name: 'Home (Player)', category: 'residential', consumable: false },
    house: { name: 'House (Generic)', category: 'residential', consumable: true },
    
    // Commercial
    shop: { name: 'Shop', category: 'commercial', consumable: true },
    hq: { name: 'Headquarters', category: 'commercial', consumable: true },
    
    // Special Buildings
    apb: { name: 'APB Station', category: 'special', consumable: true },
    paintshop: { name: 'Paint Shop', category: 'special', consumable: true },
    garage: { name: 'Garage', category: 'special', consumable: true },
    bank: { name: 'Investment Bank', category: 'special', consumable: true },
    
    // Decoration
    park: { name: 'Park', category: 'decoration', consumable: true },
  };
}

export function getBuildingCategory(id) {
  const types = getBuildingTypes();
  return types[normalizeId(id)]?.category || 'other';
}

export function isBuildingConsumable(id) {
  const types = getBuildingTypes();
  return types[normalizeId(id)]?.consumable ?? true;
}

/* ---------- subscriptions ---------- */

// Simple event subscription for UI components that care about live updates.
export function onChange(fn) {
  if (typeof window === "undefined" || typeof fn !== "function") return () => {};
  const handler = () => fn(getInventory());
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}