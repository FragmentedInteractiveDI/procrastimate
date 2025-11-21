// src/modules/payoutGate.js
// Central place to decide if an account is payout-eligible.
// For now, reads local Beta Mode + simple country/age hints.

import { isBetaMode } from "./config";

// Minimal local checks (replace with server-side later)
export function isPayoutEligibleLocal({ country = "", birthYear = "" } = {}) {
  // Beta mode blocks real payouts
  if (isBetaMode()) return { ok: false, reason: "beta_mode" };

  // Optional: basic country allowlist (US/CA for early beta)
  const c = String(country || "").trim().toUpperCase();
  if (c && !["US", "CA"].includes(c)) {
    return { ok: false, reason: "country_not_supported" };
  }

  // Optional: crude age gate (>=16); only evaluated if birthYear provided
  const y = Number(birthYear || 0);
  if (y > 0) {
    const age = new Date().getFullYear() - y;
    if (age < 16) return { ok: false, reason: "under_min_age" };
  }

  return { ok: true, reason: "eligible" };
}
