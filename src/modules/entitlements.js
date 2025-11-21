// FILE: src/modules/entitlements.js
// Unified entitlements store (backward + forward compatible).
// - Supports subs map: { sub_ad_lite: true, sub_ad_free: true }
// - Supports legacy flags adLite/adFree and coinPacks
// - Emits "pm_entitlements_changed" on any mutation

const LS = {
  get: (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const K = {
  ENTITLE: "pm_entitlements_v1",        // { subs:{}, coins:number, adLite:boolean, adFree:boolean, coinPacks:{}, lastSync:number }
  SUB:     "pm_subscription_state_v1",  // { adTier:'none'|'lite'|'free', renewsAt:number|null, isActive:boolean }
};

function loadEntRaw() {
  const e = LS.get(K.ENTITLE, null) || {};
  if (!e.subs) e.subs = {};                    // sub map (preferred)
  if (!e.coinPacks) e.coinPacks = {};          // purchased coin packs (counts)
  e.coins = Number(e.coins || 0);              // running coin credit from receipts
  e.adLite = !!e.adLite;                       // legacy flags (kept for compat)
  e.adFree = !!e.adFree;
  e.lastSync = Number(e.lastSync || 0);
  return e;
}
function saveEntRaw(e) { LS.set(K.ENTITLE, e); }

function loadSubRaw() {
  const s = LS.get(K.SUB, null) || { adTier: "none", renewsAt: null, isActive: false };
  s.adTier = s.adTier || "none";
  s.renewsAt = s.renewsAt ?? null;
  s.isActive = !!s.isActive;
  return s;
}
function saveSubRaw(s) { LS.set(K.SUB, s); }

// ---------- Queries ----------
export function hasAdFree() {
  const e = loadEntRaw(), sub = loadSubRaw();
  return !!(e.subs?.sub_ad_free || e.adFree || sub.adTier === "free");
}
export function hasAdLite() {
  const e = loadEntRaw(), sub = loadSubRaw();
  return !!(e.subs?.sub_ad_lite || e.adLite || sub.adTier === "lite" || hasAdFree());
}
export function bannersEnabled() {
  // We only hide banners for Ad-Free; Ad-Lite can show light banners.
  return !hasAdFree();
}

// Generic checker used by some UI components
export function hasEntitlement(key) {
  const e = loadEntRaw();
  if (key in (e.subs || {})) return !!e.subs[key];
  if (key === "sub_ad_free") return hasAdFree();
  if (key === "sub_ad_lite") return hasAdLite();
  return false;
}

// Snapshot (normalized for UI)
export function getEntitlements() {
  const e = loadEntRaw();
  const sub = loadSubRaw();
  // mirror legacy booleans from subs to keep older code stable
  const adLite = e.adLite || !!e.subs.sub_ad_lite;
  const adFree = e.adFree || !!e.subs.sub_ad_free;

  return {
    subs: { ...e.subs, ...(adLite ? { sub_ad_lite: true } : {}), ...(adFree ? { sub_ad_free: true } : {}) },
    coins: e.coins,
    coinPacks: { ...e.coinPacks },
    adLite,
    adFree,
    lastSync: e.lastSync,
    subState: { ...sub }, // { adTier, renewsAt, isActive }
  };
}

// ---------- Mutations ----------
function emitChanged() {
  try { window.dispatchEvent(new Event("pm_entitlements_changed")); } catch {}
}

export function creditCoinPack(id, amount) {
  const e = loadEntRaw();
  e.coinPacks[id] = (e.coinPacks[id] || 0) + Math.max(0, Number(amount || 0));
  e.lastSync = Date.now();
  saveEntRaw(e);
  emitChanged();
}

/**
 * Apply a server/checkout patch. Supports multiple shapes:
 * - Modern: { subs:{ sub_ad_free:true, sub_ad_lite:false }, coins: number }
 * - Legacy: { adLite:boolean, adFree:boolean, coinPacks:{[id]:number} }
 * - With subscription mirror: { sub:{ adTier:'none'|'lite'|'free', renewsAt:number|null, isActive:boolean } }
 */
export function applyReceiptPatch(patch) {
  if (!patch || typeof patch !== "object") return getEntitlements();

  const e = loadEntRaw();

  // Modern subs map
  if (patch.subs && typeof patch.subs === "object") {
    e.subs = { ...e.subs, ...Object.fromEntries(
      Object.entries(patch.subs).map(([k,v]) => [String(k), !!v])
    ) };
  }

  // Legacy flags
  if (patch.adLite != null) e.adLite = !!patch.adLite;
  if (patch.adFree != null) e.adFree = !!patch.adFree;

  // Coins (absolute or additive—treat as absolute if provided as number)
  if (Number.isFinite(patch.coins)) e.coins = Math.max(0, Number(patch.coins));

  // Coin packs
  if (patch.coinPacks && typeof patch.coinPacks === "object") {
    for (const [id, amt] of Object.entries(patch.coinPacks)) {
      e.coinPacks[id] = (e.coinPacks[id] || 0) + Math.max(0, Number(amt || 0));
    }
  }

  e.lastSync = Date.now();
  saveEntRaw(e);

  // Subscription mirror
  if (patch.sub && typeof patch.sub === "object") {
    const cur = loadSubRaw();
    const next = {
      adTier: patch.sub.adTier ?? cur.adTier ?? "none",
      renewsAt: patch.sub.renewsAt ?? cur.renewsAt ?? null,
      isActive: patch.sub.isActive != null ? !!patch.sub.isActive : cur.isActive,
    };
    saveSubRaw(next);
  }

  emitChanged();
  return getEntitlements();
}

export function resetEntitlements() {
  saveEntRaw({ subs: {}, coins: 0, adLite: false, adFree: false, coinPacks: {}, lastSync: 0 });
  saveSubRaw({ adTier: "none", renewsAt: null, isActive: false });
  emitChanged();
}
