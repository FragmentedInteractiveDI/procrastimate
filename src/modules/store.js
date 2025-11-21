// FILE: src/modules/store.js
// Logic-only store module. Uses wallet v3 for balances and spending.
// Adds city SKUs (roads, grid size), passive/gate flags, and consumables.

import { getWallet, spendMate } from "./wallet";

// Optional adapters (soft import so nothing crashes in dev)
let addItem = null;
try {
  // expect: addItem(tileId, n)
  ({ addItem } = await import("./buildInventory"));
} catch {
  /* inventory not present yet */
}

const KEY_STATE = "pm_store_v3";
const KEY_CITY_EXTRA = "pm_city_extra_cells_v1";

// ---------- persistence ----------
function readJSON(key, fb) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
}
function writeJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
  return val;
}
function load() {
  return readJSON(KEY_STATE, {
    owned: {},
    equipped: { hat: null, skin: null },
  });
}
function save(s) {
  return writeJSON(KEY_STATE, s);
}

// ---------- small event helper ----------
function emit(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(`store:${name}`, { detail }));
  } catch {}
}
function emitApp(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
}

// ---------- tiny profile/prestige probe (soft) ----------
function getPrestigeLevel() {
  try {
    const p = JSON.parse(localStorage.getItem("pm_profile_v1") || "{}");
    return Number(p?.prestige || 0);
  } catch {
    return 0;
  }
}

// ---------- City helpers ----------
export function getCityExtraCells() {
  return Number(readJSON(KEY_CITY_EXTRA, 0) || 0);
}
function addCityExtraCells(n = 0) {
  const now = getCityExtraCells() + Number(n || 0);
  writeJSON(KEY_CITY_EXTRA, Math.max(0, now));
  emitApp("city:size_added", { delta: n, total: now });
  return now;
}

// ---------- CATALOG ----------
//
// type:
//   - "cosmetic"  : permanent ownership (stays through prestige)
//   - "business"  : permanent ownership; grants passive bonus (aggregated)
//   - "city_item" : consumable pack routed to buildInventory (e.g., roads)
//                    lives under pm_build_inv_v2 and is wiped by prestige
//   - "city_size" : increases grid capacity; NOT owned; prestige-gated
//
// flags:
//   - grantsPassive   : item contributes passive income (we generally avoid selling these)
//   - sellable        : true if item is allowed to be sold back (future)
//   - prestigeMin     : required prestige level to purchase
//   - consumableQty   : for city_item, how many pieces granted
//   - invId           : buildInventory tile id to grant
//   - citySizeDelta   : for city_size, how many 1x1 cells unlocked
//
const CATALOG = [
  // ---- cosmetics (Mate spend, permanent) ----
  {
    id: "hat_cap",
    name: "Cap",
    type: "cosmetic",
    priceCoins: 500,
    priceGems: 0,
  },
  {
    id: "skin_classic",
    name: "Classic Skin",
    type: "cosmetic",
    priceCoins: 0,
    priceGems: 5,
  },

  // ---- business (kept for now; passive; not recommended for real-money sale) ----
  {
    id: "biz_kiosk",
    name: "Kiosk",
    type: "business",
    priceCoins: 2000,
    priceGems: 0,
    bonusPct: 0.02,
    grantsPassive: true,
  },
  {
    id: "biz_stand",
    name: "Food Stand",
    type: "business",
    priceCoins: 4000,
    priceGems: 0,
    bonusPct: 0.04,
    grantsPassive: true,
  },
  {
    id: "biz_shop",
    name: "Corner Shop",
    type: "business",
    priceCoins: 8000,
    priceGems: 0,
    bonusPct: 0.06,
    grantsPassive: true,
  },

  // ---- city: non-passive consumables (safe to sell; wiped on prestige) ----
  {
    id: "city_road_50",
    name: "Road Pack (×50)",
    type: "city_item",
    priceCoins: 500,
    consumableQty: 50,
    invId: "road",
    sellable: true,
    grantsPassive: false,
  },
  {
    id: "city_road_200",
    name: "Road Pack (×200)",
    type: "city_item",
    priceCoins: 1800,
    consumableQty: 200,
    invId: "road",
    sellable: true,
    grantsPassive: false,
  },

  // ---- city: grid size expansions (prestige-gated; no passive income) ----
  {
    id: "city_size_+1",
    name: "Grid +1 cell",
    type: "city_size",
    priceCoins: 5000,
    citySizeDelta: 1,
    prestigeMin: 0,
    grantsPassive: false,
  },
  {
    id: "city_size_+5",
    name: "Grid +5 cells",
    type: "city_size",
    priceCoins: 22000,
    citySizeDelta: 5,
    prestigeMin: 1,
    grantsPassive: false,
  },
  {
    id: "city_size_+10",
    name: "Grid +10 cells",
    type: "city_size",
    priceCoins: 40000,
    citySizeDelta: 10,
    prestigeMin: 2,
    grantsPassive: false,
  },
];

