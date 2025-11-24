// FILE: src/modules/wallet.js
// Micro-units wallet with legacy `coins` mirror for UI compatibility.
// 1 Mate = 1_000_000 microMate.

import { addCoinsEarned, addUsdSkim } from "./stats";
import { recordEarnEvent } from "./kyc";
import { getPassivePerMinute } from "./cityEconomy";

const KEY = "pm_wallet_v3";
export const isDev = !!import.meta.env?.DEV;

/* ---------- economy ---------- */
export const MICRO_PER_MATE = 1_000_000;
export const USD_PER_MATE = 1 / 100_000;
export const USD_PER_MICRO = USD_PER_MATE / MICRO_PER_MATE;
const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
const TICK_MS = 60_000;

/* ---------- skim model ---------- */
const BASE_SKIM_PCT = 0.01;
const MAX_TOTAL_SKIM = 0.0375;

const PRESTIGE_KEY = "pm_prestige_v1";
const PREMIUM_KEY = "pm_premium_v1";
const ACH_KEY = "pm_achievements_v1";
const CARRY_KEY = "pm_coin_carry_v1";

export function getPrestigeLevel() {
  try {
    return Math.max(0, Number(localStorage.getItem(PRESTIGE_KEY)) || 0);
  } catch {
    return 0;
  }
}
export function setPrestigeLevel(n = 0) {
  try {
    localStorage.setItem(PRESTIGE_KEY, String(Math.max(0, Math.floor(n))));
  } catch {}
}
export function isPremium() {
  try {
    return !!JSON.parse(localStorage.getItem(PREMIUM_KEY) || "false");
  } catch {
    return false;
  }
}
export function setPremium(v = true) {
  try {
    localStorage.setItem(PREMIUM_KEY, JSON.stringify(!!v));
  } catch {}
}
export function getAchievementCount() {
  try {
    return Math.max(0, Number(localStorage.getItem(ACH_KEY)) || 0);
  } catch {
    return 0;
  }
}
export function setAchievementCount(n = 0) {
  try {
    localStorage.setItem(ACH_KEY, String(Math.max(0, Math.floor(n))));
  } catch {}
}

export function getSkimBreakdown() {
  const prestigeLvl = getPrestigeLevel();
  const achCount = getAchievementCount();
  const base = BASE_SKIM_PCT;
  const prestige = 0.0025 * Math.min(prestigeLvl, 5);
  const premium = isPremium() ? 0.01 : 0;
  const achievements = 0.001 * Math.min(achCount, 5);
  const raw = base + prestige + premium + achievements;
  const total = Math.min(raw, MAX_TOTAL_SKIM);
  return {
    base,
    prestige,
    premium,
    achievements,
    total,
    capped: total < raw,
    cap: MAX_TOTAL_SKIM,
  };
}
export function getUsdSkimPct() {
  return getSkimBreakdown().total;
}

/* ---------- storage + notify ---------- */
let savePending = false;
const listeners = new Set();

