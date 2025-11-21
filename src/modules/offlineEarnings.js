// src/modules/offlineEarnings.js
import { getBoostTimes, isBoostActive } from "./boost";
import { addCoins } from "./wallet";

const KEY = "pm_offline_at";
const MAX_MINUTES = 12 * 60; // 12h cap
const COINS_PER_MIN = 0.5; // base rate

export function saveOfflineTimestamp() {
  try {
    localStorage.setItem(KEY, Date.now().toString());
  } catch {}
}

export function calculateOfflineEarnings() {
  const ts = parseInt(localStorage.getItem(KEY) || "0", 10);
  if (!ts || isNaN(ts)) return null;

  const minutes = Math.min(MAX_MINUTES, Math.floor((Date.now() - ts) / 60000));
  if (minutes <= 0) return null;

  const { mult = 1 } = isBoostActive() ? getBoostTimes() : { mult: 1 };
  const coins = +(minutes * COINS_PER_MIN * mult).toFixed(2);

  return { minutes, coins, mult };
}

export function claimOfflineEarnings() {
  const data = calculateOfflineEarnings();
  if (!data) return null;
  addCoins(data.coins);
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return data;
}