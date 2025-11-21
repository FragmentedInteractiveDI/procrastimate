// FILE: src/screens/Play.jsx
import { useEffect, useState } from "react";
import { watchAd } from "../modules/adGuard";
import {
  getWallet,
  fmtUSD,
  grantAdReward,
  MICRO_PER_MATE,
  fmtMate,
  onChange as onWalletChange,
  isDev,
  creditUsdReview,
} from "../modules/wallet";
import {
  getBoostMultiplier,
  getRemainingMs,
  applyBoost,
  fmtMMSS,
  canWatchAd,
  getStackGateMs,
  onChange as onBoostChange,
} from "../modules/boost";
import { getPassivePerMinute } from "../modules/cityEconomy";

/* ---------- hooks ---------- */
function useWalletLive(fallbackMs = 750) {
  const [w, setW] = useState(getWallet());
  useEffect(() => {
    // realtime via wallet subscription (with light polling fallback)
    const off = onWalletChange(setW);
    const id = setInterval(() => setW(getWallet()), fallbackMs);
    return () => {
      off?.();
      clearInterval(id);
    };
  }, [fallbackMs]);
  return w;
}

/* ---------- UI atoms ---------- */
function Card({ title, dark, children }) {
  return (
    <div
      className={`rounded-xl p-4 border shadow transition-colors duration-300 ${
        dark
          ? "bg-stone-800 border-stone-700 text-stone-100"
          : "bg-white border-amber-200/70 text-slate-800"
      }`}
    >
      {title && (
        <div
          className={`text-sm font-semibold mb-2 opacity-80 ${
            dark ? "text-amber-100" : ""
          }`}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Stat({ label, value, sub, dark }) {
  return (
    <div>
      <div className={`text-xs opacity-70 ${dark ? "text-stone-300" : ""}`}>
        {label}
      </div>
      <div
        className={`text-2xl font-bold tabular-nums ${
          dark ? "text-amber-200" : ""
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className={`text-xs opacity-70 ${dark ? "text-stone-400" : ""}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */
function readPerMinSafe() {
  try {
    const v = Number(getPassivePerMinute() || 0);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/* ---------- screen ---------- */
export default function Play({ dark = false }) {
  const w = useWalletLive();

  // derived wallet numbers (v3 fields)
  const mate = Math.max(0, Math.floor((w.micro || 0) / MICRO_PER_MATE));
  const usd = Number(w.usd || 0);
  const usdCap = Number(w.usd_cap || 0);
  const usdReview = Number(w.usd_review_hold || 0);
  const usdYTD = Number(w.usd_ytd || 0);

  // boost + passive readouts
  const [mult, setMult] = useState(getBoostMultiplier());
  const [leftMs, setLeftMs] = useState(getRemainingMs());
  const [perMin, setPerMin] = useState(readPerMinSafe());
  const [gateOk, setGateOk] = useState(canWatchAd());
  const gateMs = getStackGateMs();

  // live boost updates + lightweight 1s refresh for passive rate
  useEffect(() => {
    const off = onBoostChange(() => {
      setMult(getBoostMultiplier());
      setLeftMs(getRemainingMs());
      setGateOk(canWatchAd());
    });
    const id = setInterval(() => setPerMin(readPerMinSafe()), 1000);
    return () => {
      off?.();
      clearInterval(id);
    };
  }, []);

  // ad/boost UI
  const [loadingTier, setLoadingTier] = useState(0);
  const [cooldownMs, setCooldownMs] = useState(0);

  // cooldown ticker
  useEffect(() => {
    if (cooldownMs <= 0) return;
    const id = setInterval(
      () => setCooldownMs((v) => Math.max(0, v - 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [cooldownMs]);

  const active = mult > 1 && leftMs > 0;

  function creditAdUsd(tierLabel, usdShare) {
    const amt = Number(usdShare) || 0;
    if (amt <= 0) return;
    creditUsdReview(amt, {
      k: "ad_usd_share",
      offerId: tierLabel,
      source: "boost_ad_play",
    });
  }

  async function runTier(tier) {
    if (loadingTier || cooldownMs > 0 || !canWatchAd()) return;
    setLoadingTier(tier);
    const res = await watchAd(tier); // stacks/updates boost internally
    setLoadingTier(0);

    if (res?.ok) {
      creditAdUsd(`tier_${tier}`, res.usdShare);
    } else {
      if (res?.reason === "cooldown" || res?.reason === "rate_limited") {
        setCooldownMs(res?.cooldownMs || 15_000);
      } else if (res?.reason !== "gate") {
        // dev fallback keeps UI usable if ad stack isn't wired
        applyBoost(tier);
      }
    }
  }

  // quick test reward button: behave like a Tier I ad (includes USD share)
  async function testReward() {
    if (loadingTier || cooldownMs > 0 || !canWatchAd()) return;
    setLoadingTier(1);
    const res = await watchAd(1);
    setLoadingTier(0);
    if (res?.ok) {
      creditAdUsd("tier_1_test", res.usdShare);
    }
  }

  const adDisabled = !!loadingTier || cooldownMs > 0 || !gateOk;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Wallet */}
      <Card title="Wallet" dark={dark}>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Mate"
            value={`${fmtMate(mate, 0)} 🪙`}
            sub={`≈ ${(w.micro || 0).toLocaleString()} μMate`}
            dark={dark}
          />
          <Stat label="USD Balance" value={fmtUSD(usd)} dark={dark} />
          <Stat label="Annual Cap" value={fmtUSD(usdCap)} dark={dark} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-4">
          <Stat label="USD in Review" value={fmtUSD(usdReview)} dark={dark} />
          <Stat label="This Year Paid" value={fmtUSD(usdYTD)} dark={dark} />
        </div>

        <div
          className={`mt-4 text-xs opacity-70 ${
            dark ? "text-stone-400" : ""
          }`}
        >
          Balances are local demo values. USD releases respect the annual cap.
        </div>
      </Card>

      {/* Boost */}
      <Card title="Boost" dark={dark}>
        <div className="flex items-center justify-between">
          <div>
            <div
              className={`text-xs opacity-70 ${
                dark ? "text-stone-300" : ""
              }`}
            >
              {active ? "Active" : "Idle"}
            </div>
            <div className="text-2xl font-bold">
              {active ? `x${mult}` : "—"}
              {active && (
                <span className="ml-2 text-base font-medium opacity-80">
                  {fmtMMSS(leftMs)}
                </span>
              )}
            </div>
          </div>
          <div
            className={`px-3 py-1 rounded-lg text-xs border ${
              dark
                ? "bg-stone-700 text-amber-200 border-stone-600"
                : "bg-amber-50 text-amber-800 border-amber-300/70"
            }`}
            aria-live="polite"
          >
            {active ? `x${mult} · ${fmtMMSS(leftMs)}` : "No boost"}
          </div>
        </div>

        {/* Passive rate readout */}
        <div
          className={`mt-2 text-sm ${
            dark ? "text-amber-200" : "text-slate-700"
          }`}
        >
          Passive rate: <b>{perMin.toFixed(2)}</b> 🪙/min
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => runTier(1)}
            disabled={adDisabled}
            className={`px-3 py-1.5 rounded-md text-white text-sm bg-amber-500 hover:brightness-110 ${
              adDisabled ? "opacity-60 cursor-not-allowed" : ""
            }`}
            aria-label="Play Tier I rewarded ad"
            aria-disabled={adDisabled}
          >
            {loadingTier === 1 ? "Playing…" : "Tier I"}
          </button>
          <button
            onClick={() => runTier(2)}
            disabled={adDisabled}
            className={`px-3 py-1.5 rounded-md text-white text-sm bg-blue-600 hover:brightness-110 ${
              adDisabled ? "opacity-60 cursor-not-allowed" : ""
            }`}
            aria-label="Play Tier II rewarded ad"
            aria-disabled={adDisabled}
          >
            {loadingTier === 2 ? "Playing…" : "Tier II"}
          </button>
          <button
            onClick={() => runTier(3)}
            disabled={adDisabled}
            className={`px-3 py-1.5 rounded-md text-white text-sm bg-violet-600 hover:brightness-110 ${
              adDisabled ? "opacity-60 cursor-not-allowed" : ""
            }`}
            aria-label="Play Tier III rewarded ad"
            aria-disabled={adDisabled}
          >
            {loadingTier === 3 ? "Playing…" : "Tier III"}
          </button>

          {isDev && (
            <button
              onClick={testReward}
              className={`ml-auto px-3 py-1.5 rounded-md text-sm border hover:bg-opacity-10 ${
                dark
                  ? "border-stone-600 text-amber-200 hover:bg-stone-700"
                  : "border-amber-300/70 text-slate-700 hover:bg-amber-50"
              }`}
              title="Grant 50 demo Mate via test ad"
            >
              +50 test 🪙
            </button>
          )}
        </div>

        {(cooldownMs > 0 || loadingTier || !gateOk) && (
          <div
            className={`mt-2 text-xs ${
              dark ? "text-stone-300" : "text-slate-600"
            }`}
          >
            {loadingTier
              ? "Playing rewarded ad…"
              : cooldownMs > 0
              ? `Cooldown: ${Math.ceil(cooldownMs / 1000)}s`
              : `Stack full: wait until below ${fmtMMSS(
                  gateMs
                )} to start another ad.`}
          </div>
        )}

        <div
          className={`mt-3 text-xs opacity-70 ${
            dark ? "text-stone-400" : ""
          }`}
        >
          Ads cannot start at or above the 8h stack. If you start at 7:59:59 you
          still get full tier time.
        </div>
      </Card>
    </div>
  );
}
