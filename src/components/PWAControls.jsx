// src/components/PWAControls.jsx
import React, { useEffect, useState } from "react";

/**
 * Minimal PWA helpers: install prompt + reload on new SW.
 * Visual only; high z-index and theme-aware.
 */
export default function PWAControls() {
  const [deferred, setDeferred] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    // If your SW posts messages like { type: "NEW_VERSION" } on updatefound
    const onMessage = (e) => {
      if (e?.data?.type === "NEW_VERSION") setUpdateReady(true);
    };
    navigator.serviceWorker?.addEventListener?.("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener?.("message", onMessage);
  }, []);

  async function install() {
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {}
    setDeferred(null);
  }
  function reloadNow() {
    if (location) location.reload();
  }

  if (!deferred && !updateReady) return null;

  return (
    <div
      className="
        fixed top-4 left-1/2 -translate-x-1/2 z-50
        pointer-events-auto
      "
    >
      <div
        className="
          flex items-center gap-2 rounded-xl px-3 py-2 text-sm shadow
          border bg-white/95 text-slate-800 border-amber-200/70
          dark:bg-stone-900/95 dark:text-stone-100 dark:border-stone-700
        "
      >
        {deferred && (
          <button
            onClick={install}
            className="
              px-3 py-1 rounded-lg text-sm
              bg-amber-500 text-black hover:bg-amber-400 transition-colors
            "
          >
            Install app
          </button>
        )}
        {updateReady && (
          <button
            onClick={reloadNow}
            className="
              px-3 py-1 rounded-lg text-sm
              bg-blue-600 text-white hover:bg-blue-700 transition-colors
            "
          >
            Update ready — Reload
          </button>
        )}
      </div>
    </div>
  );
}
