// src/modules/stats.js
// Offline-safe stats with a local op queue. Queue is only for potential cloud sync;
// locally we APPLY then CLEAR to avoid double counting.

const STATS_KEY = "pm_stats_v2";
const QUEUE_KEY = "pm_stats_queue_v1";

const now = () => Date.now();

/* ---------- storage ---------- */
function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
  return val;
}

/* ---------- defaults / normalize ---------- */
function defaultStats() {
  return {
    // legacy fields kept for compatibility
    sessions: 0,
    focusMinutes: 0,
    gameMinutes: 0,

    // active fields
    coinsEarned: 0,        // whole coins only
    adsWatched: 0,         // lifetime ads completed

    // All USD share / skim credited into wallet Review
    usdSkimLifetime: 0,    // total USD skim ever credited to Review
    usdSkimYTD: 0,         // USD skim credited in current calendar year

    // missions / offers analytics
    offersCompleted: 0,          // count of completed missions
    offerCoinsEarned: 0,         // total coins from missions
    usdOfferShareLifetime: 0,    // total USD partner shares credited (lifetime)

    // bonus analytics
    bonusDailyClaims: 0,
    bonusWeeklyClaims: 0,

    lastUpdated: now(),
    history: [],
  };
}
function normalize(s) {
  const base = defaultStats();
  const out = { ...base, ...(s || {}) };

  if (!Array.isArray(out.history)) out.history = [];
  if (out.history.length > 400) out.history.splice(0, out.history.length - 400);

  out.coinsEarned           = Math.max(0, Math.floor(Number(out.coinsEarned) || 0));
  out.adsWatched            = Math.max(0, Number(out.adsWatched) || 0);
  out.usdSkimLifetime       = Math.max(0, Number(out.usdSkimLifetime) || 0);
  out.usdSkimYTD            = Math.max(0, Number(out.usdSkimYTD) || 0);
  out.offersCompleted       = Math.max(0, Number(out.offersCompleted) || 0);
  out.offerCoinsEarned      = Math.max(0, Math.floor(Number(out.offerCoinsEarned) || 0));
  out.usdOfferShareLifetime = Math.max(0, Number(out.usdOfferShareLifetime) || 0);
  out.bonusDailyClaims      = Math.max(0, Number(out.bonusDailyClaims) || 0);
  out.bonusWeeklyClaims     = Math.max(0, Number(out.bonusWeeklyClaims) || 0);

  // legacy
  out.sessions      = Math.max(0, Number(out.sessions) || 0);
  out.focusMinutes  = Math.max(0, Number(out.focusMinutes) || 0);
  out.gameMinutes   = Math.max(0, Number(out.gameMinutes) || 0);

  return out;
}

/* ---------- migration ---------- */
(function migrate() {
  if (readJSON(STATS_KEY, null)) return;
  const v1 = readJSON("pm_stats_v1", null);
  writeJSON(STATS_KEY, normalize(v1 || defaultStats()));
})();

/* ---------- op queue ---------- */
function readQueue() {
  return readJSON(QUEUE_KEY, []);
}
function writeQueue(q) {
  return writeJSON(QUEUE_KEY, q);
}
function rid() {
  try {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return Math.random().toString(36).slice(2);
  }
}
function enqueue(op) {
  const q = readQueue();
  q.push({ id: rid(), t: now(), ...op });
  if (q.length > 500) q.splice(0, q.length - 500);
  writeQueue(q);
}

