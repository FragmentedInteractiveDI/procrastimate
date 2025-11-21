// src/modules/citySlots.js
// Unified multi-slot manager. Backward compatible with old pm_city_sim keys.
// Now uses new pm_layout_* keys expected by CityScene.

const ACTIVE_SLOT_KEY = "pm_layout_active_v1";
const SLOTS_INDEX_KEY = "pm_layout_slots_v1";
const SLOT_GRID_PREFIX = "pm_layout_grid_v1:";
const LEGACY_KEYS = ["pm_city_sim_v3", "pm_city_sim_v2", "pm_city_sim"];

/* ---------- slot monetization / caps ---------- */

// Hard cap on *all* city slots (free + purchased + prestige)
const SLOT_CAP_MAX = 12;

// Base free slots the player always gets (e.g. "Main Base" + one extra later).
// We start with the full 2 baked in so you can use two layouts even before
// Store/Prestige wiring.
const BASE_FREE_SLOTS = 2;

// Store-purchased slots (0–5). Simple integer counter in localStorage.
const STORE_SLOTS_KEY = "pm_layout_store_slots_v1";

// Prestige-earned slots (0–5). Kept separate from level logic so the prestige
// system can decide when to grant each extra slot (e.g. at levels 10/20/30/50/80).
const PRESTIGE_SLOTS_KEY = "pm_layout_prestige_slots_v1";

/* ---------- helpers ---------- */
function lsRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsWrite(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}
function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}
function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

/* ---------- slot-cap helpers ---------- */

function clampInt(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  n = Math.floor(n);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function getStoreSlotsInternal() {
  const raw = lsRead(STORE_SLOTS_KEY, 0);
  return clampInt(raw, 0, 5);
}

function getPrestigeSlotsInternal() {
  const raw = lsRead(PRESTIGE_SLOTS_KEY, 0);
  return clampInt(raw, 0, 5);
}

function computeSlotCap() {
  const store = getStoreSlotsInternal();
  const prestige = getPrestigeSlotsInternal();
  const total = BASE_FREE_SLOTS + store + prestige;
  return clampInt(total, 1, SLOT_CAP_MAX);
}

/* ---------- defaults ---------- */
function defaultSim() {
  const w = 16,
    h = 16;
  const grid = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => "")
  );
  // tiny starter seed; CityBuilder treats small seeds as ignorable if needed
  grid[5][1] = "st";
  grid[5][2] = "r";
  grid[5][3] = "r";
  grid[6][3] = "r";
  return {
    w,
    h,
    grid,
    meta: { name: "Main Base", kind: "city", updatedAt: Date.now() },
  };
}

/* ---------- ensure base structure ---------- */
function ensureSlots() {
  let list = lsRead(SLOTS_INDEX_KEY, null);
  let active = lsRead(ACTIVE_SLOT_KEY, null);

  // migrate from legacy pm_city_sim if empty
  if (!list || !list.length) {
    let legacy = null;
    for (const k of LEGACY_KEYS) {
      const v = lsRead(k, null);
      if (v && v.grid) {
        legacy = v;
        break;
      }
    }
    list = ["default"];
    const sim = legacy
      ? {
          w: legacy.grid[0]?.length || 0,
          h: legacy.grid.length || 0,
          grid: legacy.grid,
        }
      : defaultSim();
    lsWrite(`${SLOT_GRID_PREFIX}default`, sim);
    lsWrite(SLOTS_INDEX_KEY, list);
    active = "default";
    lsWrite(ACTIVE_SLOT_KEY, active);
  }

  // validate active slot
  if (!active || !list.includes(active)) {
    active = list[0];
    lsWrite(ACTIVE_SLOT_KEY, active);
  }

  return { list, active };
}

/* ---------- public API: slot-cap / monetization ---------- */

// Effective cap right now (base + store + prestige, clamped to SLOT_CAP_MAX)
export function getSlotCap() {
  return computeSlotCap();
}

export function getSlotCapMeta() {
  const store = getStoreSlotsInternal();
  const prestige = getPrestigeSlotsInternal();
  const cap = computeSlotCap();
  return {
    cap, // effective cap right now
    max: SLOT_CAP_MAX,
    baseFree: BASE_FREE_SLOTS,
    store,
    prestige,
  };
}

// Absolute store slot count (0–5)
export function getStoreSlotCount() {
  return getStoreSlotsInternal();
}
export function setStoreSlotCount(n) {
  const val = clampInt(n, 0, 5);
  lsWrite(STORE_SLOTS_KEY, val);
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: STORE_SLOTS_KEY,
      newValue: JSON.stringify(val),
    })
  );
}

// Absolute prestige slot count (0–5)
export function getPrestigeSlotCount() {
  return getPrestigeSlotsInternal();
}
export function setPrestigeSlotCount(n) {
  const val = clampInt(n, 0, 5);
  lsWrite(PRESTIGE_SLOTS_KEY, val);
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: PRESTIGE_SLOTS_KEY,
      newValue: JSON.stringify(val),
    })
  );
}

// Convenience for UIs: are we currently allowed to add another slot?
export function canCreateAnotherSlot() {
  const { list } = ensureSlots();
  const cap = computeSlotCap();
  return list.length < cap;
}

/* ---------- core slot API ---------- */

