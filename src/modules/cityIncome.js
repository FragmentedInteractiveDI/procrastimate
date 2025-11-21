// src/modules/cityIncome.js
// Passive MateCoin income based on city tiles, boosted by Boost multiplier.
// Ticks every 10s. Simulates offline accrual on load.

import { loadCity } from "./cityState";
import { getBoostTimes, isBoostActive } from "./boost";
import { grantAdReward } from "./wallet";

// localStorage key for last tick timestamp
const LS_KEY_LAST = "pm_income_last_v1";

// per-tile base output (MateCoins per minute)
const TILE_RATE = {
  house: 2,
  shop: 5,
  hq: 20,
  park: 1,
  road: 0,
  avenue: 0,
  start: 0,
  empty: 0,
};

// tick period (seconds)
const TICK_SEC = 10;

function baseOf(cell) {
  if (!cell) return "empty";
  const s = String(cell);
  const at = s.indexOf("@");
  return at === -1 ? s : s.slice(0, at);
}

// compute base per-minute production from current grid (no multipliers)
export function computeBasePerMin() {
  const g = loadCity();
  let total = 0;
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const b = baseOf(g[y][x]);
      total += (TILE_RATE[b] ?? 0);
    }
  }
  return total; // MateCoins per minute (before multipliers)
}

// optional: business bonus hook (0..1). For now, 0.
function getBusinessBonus() {
  try {
    // Placeholder: read something like { bonus: 0.12 } from store state if you have it.
    const raw = localStorage.getItem("pm_store_v2");
    if (!raw) return 0;
    const obj = JSON.parse(raw);
    const b = Number(obj?.businessBonus ?? obj?.bonus ?? 0);
    return isFinite(b) ? Math.max(0, b) : 0;
  } catch {
    return 0;
  }
}

// perform one tick of income (covering `secs` seconds)
function accrueForSeconds(secs) {
  if (secs <= 0) return;
  const perMin = computeBasePerMin();                 // base coins / min (no boost)
  if (perMin <= 0) return;

  const times = getBoostTimes();
  const mult = isBoostActive() ? (times.mult || 1) : 1;
  const biz = getBusinessBonus();                     // e.g., 0.20 = +20%
  // optional premium bonus (0..1). If you have premium state, wire here; otherwise 0.
  const premiumBonus = 0;

  // coins for this slice = perMin * (secs / 60) * multipliers
  const coins = perMin * (secs / 60) * mult * (1 + biz + premiumBonus);
  const baseCoins = Math.floor(coins);

  if (baseCoins > 0) {
    // Use wallet's grant helper; usdValue=0 since this is soft currency only.
    grantAdReward({
      baseCoins,
      boostMult: mult,
      premiumBonus,
      businessBonus: biz,
      boostActive: isBoostActive(),
      usdValue: 0,
      meta: { k: "passive_income" },
    });
  }
}

let _timer = null;

// public: start the passive income engine
export function startCityIncome() {
  if (_timer) return;

  const now = Date.now();
  const last = Number(localStorage.getItem(LS_KEY_LAST) || 0);

  // Offline simulation: grant for missed whole 10s chunks since last tick (cap to 8h)
  if (last > 0 && now > last) {
    const missedSec = Math.min(8 * 60 * 60, Math.floor((now - last) / 1000));
    const chunks = Math.floor(missedSec / TICK_SEC);
    if (chunks > 0) accrueForSeconds(chunks * TICK_SEC);
  }
  localStorage.setItem(LS_KEY_LAST, String(now));

  _timer = setInterval(() => {
    accrueForSeconds(TICK_SEC);
    localStorage.setItem(LS_KEY_LAST, String(Date.now()));
  }, TICK_SEC * 1000);
}

// public: stop (not usually needed in SPA root)
export function stopCityIncome() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

// public: current live estimate shown in HUD (coins/min with current multipliers)
export function getIncomeRatePerMin() {
  const perMin = computeBasePerMin();
  const times = getBoostTimes();
  const mult = isBoostActive() ? (times.mult || 1) : 1;
  const biz = getBusinessBonus();
  const premiumBonus = 0;
  const est = perMin * mult * (1 + biz + premiumBonus);
  return Math.floor(est);
}
