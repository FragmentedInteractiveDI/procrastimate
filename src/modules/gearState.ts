import { APB_TIME_BONUS_CAP, GEAR_CITY_CAP } from "./gearCaps";
import type { GearItem } from "./gearCatalog"; // you created this
import * as catalogMod from "./gearCatalog";   // must export an array or getter

// Storage
const KEY = "pm_gear_v1";
type ModeKey = "global" | "parkour" | "farm" | "theme_park" | "city_defense";
type SlotKey = "head" | "suit" | "boots" | "accessory";

export type Loadout = Partial<Record<SlotKey, string>>;

export type GearState = {
  owned: Record<string, true>;
  loadout: Record<ModeKey, Loadout>;
};

const DEFAULT_STATE: GearState = {
  owned: {},
  loadout: {
    global: {},
    parkour: {},
    farm: {},
    theme_park: {},
    city_defense: {},
  },
};

function read(): GearState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_STATE };
    return {
      owned: raw.owned || {},
      loadout: { ...DEFAULT_STATE.loadout, ...(raw.loadout || {}) },
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}
function write(s: GearState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}
function emit() {
  try {
    const ev = new Event("gear:change");
    window.dispatchEvent(ev);
  } catch {}
}

let STATE = read();

/** Public API */

export function getGearState(): GearState {
  return JSON.parse(JSON.stringify(STATE));
}

export function resetGear() {
  STATE = { ...DEFAULT_STATE };
  write(STATE);
  emit();
}

export function isGearOwned(id: string): boolean {
  return !!STATE.owned[id];
}

export function addOwned(id: string) {
  STATE.owned[id] = true;
  write(STATE);
  emit();
}

export function removeOwned(id: string) {
  delete STATE.owned[id];
  // also unequip from all loadouts
  (Object.keys(STATE.loadout) as ModeKey[]).forEach((mk) => {
    const l = STATE.loadout[mk];
    (["head","suit","boots","accessory"] as SlotKey[]).forEach((slot) => {
      if (l[slot] === id) l[slot] = undefined;
    });
  });
  write(STATE);
  emit();
}

export function equip(mode: ModeKey, slot: SlotKey, id: string | null) {
  const l = STATE.loadout[mode] || (STATE.loadout[mode] = {});
  l[slot] = id || undefined;
  write(STATE);
  emit();
}

/** Catalog helpers */
function getItem(id: string): GearItem | undefined {
  const list: GearItem[] =
    (catalogMod as any).getCatalog?.() ??
    (catalogMod as any).catalog ??
    [];
  return list.find((x: GearItem) => x.id === id);
}

/** Derived modifiers (clamped), for a mode + global. */
export type DerivedMods = {
  // city passive
  passive_city_pct: number;      // final gear contribution (0..GEAR_CITY_CAP)
  // APB
  apb_coin_gain_pct: number;     // clamp elsewhere if needed
  apb_time_bonus_sec: number;    // 0..APB_TIME_BONUS_CAP
  // Parkour
  double_jump?: boolean;
  parkour_speed_pct?: number;
  // Farm
  crop_yield_pct?: number;
  harvest_speed_pct?: number;
  // Theme Park
  ticket_price_pct?: number;
  ride_maint_cost_pct?: number;
};

const SUM_KEYS: (keyof DerivedMods)[] = [
  "passive_city_pct",
  "apb_coin_gain_pct",
  "parkour_speed_pct",
  "crop_yield_pct",
  "harvest_speed_pct",
  "ticket_price_pct",
  "ride_maint_cost_pct",
];

function addMods(dst: DerivedMods, src: any) {
  if (!src) return;
  for (const k of SUM_KEYS) {
    if (typeof src[k] === "number") {
      (dst as any)[k] = ((dst as any)[k] || 0) + (src[k] as number);
    }
  }
  if (src.double_jump) dst.double_jump = true;
  if (typeof src.apb_time_bonus_sec === "number") {
    dst.apb_time_bonus_sec = Math.min(
      APB_TIME_BONUS_CAP,
      (dst.apb_time_bonus_sec || 0) + src.apb_time_bonus_sec
    );
  }
}

export function getActiveMods(mode: ModeKey): DerivedMods {
  const out: DerivedMods = {
    passive_city_pct: 0,
    apb_coin_gain_pct: 0,
    apb_time_bonus_sec: 0,
  };

  const applyLoadout = (l?: Loadout) => {
    if (!l) return;
    (Object.values(l).filter(Boolean) as string[]).forEach((id) => {
      const it = getItem(id);
      if (!it || it.type !== "gear") return;
      addMods(out, it.mods);
      // simple set bonus handling (optional in your catalog)
      if (it.set?.tag && it.set?.piecesRequired) {
        // count pieces in this loadout with same tag
        const count = (Object.values(l) as string[]).filter((sid) => {
          const sit = getItem(sid || "");
          return sit?.set?.tag === it.set!.tag;
        }).length;
        if (count >= it.set.piecesRequired) addMods(out, it.set.bonus);
      }
    });
  };

  applyLoadout(STATE.loadout.global);
  applyLoadout(STATE.loadout[mode]);

  // clamp city passive gear contribution
  out.passive_city_pct = Math.min(GEAR_CITY_CAP, Math.max(0, out.passive_city_pct || 0));

  // clamp APB time bonus (already clamped in addMods), ensure non-negative numbers
  out.apb_coin_gain_pct = Math.max(0, out.apb_coin_gain_pct || 0);
  out.apb_time_bonus_sec = Math.max(0, out.apb_time_bonus_sec || 0);

  return out;
}

/** Small utility for UIs */
export function getEquipped(mode: ModeKey): Loadout {
  return { ...(STATE.loadout[mode] || {}) };
}