function readRaw() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null") || {};
  } catch {
    return {};
  }
}
function writeRawImmediate(w) {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
    
    // Verify it was saved
    const verify = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch (e) {
    console.error("❌ localStorage.setItem FAILED:", e);
  }
  return w;
}
function persistSoon(w) {
  if (savePending) return;
  savePending = true;
  setTimeout(() => {
    writeRawImmediate(w);
    savePending = false;
  }, 120);
}
function notify() {
  const snap = getWallet();
  for (const f of listeners) {
    try {
      f(snap);
    } catch {}
  }
}
export function onChange(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function syncLegacyCoins(w) {
  w.coins = Math.max(0, Math.floor((Number(w.micro) || 0) / MICRO_PER_MATE));
  return w;
}
function norm(w) {
  const base = {
    micro: 0,
    coins: 0,
    usd: 0,
    usd_review_hold: 0,
    usd_cap: 500,
    usd_ytd: 0,
    last_tick_ms: 0,
    history: [],
  };
  const out = { ...base, ...(w || {}) };
  out.micro = Math.max(0, Math.floor(Number(out.micro) || 0));
  out.usd = Number(out.usd) || 0;
  out.usd_review_hold = Number(out.usd_review_hold) || 0;
  out.usd_cap = Math.max(0, Number(out.usd_cap) || 500);
  out.usd_ytd = Math.max(0, Number(out.usd_ytd) || 0);
  out.last_tick_ms = Math.max(0, Number(out.last_tick_ms) || 0);
  if (!Array.isArray(out.history)) out.history = [];
  if (out.history.length > 400) out.history.splice(0, out.history.length - 400);
  return syncLegacyCoins(out);
}
function write(w) {
  persistSoon(w);
  return w;
}
function pushHist(w, k, amt = 0, extra = {}) {
  w.history.push({ k, amt, t: Date.now(), ...extra });
  if (w.history.length > 400) w.history.splice(0, w.history.length - 400);
}

/* ---------- getters / formatting ---------- */
export function getWallet() {
  return norm(readRaw());
}
export function getMicro() {
  return getWallet().micro;
}
export function getMate() {
  return getWallet().micro / MICRO_PER_MATE;
}
export function getCoins() {
  return getWallet().coins;
}
export function fmtMate(n = 0, digits = 1) {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(digits)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(digits)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(digits)}K`;
  return v.toFixed(0);
}
export function fmtUSD(n = 0) {
  return (Number(n) || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}
export function microToUSD(micro = 0) {
  return (Number(micro) || 0) * USD_PER_MICRO;
}
export function mateToUSD(mate = 0) {
  return (Number(mate) || 0) * USD_PER_MATE;
}
export function usdToMate(usd = 0) {
  return (Number(usd) || 0) / USD_PER_MATE;
}
export function getCoinToUsdRate() {
  return USD_PER_MATE;
}
export function convertCoinsToUsd(coins = 0) {
  return mateToUSD(coins);
}

/* ---------- balance ops ---------- */
export function depositMicro(micro = 0, meta = {}) {
  const add = Math.floor(Number(micro) || 0);
  if (add <= 0) return getWallet();

  const w = norm(readRaw());
  w.micro += add;
  syncLegacyCoins(w);

  // Always log deposits to history
  pushHist(w, "micro_add", add, meta);

  writeRawImmediate(w);
  notify();
  try {
    addCoinsEarned(Math.round(add / MICRO_PER_MATE));
  } catch {}
  recordEarnEvent();
  return w;
}

export function depositMate(mate = 0, meta = {}) {
  return depositMicro(Math.floor((Number(mate) || 0) * MICRO_PER_MATE), meta);
}

export function addCoins(n = 0) {
  const amt = Number(n) || 0;
  if (!Number.isFinite(amt) || amt === 0) return getWallet();

  let carry = 0;
  try {
    carry = Number(JSON.parse(localStorage.getItem(CARRY_KEY) || "0")) || 0;
  } catch {}

  const sum = carry + amt;
  const whole = Math.trunc(sum);
  const frac = sum - whole;

  const w = norm(readRaw());
  if (whole !== 0) {
    const addMicro = whole * MICRO_PER_MATE;
    w.micro += addMicro;
    syncLegacyCoins(w);
    pushHist(w, "coins_add", whole);
    try {
      addCoinsEarned(whole);
    } catch {}
    recordEarnEvent();
  }

  try {
    localStorage.setItem(CARRY_KEY, JSON.stringify(frac));
  } catch {}

  writeRawImmediate(w);
  notify();
  return w;
}

export function spendMate(mate = 0, meta = {}) {
  const need = Math.floor((Number(mate) || 0) * MICRO_PER_MATE);
  if (need <= 0) return { ok: true, wallet: getWallet() };
  const w = norm(readRaw());
  if (w.micro < need) return { ok: false, wallet: w };
  w.micro -= need;
  syncLegacyCoins(w);
  pushHist(w, "micro_spend", -need, meta);
  writeRawImmediate(w);
  notify();
  return { ok: true, wallet: w };
}

export function grantAdReward({ baseCoins = 0, boostMult = 1 }) {
  const mate = Math.floor(
    (Number(baseCoins) || 0) * Math.max(1, Number(boostMult) || 1)
  );
  if (mate > 0) addCoins(mate);
  return getWallet();
}

/* ---------- USD review/hold + cap ---------- */
export function creditUsdReview(amount = 0, meta = {}) {
  
  const add = Math.max(0, Number(amount) || 0);
  
  if (add <= 0) {
    return getWallet();
  }

  const w = norm(readRaw());
  const cents = Math.round(add * 100);
  
  if (cents <= 0) {
    return w;
  }
  
  const addRounded = cents / 100;

  w.usd_review_hold = Math.max(
    0,
    Number(((w.usd_review_hold * 100 + cents) / 100).toFixed(2))
  );

  const histKey = meta?.k ? String(meta.k) : "review_add";
  const extraUsd = meta?.offerId ? { offerId: meta.offerId } : {};
  pushHist(w, histKey, addRounded, extraUsd);

  writeRawImmediate(w);  // ← Use immediate write instead of delayed write
  notify();

  // Only true "skim" (auto drip) should hit the skim stats.
  const isAd = meta && meta.src === "ad";
  if (!isAd) {
    try {
      addUsdSkim(addRounded);
    } catch {}
  } else {
  }
  recordEarnEvent();
  return w;
}

// Small helper so older code can call addUsdToReview and
// newer code can stick with creditUsdReview.
export function addUsdToReview(amount = 0, meta = {}) {
  return creditUsdReview(amount, meta);
}

export function releaseUsdHold() {
  const w = norm(readRaw());
  if ((w.usd_review_hold || 0) <= 0) return w;

  const capLeft = Math.max(0, (w.usd_cap || 500) - (w.usd_ytd || 0));
  const amt = Math.min(capLeft, w.usd_review_hold);
  if (amt <= 0) {
    pushHist(w, "review_blocked_cap", 0);
    return writeRawImmediate(w);
  }

  w.usd_review_hold = Number((w.usd_review_hold - amt).toFixed(2));
  w.usd = Number((w.usd + amt).toFixed(2));
  w.usd_ytd = Number((w.usd_ytd + amt).toFixed(2));

  pushHist(w, "review_release", amt);
  writeRawImmediate(w);
  notify();
  return w;
}

/* ---------- passive tick loop ---------- */
function applyPassiveSkimFromMicro(addMicro, metaK = "skim_auto") {
  if (!addMicro || addMicro <= 0) return;
  const approxUsd = microToUSD(addMicro);
  const skimPct = getUsdSkimPct();
  const skimUsd = approxUsd * skimPct;
  if (skimUsd >= 0.005) {
    creditUsdReview(skimUsd, { k: metaK });
  }
}

function tickOnce() {
  try {
    const perMinMate = Math.max(0, Number(getPassivePerMinute() || 0));
    if (perMinMate > 0) {
      const addMicro = Math.floor(perMinMate * MICRO_PER_MATE);
      if (addMicro > 0) {
        const w = norm(readRaw());
        w.micro += addMicro;
        syncLegacyCoins(w);
        pushHist(w, "passive_tick_micro", addMicro);
        writeRawImmediate(w);  // Use immediate write
        notify();
        try {
          addCoinsEarned(Math.round(addMicro / MICRO_PER_MATE));
        } catch {}
        recordEarnEvent();
        applyPassiveSkimFromMicro(addMicro, "skim_auto_tick");
      }
    }
  } catch {}
}

function catchUpOffline(w) {
  const now = Date.now();
  const last = w.last_tick_ms || 0;
  const delta = Math.max(0, now - last);

  if (last === 0) {
    w.last_tick_ms = now;
    return writeRawImmediate(w);  // Use immediate write
  }

  const capped = Math.min(delta, OFFLINE_CAP_MS);
  const minutes = Math.floor(capped / 60_000);

  if (minutes > 0) {
    try {
      const perMinMate = Math.max(0, Number(getPassivePerMinute() || 0));
      const addMicro = Math.floor(perMinMate * MICRO_PER_MATE * minutes);
      if (addMicro > 0) {
        w.micro += addMicro;
        syncLegacyCoins(w);
        pushHist(w, "offline_catchup", addMicro, { minutes });
        try {
          addCoinsEarned(Math.round(addMicro / MICRO_PER_MATE));
        } catch {}
        applyPassiveSkimFromMicro(addMicro, "skim_auto_offline");
      }
    } catch {}
  }

  w.last_tick_ms = now;
  return writeRawImmediate(w);  // Use immediate write
}

function startTicker() {
  if (window.__pm_wallet_tick) clearInterval(window.__pm_wallet_tick);
  const w = norm(readRaw());
  writeRawImmediate(catchUpOffline(w));  // Use immediate write
  const skew = Date.now() % TICK_MS;
  setTimeout(() => {
    tickOnce();
    window.__pm_wallet_tick = setInterval(tickOnce, TICK_MS);
  }, TICK_MS - skew);
}

if (typeof window !== "undefined") {
  try {
    startTicker();
  } catch {}
}

export function resetWallet() {
  const fresh = norm({
    micro: 0,
    coins: 0,
    usd: 0,
    usd_review_hold: 0,
    usd_ytd: 0,
  });
  writeRawImmediate(fresh);
  notify();
  try {
    localStorage.setItem(CARRY_KEY, "0");
  } catch {}
  return fresh;
}

export { writeRawImmediate, notify };