// src/screens/Settings.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  getWallet,
  fmtUSD,
  getCoinToUsdRate,
  getUsdSkimPct,
} from "../modules/wallet.js";
import { isBetaMode, setBetaMode } from "../modules/config.js";
import { resetStatsLocal } from "../modules/stats.js";
import { getPrestigeInfo, prestigeReset } from "../modules/prestige.js";
import { getProfile, setProfileField, isValidPaypalEmail } from "../modules/kyc";

export default function Settings({ dark = true, setDark = () => {}, onResetAll = () => {} }) {
  // wallet snapshot (read once; values change rarely and are informational)
  const w = useMemo(() => getWallet() || {}, []);
  const coins = w.coins ?? 0;
  const usd = w.usd ?? 0;
  const yearUsd = w.usd_ytd ?? 0;   // aligned with wallet v3
  const cap = w.usd_cap ?? 500;     // aligned with wallet v3

  // payout profile via KYC module
  const [profile, setProfile] = useState(() => getProfile());
  useEffect(() => {
    setProfile(getProfile());
  }, []);

  // beta mode
  const [beta, setBeta] = useState(isBetaMode());
  useEffect(() => {
    setBetaMode(beta);
  }, [beta]);

  // prestige info
  const [prestige, setPrestige] = useState(getPrestigeInfo());
  const refreshPrestige = () => setPrestige(getPrestigeInfo());

  function onChange(e) {
    const { name, value } = e.target;
    const v = name === "birthYear" ? clampYear(value) : value;
    setProfile((prev) => ({ ...prev, [name]: v }));
    setProfileField(name, v);
  }

  const card = `rounded-2xl p-4 sm:p-6 shadow border ${
    dark ? "bg-stone-800 border-stone-700" : "bg-white border-amber-200/60"
  }`;
  const inputCls = `mt-1 w-full px-3 py-2 rounded-lg border outline-none ${
    dark
      ? "bg-stone-700 border-stone-600 focus:border-amber-400"
      : "bg-white border-amber-200 focus:border-amber-500"
  }`;

  const rate = getCoinToUsdRate();
  const skim = getUsdSkimPct();
  const emailOk = isValidPaypalEmail(profile.paypalEmail);

  function doPrestige() {
    if (!prestige.eligible) return;
    const msg =
`Prestige will:
• Reset coins to 0
• Clear city/home progress and passive carry
• Keep premium purchases
• Keep USD balances and review

Type PRESTIGE to confirm.`;
    const s = prompt(msg);
    if (s !== "PRESTIGE") return;
    const r = prestigeReset();
    if (r?.ok) {
      refreshPrestige();
      alert(
        `Prestiged to level ${r.level}. Increased USD skim applies to future earnings.`
      );
      location.reload();
    } else {
      alert("Prestige locked. Meet the milestones first.");
    }
  }

  return (
    <div className={card}>
      <h2 className="text-xl font-semibold mb-4">Settings</h2>

      {/* Theme */}
      <section className="mb-6">
        <div className="font-medium mb-2">Theme</div>
        <button
          onClick={() => setDark((d) => !d)}
          className={`px-3 py-1.5 rounded-lg border ${
            dark
              ? "border-stone-600 bg-stone-700 hover:bg-stone-600"
              : "border-amber-300 bg-amber-50 hover:bg-amber-100"
          }`}
          aria-label="Toggle theme"
        >
          {dark ? "Switch to Light" : "Switch to Dark"}
        </button>
      </section>

      {/* Beta Mode */}
      <section className="mb-6">
        <div className="font-medium mb-2">Beta Mode</div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={beta}
            onChange={(e) => setBeta(e.target.checked)}
            aria-label="Enable beta mode"
          />
          <span className="text-sm opacity-90">
            Sandbox testers. No real payouts while enabled.
          </span>
        </label>
        <div className="text-xs opacity-70 mt-2">
          Enable for friends &amp; family tests. Turn off for production.
        </div>
      </section>

      {/* Wallet snapshot */}
      <section className="mb-6">
        <div className="font-medium mb-2">Wallet</div>
        <div
          className={`rounded-xl p-4 grid sm:grid-cols-4 gap-3 text-center ${
            dark ? "bg-stone-700" : "bg-amber-50"
          }`}
        >
          <Stat label="Mate Coins" value={coins.toLocaleString()} />
          <Stat label="USD Balance" value={fmtUSD(usd)} />
          <Stat label="This Year Paid" value={fmtUSD(yearUsd)} />
          <Stat label="Annual Cap" value={fmtUSD(cap)} />
        </div>
        <div className="text-xs opacity-70 mt-2">
          Payouts limited to {fmtUSD(cap)} / year per compliance.
        </div>
      </section>

      {/* Economy */}
      <section className="mb-6">
        <div className="font-medium mb-2">Economy</div>
        <div
          className={`rounded-xl p-4 grid sm:grid-cols-2 gap-3 ${
            dark ? "bg-stone-700" : "bg-amber-50"
          }`}
        >
          <Stat
            label="Internal Mate → USD rate"
            value={`$${rate.toFixed(5)} / 🪙`}
          />
          <Stat
            label="USD skim on rewards"
            value={`${Math.round(skim * 100)}%`}
          />
        </div>
        <div className="text-xs opacity-70 mt-2">
          We use this internal rate and skim to compute how much ad/mission
          activity can drip into USD, up to your yearly cap. Mate Coins
          themselves stay in-game and cannot be redeemed for cash.
        </div>
      </section>

      {/* Payout Profile (via KYC) */}
      <section className="mb-6">
        <div className="font-medium mb-2">Payout Profile</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm opacity-80">PayPal Email</span>
            <input
              name="paypalEmail"
              type="email"
              value={profile.paypalEmail || ""}
              onChange={onChange}
              placeholder="you@example.com"
              className={inputCls}
              inputMode="email"
              aria-invalid={!!profile.paypalEmail && !emailOk}
            />
            <div className="text-xs mt-1" style={{ opacity: 0.8 }}>
              {profile.paypalEmail
                ? emailOk
                  ? "Looks valid."
                  : "Invalid email format."
                : "Add to enable payouts."}
            </div>
          </label>
          <label className="block">
            <span className="text-sm opacity-80">Legal Name</span>
            <input
              name="legalName"
              type="text"
              value={profile.legalName || ""}
              onChange={onChange}
              placeholder="First Last"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm opacity-80">Country (optional)</span>
            <input
              name="country"
              type="text"
              value={profile.country || ""}
              onChange={onChange}
              placeholder="US / CA / …"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm opacity-80">Birth Year (optional)</span>
            <input
              name="birthYear"
              type="number"
              min={1900}
              max={2100}
              step={1}
              value={profile.birthYear || ""}
              onChange={onChange}
              placeholder="e.g. 1990"
              className={inputCls}
              inputMode="numeric"
            />
          </label>
        </div>
        <div className="text-xs opacity-70 mt-2">
          Saved locally. Verification happens during payout review.
        </div>
      </section>

      {/* Prestige with lock */}
      <section className="mb-6">
        <div className="font-medium mb-2">Prestige</div>
        <div
          className={`rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            dark ? "bg-stone-700" : "bg-amber-50"
          }`}
        >
          <div className="space-y-1">
            <div className="text-sm opacity-80">
              Current level: <b>{prestige.level}</b>
            </div>
            <div className="text-sm opacity-80">
              Skim now: <b>{pct(prestige.currentSkimPct)}</b> → after prestige:{" "}
              <b>{pct(prestige.nextSkimPct)}</b>
            </div>
            {!prestige.eligible && (
              <div className="text-xs opacity-80">
                Requirements:
                <ul className="list-disc ml-5">
                  <li>
                    Coins earned: {num(prestige.progress.coinsEarned)} /{" "}
                    {num(prestige.progress.targetCoins)}
                  </li>
                  <li>
                    Ads watched: {num(prestige.progress.adsWatched)} /{" "}
                    {num(prestige.progress.targetAds)}
                  </li>
                </ul>
              </div>
            )}
          </div>
          <button
            onClick={doPrestige}
            disabled={!prestige.eligible}
            className={`px-3 py-2 rounded-lg text-white ${
              prestige.eligible
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-stone-500 cursor-not-allowed"
            }`}
            title={
              prestige.eligible
                ? "Prestige now"
                : "Meet the milestones to unlock"
            }
            aria-disabled={!prestige.eligible}
          >
            {prestige.eligible ? "Prestige Now" : "Locked"}
          </button>
        </div>
        <div className="text-xs opacity-70 mt-2">
          Keeps premium items. Resets coins and city/home progress. USD
          balances stay.
        </div>
      </section>

      {/* Dev tools */}
      {import.meta.env.DEV && (
        <section className="mb-6">
          <div className="font-medium mb-2">Developer</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetStatsLocal();
                location.reload();
              }}
              className="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600"
            >
              Reset Stats
            </button>
          </div>
        </section>
      )}

      {/* Danger zone */}
      <section className="mt-8">
        <div className="font-medium mb-2">Danger Zone</div>
        <button
          onClick={onResetAll}
          className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
        >
          Reset All Local Data
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg p-3 border border-transparent bg-opacity-50">
      <div className="text-sm opacity-80">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

/* ---------- helpers ---------- */
function pct(x = 0) {
  return `${Math.round((x || 0) * 1000) / 10}%`;
}
function num(n = 0) {
  return Number(n || 0).toLocaleString();
}
function clampYear(v) {
  const n = Number(String(v).replace(/[^\d]/g, "")) || "";
  if (n === "") return "";
  return Math.min(2100, Math.max(1900, n));
}
