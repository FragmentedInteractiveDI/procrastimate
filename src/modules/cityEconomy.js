// FILE: src/modules/cityEconomy.js
// Computes passive income (Mate/min). Wallet handles crediting on a 60s tick.

import { getBoostTimes } from "./boost";

/* ---------- policy & tuning ---------- */
// Passive policy
const AD_PCT = 0.15;            // +15% from ad/boost when active
const GEAR_CITY_CAP = 0.20;     // gear → city passive capped at +20%
const TOTAL_PASSIVE_CAP = 0.35; // (ad + gear) ≤ +35%
const CRAWL_FACTOR = 0.10;      // 10% crawl when no boost/ad

// Baseline
const BASE_PER_MIN = 0.2;       // baseline Mate/min

// Per-tile contributions (Mate/min) before crawl/boost.
// Roads are 0 — they don’t directly pay. They only enable buildings and utilization.
const TILE_RATE = {
  road:        0.000,
  avenue:      0.000,
  roundabout:  0.000,
  house:       0.050,
  home:        0.050,
  shop:        0.080,
  park:        0.040,
  hq:          0.200,
  office:      0.160,
  start:       0,
};

// APB policy
const APB_COOLDOWN_SEC   = 20 * 60;  // 20 minutes
const APB_FREE_SEC       = 30;       // 30s free
const APB_SUB_SEC        = 45;       // 45s for subscribers
const APB_LS_KEY         = "pm_apb_times_v1"; // { lastRun, nextAllowed }

// Builder fallback storage key (same as CityScene)
const BUILDER_LS_KEY = "pm_city_state_v1";

/* ---------- tolerant helpers & optional globals ---------- */
const lsGet = (k, f) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

// Optional globals (soft deps):
// window.__pmCitySlots   -> { loadSim() }
// window.__pmMembership  -> { isSubscribed(): boolean, isActive(): boolean }
// window.__pmGearState   -> { getActiveMods(scope): { passive_city_pct?: number } }
// window.__pmAdGuard     -> { watchAd(kind): Promise<{ok:boolean,reason?:string,usdShare?:number}> }
const gCitySlots  = () =>
  (typeof window !== "undefined" ? window.__pmCitySlots : null);
const gMember     = () =>
  (typeof window !== "undefined" ? window.__pmMembership : null);
const gGear       = () =>
  (typeof window !== "undefined" ? window.__pmGearState : null);
const gAdGuard    = () =>
  (typeof window !== "undefined" ? window.__pmAdGuard : null);

/* ---------- normalize tile ids from grid/tiles ---------- */
function normId(id = "") {
  const s = String(id).toLowerCase();
  if (s.includes("@")) return s.split("@")[0];
  if (s === "r")   return "road";
  if (s === "av")  return "avenue";
  if (s === "rb" || s === "round" || s === "ra") return "roundabout";
  if (s === "h")   return "house";
  if (s === "s")   return "shop";
  if (s === "p")   return "park";
  if (s === "hq")  return "hq";
  if (s === "st")  return "start";
  return s;
}

/* ---------- count tiles from active layout ---------- */
function countsFromSlots() {
  const slots = gCitySlots();
  if (!slots?.loadSim) return null;
  try {
    const sim = slots.loadSim();
    const g = Array.isArray(sim?.grid) ? sim.grid : [];
    if (!g.length) return null;

    const c = {
      roads: 0,
      avenues: 0,
      rbs: 0,
      houses: 0,
      shops: 0,
      parks: 0,
      hq: 0,
      offices: 0,
    };
    for (let y = 0; y < g.length; y++) {
      const row = Array.isArray(g[y]) ? g[y] : [];
      for (let x = 0; x < row.length; x++) {
        const k = normId(row[x]);
        if (k === "road") c.roads++;
        else if (k === "avenue") c.avenues++;
        else if (k === "roundabout") c.rbs++;
        else if (k === "house" || k === "home") c.houses++;
        else if (k === "shop") c.shops++;
        else if (k === "park") c.parks++;
        else if (k === "hq") c.hq++;
        else if (k === "office") c.offices++;
      }
    }
    return c;
  } catch {
    return null;
  }
}

