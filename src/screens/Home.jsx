// src/screens/Home.jsx
import React, { useEffect, useState } from "react";
import {
  getHome,
  placeAt,
  clearAt,
  placeBusinessRandom,
  calcBusinessBonus,
  getPlacedBusinessIds
} from "../modules/home";
import {
  getStore,
  listCatalog,
  buyItem,
  isOwned
} from "../modules/store";
import { getWallet } from "../modules/wallet";
import { computeCityIncomeSnapshot } from "../modules/cityEconomy";
import { getBoostTimes, isBoostActive, fmtMMSS } from "../modules/boost";

export default function Home({ dark }) {
  const [home, setHome] = useState(getHome());
  const [store, setStore] = useState(getStore());
  const [wallet, setWallet] = useState(getWallet());
  const [snap, setSnap] = useState(computeCityIncomeSnapshot());
  const [times, setTimes] = useState(getBoostTimes());
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState("biz_kiosk");

  const bonusPct = calcBusinessBonus();
  const bonus = Math.round(bonusPct * 100);

  useEffect(() => {
    const t = setInterval(() => {
      setHome(getHome());
      setStore(getStore());
      setWallet(getWallet());
      setSnap(computeCityIncomeSnapshot());
      setTimes(getBoostTimes());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function onCellClick(x, y) {
    if (!selected) return;
    const r = placeAt(x, y, selected);
    setMsg(r.ok ? `Placed ${selected} at ${x},${y}` : r.msg || "Place failed");
    setHome(getHome());
  }

  function onClear(x, y) {
    const r = clearAt(x, y);
    setMsg(r.ok ? "Cleared" : "Clear failed");
    setHome(getHome());
  }

  function addRandom() {
    if (!isOwned(selected)) {
      const br = buyItem(selected, "coins");
      if (!br.ok) return setMsg(br.msg);
    }
    const r = placeBusinessRandom(selected);
    setMsg(r.ok ? `Placed ${selected}` : r.msg || "Place failed");
    setHome(getHome());
  }

  const business = listCatalog().filter((c) => c.type === "business");
  const active = isBoostActive();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
        <h1 className="text-2xl font-bold">🏡 Home</h1>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <div className="text-sm opacity-80">
            Business bonus: <strong>+{bonus}%</strong>
          </div>
          <div className="px-3 py-1.5 rounded-lg text-xs border border-amber-200/70 bg-amber-200 text-black dark:bg-stone-800 dark:text-amber-100 dark:border-stone-600">
            {active ? `Boost x${times.mult} — ${fmtMMSS(times.remainingSec * 1000)}` : "Idle — no boost"}
          </div>
        </div>
      </header>

      {/* glance stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <StatCard title="Mate Coins" value={`${wallet.coins ?? 0} 🪙`} />
        <StatCard title="City Passive Rate" value={`${snap.totalPerMin.toFixed(1)} 🪙/min`} sub={`Boost x${snap.boostMult} · ${fmtMMSS(snap.remainingBoostSec * 1000)}`} />
        <StatCard title="Placed Businesses" value={getPlacedBusinessIds().length} sub={`Bonus +${bonus}%`} />
      </div>

      {/* selector + action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-black dark:text-white"
        >
          {business.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} — {b.priceCoins}c {isOwned(b.id) ? "(owned)" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={addRandom}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
        >
          Buy & Place Random
        </button>
      </div>

      <Grid home={home} onCellClick={onCellClick} onClear={onClear} />

      {msg && (
        <div className="mt-4 p-3 rounded-xl text-sm border"
          style={{
            background: dark ? "#78350f" : "#fef3c7",
            color: dark ? "#fcd34d" : "#92400e",
            borderColor: dark ? "#92400e" : "#fcd34d"
          }}>
          {msg}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, sub }) {
  return (
    <div className="rounded-xl border p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="text-sm opacity-70 mb-1.5">{title}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-sm opacity-70 mt-1">{sub}</div>}
    </div>
  );
}

function Grid({ home, onCellClick, onClear }) {
  return (
    <div
      className="grid gap-2 justify-start"
      style={{ gridTemplateColumns: `repeat(${home.w}, 56px)` }}
    >
      {home.cells.map((id, i) => {
        const x = i % home.w;
        const y = Math.floor(i / home.w);
        const isFilled = !!id;
        return (
          <div
            key={i}
            onClick={() => (isFilled ? onClear(x, y) : onCellClick(x, y))}
            title={`${x},${y}`}
            className="rounded-lg text-center text-sm cursor-pointer"
            style={{
              width: 56,
              height: 56,
              lineHeight: "56px",
              background: isFilled ? "rgba(16, 185, 129, 0.2)" : "#f9fafb",
              border: `1px solid ${isFilled ? "#34d399" : "#d1d5db"}`
            }}
          >
            {id || ""}
          </div>
        );
      })}
    </div>
  );
}
