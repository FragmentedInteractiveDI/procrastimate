// FILE: src/screens/CityBuilder.jsx
// FINAL FIX - Proper bootstrap without charging coins + single-click placement

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as buildInventory from "../modules/buildInventory";
import * as walletModule from "../modules/wallet";
import * as citySlots from "../modules/citySlots";
import { BuilderManager } from "../game/builder/BuilderManager.js";
import { getWallet, fmtUSD, convertCoinsToUsd } from "../modules/wallet";

const CELL = 32;

/* ---------- Helpers ---------- */

const ROADLIKE = new Set(["road", "avenue", "roundabout"]);
const BUILDINGS = new Set([
  "home",
  "house",
  "park",
  "shop",
  "hq",
  "apb",
  "bank",
  "garage",
  "paintshop",
]);

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function normalizeId(id) {
  if (!id) return "";
  const str = String(id).toLowerCase();
  if (str === "r") return "road";
  if (str === "av") return "avenue";
  if (str === "rb" || str === "round" || str === "ra") return "roundabout";
  if (str === "st" || str === "start") return "home";
  return str;
}

function gridToTiles(grid) {
  const out = [];
  if (!Array.isArray(grid)) return out;
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const id = row[x];
      if (id) {
        out.push({ x, y, id: normalizeId(id), rot: 0 });
      }
    }
  }
  return out;
}

function toMap(tiles) {
  const m = new Map();
  (tiles || []).forEach((t) => {
    if (Number.isFinite(t.x) && Number.isFinite(t.y) && t.id) {
      m.set(`${t.x},${t.y}`, {
        x: t.x,
        y: t.y,
        id: normalizeId(t.id),
        rot: t.rot || 0,
      });
    }
  });
  return m;
}

/* ==================== COMPONENT ==================== */

