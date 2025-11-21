// src/modules/config.js
// Central lightweight config store (local-only).
// Used for Beta Mode, feature flags, and future remote-sync toggles.

const KEY = "pm_app_config_v1";

// --- internal helpers ---
function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const cfg = raw ? JSON.parse(raw) : {};
    return typeof cfg === "object" && cfg ? cfg : {};
  } catch {
    return {};
  }
}

function write(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
  return cfg;
}

// --- public API ---
export function getConfig() {
  return read();
}

/** Returns true if app is running in Beta (sandbox) mode. */
export function isBetaMode() {
  return !!read().betaMode;
}

/**
 * Enables or disables Beta (sandbox) mode.
 * Persists locally, returns current state (true/false).
 */
export function setBetaMode(on = true) {
  const cfg = read();
  cfg.betaMode = !!on;
  write(cfg);
  return cfg.betaMode;
}

/**
 * Update any config keys safely.
 * Example: updateConfig({ theme: "dark", telemetry: false })
 */
export function updateConfig(partial = {}) {
  const cfg = read();
  Object.assign(cfg, partial);
  write(cfg);
  return cfg;
}

/**
 * Reset to default (empty) config.
 * Use cautiously in development / Reset All.
 */
export function resetConfig() {
  localStorage.removeItem(KEY);
  return {};
}
