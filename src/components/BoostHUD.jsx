// src/components/BoostHUD.jsx
import React, { useEffect, useState } from "react";
import { getBoostTimes, isBoostActive, fmtMMSS } from "../modules/boost";

function useTicker(ms = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function BoostHUD() {
  useTicker(1000);
  const t = getBoostTimes();
  const active = isBoostActive();

  const remMs = Number.isFinite(t.remainingMs)
    ? t.remainingMs
    : Math.max(0, (t.remainingSec || 0) * 1000);

  const text = active ? `Boost x${t.mult} — ${fmtMMSS(remMs)}` : "Idle — no boost";

  return (
    <div
      className="
        pointer-events-none select-none
        fixed right-4 bottom-4 z-50
      "
    >
      <div
        className="
          px-3 py-2 rounded-lg text-sm tabular-nums shadow-sm
          border border-amber-200/70 bg-white/90 text-slate-800
          dark:bg-stone-900/90 dark:text-stone-100 dark:border-stone-700
        "
      >
        {text}
      </div>
    </div>
  );
}
