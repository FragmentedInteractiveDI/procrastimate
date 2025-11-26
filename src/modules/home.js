// FILE: src/modules/home.js
import { ls } from "./ls";
import { listCatalog } from "./store";
import { businessBonusFromIds } from "./store";

const KEY = "pm_home_v1";
const GRID_W = 6;
const GRID_H = 6;

// 20-minute base cooldown for home cleanup loop
export const CLEANUP_BASE_COOLDOWN_MS = 20 * 60 * 1000;

function def() {
  return {
    w: GRID_W,
    h: GRID_H,
    cells: Array.from({ length: GRID_W * GRID_H }, () => null), // item ids or null

    // Home cleanup loop state
    cleanup_last_ms: 0, // timestamp of last run
    cleanup_cooldown_ms: CLEANUP_BASE_COOLDOWN_MS, // current cooldown duration
    cleanup_total_runs: 0, // lifetime count
  };
}

function idx(x, y, w = GRID_W) {
  return y * w + x;
}
function inside(x, y) {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}

/**
 * Load + aggressively normalize the home state.
 * - Always force a 6×6 grid.
 * - Repair cells length to exactly 36, copying any prior entries.
 * - Normalize cleanup fields.
 */
function load() {
  const base = def();
  let s = ls.get(KEY, null);

  if (!s || typeof s !== "object") {
    s = base;
  } else {
    // Hard-lock dimensions to 6×6 for v1
    s.w = GRID_W;
    s.h = GRID_H;

    // Ensure cells array exists and has correct length
    if (!Array.isArray(s.cells)) {
      s.cells = Array.from({ length: GRID_W * GRID_H }, () => null);
    } else if (s.cells.length !== GRID_W * GRID_H) {
      const next = Array.from({ length: GRID_W * GRID_H }, () => null);
      const copyLen = Math.min(next.length, s.cells.length);
      for (let i = 0; i < copyLen; i++) {
        next[i] = s.cells[i] ?? null;
      }
      s.cells = next;
    }

    // Normalize cleanup fields
    if (typeof s.cleanup_last_ms !== "number") s.cleanup_last_ms = 0;
    if (
      typeof s.cleanup_cooldown_ms !== "number" ||
      s.cleanup_cooldown_ms <= 0
    ) {
      s.cleanup_cooldown_ms = CLEANUP_BASE_COOLDOWN_MS;
    }
    if (typeof s.cleanup_total_runs !== "number") s.cleanup_total_runs = 0;
  }

  save(s);
  return s;
}

function save(s) {
  ls.set(KEY, s);
  return s;
}

export function getHome() {
  return load();
}

/* ---------- placement helpers ---------- */

export function clearAt(x, y) {
  const s = load();
  if (!inside(x, y)) return { ok: false };
  s.cells[idx(x, y, s.w)] = null;
  save(s);
  return { ok: true };
}

export function placeAt(x, y, itemId) {
  const s = load();
  if (!inside(x, y)) return { ok: false, msg: "Out of bounds" };
  const catalog = listCatalog();
  const item = catalog.find((i) => i.id === itemId);
  if (!item) return { ok: false, msg: "Unknown item" };
  s.cells[idx(x, y, s.w)] = itemId;
  save(s);
  return { ok: true };
}

export function placeBusinessRandom(businessId) {
  const s = load();
  const empties = [];
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (!s.cells[idx(x, y, s.w)]) empties.push([x, y]);
    }
  }
  if (!empties.length) return { ok: false, msg: "No space" };
  const [x, y] = empties[Math.floor(Math.random() * empties.length)];
  s.cells[idx(x, y, s.w)] = businessId;
  save(s);
  return { ok: true, x, y };
}

export function getPlacedBusinessIds() {
  const s = load();
  return s.cells.filter(Boolean).filter((id) => id.startsWith("biz_"));
}

export function calcBusinessBonus() {
  const ids = getPlacedBusinessIds();
  return businessBonusFromIds(ids); // capped inside store
}

/* ---------- home cleanup loop (cooldown) ---------- */

/**
 * Returns the current cleanup state for the Home loop.
 * Used to drive UI (button enabled/disabled, countdown, etc.).
 */
export function getCleanupState(nowMs = Date.now()) {
  const s = load();
  const last = s.cleanup_last_ms || 0;
  const cd = s.cleanup_cooldown_ms || CLEANUP_BASE_COOLDOWN_MS;

  if (!last) {
    return {
      ready: true,
      remainingMs: 0,
      cooldownMs: cd,
      lastRunMs: 0,
      totalRuns: s.cleanup_total_runs || 0,
    };
  }

  const elapsed = Math.max(0, nowMs - last);
  const remaining = Math.max(0, cd - elapsed);

  return {
    ready: remaining <= 0,
    remainingMs: remaining,
    cooldownMs: cd,
    lastRunMs: last,
    totalRuns: s.cleanup_total_runs || 0,
  };
}

/**
 * Call when the player actually starts a cleanup run
 * (i.e., they tapped "Start Cleanup" and the loop begins).
 */
export function markCleanupRunStarted(nowMs = Date.now()) {
  const s = load();
  if (
    typeof s.cleanup_cooldown_ms !== "number" ||
    s.cleanup_cooldown_ms <= 0
  ) {
    s.cleanup_cooldown_ms = CLEANUP_BASE_COOLDOWN_MS;
  }
  s.cleanup_last_ms = nowMs;
  s.cleanup_total_runs = (s.cleanup_total_runs || 0) + 1;
  save(s);
  return getCleanupState(nowMs);
}

/**
 * Used by the "cleanup cooldown ad" to shorten the wait.
 * We move the last_run timestamp backwards by `ms`,
 * never earlier than 0, then recompute state.
 */
export function reduceCleanupCooldown(ms = 0) {
  const delta = Math.max(0, Number(ms) || 0);
  if (delta <= 0) return getCleanupState();

  const s = load();

  // If there was never a run, there's nothing to reduce; it's already ready.
  if (!s.cleanup_last_ms) {
    return getCleanupState();
  }

  const newLast = Math.max(0, s.cleanup_last_ms - delta);
  s.cleanup_last_ms = newLast;
  save(s);
  return getCleanupState();
}