const DEFAULT = {
  road: 100,
  avenue: 25,
  house: 25,
  home: 1,
  park: 15,
  shop: 10,
  hq: 5,
  start: 1,
};

export function getInventory() {
  try {
    const data = JSON.parse(localStorage.getItem("pm_inventory_v1"));
    return { ...DEFAULT, ...data };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveInventory(inv) {
  try {
    localStorage.setItem("pm_inventory_v1", JSON.stringify(inv));
  } catch {}
}

export function consume(item, count = 1) {
  const inv = getInventory();
  if ((inv[item] ?? 0) < count) return false;
  inv[item] -= count;
  saveInventory(inv);
  return true;
}

export function refund(item, count = 1) {
  const inv = getInventory();
  inv[item] = (inv[item] ?? 0) + count;
  saveInventory(inv);
}

export function getGridLimit() {
  return { w: 6, h: 6 }; // default starter grid, unlockable later
}
export function getCosmetics() {
  return [
    { id: "skin_default", type: "skin", label: "Default" },
    { id: "skin_gold", type: "skin", label: "Gold" },
    { id: "hat_cap", type: "hat", label: "Cap" },
    { id: "hat_wizard", type: "hat", label: "Wizard Hat" },
    { id: "hat_crown", type: "hat", label: "Crown" }
  ];
}
