// FILE: src/game/PhaserGame.jsx
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import CityScene from "./scenes/CityScene";
import HomeCleanupScene from "./scenes/HomeCleanupScene";

const WIDTH = 960;
const HEIGHT = 600;

/**
 * Mounts a single Phaser instance.
 *
 * Props:
 *   - dark: boolean theme toggle (updates camera/canvas bg without remount)
 *   - onReady: function(game, { scene, api }) called once when CityScene is running
 *   - sceneKey: which scene to start: "CityScene" | "HomeCleanupScene" (default "CityScene")
 *   - onHomeCleanupResult: optional callback(payload) when HomeCleanupScene finishes.
 *       The scene should emit: game.events.emit("homeCleanup:complete", { coins, runId, ... })
 */
export default function PhaserGame({
  dark = true,
  onReady,
  sceneKey = "CityScene",
  onHomeCleanupResult,
}) {
  const holderRef = useRef(null);
  const gameRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const homeCleanupRef = useRef(onHomeCleanupResult);

  // keep latest callbacks without recreating the game
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    homeCleanupRef.current = onHomeCleanupResult;
  }, [onHomeCleanupResult]);

  // create the game once on first mount
  useEffect(() => {
    if (!holderRef.current || gameRef.current) return;

    const holder = holderRef.current;
    holder.tabIndex = 0;
    holder.style.outline = "none";

    const config = {
      type: Phaser.AUTO,
      parent: holder,
      backgroundColor: dark ? 0x141414 : 0xf6f3e7,
      render: {
        pixelArt: true,
        antialias: false,
        powerPreference: "high-performance",
        roundPixels: true,
      },
      physics: {
        default: "arcade",
        arcade: { gravity: { y: 0 }, debug: false },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: WIDTH,
        height: HEIGHT,
      },
      // Prevent WebGL context loss stutters on some laptops
      // (Phaser gracefully falls back if unsupported)
      disableContextMenu: true,
      fps: { target: 60, min: 30, forceSetTimeOut: false },
      // NOTE: CityScene is still the default startup scene; we may switch below.
      scene: [CityScene, HomeCleanupScene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Bridge: home cleanup mini-game result → React callback
    const onCleanupComplete = (payload) => {
      try {
        if (typeof homeCleanupRef.current === "function") {
          homeCleanupRef.current(payload || {});
        }
      } catch {
        // swallow errors from userland callback
      }
    };
    game.events?.on?.("homeCleanup:complete", onCleanupComplete);

    // Helper to emit once CityScene has created its registry API
    const emitReady = () => {
      const scene = game.scene.getScene?.("CityScene");
      if (!scene) return false;
      const api = scene.registry?.get?.("cityApi");
      if (api) {
        if (typeof onReadyRef.current === "function") {
          onReadyRef.current(game, { scene, api });
        }
        return true;
      }
      return false;
    };

    // If scene is already live, try now, else wait a tick
    const tryEmitSoon = () => {
      if (emitReady()) return;
      // a couple of rAFs ensures CityScene.create() ran and set registry
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          emitReady();
        })
      );
    };

    // Core ready
    game.events?.once?.(Phaser.Core.Events.READY, () => {
      try {
        holder.focus({ preventScroll: true });
      } catch {}

      // Explicitly start requested scene (default remains CityScene)
      try {
        if (sceneKey && typeof game.scene.start === "function") {
          game.scene.start(sceneKey);
        }
      } catch {
        // if bad key is passed we just let Phaser keep the default
      }

      // If we're running CityScene, wire its registry API as before.
      if (sceneKey === "CityScene") {
        tryEmitSoon();
      }
    });

    // When CityScene actually starts (for cases where it gets restarted)
    const onSceneStart = (key) => {
      if (key === "CityScene") tryEmitSoon();
    };
    game.scene?.events?.on?.("start", onSceneStart);

    // Keep canvas crisp on odd DPR changes
    const onResize = () => game.scale.refresh();
    const onVis = () =>
      document.hidden ? game.loop.sleep() : game.loop.wake();
    const onPointerDown = () => holder.focus();

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    holder.addEventListener("pointerdown", onPointerDown, { passive: true });

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      holder.removeEventListener("pointerdown", onPointerDown);
      game.scene?.events?.off?.("start", onSceneStart);
      game.events?.off?.("homeCleanup:complete", onCleanupComplete);

      if (gameRef.current) {
        // Full destroy including scenes/textures; also clear parent content
        gameRef.current.destroy(true);
        gameRef.current = null;
        if (holder) holder.innerHTML = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // create once

  // theme sync without remounting Phaser
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;

    const cssBg = dark ? "#141414" : "#f6f3e7";
    if (game.canvas) game.canvas.style.background = cssBg;

    const camColor = dark ? 0x141414 : 0xf6f3e7;
    game.scene.getScenes(false).forEach((sc) => {
      if (sc?.cameras?.main) sc.cameras.main.setBackgroundColor(camColor);
    });

    // ensure scaler recalculates layout when CSS/background changes
    game.scale.refresh();
  }, [dark]);

  return (
    <div
      ref={holderRef}
      style={{
        width: "100%",
        maxWidth: 1024,
        aspectRatio: `${WIDTH} / ${HEIGHT}`,
        margin: "0 auto",
        borderRadius: 12,
        overflow: "hidden",
        background: dark ? "#141414" : "#f6f3e7",
        boxShadow: "0 6px 22px rgba(0,0,0,0.28)",
      }}
    />
  );
}
