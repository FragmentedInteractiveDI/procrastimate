// FILE: src/screens/CityBuilder.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getInventory,
  consume,
  addItem,
  setInventory,
  getStarterInventory,
} from "../modules/buildInventory";
import {
  listSlots,
  getActiveSlot,
  setActiveSlot,
  loadSim,
  saveSim,
  createSlot,
  deleteSlot,
  renameSlot,
} from "../modules/citySlots";
import {
  spendMate,
  getWallet,
  fmtUSD,
  convertCoinsToUsd,
} from "../modules/wallet";

/* ---------- tileset (Start is not exposed) ---------- */
const TILESET = [
  { id: "road",       color: "#6b7280", icon: "🛣️" },
  { id: "avenue",     color: "#9ca3af", icon: "🛣️" },
  { id: "roundabout", color: "#a3a3a3", icon: "↻"  },
  { id: "house",      color: "#f59e0b", icon: "🏠" },
  { id: "home",       color: "#fdba74", icon: "🏡" },
  { id: "park",       color: "#34d399", icon: "🌳" },
  { id: "shop",       color: "#60a5fa", icon: "🏬" },
  { id: "hq",         color: "#93c5fd", icon: "🏢" },

  // new buildings
  { id: "apb",        color: "#fb7185", icon: "🚓" },
  { id: "bank",       color: "#eab308", icon: "🏦" },
  { id: "garage",     color: "#38bdf8", icon: "🚗" },
  { id: "paintshop",  color: "#f97316", icon: "🎨" },
];
const PALETTE = Object.fromEntries(
  TILESET.map((t) => [t.id, { color: t.color, icon: t.icon }])
);
const normalizeId = (id) =>
  id === "r" ? "road"
  : id === "av" ? "avenue"
  : (id === "rb" || id === "round" || id === "ra") ? "roundabout"
  : (id === "st" || id === "start") ? "home"
  : id;

/* ---------- placement rules & costs ---------- */
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

// Mate costs (per placement). Flat fee; tune as needed.
// IMPORTANT: these only apply AFTER inventory for that tile is exhausted.
const COST_MATE = {
  road:       5,
  avenue:     8,
  roundabout: 15,
  park:       6,
  // buildings like house/home/shop/hq/apb/bank/garage/paintshop are currently free in Mate
};

/* ---------- grid unlock model (for USD Store upgrades) ---------- */
// LocalStorage key controlled by Store upgrades; 0 = base 6×6, each level +1 size
const GRID_LEVEL_KEY = "pm_build_grid_level_v1";
const BASE_UNLOCK_SIZE = 6;

function getGridLevelFromStorage() {
  if (typeof window === "undefined") return 0;
  try {
    const v = Number(localStorage.getItem(GRID_LEVEL_KEY) || "0");
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.floor(v);
  } catch {
    return 0;
  }
}

/**
 * Compute the unlocked rectangle (central box) for a given grid + level.
 * Size starts at BASE_UNLOCK_SIZE × BASE_UNLOCK_SIZE and grows by 1
 * per level in both width and height, capped by the grid dimensions.
 */
