// src/modules/heat.ts
const KEY = "pm_heat_v1";

export type HeatState = { level: number, lastTick: number };

export function getHeat(): HeatState {
  try { return JSON.parse(localStorage.getItem(KEY)!) || { level: 0, lastTick: Date.now() }; }
  catch { return { level: 0, lastTick: Date.now() }; }
}

function save(s: HeatState){ localStorage.setItem(KEY, JSON.stringify(s)); }

export function addHeat(amount: number){
  const s = getHeat();
  s.level = Math.min(100, s.level + amount);
  s.lastTick = Date.now();
  save(s);
  return s.level;
}

// passive decay ~1 pt every 15s while >0
export function tickHeat(){
  const s = getHeat();
  const now = Date.now();
  const steps = Math.floor((now - s.lastTick) / 15000);
  if (steps > 0){
    s.level = Math.max(0, s.level - steps);
    s.lastTick = now;
    save(s);
  }
  return s.level;
}

export function getHeatMultiplier(){ // mild rubber-band
  const h = getHeat().level;
  if (h >= 75) return 1.5;
  if (h >= 50) return 1.25;
  if (h >= 25) return 1.1;
  return 1.0;
}
