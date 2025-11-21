// FILE: src/components/MateBanner.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  getWallet,
  fmtMate,
  fmtUSD,
  MICRO_PER_MATE,
  isDev,
  resetWallet,
} from "../modules/wallet";
import { useAvatar } from "../context/AvatarContext";

function useWallet(ms = 600) {
  const [w, setW] = useState(() => getWallet());
  useEffect(() => {
    let alive = true;
    const poll = () => {
      if (!alive) return;
      try {
        const next = getWallet();
        setW((prev) =>
          prev.micro !== next.micro ||
          prev.usd !== next.usd ||
          prev.usd_review_hold !== next.usd_review_hold ||
          prev.usd_ytd !== next.usd_ytd
            ? next
            : prev
        );
      } catch {}
    };
    const id = setInterval(poll, ms);
    const onStorage = (e) => {
      if (!e) return;
      if (String(e.key || "").includes("pm_wallet_v3")) poll();
    };
    window.addEventListener("storage", onStorage);
    poll();
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, [ms]);
  return w;
}

/** MateBanner: shows wallet + equipped cosmetics */
export default function MateBanner({ equipped: equippedProp }) {
  const w = useWallet(500);
  const { equipped: equippedCtx } = useAvatar?.() || { equipped: {} };
  const equipped = equippedProp ?? equippedCtx ?? {};

  const coins = useMemo(
    () => Math.floor((w.micro || 0) / MICRO_PER_MATE),
    [w.micro]
  );

  const hat = equipped?.hat ? String(equipped.hat).replaceAll("_", " ") : "—";
  const skin = equipped?.skin || "—";

  return (
    <div className="pointer-events-none select-none fixed left-4 bottom-4 z-40">
      <div
        className="
          pointer-events-auto rounded-xl px-3 py-2 text-sm shadow-sm border
          bg-white/90 text-slate-800 border-amber-200/70
          dark:bg-stone-900/90 dark:text-stone-100 dark:border-stone-700
        "
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Mate balance (game currency only) */}
          <div className="flex items-center gap-2">
            <span role="img" aria-label="mate">
              🪙
            </span>
            <span className="font-semibold">{fmtMate(coins)}</span>
            <span className="text-xs opacity-70">Mate</span>
          </div>
        </div>

        <div className="text-xs opacity-80 mt-1">
          Hat: <b>{hat}</b> · Skin: <b>{skin}</b>
        </div>

        {/* Real USD balance from offers / skims */}
        <div className="text-[11px] mt-1 opacity-80">
          USD from offers: <b>{fmtUSD(w.usd || 0)}</b>
          {w.usd_review_hold > 0 && (
            <span className="ml-1">
              (in review: {fmtUSD(w.usd_review_hold || 0)})
            </span>
          )}
        </div>

        {isDev && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => resetWallet()}
              className="
                text-[11px] px-2 py-1 rounded-md
                bg-stone-800/70 hover:bg-stone-800
                border border-stone-700
              "
            >
              reset wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
