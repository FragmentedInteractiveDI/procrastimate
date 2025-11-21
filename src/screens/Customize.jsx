// FILE: src/screens/Customize.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAvatar } from "../context/AvatarContext";
import { listCatalog, isOwned } from "../modules/store";

const DEV_UNLOCK_KEY = "pm_unlocks_v1";
const AVATAR_PERSIST_KEY = "pm_avatar_v1";

/* ---------- tiny dev unlock store (fallback only) ---------- */
function readDevUnlocks() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEV_UNLOCK_KEY) || "null") || {};
    return {
      hats: new Set(Array.isArray(raw.hats) ? raw.hats : []),
      skins: new Set(Array.isArray(raw.skins) ? raw.skins : []),
    };
  } catch {
    return { hats: new Set(), skins: new Set() };
  }
}
function writeDevUnlocks(u) {
  try {
    localStorage.setItem(
      DEV_UNLOCK_KEY,
      JSON.stringify({ hats: [...u.hats], skins: [...u.skins] })
    );
  } catch {}
}

/* ---------- helpers ---------- */
function catalogByKind() {
  const all = listCatalog();
  const hats = all.filter((i) => i.id.startsWith("hat_"));
  const skins = all.filter((i) => i.id.startsWith("skin_"));
  return { hats, skins };
}

function Pill({ children, selected, locked, onClick }) {
  const base =
    "min-w-[76px] justify-center px-3 py-1.5 rounded-md text-sm border font-medium transition-colors";
  const unlocked =
    "bg-stone-100 text-stone-900 border-stone-400 hover:bg-stone-200 " +
    "dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600 dark:hover:bg-stone-700";
  const selectedCls =
    "bg-amber-500 text-black border-amber-600 hover:brightness-110";
  const lockedCls =
    "bg-stone-300 text-stone-700 border-stone-500 cursor-not-allowed " +
    "dark:bg-stone-800/60 dark:text-stone-400 dark:border-stone-700";

  const cls = locked
    ? `${base} ${lockedCls}`
    : selected
    ? `${base} ${selectedCls}`
    : `${base} ${unlocked}`;

  return (
    <button
      type="button"
      className={cls}
      disabled={locked}
      aria-selected={!!selected}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ---------- preview image loader (tolerant) ---------- */
const IMG_CACHE = new Map();
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (IMG_CACHE.has(src)) return IMG_CACHE.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // tolerate missing art
    img.src = src;
  });
  IMG_CACHE.set(src, p);
  return p;
}

// map item id -> filename without prefix, e.g. "hat_cap" -> "cap"
const stripPrefix = (id, prefix) => (id?.startsWith(prefix) ? id.slice(prefix.length) : id);

