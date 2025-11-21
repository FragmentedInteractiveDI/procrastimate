// src/modules/prestige.js
// One-click prestige: bump level, reset soft progress, keep premium.
// Now locked behind milestones.

import { getWallet } from "./wallet";
import {
  getPrestigeLevel,
  setPrestigeLevel,
  isPremium,
  getAchievementCount,
  setAchievementCount,
  getUsdSkimPct,
} from "./wallet";
import { listCatalog } from "./store";
import { getStats } from "./stats";
import { clearAllSlots } from "./citySlots"; // NEW: wipe all city layouts on prestige

// ---- lock rules ----
const PRESTIGE_RULES = {
  minCoinsEarned: 100_000,   // lifetime coins earned
  minAdsWatched: 25,         // lifetime ads watched
};

export function getPrestigeLockStatus() {
  const s = getStats();
  const unmet = [];
  if ((s.coinsEarned || 0) < PRESTIGE_RULES.minCoinsEarned) unmet.push("coins");
  if ((s.adsWatched || 0) < PRESTIGE_RULES.minAdsWatched) unmet.push("ads");

  return {
    eligible: unmet.length === 0,
    unmet, // array of "coins" | "ads"
    progress: {
      coinsEarned: s.coinsEarned || 0,
      targetCoins: PRESTIGE_RULES.minCoinsEarned,
      adsWatched: s.adsWatched || 0,
      targetAds: PRESTIGE_RULES.minAdsWatched,
    },
    rules: { ...PRESTIGE_RULES },
  };
}

// ---- preview helpers ----
export function getPrestigeInfo() {
  const lvl = getPrestigeLevel();
  const curSkim = getUsdSkimPct();
  const nextSkim = Math.min(curSkim + 0.0025, 0.0375);
  const lock = getPrestigeLockStatus();
  return {
    level: lvl,
    currentSkimPct: curSkim,
    nextSkimPct: nextSkim,
    premium: isPremium(),
    achCount: getAchievementCount(),
    ...lock,
  };
}

// ---- core reset ----
export function prestigeReset() {
  const lock = getPrestigeLockStatus();
  if (!lock.eligible) return { ok: false, reason: "locked", lock };

  // 1) snapshot premium inventory from store
  const cat = listCatalog();
  const premiumIds = new Set(cat.filter(i => i?.premium).map(i => i.id));
  const storeRaw = safeRead("pm_store_v2", {});
  const owned = storeRaw?.owned || {};
  const keptOwned = {};
  for (const [id, v] of Object.entries(owned)) {
    if (premiumIds.has(id)) keptOwned[id] = v;
  }
  const nextStore = { ...(storeRaw || {}), owned: keptOwned };
  safeWrite("pm_store_v2", nextStore);

  // 2) clear city/home/idle income related state
  //    + wipe build inventory so Mate-bought roads/parks are lost on prestige.
  delKeys([
    "pm_city_income_v1",
    "pm_city_income_carry_v1",
    "pm_city_income_carry_micro_v1",
    "pm_city_last_tick_v1",
    "pm_city_income_carry_v2",
    "pm_city_last_tick_v2",
    "pm_offline_v1",
    "pm_home_v1",
    "pm_build_inv_v2", // NEW: reset tile inventory (roads/parks bought with Mate are wiped)
  ]);

  // Clear all layout slots (boards) so placed roads/parks are wiped too.
  try {
    clearAllSlots();
  } catch {
    // ignore in non-browser environments
  }

  // 3) zero only coins in wallet, keep USD
  const w = getWallet();
  const nextW = {
    ...w,
    coins: 0,
    history: [
      ...(w.history || []),
      { k: "prestige", amt: 0, t: Date.now() },
    ].slice(-400),
  };
  safeWrite("pm_wallet_v2", nextW);

  // 4) bump level
  setPrestigeLevel(getPrestigeLevel() + 1);

  // 5) keep achievements as-is
  setAchievementCount(getAchievementCount());

  return { ok: true, level: getPrestigeLevel() };
}

// ---- small utils ----
function safeRead(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function safeWrite(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
  return val;
}
function delKeys(keys) {
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
}
