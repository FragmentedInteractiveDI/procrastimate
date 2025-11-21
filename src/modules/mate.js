// src/modules/mate.js
import { ensureHome } from "./home";

const KEY = "pm_mate_v1";

export function getMate() {
  const h = ensureHome();
  let m;
  try { m = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
  if (!m) {
    // spawn roughly center
    m = { x: Math.floor(h.w / 2), y: Math.floor(h.h / 2), target: null, emoji: "🙂" };
    setMate(m);
  }
  // clamp if grid resized
  m.x = Math.max(0, Math.min(h.w - 1, m.x));
  m.y = Math.max(0, Math.min(h.h - 1, m.y));
  return m;
}

export function setMate(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {}
}

export function setTarget(x, y) {
  const m = getMate();
  m.target = [x, y];
  setMate(m);
}

export function clearTarget() {
  const m = getMate();
  m.target = null;
  setMate(m);
}

function cellBlocked(h, x, y) {
  return x < 0 || y < 0 || x >= h.w || y >= h.h || !!h.cells[`${x},${y}`];
}

export function stepMate(h) {
  const m = getMate();
  // If target set, bias towards it; else random walk
  const dirs = [
    [ 1, 0], [-1, 0], [0, 1], [0,-1],
  ];

  let order = dirs;
  if (m.target) {
    const [tx, ty] = m.target;
    order = [...dirs].sort((a,b)=>{
      const da = Math.abs((m.x+a[0]) - tx) + Math.abs((m.y+a[1]) - ty);
      const db = Math.abs((m.x+b[0]) - tx) + Math.abs((m.y+b[1]) - ty);
      return da - db;
    });
  } else {
    // shuffle
    order = [...dirs].sort(()=>Math.random() - 0.5);
  }

  for (const [dx, dy] of order) {
    const nx = m.x + dx, ny = m.y + dy;
    if (!cellBlocked(h, nx, ny)) {
      m.x = nx; m.y = ny;
      break;
    }
  }

  // clear target if reached
  if (m.target && m.x === m.target[0] && m.y === m.target[1]) m.target = null;

  setMate(m);
  return m;
}
