// src/modules/citySlots.js
// Multi-slot city layouts with legacy migration + id normalization.
// Public API: loadSim(), saveSim(next)
// New API: listSlots(), getActiveSlot(), setActiveSlot(id),
//          createSlot(id, baseSim?), cloneSlot(fromId, toId),
//          deleteSlot(id), renameSlot(id), getLayoutKind(), setLayoutKind(kind).

const LAYOUTS_KEY = "pm_city_layouts_v1";
const ACTIVE_KEY  = "pm_city_active_slot_v1";

// very old keys we may need to migrate from
const LEGACY_KEYS = ["pm_city_sim_v3", "pm_city_sim_v2", "pm_city_sim"];

/* ---------- ls helpers ---------- */
function lsRead(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function lsWrite(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function deepClone(obj) { try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; } }

/* ---------- id normalization ---------- */
// short/legacy → canonical ids used everywhere else
function normId(x = "") {
  const s = String(x || "").toLowerCase();
  if (!s) return "";
  if (s.includes("@")) return normId(s.split("@")[0]);
  if (s === "r")  return "road";
  if (s === "av") return "avenue";
  if (s === "rb" || s === "round" || s === "ra") return "roundabout";
  if (s === "st" || s === "start") return "home"; // spawn tile acts like home in builder
  return s;
}
function normalizeGrid(grid) {
  if (!Array.isArray(grid) || grid.length === 0) return [];
  const h = grid.length, w = Array.isArray(grid[0]) ? grid[0].length : 0;
  const out = Array.from({ length: h }, () => Array.from({ length: w }, () => ""));
  for (let y = 0; y < h; y++) {
    const row = Array.isArray(grid[y]) ? grid[y] : [];
    for (let x = 0; x < w; x++) out[y][x] = normId(row[x]);
  }
  return out;
}

/* ---------- defaults ---------- */
function defaultSim() {
  const w = 16, h = 16;
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => ""));
  // starter: home + short road
  grid[5][1] = "home";
  grid[5][2] = "road";
  grid[5][3] = "road";
  grid[6][3] = "road";
  return { grid, meta: { name: "Main Base", kind: "city", updatedAt: Date.now() } };
}

/* ---------- bootstrap + migration ---------- */
function ensureLayouts() {
  let layouts = lsRead(LAYOUTS_KEY, null);
  let active = lsRead(ACTIVE_KEY, null);

  if (!layouts) {
    // migrate legacy single-save if present
    let legacy = null;
    for (const k of LEGACY_KEYS) {
      const v = lsRead(k, null);
      if (v && v.grid) { legacy = v; break; }
    }
    layouts = { slots: {} };
    const base = legacy ? { ...legacy } : defaultSim();
    // normalize any legacy ids
    const grid = normalizeGrid(base.grid || []);
    layouts.slots.main = { ...base, grid, meta: { ...(base.meta || {}), name: "Main Base", kind: (base.meta?.kind || "city"), updatedAt: Date.now() } };
    active = "main";
    lsWrite(LAYOUTS_KEY, layouts);
    lsWrite(ACTIVE_KEY, active);
  }

  // sanitize current active and grids
  if (!active || !layouts.slots[active]) {
    active = Object.keys(layouts.slots)[0] || "main";
    lsWrite(ACTIVE_KEY, active);
  }
  // one-time normalize pass if any slot still has short ids
  let changed = false;
  for (const id of Object.keys(layouts.slots)) {
    const sim = layouts.slots[id] || {};
    const g = Array.isArray(sim.grid) ? sim.grid : [];
    const normalized = normalizeGrid(g);
    if (g.length && JSON.stringify(g) !== JSON.stringify(normalized)) {
      layouts.slots[id] = { ...sim, grid: normalized, meta: { ...(sim.meta || {}), updatedAt: Date.now() } };
      changed = true;
    }
  }
  if (changed) lsWrite(LAYOUTS_KEY, layouts);

  return { layouts, active };
}

