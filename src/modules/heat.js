// src/modules/heat.js
const KEY = "pm_heat_v1";

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

export function getHeat() {
  const s = read();
  if (typeof s.level !== "number") s.level = 0;
  if (typeof s.lastTick !== "number") s.lastTick = Date.now();
  return s;
}
export function addHeat(amount) {
  const s = getHeat();
  s.level = Math.min(100, (s.level || 0) + (amount || 0));
  s.lastTick = Date.now();
  write(s);
  return s.level;
}
// decay ~1 point every 15s
export function tickHeat() {
  const s = getHeat();
  const now = Date.now();
  const steps = Math.floor((now - (s.lastTick || now)) / 15000);
  if (steps > 0) {
    s.level = Math.max(0, (s.level || 0) - steps);
    s.lastTick = now;
    write(s);
  }
  return s.level || 0;
}
export function getHeatMultiplier() {
  const h = (getHeat().level || 0);
  if (h >= 75) return 1.5;
  if (h >= 50) return 1.25;
  if (h >= 25) return 1.1;
  return 1.0;
}
