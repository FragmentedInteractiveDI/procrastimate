// src/screens/FragMissions.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { listOffers, canComplete, completeOffer } from "../modules/offers";
import { fmtUSD, getCoinToUsdRate } from "../modules/wallet";
import { trackOfferComplete } from "../modules/stats";

/* ----------------- tiny utils ----------------- */
const lsGet = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
function msToHMM(ms) {
  const m = Math.ceil(ms / 60000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm}m`;
  return `${h}h ${mm}m`;
}
const COLLAPSE_KEY = "pm_offers_collapsed_v1";

/* ----------------- popover (viewport-clamped) ----------------- */
function InfoPopover({ open, onClose, anchorRef, children }) {
  const popRef = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden", opacity: 0 });
  const [ready, setReady] = useState(false);

  // close on outside/esc
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!anchorRef?.current) return;
      if (!anchorRef.current.contains(e.target) && !popRef.current?.contains(e.target)) onClose?.();
    };
    const onEsc = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open, onClose, anchorRef]);

  // position + clamp to viewport
  useEffect(() => {
    if (!open || !anchorRef?.current) return;
    const btn = anchorRef.current.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    const preferAbove = btn.top > vpH / 2;
    const top = preferAbove ? btn.top - 10 : btn.bottom + 10;

    const maxW = 280;
    let left = Math.min(Math.max(btn.left + btn.width / 2 - maxW / 2, 8), vpW - maxW - 8);

    setStyle({
      position: "fixed",
      top: Math.min(Math.max(top, 8), vpH - 8),
      left,
      width: maxW,
      zIndex: 50,
      visibility: "visible",
      opacity: 1,
    });
    setReady(true);
  }, [open, anchorRef]);

  if (!open) return null;
  return (
    <div
      ref={popRef}
      role="dialog"
      aria-modal="true"
      data-ready={ready}
      className="rounded-lg border bg-white p-3 text-sm shadow-lg transition-opacity duration-100 ease-out dark:border-stone-600 dark:bg-stone-800 data-[ready=false]:opacity-0"
      style={style}
    >
      {children}
    </div>
  );
}

/* ----------------- row ----------------- */
function OfferRow({ o, rate, dark, onStart, onClaim }) {
  const usdEq = o.rewardCoins * rate;
  const cooling = o.availableInMs > 0;
  const capped = (o.dailyLeft ?? 0) <= 0;
  const disabled = cooling || capped;
  const disableTitle = cooling
    ? `Cooling down • available in ${msToHMM(o.availableInMs)}`
    : (capped ? "Daily limit reached" : "Mark complete and claim");

  const infoBtnRef = useRef(null);
  const [open, setOpen] = useState(false);

  const lineTitle = `${o.provider} • cooldown ${o.cooldownHours}h • Daily ${o.maxPerDay} • Left ${Math.max(0, o.dailyLeft ?? 0)}`;

  return (
    <div className="relative flex items-center justify-between gap-2 rounded-lg border px-3 py-2 dark:border-stone-600">
      <div className="min-w-0">
        <div className="truncate font-medium" title={o.title}>{o.title}</div>
        <div className="truncate text-xs opacity-70" title={lineTitle}>{lineTitle}</div>
      </div>

      <div className="flex items-center gap-2">
        {/* info chip */}
        <div className="relative">
          <button
            ref={infoBtnRef}
            aria-label="More info"
            aria-expanded={open}
            onClick={() => setOpen(v => !v)}
            title="Details"
            className={`grid place-items-center rounded-full text-xs ${dark ? "bg-stone-600 text-stone-100" : "bg-amber-100 text-amber-900"} hover:opacity-90`}
            style={{ minWidth: "1.75rem", minHeight: "1.75rem" }}
          >?</button>

          <InfoPopover open={open} onClose={() => setOpen(false)} anchorRef={infoBtnRef}>
            <div className="space-y-1.5">
              <div className="font-medium">{o.title}</div>
              <div className="text-xs opacity-70">{o.provider}</div>
              <div className="text-xs">Reward: <b>{o.rewardCoins} 🪙</b> (~{fmtUSD(usdEq)})</div>
              {o.usdShareUsd > 0 && <div className="text-xs">USD share: <b>{fmtUSD(o.usdShareUsd)}</b></div>}
              <div className="text-xs">Cooldown: {o.cooldownHours}h</div>
              <div className="text-xs">Daily cap: {o.maxPerDay} • left {Math.max(0, o.dailyLeft ?? 0)}</div>
              {o.completedTimes > 0 && <div className="text-xs">Completed: {o.completedTimes}×</div>}
              {cooling && <div className="text-xs">Next in: {msToHMM(o.availableInMs)}</div>}
            </div>
          </InfoPopover>
        </div>

        <button
          onClick={() => onStart(o)}
          className="rounded-md px-2.5 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700"
        >
          Start
        </button>
        <button
          onClick={() => onClaim(o)}
          disabled={disabled}
          title={disableTitle}
          className={`rounded-md px-2.5 py-1 text-xs ${disabled ? "cursor-not-allowed opacity-50 bg-stone-500 text-white" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
        >
          Claim
        </button>
      </div>
    </div>
  );
}

