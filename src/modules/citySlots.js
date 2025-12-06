// FILE: src/modules/citySlots.js
// Hybrid city-slot manager (ENGINE-FIRST, LS-BACKED)
//
// Responsibilities:
// - Own the canonical list of city slots (IDs, names, created/updated).
// - Own the saved layout grid for each slot.
// - Expose legacy helpers for Shop (slot caps) and Prestige (clearAllSlots).
// - Provide a clean engine-facing API for Builder + CityScene.
//
// Storage layout (localStorage):
//   pm_city_slots_index_v2 -> {
//     activeId: string | null,
//     slots: Array<{ id, name, createdAt, updatedAt }>
//   }
//
//   pm_layout_grid_v1:<slotId> -> {
//     w: number,
//     h: number,
//     grid: string[][],
//     meta?: { ... }
//   }
//
// Slot cap meta (for Shop screen):
//   pm_city_slots_store_v1    -> integer (0–5)
//   pm_city_slots_prestige_v1 -> integer (0–5)
//
// Legacy builder keys are cleaned up via clearAllSlots().

import { getStore } from "./store";

// ---------- DEBUG ----------

const DEBUG_SLOTS = true;

function dbgSlots(...args) {
  if (!DEBUG_SLOTS) return;
  try {
    console.log("[citySlots]", ...args);
  } catch {
    /* ignore */
  }
}

// ---------- LS helpers ----------

function lsRead(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    dbgSlots("lsRead", key, parsed);
    return parsed;
  } catch {
    dbgSlots("lsRead error", key);
    return fallback;
  }
}

function lsWrite(key, value) {
  try {
    dbgSlots("lsWrite", key, value);
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function lsRemove(key) {
  try {
    dbgSlots("lsRemove", key);
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ---------- Keys ----------

const INDEX_KEY = "pm_city_slots_index_v2";
const SLOT_GRID_PREFIX = "pm_layout_grid_v1:";

// Legacy / builder-era keys we clean on prestige:
const LEGACY_KEYS = [
  "pm_city_slots_index_v1",
  "pm_city_state_v1",
  "pm_city_state_v2",
  "pm_city_slot_active_v1",
];

// Slot cap meta (Shop)
const STORE_SLOTS_KEY = "pm_city_slots_store_v1"; // 0–5 extra from store
const PRESTIGE_SLOTS_KEY = "pm_city_slots_prestige_v1"; // 0–5 extra from prestige

const BASE_FREE_SLOTS = 1; // everyone gets at least 1 slot
const STORE_SLOTS_MAX = 5;
const PRESTIGE_SLOTS_MAX = 5;
const SLOT_CAP_MAX = BASE_FREE_SLOTS + STORE_SLOTS_MAX + PRESTIGE_SLOTS_MAX;

// ---------- Internal: index structure ----------

// Shape:
// {
//   activeId: string | null,
//   slots: Array<{ id, name, createdAt, updatedAt }>
// }

function makeEmptyIndex() {
  return {
    activeId: null,
    slots: [],
  };
}

function normalizeIndex(raw) {
  if (!raw || typeof raw !== "object") return makeEmptyIndex();
  const slots = Array.isArray(raw.slots) ? raw.slots : [];
  const cleaned = slots
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const id = String(s.id || "").trim();
      if (!id) return null;
      return {
        id,
        name: String(s.name || id),
        createdAt: Number.isFinite(s.createdAt) ? s.createdAt : Date.now(),
        updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : Date.now(),
      };
    })
    .filter(Boolean);

  const activeId =
    cleaned.find((s) => s.id === raw.activeId)?.id || cleaned[0]?.id || null;

  const norm = {
    activeId,
    slots: cleaned,
  };

  dbgSlots("normalizeIndex", norm);
  return norm;
}

function loadIndex() {
  const raw = lsRead(INDEX_KEY, null);
  const idx = normalizeIndex(raw);
  dbgSlots("loadIndex ->", idx);
  return idx;
}

function saveIndex(idx) {
  const norm = normalizeIndex(idx);
  dbgSlots("saveIndex", norm);
  lsWrite(INDEX_KEY, norm);
  // Broadcast so Builder/CityScene can react to slot changes
  try {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: INDEX_KEY,
        newValue: JSON.stringify(norm),
      })
    );
  } catch {
    /* ignore */
  }
  return norm;
}

