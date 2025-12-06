// TrafficConfig.js
// Tunable parameters for NPC traffic.
// Pure data — no Phaser references. Other scenes can override this file.

export const TILE_SIZE = 28;

// --- Global tuning ---
export const TRAFFIC_MAX = 10;          // max active cars
export const TRAFFIC_SPAWN_MS = 1400;   // spawn rate
export const BASE_SPEED = 45;           // px/sec for neutral persona
export const PLAYER_SPAWN_AVOID_RADIUS = 8 * TILE_SIZE;
export const VIEW_BIAS_MARGIN = 2 * TILE_SIZE;

// --- AI timing ---
export const CELL_GAP_SEC = 0.28;
export const YIELD_PAUSE_SEC = 0.14;
export const RESERVE_SEC = 0.40;
export const UTURN_COOLDOWN_SEC = 2.0;
export const UTURN_MIN_PROGRESS = 0.80;
export const CHAOS_CRASH_BASE = 0.020;

// --- Personas ---
export const PERSONAS = {
  aggressive: { tex: "pm_dot", tint: 0xff7d7d, mult: 1.25, followGapPx: 16 },
  fast:       { tex: "pm_square", tint: 0xffcc66, mult: 1.15, followGapPx: 22 },
  neutral:    { tex: "pm_dot", tint: 0xbfd1ff, mult: 1.0,  followGapPx: 28 },
  slow:       { tex: "pm_diamond", tint: 0xa5d1a5, mult: 0.75, followGapPx: 34 },
};

const PERSONA_WEIGHTS = [
  ["aggressive", 0.1],
  ["fast", 0.25],
  ["neutral", 0.5],
  ["slow", 0.15],
];

export function pickPersonaKey(rng = Math.random) {
  let acc = 0;
  const r = rng();
  for (const [key, w] of PERSONA_WEIGHTS) {
    acc += w;
    if (r <= acc) return key;
  }
  return "neutral";
}
