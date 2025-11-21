// src/modules/rides.ts
// Minimal ride system (NPC + Self-Drive)

type RideKind = "npc" | "self";
export type Ride = {
  id: string, kind: RideKind,
  from: string, to: string,
  etaMs: number, // for npc pickup or self prep
  fareCoins: number, // cost to player
  payoutCoins: number, // job payout
  startedAt?: number, completedAt?: number,
  active: boolean
};

const KEY = "pm_rides_v1";
const OFFER_KEY = "pm_ride_offer_ts"; // cooldown for self-drive offers

function load(): Ride[]{ try { return JSON.parse(localStorage.getItem(KEY)!) || []; } catch { return []; } }
function save(r: Ride[]){ localStorage.setItem(KEY, JSON.stringify(r)); }

export function getActiveRide(): Ride | undefined {
  return load().find(r => r.active);
}

export function clearCompleted(){
  save(load().filter(r => r.active));
}

export function canOfferSelfRide(){
  const last = Number(localStorage.getItem(OFFER_KEY) || 0);
  return Date.now() - last > 1000 * 60 * 8; // every 8 minutes
}

export function markOffered(){
  localStorage.setItem(OFFER_KEY, String(Date.now()));
}

export function offerSelfRide(): Ride {
  const ride: Ride = {
    id: crypto.randomUUID(),
    kind: "self",
    from: "dotA", to: "dotB",
    etaMs: 2000, // small prep time
    fareCoins: 0,               // you’re the driver
    payoutCoins: 140,           // better payout than NPC
    active: true
  };
  const all = load(); all.push(ride); save(all);
  return ride;
}

export function requestNpcRide(): Ride {
  const ride: Ride = {
    id: crypto.randomUUID(),
    kind: "npc",
    from: "dotA", to: "dotC",
    etaMs: 6000,                // driver incoming
    fareCoins: 30,              // coin cost
    payoutCoins: 100,           // baseline payout
    active: true
  };
  const all = load(); all.push(ride); save(all);
  return ride;
}

export function completeRide(id: string){
  const all = load();
  const r = all.find(x => x.id === id && x.active);
  if (!r) return null;
  r.active = false;
  r.completedAt = Date.now();
  save(all);
  return r;
}
