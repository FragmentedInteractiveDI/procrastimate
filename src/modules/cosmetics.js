// FILE: src/modules/cosmetics.js
// Lightweight cosmetics catalog + helpers.

// — Hats —
export const HATS = [
  { id: null,        name: "—",         emoji: ""   }, // none
  { id: "hat_crown", name: "Crown",     emoji: "👑" },
  { id: "hat_cap",   name: "Cap",       emoji: "🧢" },
  { id: "hat_party", name: "Party Hat", emoji: "🥳" },
];

// — Skins —
// Include `skin_classic` to match Store item ids.
export const SKINS = [
  { id: "default",      name: "Default",  emoji: "🧍"  },
  { id: "skin_classic", name: "Classic",  emoji: "🙂"  },
  { id: "blonde",       name: "Blonde",   emoji: "🧍‍♀️" },
  { id: "dark",         name: "Dark",     emoji: "🧍🏽" },
  { id: "zombie",       name: "Zombie",   emoji: "🧟"  },
];

// ---- O(1) lookups ----
const hatMap  = new Map(HATS.map(h => [h.id, h]));
const skinMap = new Map(SKINS.map(s => [s.id, s]));

export function isValidHat(id)  { return id === null || hatMap.has(id); }
export function isValidSkin(id) { return skinMap.has(id); }

export function resolveHatName(id)  { return id === null ? "—" : (hatMap.get(id)?.name ?? "—"); }
export function resolveSkinName(id) { return skinMap.get(id)?.name ?? "—"; }

export function hatEmoji(id)  { return id === null ? "" : (hatMap.get(id)?.emoji ?? "🎩"); }
export function skinEmoji(id) { return skinMap.get(id)?.emoji ?? "🙂"; }

// ---- Getter used by UI (ids + emojis; label optional) ----
export function getCosmetics() {
  return {
    hats:  HATS.map(({ id, emoji, name }) => ({ id, emoji, label: name })),
    skins: SKINS.map(({ id, emoji, name }) => ({ id, emoji, label: name })),
  };
}

// Optional: full catalog
export function getCatalog() {
  return { hats: HATS.slice(), skins: SKINS.slice() };
}

// Optional: normalize equipped payload
export function normalizeEquipped(e = {}) {
  const hat  = isValidHat(e.hat ?? null) ? (e.hat ?? null) : null;
  const skin = isValidSkin(e.skin ?? "default") ? e.skin : "default";
  return { hat, skin };
}
