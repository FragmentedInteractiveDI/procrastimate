// FILE: src/screens/Payouts.jsx
import { useEffect, useRef, useState } from "react";
import {
  ScreenHeader,
  Card,
  StatRow,
  IconButton,
  Popover,
} from "../components/ui";
import { watchAd } from "../modules/adGuard";
import {
  getWallet,
  releaseUsdHold,
  fmtUSD,
  isDev,
  getCoinToUsdRate,
  getUsdSkimPct,
  MICRO_PER_MATE,
  onChange,
} from "../modules/wallet";
import {
  getBoostTimes,
  isBoostActive,
  fmtMMSS,
  canWatchAd,
} from "../modules/boost";
import { computeCityIncomeSnapshot } from "../modules/cityEconomy";
import { getStats } from "../modules/stats";
import {
  getKycStatus,
  upsertPayoutEmail,
  dismissKycReminder,
} from "../modules/kyc";

/* ---------- hooks ---------- */
function usePoll(fn, ms = 600) {
  const [v, setV] = useState(fn());
  useEffect(() => {
    const id = setInterval(() => setV(fn()), ms);
    return () => clearInterval(id);
  }, [fn, ms]);
  return v;
}

/* ---------- small utils ---------- */
function fmtUSDTiny(n = 0) {
  const v = Number(n) || 0;
  if (v >= 0.005) return fmtUSD(v);
  return `$${v.toFixed(4)}`;
}
const toMate = (micro = 0) =>
  Math.floor((Number(micro) || 0) / MICRO_PER_MATE);

