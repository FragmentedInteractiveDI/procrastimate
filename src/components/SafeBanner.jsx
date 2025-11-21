// FILE: src/components/SafeBanner.jsx
import { useEffect, useRef, useState } from "react";
import { bannersEnabled } from "../modules/entitlements";

/**
 * SafeBanner
 * - Only renders when ads are allowed (no Ad-Lite/Ad-Free).
 * - Per-placement frequency cap using localStorage.
 * - Viewability gate (IntersectionObserver) so it only "impresses" when on screen.
 * - Lightweight skeleton + optional dismiss (session-only).
 */
const LS = {
  get: (k, f) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const SS = {
  get: (k, f) => {
    try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; }
  },
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const CAP_KEY = "pm_banner_caps_v1";           // { [placement]: lastImpressionMs }
const DISMISS_KEY = "pm_banner_dismiss_v1";    // { [placement]: true }

/**
 * @param {{
 *  placement?: string,            // logical name: "shop-top", "settings", etc.
 *  minHeight?: number,            // px; keeps layout stable
 *  capMinutes?: number,           // frequency cap per placement
 *  dismissible?: boolean,         // allow user to close (session only)
 *  testText?: string              // override creative text while integrating
 * }} props
 */
export default function SafeBanner({
  placement = "default",
  minHeight = 56,
  capMinutes = 8,
  dismissible = true,
  testText = "Your banner creative or network slot goes here.",
}) {
  const [adsOn, setAdsOn] = useState(() => bannersEnabled());
  const [dismissed, setDismissed] = useState(() => !!SS.get(DISMISS_KEY, {})[placement]);
  const [passedCap, setPassedCap] = useState(() => isPastCap(placement, capMinutes));
  const [viewable, setViewable] = useState(false);       // on screen
  const [filled, setFilled] = useState(false);           // pretend network filled
  const rootRef = useRef(null);
  const impressedRef = useRef(false);

  // React to entitlement changes (e.g., user buys Ad-Lite)
  useEffect(() => {
    const fn = () => setAdsOn(bannersEnabled());
    window.addEventListener("pm_entitlements_changed", fn);
    return () => window.removeEventListener("pm_entitlements_changed", fn);
  }, []);

  // Observe viewability
  useEffect(() => {
    if (!rootRef.current) return;
    const el = rootRef.current;
    const obs = new IntersectionObserver(
      (entries) => setViewable(entries.some((e) => e.isIntersecting)),
      { root: null, threshold: 0.35 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // First time on-screen → record impression + simulate fill
  useEffect(() => {
    if (!adsOn || dismissed || !passedCap || impressedRef.current) return;
    if (!viewable) return;

    impressedRef.current = true;
    recordImpression(placement);
    // simulate async network render; replace with your ad network call
    const t = setTimeout(() => setFilled(true), 300);
    return () => clearTimeout(t);
  }, [adsOn, dismissed, passedCap, viewable, placement]);

  // If user purchases Ad-Lite/Free after this mounted, hide immediately
  if (!adsOn) return null;

  // Frequency cap or user closed
  if (!passedCap || dismissed) return null;

  return (
    <div
      ref={rootRef}
      role="banner"
      data-placement={placement}
      aria-label={`Ad banner ${placement}`}
      className="w-full rounded-md border border-stone-300/60 dark:border-stone-700/60 bg-stone-100 dark:bg-stone-800 overflow-hidden"
      style={{ minHeight }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2 text-[12px] leading-none">
        <div className="opacity-70 text-stone-700 dark:text-stone-300">
          Sponsored • {placement}
        </div>
        {dismissible && (
          <button
            onClick={() => {
              const map = SS.get(DISMISS_KEY, {});
              map[placement] = true;
              SS.set(DISMISS_KEY, map);
              setDismissed(true);
            }}
            className="px-2 py-1 rounded border text-[11px] bg-white/50 dark:bg-stone-900/30 border-stone-300/60 dark:border-stone-700/60 text-stone-600 dark:text-stone-300 hover:bg-white/70 dark:hover:bg-stone-900/50"
            aria-label="Hide advertisement"
            title="Hide this ad"
          >
            ×
          </button>
        )}
      </div>

      {/* Body: skeleton until filled */}
      {filled ? (
        <Creative testText={testText} />
      ) : (
        <Skeleton />
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function isPastCap(placement, capMinutes) {
  const caps = LS.get(CAP_KEY, {});
  const last = Number(caps[placement] || 0);
  if (!last) return true;
  const ms = capMinutes * 60 * 1000;
  return Date.now() - last >= ms;
}
function recordImpression(placement) {
  const caps = LS.get(CAP_KEY, {});
  caps[placement] = Date.now();
  LS.set(CAP_KEY, caps);
}

/* ---------------- visuals ---------------- */

function Skeleton() {
  return (
    <div className="px-3 pb-3">
      <div className="h-5 rounded mb-2 animate-pulse bg-stone-300/70 dark:bg-stone-700/60" />
      <div className="h-5 rounded animate-pulse bg-stone-300/70 dark:bg-stone-700/60" />
    </div>
  );
}

function Creative({ testText }) {
  return (
    <div className="px-3 pb-3 text-xs text-stone-700 dark:text-stone-200">
      <div className="font-medium mb-1">Sponsored</div>
      <div className="opacity-80">{testText}</div>
      {/* Replace block below with your network tag (e.g., AdSense/Unity/ironSource) */}
      <div className="mt-2 rounded border border-dashed border-stone-300 dark:border-stone-600 p-2 text-[11px] opacity-70">
        [banner slot]
      </div>
    </div>
  );
}
