// Centralized caps + helpers for passive math and APB math.

export const AD_BOOST_CAP = 0.15;         // +15% max from ad boost
export const GEAR_CITY_CAP = 0.20;        // +20% max from gear into city passive
export const CITY_PASSIVE_TOTAL_CAP = 0.35;// hard ceiling
export const CRAWL_FACTOR = 0.10;         // 10% baseline when no ad boost

// APB caps (can tune later)
export const APB_COIN_GAIN_CAP = 2.00;    // +200% max from gear (i.e., ×3 total)
export const APB_TIME_BONUS_CAP = 60;     // +60s max from gear

export type CityPassiveInputs = {
  basePerMinute: number;     // city base passive before boosts
  adBoostPct: number;        // 0..1 incoming (will clamp to AD_BOOST_CAP)
  gearCityPct: number;       // 0..1 from gear aggregation (will clamp to GEAR_CITY_CAP)
  adBoostActive: boolean;    // whether ad boost is currently “on”
};

/**
 * Returns final per-minute after applying:
 *  - crawl when ad NOT active,
 *  - clamped ad and gear contributions,
 *  - total cap at 35%.
 */
export function computeCityPassivePerMinute(i: CityPassiveInputs): number {
  const base = Math.max(0, i.basePerMinute);

  // Clamp individual components
  const ad = Math.min(AD_BOOST_CAP, Math.max(0, i.adBoostPct));
  const gear = Math.min(GEAR_CITY_CAP, Math.max(0, i.gearCityPct));

  // Combined additive bonus then capped by the global 35%
  const combined = Math.min(CITY_PASSIVE_TOTAL_CAP, ad + gear);

  // Crawl logic: when ad boost is not active, output is limited to 10% of base
  if (!i.adBoostActive) {
    return base * CRAWL_FACTOR; // gear doesn’t push past crawl ceiling
  }

  // Ad is active → apply combined (up to 35%)
  return base * (1 + combined);
}

export type ApbInputs = {
  basePerCollision: number;  // nominal coin per collision
  collisions: number;        // session count
  gearApbCoinGainPct: number;// 0..1..2 (will clamp to APB_COIN_GAIN_CAP)
};

export function computeApbCoins(i: ApbInputs): number {
  const gain = Math.min(APB_COIN_GAIN_CAP, Math.max(0, i.gearApbCoinGainPct));
  const per = Math.max(0, i.basePerCollision) * (1 + gain);
  return Math.max(0, Math.floor(per * Math.max(0, i.collisions)));
}
