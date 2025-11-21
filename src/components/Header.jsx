// FILE: src/components/Header.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getWallet } from "../modules/wallet";
import ApbControls from "./ApbControls.jsx";

export default function Header({ dark = true, setDark = () => {}, tab, setTab }) {
  const [coins, setCoins] = useState(getWallet().coins || 0);
  const [openGames, setOpenGames] = useState(false);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0, width: 0 });
  const btnRef = useRef(null);

  // live coin counter
  useEffect(() => {
    const id = setInterval(() => setCoins(getWallet().coins || 0), 800);
    return () => clearInterval(id);
  }, []);

  // position dropdown under trigger (viewport-fixed)
  const placeMenu = () => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    setMenuPos({
      left: Math.max(8, Math.round(r.left)),
      top: Math.round(r.bottom + 6),
      width: Math.max(140, Math.round(r.width)),
    });
  };

  useLayoutEffect(() => {
    if (!openGames) return;
    placeMenu();
    const onResize = () => placeMenu();
    const onScroll = () => placeMenu();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [openGames]);

  // close on outside click / Esc
  useEffect(() => {
    const onDoc = (e) => {
      if (!openGames) return;
      if (btnRef.current?.contains(e.target)) return;
      const panel = document.getElementById("pm-games-panel");
      if (panel?.contains(e.target)) return;
      setOpenGames(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenGames(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openGames]);

  const Pill = ({ children }) => (
    <span
      className={`px-2 py-0.5 rounded-lg text-xs border tabular-nums ${
        dark
          ? "bg-stone-900/80 text-stone-100 border-stone-700"
          : "bg-white/70 text-slate-900 border-amber-200"
      }`}
    >
      {children}
    </span>
  );

  const NavBtn = ({ name, onClick, active }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm border whitespace-nowrap ${
        active
          ? dark
            ? "bg-neutral-800 text-white border-neutral-700"
            : "bg-amber-200 text-black border-amber-300"
          : dark
          ? "bg-neutral-900 text-white border-neutral-800 hover:bg-neutral-800"
          : "bg-stone-100 text-black border-stone-300 hover:bg-stone-200"
      }`}
    >
      {name}
    </button>
  );

  const coinPillHiddenAtXS = false;

  return (
    <header
      className={`px-3 sm:px-6 py-3 border-b ${
        dark ? "border-stone-800" : "border-amber-200/70"
      }`}
      style={{ position: "relative", zIndex: 10 }}
    >
      <div
        className="mx-auto max-w-[1200px] flex items-center gap-2 sm:gap-3 flex-nowrap overflow-x-auto whitespace-nowrap"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Brand + coins */}
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <h1
            className={`font-extrabold ${
              dark ? "text-amber-400" : "text-amber-700"
            }`}
            style={{ fontSize: "clamp(16px, 2.4vw, 22px)" }}
          >
            ProcrastiMate
          </h1>
          {!coinPillHiddenAtXS && (
            <Pill>🪙 {Number(coins || 0).toLocaleString()}</Pill>
          )}
        </div>

        {/* Rail (scrolls horizontally; never wraps) */}
        <div className="flex items-center gap-2 flex-nowrap">
          <button
            ref={btnRef}
            onClick={() =>
              setOpenGames((o) => {
                if (!o) requestAnimationFrame(placeMenu);
                return !o;
              })
            }
            className={`px-3 py-1.5 rounded-lg text-sm border flex items-center gap-1 ${
              dark
                ? "bg-neutral-900 text-white border-neutral-800 hover:bg-neutral-800"
                : "bg-stone-100 text-black border-stone-300 hover:bg-stone-200"
            }`}
            aria-expanded={openGames}
            aria-haspopup="menu"
            aria-controls="pm-games-panel"
          >
            Games ▾
          </button>

          <NavBtn
            name="Payouts"
            onClick={() => setTab("Payouts")}
            active={tab === "Payouts"}
          />
          <NavBtn
            name="Store"
            onClick={() => setTab("Store")}
            active={tab === "Store"}
          />
          <NavBtn
            name="Customize"
            onClick={() => setTab("Customize")}
            active={tab === "Customize"}
          />
          <NavBtn
            name="Settings"
            onClick={() => setTab("Settings")}
            active={tab === "Settings"}
          />

          {/* Header-level APB status (compact: no Run, only status + Skip) */}
          <div className="ml-1">
            <ApbControls compact={true} />
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setDark((d) => !d)}
            title="Toggle theme"
            className={`ml-1 px-2.5 py-1.5 rounded-lg border text-sm ${
              dark
                ? "bg-neutral-900 text-white border-neutral-800 hover:bg-neutral-800"
                : "bg-stone-100 text-black border-stone-300 hover:bg-stone-200"
            }`}
          >
            {dark ? "🌙" : "☀️"}
          </button>
        </div>
      </div>

      {/* Portal overlay so the menu never reflows the header */}
      {openGames &&
        createPortal(
          <>
            <div
              onClick={() => setOpenGames(false)}
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
            />
            <div
              id="pm-games-panel"
              role="menu"
              style={{
                position: "fixed",
                left: menuPos.left,
                top: menuPos.top,
                zIndex: 41,
                minWidth: menuPos.width,
              }}
              className={`rounded-xl shadow-lg border ${
                dark
                  ? "bg-stone-900 text-stone-100 border-stone-700"
                  : "bg-white text-slate-900 border-stone-300"
              }`}
            >
              {[
                { label: "City", tab: "City" },
                { label: "Build", tab: "Build" },
                { label: "Parkour", tab: "Parkour" },
                { label: "Home", tab: "Home" },
                { label: "Missions", tab: "Missions" },
              ].map((it) => (
                <button
                  key={it.tab}
                  role="menuitem"
                  onClick={() => {
                    setTab(it.tab);
                    setOpenGames(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-800/60 ${
                    dark ? "hover:text-white" : "hover:bg-stone-100"
                  }`}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </header>
  );
}
