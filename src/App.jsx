// FILE: src/App.jsx
import "./setup/optionals.js"; // tolerant shims for membership/ads/gear

import React, { useEffect, useState, useRef } from "react";
import Games from "./screens/Games.jsx";
import Home from "./screens/Home.jsx";
// import Store from "./screens/Store.jsx";   // REMOVED: merged into Shop
import Shop from "./screens/Shop.jsx";        // Real-money + Mate spend (merged)
import Payouts from "./screens/Payouts.jsx";
import Settings from "./screens/Settings.jsx";
import Customize from "./screens/Customize.jsx";
import City from "./screens/City.jsx";
import CityBuilder from "./screens/CityBuilder.jsx";
import FragMissions from "./screens/FragMissions.jsx";
import Parkour from "./screens/Parkour.jsx";

import BoostHUD from "./components/BoostHUD.jsx";
import MateBanner from "./components/MateBanner.jsx";
import PWAControls from "./components/PWAControls.jsx";
import SWDebugLogger from "./components/SWDebugLogger.jsx";
import BetaBadge from "./components/BetaBadge.jsx";
import ApbControls from "./components/ApbControls.jsx"; // compact APB UI in header

import { tickCityEconomy } from "./modules/cityEconomy";
import {
  calculateOfflineEarnings,
  claimOfflineEarnings,
  saveOfflineTimestamp,
} from "./modules/offlineEarnings";
import { startAutoSync, noteMutation } from "./modules/sync";
import { isBetaMode } from "./modules/config.js";
import { getWallet } from "./modules/wallet";
import { getBoostTimes, isBoostActive, fmtMMSS } from "./modules/boost";

const ls = {
  get: (k, f) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; }
    catch { return f; }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function useLocalState(key, initial) {
  const [val, setVal] = useState(() => ls.get(key, initial));
  useEffect(() => ls.set(key, val), [key, val]);
  return [val, setVal];
}

function useInterval(fn, ms) {
  useEffect(() => { const id = setInterval(fn, ms); return () => clearInterval(id); }, [fn, ms]);
}

const DEFAULT_STATE = {
  coins: 0,
  premium: false,
  owned: {},
  equipped: { hat: null, skin: null },
  ownedCosmetics: { hats: [], skins: [] },
};