function countsFromBuilderLS() {
  const snap = lsGet(BUILDER_LS_KEY, null);
  if (!snap || !Array.isArray(snap.tiles)) return null;

  const c = {
    roads: 0,
    avenues: 0,
    rbs: 0,
    houses: 0,
    shops: 0,
    parks: 0,
    hq: 0,
    offices: 0,
  };
  for (const t of snap.tiles) {
    const k = normId(t?.id);
    if (k === "road") c.roads++;
    else if (k === "avenue") c.avenues++;
    else if (k === "roundabout") c.rbs++;
    else if (k === "house" || k === "home") c.houses++;
    else if (k === "shop") c.shops++;
    else if (k === "park") c.parks++;
    else if (k === "hq") c.hq++;
    else if (k === "office") c.offices++;
  }
  return c;
}

function getCounts() {
  return (
    countsFromSlots() ||
    countsFromBuilderLS() || {
      roads: 0,
      avenues: 0,
      rbs: 0,
      houses: 0,
      shops: 0,
      parks: 0,
      hq: 0,
      offices: 0,
    }
  );
}

/* ---------- utilization (roads enable buildings) ---------- */
/**
 * Utilization gently rewards having enough roads to serve buildings, and
 * penalizes road spam with few buildings.
 *
 * buildings = houses + shops + parks + hq + offices
 * drivable  = roads + avenues + roundabouts
 *
 * ratio = buildings / max(1, drivable)
 * utilization = clamp(0.75 + 0.5*ratio, 0.60, 1.10)
 *
 * Examples:
 *  - Many buildings, few roads: ratio high → up to +10% bonus
 *  - Many roads, few buildings: ratio low → down to -40% penalty
 */
function computeUtilization(counts) {
  const buildings =
    (counts.houses | 0) +
    (counts.shops | 0) +
    (counts.parks | 0) +
    (counts.hq | 0) +
    (counts.offices | 0);
  const drivable =
    (counts.roads | 0) + (counts.avenues | 0) + (counts.rbs | 0);
  const ratio = buildings / Math.max(1, drivable);
  const util = 0.75 + 0.5 * ratio;
  return Math.max(0.6, Math.min(1.1, util));
}

/* ---------- passive snapshot ---------- */
let _snapCache = { t: 0, snap: null };

export function computeCityIncomeSnapshot() {
  const now = Date.now();
  if (now - _snapCache.t < 1000 && _snapCache.snap) return _snapCache.snap;

  const counts = getCounts();
  const { roads, avenues, rbs, houses, shops, parks, hq, offices } = counts;

  // City contribution (roads yield 0 by design)
  const cityPerMin =
    roads * (TILE_RATE.road || 0) +
    avenues * (TILE_RATE.avenue || 0) +
    rbs * (TILE_RATE.roundabout || 0) +
    houses * (TILE_RATE.house || 0) +
    shops * (TILE_RATE.shop || 0) +
    parks * (TILE_RATE.park || 0) +
    hq * (TILE_RATE.hq || 0) +
    offices * (TILE_RATE.office || 0);

  // Apply utilization on the “city” portion only
  const utilization = computeUtilization(counts);
  const cityAdj = cityPerMin * utilization;

  const basePlusCity = BASE_PER_MIN + cityAdj;

  // boost/ad state
  const { remainingSec = 0 } = getBoostTimes() || {};
  const adActive = Math.max(0, Number(remainingSec) || 0) > 0;

  // gear bonus via optional global
  let gearPct = 0;
  try {
    const mods = gGear()?.getActiveMods?.("global");
    gearPct = Math.min(
      GEAR_CITY_CAP,
      Math.max(0, Number(mods?.passive_city_pct || 0))
    );
  } catch {
    gearPct = 0;
  }

  const combined = Math.min(TOTAL_PASSIVE_CAP, AD_PCT + gearPct);

  // multiplier used by CityScene HUD
  const boostMult = adActive ? 1 + combined : CRAWL_FACTOR;

  const effectivePerMin = basePlusCity * boostMult;

  const snap = {
    basePerMin: BASE_PER_MIN,
    cityPerMin: +cityPerMin.toFixed(4),
    cityPerMinUtilized: +cityAdj.toFixed(4),
    utilization,
    adPct: AD_PCT,
    gearPct,
    // When no ad/boost, treat effective extra as 0% (we crawl via CRAWL_FACTOR)
    combinedPct: adActive ? combined : 0,
    totalPerMin: Math.max(0, +effectivePerMin.toFixed(4)),
    remainingBoostSec: Math.max(0, Math.floor(remainingSec || 0)),
    adActive,
    boostMult, // <- CityScene uses this
    debugCounts: {
      roads,
      avenues,
      roundabouts: rbs,
      houses,
      shops,
      parks,
      hq,
      offices,
    },
  };

  _snapCache = { t: now, snap };
  return snap;
}

