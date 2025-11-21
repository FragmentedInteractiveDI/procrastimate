// src/modules/economy.js
import { addCoins } from "./wallet";
import { getBoostTimes, isBoostActive } from "./boost";
import { loadSim } from "./cityState";

const LS_TS = "pm_income_ts_v1";
const LS_CARRY = "pm_income_carry_v1";

// Base: 2 coins / min idling (design note)
const BASE_COINS_PER_MIN = 2; // tweakable
const OFFLINE_CAP_HOURS = 6;  // limit offline catch-up

function now() { return Date.now(); }

function readNum(key, def = 0) {
  try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) ? v : def; }
  catch { return def; }
}
function writeNum(key, v) { try { localStorage.setItem(key, String(v)); } catch {} }

function percentBonusFromCity() {
  // Simple v1: count tiles -> % bonus, clamped at +20%
  // house 0.5%, shop 1%, park 0.5%, hq 3%
  const sim = loadSim();
  const g = sim.grid || [];
  let houses=0, shops=0, parks=0, hqs=0;
  for (let y=0; y<g.length; y++) {
    for (let x=0; x<(g[0]?.length||0); x++) {
      const cell = String(g[y][x] || "empty");
      const base = cell.includes("@") ? cell.split("@")[0] : cell;
      if (base==="house") houses++;
      else if (base==="shop") shops++;
      else if (base==="park") parks++;
      else if (base==="hq") hqs++;
    }
  }
  const pct = houses*0.005 + shops*0.01 + parks*0.005 + hqs*0.03;
  return Math.min(0.20, pct); // cap +20%
}

export function getLiveRateCoinsPerSec() {
  const cityBonus = percentBonusFromCity();   // 0 … 0.20
  const basePerSec = BASE_COINS_PER_MIN / 60; // ~0.0333
  const boost = isBoostActive() ? Math.max(1, getBoostTimes().mult || 1) : 1;
  return basePerSec * (1 + cityBonus) * boost;
}

function award(dtSec) {
  const r = getLiveRateCoinsPerSec();          // coins/sec
  const carry = readNum(LS_CARRY, 0);
  const raw = r * dtSec + carry;               // may be fractional
  const whole = Math.floor(raw);
  const nextCarry = raw - whole;
  if (whole > 0) addCoins(whole);
  writeNum(LS_CARRY, nextCarry);
}

export function startIncomeLoop() {
  // offline catch-up
  const last = readNum(LS_TS, 0);
  const t = now();
  if (last > 0) {
    const dt = Math.min((t - last) / 1000, OFFLINE_CAP_HOURS * 3600);
    if (dt > 0) award(dt);
  }
  writeNum(LS_TS, t);

  // live loop
  const id = setInterval(() => {
    const prev = readNum(LS_TS, now());
    const t2 = now();
    const dtSec = Math.max(0, (t2 - prev) / 1000);
    if (dtSec > 0) award(dtSec);
    writeNum(LS_TS, t2);
  }, 1000);

  return () => clearInterval(id);
}
