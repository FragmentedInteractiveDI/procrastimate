// src/components/SWDebugLogger.jsx
import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export default function SWDebugLogger() {
  // Only log in dev
  const DEV = import.meta.env.DEV;

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(url, reg) {
      if (!DEV || !reg) return;
      console.log("[PWA] Service worker registered:", url, reg);

      // log updatefound/install state
      reg.addEventListener?.("updatefound", () => {
        const sw = reg.installing;
        console.log("[PWA] updatefound — installing:", sw);
        sw?.addEventListener?.("statechange", () =>
          console.log("[PWA] installing state:", sw.state)
        );
      });

      // poll for updates occasionally in dev
      const id = setInterval(() => reg.update?.(), 60 * 1000);
      // cleanup
      return () => clearInterval(id);
    },
    onRegisterError(err) {
      if (DEV) console.warn("[PWA] registration error:", err);
    },
    onNeedRefresh() {
      if (DEV) console.log("[PWA] needRefresh=true (new SW waiting)");
      // auto-refresh in dev to verify flow
      updateServiceWorker(true);
    },
    onOfflineReady() {
      if (DEV) console.log("[PWA] offline ready");
    },
  });

  useEffect(() => {
    if (!DEV) return;

    // SW takes control
    const onCtrl = () => console.log("[PWA] controllerchange");
    navigator.serviceWorker?.addEventListener("controllerchange", onCtrl);

    // messages from SW (optional)
    const onMsg = (e) => console.log("[PWA] message:", e.data);
    navigator.serviceWorker?.addEventListener("message", onMsg);

    return () => {
      navigator.serviceWorker?.removeEventListener("controllerchange", onCtrl);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
    };
  }, [needRefresh]);

  return null; // no UI
}
