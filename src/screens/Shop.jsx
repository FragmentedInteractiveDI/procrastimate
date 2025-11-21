// src/screens/Shop.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createCheckoutSession,
  refreshEntitlements,
  openBillingPortal,
} from "../modules/payments";
import { getEntitlements, applyReceiptPatch } from "../modules/entitlements";
import {
  getWallet,
  convertCoinsToUsd,
  fmtUSD,
  onChange as onWalletChange,
} from "../modules/wallet";
import { getStore, buyItem, listCatalog, isOwned } from "../modules/store";
import { useAvatar } from "../context/AvatarContext";
import SafeBanner from "../components/SafeBanner";
import { getSlotCapMeta, listSlots } from "../modules/citySlots";

/* ---------- Top-Up plans/packs ---------- */
const PLANS = [
  {
    id: "sub_ad_lite",
    name: "Ad-Lite Monthly",
    desc: "No popups; light banners only.",
    priceId: import.meta.env.VITE_STRIPE_PRICE_SUB_LITE,
  },
  {
    id: "sub_ad_free",
    name: "Ad-Free Monthly",
    desc: "No ads anywhere.",
    priceId: import.meta.env.VITE_STRIPE_PRICE_SUB_FREE,
  },
];

const PACKS = [
  {
    id: "pack_starter",
    name: "Starter Pack",
    coins: 2500,
    priceId: import.meta.env.VITE_STRIPE_PRICE_PACK_STARTER,
  },
  {
    id: "pack_builder",
    name: "Builder Pack",
    coins: 8000,
    priceId: import.meta.env.VITE_STRIPE_PRICE_PACK_BUILDER,
  },
  {
    id: "pack_founder",
    name: "Founder Pack",
    coins: 20000,
    priceId: import.meta.env.VITE_STRIPE_PRICE_PACK_FOUNDER,
  },
];

// USD product for city slots with tiered pricing:
// first extra slot is cheaper, later ones use the standard price.
const SLOT_PRODUCT = {
  id: "city_slot_usd",
  name: "Extra City Slot",
  desc: "Permanently unlock an additional city save slot (up to 5 store slots).",
  firstPriceId: import.meta.env.VITE_STRIPE_PRICE_CITY_SLOT1,
  repeatPriceId: import.meta.env.VITE_STRIPE_PRICE_CITY_SLOT_STD,
};

const fmtInt = (n) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// Filters now include city SKUs
const FILTERS = [
  { id: "cosmetic", label: "Cosmetic" },
  { id: "city_item", label: "City: Items" },
  { id: "city_size", label: "City: Grid" },
  { id: "business", label: "Business" },
  { id: "all", label: "All" },
];

/* ---------- small UI helpers ---------- */
function Badge({ children, tone = "emerald" }) {
  const map = {
    emerald:
      "border-emerald-300/70 bg-emerald-200/70 dark:text-emerald-100 dark:bg-stone-700 dark:border-stone-600",
    amber:
      "border-amber-300/70 bg-amber-200/70 dark:text-amber-100   dark:bg-stone-700 dark:border-stone-600",
    stone:
      "border-stone-400/70 bg-stone-200/70 dark:text-stone-100   dark:bg-stone-700 dark:border-stone-600",
    rose:
      "border-rose-300/70 bg-rose-200/70   dark:text-rose-100     dark:bg-stone-700 dark:border-stone-600",
  };
  return (
    <span
      className={`ml-2 px-2 py-0.5 rounded text-xs border ${
        map[tone] || map.emerald
      }`}
    >
      {children}
    </span>
  );
}
function Seg({ on, children, ...p }) {
  return (
    <button
      {...p}
      className={`px-3 py-1.5 rounded-md border text-sm ${
        on
          ? "bg-amber-200 text-black border-amber-300 dark:bg-stone-700 dark:text-white dark:border-stone-600"
          : "bg-stone-100 text-stone-800 border-stone-300 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-700"
      }`}
    >
      {children}
    </button>
  );
}
function PriceRow({ priceCoins = 0, usdEq = 0, bonusPct = 0, extra = null }) {
  return (
    <div className="text-sm mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        Price: <b className="tabular-nums">{fmtInt(priceCoins)}</b>{" "}
        <span role="img" aria-label="coin">
          🪙
        </span>{" "}
        <span className="text-xs opacity-70">
          (≈{fmtUSD(usdEq)} internal value)
        </span>
      </span>
      {bonusPct ? (
        <span className="text-xs opacity-70">
          +{Math.round(bonusPct * 100)}% passive
        </span>
      ) : null}
      {extra}
    </div>
  );
}