export default function CityBuilder({ dark = true }) {
  const wrapRef = useRef(null);
  const gridRef = useRef(null);
  const ghostRef = useRef(null);

  const hydratedRef = useRef(false);
  const loadingSlotRef = useRef(false);

  const [manager] = useState(
    () =>
      new BuilderManager({
        buildInventory,
        wallet: walletModule,
        citySlots,
      })
  );

  if (typeof window !== "undefined") {
    window.__pmBuilder = manager;
  }

  console.debug("[CityBuilder] manager-constructed", manager.getSystems());

  const { grid, inventory, placement, slot, ui } = manager.getSystems();

  /* ---------- React state ---------- */

  const [slots, setSlots] = useState(() => slot.getSlots() || []);
  const [activeSlot, setActiveSlot] = useState(
    () => slot.activeSlot || slots[0]?.id || "default"
  );

  const [gridLevel, setGridLevel] = useState(grid.gridLevel || 0);
  const [placedMap, setPlacedMap] = useState(new Map());
  const [usage, setUsage] = useState({
    perTile: {},
    owned: {},
    used: {},
    available: {},
  });

  const [toast, setToast] = useState("");
  const [activeCategory, setActiveCategory] = useState("infrastructure");
  const [select, setSelect] = useState("erase");
  const [rot, setRot] = useState(0);
  const [dragMode, setDragMode] = useState(null);
  const [showUnlock, setShowUnlock] = useState(false);

  const cellSize = CELL;
  const cols = grid.cols || 6;
  const rows = grid.rows || 6;

  const categories = ui.getCategories();
  const wallet = getWallet();

  /* ---------- Toast helper ---------- */

  function say(m, ms = 1600) {
    setToast(String(m));
    clearTimeout(say._t);
    say._t = setTimeout(() => setToast(""), ms);
  }

  /* ---------- Engine sync helpers ---------- */

  const syncFromSystems = () => {
    setGridLevel(grid.gridLevel);

    const c = grid.cols || 6;
    const r = grid.rows || 6;

    const gridArr = placement.toGrid(c, r);
    const tiles = gridToTiles(gridArr);
    setPlacedMap(toMap(tiles));

    const snapshot = manager.recomputeUsage();
    if (snapshot) setUsage(snapshot);

    console.debug("[CityBuilder] syncFromSystems", {
      gridLevel: grid.gridLevel,
      cols: c,
      rows: r,
      tileCount: tiles.length,
    });
  };

  /* ---------- Initial mount / cleanup ---------- */

  useEffect(() => {
    console.debug("[CityBuilder] mount/useEffect(manager)");

    setSlots(slot.getSlots() || []);
    setActiveSlot(slot.activeSlot || slot.getSlots()?.[0]?.id || "default");

    return () => {
      console.debug("[CityBuilder] unmount – destroying manager");
      manager.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager]);

  /* ---------- Bootstrap builder from saved slot layout ---------- */

  useEffect(() => {
    if (!activeSlot) {
      console.debug("[CityBuilder] bootstrap: no activeSlot");
      return;
    }

    loadingSlotRef.current = true;
    hydratedRef.current = false;

    try {
      console.debug("[CityBuilder] bootstrap: loading sim for", activeSlot);
      const sim = citySlots.loadSim(activeSlot) || {};
      const simGrid = Array.isArray(sim.grid) ? sim.grid : [];

      console.debug("[CityBuilder] bootstrap: sim snapshot", {
        slotId: activeSlot,
        w: sim.w,
        h: sim.h,
        rows: simGrid.length,
      });

      // CRITICAL FIX: Use PlacementSystem.loadGrid directly
      // This loads tiles WITHOUT charging mate coins
      if (simGrid.length > 0) {
        placement.loadGrid(simGrid, sim.w || 6, sim.h || 6);
      } else {
        placement.clearAll();
      }

      console.debug("[CityBuilder] bootstrap: tiles loaded via placement.loadGrid");

      // Now sync to React state
      syncFromSystems();

      // Mark as hydrated
      Promise.resolve().then(() => {
        hydratedRef.current = true;
        loadingSlotRef.current = false;
        console.debug("[CityBuilder] bootstrap: hydration complete", {
          activeSlot,
          hydratedRef: hydratedRef.current,
        });
      });
    } catch (err) {
      console.warn("[CityBuilder] Failed to bootstrap from slot", err);
      loadingSlotRef.current = false;
      hydratedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot]);

  /* ---------- Category → UI ---------- */

  const getTileView = (rawId) => {
    const id = normalizeId(rawId);
    const staticInfo = ui.getTileInfo(id);

    let info = null;
    if (typeof inventory.getTileInfo === "function") {
      info = inventory.getTileInfo(id);
    }

    const owned = info?.count ?? 0;
    const available =
      usage.available && Object.prototype.hasOwnProperty.call(usage.available, id)
        ? usage.available[id]
        : owned;
    const used =
      usage.used && Object.prototype.hasOwnProperty.call(usage.used, id)
        ? usage.used[id]
        : Math.max(0, owned - available);

    return {
      id,
      name: staticInfo.name,
      icon: staticInfo.icon,
      color: staticInfo.color,
      owned,
      available,
      used,
      mateCost: info?.mateCost ?? 0,
      unlockCost: info?.unlockCost ?? 0,
      unlocked: info?.unlocked ?? true,
    };
  };

  const activeCategoryTiles = useMemo(() => {
    const category = categories[activeCategory];
    if (!category) return [];
    return (category.tiles || [])
      .map(getTileView)
      .filter(
        (t) =>
          t.owned > 0 ||
          t.available > 0 ||
          t.mateCost > 0 ||
          t.unlockCost > 0
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, categories, usage]);

  const lockedTiles = useMemo(() => {
    const out = [];
    for (const [catId, cat] of Object.entries(categories)) {
      for (const id of cat.tiles || []) {
        const tv = getTileView(id);
        if (!tv.unlocked && tv.unlockCost > 0) {
          out.push({
            ...tv,
            categoryId: catId,
            categoryName: cat.name,
          });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, usage]);

  const tiles = useMemo(() => {
    const ids = new Set();
    for (const cat of Object.values(categories)) {
      for (const id of cat.tiles || []) {
        const tv = getTileView(id);
        if (!tv.unlocked) continue;
        if (tv.owned > 0 || tv.available > 0 || tv.mateCost > 0) {
          ids.add(tv.id);
        }
      }
    }
    ids.delete("start");
    return ["erase", ...Array.from(ids)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, usage]);

  /* ---------- Grid / unlock helpers ---------- */

  const unlockedBounds = grid.unlockedBounds;
  const isCellUnlocked = (x, y) => grid.isCellUnlocked(x, y);
  const lockedCells = grid.getLockedCells();

  function hasAdjacentRoad(gx, gy, map) {
    const check = (x, y) => {
      const tile = map.get(`${x},${y}`);
      return tile && ROADLIKE.has(tile.id);
    };
    return (
      check(gx - 1, gy) ||
      check(gx + 1, gy) ||
      check(gx, gy - 1) ||
      check(gx, gy + 1)
    );
  }

  const handleUnlockGrid = () => {
    const cost = grid.getNextUnlockCost();
    const bal = wallet.coins;
    if (bal < cost) {
      say(`Not enough coins. Need ${cost}, have ${bal}`);
      return;
    }
    const res = manager.unlockNextGridLevel();
    if (res.success) {
      say(`Grid unlocked! ${res.newSize.w}×${res.newSize.h}`);
      syncFromSystems();
    } else {
      say(res.reason || "Failed to unlock grid");
    }
  };

  const handleUnlockTile = (id) => {
    const cost = inventory.getUnlockCost?.(id) ?? 0;
    const bal = wallet.coins;
    if (bal < cost) {
      say(`Not enough coins. Need ${cost}, have ${bal}`);
      return;
    }
    const res = manager.unlockTile(id);
    if (res.success) {
      say(`Unlocked ${id}!`);
      syncFromSystems();
    } else {
      say(res.reason || `Failed to unlock ${id}`);
    }
  };

  const handleResetLayout = () => {
    if (!window.confirm("Clear all tiles from this slot?")) return;
    const c = grid.cols || 6;
    const r = grid.rows || 6;
    const current = placement.toGrid(c, r) || [];
    for (let y = 0; y < current.length; y++) {
      const row = current[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        if (row[x]) manager.removeTile(x, y);
      }
    }
    syncFromSystems();
    say("Layout cleared!");
  };

  /* ---------- Persist layout → citySlots (for CityScene) ---------- */

  useEffect(() => {
    if (!activeSlot) return;
    if (!cols || !rows) return;

    if (!hydratedRef.current || loadingSlotRef.current) {
      console.debug("[CityBuilder] persist: skipped (not hydrated yet)", {
        activeSlot,
        hydrated: hydratedRef.current,
        loading: loadingSlotRef.current,
      });
      return;
    }

    const gridArr = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => "")
    );

    for (const t of placedMap.values()) {
      if (
        Number.isFinite(t.x) &&
        Number.isFinite(t.y) &&
        t.x >= 0 &&
        t.x < cols &&
        t.y >= 0 &&
        t.y < rows
      ) {
        gridArr[t.y][t.x] = normalizeId(t.id);
      }
    }

    const sim = citySlots.loadSim(activeSlot) || {};
    const merged = {
      ...sim,
      w: cols,
      h: rows,
      grid: gridArr,
      meta: {
        ...(sim.meta || {}),
        updatedAt: Date.now(),
      },
    };

    console.debug("[CityBuilder] persist: saving layout", {
      activeSlot,
      tileCount: placedMap.size,
      w: merged.w,
      h: merged.h,
    });

    citySlots.saveSim(merged, activeSlot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedMap, activeSlot, cols, rows]);

  /* ---------- Placement / erase (ENGINE-FIRST) ---------- */

  const applyAt = (gx, gy) => {
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;
    if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return;

    const key = `${gx},${gy}`;
    const existing = placedMap.get(key);

    // Erase mode
    if (select === "erase") {
      if (!existing) return;
      const res = manager.removeTile(gx, gy);
      if (res && res.success) {
        syncFromSystems();
      }
      return;
    }

    // Locked area check
    if (!isCellUnlocked(gx, gy)) {
      say("Locked area – expand your lot in the Store");
      return;
    }

    if (!select || select === "erase") return;

    const normId = normalizeId(select);

    // Building adjacency rule
    if (BUILDINGS.has(normId)) {
      if (!hasAdjacentRoad(gx, gy, placedMap)) {
        say("Must connect to a road");
        return;
      }
    }

    // Place tile (this now handles mate coin charging)
    const res = manager.placeTile(gx, gy, normId, rot);
    
    if (!res || !res.success) {
      if (res?.reason === "insufficient_funds") {
        say(`Need ${res.cost} more coins`);
      } else if (res?.reason === "max_owned_reached") {
        say("Max reached for this tile");
      } else if (res?.reason === "not_unlocked") {
        say("Unlock this building first");
      } else if (res?.reason === "locked_area") {
        say("Locked area");
      } else if (res?.reason === "needs_road") {
        say("Must connect to a road");
      } else {
        say(res?.reason || "Cannot place here");
      }
      return;
    }

    syncFromSystems();
  };

  /* ---------- Ghost cursor ---------- */

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const onMove = (e) => {
      const p = e.touches ? e.touches[0] : e;
      const rect = el.getBoundingClientRect();
      const gx = clamp(
        Math.floor((p.clientX - rect.left) / cellSize),
        0,
        cols - 1
      );
      const gy = clamp(
        Math.floor((p.clientY - rect.top) / cellSize),
        0,
        rows - 1
      );

      const ghost = ghostRef.current;
      if (!ghost) return;
      ghost.style.left = gx * cellSize + "px";
      ghost.style.top = gy * cellSize + "px";
      ghost.style.width = cellSize + "px";
      ghost.style.height = cellSize + "px";
      ghost.style.opacity = isCellUnlocked(gx, gy) ? "0.7" : "0.3";

      // Apply placement on drag
      if (dragMode) {
        applyAt(gx, gy);
      }
    };

    const onEnter = () => {
      if (ghostRef.current) ghostRef.current.style.opacity = "0.7";
    };
    const onLeave = () => {
      if (ghostRef.current) ghostRef.current.style.opacity = "0";
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("touchmove", onMove);
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);

    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("touchmove", onMove);
      el.addEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, cellSize, dragMode, select, rot]);

  /* ---------- Mouse / Touch Interaction ---------- */

  const onMouseDown = (e) => {
    if (e.button === 2) {
      setDragMode("erase");
      return;
    }
    if (e.button !== 0) return;
    setDragMode("place");
  };

  const onMouseUp = () => {
    setDragMode(null);
  };

  // CRITICAL FIX: Handle single clicks
  const onClick = (e) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;

    const p = e.touches ? e.touches[0] : e;
    const gx = Math.floor((p.clientX - rect.left) / cellSize);
    const gy = Math.floor((p.clientY - rect.top) / cellSize);

    applyAt(gx, gy);
  };

  /* ---------- Keyboard ---------- */

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setRot((v) => (v + 90) % 360);
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setSelect("erase");
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSelect("erase");
        setRot(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- Render: auto-roundabout logic ---------- */

  const placed = useMemo(() => {
    return Array.from(placedMap.values());
  }, [placedMap]);

  const autoRoundaboutKeys = useMemo(() => {
    const out = new Set();
    const getAt = (x, y) => placedMap.get(`${x},${y}`)?.id || "";

    for (const t of placed) {
      if (!ROADLIKE.has(t.id)) continue;
      const cx = t.x;
      const cy = t.y;

      const n = ROADLIKE.has(getAt(cx, cy - 1));
      const s = ROADLIKE.has(getAt(cx, cy + 1));
      const w = ROADLIKE.has(getAt(cx - 1, cy));
      const e = ROADLIKE.has(getAt(cx + 1, cy));

      const count = [n, s, w, e].filter(Boolean).length;
      if (count >= 3 && t.id !== "roundabout") {
        out.add(`${cx},${cy}`);
      }
    }
    return out;
  }, [placed, placedMap]);

  /* ---------- UI ---------- */

  const nextUnlockCost = grid.getNextUnlockCost ? grid.getNextUnlockCost() : 0;
  const canUnlock = gridLevel < (grid.maxGridLevel ?? 3);

  return (
    <div
      className="p-4 max-w-3xl mx-auto"
      style={{
        fontFamily: "system-ui, sans-serif",
        background: dark ? "#0a0a0a" : "#fefefe",
        color: dark ? "#f9fafb" : "#111827",
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">City Builder</h1>
        <div className="flex items-center gap-2 text-sm">
          <span>🪙 {wallet.coins.toLocaleString()}</span>
          <span className="opacity-50">|</span>
          <span>💵 {fmtUSD(wallet.usd)}</span>
        </div>
      </div>

      {/* Slot selector */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm opacity-75">Slot:</span>
        <select
          value={activeSlot}
          onChange={(e) => {
            const newSlot = e.target.value;
            setActiveSlot(newSlot);
            slot.setActive(newSlot);
          }}
          className="px-2 py-1 rounded border text-sm"
          style={{
            background: dark ? "#1f2937" : "#f9fafb",
            color: dark ? "#f9fafb" : "#111827",
            borderColor: dark ? "#374151" : "#d1d5db",
          }}
        >
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleResetLayout}
          className="px-2 py-1 rounded border text-xs"
          style={{
            background: dark ? "#1f2937" : "#f9fafb",
            borderColor: dark ? "#374151" : "#d1d5db",
          }}
          title="Clear all tiles"
        >
          Reset
        </button>
      </div>

      {/* Grid unlock */}
      {canUnlock && (
        <div className="mb-3 p-3 rounded-lg border flex items-center justify-between bg-blue-50/80 dark:bg-stone-900/80 border-blue-400/60 dark:border-stone-600">
          <div>
            <div className="font-semibold text-sm">
              Unlock bigger city ({cols}×{rows} → {cols + 6}×{rows + 6})
            </div>
            <div className="text-xs opacity-70">
              Cost: {nextUnlockCost.toLocaleString()} MateCoin
            </div>
          </div>
          <button
            onClick={handleUnlockGrid}
            className="px-3 py-1.5 rounded-lg border text-sm font-medium"
            style={{
              background: dark ? "#1e40af" : "#3b82f6",
              color: "#fff",
              borderColor: dark ? "#1e3a8a" : "#2563eb",
            }}
          >
            Unlock
          </button>
        </div>
      )}

      {/* Category tabs */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-2">
        {Object.keys(categories).map((cat) => {
          const active = cat === activeCategory;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="px-3 py-1.5 rounded-lg border text-sm whitespace-nowrap"
              style={{
                background: active
                  ? dark
                    ? "#374151"
                    : "#e5e7eb"
                  : dark
                  ? "#1f2937"
                  : "#f9fafb",
                color: dark ? "#f9fafb" : "#111827",
                borderColor: active
                  ? dark
                    ? "#4b5563"
                    : "#d1d5db"
                  : dark
                  ? "#374151"
                  : "#e5e7eb",
              }}
            >
              {categories[cat].icon} {categories[cat].name}
            </button>
          );
        })}
      </div>

      {/* Tile palette */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => setSelect("erase")}
          className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2"
          style={{
            background:
              select === "erase"
                ? dark
                  ? "#7f1d1d"
                  : "#fee2e2"
                : dark
                ? "#1f2937"
                : "#f9fafb",
            borderColor:
              select === "erase"
                ? dark
                  ? "#991b1b"
                  : "#fca5a5"
                : dark
                ? "#374151"
                : "#e5e7eb",
            color: dark ? "#fff" : "#111",
          }}
        >
          🗑️ Erase
        </button>

        {activeCategoryTiles.map((tv) => {
          const { id, name, icon, color, owned, available, used, mateCost, unlockCost, unlocked } = tv;
          const active = select === id;
          return (
            <button
              key={id}
              onClick={() => {
                if (!unlocked) {
                  say(`${name} is locked. Unlock it first.`);
                  return;
                }
                setSelect(id);
              }}
              disabled={!unlocked}
              className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2"
              style={{
                background: active
                  ? dark
                    ? "#065f46"
                    : "#d1fae5"
                  : !unlocked
                  ? dark
                    ? "#1c1917"
                    : "#f5f5f4"
                  : dark
                  ? "#1f2937"
                  : "#f3f4f6",
                color: dark ? "#fff" : "#111",
                borderColor: !unlocked
                  ? dark
                    ? "#4b5563"
                    : "#d1d5db"
                  : dark
                  ? "#333"
                  : "#e5e7eb",
              }}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: color }}
              />
              {icon} {name || id}
              <span className={available > 0 ? "font-medium" : "opacity-50"}>
                ×{available}
              </span>
              {(used > 0 || owned > 0) && (
                <span className="text-xs opacity-70">
                  ({used}/{owned} used)
                </span>
              )}
              {mateCost > 0 && (
                <span className="text-xs opacity-70">· {mateCost}🪙</span>
              )}
              {!unlocked && unlockCost > 0 && (
                <span className="text-xs opacity-80">
                  · 🔒 {unlockCost.toLocaleString()} MC
                </span>
              )}
            </button>
          );
        })}

        <button
          onClick={() => setRot((v) => (v + 90) % 360)}
          className="px-2 py-1 rounded-lg border"
          title="Rotate (R)"
        >
          ↻ {rot}°
        </button>
      </div>

      {/* Unlock panel */}
      {showUnlock && (
        <div className="mb-3 p-3 rounded-lg border border-amber-400/60 bg-amber-50/80 dark:bg-stone-900/80 dark:border-stone-600">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm flex items-center gap-2">
              🔓 Unlock buildings
            </div>
            <button
              onClick={() => setShowUnlock(false)}
              className="text-xs px-2 py-1 rounded border border-transparent hover:border-stone-500"
            >
              close
            </button>
          </div>
          {lockedTiles.length === 0 ? (
            <div className="text-xs opacity-70">
              All buildings are currently unlocked.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {lockedTiles.map((tv) => (
                <button
                  key={tv.id}
                  onClick={() => handleUnlockTile(tv.id)}
                  className="px-3 py-2 rounded-lg border text-xs flex flex-col items-start gap-1"
                  style={{
                    background: dark ? "#111827" : "#f9fafb",
                    borderColor: dark ? "#4b5563" : "#e5e7eb",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span>{tv.icon}</span>
                    <span className="font-medium">{tv.name}</span>
                    <span className="opacity-70 text-[0.7rem]">
                      ({tv.categoryName})
                    </span>
                  </div>
                  <div className="opacity-80">
                    🔒 {tv.unlockCost.toLocaleString()} MC
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Board */}
      <div
        ref={wrapRef}
        className="rounded-xl border"
        style={{
          height: 420,
          maxHeight: 420,
          overflow: "hidden",
          borderColor: dark ? "#2a2a2a" : "#e7e5e4",
          background: dark ? "#0b0b0b" : "#fff",
        }}
      >
        <div
          ref={gridRef}
          onClick={onClick}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            width: cols * cellSize,
            height: rows * cellSize,
            position: "relative",
            background: `linear-gradient(#0000 ${
              cellSize - 1
            }px, ${dark ? "#222" : "#ddd"} ${cellSize}px),
               linear-gradient(90deg, #0000 ${
                 cellSize - 1
               }px, ${dark ? "#222" : "#ddd"} ${cellSize}px)`,
            backgroundSize: `${cellSize}px ${cellSize}px`,
            imageRendering: "pixelated",
          }}
        >
          {/* Locked cells */}
          {lockedCells.map((cell) => (
            <div
              key={`lock-${cell.x}-${cell.y}`}
              style={{
                position: "absolute",
                left: cell.x * cellSize,
                top: cell.y * cellSize,
                width: cellSize,
                height: cellSize,
                background: dark ? "#0b0b0b" : "#ffffff",
                pointerEvents: "none",
              }}
            />
          ))}

          {/* Unlocked bounds outline */}
          {unlockedBounds && (
            <div
              style={{
                position: "absolute",
                left: unlockedBounds.minX * cellSize,
                top: unlockedBounds.minY * cellSize,
                width: unlockedBounds.width * cellSize,
                height: unlockedBounds.height * cellSize,
                border: `2px solid ${dark ? "#fbbf24" : "#b45309"}`,
                borderRadius: 4,
                pointerEvents: "none",
                boxShadow: dark
                  ? "0 0 0 1px rgba(0,0,0,0.7) inset"
                  : "0 0 0 1px rgba(0,0,0,0.12) inset",
              }}
            />
          )}

          {/* Placed tiles */}
          {placed.map((t) => {
            const key = `${t.x},${t.y}`;
            const explicitRB = t.id === "roundabout";
            const autoRB =
              (t.id === "road" || t.id === "avenue") &&
              autoRoundaboutKeys.has(key);
            const tileInfo = ui.getTileInfo(t.id);
            const col = tileInfo.color;

            if (explicitRB) {
              const base = dark ? "#343434" : "#9aa0a6";
              const rim = dark ? "#1f2937" : "#e5e7eb";
              return (
                <div
                  key={key}
                  title="roundabout"
                  style={{
                    position: "absolute",
                    left: t.x * cellSize,
                    top: t.y * cellSize,
                    width: cellSize,
                    height: cellSize,
                    background: base,
                    border: `1px solid ${dark ? "#111" : "#fff"}`,
                    borderRadius: 4,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: cellSize * 0.2,
                      top: cellSize * 0.2,
                      width: cellSize * 0.6,
                      height: cellSize * 0.6,
                      borderRadius: "9999px",
                      background: dark ? "#15171a" : "#ffffff",
                      boxShadow: `0 0 0 ${Math.max(
                        1,
                        Math.floor(cellSize * 0.06)
                      )}px ${rim} inset`,
                      opacity: 0.95,
                    }}
                  />
                </div>
              );
            }

            return (
              <div
                key={key}
                title={t.id}
                style={{
                  position: "absolute",
                  left: t.x * cellSize,
                  top: t.y * cellSize,
                  width: cellSize,
                  height: cellSize,
                  transform: `rotate(${t.rot || 0}deg)`,
                  background: col,
                  border: `1px solid ${dark ? "#111" : "#fff"}`,
                  borderRadius: autoRB ? cellSize : 4,
                  boxShadow: autoRB
                    ? dark
                      ? "inset 0 0 0 3px #1f2937"
                      : "inset 0 0 0 3px #e5e7eb"
                    : "none",
                }}
              />
            );
          })}

          {/* Ghost cursor */}
          <div
            ref={ghostRef}
            style={{
              position: "absolute",
              border: `2px dashed ${dark ? "#86efac" : "#10b981"}`,
              borderRadius: 6,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mt-3 text-sm px-3 py-2 rounded-md border border-amber-300/70 bg-amber-50 dark:bg-stone-800 dark:border-stone-700">
          {toast}
        </div>
      )}
    </div>
  );
}