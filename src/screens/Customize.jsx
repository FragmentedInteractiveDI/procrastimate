// FILE: src/screens/Customize.jsx
import React, { useEffect, useState } from "react";
import { useAvatar } from "../context/AvatarContext";
import Avatar, { BODY_STYLES, EXPRESSION_STYLES, HAT_STYLES } from "../components/Avatar";
import { listCatalog, isOwned, buyItem, getStore } from "../modules/store";
import { getWallet, spendMate, fmtMate } from "../modules/wallet";

export default function Customize() {
  const { avatar, setBody, setExpression, setHat, setCustomName, getRenameCost, getRenameCount } = useAvatar();
  const [tab, setTab] = useState("bodies"); // "bodies" | "expressions" | "hats"
  const [wallet, setWallet] = useState(getWallet());
  const [store, setStore] = useState(getStore());
  const [msg, setMsg] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState("");

  // Poll wallet/store state
  useEffect(() => {
    const interval = setInterval(() => {
      setWallet(getWallet());
      setStore(getStore());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for store events
  useEffect(() => {
    const refresh = () => {
      setWallet(getWallet());
      setStore(getStore());
    };
    window.addEventListener("store:owned", refresh);
    window.addEventListener("store:purchase", refresh);
    return () => {
      window.removeEventListener("store:owned", refresh);
      window.removeEventListener("store:purchase", refresh);
    };
  }, []);

  function showMsg(text) {
    setMsg(text);
    setTimeout(() => setMsg((prev) => (prev === text ? "" : prev)), 4000);
  }

  // Get cosmetics from catalog
  const cosmetics = listCatalog({ types: ["cosmetic"] });
  const bodies = cosmetics.filter((i) => i.subtype === "body");
  const expressions = cosmetics.filter((i) => i.subtype === "expression");
  const hats = cosmetics.filter((i) => i.subtype === "hat");

  const currentItems = tab === "bodies" ? bodies : tab === "expressions" ? expressions : hats;

  function handleUnlock(item) {
    const result = buyItem(item.id, "coins");
    if (result.ok) {
      showMsg(`Unlocked ${item.name}!`);
      setWallet(getWallet());
      setStore(getStore());
      
      // Auto-equip after purchase
      if (tab === "bodies") setBody(item.id);
      else if (tab === "expressions") setExpression(item.id);
      else if (tab === "hats") setHat(item.id);
    } else {
      showMsg(result.msg || "Failed to unlock");
    }
  }

  function handleEquip(item) {
    if (tab === "bodies") {
      setBody(item.id);
      showMsg(`Switched to ${item.name}!`);
    } else if (tab === "expressions") {
      setExpression(item.id);
      showMsg(`Equipped ${item.name}!`);
    } else if (tab === "hats") {
      setHat(item.id);
      showMsg(`Equipped ${item.name}!`);
    }
  }

  function handleRemoveHat() {
    setHat(null);
    showMsg("Removed hat");
  }

  function openRenameModal() {
    setRenameInput(avatar.customName || "");
    setShowRenameModal(true);
  }

  function handleRename() {
    const newName = renameInput.trim();
    const cost = getRenameCost();
    const coins = wallet?.coins ?? 0;

    // Validate name
    if (!newName) {
      showMsg("Please enter a name");
      return;
    }

    if (newName.length > 20) {
      showMsg("Name too long (max 20 characters)");
      return;
    }

    // Check if player can afford
    if (cost > 0 && coins < cost) {
      showMsg(`Not enough coins! Need ${fmtMate(cost)} 🪙`);
      return;
    }

    // Spend coins if not first rename
    if (cost > 0) {
      const spent = spendMate(cost, { k: "avatar_rename" });
      if (!spent?.ok) {
        showMsg("Failed to rename");
        return;
      }
    }

    // Apply rename
    setCustomName(newName);
    setShowRenameModal(false);
    setWallet(getWallet());
    
    if (cost === 0) {
      showMsg(`Named your ProcrastiMate "${newName}"! (First rename FREE)`);
    } else {
      showMsg(`Renamed to "${newName}" for ${fmtMate(cost)} 🪙`);
    }
  }

  function handleResetName() {
    setCustomName(null);
    setShowRenameModal(false);
    showMsg("Reset to default name");
  }

  const coins = wallet?.coins ?? 0;
  const renameCost = getRenameCost();
  const displayName = avatar.customName || BODY_STYLES[avatar.bodyId]?.name || "ProcrastiMate";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🎨 Customize
          </h1>
          <p className="text-sm opacity-75 mt-1">
            Personalize your ProcrastiMate
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-2 rounded-lg border text-sm tabular-nums dark:border-neutral-700 dark:bg-neutral-800">
            <div className="opacity-70 text-xs uppercase tracking-wide">
              Mate Coins
            </div>
            <div className="font-semibold">{fmtMate(coins)} 🪙</div>
          </div>
        </div>
      </header>

      {/* Main Layout: Preview + Items */}
      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* Left: Preview Card */}
        <div className="panel p-6 rounded-xl border dark:border-neutral-700 dark:bg-neutral-800 bg-white border-neutral-300">
          <h2 className="text-lg font-bold mb-4">Preview</h2>
          
          {/* Large Avatar Display */}
          <div className="flex justify-center mb-4">
            <Avatar size="xl" />
          </div>

          {/* Name Display + Rename Button */}
          <div className="mb-4 text-center">
            <div className="text-2xl font-bold mb-2">{displayName}</div>
            <button
              onClick={openRenameModal}
              className="px-3 py-1.5 rounded-lg text-sm border border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            >
              ✏️ Rename ({renameCost === 0 ? "FREE" : `${fmtMate(renameCost)} 🪙`})
            </button>
          </div>

          {/* Stats */}
          <div className="text-sm text-center opacity-75 space-y-1">
            <div>Body: {BODY_STYLES[avatar.bodyId]?.name || "Unknown"}</div>
            <div>Expression: {EXPRESSION_STYLES[avatar.expressionId]?.name || "Unknown"}</div>
            <div>Hat: {avatar.hatId ? HAT_STYLES[avatar.hatId]?.name : "None"}</div>
          </div>
        </div>

        {/* Right: Wardrobe */}
        <div className="panel p-6 rounded-xl border dark:border-neutral-700 dark:bg-neutral-800 bg-white border-neutral-300">
          {/* Tabs */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setTab("bodies")}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                tab === "bodies"
                  ? "bg-amber-500 text-black"
                  : "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-600"
              }`}
            >
              Bodies ({bodies.length})
            </button>
            <button
              onClick={() => setTab("expressions")}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                tab === "expressions"
                  ? "bg-amber-500 text-black"
                  : "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-600"
              }`}
            >
              Expressions ({expressions.length})
            </button>
            <button
              onClick={() => setTab("hats")}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                tab === "hats"
                  ? "bg-amber-500 text-black"
                  : "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-600"
              }`}
            >
              Hats ({hats.length})
            </button>
          </div>

          {/* Remove Hat Button (only for hats tab) */}
          {tab === "hats" && avatar.hatId && (
            <div className="mb-4">
              <button
                onClick={handleRemoveHat}
                className="px-4 py-2 rounded-lg text-sm border border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Remove Hat
              </button>
            </div>
          )}

          {/* Items Grid */}
          <div className="grid gap-3">
            {currentItems.map((item) => {
              const owned = isOwned(item.id);
              const equipped =
                (tab === "bodies" && avatar.bodyId === item.id) ||
                (tab === "expressions" && avatar.expressionId === item.id) ||
                (tab === "hats" && avatar.hatId === item.id);
              const price = item.priceCoins || 0;
              const canAfford = coins >= price;

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border transition-all ${
                    equipped
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                      : "border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500"
                  }`}
                >
                  {/* Preview - FIX: Show current body with the item being previewed */}
                  <div className="flex-shrink-0">
                    <Avatar
                      size="md"
                      bodyId={tab === "bodies" ? item.id : avatar.bodyId}
                      expressionId={tab === "expressions" ? item.id : (tab === "bodies" ? "expr_happy" : avatar.expressionId)}
                      hatId={tab === "hats" ? item.id : (tab === "bodies" ? null : avatar.hatId)}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{item.name}</div>
                    {item.description && (
                      <div className="text-xs opacity-60 mt-0.5">{item.description}</div>
                    )}
                    {price > 0 && !owned && (
                      <div className="text-xs opacity-75 mt-0.5">
                        {fmtMate(price)} 🪙
                      </div>
                    )}
                    {price === 0 && !owned && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                        Free
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div>
                    {equipped ? (
                      <div className="px-3 py-1.5 rounded-md bg-amber-500 text-black text-sm font-semibold">
                        Equipped
                      </div>
                    ) : owned ? (
                      <button
                        onClick={() => handleEquip(item)}
                        className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors"
                      >
                        Equip
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUnlock(item)}
                        disabled={!canAfford}
                        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                          canAfford
                            ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white"
                            : "bg-neutral-400 dark:bg-neutral-600 text-neutral-200 cursor-not-allowed"
                        }`}
                      >
                        {price === 0 ? "Unlock" : `${fmtMate(price)} 🪙`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 max-w-md w-full border dark:border-neutral-700">
            <h3 className="text-xl font-bold mb-4">Name Your ProcrastiMate</h3>
            
            <div className="mb-4">
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Enter a name..."
                maxLength={20}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 dark:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoFocus
              />
              <div className="text-xs opacity-60 mt-1">
                {renameInput.length}/20 characters
              </div>
            </div>

            <div className="mb-4 text-sm opacity-75">
              {renameCost === 0 ? (
                <div className="text-green-600 dark:text-green-400 font-semibold">
                  ✨ First rename is FREE!
                </div>
              ) : (
                <div>
                  Cost: {fmtMate(renameCost)} 🪙
                  {coins < renameCost && (
                    <div className="text-red-600 dark:text-red-400 mt-1">
                      Not enough coins!
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowRenameModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              {avatar.customName && (
                <button
                  onClick={handleResetName}
                  className="flex-1 px-4 py-2 rounded-lg border border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                onClick={handleRename}
                disabled={!renameInput.trim() || (renameCost > 0 && coins < renameCost)}
                className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors ${
                  renameInput.trim() && (renameCost === 0 || coins >= renameCost)
                    ? "bg-amber-500 hover:bg-amber-600 text-black"
                    : "bg-neutral-400 dark:bg-neutral-600 text-neutral-200 cursor-not-allowed"
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Message */}
      {msg && (
        <div className="fixed bottom-6 right-6 px-4 py-3 rounded-lg border shadow-lg bg-neutral-900 border-neutral-700 text-white text-sm animate-fadeIn">
          {msg}
        </div>
      )}
    </div>
  );
}