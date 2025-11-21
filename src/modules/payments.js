// FILE: src/modules/payments.js
// Client-side payments bridge: talks to your local server (or mocks in dev).
// Exposes: createCheckoutSession, refreshEntitlements, openBillingPortal.

const API = (import.meta.env.VITE_API_BASE || "http://localhost:8787").replace(/\/+$/,"");
const USE_MOCK =
  (import.meta.env.VITE_PAYMENTS_MOCK === "1") ||
  (import.meta.env.DEV && /localhost|127\.0\.0\.1/.test(API) && !import.meta.env.VITE_STRIPE_PRICE_SUB_LITE);

/* ---------------- helpers ---------------- */
function withTimeout(promise, ms = 10000) {
  let t;
  const timeout = new Promise((_, rej) => (t = setTimeout(() => rej(new Error("timeout")), ms)));
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}
function redirect(url) {
  try { window.location.assign(url); } catch { window.location.href = url; }
}
async function req(path, opts = {}) {
  const url = `${API}${path}`;
  const r = await withTimeout(fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  }));
  if (!r.ok) {
    const text = await r.text().catch(()=>"");
    throw new Error(`HTTP ${r.status} ${text || ""}`.trim());
  }
  // Some endpoints may be 204 No Content
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return {};
  return r.json();
}

/* ---------------- dev mock ---------------- */
function mockSaveCheckout(payload) {
  try { sessionStorage.setItem("pm_mock_checkout", JSON.stringify({ ...payload, at: Date.now() })); } catch {}
}
function mockReadCheckout() {
  try {
    const raw = sessionStorage.getItem("pm_mock_checkout");
    if (!raw) return null;
    const v = JSON.parse(raw);
    // expire after 10 minutes
    if ((Date.now() - (v.at || 0)) > 10 * 60 * 1000) {
      sessionStorage.removeItem("pm_mock_checkout");
      return null;
    }
    return v;
  } catch { return null; }
}
function mockClearCheckout() {
  try { sessionStorage.removeItem("pm_mock_checkout"); } catch {}
}

/* ---------------- API ---------------- */
/**
 * Starts a checkout flow.
 * @param {{type:"sub"|"one_time", priceId:string, metadata?:object}} opts
 */
export async function createCheckoutSession({ type, priceId, metadata = {} }) {
  if (USE_MOCK) {
    // Record the intent so "Restore Purchases" can grant it.
    mockSaveCheckout({ type, priceId, metadata });
    // Pretend Stripe redirect succeeded
    redirect("#/shop?ok=1&mock=1");
    return { ok: true, url: "#/shop?ok=1&mock=1", mock: true };
  }

  const body = JSON.stringify({ type, priceId, metadata });
  const { url } = await req("/api/checkout", { method: "POST", body });
  if (url) redirect(url);
  return { ok: true, url: url || null };
}

/** Opens the billing portal (manage subscription). */
export async function openBillingPortal() {
  if (USE_MOCK) {
    redirect("#/shop?portal=1&mock=1");
    return { ok: true, url: "#/shop?portal=1&mock=1", mock: true };
  }
  const { url } = await req("/api/portal", { method: "POST" });
  if (url) redirect(url);
  return { ok: true, url: url || null };
}

/**
 * Asks the server for the latest receipts → returns an entitlement patch.
 * In mock mode, transforms the last mock checkout into a patch compatible
 * with src/modules/entitlements.js::applyReceiptPatch().
 */
export async function refreshEntitlements() {
  if (USE_MOCK) {
    const pending = mockReadCheckout();
    if (!pending) {
      // nothing to grant; still return a valid empty patch
      return { subs:{}, coinPacks:{}, coins: undefined };
    }

    let patch = { subs: {}, coinPacks: {} };

    if (pending.type === "sub") {
      // Map by priceId if desired; default to ad-lite for dev
      // You can refine by checking the exact priceId → which plan.
      const isAdFree = /free/i.test(pending.priceId || "");
      patch.subs = isAdFree ? { sub_ad_free: true } : { sub_ad_lite: true };
      patch.sub = {
        adTier: isAdFree ? "free" : "lite",
        renewsAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        isActive: true,
      };
    } else if (pending.type === "one_time") {
      // Grant a coin pack using metadata from the button press
      const id = pending?.metadata?.packId || "pack_unknown";
      const coins = Number(pending?.metadata?.coins || 0);
      patch.coinPacks[id] = coins;
      // Optional: also add an absolute coin credit field if you track it
      // patch.coins = (get from wallet on server; omitted in mock)
    }

    mockClearCheckout();
    return patch;
  }

  // Real server
  return req("/api/entitlements/refresh", { method: "POST" });
}

/* ---------- optional: tiny health probe for debugging ---------- */
export async function pingPayments() {
  try {
    if (USE_MOCK) return { ok: true, mock: true };
    const r = await req("/api/health", { method: "GET" }).catch(() => ({}));
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
