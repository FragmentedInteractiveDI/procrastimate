// FILE: src/setup/optionals.js
// Attach tolerant globals if a real implementation isn’t present.

(function () {
  const w = typeof window !== "undefined" ? window : {};

  // membership (subscribers get 3-min APB)
  if (!w.__pmMembership) {
    w.__pmMembership = {
      // Replace with your real check later
      isSubscribed() { return !!JSON.parse(localStorage.getItem("pm_subscribed_v1") || "false"); },
      isActive()     { return this.isSubscribed(); },
    };
  }

  // gear state (global passive_city_pct)
  if (!w.__pmGearState) {
    w.__pmGearState = {
      // scope: "global" | future scopes
      getActiveMods(scope) {
        const pct = Number(localStorage.getItem("pm_gear_passive_city_pct") || "0");
        return { passive_city_pct: isFinite(pct) ? Math.max(0, Math.min(0.20, pct)) : 0 };
      },
    };
  }

  // ad guard (watch an ad → promise resolves {ok, msg})
  if (!w.__pmAdGuard) {
    w.__pmAdGuard = {
      async watchAd(placement) {
        // Stub: simulate a short “ad” so the flow is testable now.
        const ok = typeof window !== "undefined"
          ? confirm(`Watch ad to skip cooldown? (stub for "${placement}")`)
          : true;
        if (!ok) return { ok: false, msg: "Ad dismissed." };
        await new Promise(r => setTimeout(r, 1200));
        return { ok: true, msg: "Ad completed." };
      },
    };
  }
})();