// ---------- public catalog API ----------
export function listCatalog(opts = {}) {
  const { includeHidden = false, types } = opts;
  let list = CATALOG.slice();
  if (Array.isArray(types) && types.length) {
    list = list.filter((i) => types.includes(i.type));
  }
  if (!includeHidden) {
    list = list.filter((i) => !i.hidden);
  }
  return list;
}
export function getStore() {
  return load();
}
export function isOwned(id) {
  const s = load();
  const it = CATALOG.find((x) => x.id === id);
  // consumables and city_size are never "owned"
  if (!it || it.type === "city_item" || it.type === "city_size") return false;
  return !!s.owned?.[id];
}
export function ownedIds() {
  return Object.keys(load().owned || {});
}

// ---------- validators ----------
function gateForItem(it) {
  if (!it) return { ok: false, msg: "Item not found" };
  if (it.prestigeMin != null) {
    const have = getPrestigeLevel();
    if (have < it.prestigeMin) {
      return { ok: false, msg: `Requires Prestige ${it.prestigeMin}` };
    }
  }
  return { ok: true };
}

export function canSell(id) {
  const it = CATALOG.find((x) => x.id === id);
  return !!(it && it.sellable === true && it.type === "city_item");
}
export function grantsPassiveById(id) {
  const it = CATALOG.find((x) => x.id === id);
  return !!it?.grantsPassive;
}

// ---------- purchase (Mate Coins only) ----------
export function buyItem(id, withCurrency = "coins") {
  const it = CATALOG.find((x) => x.id === id);
  if (!it) return { ok: false, msg: "Item not found" };

  // gating
  const gate = gateForItem(it);
  if (!gate.ok) return gate;

  // permanent items cannot be double-purchased
  const s = load();
  if ((it.type === "cosmetic" || it.type === "business") && s.owned[id]) {
    return { ok: false, msg: "Already owned" };
  }
  if (withCurrency !== "coins") return { ok: false, msg: "Gems not supported" };

  const price = Math.max(0, Math.floor(it.priceCoins || 0));

  // Free items
  if (price === 0) {
    if (it.type === "city_item") {
      // grant consumables into buildInventory
      grantCityConsumable(it);
    } else if (it.type === "city_size") {
      addCityExtraCells(it.citySizeDelta || 0);
    } else {
      s.owned[id] = true;
      save(s);
    }
    emit("purchase", { id, price });
    if (it.type !== "city_item") emit("owned", { id });
    return { ok: true };
  }

  // Spend Mate Coins via wallet v3
  const spent = spendMate(price, { k: "store_buy", id });
  if (!spent?.ok) {
    const w = getWallet();
    const have = Math.max(0, Math.floor(w.coins || 0));
    const need = Math.max(0, price - have);
    return {
      ok: false,
      msg: need > 0 ? "Not enough coins" : "Purchase failed",
    };
  }

  // Apply purchase effects
  if (it.type === "city_item") {
    // Consumables: go into buildInventory, wiped on prestige alongside other tiles.
    grantCityConsumable(it);
  } else if (it.type === "city_size") {
    addCityExtraCells(it.citySizeDelta || 0);
  } else {
    // Cosmetics/businesses: permanent ownership; prestige does not touch KEY_STATE.
    s.owned[id] = true;
    save(s);
    emit("owned", { id });
  }

  emit("purchase", { id, price });
  return { ok: true };
}

// ---------- city aggregators ----------
export function businessBonusFromIds(ids = []) {
  let pct = 0;
  for (const id of ids) {
    const it = CATALOG.find((x) => x.id === id && x.type === "business");
    if (it?.bonusPct) pct += it.bonusPct;
  }
  return Math.min(pct, 0.2);
}

// ---------- internal helpers ----------
function grantCityConsumable(it) {
  const qty = Math.max(0, Math.floor(it.consumableQty || 0));
  const invId = it.invId || null;

  // Prefer real inventory module
  if (addItem && invId && qty > 0) {
    try {
      addItem(invId, qty);
    } catch {}
  } else {
    // Minimal local fallback (keeps UX flowing without buildInventory)
    const KINV = "pm_inventory_v1";
    const inv = readJSON(KINV, {});
    inv[invId || it.id] = (inv[invId || it.id] || 0) + qty;
    writeJSON(KINV, inv);
  }

  emitApp("city:inventory_granted", { invId: invId || it.id, qty });
}
