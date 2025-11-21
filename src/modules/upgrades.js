// src/modules/upgrades.js
// Persistent upgrade tracking for Store + CityEconomy + Boost integration

const KEY = "pm_upgrades_v1";

const DEF = {
  baseRateBonusPerMin: 0,   // +0.5/min increments
  boostExtraMinPerAd: 0,    // +5 min increments
  maxStackHoursBonus: 0,    // +1h increments
};

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} return v; }

export function getUpgrades() {
  return { ...DEF, ...(read() || DEF) };
}
export function setUpgradesPatch(patch = {}) {
  return write({ ...getUpgrades(), ...(patch || {}) });
}

// ---- Catalog used by Store.jsx ----
export function getUpgradeCatalog() {
  const u = getUpgrades();
  return [
    {
      id: "base_rate",
      title: "Base Rate +0.5/min",
      desc: "Increase passive MateCoin income.",
      level: Math.round((u.baseRateBonusPerMin || 0) / 0.5),
      maxLevel: 10,
      cost: 500 + Math.round(200 * ((u.baseRateBonusPerMin || 0) / 0.5)),
      apply() {
        const cur = getUpgrades();
        if ((cur.baseRateBonusPerMin || 0) >= 5) return { ok: false, reason: "max" };
        return { ok: true, patch: { baseRateBonusPerMin: (cur.baseRateBonusPerMin || 0) + 0.5 } };
      },
    },
    {
      id: "boost_extra",
      title: "Boost Duration +5 min",
      desc: "Each ad adds extra minutes to your boost.",
      level: Math.round((u.boostExtraMinPerAd || 0) / 5),
      maxLevel: 6,
      cost: 800 + 250 * Math.round((u.boostExtraMinPerAd || 0) / 5),
      apply() {
        const cur = getUpgrades();
        if ((cur.boostExtraMinPerAd || 0) >= 30) return { ok: false, reason: "max" };
        return { ok: true, patch: { boostExtraMinPerAd: (cur.boostExtraMinPerAd || 0) + 5 } };
      },
    },
    {
      id: "max_stack",
      title: "Max Stack +1 hour",
      desc: "Increase the boost stack cap above 8h.",
      level: (u.maxStackHoursBonus || 0),
      maxLevel: 4,
      cost: 1200 + 400 * (u.maxStackHoursBonus || 0),
      apply() {
        const cur = getUpgrades();
        if ((cur.maxStackHoursBonus || 0) >= 4) return { ok: false, reason: "max" };
        return { ok: true, patch: { maxStackHoursBonus: (cur.maxStackHoursBonus || 0) + 1 } };
      },
    },
  ];
}
