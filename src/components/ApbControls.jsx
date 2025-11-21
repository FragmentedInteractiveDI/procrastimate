// FILE: src/components/ApbControls.jsx
import React, { useEffect, useState, useRef } from "react";
import { getApbStatus, skipApbCooldownWithAd } from "../modules/cityEconomy";

// mm:ss from seconds
function fmtMMSS_fromSec(sec = 0) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Header-friendly APB controls.
 * - compact={true}: show status + Skip only (no Run button; safe for global header)
 * - compact={false|omitted}: show status + Run + Skip (used in-page, e.g., City footer)
 *
 * Props:
 *  - onRun?: () => void                 // caller actually starts APB (City hooks into this)
 *  - onSkipped?: (msg?: string) => void // optional toast / message hook on skip
 */
export default function ApbControls({ compact = false, onRun, onSkipped }) {
  const [apb, setApb] = useState(() => getApbStatus());
  const [busySkip, setBusySkip] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const tick = () => {
      if (!mounted.current) return;
      setApb(getApbStatus());
    };

    const id = setInterval(tick, 1000);
    tick();

    const sync = () => tick();
    window.addEventListener("apb:status", sync);

    return () => {
      mounted.current = false;
      clearInterval(id);
      window.removeEventListener("apb:status", sync);
    };
  }, []);

  async function handleSkip() {
    if (apb.canRun || busySkip) return;
    setBusySkip(true);
    try {
      // Uses adGuard via cityEconomy; ad credits a small USD share + clears cooldown.
      const r = await skipApbCooldownWithAd();
      const msg = r?.msg || "Cooldown skipped.";

      // notify parent (Play toast in City.jsx, etc.)
      if (typeof onSkipped === "function") onSkipped(msg);

      // let any listeners (CityScene, City.jsx, other APB widgets) know to resync
      try {
        window.dispatchEvent(new Event("apb:status"));
      } catch {
        // ignore
      }

      if (mounted.current) {
        setApb(getApbStatus());
      }
    } catch {
      if (typeof onSkipped === "function") {
        onSkipped("Failed to skip APB cooldown.");
      }
    } finally {
      if (mounted.current) setBusySkip(false);
    }
  }

  const statusLabel = apb.canRun
    ? "APB: Ready"
    : `APB CD: ${fmtMMSS_fromSec(apb.cooldownSec || 0)}`;

  return (
    <div className="flex items-center gap-2">
      <span
        className="px-2 py-0.5 rounded-full text-xs border tabular-nums"
        style={{
          background: "var(--apb-bg, transparent)",
          borderColor: "var(--apb-border, currentColor)",
        }}
        title="APB cooldown status"
        aria-live="polite"
      >
        {statusLabel}
      </span>

      {/* Run button NEVER renders in compact mode (safe for header) */}
      {!compact && (
        <button
          type="button"
          onClick={apb.canRun ? onRun : undefined}
          disabled={!apb.canRun}
          className={`px-2.5 py-0.5 rounded text-xs text-white transition-colors ${
            apb.canRun
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-stone-600 cursor-not-allowed"
          }`}
          aria-disabled={!apb.canRun}
          title={apb.canRun ? "Start APB" : "APB is on cooldown"}
        >
          Run
        </button>
      )}

      <button
        type="button"
        onClick={handleSkip}
        disabled={apb.canRun || busySkip}
        className={`px-2.5 py-0.5 rounded text-xs border transition-colors ${
          apb.canRun || busySkip
            ? "bg-stone-200 text-stone-700 border-stone-400 cursor-not-allowed dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700"
            : "bg-amber-200 hover:bg-amber-300 text-black border-amber-300"
        }`}
        title="Watch a rewarded ad (and earn a bit of USD) to skip the APB cooldown"
        aria-disabled={apb.canRun || busySkip}
      >
        {busySkip ? "…" : "Skip"}
      </button>
    </div>
  );
}
