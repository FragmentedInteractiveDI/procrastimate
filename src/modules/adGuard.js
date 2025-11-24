// FILE: src/modules/adGuard.js
// Enhanced ad guard: tiered ads + APB cooldown, with unified USD/coin logging.

import { applyBoost, canWatchAd, getTiers, getBoostTimes } from "./boost";
import { depositMate, creditUsdReview } from "./wallet";
import { incAdsWatched } from "./stats";

const LS = {
  get: (k, f) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : f;
    } catch {
      return f;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

const KEY_EVENTS = "ads.events";
const KEY_REQS = "ads.reqs";
const KEY_COOLDN = "ads.cooldownUntil";
const KEY_SCORE = "ads.suspiciousScore";

let _busy = false;

// Tier config: gross payout and share % we give to player.
// usdShare = usdGross * sharePct
const TIER_CONFIG = {
  1: { id: "tier_1", label: "Tier I", baseCoins: 50, usdGross: 0.05, sharePct: 0.15 },
  2: { id: "tier_2", label: "Tier II", baseCoins: 120, usdGross: 0.15, sharePct: 0.18 },
  3: { id: "tier_3", label: "Tier III", baseCoins: 250, usdGross: 0.40, sharePct: 0.20 },
};

function resolveTierConfig(kind) {
  const n = Number(kind) || 1;
  return TIER_CONFIG[n] || TIER_CONFIG[1];
}

/* ---------- basic guards ---------- */

export function getCooldownMs() {
  const now = Date.now();
  const until = LS.get(KEY_COOLDN, 0) || 0;
  return Math.max(0, until - now);
}

export function getSuspiciousScore() {
  return Number(LS.get(KEY_SCORE, 0) || 0);
}

export function resetAdGuardFlags() {
  LS.set(KEY_REQS, []);
  LS.set(KEY_COOLDN, 0);
}

export function getRecentCount(windowMs = 60_000) {
  const list = LS.get(KEY_EVENTS, []);
  const since = Date.now() - windowMs;
  return list.filter((e) => (e.t || 0) >= since).length;
}

function pushEvent(tierOrTag, extra = {}) {
  const list = LS.get(KEY_EVENTS, []);
  list.push({ t: Date.now(), tier: tierOrTag, ...extra });
  LS.set(KEY_EVENTS, list.slice(-500));
}

function antiSpamGate() {
  const now = Date.now();
  const cdUntil = LS.get(KEY_COOLDN, 0) || 0;
  if (cdUntil && now < cdUntil) {
    return { ok: false, reason: "cooldown", cooldownMs: cdUntil - now };
  }

  const reqs = LS.get(KEY_REQS, []);
  reqs.push(now);
  const recent = reqs.filter((t) => t >= now - 60_000);
  LS.set(KEY_REQS, recent);

  if (recent.length > 12) {
    const until = now + 30_000;
    LS.set(KEY_COOLDN, until);
    LS.set(KEY_SCORE, Number(LS.get(KEY_SCORE, 0) || 0) + 1);
    return { ok: false, reason: "rate_limited", cooldownMs: 30_000 };
  }
  return { ok: true };
}

/* ---------- main entry ---------- */

export async function watchAd(kind = 1) {
  if (_busy) return { ok: false, reason: "busy" };

  const spam = antiSpamGate();
  if (!spam.ok) return spam;

  const isCooldown = kind === "apb_cooldown";
  _busy = true;

  try {
    // Simulated ad latency
    await new Promise((r) => setTimeout(r, 800));

    const cfg = resolveTierConfig(kind);
    const usdShare = Math.max(0, (cfg.usdGross || 0) * (cfg.sharePct || 0));

    /* ---- APB cooldown ad (USD only) ---- */
    if (isCooldown) {
      if (usdShare > 0) {
        creditUsdReview(usdShare, {
          k: "ad_usd_share",
          offerId: cfg.id,
          src: "ad",
          coins: 0,
          tier: kind,
        });
      }
      try {
        incAdsWatched(1);
      } catch {}
      return { ok: true, mode: "cooldown_skip", usdShare };
    }

    /* ---- Tiered ads (1 / 2 / 3) ---- */
    const tiers = getTiers();
    if (!tiers[kind]) return { ok: false, reason: "invalid_tier" };

    if (!canWatchAd()) {
      const times = getBoostTimes();
      return { ok: false, reason: "gate", boost: times, cooldownMs: 0 };
    }

    // Apply boost and grant coins
    applyBoost(kind);
    const { mult } = getBoostTimes();
    const baseCoins = cfg.baseCoins;
    const coins = Math.floor(baseCoins * Math.max(1, Number(mult) || 1));


    // Deposit coins (no src: "ad" - let it log normally)
    if (coins > 0) {
      depositMate(coins, { tier: kind, offerId: cfg.id });
    }

    // Credit USD share (WITH src: "ad" to prevent skim tracking)
    if (usdShare > 0) {
      creditUsdReview(usdShare, {
        k: "ad_usd_share",
        offerId: cfg.id,
        tier: kind,
        src: "ad",
      });
    }

    try {
      incAdsWatched(1);
    } catch {}

    return {
      ok: true,
      boost: getBoostTimes(),
      coins,
      usdShare,
    };
  } catch {
    return { ok: false, reason: "error" };
  } finally {
    _busy = false;
  }
}

/* ---------- misc helpers ---------- */

export function listAdTiers() {
  const t = getTiers();
  return [
    { id: 1, ...t[1] },
    { id: 2, ...t[2] },
    { id: 3, ...t[3] },
  ];
}

export function addAdWatch(tier = 1) {
  try {
    pushEvent(tier);
  } catch {}
}

function attachGlobal() {
  try {
    if (typeof window !== "undefined") {
      window.__pmAdGuard = window.__pmAdGuard || {};
      window.__pmAdGuard.watchAd = watchAd;
      window.__pmAdGuard.getCooldownMs = getCooldownMs;
    }
  } catch {}
}
attachGlobal();