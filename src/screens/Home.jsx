// FILE: src/screens/Home.jsx
import React, { useEffect, useState } from "react";
import {
  getHome,
  placeAt,
  clearAt,
  getCleanupState,
  markCleanupRunStarted,
  reduceCleanupCooldown,
} from "../modules/home";
import {
  getStore,
  listCatalog,
  buyItem,
  isOwned,
} from "../modules/store";
import { getWallet, fmtMate, depositMate } from "../modules/wallet";
import { watchAd } from "../modules/adGuard";
import PhaserGame from "../game/PhaserGame";

// Simple icon map so the home grid feels like a real room.
const HOME_ICONS = {
  home_floor_basic: "⬜",
  home_rug_cozy: "🧶",
  home_sofa_simple: "🛋️",
  home_chair_gamer: "💺",
  home_bed_single: "🛏️",
  home_tv_basic: "📺",
  home_desk_simple: "🧰",
  home_plant_small: "🪴",
  home_lamp_corner: "💡",
};

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function Home({ dark }) {
  const [home, setHome] = useState(getHome());
  const [store, setStore] = useState(getStore());
  const [wallet, setWallet] = useState(getWallet());
  const [cleanup, setCleanup] = useState(getCleanupState());
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState("home_floor_basic");
  const [adLoading, setAdLoading] = useState(false);
  const [showCleanupGame, setShowCleanupGame] = useState(false);

  // Pre-filter once per render: only "home" items
  const homeItems = listCatalog({ types: ["home"] });

  // If the current selected id doesn't exist (e.g., fresh install),
  // default to the first home item in the catalog.
  useEffect(() => {
    if (!homeItems.length) return;
    const exists = homeItems.some((it) => it.id === selected);
    if (!exists) {
      setSelected(homeItems[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeItems.length]);

  // Poll basic state once a second so the view stays in sync
  useEffect(() => {
    const t = setInterval(() => {
      setHome(getHome());
      setStore(getStore());
      setWallet(getWallet());
      setCleanup(getCleanupState());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function showMsg(text) {
    setMsg(text);
    // Soft auto-clear after a few seconds
    if (!text) return;
    setTimeout(() => {
      setMsg((prev) => (prev === text ? "" : prev));
    }, 4000);
  }

  function onCellClick(x, y) {
    if (!selected) {
      showMsg("Select a home item first.");
      return;
    }

    const item = homeItems.find((it) => it.id === selected);
    if (!item) {
      showMsg("That home item is not available.");
      return;
    }

    // If not owned yet, try to buy it once using Mate Coins.
    if (!isOwned(selected)) {
      const res = buyItem(selected, "coins");
      if (!res.ok) {
        showMsg(res.msg || "Not enough Mate Coins.");
        // refresh store/wallet after failed attempt as well
        setStore(getStore());
        setWallet(getWallet());
        return;
      }
      // refresh store/wallet after successful purchase
      setStore(getStore());
      setWallet(getWallet());
      showMsg(`Unlocked ${item.name} for your home!`);
    }

    const r = placeAt(x, y, selected);
    if (!r.ok) {
      showMsg(r.msg || "Could not place item.");
    } else {
      setHome(getHome());
      showMsg(`Placed ${item.name} at ${x + 1},${y + 1}.`);
    }
  }

  function onClear(x, y) {
    const r = clearAt(x, y);
    if (!r.ok) {
      showMsg(r.msg || "Could not clear.");
    } else {
      setHome(getHome());
      showMsg("Cleared tile.");
    }
  }

  function onStartCleanup() {
    markCleanupRunStarted();
    setCleanup(getCleanupState());
    setShowCleanupGame(true);
  }

  function handleCleanupComplete(payload) {
    setShowCleanupGame(false);
    
    // Award coins from the mini-game
    if (payload?.coins > 0) {
      depositMate(payload.coins, { k: "home_cleanup_earn", mode: "home_cleanup" });
      showMsg(`Cleanup complete! Earned ${payload.coins} Mate Coins!`);
    } else {
      showMsg("Cleanup complete!");
    }
    
    // Refresh state
    setHome(getHome());
    setWallet(getWallet());
    setCleanup(getCleanupState());
  }

  async function onWatchCooldownAd() {
    if (adLoading) return;
    setAdLoading(true);
    
    try {
      const result = await watchAd("home_cleanup");
      
      if (result.ok) {
        // Reduce cooldown by 10 minutes
        reduceCleanupCooldown(10 * 60 * 1000);
        setCleanup(getCleanupState());
        showMsg("Cooldown shortened by 10 minutes!");
      } else {
        // Handle different failure reasons
        if (result.reason === "cooldown") {
          showMsg("Please wait before watching another ad.");
        } else if (result.reason === "rate_limited") {
          showMsg("Too many ad requests. Please wait a moment.");
        } else if (result.reason === "busy") {
          showMsg("Ad already in progress.");
        } else {
          showMsg("Could not play ad. Please try again.");
        }
      }
    } catch (err) {
      showMsg("Error playing ad. Please try again.");
    } finally {
      setAdLoading(false);
    }
  }

  const coins = wallet?.coins ?? 0;

  // If cleanup game is active, show Phaser scene instead
  if (showCleanupGame) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-4">
          <button
            onClick={() => {
              setShowCleanupGame(false);
              showMsg("Cleanup cancelled.");
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            ← Back to Home
          </button>
        </div>
        <PhaserGame
          dark={dark}
          sceneKey="HomeCleanupScene"
          onHomeCleanupResult={handleCleanupComplete}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* header */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🏡 Home
          </h1>
          <p className="text-sm opacity-75 mt-1">
            Build out your ProcrastiMate&apos;s home with floors, furniture, and décor.
          </p>
        </div>
        <div className="px-3 py-2 rounded-lg border text-sm tabular-nums dark:border-neutral-700 dark:bg-neutral-800">
          <div className="opacity-70 text-xs uppercase tracking-wide">
            Mate Coins
          </div>
          <div className="font-semibold">
            {fmtMate(coins)} 🪙
          </div>
        </div>
      </header>

      {/* Home Cleanup Card */}
      <div className="mb-5 p-4 rounded-xl border dark:border-neutral-700 dark:bg-neutral-800 bg-white border-neutral-300">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
              🧹 Home Cleanup
            </h2>
            <p className="text-sm opacity-75">
              {cleanup.ready
                ? "Your home is ready for a cleanup run!"
                : `Next cleanup in ${formatTime(cleanup.remainingMs)}`}
            </p>
            {cleanup.totalRuns > 0 && (
              <p className="text-xs opacity-60 mt-1">
                Total cleanups: {cleanup.totalRuns}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {cleanup.ready ? (
              <button
                onClick={onStartCleanup}
                className="px-6 py-2.5 rounded-lg font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
              >
                Start Cleanup Run
              </button>
            ) : (
              <>
                <button
                  disabled
                  className="px-6 py-2.5 rounded-lg font-semibold text-white bg-neutral-400 dark:bg-neutral-600 cursor-not-allowed"
                >
                  In Cooldown
                </button>
                <button
                  onClick={onWatchCooldownAd}
                  disabled={adLoading}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-blue-700 dark:text-blue-400 border border-blue-500 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:bg-blue-100 dark:active:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adLoading ? "Loading..." : "Watch Ad to Shorten Cooldown"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* selector + hint */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-semibold mb-1 opacity-70">
            Select home item
          </label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-black dark:text-white text-sm"
          >
            {homeItems.map((item) => {
              const owned = isOwned(item.id);
              const price = Math.max(0, item.priceCoins || 0);
              return (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {price > 0 ? ` — ${price} 🪙` : " — free"}
                  {owned ? " (owned)" : ""}
                </option>
              );
            })}
          </select>
        </div>

        <div className="text-xs opacity-75 max-w-xs">
          Click an empty tile to place the selected item.
          Click a filled tile to clear it.
        </div>
      </div>

      {/* home grid */}
      <div className="flex justify-center">
        <Grid home={home} onCellClick={onCellClick} onClear={onClear} />
      </div>

      {/* feedback */}
      {msg && (
        <div
          className="mt-4 p-3 rounded-xl text-sm border"
          style={{
            background: dark ? "#1f2937" : "#fef3c7",
            color: dark ? "#e5e7eb" : "#92400e",
            borderColor: dark ? "#4b5563" : "#fcd34d",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}

function Grid({ home, onCellClick, onClear }) {
  const w = home?.w || 6;
  const h = home?.h || 6;
  const cells = home?.cells || [];

  // Ensure we have exactly w*h cells
  const normalizedCells = Array.from({ length: w * h }, (_, i) => cells[i] || null);

  return (
    <div
      style={{ 
        display: 'grid',
        gridTemplateColumns: `repeat(${w}, 48px)`,
        gridTemplateRows: `repeat(${h}, 48px)`,
        gap: '6px',
        padding: '12px',
        borderRadius: '12px',
        backgroundColor: 'var(--bg-neutral-50)',
        border: '1px solid var(--border-neutral-700)',
      }}
      className="dark:bg-neutral-900 dark:border-neutral-700 bg-neutral-50 border-neutral-300"
    >
      {normalizedCells.map((id, i) => {
        const x = i % w;
        const y = Math.floor(i / w);
        const isFilled = !!id;
        const icon = HOME_ICONS[id] || (isFilled ? "■" : "");
        const label =
          typeof id === "string"
            ? id.replace(/^home_/, "").replace(/_/g, " ")
            : "";

        return (
          <button
            key={i}
            type="button"
            onClick={() => (isFilled ? onClear(x, y) : onCellClick(x, y))}
            title={isFilled ? label : `${x + 1},${y + 1}`}
            className={[
              "rounded-lg text-center text-sm cursor-pointer select-none",
              "flex items-center justify-center",
              "transition-colors duration-100",
              isFilled
                ? "bg-emerald-100 border border-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-500"
                : "bg-white border border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700",
            ].join(" ")}
            style={{
              width: '48px',
              height: '48px',
            }}
          >
            <span className="text-lg">{icon}</span>
          </button>
        );
      })}
    </div>
  );
}