// Ensure we always have at least one slot
function ensureSlots() {
  let idx = loadIndex();
  if (!idx.slots.length) {
    dbgSlots("ensureSlots: no slots, creating default");
    const now = Date.now();
    const def = {
      id: "default",
      name: "Default City",
      createdAt: now,
      updatedAt: now,
    };
    idx = {
      activeId: def.id,
      slots: [def],
    };
    saveIndex(idx);

    // also create an empty grid for it
    const w = 6;
    const h = 6;
    const grid = Array.from({ length: h }, () =>
      Array.from({ length: w }, () => "")
    );
    lsWrite(SLOT_GRID_PREFIX + def.id, { w, h, grid, meta: { createdAt: now } });
  } else {
    dbgSlots("ensureSlots: existing slots", idx);
  }
  return idx;
}

// ---------- Public: slot list / active slot ----------

export function listSlots() {
  const idx = ensureSlots();
  dbgSlots("listSlots ->", idx.slots);
  return idx.slots.slice();
}

export function getActiveSlot() {
  const idx = ensureSlots();
  const active = idx.activeId || idx.slots[0]?.id || null;
  dbgSlots("getActiveSlot ->", active);
  return active;
}

export function setActiveSlot(id) {
  const idx = ensureSlots();
  const exists = idx.slots.find((s) => s.id === id);
  if (!exists) {
    dbgSlots("setActiveSlot: id not found", id);
    return idx.activeId;
  }
  idx.activeId = id;
  const norm = saveIndex(idx);
  dbgSlots("setActiveSlot: updated", norm.activeId);
  return norm.activeId;
}

// Create new slot (returns { success, id, reason? })
export function createSlot(id, name) {
  const cleanId = String(id || "").trim();
  dbgSlots("createSlot request", { id: cleanId, name });
  if (!cleanId) {
    return { success: false, reason: "invalid_id" };
  }

  const idx = ensureSlots();

  if (idx.slots.find((s) => s.id === cleanId)) {
    dbgSlots("createSlot: already exists", cleanId);
    return { success: false, reason: "already_exists" };
  }

  // Respect slot cap meta
  const { cap } = getSlotCapMeta();
  if (idx.slots.length >= cap) {
    dbgSlots("createSlot: cap reached", { len: idx.slots.length, cap });
    return { success: false, reason: "cap_reached" };
  }

  const now = Date.now();
  const slot = {
    id: cleanId,
    name: String(name || cleanId),
    createdAt: now,
    updatedAt: now,
  };

  idx.slots.push(slot);
  idx.activeId = slot.id;
  saveIndex(idx);

  // start with blank grid
  const w = 6;
  const h = 6;
  const grid = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => "")
  );
  lsWrite(SLOT_GRID_PREFIX + slot.id, { w, h, grid, meta: { createdAt: now } });

  dbgSlots("createSlot: created", slot);
  return { success: true, id: slot.id };
}

// Delete slot (returns { success, reason? })
export function deleteSlot(id) {
  dbgSlots("deleteSlot request", id);
  const idx = ensureSlots();
  const i = idx.slots.findIndex((s) => s.id === id);
  if (i === -1) {
    dbgSlots("deleteSlot: not_found", id);
    return { success: false, reason: "not_found" };
  }

  const [removed] = idx.slots.splice(i, 1);
  lsRemove(SLOT_GRID_PREFIX + removed.id);

  if (!idx.slots.length) {
    // reset to empty index; ensureSlots() will recreate a default
    dbgSlots("deleteSlot: removed last slot, resetting index");
    lsRemove(INDEX_KEY);
    ensureSlots();
    return { success: true };
  }

  if (idx.activeId === removed.id) {
    idx.activeId = idx.slots[0].id;
  }
  saveIndex(idx);
  dbgSlots("deleteSlot: success", { removed: removed.id, newActive: idx.activeId });
  return { success: true };
}