// local prestige probe (for pre-disabling gated SKUs)
function getPrestigeLevel() {
  try {
    const p = JSON.parse(localStorage.getItem("pm_profile_v1") || "{}");
    return Number(p?.prestige || 0);
  } catch {
    return 0;
  }
}
const typeLabel = (t) =>
  t === "city_item"
    ? "City item (consumable, wiped on prestige)"
    : t === "city_size"
    ? "City grid expansion"
    : t;

/* =========================================================================
   Shop (merged)
   ========================================================================= */
export default function Shop() {
  const [tab, setTab] = useState("topup"); // 'topup' | 'spend'
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  /* ---------- Top-Up state ---------- */
  const [entSnap, setEntSnap] = useState(getEntitlements());
  const [busy, setBusy] = useState(""); // id in progress
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const onEnt = () => setEntSnap(getEntitlements());
    window.addEventListener("pm_entitlements_changed", onEnt);
    setEntSnap(getEntitlements());
    return () => window.removeEventListener("pm_entitlements_changed", onEnt);
  }, []);
  const hasLite = !!(
    entSnap?.flags?.ad_lite || entSnap?.subs?.includes?.("sub_ad_lite")
  );
  const hasFree = !!(
    entSnap?.flags?.ad_free || entSnap?.subs?.includes?.("sub_ad_free")
  );

  /* ---------- Spend-Mate (old Store) state ---------- */
  const { equipped, equipHat, equipSkin } = useAvatar();
  const [wallet, setWallet] = useState(() => getWallet());
  const [store, setStore] = useState(() => getStore());
  const [busyBuy, setBusyBuy] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("cosmetic");
  const prestige = getPrestigeLevel();

  // City slot meta (cap breakdown) + current usage
  const [slotMeta, setSlotMeta] = useState(() => getSlotCapMeta());
  const [usedSlots, setUsedSlots] = useState(() => {
    try {
      return listSlots().length;
    } catch {
      return 0;
    }
  });

  // robust polling + subscriptions
  const walletRef = useRef(wallet);
  const storeRef = useRef(store);
  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    const offWallet = onWalletChange((w) => setWallet(w));

    const refreshStore = () => setStore(getStore());
    window.addEventListener("store:owned", refreshStore);
    window.addEventListener("store:purchase", refreshStore);

    const refreshSlots = () => {
      try {
        setSlotMeta(getSlotCapMeta());
        setUsedSlots(listSlots().length);
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", refreshSlots);
    refreshSlots();

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
      window.removeEventListener("storage", refreshSlots);
      alive = false;
      clearInterval(id);
    };
  }, []);

  const items = useMemo(() => {
    const all = listCatalog()
      .slice()
      // cosmetics first, then city items/grid, then others
      .sort((a, b) => {
        const rank = (t) =>
          t === "cosmetic"
            ? 0
            : t === "city_item"
            ? 1
            : t === "city_size"
            ? 2
            : 3;
        return rank(a.type) - rank(b.type);
      });

    const filtered =
      filter === "all" ? all : all.filter((i) => i.type === filter);
    if (!q.trim()) return filtered;
    const s = q.trim().toLowerCase();
    return filtered.filter(
      (i) =>
        i.name?.toLowerCase().includes(s) ||
        i.id?.toLowerCase().includes(s) ||
        String(i.type || "").toLowerCase().includes(s)
    );
  }, [filter, q, store]);

  /* ---------- Top-Up actions ---------- */
  const envMissing = (x) => !x || String(x).trim() === "";

  async function startSub(priceId, id) {
    if (!priceId || busy) return;
    setErr("");
    setMsg("");
    setBusy(id);
    try {
      await createCheckoutSession({ type: "sub", priceId });
      setMsg("Opening checkout…");
    } catch {
      setErr("Could not start checkout. Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function manageBilling() {
    if (busy) return;
    setErr("");
    setMsg("");
    setBusy("portal");
    try {
      await openBillingPortal?.();
      setMsg("Opening billing portal…");
    } catch {
      setErr(
        "Billing portal unavailable. Use Restore Purchases after changes."
      );
    } finally {
      setBusy("");
    }
  }

  async function buyPack(p) {
    if (!p?.priceId || busy) return;
    setErr("");
    setMsg("");
    setBusy(p.id);
    try {
      await createCheckoutSession({
        type: "one_time",
        priceId: p.priceId,
        metadata: { packId: p.id, coins: p.coins },
      });
      setMsg("Opening checkout…");
    } catch {
      setErr("Could not start checkout. Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function buyCitySlotUsd() {
    if (busy) return;

    const storeSlots = slotMeta?.store ?? 0;
    const cap = slotMeta?.cap ?? 0;
    const max = slotMeta?.max ?? 12;

    if (storeSlots >= 5 || cap >= max) {
      setErr("Maximum city save slots reached.");
      return;
    }

    const isFirst = storeSlots <= 0;
    const priceId = isFirst
      ? SLOT_PRODUCT.firstPriceId
      : SLOT_PRODUCT.repeatPriceId;

    if (envMissing(priceId)) {
      setErr("City slot price not configured. Set Stripe price IDs in .env.");
      return;
    }

    setErr("");
    setMsg("");
    setBusy("slot_usd");
    try {
      await createCheckoutSession({
        type: "one_time",
        priceId,
        metadata: {
          kind: "city_slot",
          tier: isFirst ? "first" : "standard",
        },
      });
      setMsg("Opening checkout…");
    } catch {
      setErr("Could not start checkout. Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function syncEnt() {
    if (restoring) return;
    setErr("");
    setMsg("");
    setRestoring(true);
    try {
      const patch = await refreshEntitlements();
      if (patch) applyReceiptPatch(patch);
      setMsg("Purchases restored.");
    } catch {
      setErr("Restore failed. Try again in a moment.");
    } finally {
      setRestoring(false);
    }
  }

  /* ---------- Spend-Mate actions ---------- */
  function autoEquipIfCosmetic(itemId) {
    if (itemId.startsWith("hat_")) equipHat(itemId);
    if (itemId.startsWith("skin_")) equipSkin(itemId);
  }
  function handleBuyMate(id) {
    if (busyBuy) return;
    setErr("");
    setMsg("");
    setBusyBuy(id);
    try {
      const r = buyItem(id, "coins"); // spend Mate Coins
      if (!r?.ok) {
        setErr(r?.msg || "Purchase failed");
        return;
      }
      autoEquipIfCosmetic(id);
      setMsg("Purchase successful");
    } finally {
      setBusyBuy("");
    }
  }
  function handleEquip(id) {
    autoEquipIfCosmetic(id);
  }

  const canBuySlotUsd = (() => {
    const m = slotMeta || {};
    const storeSlots = m.store ?? 0;
    const isFirst = storeSlots <= 0;
    const priceId = isFirst
      ? SLOT_PRODUCT.firstPriceId
      : SLOT_PRODUCT.repeatPriceId;
    if (envMissing(priceId)) return false;
    if (storeSlots >= 5 || m.cap >= m.max) return false;
    return true;
  })();

  /* ---------- render ---------- */
  return (
    <div className="max-w-[960px] mx-auto p-4 sm:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Shop</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        <Seg on={tab === "topup"} onClick={() => setTab("topup")}>
          Top Up
        </Seg>
        <Seg on={tab === "spend"} onClick={() => setTab("spend")}>
          Spend Mate
        </Seg>
      </div>

      <SafeBanner placement={`shop-${tab}-top`} />

      {tab === "topup" ? (
        <>
          {/* Subscriptions */}
          <section className="mt-2">
            <h2 className="text-lg font-medium mb-2">Subscriptions</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {PLANS.map((p) => {
                const active =
                  (p.id === "sub_ad_free" && hasFree) ||
                  (p.id === "sub_ad_lite" && hasLite);
                const disabled = envMissing(p.priceId);
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border border-stone-300 dark:border-stone-700 p-4"
                  >
                    <div className="font-semibold flex items-center">
                      {p.name}
                      {active && <Badge tone="amber">Active</Badge>}
                      {disabled && <Badge tone="stone">Config needed</Badge>}
                    </div>
                    <div className="text-sm text-stone-600 dark:text-stone-300">
                      {p.desc}
                    </div>

                    <div className="mt-3 flex gap-2">
                      {!active ? (
                        <button
                          className={`px-3 py-1.5 rounded-md text-sm text-white ${
                            disabled
                              ? "bg-stone-600 cursor-not-allowed"
                              : "bg-blue-600 hover:bg-blue-700"
                          }`}
                          onClick={() => startSub(p.priceId, p.id)}
                          disabled={disabled || busy === p.id}
                          title={
                            disabled
                              ? "Missing price ID – set in .env"
                              : "Subscribe"
                          }
                        >
                          {busy === p.id ? "Starting…" : "Subscribe"}
                        </button>
                      ) : (
                        <button
                          className={`px-3 py-1.5 rounded-md text-sm text-white ${
                            busy === "portal"
                              ? "bg-stone-600"
                              : "bg-stone-700 hover:bg-stone-800"
                          }`}
                          onClick={manageBilling}
                          disabled={busy === "portal"}
                          title="Manage billing (change/cancel)"
                        >
                          {busy === "portal" ? "Opening…" : "Manage"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Coin Packs */}
          <section>
            <h2 className="text-lg font-medium mb-2">Coin Packs</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {PACKS.map((p) => {
                const disabled = envMissing(p.priceId);
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border border-stone-300 dark:border-stone-700 p-4"
                  >
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm opacity-80">
                      {p.coins.toLocaleString()} coins
                    </div>
                    <button
                      className={`mt-3 px-3 py-1.5 rounded-md text-sm text-white ${
                        disabled
                          ? "bg-stone-600 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                      onClick={() => buyPack(p)}
                      disabled={disabled || busy === p.id}
                      title={
                        disabled
                          ? "Missing price ID – set in .env"
                          : "Buy"
                      }
                    >
                      {busy === p.id ? "Starting…" : "Buy"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* City Save Slots (USD) */}
          <section>
            <h2 className="text-lg font-medium mb-2">City Save Slots</h2>
            <div className="rounded-lg border border-stone-300 dark:border-stone-700 p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {SLOT_PRODUCT.name}
                  {(envMissing(SLOT_PRODUCT.firstPriceId) ||
                    envMissing(SLOT_PRODUCT.repeatPriceId)) && (
                    <Badge tone="stone">Config needed</Badge>
                  )}
                </div>
                <div className="text-xs opacity-80">
                  {SLOT_PRODUCT.desc} First extra slot is discounted; later
                  slots use the standard price.
                </div>
                <div className="text-xs opacity-80 mt-1">
                  Slots used: {fmtInt(usedSlots)} · Available now:{" "}
                  {slotMeta ? fmtInt(slotMeta.cap) : "?"} · Max:{" "}
                  {slotMeta ? fmtInt(slotMeta.max) : "12"}
                </div>
                <div className="text-xs opacity-70 mt-1">
                  Base: {slotMeta?.baseFree ?? 0} · Store:{" "}
                  {slotMeta?.store ?? 0} · Prestige: {slotMeta?.prestige ?? 0}
                </div>
                <div className="text-[11px] opacity-70 mt-1">
                  You start with 2 free slots. Up to 5 more come from store
                  purchases, and 5 unlock from prestige milestones.
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  className={`px-4 py-1.5 rounded-md text-xs sm:text-sm text-white ${
                    !canBuySlotUsd || busy === "slot_usd"
                      ? "bg-stone-600 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  onClick={buyCitySlotUsd}
                  disabled={!canBuySlotUsd || busy === "slot_usd"}
                  title={
                    !canBuySlotUsd
                      ? "Max slots reached or price not configured"
                      : "Opens checkout in your browser"
                  }
                >
                  {busy === "slot_usd" ? "Starting…" : "Buy Extra Slot (USD)"}
                </button>
                <div className="text-[10px] opacity-70 text-right max-w-[220px]">
                  Slots are unlocked with real money purchases and prestige,
                  not Mate Coins.
                </div>
              </div>
            </div>
          </section>

          {/* Restore */}
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-md border text-sm border-stone-400 dark:border-stone-600"
              onClick={syncEnt}
              disabled={restoring}
              title="Sync entitlements from server (reads Stripe)"
            >
              {restoring ? "Restoring…" : "Restore Purchases"}
            </button>
            <div className="text-xs opacity-70">
              Use after reinstall or device change.
            </div>
          </div>
        </>
      ) : (
        /* Spend Mate tab (in-game store) */
        <>
          {/* Wallet snapshot */}
          <div className="panel rounded-lg px-3 py-2 text-sm w-fit">
            <span className="opacity-80">Balance:</span>
            <span className="ml-2 font-semibold tabular-nums">
              {fmtInt(wallet.coins)} Mate
            </span>
            <span className="ml-3 opacity-70 text-xs">
              ≈{fmtUSD(convertCoinsToUsd(wallet.coins || 0))} internal value
            </span>
          </div>

          {/* City slot status (read-only here) */}
          <div className="mt-3 rounded-lg border border-stone-300 dark:border-stone-700 px-3 py-3 text-xs">
            <div className="font-medium text-sm mb-1">City Save Slots</div>
            <div className="opacity-80">
              {fmtInt(usedSlots)} used /{" "}
              {slotMeta ? fmtInt(slotMeta.cap) : "?"} available (max{" "}
              {slotMeta ? fmtInt(slotMeta.max) : "12"})
            </div>
            <div className="opacity-70 mt-1">
              Base: {slotMeta?.baseFree ?? 0} · Store:{" "}
              {slotMeta?.store ?? 0} · Prestige: {slotMeta?.prestige ?? 0}
            </div>
            <div className="opacity-70 mt-1">
              Extra slots are purchased on the <b>Top Up</b> tab with USD and
              unlocked over time via prestige. They are not bought with Mate
              Coins.
            </div>
          </div>

          {/* Policy / city notes */}
          <div className="mt-3 text-xs space-y-1 opacity-80">
            <div>
              Mate Coins are in-game only and cannot be redeemed directly for
              cash. Any USD shown is an internal comparison using the same rate
              as passive earnings.
            </div>
            <div>
              Cosmetics are visual only. Passive earning comes from City
              systems and tile upgrades.
            </div>
            <div>
              Roads and parks cost Mate to place if you’re out of tiles, and
              erasing them does not refund inventory. City item packs are
              consumable builder tiles and are reset when you prestige.
            </div>
          </div>

          {/* Controls */}
          <div className="mt-3 mb-4 grid sm:grid-cols-3 gap-3">
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
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className="seg-btn"
                  aria-pressed={filter === t.id}
                  aria-label={`Filter ${t.label}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="grid gap-3">
            {items.map((item) => {
              const owned = isOwned(item.id); // false for consumables/city_size
              const price = Math.max(0, Math.floor(item.priceCoins || 0));
              const coins = Math.max(0, Math.floor(wallet.coins || 0));
              const affordable = coins >= price;
              const usdEq = convertCoinsToUsd(price);

              // dynamic badges / info
              const consumable = item.type === "city_item";
              const gridGain =
                item.type === "city_size"
                  ? Number(item.citySizeDelta || 0)
                  : 0;
              const qtyLabel =
                consumable && item.consumableQty
                  ? `×${fmtInt(item.consumableQty)}`
                  : null;
              const prestigeReq = Number(item.prestigeMin ?? -1);
              const gated = prestigeReq >= 0 && prestige < prestigeReq;

              // cosmetics equip state
              const { hat: eqHat, skin: eqSkin } = equipped || {};
              const equippedId = item.id.startsWith("hat_")
                ? eqHat
                : item.id.startsWith("skin_")
                ? eqSkin
                : undefined;
              const isEquipped =
                item.type === "cosmetic" && owned && equippedId === item.id;

              // button label
              const buyLabel = consumable
                ? qtyLabel
                  ? `Add ${qtyLabel}`
                  : "Add to inventory"
                : gridGain
                ? `Expand +${gridGain}`
                : `Buy · ${fmtInt(price)}🪙`;

              return (
                <div key={item.id} className="panel p-4 rounded-xl shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-lg truncate text-stone-900 dark:text-stone-100">
                        {item.name}
                        {qtyLabel && <Badge tone="stone">{qtyLabel}</Badge>}
                        {gridGain ? (
                          <Badge tone="stone">Grid +{gridGain}</Badge>
                        ) : null}
                        {item.grantsPassive ? (
                          <Badge tone="amber">Affects passive</Badge>
                        ) : null}
                        {gated ? (
                          <Badge tone="rose">
                            Needs Prestige {prestigeReq}
                          </Badge>
                        ) : null}
                        {consumable && (
                          <Badge tone="stone">Consumable</Badge>
                        )}
                      </div>
                      <div className="text-xs opacity-70 mb-1 text-stone-800 dark:text-stone-300">
                        {typeLabel(item.type)}
                      </div>

                      <PriceRow
                        priceCoins={price}
                        usdEq={usdEq}
                        bonusPct={item.bonusPct || 0}
                        extra={
                          !owned && !affordable ? (
                            <span className="text-xs">
                              Need {fmtInt(Math.max(0, price - coins))}🪙
                            </span>
                          ) : null
                        }
                      />
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {owned && (
                        <span className="px-2 py-0.5 rounded text-xs border border-amber-300/70 bg-amber-200/70 text-black dark:text-amber-100 dark:bg-stone-700 dark:border-stone-600">
                          Owned
                        </span>
                      )}

                      {!owned ? (
                        <button
                          onClick={() => handleBuyMate(item.id)}
                          disabled={
                            busyBuy === item.id || !affordable || gated
                          }
                          className={`px-4 py-2 rounded text-white transition-colors ${
                            busyBuy === item.id
                              ? "bg-blue-600 opacity-80"
                              : affordable && !gated
                              ? "bg-blue-600 hover:bg-blue-700"
                              : "bg-stone-600 cursor-not-allowed"
                          }`}
                          aria-disabled={
                            busyBuy === item.id || !affordable || gated
                          }
                          aria-label={`Buy ${item.name}`}
                          title={
                            gated
                              ? `Requires Prestige ${prestigeReq}`
                              : undefined
                          }
                        >
                          {busyBuy === item.id ? "Buying…" : buyLabel}
                        </button>
                      ) : item.type === "cosmetic" ? (
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
            <div className="mt-6 text-sm opacity-70">
              No items match your filters.
            </div>
          )}
        </>
      )}

      {(msg || err) && (
        <div
          className={`text-sm px-3 py-2 rounded-md border ${
            err
              ? "border-rose-300/70 bg-rose-50 dark:bg-stone-800 dark:border-stone-700"
              : "border-amber-300/70 bg-amber-50 dark:bg-stone-800 dark:border-stone-600"
          }`}
        >
          {err || msg}
        </div>
      )}

      <SafeBanner placement={`shop-${tab}-bottom`} />
    </div>
  );
}
