import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getWallet,
  convertCoinsToUsd,
  fmtUSD,
  onChange as onWalletChange,
} from "../modules/wallet";
import { getStore, buyItem, listCatalog, isOwned } from "../modules/store";
import { useAvatar } from "../context/AvatarContext";
import SafeBanner from "../components/SafeBanner"; // <-- shows only if user isn't entitled to ad-lite/free

const fmtInt = (n) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// Keep "cosmetic" as default. Others stay for now.
const FILTERS = ["cosmetic", "all", "business", "boost"];

function PriceRow({ priceCoins = 0, usdEq = 0, bonusPct = 0 }) {
  return (
    <div className="text-sm mb-2">
      Price: <b className="tabular-nums">{fmtInt(priceCoins)}</b>{" "}
      <span role="img" aria-label="coin">🪙</span>{" "}
      <span className="text-xs opacity-70">({fmtUSD(usdEq)})</span>
      {bonusPct ? (
        <span className="ml-2 text-xs opacity-70">
          +{Math.round(bonusPct * 100)}% passive
        </span>
      ) : null}
    </div>
  );
}

export default function Store() {
  const { equipped, equipHat, equipSkin } = useAvatar();

  const [wallet, setWallet] = useState(() => getWallet());
  const [store, setStore] = useState(() => getStore());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("cosmetic");

  // ---- subscriptions + robust polling (no stale closures) ----
  const walletRef = useRef(wallet);
  const storeRef = useRef(store);
  useEffect(() => { walletRef.current = wallet; }, [wallet]);
  useEffect(() => { storeRef.current = store; }, [store]);

  useEffect(() => {
    const offWallet = onWalletChange((w) => setWallet(w));

    const refreshStore = () => setStore(getStore());
    window.addEventListener("store:owned", refreshStore);
    window.addEventListener("store:purchase", refreshStore);

    let alive = true;
    const id = setInterval(() => {
      if (!alive) return;
      try {
        const w = getWallet();
        const prevW = walletRef.current;
        if (
          w.micro !== prevW.micro ||
          w.coins !== prevW.coins ||
          w.usd !== prevW.usd
        ) {
          setWallet(w);
        }

        const s = getStore();
        const prevS = storeRef.current;
        if (JSON.stringify(s) !== JSON.stringify(prevS)) setStore(s);
      } catch {}
    }, 800);

    // initial snap
    setWallet(getWallet());
    setStore(getStore());

    return () => {
      offWallet?.();
      window.removeEventListener("store:owned", refreshStore);
      window.removeEventListener("store:purchase", refreshStore);
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ---- derived list (cosmetics grouped first when "all") ----
  const items = useMemo(() => {
    const all = listCatalog()
      .slice()
      .sort((a, b) => (a.type === b.type ? 0 : a.type === "cosmetic" ? -1 : 1));

    const filtered = filter === "all" ? all : all.filter((i) => i.type === filter);
    if (!q.trim()) return filtered;

    const s = q.trim().toLowerCase();
    return filtered.filter(
      (i) =>
        i.name?.toLowerCase().includes(s) ||
        i.id?.toLowerCase().includes(s) ||
        String(i.type || "").toLowerCase().includes(s)
    );
  }, [filter, q, store]);

  // ---- actions ----
  function autoEquipIfCosmetic(itemId) {
    if (itemId.startsWith("hat_")) equipHat(itemId);
    if (itemId.startsWith("skin_")) equipSkin(itemId);
  }

  function handleBuy(id) {
    if (busy) return;
    setMsg("");
    setBusy(id);
    try {
      const r = buyItem(id, "coins"); // Mate Coins
      if (!r?.ok) {
        setMsg(r?.msg || "Purchase failed");
        return;
      }
      autoEquipIfCosmetic(id); // QoL: immediately visible
      setMsg("Purchase successful");
    } finally {
      setBusy("");
    }
  }

  function handleEquip(id) {
    autoEquipIfCosmetic(id);
  }

  // ---- render ----
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto text-stone-900 dark:text-stone-100">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span role="img" aria-label="store">🛒</span>
          <span>Store</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="panel rounded-lg px-3 py-2 text-sm">
            <span className="opacity-80">Balance:</span>
            <span className="ml-2 font-semibold tabular-nums">
              {fmtInt(wallet.coins)} Mate
            </span>
            <span className="ml-3 opacity-70 text-xs">
              ({fmtUSD(convertCoinsToUsd(wallet.coins || 0))})
            </span>
          </div>
          {/* New: Get more coins (links to Shop screen) */}
          <a
            href="/shop"
            className="px-3 py-2 rounded-md text-sm text-white bg-emerald-600 hover:bg-emerald-700"
            title="Buy coin packs or subscriptions"
          >
            Get more coins
          </a>
        </div>
      </div>

      {/* Optional banner (only shows if user has no ad-lite/ad-free) */}
      <div className="mb-3">
        <SafeBanner placement="store-top" />
      </div>

      {/* Policy note */}
      <div className="mb-4 text-xs opacity-70">
        Cosmetics are visual only. Passive earning comes from City systems and tile upgrades.
      </div>

      {/* Controls */}
      <div className="mb-4 grid sm:grid-cols-3 gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search items"
          className="px-3 py-2 rounded-lg text-sm border bg-white text-black dark:bg-neutral-800 dark:text-white dark:border-neutral-700 w-full"
          aria-label="Search store items"
        />
        <div
          className="sm:col-span-2 flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label="Filter items"
        >
          {FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className="seg-btn"
              aria-pressed={filter === t}
              aria-label={`Filter ${t}`}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="grid gap-3">
        {items.map((item) => {
          const owned = isOwned(item.id);
          const price = Math.max(0, Math.floor(item.priceCoins || 0));
          const coins = Math.max(0, Math.floor(wallet.coins || 0));
          const affordable = coins >= price;
          const usdEq = convertCoinsToUsd(price);

          const isCosmetic = item.type === "cosmetic";
          const equippedId = item.id.startsWith("hat_")
            ? equipped?.hat
            : item.id.startsWith("skin_")
            ? equipped?.skin
            : undefined;
          const isEquipped = isCosmetic && owned && equippedId === item.id;

          return (
            <div key={item.id} className="panel p-4 rounded-xl shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-lg truncate text-stone-900 dark:text-stone-100">
                    {item.name}
                  </div>
                  <div className="text-xs opacity-70 mb-1 text-stone-800 dark:text-stone-300">
                    {item.type}
                  </div>

                  <PriceRow
                    priceCoins={price}
                    usdEq={usdEq}
                    bonusPct={item.bonusPct || 0}
                  />
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {owned && (
                    <span className="px-2 py-0.5 rounded text-xs border border-amber-300/70 bg-amber-200/70 text-black dark:text-amber-100 dark:bg-stone-700 dark:border-stone-600">
                      Owned
                    </span>
                  )}

                  {!owned && !affordable && (
                    <span className="px-2 py-0.5 rounded text-xs border border-stone-600/60 text-stone-700 dark:text-stone-300">
                      Need {fmtInt(Math.max(0, price - coins))}🪙
                    </span>
                  )}

                  {/* Action button(s) */}
                  {!owned ? (
                    <button
                      onClick={() => handleBuy(item.id)}
                      disabled={busy === item.id || !affordable}
                      className={`px-4 py-2 rounded text-white transition-colors ${
                        busy === item.id
                          ? "bg-blue-600 opacity-80"
                          : affordable
                          ? "bg-blue-600 hover:bg-blue-700"
                          : "bg-stone-600 cursor-not-allowed"
                      }`}
                      aria-disabled={busy === item.id || !affordable}
                      aria-label={`Buy ${item.name}`}
                    >
                      {busy === item.id ? "Buying…" : `Buy · ${fmtInt(price)}🪙`}
                    </button>
                  ) : isCosmetic ? (
                    <button
                      onClick={() => !isEquipped && handleEquip(item.id)}
                      className="pill"
                      aria-selected={isEquipped}
                      title={isEquipped ? "Equipped" : "Equip"}
                    >
                      {isEquipped ? "Equipped" : "Equip"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="mt-6 text-sm opacity-70">No items match your filters.</div>
      )}

      {msg && (
        <div className="mt-4 text-sm p-2 rounded border border-amber-300/70 bg-amber-50 text-slate-800 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600">
          {msg}
        </div>
      )}

      {/* Bottom banner slot */}
      <div className="mt-4">
        <SafeBanner placement="store-bottom" />
      </div>
    </div>
  );
}