/* ---------- screen ---------- */
export default function Customize() {
  const { equipped, equipHat, equipSkin } = useAvatar();
  const cats = useMemo(catalogByKind, []);
  const [tab, setTab] = useState("hats"); // hats | skins

  // fallback dev unlocks
  const [devUnlocks, setDevUnlocks] = useState(() => readDevUnlocks());
  // force a refresh when store ownership changes
  const [tick, setTick] = useState(0);

  // ensure default skin visible (fallback)
  useEffect(() => {
    if (!isOwned("skin_classic") && !devUnlocks.skins.has("skin_classic")) {
      const next = { hats: new Set(devUnlocks.hats), skins: new Set(devUnlocks.skins) };
      next.skins.add("skin_classic");
      setDevUnlocks(next);
      writeDevUnlocks(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // listen for store changes
  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener("store:owned", refresh);
    window.addEventListener("store:purchase", refresh);
    return () => {
      window.removeEventListener("store:owned", refresh);
      window.removeEventListener("store:purchase", refresh);
    };
  }, []);

  // local persistence for equipped (non-invasive: mirrors context)
  useEffect(() => {
    try {
      if (equipped) localStorage.setItem(AVATAR_PERSIST_KEY, JSON.stringify(equipped));
    } catch {}
  }, [equipped?.hat, equipped?.skin]);

  function devUnlock(kind, id) {
    const next = { hats: new Set(devUnlocks.hats), skins: new Set(devUnlocks.skins) };
    next[kind].add(id);
    setDevUnlocks(next);
    writeDevUnlocks(next);
    setTick((n) => n + 1);
  }

  function isUnlocked(kind, id) {
    return isOwned(id) || (kind === "hats" ? devUnlocks.hats.has(id) : devUnlocks.skins.has(id));
  }

  function labelFor(item) {
    return item.name || item.id.replaceAll("_", " ");
  }

  /* ---------- canvas preview ---------- */
  const canvasRef = useRef(null);
  const SIZE = 160;

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, SIZE, SIZE);

      const isDark = document.documentElement.classList.contains("dark");
      ctx.fillStyle = isDark ? "#111316" : "#f6f6f6";
      ctx.fillRect(0, 0, SIZE, SIZE);

      const baseSrc = "assets/avatar/base.png";
      const skinName = stripPrefix(equipped?.skin ?? "skin_classic", "skin_");
      const hatName  = stripPrefix(equipped?.hat ?? "", "hat_");
      const skinSrc  = equipped?.skin ? `assets/avatar/skins/${skinName}.png` : null;
      const hatSrc   = equipped?.hat  ? `assets/avatar/hats/${hatName}.png`  : null;

      const [skinImg, baseImg, hatImg] = await Promise.all([
        loadImage(skinSrc), loadImage(baseSrc), loadImage(hatSrc)
      ]);
      if (cancelled) return;

      const drawImg = (img) => {
        if (!img) return;
        const scale = Math.min(SIZE / img.width, SIZE / img.height);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);
        const x = Math.floor((SIZE - w) / 2);
        const y = Math.floor((SIZE - h) / 2);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x, y, w, h);
      };

      if (skinImg) drawImg(skinImg);
      else { ctx.fillStyle = "#94a3b8"; ctx.fillRect(0, SIZE - 36, SIZE, 36); }

      if (baseImg) drawImg(baseImg);
      else { ctx.fillStyle = "#1f2937"; ctx.fillRect(24, 24, SIZE - 48, SIZE - 48); }

      if (hatImg) drawImg(hatImg);
      else if (equipped?.hat) { ctx.fillStyle = "#f59e0b"; ctx.fillRect(0, 0, SIZE, 10); }

      ctx.strokeStyle = isDark ? "#384252" : "#d1d5db";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
    }

    draw();
    return () => { cancelled = true; };
  }, [equipped?.hat, equipped?.skin, tick]);

  return (
    <div className="p-4 lg:p-6 text-stone-900 dark:text-stone-100" data-tick={tick}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span role="img" aria-label="customize">🎨</span>
          <span className="text-stone-900 dark:text-stone-100">Customize</span>
        </h1>

        <div className="flex gap-2" role="tablist" aria-label="Customize tabs">
          {["hats", "skins"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${
                tab === t
                  ? "bg-amber-300 hover:bg-amber-400 text-black border-amber-500"
                  : "bg-stone-200 text-stone-900 border-stone-400 hover:bg-stone-300 " +
                    "dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600 dark:hover:bg-stone-700"
              }`}
              aria-pressed={tab === t}
              role="tab"
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Preview */}
        <section className="panel p-4 rounded-xl shadow-sm">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-2">Preview</div>

          <div className="rounded-md border border-stone-400 dark:border-stone-700 p-3 text-sm flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={160}
              height={160}
              style={{ width: 160, height: 160, imageRendering: "pixelated", borderRadius: 8 }}
              aria-label="Avatar preview"
            />
          </div>

          <div className="mt-2 rounded-md border border-stone-400 dark:border-stone-700 p-3 text-sm">
            <div className="font-semibold text-stone-900 dark:text-stone-100">Equipped</div>
            <div className="mt-1 text-xs">
              <span className="text-stone-900 dark:text-stone-100">
                Hat: <b>{equipped?.hat ?? "none"}</b>
              </span>
              <span className="ml-3 text-stone-900 dark:text-stone-100">
                Skin: <b>{equipped?.skin ?? "none"}</b>
              </span>
            </div>
          </div>
        </section>

        {/* Loadout */}
        <section className="panel p-4 rounded-xl shadow-sm">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-2">Loadout</div>

          {/* Hats */}
          <div className="rounded-xl border border-stone-400 dark:border-stone-700 p-3 mb-3">
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">Hats</div>
            <div className="text-xs mt-0.5 mb-2 text-stone-800 dark:text-stone-300">
              Unlock in Store. Tap to equip.
            </div>

            <div className="flex flex-wrap gap-2">
              {(tab === "hats" ? cats.hats : []).map((h) => {
                const unlocked = isUnlocked("hats", h.id);
                const selected = equipped?.hat === h.id;
                return (
                  <div key={h.id} className="flex items-center gap-2">
                    <Pill
                      selected={selected}
                      locked={!unlocked}
                      onClick={() => unlocked && equipHat(h.id)}
                    >
                      {labelFor(h)}
                    </Pill>

                    {!unlocked && (
                      <button
                        type="button"
                        onClick={() => devUnlock("hats", h.id)}
                        className="px-2 py-1 text-xs rounded-md border
                                   border-stone-400 text-stone-900 bg-stone-200 hover:bg-stone-300
                                   dark:border-stone-600 dark:text-stone-100 dark:bg-stone-800 dark:hover:bg-stone-700"
                        title="Dev unlock (temporary)"
                      >
                        Unlock
                      </button>
                    )}
                  </div>
                );
              })}

              {tab === "hats" && (
                <Pill selected={!equipped?.hat} locked={false} onClick={() => equipHat(null)}>
                  none
                </Pill>
              )}
            </div>
          </div>

          {/* Skins */}
          <div className="rounded-xl border border-stone-400 dark:border-stone-700 p-3">
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">Skins</div>
            <div className="text-xs mt-0.5 mb-2 text-stone-800 dark:text-stone-300">
              Unlock in Store. Tap to equip.
            </div>

            <div className="flex flex-wrap gap-2">
              {(tab === "skins" ? cats.skins : []).map((s) => {
                const unlocked = isUnlocked("skins", s.id);
                const selected = equipped?.skin === s.id;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    <Pill
                      selected={selected}
                      locked={!unlocked}
                      onClick={() => unlocked && equipSkin(s.id)}
                    >
                      {labelFor(s)}
                    </Pill>

                    {!unlocked && (
                      <button
                        type="button"
                        onClick={() => devUnlock("skins", s.id)}
                        className="px-2 py-1 text-xs rounded-md border
                                   border-stone-400 text-stone-900 bg-stone-200 hover:bg-stone-300
                                   dark:border-stone-600 dark:text-stone-100 dark:bg-stone-800 dark:hover:bg-stone-700"
                        title="Dev unlock (temporary)"
                      >
                        Unlock
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 text-xs text-stone-800 dark:text-stone-300">
            GearGrid placeholder. Drag-and-drop slots will appear here.
          </div>
        </section>
      </div>
    </div>
  );
}
