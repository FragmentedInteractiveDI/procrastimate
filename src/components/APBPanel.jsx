// FILE: src/components/APBPanel.jsx
import React, { useEffect, useState } from "react";
import { getApbStatus, skipApbCooldownWithAd, markApbRunStarted } from "../modules/cityEconomy";
import { fmtMMSS } from "../modules/boost";

export default function APBPanel() {
  const [s, setS] = useState(() => getApbStatus());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = () => setS(getApbStatus());
    const id = setInterval(update, 1000);
    window.addEventListener("apb:status", update);
    return () => { clearInterval(id); window.removeEventListener("apb:status", update); };
  }, []);

  async function handleSkip() {
    if (busy || s.canRun) return;
    setBusy(true);
    const r = await skipApbCooldownWithAd();
    setBusy(false);
    setS(getApbStatus());
    alert(r.msg);
  }

  function handleRun() {
    if (!s.canRun) return;
    markApbRunStarted();      // starts cooldown
    setS(getApbStatus());
    // You can dispatch an event the CityScene listens to for starting the APB run
    try { window.dispatchEvent(new Event("apb:run")); } catch {}
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm opacity-80">
        {s.canRun
          ? `APB ready • ${s.isSub ? "3:00" : "1:00"}`
          : `APB cooldown • ${fmtMMSS(s.cooldownSec * 1000)}`}
      </span>

      <button
        onClick={handleRun}
        disabled={!s.canRun}
        className="px-3 py-1 rounded-md border text-sm
                   border-stone-300 dark:border-stone-600
                   hover:bg-stone-100 dark:hover:bg-stone-700
                   disabled:opacity-50"
      >
        Run APB
      </button>

      <button
        onClick={handleSkip}
        disabled={s.canRun || busy}
        className="px-3 py-1 rounded-md border text-sm
                   border-stone-300 dark:border-stone-600
                   hover:bg-stone-100 dark:hover:bg-stone-700
                   disabled:opacity-50"
        title="Watch an ad to skip cooldown"
      >
        {busy ? "…" : "Skip with Ad"}
      </button>
    </div>
  );
}