export function getPassivePerMinute() {
  return Number(computeCityIncomeSnapshot().totalPerMin) || 0;
}

/* ---------- legacy no-ops for older callers ---------- */
export function tickCityEconomy() { /* no-op */ }
export function resetCityIncomeCarry() { /* no-op */ }

/* ======================================================
   APB cooldown + optional "watch ad to skip"
   ====================================================== */

function readApbTimes() {
  return lsGet(APB_LS_KEY, { lastRun: 0, nextAllowed: 0 });
}
function writeApbTimes(t) {
  lsSet(APB_LS_KEY, t);
  try {
    window.dispatchEvent(new Event("apb:status"));
  } catch {}
}

export function getApbStatus() {
  const now = Date.now();
  const { lastRun, nextAllowed } = readApbTimes();

  const member = gMember();
  const isSub = !!(member?.isSubscribed?.() || member?.isActive?.());
  const durationSec = isSub ? APB_SUB_SEC : APB_FREE_SEC;

  const remaining = Math.max(0, Math.floor((nextAllowed - now) / 1000));
  return {
    canRun: remaining === 0,
    cooldownSec: remaining,
    lastRun,
    durationSec,
    isSub,
  };
}

/** Call when an APB run actually begins. */
export function markApbRunStarted() {
  const now = Date.now();
  writeApbTimes({
    lastRun: now,
    nextAllowed: now + APB_COOLDOWN_SEC * 1000,
  });
}

/**
 * Optional UX: "Watch ad to skip cooldown".
 * Returns a result object you can use in UI.
 * The ad itself is started via adGuard. On success adGuard
 * has already credited any USD share into Review; we only
 * report that amount back to the caller for messaging.
 */
export async function skipApbCooldownWithAd() {
  const status = getApbStatus();
  if (status.canRun) {
    return { ok: true, msg: "No cooldown to skip.", usdShare: 0 };
  }
  const ad = gAdGuard();
  if (!ad?.watchAd) {
    return { ok: false, msg: "Ad service unavailable.", usdShare: 0 };
  }

  try {
    const r = await ad.watchAd("apb_cooldown");
    if (!r || r.ok === false) {
      return {
        ok: false,
        msg: r?.msg || "Ad not completed.",
        usdShare: 0,
      };
    }

    // Ad completed → allow immediate run
    const now = Date.now();
    writeApbTimes({ lastRun: now, nextAllowed: now });

    // adGuard already credited USD; we just mirror it for UI.
    const usdEarned =
      typeof r.usdShare === "number" && r.usdShare > 0 ? r.usdShare : 0;

    const dollars = usdEarned > 0 ? usdEarned.toFixed(2) : null;
    const msg = dollars
      ? `Cooldown skipped. +$${dollars} added to USD in Review.`
      : "Cooldown skipped.";

    return { ok: true, msg, usdShare: usdEarned };
  } catch {
    return { ok: false, msg: "Ad error.", usdShare: 0 };
  }
}