/* ----------------- section ----------------- */
function Section({ id, title, items, rate, dark, collapsedMap, setCollapsed, onStart, onClaim }) {
  const isCollapsed = !!collapsedMap[id];
  const hasAvail = items?.length > 0;

  function toggle() {
    const next = { ...collapsedMap, [id]: !isCollapsed };
    setCollapsed(next);
    lsSet(COLLAPSE_KEY, next);
  }
  function onKey(e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  }

  return (
    <div className="mb-6">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        onClick={toggle}
        onKeyDown={onKey}
        className="mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 font-semibold outline-none focus:ring-2 focus:ring-amber-400 dark:border-stone-600"
      >
        <span>{title}</span>
        <span className="text-xs opacity-70">{isCollapsed ? "Show" : "Hide"}</span>
      </div>

      {!isCollapsed && (
        hasAvail ? (
          <div className="grid gap-2">
            {items.map((o) => (
              <OfferRow key={o.id} o={o} rate={rate} dark={dark} onStart={onStart} onClaim={onClaim} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border px-3 py-2 text-sm opacity-70 dark:border-stone-600">
            Nothing available right now.
          </div>
        )
      )}
    </div>
  );
}

/* ----------------- main ----------------- */
export default function FragMissions({ dark = true }) {
  const [offers, setOffers] = useState(() => listOffers());
  const [collapsed, setCollapsed] = useState(() => lsGet(COLLAPSE_KEY, { Boosts: false, Apps: true, Games: true, Surveys: true }));
  const rate = getCoinToUsdRate();

  useEffect(() => {
    const id = setInterval(() => setOffers(listOffers()), 1000);
    return () => clearInterval(id);
  }, []);

  // bucketize
  const buckets = useMemo(() => {
    const init = { Boosts: [], Apps: [], Games: [], Surveys: [] };
    for (const o of offers) {
      const t = String(o.type || "").toLowerCase();
      const key =
        t === "survey" ? "Surveys" :
        t === "game"   ? "Games"   :
        t === "app"    ? "Apps"    :
        "Boosts";
      init[key].push(o);
    }
    return init;
  }, [offers]);

  // auto-open first non-empty section on first load
  useEffect(() => {
    const saved = lsGet(COLLAPSE_KEY, null);
    if (saved) return;
    const order = ["Boosts", "Apps", "Games", "Surveys"];
    const first = order.find(k => buckets[k]?.length);
    const next = { Boosts: true, Apps: true, Games: true, Surveys: true };
    if (first) next[first] = false;
    setCollapsed(next);
    lsSet(COLLAPSE_KEY, next);
  }, [buckets]);

  function start(o) {
    try { window.open(o.url, "_blank", "noopener,noreferrer"); } catch {}
  }
  function claim(o) {
    const gate = canComplete(o.id);
    if (!gate.ok) {
      if (gate.reason === "cooldown") return alert(`Available in ${msToHMM(gate.ms)}`);
      if (gate.reason === "daily_cap") return alert("Daily limit reached. Try again tomorrow.");
      return alert(gate.reason || "Unavailable.");
    }
    const r = completeOffer(o.id);
    if (!r.ok) return alert("Failed.");
    try { trackOfferComplete({ offerId: o.id, coins: o.rewardCoins }); } catch {}
    setOffers(listOffers());
  }

  return (
    <div className={`rounded-xl p-4 border shadow ${dark ? "bg-stone-800 text-stone-100 border-stone-600" : "bg-white text-slate-800 border-amber-200/70"}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Missions</h2>
        <AboutBtn dark={dark} />
      </div>

      <Section id="Boosts"  title="Boosts"  items={buckets.Boosts}  rate={rate} dark={dark} collapsedMap={collapsed} setCollapsed={setCollapsed} onStart={start} onClaim={claim} />
      <Section id="Apps"    title="Apps"    items={buckets.Apps}    rate={rate} dark={dark} collapsedMap={collapsed} setCollapsed={setCollapsed} onStart={start} onClaim={claim} />
      <Section id="Games"   title="Games"   items={buckets.Games}   rate={rate} dark={dark} collapsedMap={collapsed} setCollapsed={setCollapsed} onStart={start} onClaim={claim} />
      <Section id="Surveys" title="Surveys" items={buckets.Surveys} rate={rate} dark={dark} collapsedMap={collapsed} setCollapsed={setCollapsed} onStart={start} onClaim={claim} />

      <div className="mt-3 text-xs opacity-70">
        Prototype only. Real networks trigger completion callbacks. Local cooldowns and daily limits prevent spam.
      </div>
    </div>
  );
}

/* ----------------- About modal ----------------- */
function AboutBtn({ dark }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={`rounded-md px-2 py-1 text-xs border ${dark ? "border-stone-500 hover:bg-stone-700" : "border-amber-300 hover:bg-amber-50"}`}
        onClick={() => setOpen(true)}
      >
        About Missions
      </button>
      {open && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className={`w-full max-w-lg rounded-xl border p-4 ${dark ? "bg-stone-800 border-stone-600 text-stone-100" : "bg-white border-amber-200 text-slate-800"}`}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">About Missions</div>
              <button onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs border dark:border-stone-500">Close</button>
            </div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              <li>Sections are collapsible. Your choices are remembered.</li>
              <li>Tap “?” for details like cooldown, caps, and USD share.</li>
              <li>Coins may contribute to USD drip via skim. USD shares go to Review.</li>
              <li>Cooldowns and daily limits prevent spam.</li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
