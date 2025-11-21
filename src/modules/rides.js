// src/modules/rides.js
// Minimal productoRides: NPC ride or periodic Self-Drive offer.

const KEY = "pm_rides_v1";
const OFFER_KEY = "pm_ride_offer_ts";

function load() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } }
function save(arr) { try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {} }

export function getActiveRide() {
  return load().find(r => r.active);
}
export function clearCompleted() {
  save(load().filter(r => r.active));
}

// Self-Drive becomes available every 8 minutes
export function canOfferSelfRide() {
  const last = Number(localStorage.getItem(OFFER_KEY) || 0);
  return Date.now() - last > 8 * 60 * 1000;
}
export function markOffered() {
  localStorage.setItem(OFFER_KEY, String(Date.now()));
}

export function offerSelfRide() {
  const ride = {
    id: crypto.randomUUID(),
    kind: "self",           // you drive
    from: "dotA", to: "dotB",
    etaMs: 2000,            // quick prep
    fareCoins: 0,           // no fare
    payoutCoins: 140,       // higher payout
    active: true,
    startedAt: Date.now(),
  };
  const all = load(); all.push(ride); save(all);
  return ride;
}

export function requestNpcRide() {
  const ride = {
    id: crypto.randomUUID(),
    kind: "npc",            // driver picks you
    from: "dotA", to: "dotC",
    etaMs: 6000,            // driver ETA
    fareCoins: 30,          // you pay fare
    payoutCoins: 100,       // base payout
    active: true,
    startedAt: Date.now(),
  };
  const all = load(); all.push(ride); save(all);
  return ride;
}

export function completeRide(id) {
  const all = load();
  const r = all.find(x => x.id === id && x.active);
  if (!r) return null;
  r.active = false;
  r.completedAt = Date.now();
  save(all);
  return r;
}
