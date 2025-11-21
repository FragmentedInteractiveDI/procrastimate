// src/modules/kyc.js
// Local-only payout profile + soft KYC reminders. No resets or hard gates.

const KEY_V2 = "pm_profile_v2";
const KEY_V1 = "pm_profile_v1";            // migrate if present
const LAST_EARN_TS = "pm_last_earn_ts";    // ms epoch of last coin/USD earn
const REMIND_DISMISS = "pm_kyc_remind_dismiss"; // ms epoch user dismissed until

/* ---------- storage ---------- */
const read = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} return v; };
const now = () => Date.now();

/* ---------- migrate v1 -> v2 once ---------- */
(function migrate() {
  if (localStorage.getItem(KEY_V2)) return;
  const v1 = read(KEY_V1, null);
  if (v1 && typeof v1 === "object") write(KEY_V2, v1);
})();

/* ---------- profile ---------- */
const DEFAULT = { paypalEmail: "", legalName: "", country: "", birthYear: "" };

export function getProfile() {
  const p = read(KEY_V2, DEFAULT);
  return { ...DEFAULT, ...(p || {}) };
}
export function setProfileField(name, value) {
  const p = getProfile();
  p[name] = value;
  write(KEY_V2, p);
  return p;
}

/* ---------- validation ---------- */
export function isValidPaypalEmail(e) {
  const s = String(e || "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* ---------- earnings hooks ---------- */
export function recordEarnEvent() {
  try { localStorage.setItem(LAST_EARN_TS, String(now())); } catch {}
}
export function getLastEarnTs() {
  const t = Number(localStorage.getItem(LAST_EARN_TS) || "0");
  return Number.isFinite(t) ? t : 0;
}

/* ---------- soft reminder policy ---------- */
// Show banner if:
// - No PayPal email AND last earnings older than 30d (nudge) or 90d (strong)
export function getKycStatus() {
  const profile = getProfile();
  const email = String(profile.paypalEmail || "");
  const hasPaypal = isValidPaypalEmail(email);
  const lastEarn = getLastEarnTs();
  const dismissedUntil = Number(localStorage.getItem(REMIND_DISMISS) || "0");

  const ageMs = lastEarn ? now() - lastEarn : Infinity;
  const nudge = !hasPaypal && ageMs >= 30 * 24 * 60 * 60 * 1000;
  const strong = !hasPaypal && ageMs >= 90 * 24 * 60 * 60 * 1000;

  const show = (nudge || strong) && now() >= dismissedUntil;

  return {
    email,
    hasPaypal,
    ready: hasPaypal,        // convenience flag for UI
    lastEarnTs: lastEarn || 0,
    showReminder: !!show,
    severity: strong ? "strong" : (nudge ? "nudge" : "none"),
  };
}

export function dismissKycReminder(days = 7) {
  const until = now() + Math.max(1, days) * 24 * 60 * 60 * 1000;
  try { localStorage.setItem(REMIND_DISMISS, String(until)); } catch {}
  return until;
}

/* ---------- upsert API used by Payouts banner ---------- */
export function upsertPayoutEmail(email) {
  const s = String(email || "").trim();
  if (!isValidPaypalEmail(s)) return { ok: false, reason: "invalid_email" };
  const p = getProfile();
  if (p.paypalEmail === s) return { ok: true, unchanged: true };
  p.paypalEmail = s;
  write(KEY_V2, p);
  // once added, hide reminder immediately
  try { localStorage.setItem(REMIND_DISMISS, String(0)); } catch {}
  return { ok: true };
}