// Rename slot (returns { success, reason? })
export function renameSlot(id, newName) {
  dbgSlots("renameSlot request", { id, newName });
  const idx = ensureSlots();
  const slot = idx.slots.find((s) => s.id === id);
  if (!slot) {
    dbgSlots("renameSlot: not_found", id);
    return { success: false, reason: "not_found" };
  }

  const name = String(newName || "").trim();
  if (!name) {
    dbgSlots("renameSlot: invalid_name");
    return { success: false, reason: "invalid_name" };
  }

  slot.name = name;
  slot.updatedAt = Date.now();
  saveIndex(idx);
  dbgSlots("renameSlot: success", { id, name });
  return { success: true };
}

// ---------- Layout IO ----------

// loadSim(): when slotIdOpt omitted, uses active slot
export function loadSim(slotIdOpt) {
  const idx = ensureSlots();
  const activeId = slotIdOpt || idx.activeId || idx.slots[0]?.id;
  if (!activeId) {
    dbgSlots("loadSim: no activeId");
    return null;
  }

  const key = SLOT_GRID_PREFIX + activeId;
  const snap = lsRead(key, null);
  dbgSlots("loadSim raw", { activeId, snap });

  if (!snap || !Array.isArray(snap.grid)) {
    const fallback = {
      slotId: activeId,
      w: 6,
      h: 6,
      grid: Array.from({ length: 6 }, () =>
        Array.from({ length: 6 }, () => "")
      ),
      meta: { createdAt: Date.now() },
    };
    dbgSlots("loadSim: returning fallback", fallback);
    return fallback;
  }

  const w = Number.isFinite(snap.w) ? snap.w : snap.grid[0]?.length || 6;
  const h = Number.isFinite(snap.h) ? snap.h : snap.grid.length || 6;

  const result = {
    slotId: activeId,
    w,
    h,
    grid: snap.grid,
    meta: snap.meta || {},
  };
  dbgSlots("loadSim: normalized", {
    slotId: result.slotId,
    w: result.w,
    h: result.h,
    rows: result.grid.length,
  });
  return result;
}

// saveSim(sim, slotIdOpt?): saves layout for given or active slot
export function saveSim(sim, slotIdOpt) {
  const idx = ensureSlots();
  const activeId = slotIdOpt || idx.activeId || idx.slots[0]?.id;
  if (!activeId) {
    dbgSlots("saveSim: no active slot");
    return { success: false, reason: "no_active_slot" };
  }

  const w = Number.isFinite(sim.w) ? sim.w : sim.grid?.[0]?.length || 6;
  const h = Number.isFinite(sim.h) ? sim.h : sim.grid?.length || 6;
  const grid =
    Array.isArray(sim.grid) && sim.grid.length
      ? sim.grid
      : Array.from({ length: h }, () =>
          Array.from({ length: w }, () => "")
        );

  const key = SLOT_GRID_PREFIX + activeId;
  const payload = {
    w,
    h,
    grid,
    meta: {
      ...(sim.meta || {}),
      updatedAt: Date.now(),
    },
  };
  dbgSlots("saveSim payload", { activeId, w, h, rows: grid.length });
  lsWrite(key, payload);

  // update index.updatedAt for this slot
  const now = Date.now();
  const slot = idx.slots.find((s) => s.id === activeId);
  if (slot) {
    slot.updatedAt = now;
    saveIndex(idx);
  }

  return { success: true };
}

// ---------- Shop-facing helpers: slot caps ----------

