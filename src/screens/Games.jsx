import React from "react";

const ZONES = [
  { key: "city",    label: "City",          emoji: "🏙️", enabled: true,  hint: "Drive, reveal map, stack boosts" },
  { key: "home",    label: "Home",          emoji: "🏡", enabled: true,  hint: "Place businesses for passive bonus" },
  { key: "parkour", label: "Parkour",       emoji: "🏃‍♂️", enabled: true,  hint: "Prototype side-runner" },
  { key: "park",    label: "Theme Park",    emoji: "🎢", enabled: false, hint: "Mini-rides and quests" },
  { key: "defense", label: "Tower Defense", emoji: "🛡️", enabled: false, hint: "Prototype lane demo" },
  { key: "space",   label: "Space",         emoji: "🚀", enabled: false, hint: "Asteroids + cargo runs" },
  { key: "farm",    label: "Farm",          emoji: "🌾", enabled: false, hint: "Crops and crafting loop" },
];

export default function Games({ setTab, dark = true, onToast = (m) => console.log(m) }) {
  const canNavigate = typeof setTab === "function";

  function go(label, enabled) {
    if (!enabled) { onToast?.("Coming soon"); return; }
    if (canNavigate) setTab(label);
    else {
      onToast?.(`Open “${label}” from the header tabs`);
      console.log(`[Games] No setTab provided. Open "${label}" via header.`);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Jump Zones</h2>
      <p className="text-sm opacity-80 mb-4">Arcade hub and mission launchpad. Pick a zone to explore.</p>

      {!canNavigate && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg border border-amber-300/70 bg-amber-50 text-slate-800 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600">
          Tip: header tabs control navigation. Pass <code>setTab</code> to this screen to enable direct jumps.
        </div>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {ZONES.map((z) => (
          <button
            key={z.key}
            onClick={() => go(z.label, z.enabled)}
            disabled={!z.enabled && !canNavigate}
            title={z.hint}
            className={`p-3 rounded-xl border text-left transition-colors flex items-center gap-3
              ${z.enabled
                ? "bg-amber-200 hover:bg-amber-300 text-black border-amber-300"
                : "bg-white text-black border dark:bg-neutral-800 dark:text-white dark:border-neutral-700 opacity-60 cursor-not-allowed"}`}
            aria-disabled={!z.enabled}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{z.emoji}</span>
            <div className="min-w-0">
              <div className="font-semibold">{z.label}</div>
              <div className="text-xs opacity-75 truncate">{z.hint}</div>
            </div>
            {!z.enabled && (
              <span className="ml-auto text-[11px] px-2 py-0.5 rounded border border-stone-300 dark:border-stone-600 opacity-80">soon</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