function applyOp(stats, op) {
  switch (op.k) {
    case "session_add": {
      // legacy
      const m = Math.max(0, Number(op.data?.minutes) || 0);
      stats.sessions += 1;
      stats.focusMinutes += m;
      stats.history.push({ t: op.t, k: "session_add", m });
      break;
    }
    case "coins_earned_add": {
      const amt = Math.max(0, Math.floor(Number(op.data?.amount) || 0));
      if (amt > 0) {
        stats.coinsEarned += amt;
        stats.history.push({ t: op.t, k: "coins_add", amt });
      }
      break;
    }
    case "game_minutes_add": {
      // legacy
      const m = Math.max(0, Number(op.data?.minutes) || 0);
      stats.gameMinutes += m;
      stats.history.push({ t: op.t, k: "game_minutes_add", m });
      break;
    }
    case "ad_watch_inc": {
      // lifetime ad counter
      const n = Math.max(1, Math.floor(Number(op.data?.n) || 1));
      stats.adsWatched += n;
      stats.history.push({ t: op.t, k: "ad_watch", n });
      break;
    }
    case "usd_skim_add": {
      // add USD skim totals (ads + missions + passive)
      const amt = Math.max(0, Number(op.data?.amount) || 0);
      if (amt > 0) {
        stats.usdSkimLifetime = Number(
          (stats.usdSkimLifetime + amt).toFixed(2)
        );

        const curYear = new Date().getFullYear();
        const opYear = new Date(op.t).getFullYear();
        const ytd = opYear === curYear ? stats.usdSkimYTD : 0;
        stats.usdSkimYTD = Number((ytd + amt).toFixed(2));

        stats.history.push({ t: op.t, k: "usd_skim", amt });
      }
      break;
    }
    // ---- missions analytics ----
    case "offer_complete": {
      const coins = Math.max(0, Math.floor(Number(op.data?.coins) || 0));
      const usdShare = Math.max(0, Number(op.data?.usdShare) || 0);
      const offerId = String(op.data?.offerId || "");
      stats.offersCompleted += 1;
      if (coins > 0) stats.offerCoinsEarned += coins;
      if (usdShare > 0) {
        stats.usdOfferShareLifetime = Number(
          (stats.usdOfferShareLifetime + usdShare).toFixed(2)
        );
      }
      stats.history.push({
        t: op.t,
        k: "offer_complete",
        offerId,
        coins,
        usdShare,
      });
      break;
    }
    case "bonus_claim": {
      const kind = op.data?.kind === "weekly" ? "weekly" : "daily";
      const coins = Math.max(0, Math.floor(Number(op.data?.coins) || 0));
      if (kind === "daily") stats.bonusDailyClaims += 1;
      else stats.bonusWeeklyClaims += 1;
      stats.history.push({ t: op.t, k: "bonus_claim", kind, coins });
      break;
    }
    default:
      break;
  }
  stats.lastUpdated = now();
  return stats;
}

// Apply and CLEAR local queue
function flushQueueLocally() {
  const stats = getStats();
  const q = readQueue();
  if (!q.length) return stats;
  const next = q.reduce((acc, op) => applyOp(acc, op), { ...stats });
  writeJSON(STATS_KEY, normalize(next));
  writeQueue([]); // prevent re-apply
  return next;
}

/* ---------- public API ---------- */
export function getStats() {
  return normalize(readJSON(STATS_KEY, defaultStats()));
}

// legacy helpers
export function addSession(minutes = 25) {
  enqueue({
    k: "session_add",
    data: { minutes: Math.max(0, Number(minutes) || 0) },
  });
  return flushQueueLocally();
}
export function addGameMinutes(minutes = 1) {
  enqueue({
    k: "game_minutes_add",
    data: { minutes: Math.max(0, Number(minutes) || 0) },
  });
  return flushQueueLocally();
}

// active helpers
export function addCoinsEarned(amount = 0) {
  enqueue({
    k: "coins_earned_add",
    data: { amount: Math.max(0, Math.floor(Number(amount) || 0)) },
  });
  return flushQueueLocally();
}
export function incAdsWatched(n = 1) {
  enqueue({
    k: "ad_watch_inc",
    data: { n: Math.max(1, Math.floor(Number(n) || 1)) },
  });
  return flushQueueLocally();
}
export function addUsdSkim(amount = 0) {
  enqueue({
    k: "usd_skim_add",
    data: { amount: Math.max(0, Number(amount) || 0) },
  });
  return flushQueueLocally();
}

// missions analytics
export function trackOfferComplete({
  offerId = "",
  coins = 0,
  usdShare = 0,
} = {}) {
  enqueue({
    k: "offer_complete",
    data: {
      offerId: String(offerId || ""),
      coins: Math.max(0, Math.floor(coins || 0)),
      usdShare: Math.max(0, Number(usdShare) || 0),
    },
  });
  return flushQueueLocally();
}
export function trackBonusClaim({ kind = "daily", coins = 0 } = {}) {
  enqueue({
    k: "bonus_claim",
    data: {
      kind: kind === "weekly" ? "weekly" : "daily",
      coins: Math.max(0, Math.floor(coins || 0)),
    },
  });
  return flushQueueLocally();
}

// dev/ops
export function flushStatsOps() {
  return flushQueueLocally();
}
export function resetStatsLocal() {
  writeJSON(STATS_KEY, defaultStats());
  writeQueue([]);
  return getStats();
}
export function getStatsQueue() {
  return readQueue();
}
export function markStatsOpsSynced(ids = []) {
  if (!Array.isArray(ids) || !ids.length) return readQueue();
  const set = new Set(ids);
  return writeQueue(readQueue().filter((op) => !set.has(op.id)));
}

/* ---------- dev hook ---------- */
if (import.meta.env?.DEV && typeof window !== "undefined") {
  // @ts-ignore
  window.__pmStats = {
    getStats,
    flushStatsOps,
    resetStatsLocal,
    getStatsQueue,
    addUsdSkim,
    addCoinsEarned,
    incAdsWatched,
  };
}
