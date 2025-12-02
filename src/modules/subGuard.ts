// src/modules/subGuard.ts
export type Entitlement = {
  isActive: boolean;
  tier: 'free' | 'plus';
  expiresAt: number;     // ms epoch
  graceUntil?: number;   // ms epoch
};

type Listener = (e: Entitlement) => void;

let cached: Entitlement = { isActive: false, tier: 'free', expiresAt: 0 };
const LS_KEY = 'pm_sub_entitlement_v1';
const TTL_MS = 10 * 60 * 1000; // 10 min cache

function readLS(): Entitlement | null {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
}
function writeLS(e: Entitlement) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(e)); } catch {}
}

export function isSubscriber(): boolean { return cached.isActive && cached.tier !== 'free'; }
export function tier(): Entitlement['tier'] { return cached.tier; }

const listeners = new Set<Listener>();
export function onChange(fn: Listener){ listeners.add(fn); return ()=>listeners.delete(fn); }
function emit(){ for (const f of listeners) f(cached); }

export async function refreshEntitlement() {
  // Try network first
  try {
    const r = await fetch('/api/entitlement', { credentials: 'include' });
    if (r.ok) {
      const e = await r.json() as Entitlement;
      cached = e; writeLS(e); emit(); return cached;
    }
  } catch {}
  // Fallback: cached value if within TTL or grace
  const ls = readLS();
  if (ls) cached = ls;
  emit();
  return cached;
}

// Initialization
export async function initEntitlement() {
  // Use LS immediately for UX, then refresh in background
  const ls = readLS(); if (ls) { cached = ls; emit(); }
  refreshEntitlement();
}
