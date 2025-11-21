// FILE: src/modules/boost.js
// Simple, sticky boost system (never downgrade).
// Tiers: 1 => x5, 2 => x10, 3 => x15. Lower-tier ads only EXTEND time.

const KEY = "pm_boost_v2";
const STACK_GATE_MS = 480 * 60_000; // 480 minutes = 8h gate to START an ad

const TIERS = {
  0: { mult: 1,  durMs: 0 },
  1: { mult: 5,  durMs: 15 * 60_000 },  // Tier I: 15 min
  2: { mult: 10, durMs: 30 * 60_000 },  // Tier II: 30 min
  3: { mult: 15, durMs: 60 * 60_000 },  // Tier III: 60 min
};

const now = () => Date.now();

// --- tiny event bus for UI updates ---
const listeners = new Set();
let expiryTimer = null;

function buildPayload() {
  const times = getBoostTimes();
  return { ...times, boost: getBoost() };
}

function emit() {
  const payload = buildPayload();
  for (const fn of [...listeners]) {
    try { fn(payload); } catch {}
  }
}

/** Subscribe to boost changes. Returns an unsubscribe fn. */
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

// --- storage ---
function readRaw() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; }
  catch { return {}; }
}
function writeRaw(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
  armExpiryTimer(v);
  emit();
  return v;
}
function clean(b) {
  const n = now();
  if (!b || !b.expiresAt || b.expiresAt <= n) return { tier: 0, expiresAt: 0 };
  return b;
}

// --- public core ---
/** Current boost object (expired => tier 0) */
export function getBoost() { return clean(readRaw()); }

/** Current multiplier (1 if none) */
export function getBoostMultiplier() {
  const b = getBoost();
  return (TIERS[b.tier]?.mult) || 1;
}

/** Remaining ms (0 if none) */
export function getRemainingMs() {
  const b = getBoost();
  return Math.max(0, (b.expiresAt || 0) - now());
}

/** Is any boost active right now? */
export function isBoostActive() { return getBoost().tier > 0 && getRemainingMs() > 0; }

/** Gate: can the user start a new boost ad right now? */
export function canWatchAd() {
  return getRemainingMs() < STACK_GATE_MS;
}

/** Expose gate size (ms) */
export function getStackGateMs() { return STACK_GATE_MS; }

/**
 * Apply a boost tier.
 * Rule: You cannot START an ad if remaining >= 480 min.
 * If remaining < 480 min, you get the FULL tier duration added, even past 480.
 * Never downgrade multiplier.
 */
export function applyBoost(newTier = 1) {
  newTier = Math.max(1, Math.min(3, Number(newTier) || 1));

  // gate check
  if (!canWatchAd()) return getBoost();

  const cur = getBoost();
  const base = Math.max(cur.expiresAt || 0, now());
  const addMs = TIERS[newTier].durMs;

  const tier = newTier > (cur.tier || 0) ? newTier : (cur.tier || 0);
  const expiresAt = base + addMs;

  return writeRaw({ tier, expiresAt });
}

/** Clear boost (debug/reset) */
export function clearBoost() { return writeRaw({ tier: 0, expiresAt: 0 }); }

// --- helpers used in UI ---
export function fmtMMSS(t = 0) {
  // accepts seconds or ms; auto-detect
  const totalSec = Math.max(0, Math.round(t > 10_000 ? t / 1000 : t));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function getBoostTimes() {
  const b = getBoost();
  const remainingMs = getRemainingMs();
  return {
    tier: b.tier || 0,
    mult: (TIERS[b.tier]?.mult) || 1,
    endsAt: b.expiresAt || 0,
    remainingMs,
    remainingSec: Math.floor(remainingMs / 1000),
    gateMs: STACK_GATE_MS,
    canWatch: remainingMs < STACK_GATE_MS,
  };
}

// ------- Back-compat exports so old imports keep working -------
export const addBoost = applyBoost;
export function getTiers() { return { 1: TIERS[1], 2: TIERS[2], 3: TIERS[3] }; }
export const state = {
  get tier() { return getBoost().tier; },
  get expiresAt() { return getBoost().expiresAt; },
};

// --- timers and cross-tab sync ---
function armExpiryTimer(b = readRaw()) {
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
  const n = now();
  const ms = (b?.expiresAt || 0) - n;
  if (ms > 0) {
    expiryTimer = setTimeout(() => {
      // Force one final emit at expiry so listeners can drop to idle instantly.
      emit();
    }, ms + 5);
  }
}

// Arm on module load and listen to external storage changes.
armExpiryTimer(readRaw());
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      armExpiryTimer(readRaw());
      emit();
    }
  });
}