/* ---------- public API ---------- */
export function listSlots() {
  const { layouts, active } = ensureLayouts();
  const out = [];
  for (const [id, sim] of Object.entries(layouts.slots)) {
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
  // active first, then most recently updated
  return out.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || (b.updatedAt - a.updatedAt));
}

export function getActiveSlot() {
  const { active } = ensureLayouts();
  return active;
}

export function setActiveSlot(id) {
  const { layouts } = ensureLayouts();
  if (!layouts.slots[id]) return false;
  lsWrite(ACTIVE_KEY, id);
  // poke storage so other tabs/components refresh
  lsWrite(LAYOUTS_KEY, { ...layouts });
  return true;
}

export function loadSim(slotId = null) {
  const { layouts, active } = ensureLayouts();
  const id = slotId || active;
  const sim = layouts.slots[id] || defaultSim();
  // always hand back normalized ids
  const grid = normalizeGrid(sim.grid || []);
  return deepClone({ ...sim, grid });
}

export function saveSim(nextSim, slotId = null) {
  const { layouts, active } = ensureLayouts();
  const id = slotId || active;
  const cur = layouts.slots[id] || defaultSim();

  const incoming = deepClone(nextSim || {});
  // sanitize grid shape and ids
  let grid = Array.isArray(incoming.grid) ? incoming.grid : cur.grid || [];
  grid = normalizeGrid(grid);

  const merged = {
    ...cur,
    ...incoming,
    grid,
    meta: { ...(cur.meta || {}), ...(incoming.meta || {}), updatedAt: Date.now() },
  };

  layouts.slots[id] = merged;
  lsWrite(LAYOUTS_KEY, layouts);
  return true;
}

export function createSlot(id, baseSim = null) {
  const { layouts } = ensureLayouts();
  if (!id || layouts.slots[id]) return false;
  const sim = baseSim ? deepClone(baseSim) : defaultSim();
  sim.grid = normalizeGrid(sim.grid || []);
  sim.meta = { ...(sim.meta || {}), name: sim.meta?.name || id, kind: sim.meta?.kind || "city", updatedAt: Date.now() };
  layouts.slots[id] = sim;
  lsWrite(LAYOUTS_KEY, layouts);
  return true;
}

export function cloneSlot(fromId, toId) {
  const { layouts } = ensureLayouts();
  if (!layouts.slots[fromId] || !toId || layouts.slots[toId]) return false;
  const sim = deepClone(layouts.slots[fromId]);
  sim.grid = normalizeGrid(sim.grid || []);
  sim.meta = { ...(sim.meta || {}), name: toId, updatedAt: Date.now() };
  layouts.slots[toId] = sim;
  lsWrite(LAYOUTS_KEY, layouts);
  return true;
}

export function deleteSlot(id) {
  const { layouts, active } = ensureLayouts();
  if (!layouts.slots[id]) return false;
  if (Object.keys(layouts.slots).length <= 1) return false; // keep at least one
  delete layouts.slots[id];
  let nextActive = active;
  if (active === id) nextActive = Object.keys(layouts.slots)[0];
  lsWrite(LAYOUTS_KEY, layouts);
  lsWrite(ACTIVE_KEY, nextActive);
  return true;
}

export function renameSlot(id, newName) {
  const { layouts } = ensureLayouts();
  const sim = layouts.slots[id];
  if (!sim || !newName) return false;
  sim.meta = { ...(sim.meta || {}), name: newName, updatedAt: Date.now() };
  lsWrite(LAYOUTS_KEY, layouts);
  return true;
}

export function getLayoutKind(slotId = null) {
  const sim = loadSim(slotId);
  return sim?.meta?.kind || "city"; // "city" or future kinds
}

export function setLayoutKind(kind, slotId = null) {
  const allowed = kind === "war" || kind === "city";
  if (!allowed) return false;
  const { layouts, active } = ensureLayouts();
  const id = slotId || active;
  const sim = layouts.slots[id] || defaultSim();
  sim.meta = { ...(sim.meta || {}), kind, updatedAt: Date.now() };
  layouts.slots[id] = sim;
  lsWrite(LAYOUTS_KEY, layouts);
  return true;
}
