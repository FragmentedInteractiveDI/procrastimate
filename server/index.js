/* eslint-disable no-console */
// Minimal payments/dev-backend for local testing.
// - Serves checkout & portal URLs (mock unless Stripe keys provided)
// - Grants coin packs
// - Returns entitlements patches for "Restore Purchases"

import express from "express";
import cors from "cors";

// Optional: Stripe wiring (kept lazy; mock if no keys)
let stripe = null;
const STRIPE_KEY = process.env.STRIPE_SECRET;
if (STRIPE_KEY) {
  const pkg = await import("stripe");
  stripe = new pkg.default(STRIPE_KEY, { apiVersion: "2023-10-16" });
}

// In-memory dev DB (replace with real DB later)
const db = {
  users: {
    // Example user bucket by client-provided UID; for now we use "local"
    local: {
      coins: 0,
      coinPacks: {}, // { packId: count }
      subs: {},      // { sub_ad_lite: true, sub_ad_free: false }
      lastSync: 0,
    },
  },
};

function udb(uid = "local") {
  if (!db.users[uid]) db.users[uid] = { coins: 0, coinPacks: {}, subs: {}, lastSync: 0 };
  return db.users[uid];
}

// --- helpers ---
function grantCoins(uid, packId, amount) {
  const u = udb(uid);
  u.coins = (u.coins || 0) + (Number(amount) || 0);
  u.coinPacks[packId] = (u.coinPacks[packId] || 0) + 1;
  u.lastSync = Date.now();
}

function setSub(uid, subId, on = true) {
  const u = udb(uid);
  u.subs[subId] = !!on;
  u.lastSync = Date.now();
}

// --- server ---
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: [/^http:\/\/localhost:\d+$/],
    credentials: true,
  })
);

// Simple health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/**
 * POST /api/checkout
 * body: { type: "sub"|"one_time", priceId, metadata?: { packId, coins } }
 * Returns { url } where client should be redirected (Stripe or mock).
 */
app.post("/api/checkout", async (req, res) => {
  const { type, priceId, metadata = {}, uid = "local" } = req.body || {};
  try {
    if (stripe && priceId) {
      // Real Stripe session (works once keys & prices are set in your dashboard)
      const session = await stripe.checkout.sessions.create({
        mode: type === "sub" ? "subscription" : "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { uid, ...metadata },
        success_url: process.env.SUCCESS_URL || "http://localhost:5173/#/shop?ok=1",
        cancel_url: process.env.CANCEL_URL || "http://localhost:5173/#/shop?cancel=1",
      });
      return res.json({ url: session.url });
    }

    // --- MOCK FLOW (no Stripe keys yet) ---
    // Simulate instant success:
    if (type === "one_time") {
      const packId = metadata.packId || "pack_unknown";
      const coins = Number(metadata.coins || 0);
      grantCoins(uid, packId, coins);
    } else if (type === "sub") {
      // Decide which sub based on priceId env mapping (dev mock)
      // If priceId not set, guess from common ids used in UI:
      const subId =
        priceId?.includes("FREE") || priceId?.includes("free")
          ? "sub_ad_free"
          : "sub_ad_lite";
      setSub(uid, subId, true);
    }

    console.log("[mock] checkout fulfilled", { type, priceId, metadata });
    // Send user "back" to app
    return res.json({ url: process.env.SUCCESS_URL || "http://localhost:5173/#/shop?ok=1" });
  } catch (e) {
    console.error("checkout error", e);
    return res.status(500).json({ error: "checkout_failed" });
  }
});

/**
 * POST /api/portal
 * Returns { url } to Stripe billing portal OR a mock URL to /#/shop.
 */
app.post("/api/portal", async (req, res) => {
  const uid = (req.body && req.body.uid) || "local";
  try {
    if (stripe) {
      // You would look up the Stripe customer by your uid here.
      // For dev, we just throw because we don't track customers yet.
      // const portal = await stripe.billingPortal.sessions.create({ customer, return_url: "..." });
      // return res.json({ url: portal.url });
    }
    console.log("[mock] open portal for", uid);
    return res.json({ url: process.env.PORTAL_URL || "http://localhost:5173/#/shop?portal=1" });
  } catch (e) {
    console.error("portal error", e);
    return res.status(500).json({ error: "portal_failed" });
  }
});

/**
 * POST /api/entitlements/refresh
 * Server would verify purchases (Stripe webhooks / receipts), then return a patch.
 * For mock: just reflect in-memory state.
 */
app.post("/api/entitlements/refresh", (req, res) => {
  const uid = (req.body && req.body.uid) || "local";
  const u = udb(uid);

  // Patch format expected by your entitlements module:
  // {
  //   flags: { ad_lite: boolean, ad_free: boolean },
  //   subs:  ["sub_ad_lite", "sub_ad_free"],
  //   grants: { coins: number }  // optional one-time coin top-ups
  // }
  const patch = {
    flags: { ad_lite: !!u.subs.sub_ad_lite, ad_free: !!u.subs.sub_ad_free },
    subs: Object.keys(u.subs).filter((k) => !!u.subs[k]),
    grants: { coins: u.coins || 0 },
    ts: Date.now(),
  };

  // Clear staged coins after “restore” so we don’t double-grant on every refresh.
  u.coins = 0;
  return res.json(patch);
});

// Dev: coin grant helper (optional)
app.post("/api/dev/grant", (req, res) => {
  const { coins = 0, uid = "local" } = req.body || {};
  grantCoins(uid, "dev_grant", Number(coins) || 0);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Payments server on http://localhost:${PORT}`));