// internal: clamp int
function clampInt(n, min, max) {
  n = Number(n) | 0;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function getStoreSlotsInternal() {
  const n = lsRead(STORE_SLOTS_KEY, 0);
  return clampInt(n, 0, STORE_SLOTS_MAX);
}

function getPrestigeSlotsInternal() {
  const n = lsRead(PRESTIGE_SLOTS_KEY, 0);
  return clampInt(n, 0, PRESTIGE_SLOTS_MAX);
}

// Effective cap = base + store + prestige, clamped
function computeSlotCap() {
  const store = getStoreSlotsInternal();
  const prestige = getPrestigeSlotsInternal();
  const cap = BASE_FREE_SLOTS + store + prestige;
  return clampInt(cap, 1, SLOT_CAP_MAX);
}

// Public: used by Shop to render slot info
export function getSlotCapMeta() {
  const store = getStoreSlotsInternal();
  const prestige = getPrestigeSlotsInternal();
  const cap = computeSlotCap();
  const meta = {
    cap, // effective cap right now
    max: SLOT_CAP_MAX,
    baseFree: BASE_FREE_SLOTS,
    store,
    prestige,
  };
  dbgSlots("getSlotCapMeta", meta);
  return meta;
}

// Absolute store slot count (0–5)
export function getStoreSlotCount() {
  return getStoreSlotsInternal();
}
export function setStoreSlotCount(n) {
  const val = clampInt(n, 0, STORE_SLOTS_MAX);
  dbgSlots("setStoreSlotCount", val);
  lsWrite(STORE_SLOTS_KEY, val);
  try {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORE_SLOTS_KEY,
        newValue: JSON.stringify(val),
      })
    );
  } catch {
    /* ignore */
  }
}

// Absolute prestige slot count (0–5)
export function getPrestigeSlotCount() {
  return getPrestigeSlotsInternal();
}
export function setPrestigeSlotCount(n) {
  const val = clampInt(n, 0, PRESTIGE_SLOTS_MAX);
  dbgSlots("setPrestigeSlotCount", val);
  lsWrite(PRESTIGE_SLOTS_KEY, val);
  try {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PRESTIGE_SLOTS_KEY,
        newValue: JSON.stringify(val),
      })
    );
  } catch {
    /* ignore */
  }
}

// Convenience: is current slots list already at cap?
export function isCitySlotsFull() {
  const idx = ensureSlots();
  const { cap } = getSlotCapMeta();
  const full = idx.slots.length >= cap;
  dbgSlots("isCitySlotsFull", { len: idx.slots.length, cap, full });
  return full;
}

// ---------- Prestige hook: wipe all city layouts ----------

// Called from prestige.js to nuke all city layouts and slot index.
// Keeps slot-cap meta so Shop UI still knows what user purchased.
export function clearAllSlots() {
  dbgSlots("clearAllSlots: start");
  const idx = loadIndex();

  // Remove each slot grid
  if (idx && Array.isArray(idx.slots)) {
    for (const s of idx.slots) {
      if (s?.id) {
        lsRemove(SLOT_GRID_PREFIX + s.id);
      }
    }
  }

  // Drop index
  lsRemove(INDEX_KEY);

  // Clear legacy/builder keys
  for (const k of LEGACY_KEYS) {
    lsRemove(k);
  }

  try {
    window.dispatchEvent(
      new StorageEvent("storage", { key: "slotscleared" })
    );
  } catch {
    /* ignore */
  }
  dbgSlots("clearAllSlots: done");
}

// ---------- Optional debug helper ----------

// Quick helper you can call from devtools: citySlots.__debugDumpAll()
export function __debugDumpAll() {
  const idx = loadIndex();
  const layouts = {};
  for (const s of idx.slots) {
    const snap = lsRead(SLOT_GRID_PREFIX + s.id, null);
    layouts[s.id] = {
      w: snap?.w,
      h: snap?.h,
      rows: snap?.grid?.length ?? 0,
      meta: snap?.meta || {},
    };
  }
  dbgSlots("__debugDumpAll", { index: idx, layouts });
  return { index: idx, layouts };
}
