// FILE: src/screens/City.jsx
import { useRef, useState, useEffect, useCallback } from "react";
import PhaserGame from "../game/PhaserGame";
import ApbControls from "../components/ApbControls.jsx";

import {
  getApbStatus,
  skipApbCooldownWithAd,
} from "../modules/cityEconomy";

/* ---------- tiny helpers ---------- */
function fmtMMSS_fromSec(sec = 0) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const ZOOM_MIN = 0.8; // match CityScene
const ZOOM_MAX = 5.0;

export default function City({ dark = true }) {
  const gameRef = useRef(null);
  const apiRef = useRef(null);
  const [follow, setFollow] = useState(true);

  // APB UI state
  const [apb, setApb] = useState(() => getApbStatus());
  const [busySkip, setBusySkip] = useState(false);
  const [toast, setToast] = useState("");

  // helpers that call into scene api if available
  const center = useCallback(() => apiRef.current?.center?.(), []);

  const toggleFollow = useCallback(() => {
    const next = !follow;
    setFollow(next);
    apiRef.current?.follow?.(next);
  }, [follow]);

  const setZoomRel = useCallback((dz) => {
    const cur = apiRef.current?.getZoom?.() ?? 1;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(cur + dz).toFixed(3)));
    apiRef.current?.setZoom?.(z);
  }, []);

  // react to city data changes while this screen is open
  useEffect(() => {
    const onChanged = () => apiRef.current?.refresh?.();
    window.addEventListener("pm_city_changed", onChanged);
    return () => window.removeEventListener("pm_city_changed", onChanged);
  }, []);

  // poll APB status each second so the countdown is live
  useEffect(() => {
    const tick = () => setApb(getApbStatus());
    const id = setInterval(tick, 1000);
    tick();
    const sync = () => tick();
    window.addEventListener("apb:status", sync);
    return () => {
      clearInterval(id);
      window.removeEventListener("apb:status", sync);
    };
  }, []);

  async function handleSkipCooldown() {
    if (busySkip || apb.canRun) return;
    setBusySkip(true);
    try {
      // Uses adGuard via cityEconomy; ad credits USD share into Review and clears cooldown.
      const r = await skipApbCooldownWithAd();
      setToast(r?.msg || "Cooldown skipped.");
      setApb(getApbStatus());
      apiRef.current?.onApbCooldownCleared?.();
    } catch {
      setToast("Failed to skip. Try again.");
    } finally {
      setBusySkip(false);
      setTimeout(() => setToast(""), 2500);
    }
  }

  // Prefer the scene API; only fall back to legacy hooks if needed.
  function tryStartApbOnScene() {
    const a = apiRef.current;
    if (a?.startApb) {
      a.startApb({ doMark: true }); // new CityScene contract
      return true;
    }
    if (a?.triggerApb) {
      a.triggerApb();
      return true;
    }
    if (a?.beginAPB) {
      a.beginAPB();
      return true;
    }

    // Fallback: synthesize a Space keypress to the canvas (should rarely be needed now)
    const canvas = document.querySelector("canvas");
    if (canvas) {
      const ev = new KeyboardEvent("keydown", {
        key: " ",
        code: "Space",
        keyCode: 32,
        which: 32,
        bubbles: true,
      });
      canvas.dispatchEvent(ev);
      return true;
    }
    return false;
  }

  function handleRunApb() {
    if (!apb.canRun) return;
    const ok = tryStartApbOnScene();
    if (!ok) return;
    setApb(getApbStatus());
    setToast("APB started");
    setTimeout(() => setToast(""), 2000);
  }

  // Expose a stable global bridge for other UI to control the scene.
  useEffect(() => {
    const bridge = {
      center: () => apiRef.current?.center?.(),
      follow: (on = true) => apiRef.current?.follow?.(!!on),
      getZoom: () => apiRef.current?.getZoom?.(),
      setZoom: (z) => apiRef.current?.setZoom?.(z),
      refresh: () => apiRef.current?.refresh?.(),
      startApb: (opts) => apiRef.current?.startApb?.(opts),
      triggerApb: () => tryStartApbOnScene(),
    };
    window.__cityApi = bridge;
    return () => {
      if (window.__cityApi === bridge) delete window.__cityApi;
    };
  }, []);

  // On-ready: capture game + API. If PhaserGame didn't supply api, pull it from the scene registry.
  const handleReady = useCallback((game, payload = {}) => {
    gameRef.current = game;
    apiRef.current = payload.api || null;

    // Fallback: grab from active CityScene registry
    if (!apiRef.current && game) {
      try {
        const scene = game.scene.getScene("CityScene");
        const regApi = scene?.registry?.get?.("cityApi");
        if (regApi) apiRef.current = regApi;
      } catch {
        // ignore
      }
    }

    // ensure camera follows once scene api is present
    setTimeout(() => apiRef.current?.follow?.(true), 50);
  }, []);

  return (
    <div className="max-w-[1280px] mx-auto p-4 sm:p-6">
      {/* Top controls row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          className="px-3 py-1 rounded-md border text-sm border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700"
          onClick={center}
        >
          Center
        </button>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded-md border text-sm border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700"
            onClick={toggleFollow}
          >
            {follow ? "Follow: on" : "Follow: off"}
          </button>
          <div className="hidden sm:flex items-center gap-1">
            <button
              className="px-2 py-1 rounded-md border text-xs border-stone-300 dark:border-stone-600"
              onClick={() => setZoomRel(-0.1)}
              title="Zoom out (Q / wheel)"
            >
              −
            </button>
            <button
              className="px-2 py-1 rounded-md border text-xs border-stone-300 dark:border-stone-600"
              onClick={() => setZoomRel(+0.1)}
              title="Zoom in (E / wheel)"
            >
              +
            </button>
          </div>
        </div>

        {/* APB controls – city-local version includes Run */}
        <div className="ml-auto flex items-center gap-2">
          <span
            className="px-2 py-1 rounded-md border text-xs tabular-nums"
            style={{
              background: dark ? "#151515" : "#f8fafc",
              borderColor: dark ? "#303030" : "#e5e7eb",
              color: dark ? "#e5e7eb" : "#111827",
            }}
            title="APB cooldown status"
          >
            {apb.canRun
              ? "APB ready"
              : `Cooldown ${fmtMMSS_fromSec(apb.cooldownSec || 0)}`}
          </span>

          <button
            onClick={handleRunApb}
            disabled={!apb.canRun}
            className={`px-3 py-1.5 rounded-md text-sm text-white transition-colors ${
              apb.canRun
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-stone-600 cursor-not-allowed"
            }`}
            aria-disabled={!apb.canRun}
          >
            Run APB
          </button>

          <button
            onClick={handleSkipCooldown}
            disabled={apb.canRun || busySkip}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              apb.canRun || busySkip
                ? "bg-stone-200 text-stone-700 border-stone-400 cursor-not-allowed dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700"
                : "bg-amber-200 hover:bg-amber-300 text-black border-amber-300"
            }`}
            title="Watch a rewarded ad (and earn a bit of USD) to skip the APB cooldown"
          >
            {busySkip ? "Loading…" : "Watch ad to skip"}
          </button>
        </div>
      </div>

      {/* Inline toast */}
      {toast && (
        <div
          className="mb-3 text-sm p-2 rounded border border-amber-300/70 bg-amber-50 text-slate-800 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600"
          aria-live="polite"
        >
          {toast}
        </div>
      )}

      {/* Game surface */}
      <div className="rounded-2xl overflow-hidden border border-stone-300 dark:border-stone-700 shadow-inner">
        <PhaserGame dark={dark} onReady={handleReady} />
      </div>

      {/* Footer: optional expanded APB controls (still city-local) */}
      <div className="mt-3">
        <ApbControls compact={false} onRun={handleRunApb} />
      </div>
    </div>
  );
}
