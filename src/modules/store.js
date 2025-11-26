// FILE: src/modules/store.js
// Logic-only store module. Uses wallet v3 for balances and spending.
// Updated with ProcrastiMate bodies (Bibby, Blossom, Scrab, Rays)

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
    equipped: { body: null, expression: null, hat: null },
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
const CATALOG = [
  // ---- PROCRASTIMATE BODIES (permanent ownership, unique characters) ----
  {
    id: "mate_bibby",
    name: "Bibby",
    description: "The friendly blue ProcrastiMate. Reliable and always ready to help!",
    type: "cosmetic",
    priceCoins: 0, // FREE starter
    priceGems: 0,
    category: "avatar",
    subtype: "body",
  },
  {
    id: "mate_blossom",
    name: "Blossom",
    description: "The energetic purple ProcrastiMate with iconic antenna!",
    type: "cosmetic",
    priceCoins: 1000,
    priceGems: 0,
    category: "avatar",
    subtype: "body",
  },
  {
    id: "mate_scrab",
    name: "Scrab",
    description: "The feisty red ProcrastiMate. Scrappy and full of fire!",
    type: "cosmetic",
    priceCoins: 1000,
    priceGems: 0,
    category: "avatar",
    subtype: "body",
  },
  {
    id: "mate_rays",
    name: "Rays",
    description: "The sunny yellow ProcrastiMate. Radiates good vibes!",
    type: "cosmetic",
    priceCoins: 1000,
    priceGems: 0,
    category: "avatar",
    subtype: "body",
  },

  // ---- EXPRESSIONS (work on all bodies!) ----
  {
    id: "expr_happy",
    name: "Happy",
    description: "Classic cheerful expression",
    type: "cosmetic",
    priceCoins: 0, // FREE starter
    priceGems: 0,
    category: "avatar",
    subtype: "expression",
  },
  {
    id: "expr_anxious",
    name: "Anxious",
    description: "Worried and nervous look",
    type: "cosmetic",
    priceCoins: 300,
    priceGems: 0,
    category: "avatar",
    subtype: "expression",
  },
  {
    id: "expr_tired",
    name: "Tired",
    description: "Sleepy and exhausted",
    type: "cosmetic",
    priceCoins: 300,
    priceGems: 0,
    category: "avatar",
    subtype: "expression",
  },
  {
    id: "expr_sad",
    name: "Sad",
    description: "Down and gloomy mood",
    type: "cosmetic",
    priceCoins: 400,
    priceGems: 0,
    category: "avatar",
    subtype: "expression",
  },
  {
    id: "expr_lovely",
    name: "Lovely",
    description: "Heart eyes! In love and happy",
    type: "cosmetic",
    priceCoins: 500,
    priceGems: 0,
    category: "avatar",
    subtype: "expression",
  },

  // ---- HATS (work on all bodies!) ----
  {
    id: "hat_cap",
    name: "Cap",
    description: "Casual red baseball cap",
    type: "cosmetic",
    priceCoins: 500,
    priceGems: 0,
    category: "avatar",
    subtype: "hat",
  },
  {
    id: "hat_bowler",
    name: "Bowler Hat",
    description: "Classy black bowler with red band",
    type: "cosmetic",
    priceCoins: 800,
    priceGems: 0,
    category: "avatar",
    subtype: "hat",
  },
  {
    id: "hat_wizard",
    name: "Wizard Hat",
    description: "Magical starry wizard hat",
    type: "cosmetic",
    priceCoins: 1500,
    priceGems: 0,
    category: "avatar",
    subtype: "hat",
  },

  // ---- HOME: core layout pieces (permanent, no passive) ----
  {
    id: "home_floor_basic",
    name: "Basic Floor",
    type: "home",
    priceCoins: 0,
    priceGems: 0,
    category: "floor",
    subtype: "base",
    interaction: {
      type: "flavor",
      text: "Clean enough that you'd almost eat MateCoins off it.",
    },
  },
  {
    id: "home_rug_cozy",
    name: "Cozy Rug",
    type: "home",
    priceCoins: 400,
    priceGems: 0,
    category: "floor",
    subtype: "rug",
    interaction: {
      type: "flavor",
      text: "Soft, warm, and suspiciously good at hiding crumbs.",
    },
  },
  {
    id: "home_sofa_simple",
    name: "Simple Sofa",
    type: "home",
    priceCoins: 800,
    priceGems: 0,
    category: "furniture",
    subtype: "seating",
    interaction: {
      type: "flavor",
      text: "Your ProcrastiMate vows to be productive… right after this sit.",
    },
  },
  {
    id: "home_chair_gamer",
    name: "Desk Chair",
    type: "home",
    priceCoins: 650,
    priceGems: 0,
    category: "furniture",
    subtype: "chair",
    interaction: {
      type: "flavor",
      text: "Ergonomic enough to almost justify another gaming session.",
    },
  },
  {
    id: "home_bed_single",
    name: "Cozy Bed",
    type: "home",
    priceCoins: 1000,
    priceGems: 0,
    category: "furniture",
    subtype: "bed",
    interaction: {
      type: "flavor",
      text: "Sleep now, conquer your to-do list later. Probably.",
    },
  },
  {
    id: "home_tv_basic",
    name: "Basic TV",
    type: "home",
    priceCoins: 900,
    priceGems: 0,
    category: "appliance",
    subtype: "tv",
    interaction: {
      type: "flavor",
      text: "Skies are golden; MateCoins are in the forecast all week.",
    },
  },
  {
    id: "home_desk_simple",
    name: "Simple Desk",
    type: "home",
    priceCoins: 750,
    priceGems: 0,
    category: "furniture",
    subtype: "desk",
    interaction: {
      type: "flavor",
      text: "A perfectly good place to be productive… or to organize snacks.",
    },
  },
  {
    id: "home_plant_small",
    name: "Small Plant",
    type: "home",
    priceCoins: 300,
    priceGems: 0,
    category: "decor",
    subtype: "plant",
    interaction: {
      type: "flavor",
      text: "It thrives on sunlight and your unresolved tasks.",
    },
  },
  {
    id: "home_lamp_corner",
    name: "Corner Lamp",
    type: "home",
    priceCoins: 350,
    priceGems: 0,
    category: "decor",
    subtype: "lamp",
    interaction: {
      type: "flavor",
      text: "Adds +1 visibility and +10% odds of late-night ideas.",
    },
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
  if (
    (it.type === "cosmetic" ||
      it.type === "business" ||
      it.type === "home") &&
    s.owned[id]
  ) {
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
    // Cosmetics / businesses / home items: permanent ownership.
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