function computeUnlockedBounds(cols, rows, level) {
  if (!cols || !rows) return null;
  const size = Math.max(
    1,
    Math.min(
      Math.min(cols, rows),
      BASE_UNLOCK_SIZE + Math.max(0, level | 0)
    )
  );

  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const halfW = Math.floor(size / 2);
  const halfH = Math.floor(size / 2);

  let minX = cx - halfW;
  let maxX = minX + size - 1;
  let minY = cy - halfH;
  let maxY = minY + size - 1;

  // Clamp to board
  if (minX < 0) {
    maxX -= minX;
    minX = 0;
  }
  if (maxX >= cols) {
    const diff = maxX - cols + 1;
    minX = Math.max(0, minX - diff);
    maxX = cols - 1;
  }
  if (minY < 0) {
    maxY -= minY;
    minY = 0;
  }
  if (maxY >= rows) {
    const diff = maxY - rows + 1;
    minY = Math.max(0, minY - diff);
    maxY = rows - 1;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

const CELL = 32;

/* ---------- component ---------- */
export default function CityBuilder({ dark = true }) {
  const wrapRef = useRef(null);
  const gridRef = useRef(null);
  const ghostRef = useRef(null);

  /* ---------- slot management ---------- */
  const [slots, setSlots] = useState(listSlots());
  const [activeSlot, setActive] = useState(getActiveSlot());
  const [gridData, setGridData] = useState(() => loadSim(getActiveSlot()));

  // grid unlock level (Store will bump this via localStorage + event)
  const [gridLevel, setGridLevel] = useState(() => getGridLevelFromStorage());

  // small toast
  const [toast, setToast] = useState("");
  function say(m, ms = 1600) {
    setToast(String(m));
    clearTimeout(say._t);
    say._t = setTimeout(() => setToast(""), ms);
  }

  // persist current slot’s inventory snapshot into sim.meta.inv
  function persistInvToSlot(slotId) {
    if (!slotId) return;
    const sim = loadSim(slotId);
    const inv = getInventory();
    const merged = {
      ...sim,
      meta: { ...(sim.meta || {}), inv, updatedAt: Date.now() },
    };
    saveSim(merged, slotId);
  }
  // load inventory snapshot from sim.meta.inv or seed with starter for new slots
  function loadInvFromSlot(slotId) {
    const sim = loadSim(slotId);
    const inv = sim?.meta?.inv;
    setInventory(
      inv && typeof inv === "object" ? inv : getStarterInventory()
    );
  }

  useEffect(() => {
    const reload = (e) => {
      // Slot-cap hit event from citySlots -> show a toast and bail.
      if (e && e.key === "pm_layout_slot_cap_hit_v1") {
        try {
          const payload = JSON.parse(e.newValue || "{}");
          const cap = payload.cap;
          say(
            cap
              ? `City slot limit reached (${cap} layouts).`
              : "City slot limit reached."
          );
        } catch {
          say("City slot limit reached.");
        }
        return;
      }

      setSlots(listSlots());
      const cur = getActiveSlot();
      setActive(cur);
      setGridData(loadSim(cur));
      loadInvFromSlot(cur); // keep toolbar in sync if another tab changed
      setGridLevel(getGridLevelFromStorage());
    };
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, []);

  // listen for explicit Store-level grid changes
  useEffect(() => {
    const sync = () => setGridLevel(getGridLevelFromStorage());
    window.addEventListener("pm_build_grid_changed", sync);
    return () => window.removeEventListener("pm_build_grid_changed", sync);
  }, []);

  function handleSlotChange(id) {
    // save out current grid + inventory to the old slot
    persistInvToSlot(activeSlot);
    setActiveSlot(id);
    setActive(id);

    const sim = loadSim(id);
    setGridData(sim);
    loadInvFromSlot(id);

    // refresh placed tiles for the new slot
    const nextPlaced = shouldIgnoreSeed(sim?.grid)
      ? new Map()
      : toMap(gridToTiles(sim?.grid));
    setPlacedMap(nextPlaced);
    setInv(mapInv(getInventory()));
  }

  function handleNewSlot() {
    const name = prompt("New slot ID:");
    if (!name) return;

    const ok = createSlot(name);
    if (!ok) {
      // If we hit the cap, the storage listener already showed a toast.
      // This guard just stops us from switching into a non-existent slot.
      say("Unable to create new city slot (name in use or limit reached).");
      return;
    }

    // fresh slot starts with starter inventory
    setInventory(getStarterInventory());
    setActiveSlot(name);
    setActive(name);
    const sim = loadSim(name);
    setGridData(sim);
    const nextPlaced = shouldIgnoreSeed(sim?.grid)
      ? new Map()
      : toMap(gridToTiles(sim?.grid));
    setPlacedMap(nextPlaced);
    setInv(mapInv(getInventory()));
  }

  function handleDeleteSlot() {
    if (confirm(`Delete slot '${activeSlot}'?`)) {
      persistInvToSlot(activeSlot);
      deleteSlot(activeSlot);
      const cur = getActiveSlot();
      setActive(cur);
      const sim = loadSim(cur);
      setGridData(sim);
      loadInvFromSlot(cur);
      setPlacedMap(
        shouldIgnoreSeed(sim?.grid)
          ? new Map()
          : toMap(gridToTiles(sim?.grid))
      );
      setInv(mapInv(getInventory()));
    }
  }

  function handleRenameSlot() {
    const name = prompt("Rename slot:", activeSlot);
    if (!name) return;
    renameSlot(activeSlot, name);
    setSlots(listSlots());
  }

  /* ---------- grid / map ---------- */
  const defaultCols = Math.max(
    6,
    gridData?.grid?.[0]?.length || gridData?.w || 32
  );
  const defaultRows = Math.max(
    6,
    gridData?.grid?.length || gridData?.h || 18
  );
  const seedLooksEmpty = shouldIgnoreSeed(gridData?.grid);

  const [cols] = useState(defaultCols);
  const [rows] = useState(defaultRows);

  const initialPlaced = seedLooksEmpty
    ? new Map()
    : toMap(gridToTiles(gridData?.grid));
  const [placedMap, setPlacedMap] = useState(initialPlaced);

  useEffect(() => {
    if (seedLooksEmpty) {
      saveSim(
        { w: cols, h: rows, grid: tilesToGrid([], cols, rows) },
        activeSlot
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once

  const [zoom] = useState(1);
  const [select, setSelect] = useState("erase");
  const [rot, setRot] = useState(0);
  const [dragMode, setDragMode] = useState(null);
  const [inv, setInv] = useState(() => mapInv(getInventory()));
  const cellSize = CELL * zoom;

  const tiles = useMemo(() => {
    const ids = new Set(TILESET.map((t) => t.id));
    Object.keys(inv || {}).forEach((id) => ids.add(normalizeId(id)));
    ids.delete("start");
    return ["erase", ...Array.from(ids)];
  }, [inv]);

  // unlocked region for current grid + level
  const unlockedBounds = useMemo(
    () => computeUnlockedBounds(cols, rows, gridLevel),
    [cols, rows, gridLevel]
  );

  const isCellUnlocked = (x, y) => {
    if (!unlockedBounds) return true;
    const { minX, maxX, minY, maxY } = unlockedBounds;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  };

  const lockedCells = useMemo(() => {
    if (!unlockedBounds) return [];
    const { minX, maxX, minY, maxY } = unlockedBounds;
    const out = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (x < minX || x > maxX || y < minY || y > maxY) {
          out.push({ x, y });
        }
      }
    }
    return out;
  }, [rows, cols, unlockedBounds]);

  /* ---------- persist to active slot on edits ---------- */
  useEffect(() => {
    const tilesArr = Array.from(placedMap.values());
    const w = cols,
      h = rows;
    const grid = tilesToGrid(tilesArr, w, h);
    // also persist the slot’s own inventory snapshot each time we change the board
    const sim = loadSim(activeSlot);
    saveSim(
      {
        ...sim,
        w,
        h,
        grid,
        meta: {
          ...(sim.meta || {}),
          inv: getInventory(),
          updatedAt: Date.now(),
        },
      },
      activeSlot
    );
  }, [placedMap, cols, rows, activeSlot]);

  /* ---------- pointer & ghost ---------- */
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
      ghost.style.transform = `translate(${gx * cellSize}px, ${
        gy * cellSize
      }px) rotate(${rot}deg)`;
      ghost.style.width = `${cellSize}px`;
      ghost.style.height = `${cellSize}px`;
      ghost.style.opacity = 1;
      ghost.dataset.gx = gx;
      ghost.dataset.gy = gy;

      const normSel = normalizeId(select || "");
      const invCount = inv[normSel] ?? 0;
      const haveInv = normSel && invCount > 0;
      const cost = normSel ? placementCostMate(normSel) : 0;
      const placeable = select === "erase" || haveInv || cost > 0;

      ghost.style.borderColor = placeable
        ? dark
          ? "#86efac"
          : "#10b981"
        : dark
        ? "#f87171"
        : "#dc2626";

      if (dragMode)
        applyAt(
          gx,
          gy,
          dragMode
        );
    };
    const onLeave = () =>
      ghostRef.current && (ghostRef.current.style.opacity = 0);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [rows, cols, rot, dragMode, select, inv, cellSize, dark]);

  /* ---------- keyboard hotkeys ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "r" || e.key === "R") {
        setRot((v) => (v + 90) % 360);
        e.preventDefault();
        return;
      }
      if (e.key === "Escape" || e.key === "Backspace") {
        setSelect("erase");
        e.preventDefault();
        return;
      }
      const num = "0123456789".indexOf(e.key);
      if (num >= 0) {
        const id = tiles[num] || tiles[tiles.length - 1];
        if (id && id !== "erase") setSelect(normalizeId(id));
        else setSelect("erase");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tiles]);

  /* ---------- helpers for rules ---------- */
  const keyOf = (x, y) => `${x},${y}`;
  const isRoadLike = (id) => ROADLIKE.has(normalizeId(id));
  const hasAdjacentRoad = (x, y, map = placedMap) => {
    const n = map.get(keyOf(x, y - 1));
    const s = map.get(keyOf(x, y + 1));
    const w = map.get(keyOf(x - 1, y));
    const e = map.get(keyOf(x + 1, y));
    return !![n, s, w, e].find((t) => t && isRoadLike(t.id));
  };
  const placementCostMate = (id) => COST_MATE[normalizeId(id)] || 0;

  /* ---------- place / erase (inventory first, then Mate) ---------- */
  const applyAt = (gx, gy, mode) => {
    const key = `${gx},${gy}`;
    const existing = placedMap.get(key);

    // erase
    if (mode === "erase" || select === "erase") {
      if (existing) {
        placedMap.delete(key);
        setPlacedMap(new Map(placedMap));
        addItem(normalizeId(existing.id), 1); // refund tile (never Mate)
        setInv(mapInv(getInventory()));
      }
      return;
    }

    if (!select) return;

    // grid lock: cannot place outside unlocked area
    if (!isCellUnlocked(gx, gy)) {
      say("Locked area – expand your lot in the Store");
      return;
    }

    const normId = normalizeId(select);
    const invCount = inv[normId] ?? 0;
    const haveInv = invCount > 0;
    const cost = placementCostMate(normId);

    // If there is no inventory and no Mate-cost path, you're just out of stock.
    if (!haveInv && cost <= 0) {
      say("Out of stock");
      return;
    }

    // Building adjacency rule (applies for both free and Mate-paid placements)
    if (BUILDINGS.has(normId)) {
      if (!hasAdjacentRoad(gx, gy, placedMap)) {
        say("Must connect to a road");
        return;
      }
    }

    // Inventory exhausted but this tile has a Mate cost: charge Mate.
    if (!haveInv && cost > 0) {
      const spent = spendMate(cost, {
        k: "build_place",
        tile: normId,
      });
      if (!spent?.ok) {
        const have = getWallet().coins || 0;
        say(`Need ${cost} Mate (have ${have})`);
        return;
      }
    }

    // Swap-in placement: refund previous tile to inventory (no Mate refund).
    if (existing) addItem(normalizeId(existing.id), 1);

    const next = { x: gx, y: gy, id: normId, rot };
    placedMap.set(key, next);
    setPlacedMap(new Map(placedMap));

    // Only consume inventory if we actually used inventory for this placement.
    if (haveInv) {
      consume(normId, 1);
    }

    const ni = mapInv(getInventory());
    setInv(ni);

    // If this is a purely inventory-limited tile (no Mate path) and we're out, auto-erase.
    if (!cost && (ni[normId] ?? 0) <= 0) {
      setSelect("erase");
    }
  };

  const onMouseDown = (e) => {
    if (e.button === 2) {
      setDragMode("erase");
      if (ghostRef.current)
        applyAt(
          +ghostRef.current.dataset.gx,
          +ghostRef.current.dataset.gy,
          "erase"
        );
    } else if (e.button === 0) {
      setDragMode(select === "erase" ? "erase" : "place");
      if (ghostRef.current) {
        applyAt(
          +ghostRef.current.dataset.gx,
          +ghostRef.current.dataset.gy,
          select === "erase" ? "erase" : "place"
        );
      }
    }
  };
  const onMouseUp = () => setDragMode(null);

  /* ---------- RANDOM builder (respects locked area) ---------- */
  function randomFromInventory() {
    const w = cols,
      h = rows;
    const bank = mapInv(getInventory());
    for (const t of placedMap.values()) {
      const id = normalizeId(t.id);
      bank[id] = (bank[id] ?? 0) + 1;
    }
    if (bank.r) {
      bank.road = (bank.road ?? 0) + bank.r;
      delete bank.r;
    }
    if (bank.av) {
      bank.avenue = (bank.avenue ?? 0) + bank.av;
      delete bank.av;
    }
    if (bank.st) {
      bank.home = (bank.home ?? 0) + bank.st;
      delete bank.st;
    }
    if (bank.rb) {
      bank.roundabout = (bank.roundabout ?? 0) + bank.rb;
      delete bank.rb;
    }

    reconcileInventoryTo(bank);
    const fresh = new Map();
    setPlacedMap(fresh);
    saveSim(
      { w, h, grid: tilesToGrid([], w, h) },
      activeSlot
    );

    const spend = (id, n = 1) => {
      id = normalizeId(id);
      if ((bank[id] ?? 0) < n) return false;
      bank[id] -= n;
      return true;
    };
    const put = (x, y, id) => {
      id = normalizeId(id);
      if (!isCellUnlocked(x, y)) return;
      const k = `${x},${y}`;
      const prev = fresh.get(k);
      if (prev) bank[prev.id] = (bank[prev.id] ?? 0) + 1;
      fresh.set(k, { x, y, id, rot: 0 });
    };
    const empty = (x, y) => !fresh.has(`${x},${y}`);
    const inBounds = (x, y) =>
      x >= 1 &&
      x < w - 1 &&
      y >= 1 &&
      y < h - 1 &&
      isCellUnlocked(x, y);

    let roads = bank.road ?? 0;
    let cx = Math.floor(w * 0.5),
      cy = Math.floor(h * 0.55);
    if (roads > 0) {
      const left = Math.max(1, Math.floor(w * 0.18));
      const right = Math.min(
        w - 2,
        Math.floor(w * 0.82)
      );
      for (let x = left; x <= right && roads > 0; x++) {
        if (!isCellUnlocked(x, cy)) continue;
        if (spend("road")) {
          put(x, cy, "road");
          roads--;
        }
      }
      cx = Math.floor((left + right) / 2);
      for (
        let yy = cy - 3;
        yy >= Math.max(2, cy - 6) && roads > 0;
        yy--
      ) {
        if (!isCellUnlocked(cx, yy)) continue;
        if (empty(cx, yy) && spend("road")) {
          put(cx, yy, "road");
          roads--;
        }
      }
      for (let x = left + 4; x < right - 2 && roads > 0; x += 6) {
        const len = Math.min(3, roads);
        const dir = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < len && roads > 0; i++) {
          const yy = cy + dir * (i + 1);
          if (!inBounds(x, yy)) break;
          if (empty(x, yy) && spend("road")) {
            put(x, yy, "road");
            roads--;
          }
        }
      }
    }
    if ((bank.home ?? 0) > 0) {
      const adj = [
        [cx, cy - 1],
        [cx, cy + 1],
        [cx - 1, cy],
        [cx + 1, cy],
      ].filter(
        ([x, y]) => inBounds(x, y) && empty(x, y)
      );
      if (adj.length && spend("home")) {
        const [hx, hy] = adj[(Math.random() * adj.length) | 0];
        put(hx, hy, "home");
      }
    }
    let rbs = bank.roundabout ?? 0;
    if (rbs > 0) {
      const isRoad = (x, y) => {
        const id = fresh.get(`${x},${y}`)?.id;
        return id === "road" || id === "avenue";
      };
      for (const { x, y, id } of Array.from(
        fresh.values()
      )) {
        if (!rbs) break;
        if (!(id === "road" || id === "avenue")) continue;
        const n =
          (isRoad(x, y - 1) ? 1 : 0) +
          (isRoad(x, y + 1) ? 1 : 0) +
          (isRoad(x - 1, y) ? 1 : 0) +
          (isRoad(x + 1, y) ? 1 : 0);
        if (
          n >= 3 &&
          isCellUnlocked(x, y) &&
          spend("roundabout")
        ) {
          put(x, y, "roundabout");
          rbs--;
        }
      }
    }
    const poiSlots = [
      { id: "park",  limit: bank.park  ?? 0 },
      { id: "shop",  limit: bank.shop  ?? 0 },
      { id: "hq",    limit: bank.hq    ?? 0 },
      { id: "house", limit: bank.house ?? 0 },
    ];
    const roadCoords = Array.from(fresh.values())
      .filter(
        (t) =>
          t.id === "road" ||
          t.id === "avenue" ||
          t.id === "roundabout"
      )
      .map((t) => [t.x, t.y]);
    const near = (x, y) =>
      roadCoords.some(
        ([rx, ry]) =>
          Math.abs(rx - x) + Math.abs(ry - y) === 1
      );

    for (const { id, limit } of poiSlots) {
      let placed = 0,
        attempts = 0;
      while (placed < limit && attempts < 500) {
        attempts++;
        const x =
          1 + ((Math.random() * (w - 2)) | 0);
        const y =
          1 + ((Math.random() * (h - 2)) | 0);
        if (
          inBounds(x, y) &&
          empty(x, y) &&
          near(x, y) &&
          spend(id)
        ) {
          put(x, y, id);
          placed++;
        }
      }
    }

    setPlacedMap(new Map(fresh));
    saveSim(
      { w, h, grid: tilesToGrid(Array.from(fresh.values()), w, h) },
      activeSlot
    );
    reconcileInventoryTo(bank);
    setInv(mapInv(getInventory()));
    if (
      select !== "erase" &&
      (getInventory()[select] ?? 0) <= 0
    )
      setSelect("erase");
  }

  function reconcileInventoryTo(targetBank) {
    const cur = mapInv(getInventory());
    const keys = new Set([
      ...Object.keys(cur),
      ...Object.keys(targetBank),
    ]);
    for (const k of keys) {
      const want = targetBank[k] ?? 0;
      const have = cur[k] ?? 0;
      if (want > have) addItem(k, want - have);
      else if (have > want) consume(k, have - want);
    }
  }

  /* ---------- UI ---------- */
  const placed = Array.from(placedMap.values());
  const autoRoundaboutKeys = useMemo(() => {
    const drivable = new Set(
      placed
        .filter(
          (t) =>
            t.id === "road" ||
            t.id === "avenue" ||
            t.id === "roundabout"
        )
        .map((t) => `${t.x},${t.y}`)
    );
    const res = new Set();
    for (const t of placed) {
      if (!(t.id === "road" || t.id === "avenue")) continue;
      const n =
        (drivable.has(`${t.x},${t.y - 1}`) ? 1 : 0) +
        (drivable.has(`${t.x},${t.y + 1}`) ? 1 : 0) +
        (drivable.has(`${t.x - 1},${t.y}`) ? 1 : 0) +
        (drivable.has(`${t.x + 1},${t.y}`) ? 1 : 0);
      if (n >= 3) res.add(`${t.x},${t.y}`);
    }
    return res;
  }, [placedMap]);

  const wallet = getWallet();

  return (
    <div className="p-4 select-none">
      {/* Slot controls */}
      <div className="flex items-center gap-2 mb-4">
        <select
          value={activeSlot}
          onChange={(e) => handleSlotChange(e.target.value)}
          className="border rounded-md px-2 py-1 bg-gray-800 text-white"
        >
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.id}
            </option>
          ))}
        </select>
        <button
          onClick={handleNewSlot}
          className="px-2 py-1 border rounded-md"
        >
          + New
        </button>
        <button
          onClick={handleRenameSlot}
          className="px-2 py-1 border rounded-md"
        >
          Rename
        </button>
        <button
          onClick={handleDeleteSlot}
          className="px-2 py-1 border rounded-md"
        >
          Delete
        </button>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm opacity-80">
            Mate:{" "}
            <b className="tabular-nums">
              {wallet.coins?.toLocaleString?.() ?? 0}
            </b>{" "}
            <span className="text-xs opacity-70">
              ({fmtUSD(convertCoinsToUsd(wallet.coins || 0))})
            </span>
          </div>
          <button
            onClick={randomFromInventory}
            className="px-3 py-1 rounded-lg border"
            title="Refund board → randomize using only what you own"
          >
            🎲 Random
          </button>
          <div className="text-xs opacity-70 hidden sm:block">
            Hotkeys: 0-9 select, R rotate, Esc erase, RMB erase-drag
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {tiles.map((rawId, i) => {
          const id = normalizeId(rawId);
          const count = id === "erase" ? null : inv[id] ?? 0;
          // If tile has Mate cost, it's never fully disabled: you can build with Mate after inv = 0
          const disabled =
            id !== "erase" && count <= 0 && placementCostMate(id) <= 0;
          const selected = select === id;
          const swatch =
            id === "erase"
              ? "#0000"
              : PALETTE[id]?.color || colorFromId(id);
          const mateCost = placementCostMate(id);
          return (
            <button
              key={rawId}
              onClick={() => !disabled && setSelect(id)}
              disabled={disabled}
              className="px-2 py-1 rounded-lg border flex items-center gap-2"
              title={i < 10 ? `Hotkey: ${i}` : ""}
              style={{
                opacity: disabled ? 0.5 : 1,
                background: selected
                  ? dark
                    ? "#1f2937"
                    : "#fde68a"
                  : dark
                  ? "#151515"
                  : "#f3f4f6",
                color: dark ? "#fff" : "#111",
                borderColor: dark ? "#333" : "#e5e7eb",
              }}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: swatch }}
              />
              {id === "erase"
                ? `erase${i < 10 ? ` [${i}]` : ""}`
                : `${id} ×${count}${
                    i < 10 ? ` [${i}]` : ""
                  }${mateCost ? ` · ${mateCost}🪙` : ""}`}
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

      {/* Board */}
      <div
        ref={wrapRef}
        className="rounded-xl border"
        style={{
          height: 420,
          maxHeight: 420,
          overflow: "hidden", // clip grid so it never overlaps footer
          borderColor: dark ? "#2a2a2a" : "#e7e5e4",
          background: dark ? "#0b0b0b" : "#fff",
        }}
      >
        <div
          ref={gridRef}
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
          {/* Locked area overlay (clipped by wrapper so it can't bleed) */}
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

          {Array.from(placedMap.values()).map((t) => {
            const key = `${t.x},${t.y}`;
            const explicitRB = t.id === "roundabout";
            const autoRB =
              (t.id === "road" || t.id === "avenue") &&
              autoRoundaboutKeys.has(key);
            const col =
              PALETTE[t.id]?.color || colorFromId(t.id);

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
                    border: `1px solid ${
                      dark ? "#111" : "#fff"
                    }`,
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
                      background: dark
                        ? "#15171a"
                        : "#ffffff",
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
                  border: `1px solid ${
                    dark ? "#111" : "#fff"
                  }`,
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
          <div
            ref={ghostRef}
            style={{
              position: "absolute",
              border: `2px dashed ${
                dark ? "#86efac" : "#10b981"
              }`,
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

/* ---------- helpers ---------- */
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function mapInv(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const id = normalizeId(k);
    out[id] = (out[id] ?? 0) + (v | 0);
  }
  return out;
}
function colorFromId(id = "") {
  let h = 0;
  for (let i = 0; i < id.length; i++)
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const r = 120 + (h & 0x3f),
    g = 120 + ((h >> 6) & 0x3f),
    b = 120 + ((h >> 12) & 0x3f);
  return `rgb(${r},${g},${b})`;
}
function tilesToGrid(tiles, w, h) {
  const grid = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => "")
  );
  for (const t of tiles || []) {
    const x = t.x | 0,
      y = t.y | 0;
    if (y >= 0 && y < h && x >= 0 && x < w)
      grid[y][x] = normalizeId(t.id);
  }
  return grid;
}
function gridToTiles(grid) {
  const out = [];
  if (!Array.isArray(grid)) return out;
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++)
      if (grid[y][x])
        out.push({
          x,
          y,
          id: normalizeId(grid[y][x]),
          rot: 0,
        });
  return out;
}
function toMap(tiles) {
  const m = new Map();
  (tiles || []).forEach((t) => {
    if (
      Number.isFinite(t.x) &&
      Number.isFinite(t.y) &&
      t.id
    ) {
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
/** Ignore tiny “seed” maps. */
function shouldIgnoreSeed(grid) {
  if (!Array.isArray(grid) || grid.length === 0) return true;
  let total = 0,
    roads = 0,
    homes = 0,
    poi = 0;
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y] || [];
    for (let x = 0; x < row.length; x++) {
      const id = normalizeId(row[x]);
      if (!id) continue;
      total++;
      if (
        id === "road" ||
        id === "avenue" ||
        id === "roundabout"
      )
        roads++;
      else if (id === "home") homes++;
      else poi++;
    }
  }
  return total <= 24 && roads <= 16 && homes <= 1 && poi === 0;
}