export default function App() {
  const [dark, setDark] = useLocalState("pm_dark", true);
  const [state, setState] = useLocalState("pm_state_v4", DEFAULT_STATE);
  const [tab, setTab] = useLocalState("pm_tab", "Payouts");
  const beta = isBetaMode();

  // header badges: wallet coins and boost
  const [walletCoins, setWalletCoins] = useState(() => getWallet().coins || 0);
  const [boostText, setBoostText] = useState(() => {
    const t = getBoostTimes();
    return isBoostActive()
      ? `Boost x${t.mult} · ${fmtMMSS(t.remainingMs ?? (t.remainingSec || 0) * 1000)}`
      : "No boost";
  });
  useInterval(() => {
    setWalletCoins(getWallet().coins || 0);
    const t = getBoostTimes();
    setBoostText(
      isBoostActive()
        ? `Boost x${t.mult} · ${fmtMMSS(t.remainingMs ?? (t.remainingSec || 0) * 1000)}`
        : "No boost"
    );
  }, 1000);

  // one-time redirects and hooks
  useEffect(() => { if (tab === "Play") setTab("Payouts"); }, []); // legacy
  useEffect(() => { startAutoSync({ intervalMs: 2 * 60 * 1000 }); }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", !!dark); }, [dark]);

  useEffect(() => {
    const amt = calculateOfflineEarnings();
    if (amt > 0) claimOfflineEarnings();
  }, []);

  useEffect(() => {
    const handler = () => saveOfflineTimestamp();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function resetAll() {
    if (!confirm("Reset all local data? This cannot be undone.")) return;
    [
      "pm_state_v4","pm_dark","pm_tab",
      "pm_boost_v1","pm_boost_v2",
      "pm_wallet_v1","pm_wallet_v2",
      "pm_store_v2","pm_home_v1",
      "pm_stats_v1","pm_stats_v2",
      "pm_history_v1","pm_payouts_v1",
      "ads.events","ads.reqs","ads.cooldownUntil","ads.suspiciousScore",
      "pm_city_income_v1","pm_city_income_carry_v1","pm_city_income_carry_micro_v1","pm_city_last_tick_v1",
      "pm_city_income_carry_v2","pm_city_last_tick_v2",
      "pm_offline_v1",
      "pm_inventory_v1","pm_profile_v1","pm_app_config_v1",
      "pm_offers_catalog_v1","pm_offers_state_v1",
      "pm_city_zoom_v1","pm_city_reveal_v1",
      "pm_city_reveal_v2","pm_mm_scale_v2","pm_mm_pos_v2"
    ].forEach((k) => { try { localStorage.removeItem(k); } catch {} });
    location.reload();
  }

  // Tabs (Store removed)
  const MAIN_TABS = ["Payouts", "Shop", "Customize", "Settings"];
  const GAME_ROUTES = ["City", "Build", "Parkour", "Home", "Missions"]; // dropdown

  useEffect(() => {
    const id = setInterval(() => tickCityEconomy(), 5000);
    tickCityEconomy();
    return () => clearInterval(id);
  }, []);

  useEffect(() => { noteMutation("theme_change"); }, [dark]);
  useEffect(() => { noteMutation("tab_change"); }, [tab]);

  return (
    <div
      className="min-h-screen transition-colors"
      style={{ background: dark ? "#0b0b0b" : "#ffffff", color: dark ? "#fff" : "#111" }}
    >
      <HeaderBar
        dark={dark}
        beta={beta}
        walletCoins={walletCoins}
        boostText={boostText}
        tab={tab}
        setTab={setTab}
        mainTabs={MAIN_TABS}
        gameRoutes={GAME_ROUTES}
        onToggleTheme={() => setDark((d) => !d)}
      />

      <main className="max-w-5xl mx-auto p-6">
        {tab === "Missions" && <FragMissions dark={dark} />}

        {tab === "Payouts" && <Payouts />}
        {tab === "Shop" && <Shop />} {/* merged screen */}
        {tab === "Customize" && (
          <Customize
            dark={dark}
            equipped={state.equipped}
            onEquip={(equipped) => { setState((s) => ({ ...s, equipped })); noteMutation("equip_change"); }}
            owned={state.ownedCosmetics}
            onUnlock={(type, id) => {
              if (!state.ownedCosmetics[type]?.includes(id)) {
                setState((s) => ({
                  ...s,
                  coins: s.coins - 25,
                  ownedCosmetics: { ...s.ownedCosmetics, [type]: [...s.ownedCosmetics[type], id] },
                }));
                noteMutation("cosmetic_unlock");
              }
            }}
          />
        )}
        {tab === "Settings" && <Settings dark={dark} setDark={setDark} onResetAll={resetAll} />}

        {tab === "Games" && <Games dark={dark} setTab={setTab} onToast={(m) => console.log(m)} />}
        {tab === "City" && <City dark={dark} />}
        {tab === "Build" && <CityBuilder dark={dark} />}
        {tab === "Home" && <Home dark={dark} />}
        {tab === "Parkour" && <Parkour dark={dark} />}
      </main>

      <PWAControls />
      {import.meta.env.DEV && <SWDebugLogger />}

      <BoostHUD />
      {!["City", "Tower Defense"].includes(tab) && <MateBanner equipped={state.equipped} />}
    </div>
  );
}

/* ---------- Header ---------- */
function HeaderBar({ dark, beta, walletCoins, boostText, tab, setTab, mainTabs, gameRoutes, onToggleTheme }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) { if (!menuRef.current) return; if (!menuRef.current.contains(e.target)) setOpen(false); }
    function onEsc(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onEsc); };
  }, []);

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{ background: dark ? "#0b0b0b" : "#fff", borderColor: dark ? "#262626" : "#f1e7c7" }}
    >
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* left: brand + live badges */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold tracking-tight" style={{ color: dark ? "#facc15" : "#b45309" }}>
              ProcrastiMate
            </h1>
            <BetaBadge show={beta} />
          </div>
          <div className="flex items-center gap-2 pl-2">
            <Badge icon="🪙" label={formatCoins(walletCoins)} dark={dark} />
            <Badge icon="" label={boostText} dark={dark} />
            {/* compact APB controls beside Boost */}
            <div
              className="ml-1 px-2 py-0.5 rounded-full border"
              style={{ background: dark ? "#131313" : "#f8fafc", borderColor: dark ? "#303030" : "#e5e7eb" }}
            >
              <ApbControls compact />
            </div>
          </div>
        </div>

        {/* right: nav */}
        <div className="flex items-center gap-2">
          {/* Games dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="px-3 py-1.5 rounded-lg border"
              style={{ background: dark ? "#151515" : "#f3f4f6", borderColor: dark ? "#333" : "#e5e7eb", color: dark ? "#f9fafb" : "#111" }}
            >
              Games ▾
            </button>

            {open && (
              <div
                className="absolute left-0 top-full mt-2 w-44 rounded-xl border overflow-hidden shadow-lg"
                style={{ background: dark ? "#1a1a1d" : "#ffffff", borderColor: dark ? "#2e2e2e" : "#e5e7eb" }}
              >
                {gameRoutes.map((name) => (
                  <button
                    key={name}
                    onClick={() => { setTab(name); setOpen(false); }}
                    className="w-full text-left px-3 py-2 border-b last:border-b-0"
                    style={{
                      background: tab === name ? (dark ? "#27272a" : "#fde68a") : "transparent",
                      color: dark ? "#f9fafb" : "#111",
                      borderColor: dark ? "#262626" : "#f0f0f1",
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {mainTabs.map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className="px-3 py-1.5 rounded-lg border"
              style={{
                background: tab === name ? (dark ? "#1f2937" : "#fde68a") : (dark ? "#151515" : "#f3f4f6"),
                color: dark ? "#fff" : "#111",
                borderColor: dark ? "#333" : "#e5e7eb",
              }}
            >
              {name}
            </button>
          ))}

          <button
            onClick={onToggleTheme}
            className="px-2.5 py-1.5 rounded-lg border"
            aria-label="Toggle theme"
            title="Toggle theme"
            style={{ background: dark ? "#151515" : "#f3f4f6", borderColor: dark ? "#333" : "#e5e7eb", color: dark ? "#f9fafb" : "#111" }}
          >
            {dark ? "🌙" : "☀️"}
          </button>
        </div>
      </div>
    </header>
  );
}

/* tiny pill */
function Badge({ icon, label, dark }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs border tabular-nums"
      style={{ background: dark ? "#131313" : "#f8fafc", borderColor: dark ? "#303030" : "#e5e7eb", color: dark ? "#e5e7eb" : "#111827" }}
    >
      {icon ? <span className="mr-1">{icon}</span> : null}{label}
    </span>
  );
}

function formatCoins(n) {
  try { return Intl.NumberFormat("en-US").format(Math.max(0, Math.floor(n))); }
  catch { return String(n || 0); }
}
