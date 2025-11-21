import React, { useEffect, useRef, useState } from "react";

/**
 * Minimal Parkour prototype shell.
 * Keyboard: A/D or ←/→ to move, SPACE to jump, R to reset.
 * Mobile: on-screen Left/Right/Jump.
 */
export default function Parkour({ dark = true }) {
  const [msg, setMsg] = useState("");
  const canvasRef = useRef(null);

  // very small canvas runner to prove the tab works
  useEffect(() => {
    const c = canvasRef.current;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const W = 720, H = 360;
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + "px"; c.style.height = H + "px";
    const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);

    // world
    const g = 0.8;
    const player = { x: 80, y: 0, vx: 0, vy: 0, w: 20, h: 28, onGround: false };
    const ground = 280;
    const plats = [
      { x: 0, y: ground, w: 2000, h: 12 },
      { x: 200, y: 240, w: 120, h: 10 },
      { x: 380, y: 210, w: 110, h: 10 },
      { x: 560, y: 180, w: 100, h: 10 },
    ];
    let left = false, right = false, jumpQueued = false;

    const onKey = (e, down) => {
      if (e.repeat) return;
      const k = e.code;
      if (k === "ArrowLeft" || k === "KeyA") left = down;
      if (k === "ArrowRight" || k === "KeyD") right = down;
      if (k === "Space") { if (down) jumpQueued = true; e.preventDefault(); }
      if (k === "KeyR" && down) { player.x = 80; player.y = 0; player.vx = 0; player.vy = 0; }
    };
    window.addEventListener("keydown", (e)=>onKey(e,true));
    window.addEventListener("keyup",   (e)=>onKey(e,false));

    const collides = (p, r) =>
      p.x < r.x + r.w && p.x + p.w > r.x && p.y < r.y + r.h && p.y + p.h > r.y;

    function step() {
      // input → velocity
      const run = 1.8;
      player.vx = (right ? run : 0) - (left ? run : 0);

      // gravity + jump
      player.vy += g;
      if (jumpQueued && player.onGround) { player.vy = -12; player.onGround = false; }
      jumpQueued = false;

      // integrate
      player.x += player.vx;
      player.y += player.vy;

      // collide with platforms
      player.onGround = false;
      const rect = { x: player.x, y: player.y, w: player.w, h: player.h };
      for (const r of plats) {
        if (!collides(rect, r)) continue;
        // resolve vertically first
        if (player.vy > 0 && player.y + player.h - r.y < 16) {
          player.y = r.y - player.h; player.vy = 0; player.onGround = true;
        } else if (player.vy < 0 && r.y + r.h - player.y < 16) {
          player.y = r.y + r.h; player.vy = 0;
        } else if (player.vx > 0) {
          player.x = r.x - player.w;
        } else if (player.vx < 0) {
          player.x = r.x + r.w;
        }
        rect.x = player.x; rect.y = player.y;
      }

      // simple camera
      const camX = Math.max(0, player.x - 200);

      // draw
      ctx.fillStyle = dark ? "#0b0d0f" : "#ffffff";
      ctx.fillRect(0,0,W,H);

      // platforms
      ctx.save(); ctx.translate(-camX, 0);
      ctx.fillStyle = dark ? "#2b2f36" : "#e5e7eb";
      for (const r of plats) ctx.fillRect(r.x, r.y, r.w, r.h);

      // player
      ctx.fillStyle = "#facc15";
      ctx.fillRect(player.x, player.y, player.w, player.h);

      // goal flag
      ctx.fillStyle = "#60a5fa";
      ctx.fillRect(660, 150, 8, 30);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(668, 150, 18, 12);
      ctx.restore();

      if (player.x > 650 && player.y < 200) setMsg("Stage complete.");
      requestAnimationFrame(step);
    }
    step();

    return () => {
      window.removeEventListener("keydown", (e)=>onKey(e,true));
      window.removeEventListener("keyup",   (e)=>onKey(e,false));
    };
  }, [dark]);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Parkour</h2>
      <p className="text-sm opacity-80 mb-3">
        Prototype side-runner. A/D or ←/→ to move, Space to jump, R to reset.
      </p>
      <canvas ref={canvasRef} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)" }} />
      {msg && <div className="mt-3 text-sm opacity-80">{msg}</div>}
      {/* Mobile controls */}
      <div className="mt-3 flex gap-2 sm:hidden">
        <button className="px-3 py-2 rounded-lg border dark:border-stone-600" onTouchStart={()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA"}))} onTouchEnd={()=>window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA"}))}>◀</button>
        <button className="px-3 py-2 rounded-lg border dark:border-stone-600" onTouchStart={()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyD"}))} onTouchEnd={()=>window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyD"}))}>▶</button>
        <button className="ml-auto px-3 py-2 rounded-lg border dark:border-stone-600" onClick={()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Space"}))}>Jump</button>
      </div>
    </div>
  );
}
