// FILE: src/modules/subscription.js
// Minimal, safe membership stub with change notifications and a window global.
// Keep the same API if you later swap in a real backend.

const KEY = "pm_is_subscriber_v1";

// --- tiny event bus ---
const listeners = new Set();
function emit(status) {
  for (const fn of [...listeners]) {
    try { fn(status); } catch {}
  }
  try { window.dispatchEvent(new Event("pm:membership")); } catch {}
}

/** Return true if user is a subscriber. */
export function isSubscriber() {
  try { return !!JSON.parse(localStorage.getItem(KEY) || "false"); }
  catch { return false; }
}

/** Alias used by some modules (treats “active” == subscribed). */
export function isActive() {
  return isSubscriber();
}

/** Toggle/assign subscriber flag. */
export function setSubscriber(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(!!v));
    emit({ isSubscriber: !!v, isActive: !!v });
  } catch {}
}

/** Listen for membership changes. Returns an unsubscribe fn. */
export function onChange(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Cross-tab sync
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) emit({ isSubscriber: isSubscriber(), isActive: isSubscriber() });
  });
}

// Optional global shim for modules that probe window.__pmMembership
try {
  if (typeof window !== "undefined") {
    window.__pmMembership = {
      isSubscribed: () => isSubscriber(),
      isActive: () => isActive(),
      onChange,
    };
  }
} catch {}