export function listSlots() {
  const { list, active } = ensureSlots();
  const out = [];
  for (const id of list) {
    const sim = lsRead(`${SLOT_GRID_PREFIX}${id}`, null);
    const w = sim?.grid?.[0]?.length || 0;
    const h = sim?.grid?.length || 0;
    out.push({
      id,
      name: sim?.meta?.name || id,
      kind: sim?.meta?.kind || "city",
      size: `${w}×${h}`,
      updatedAt: sim?.meta?.updatedAt || 0,
      active: id === active,
    });
  }
  // keep active first; rest in insertion order
  return out.sort((a, b) => (a.active ? -1 : b.active ? 1 : 0));
}

export function getActiveSlot() {
  const { active } = ensureSlots();
  return active;
}

export function setActiveSlot(id) {
  const { list } = ensureSlots();
  if (!list.includes(id)) return false;
  lsWrite(ACTIVE_SLOT_KEY, id);
  window.dispatchEvent(
    new StorageEvent("storage", { key: ACTIVE_SLOT_KEY, newValue: id })
  );
  return true;
}

export function loadSim(slotId = null) {
  const { active } = ensureSlots();
  const id = slotId || active;
  return deepClone(lsRead(`${SLOT_GRID_PREFIX}${id}`, defaultSim()));
}

export function saveSim(nextSim, slotId = null) {
  const { active, list } = ensureSlots();
  const id = slotId || active;
  if (!list.includes(id)) list.push(id);
  const merged = {
    ...defaultSim(),
    ...deepClone(nextSim || {}),
    meta: { ...(nextSim?.meta || {}), updatedAt: Date.now() },
  };
  lsWrite(`${SLOT_GRID_PREFIX}${id}`, merged);
  lsWrite(SLOTS_INDEX_KEY, list);
  window.dispatchEvent(
    new StorageEvent("storage", { key: SLOT_GRID_PREFIX + id })
  );
  return true;
}

export function createSlot(id, baseSim = null) {
  if (!id) return false;

  const { list } = ensureSlots();
  if (list.includes(id)) return false;

  // Enforce slot cap: once you hit the computed cap, refuse to create more.
  const cap = computeSlotCap();
  if (list.length >= cap) {
    // Optional: emit a storage event so UIs listening can show a toast.
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "pm_layout_slot_cap_hit_v1",
        newValue: JSON.stringify({ cap, at: Date.now() }),
      })
    );
    return false;
  }

  const sim = baseSim ? deepClone(baseSim) : defaultSim();
  sim.meta = { ...(sim.meta || {}), name: id, updatedAt: Date.now() };
  list.push(id);
  lsWrite(SLOTS_INDEX_KEY, list);
  lsWrite(`${SLOT_GRID_PREFIX}${id}`, sim);
  window.dispatchEvent(new StorageEvent("storage", { key: SLOTS_INDEX_KEY }));
  return true;
}

export function cloneSlot(fromId, toId) {
  if (!fromId || !toId) return false;
  const src = loadSim(fromId);
  if (!src) return false;
  const clone = deepClone(src);
  clone.meta = { ...(clone.meta || {}), name: toId, updatedAt: Date.now() };
  return createSlot(toId, clone);
}

export function deleteSlot(id) {
  const { list, active } = ensureSlots();
  if (!list.includes(id) || list.length <= 1) return false;

  lsRemove(`${SLOT_GRID_PREFIX}${id}`);
  const newList = list.filter((x) => x !== id);
  lsWrite(SLOTS_INDEX_KEY, newList);

  if (id === active) {
    const nextActive = newList[0];
    lsWrite(ACTIVE_SLOT_KEY, nextActive);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: ACTIVE_SLOT_KEY,
        newValue: nextActive,
      })
    );
  }

  window.dispatchEvent(new StorageEvent("storage", { key: SLOTS_INDEX_KEY }));
  return true;
}

export function renameSlot(id, newName) {
  if (!id || !newName) return false;
  const sim = loadSim(id);
  if (!sim) return false;
  sim.meta = { ...(sim.meta || {}), name: newName, updatedAt: Date.now() };
  saveSim(sim, id);
  return true;
}

export function getLayoutKind(slotId = null) {
  const sim = loadSim(slotId);
  return sim?.meta?.kind || "city";
}

export function setLayoutKind(kind, slotId = null) {
  if (!["city", "war"].includes(kind)) return false;
  const sim = loadSim(slotId);
  sim.meta = { ...(sim.meta || {}), kind, updatedAt: Date.now() };
  saveSim(sim, slotId);
  return true;
}

/* ---------- utility ---------- */
// Used by prestige: wipe all layouts so a new run starts from a fresh default.
export function clearAllSlots() {
  const { list } = ensureSlots();

  // Remove all layout slots
  for (const id of list) lsRemove(`${SLOT_GRID_PREFIX}${id}`);
  lsRemove(SLOTS_INDEX_KEY);
  lsRemove(ACTIVE_SLOT_KEY);

  // Also clear any legacy pm_city_sim data so post-prestige runs
  // don't resurrect old cities from pre-slot saves.
  for (const k of LEGACY_KEYS) {
    lsRemove(k);
  }

  window.dispatchEvent(new StorageEvent("storage", { key: "slotsCleared" }));
}