/* ---------- screen ---------- */
export default function Payouts() {
  const [w, setW] = useState(getWallet);
  const stats = usePoll(getStats, 1200);
  const kyc = usePoll(getKycStatus, 2000);

  const [times, setTimes] = useState(getBoostTimes());
  const [snap, setSnap] = useState(computeCityIncomeSnapshot());
  const [toast, setToast] = useState("");

  const gateBlocked = !canWatchAd();

  // Listen to wallet changes directly instead of polling
  useEffect(() => {
    const unsubscribe = onChange((newWallet) => {
      setW(newWallet);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setTimes(getBoostTimes());
      setSnap(computeCityIncomeSnapshot());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  function showAdToast(label, res) {
    if (!res) return;
    const coins = Number(res.coins || 0);
    const usd = Number(res.usdShare || 0);

    let msg = label;
    const bits = [];
    if (coins > 0) bits.push(`+${coins.toLocaleString()} 🪙`);
    if (usd > 0) bits.push(`+${fmtUSDTiny(usd)} to USD in Review`);
    if (bits.length) msg += ` — ${bits.join(" · ")}`;

    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function runTier(tier) {
    if (gateBlocked) return;
    const res = await watchAd(tier);
    if (res?.ok) {
      const label =
        tier === 1
          ? "Tier I ad complete"
          : tier === 2
          ? "Tier II ad complete"
          : "Tier III ad complete";
      showAdToast(label, res);
    } else if (res?.reason === "gate") {
      setToast("Stack full. Wait until below 8h to start another ad.");
    } else if (res && res.reason) {
      setToast("Ad failed or cancelled.");
    }
  }

  function doRelease() {
    releaseUsdHold();
  }

  // Dev-only helper: treat +50 test as a Tier I ad so it also earns USD share.
  async function testReward() {
    if (gateBlocked) return;
    const res = await watchAd(1);
    if (res?.ok) {
      showAdToast("Test ad complete", res);
    }
  }

  const capLeft = Math.max(0, (w.usd_cap || 500) - (w.usd_ytd || 0));
  const releaseDisabled = (w.usd_review_hold || 0) <= 0 || capLeft <= 0;

  const rate = getCoinToUsdRate();
  const skim = getUsdSkimPct();
  const dripUsdPerMin = (snap.totalPerMin || 0) * rate * skim;
  const dripUsdPerDay = dripUsdPerMin * 60 * 24;

  const remMs = Number.isFinite(times.remainingMs)
    ? times.remainingMs
    : Math.max(0, Math.floor(times.remainingSec || 0) * 1000);

  // popovers
  const skimBtnRef = useRef(null);
  const capBtnRef = useRef(null);
  const [openSkim, setOpenSkim] = useState(false);
  const [openCap, setOpenCap] = useState(false);

  return (
    <div className="rounded-2xl p-4 sm:p-6 border shadow bg-amber-50/80 text-slate-800 border-amber-200/70 dark:bg-stone-900/70 dark:text-stone-100 dark:border-stone-700">
      <ScreenHeader title="Payouts" onOpenAbout={() => setOpenSkim(true)} />

      {/* Boost + tiers */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BoostBadge />
        <TierBtn
          onClick={() => runTier(1)}
          label="Tier I"
          cls="bg-amber-500"
          disabled={gateBlocked}
        />
        <TierBtn
          onClick={() => runTier(2)}
          label="Tier II"
          cls="bg-blue-600"
          disabled={gateBlocked}
        />
        <TierBtn
          onClick={() => runTier(3)}
          label="Tier III"
          cls="bg-violet-600"
          disabled={gateBlocked}
        />
        {isDev && (
          <button
            onClick={testReward}
            className="ml-0 sm:ml-2 px-3 py-1.5 rounded-md text-sm border border-amber-300/70 text-slate-700 hover:bg-amber-50 dark:text-amber-200 dark:border-stone-600 dark:hover:bg-stone-700"
            aria-label="Add test coins via ad"
          >
            +50 test 🪙
          </button>
        )}
      </div>

      {/* Inline toast for ad results */}
      {toast && (
        <div className="mb-3 text-sm p-2 rounded border border-amber-300/70 bg-amber-50 text-slate-800 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600">
          {toast}
        </div>
      )}

      {/* KYC banner */}
      {kyc?.showReminder && (
        <KycBanner
          initialEmail={kyc?.email || ""}
          severity={kyc?.severity || "nudge"}
          hasFunds={(w.usd_review_hold || 0) > 0 || (w.usd || 0) > 0}
          onSave={async (email) => {
            const r = await upsertPayoutEmail(email);
            return r?.ok
              ? { ok: true }
              : { ok: false, msg: r?.reason || "Save failed" };
          }}
          onDismiss={async () => {
            await dismissKycReminder(14);
            return { ok: true };
          }}
        />
      )}

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <StatRow
            label="Mate Coins"
            value={`${w.coins ?? 0} 🪙`}
            sub="In-game only; not redeemed for cash."
          />
        </Card>

        <Card>
          <div className="flex items-end justify-between">
            <StatRow
              label="City Passive rate"
              value={`${(snap.totalPerMin || 0).toFixed(1)} 🪙/min`}
              sub={`Boost x${snap.boostMult} · ${fmtMMSS(remMs)}`}
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-2">
            <StatRow
              label="Auto USD Drip"
              value={`${fmtUSDTiny(dripUsdPerMin)} / min`}
              sub={`≈ ${fmtUSDTiny(dripUsdPerDay)} / day`}
            />
            <div className="shrink-0">
              <IconButton
                ref={skimBtnRef}
                label="Skim details"
                className="border-amber-300/70 dark:border-stone-500"
                onClick={() => setOpenSkim(true)}
                aria-label="Open skim details"
              >
                ?
              </IconButton>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-end justify-between gap-2">
            <StatRow label="USD Balance" value={fmtUSD(w.usd)} />
            <button
              onClick={doRelease}
              disabled={releaseDisabled}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                releaseDisabled
                  ? "opacity-50 cursor-not-allowed border-stone-300 dark:border-stone-600"
                  : "border-amber-400 hover:bg-amber-50 dark:hover:bg-stone-700"
              }`}
              title="Move funds from Review to Balance (respects yearly cap)"
              aria-disabled={releaseDisabled}
            >
              Release to Balance
            </button>
          </div>
        </Card>

        <Card>
          <StatRow
            label="USD in Review"
            value={fmtUSD(w.usd_review_hold)}
            sub="From ad/offer revenue share and passive skim."
          />
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-2">
            <StatRow
              label="Year-to-Date (cap)"
              value={`${fmtUSD(w.usd_ytd)} / ${fmtUSD(w.usd_cap)}`}
              sub={
                capLeft <= 0
                  ? "Cap reached — accrual pauses until next cycle."
                  : ""
              }
            />
            <div className="shrink-0">
              <IconButton
                ref={capBtnRef}
                label="Cap details"
                className="border-amber-300/70 dark:border-stone-500"
                onClick={() => setOpenCap(true)}
                aria-label="Open cap details"
              >
                ?
              </IconButton>
            </div>
          </div>
        </Card>
      </div>

      {/* Lifetime stats */}
      <div className="mt-4">
        <Card>
          <div className="grid sm:grid-cols-3 md:grid-cols-6 gap-4">
            <StatRow
              label="Ads Watched"
              value={(stats.adsWatched || 0).toLocaleString()}
            />
            <StatRow
              label="Coins Earned (lifetime)"
              value={(stats.coinsEarned || 0).toLocaleString()}
            />
            <StatRow
              label="USD Skim (YTD)"
              value={fmtUSD(stats.usdSkimYTD || 0)}
            />
            <StatRow
              label="USD Skim (lifetime)"
              value={fmtUSD(stats.usdSkimLifetime || 0)}
            />
            <StatRow
              label="Missions Completed"
              value={(stats.offersCompleted || 0).toLocaleString()}
            />
            <StatRow
              label="Mission Coins Earned"
              value={(stats.offerCoinsEarned || 0).toLocaleString()}
            />
          </div>
        </Card>
      </div>

      {/* Copy + status */}
      <p className="text-sm opacity-70 mt-4">
        Watching ads and completing missions can pay you real USD. When an ad
        or offer pays us, we share a fixed slice of that cash (roughly 10–20% of
        what we receive) into your <b>USD in Review</b>. Separately, your Mate
        earnings have an internal USD comparison rate and a small skim% that
        slowly drips more USD into Review over time. Mate Coins themselves
        always stay in-game and are never redeemed directly for cash. Releasing
        moves USD from Review to Balance, subject to your yearly cap. The
        comparison rate shown here is for internal balancing only and is not a
        public exchange rate.
      </p>

      <div className="mt-4 text-xs opacity-70">
        Boost status:{" "}
        {isBoostActive()
          ? `x${times.mult} for ${fmtMMSS(remMs)}`
          : "idle — no boost"}
      </div>
      {gateBlocked && (
        <div className="mt-2 text-xs opacity-80">
          Stack full. Wait until below 8h to start another ad.
        </div>
      )}

      {/* Activity */}
      <div className="mt-4">
        <Card>
          <div className="text-sm font-semibold mb-2 opacity-80">
            Recent activity
          </div>
          {!w.history || w.history.length === 0 ? (
            <div className="text-sm opacity-60">No activity yet.</div>
          ) : (
            <ul className="text-sm space-y-1 max-h-40 overflow-auto">
              {[...w.history]
                .slice(-12)
                .reverse()
                .map((h, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="opacity-80">{labelFor(h)}</span>
                    <span className="tabular-nums opacity-80">
                      {amountFor(h)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Popovers */}
      <Popover
        anchorRef={skimBtnRef}
        open={openSkim}
        onClose={() => setOpenSkim(false)}
      >
        <div className="space-y-1.5">
          <div className="font-medium">Auto USD Drip</div>
          <div className="text-xs opacity-80">Internal formula:</div>
          <div className="text-xs">
            <code>coins/min × internal USD rate × skim%</code>
          </div>
          <div className="text-xs">
            Current: {(snap.totalPerMin || 0).toFixed(1)} 🪙/min ×{" "}
            {rate.toFixed(5)} × {Math.round(skim * 100)}% =
            <b> {fmtUSDTiny(dripUsdPerMin)}</b> / min
          </div>
          <div className="text-xs opacity-80">
            This rate is an internal comparison used to calculate USD skim from
            your Mate earnings. On top of that, ad and offer revenue share is
            credited directly into USD Review based on what the ad actually
            paid.
          </div>
        </div>
      </Popover>

      <Popover
        anchorRef={capBtnRef}
        open={openCap}
        onClose={() => setOpenCap(false)}
      >
        <div className="space-y-1.5">
          <div className="font-medium">Year-to-Date Cap</div>
          <div className="text-xs">
            You can release USD from Review to Balance up to your yearly cap.
          </div>
          <div className="text-xs">
            Progress: <b>{fmtUSD(w.usd_ytd)} / {fmtUSD(w.usd_cap)}</b>
          </div>
          <div className="text-xs opacity-80">
            When the cap is reached, additional USD accrual pauses until the
            next cycle.
          </div>
        </div>
      </Popover>
    </div>
  );
}

/* ---------- small components ---------- */
function BoostBadge() {
  const t = getBoostTimes();
  const active = isBoostActive();
  const remMs = Number.isFinite(t.remainingMs)
    ? t.remainingMs
    : Math.max(0, (t.remainingSec || 0) * 1000);
  const txt = active
    ? `Boost x${t.mult} · ${fmtMMSS(remMs)}`
    : "Idle — no boost";
  return (
    <div
      className="px-3 py-1 rounded-lg text-xs border border-amber-300/70 bg-amber-50 text-amber-800
                 dark:bg-stone-700 dark:text-amber-200 dark:border-stone-600"
      aria-live="polite"
    >
      {txt}
    </div>
  );
}

function TierBtn({ onClick, label, cls, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 rounded-md text-white text-xs ${cls} hover:brightness-110 ${
        disabled ? "opacity-60 cursor-not-allowed" : ""
      }`}
      aria-label={label}
      aria-disabled={disabled}
    >
      {label}
    </button>
  );
}

/* ---------- KYC banner ---------- */
function KycBanner({
  initialEmail = "",
  severity = "nudge",
  hasFunds = false,
  onSave,
  onDismiss,
}) {
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (!email || !email.includes("@")) {
      setMsg("Enter a valid email.");
      return;
    }
    setSaving(true);
    const r = await onSave(email);
    setSaving(false);
    setMsg(r.ok ? "Saved." : r.msg || "Failed.");
  }

  async function snooze() {
    try {
      await onDismiss?.();
      setMsg("Okay. I’ll remind you later.");
    } catch {
      setMsg("Could not dismiss.");
    }
  }

  const tone =
    severity === "strong"
      ? "Add a payout email to keep your earnings flowing."
      : "Add a payout email to enable releases";

  return (
    <div className="rounded-xl p-3 mb-4 border border-amber-300/70 bg-amber-100 text-amber-900 dark:bg-stone-700 dark:text-amber-200 dark:border-stone-600">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-sm">
          {tone}
          {hasFunds ? " of your current balance." : "."}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="px-3 py-1.5 rounded-lg text-sm border border-amber-300/70 bg-white text-slate-900 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-500 outline-none"
            aria-label="Payout email"
          />
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={snooze}
            className="px-3 py-1.5 rounded-lg text-sm border border-amber-300/70 bg-amber-50 hover:bg-amber-100 dark:bg-stone-800 dark:hover:bg-stone-700"
          >
            Remind me later
          </button>
        </div>
      </div>
      {msg && (
        <div className="mt-1 text-xs opacity-80" role="status">
          {msg}
        </div>
      )}
    </div>
  );
}

/* ---------- history helpers ---------- */
function labelFor(h) {
  const when = new Date(h.t || Date.now()).toLocaleString();
  const k = h.k || "";

  switch (k) {
    case "coins_add":
      return `Coins added • ${when}`;
    case "coins_spend":
      return `Coins spent • ${when}`;
    case "micro_add":
      return `Balance added • ${when}`;
    case "passive_tick_micro":
      return `Passive income • ${when}`;
    case "offline_catchup":
      return `Offline catch-up • ${h.minutes ?? 0} min • ${when}`;
    case "review_release":
      return `Released to Balance • ${when}`;
    case "review_blocked_cap":
      return `Release blocked (cap) • ${when}`;
    case "rollover":
      return `Year rollover • ${h.y || ""}`;
    case "year_reset":
      return `Admin reset YTD • ${when}`;
    case "skim_auto_tick":
    case "skim_auto_offline":
      return `Passive USD skim • ${when}`;
    case "ad_usd_share":
      return `Ad USD share • ${when}`;
    case "offer_usd_share":
      return `Mission USD share • ${when}`;
    case "review_add":
      return `USD added to Review • ${when}`;
    case "ad_tier1":
      return `Tier I ad complete • ${when}`;
    case "ad_tier2":
      return `Tier II ad complete • ${when}`;
    case "ad_tier3":
      return `Tier III ad complete • ${when}`;
    case "ad_test":
      return `Test ad complete • ${when}`;
    default:
      return `${k || "event"} • ${when}`;
  }
}

function amountFor(h) {
  if (h.amt == null) return "";
  const k = h.k || "";

  // Tiered ads & test: show coins + USD share together
  if (
    k === "ad_tier1" ||
    k === "ad_tier2" ||
    k === "ad_tier3" ||
    k === "ad_test"
  ) {
    const coins = Number(h.coins || 0);
    const usd = Number(h.amt || 0);

    const bits = [];
    if (coins) bits.push(`${coins.toLocaleString()} 🪙`);
    if (usd) bits.push(fmtUSD(usd));
    return bits.join(" · ");
  }

  // USD-style entries: any review-related or usd-share/skim keys
  if (
    k === "review_add" ||
    k === "review_release" ||
    k === "review_blocked_cap" ||
    k === "ad_usd_share" ||
    k === "offer_usd_share" ||
    k.startsWith("skim_")
  ) {
    return fmtUSD(h.amt);
  }

  // micro-based coin entries (passive + direct micro deposits + builder unlocks)
  if (
    k === "micro_add" ||
    k.includes("_micro") ||
    k === "offline_catchup" ||
    k === "store_buy" ||
    k === "builder_unlock"
  ) {
    return `${toMate(h.amt)} 🪙`;
  }

  // plain coin entries
  if (k.startsWith("coins_")) return `${h.amt} 🪙`;

  return h.amt;
}
