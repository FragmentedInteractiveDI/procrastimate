import { addCoins, creditUsdReview } from "./wallet";

// LS keys
const CAT_KEY = "pm_offers_catalog_v1";
const ST_KEY = "pm_offers_state_v1";

// helpers
const now = () => Date.now();
const read = (k, f) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
  return v;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// start-of-day key (UTC) for daily caps
function dayKey(ts = now()) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/* ---------- default catalog ---------- */
function defaultCatalog() {
  return [
    {
      id: "boost_visit_blog",
      title: "Visit our dev blog",
      provider: "House",
      category: "boosts",
      rewardCoins: 50,
      cooldownHours: 1,
      maxPerDay: 16,
      url: "https://example.com/devblog",
    },
    {
      id: "boost_watch_trailer",
      title: "Watch a partner trailer",
      provider: "House",
      category: "boosts",
      rewardCoins: 75,
      cooldownHours: 1,
      maxPerDay: 16,
      url: "https://example.com/trailer",
    },
    {
      id: "app_finance_helper",
      title: "Try Finance Helper",
      provider: "Acme Apps",
      category: "apps",
      rewardCoins: 600,
      cooldownHours: 4,
      maxPerDay: 8,
      url: "https://example.com/app/finance",
      usdShareUsd: 0.03,
    },
    {
      id: "game_puzzle_quest",
      title: "Reach level 10 in Puzzle Quest",
      provider: "Acme Games",
      category: "games",
      rewardCoins: 900,
      cooldownHours: 4,
      maxPerDay: 8,
      url: "https://example.com/game/pq",
      usdShareUsd: 0.05,
    },
    {
      id: "survey_minute",
      title: "1-minute survey",
      provider: "House",
      category: "surveys",
      rewardCoins: 120,
      cooldownHours: 1,
      maxPerDay: 16,
      url: "https://example.com/survey",
    },
  ];
}

/* ---------- catalog ---------- */
function getCatalog() {
  const c = read(CAT_KEY, null);
  if (Array.isArray(c) && c.length) return c;
  return write(CAT_KEY, defaultCatalog());
}

/* ---------- state ---------- */
function getState() {
  const raw = read(ST_KEY, null);
  const base = { byId: {}, ver: 2 };
  if (!raw || typeof raw !== "object" || !raw.byId) return write(ST_KEY, base);

  if (!raw.ver || raw.ver < 2) {
    for (const [id, s] of Object.entries(raw.byId || {})) {
      raw.byId[id] = {
        last: Number(s?.last) || 0,
        times: Math.max(0, Number(s?.times) || 0),
        dayKey: dayKey(0),
        dayCount: 0,
      };
    }
    raw.ver = 2;
    return write(ST_KEY, raw);
  }

  for (const [id, s] of Object.entries(raw.byId || {})) {
    if (!s || typeof s !== "object")
      raw.byId[id] = { last: 0, times: 0, dayKey: dayKey(0), dayCount: 0 };
    else {
      if (!Number.isFinite(s.last)) s.last = 0;
      if (!Number.isFinite(s.times)) s.times = 0;
      if (typeof s.dayKey !== "string") s.dayKey = dayKey(0);
      if (!Number.isFinite(s.dayCount)) s.dayCount = 0;
    }
  }
  if (!raw.ver) raw.ver = 2;
  return write(ST_KEY, raw);
}

function ensureEntries() {
  const cat = getCatalog();
  const st = getState();
  let changed = false;
  for (const o of cat) {
    if (!st.byId[o.id]) {
      st.byId[o.id] = { last: 0, times: 0, dayKey: dayKey(0), dayCount: 0 };
      changed = true;
    }
  }
  if (changed) write(ST_KEY, st);
  return { cat, st };
}

/* ---------- public API ---------- */
export function listOffers() {
  const { cat, st } = ensureEntries();
  const todayKey = dayKey();
  return cat.map((o) => {
    const s = st.byId[o.id] || { last: 0, times: 0, dayKey: dayKey(0), dayCount: 0 };
    const cdHours = clamp(Number(o.cooldownHours || 0) || 0, 1, 12);
    const cdMs = cdHours * 3600_000;
    const availableInMs = Math.max(0, (s.last || 0) + cdMs - now());

    const maxPerDay = Math.max(1, Math.floor(Number(o.maxPerDay || 0) || 8));
    const dayCount = s.dayKey === todayKey ? (s.dayCount || 0) : 0;
    const dailyLeft = Math.max(0, maxPerDay - dayCount);

    return {
      ...o,
      cooldownHours: cdHours,
      maxPerDay,
      completedTimes: s.times || 0,
      availableInMs,
      dailyLeft,
    };
  });
}

export function canComplete(offerId) {
  const { cat, st } = ensureEntries();
  const o = cat.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: "not_found" };

  const s = st.byId[offerId] || { last: 0, times: 0, dayKey: dayKey(0), dayCount: 0 };
  const cdHours = clamp(Number(o.cooldownHours || 0) || 0, 1, 12);
  const cdMs = cdHours * 3600_000;
  const ms = Math.max(0, (s.last || 0) + cdMs - now());
  if (ms > 0) return { ok: false, reason: "cooldown", ms };

  const todayKey = dayKey();
  const dayCount = s.dayKey === todayKey ? (s.dayCount || 0) : 0;
  const maxPerDay = Math.max(1, Math.floor(Number(o.maxPerDay || 0) || 8));
  if (dayCount >= maxPerDay) return { ok: false, reason: "daily_cap" };

  return { ok: true };
}

export function completeOffer(offerId) {
  const gate = canComplete(offerId);
  if (!gate.ok) return gate;

  const { cat, st } = ensureEntries();
  const o = cat.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: "not_found" };

  const coins = Math.max(0, Math.floor(o.rewardCoins || 0));
  if (coins > 0) {
    try {
      addCoins(coins);
    } catch {}
  }

  const usd = Math.max(0, Number(o.usdShareUsd || 0));
  if (usd > 0) {
    try {
      creditUsdReview(usd, {
        k: "offer_usd_share",
        offerId: o.id,
        source: "offerwall",
      });
    } catch {}
  }

  const todayKey = dayKey();
  const cur = st.byId[offerId] || { last: 0, times: 0, dayKey: dayKey(0), dayCount: 0 };
  const sameDay = cur.dayKey === todayKey;
  st.byId[offerId] = {
    last: now(),
    times: (cur.times || 0) + 1,
    dayKey: todayKey,
    dayCount: (sameDay ? cur.dayCount : 0) + 1,
  };
  write(ST_KEY, st);

  return { ok: true, coins, usd };
}

/* ---------- admin/dev helpers ---------- */
export function _resetOffersState() {
  write(ST_KEY, { byId: {}, ver: 2 });
  ensureEntries();
  return listOffers();
}

export function _setCatalog(list) {
  if (Array.isArray(list)) write(CAT_KEY, list);
  ensureEntries();
  return listOffers();
}
