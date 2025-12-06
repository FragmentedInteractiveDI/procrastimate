// FILE: src/game/scenes/systems/TrafficSystem.js
// Single-tile Roundabout (0.35 radius) + Bezier Intersections (unchanged)
// Clean, deterministic traffic engine — no ghosts, no disappearing, no stuck cars.

import Phaser from "phaser";
import { lanePositionFor } from "./GridSystem.js";
import { getRandomTrafficVehicle } from "../../../assets/cityAssets.js";

const TILE = 28;
const BASE_SPEED = 45;
const TRAFFIC_MAX = 10;
const TRAFFIC_SPAWN_MS = 1400;
const PLAYER_SPAWN_AVOID_RADIUS = TILE * 8;
const VIEW_BIAS_MARGIN = TILE * 2;

// Roundabout orbital radius (user-selected: 0.35 * TILE)
const RB_R = TILE * 0.35;

// ====== PERSONAS ======
const PERSONAS = {
  aggressive: { tex: "pm_dot", tint: 0xff7d7d, mult: 1.25, followGapPx: 18 },
  fast:       { tex: "pm_square", tint: 0xffcc66, mult: 1.15, followGapPx: 22 },
  neutral:    { tex: "pm_dot", tint: 0xbfd1ff, mult: 1.0,  followGapPx: 28 },
  slow:       { tex: "pm_diamond", tint: 0xa5d1a5, mult: 0.75, followGapPx: 34 }
};

const PERSONA_WEIGHTS = [
  ["aggressive", 0.10],
  ["fast",       0.25],
  ["neutral",    0.50],
  ["slow",       0.15]
];

function pickPersona() {
  const r = Math.random();
  let acc = 0;
  for (const [key, w] of PERSONA_WEIGHTS) {
    acc += w;
    if (r <= acc) return key;
  }
  return "neutral";
}

function vec(x, y) {
  return { x, y };
}

function quadLen(p0, p1, p2) {
  const steps = 10;
  let len = 0, prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u*u*p0.x + 2*u*t*p1.x + t*t*p2.x;
    const y = u*u*p0.y + 2*u*t*p1.y + t*t*p2.y;
    len += Phaser.Math.Distance.Between(prev.x, prev.y, x, y);
    prev = { x, y };
  }
  return len;
}

function lanePointInCell(gx, gy, dir, t) {
  const baseX = gx * TILE;
  const baseY = gy * TILE;

  if (Math.abs(dir.x) > 0) {
    const laneY = lanePositionFor(gx, gy, dir, false).y;
    const x0 = dir.x > 0 ? baseX : baseX + TILE;
    const x1 = dir.x > 0 ? baseX + TILE : baseX;
    return { x: x0 + (x1 - x0) * t, y: laneY };
  }

  const laneX = lanePositionFor(gx, gy, dir, false).x;
  const y0 = dir.y > 0 ? baseY : baseY + TILE;
  const y1 = dir.y > 0 ? baseY + TILE : baseY;
  return { x: laneX, y: y0 + (y1 - y0) * t };
}

function entryPosition(gx, gy, newDir) {
  const inset = TILE * 0.18;
  const baseX = gx * TILE;
  const baseY = gy * TILE;

  if (Math.abs(newDir.x) > 0) {
    const x = newDir.x > 0 ? baseX + inset : baseX + TILE - inset;
    const y = lanePositionFor(gx, gy, newDir, false).y;
    return { x, y };
  }

  const y = newDir.y > 0 ? baseY + inset : baseY + TILE - inset;
  const x = lanePositionFor(gx, gy, newDir, false).x;
  return { x, y };
}

function cornerControl(from, to, fromDir, toDir) {
  if (Math.abs(fromDir.x) > 0 && Math.abs(toDir.y) > 0)
    return { x: to.x, y: from.y };
  if (Math.abs(fromDir.y) > 0 && Math.abs(toDir.x) > 0)
    return { x: from.x, y: to.y };
  return { x: (from.x + to.x) * 0.5, y: (from.y + to.y) * 0.5 };
}

function cellProgress(dir, x, y, baseX, baseY) {
  if (Math.abs(dir.x) > 0)
    return dir.x > 0 ? (x - baseX) / TILE : ((baseX + TILE) - x) / TILE;
  return dir.y > 0 ? (y - baseY) / TILE : ((baseY + TILE) - y) / TILE;
}

// ====== ORBITAL ROUNDABOUT MODEL ======
function getRoundaboutOrbitPoints(gx, gy) {
  const cx = gx * TILE + TILE / 2;
  const cy = gy * TILE + TILE / 2;

  return {
    N: { x: cx,     y: cy - RB_R },
    E: { x: cx + RB_R, y: cy     },
    S: { x: cx,     y: cy + RB_R },
    W: { x: cx - RB_R, y: cy     }
  };
}

function roundaboutEntryDirection(dir) {
  if (dir.y < 0) return "W"; // entering from South
  if (dir.x > 0) return "N"; // entering from West
  if (dir.y > 0) return "E"; // entering from North
  if (dir.x < 0) return "S"; // entering from East
  return "N";
}

function nextOrbitKey(key) {
  if (key === "N") return "W";
  if (key === "W") return "S";
  if (key === "S") return "E";
  return "N";
}

function orbitKeyToDir(key) {
  if (key === "N") return { x: 0, y: -1 };
  if (key === "E") return { x: 1, y: 0 };
  if (key === "S") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

export class TrafficSystem {
  constructor(scene) {
    this.scene = scene;
    this.traffic = [];
    this.spawnTimer = null;
  }

  initialize() {
    this.spawnTimer = this.scene.time.addEvent({
      delay: TRAFFIC_SPAWN_MS,
      loop: true,
      callback: () => this.spawnTraffic()
    });
  }

  // ===== FIXED SPAWNING =====
  pickSpawnPoint() {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const marginRect = new Phaser.Geom.Rectangle(
      view.x - VIEW_BIAS_MARGIN,
      view.y - VIEW_BIAS_MARGIN,
      view.width + VIEW_BIAS_MARGIN * 2,
      view.height + VIEW_BIAS_MARGIN * 2
    );
    const px = this.scene.car.x;
    const py = this.scene.car.y;

    let starts = [...this.scene.gridSystem.edgeRoadCells()];

    // NEW: fallback if no edgeRoadCells()
    if (!starts.length) {
      for (let gy = 0; gy < this.scene.h; gy++) {
        for (let gx = 0; gx < this.scene.w; gx++) {
          if (!this.scene.gridSystem.isRoadCell(gx, gy)) continue;

          const neighbors = [
            { x: gx + 1, y: gy },
            { x: gx - 1, y: gy },
            { x: gx, y: gy + 1 },
            { x: gx, y: gy - 1 }
          ];

          if (neighbors.some(n => this.scene.gridSystem.isRoadCell(n.x, n.y))) {
            starts.push({ gx, gy });
          }
        }
      }
    }

    if (!starts.length) return null;

    const scored = starts.map(s => {
      const cx = s.gx * TILE + TILE / 2;
      const cy = s.gy * TILE + TILE / 2;
      const inView = marginRect.contains(cx, cy);
      const far = Phaser.Math.Distance.Between(cx, cy, px, py) > PLAYER_SPAWN_AVOID_RADIUS;
      return { s, score: (inView ? 0 : 2) + (far ? 1 : 0) };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored.filter(k => k.score === scored[0].score).map(k => k.s);
    return best[(Math.random()*best.length)|0];
  }

  spawnTraffic() {
    if (this.traffic.length >= TRAFFIC_MAX) return;
    const cell = this.pickSpawnPoint();
    if (!cell) return;

    const dirs = [vec(1,0), vec(-1,0), vec(0,1), vec(0,-1)];
    const validDirs = dirs.filter(d =>
      this.scene.gridSystem.isRoadCell(cell.gx + d.x, cell.gy + d.y)
    );
    if (!validDirs.length) return;

    const dir = validDirs[(Math.random()*validDirs.length)|0];

    const kind = pickPersona();
    const P = PERSONAS[kind];

    const isRB = this.scene.gridSystem.isRoundaboutCell(cell.gx, cell.gy);
    const pos = lanePositionFor(cell.gx, cell.gy, dir, isRB);

    const spriteKey = this.scene.textures.exists("vehicle_sedan")
      ? getRandomTrafficVehicle()
      : P.tex;

    const spr = this.scene.add.image(pos.x, pos.y, spriteKey)
      .setDepth(4)
      .setScale(0.25)
      .setAlpha(0.95)
      .setTint(this.scene.apb ? 0xffea76 : P.tint);

    spr.setRotation(this.scene.navigationSystem.angleForDir(dir));
    this.scene.worldLayer.add(spr);

    this.traffic.push({
      spr,
      dir,
      kind,
      speedMult: P.mult,
      followGapPx: P.followGapPx,
      lastCell: null,
      turn: null,

      // Roundabout state
      inRoundabout: false,
      rbCell: null,
      rbOrbitKey: null,
      rbLaps: 0
    });
  }

  // ===== FIND CAR AHEAD =====
  _carAhead(t) {
    let best = null;
    for (const other of this.traffic) {
      if (other === t) continue;
      if (other.dir.x !== t.dir.x || other.dir.y !== t.dir.y) continue;
      const dx = other.spr.x - t.spr.x;
      const dy = other.spr.y - t.spr.y;
      const dot = dx * t.dir.x + dy * t.dir.y;
      if (dot <= 0) continue;
      const dist = Math.hypot(dx, dy);
      if (!best || dist < best.dist)
        best = { other, dist };
    }
    return best;
  }

  // ===== START A BEZIER TURN =====
  startBezierTurn(t, cNow, newDir, dstCell, prog) {
    const from = lanePointInCell(cNow.gx, cNow.gy, t.dir, prog);
    const to = entryPosition(dstCell.gx, dstCell.gy, newDir);
    const ctrl = cornerControl(from, to, t.dir, newDir);
    const len = quadLen(from, ctrl, to) || TILE;

    t.turn = {
      s: 0,
      from, ctrl, to,
      len,
      newDir,
      dst: { gx: dstCell.gx, gy: dstCell.gy }
    };
  }

  // ===== UPDATE =====
  update(time, delta) {
    const dt = delta / 1000;
    this.stepTraffic(dt);
  }

  // ===== CORE LOOP =====
  stepTraffic(dt) {
    const grid = this.scene.gridSystem;
    const nav = this.scene.navigationSystem;

    for (let i = this.traffic.length-1; i >= 0; i--) {
      const t = this.traffic[i];
      const spr = t.spr;

      if (!spr || !spr.active) {
        this.traffic.splice(i,1);
        continue;
      }

      // APB tint update
      if (this.scene.apb) {
        spr.setTint(0xffea76);
      }

      // ===== ROUNDABOUT MODE =====
      const cNow = grid.pixToCell(spr.x, spr.y);
      const isRB = grid.isRoundaboutCell(cNow.gx, cNow.gy);

      if (isRB || t.inRoundabout) {
        this._handleRoundabout(t, cNow, spr);
        continue;
      }

      // ===== BEZIER TURN EXEC =====
      if (t.turn) {
        this._doBezierTurn(t, spr, dt);
        continue;
      }

      // ===== NORMAL ROAD MOVEMENT =====
      this._handleNormalMovement(t, cNow, spr, dt);
    }
  }

  // ========== ROUNDABOUT ENGINE ==========
  _handleRoundabout(t, cNow, spr) {
    const grid = this.scene.gridSystem;
    const nav = this.scene.navigationSystem;

    const rbCell = t.rbCell || { gx: cNow.gx, gy: cNow.gy };
    t.rbCell = rbCell;
    t.inRoundabout = true;

    const orbit = getRoundaboutOrbitPoints(rbCell.gx, rbCell.gy);

    if (!t.rbOrbitKey) {
      t.rbOrbitKey = roundaboutEntryDirection(t.dir);
      t.rbLaps = 0;
    }

    const nextKey = nextOrbitKey(t.rbOrbitKey);

    const pointA = orbit[t.rbOrbitKey];
    const pointB = orbit[nextKey];

    const speed = BASE_SPEED * t.speedMult;
    const dist = Phaser.Math.Distance.Between(spr.x, spr.y, pointB.x, pointB.y);

    if (dist < speed * 0.016) {
      spr.setPosition(pointB.x, pointB.y);
      t.rbOrbitKey = nextKey;
      t.rbLaps += 0.25;

      this._roundaboutExitCheck(t, rbCell, spr);
      return;
    }

    const angle = Phaser.Math.Angle.Between(spr.x, spr.y, pointB.x, pointB.y);
    spr.x += Math.cos(angle) * speed * 0.016;
    spr.y += Math.sin(angle) * speed * 0.016;
    spr.setRotation(angle + Math.PI/2);
  }

  _roundaboutExitCheck(t, rbCell, spr) {
    const grid = this.scene.gridSystem;
    const nav = this.scene.navigationSystem;

    const key = t.rbOrbitKey;

    let exitDir;
    if (key === "N") exitDir = { x: 0, y: -1 };
    else if (key === "E") exitDir = { x: 1, y:  0 };
    else if (key === "S") exitDir = { x: 0, y:  1 };
    else exitDir = { x: -1, y: 0 };

    const ex = rbCell.gx + exitDir.x;
    const ey = rbCell.gy + exitDir.y;

    if (!grid.isRoadCell(ex, ey)) return;

    if (t.rbLaps < 1) return;

    t.inRoundabout = false;
    t.rbCell = null;
    t.rbOrbitKey = null;
    t.dir = exitDir;

    const pos = lanePositionFor(ex, ey, exitDir, false);
    spr.setPosition(pos.x, pos.y);
    spr.setRotation(nav.angleForDir(exitDir));
  }

  // ========== INTERSECTIONS & NORMAL ROADS ==========
  _handleNormalMovement(t, cNow, spr, dt) {
    const grid = this.scene.gridSystem;
    const nav = this.scene.navigationSystem;

    const cKey = `${cNow.gx},${cNow.gy}`;
    const newlyEntered = t.lastCell !== cKey;
    if (newlyEntered) t.lastCell = cKey;

    const fwd = { gx: cNow.gx + t.dir.x, gy: cNow.gy + t.dir.y };

    const speed = BASE_SPEED * t.speedMult;
    const lead = this._carAhead(t);

    let actualSpeed = speed;
    if (lead && lead.dist < t.followGapPx) {
      actualSpeed = speed * Math.max(0.1, lead.dist / t.followGapPx);
    }

    const baseX = cNow.gx * TILE;
    const baseY = cNow.gy * TILE;
    const prog = cellProgress(t.dir, spr.x, spr.y, baseX, baseY);

    const DECIDE_START = 0.20;
    const DECIDE_END   = 0.92;
    const forwardBlocked = !grid.isRoadCell(fwd.gx, fwd.gy);

    if (prog >= DECIDE_START && prog <= DECIDE_END) {
      const maybeTurn = forwardBlocked || Math.random() < 0.15;

      if (maybeTurn) {
        const left  = nav.turnLeft(t.dir);
        const right = nav.turnRight(t.dir);

        const opts = [];

        const addIfGood = (dir, weight) => {
          const a = { gx: cNow.gx + dir.x, gy: cNow.gy + dir.y };
          const b = { gx: a.gx + dir.x,   gy: a.gy + dir.y };
          if (grid.isRoadCell(a.gx,a.gy) && grid.isRoadCell(b.gx,b.gy))
            opts.push({ dir, cell: a, weight });
        };

        if (!forwardBlocked) addIfGood(t.dir, 3);
        addIfGood(left, 1);
        addIfGood(right, 1);

        if (forwardBlocked) addIfGood(nav.reverseDir(t.dir), 0.2);

        if (opts.length) {
          let total = opts.reduce((s,o)=>s+o.weight,0);
          let r = Math.random() * total;
          for (const o of opts) {
            r -= o.weight;
            if (r <= 0) {
              const turn = (o.dir.x !== t.dir.x || o.dir.y !== t.dir.y);
              if (turn) {
                this.startBezierTurn(t, cNow, o.dir, o.cell, prog);
              } else {
                t.dir = o.dir;
              }
              return;
            }
          }
        }
      }
    }

    const nx = spr.x + t.dir.x * actualSpeed * dt;
    const ny = spr.y + t.dir.y * actualSpeed * dt;

    const nextCell = grid.pixToCell(nx, ny);

    if (grid.isRoadCell(nextCell.gx, nextCell.gy)) {
      spr.x = nx;
      spr.y = ny;
    }

    // snap to lane
    const lanePos = lanePositionFor(cNow.gx, cNow.gy, t.dir, false);
    if (Math.abs(t.dir.x) > 0) spr.y = lanePos.y;
    else spr.x = lanePos.x;
  }

  // ========== BEZIER EXECUTE ==========
  _doBezierTurn(t, spr, dt) {
    const nav = this.scene.navigationSystem;

    t.turn.s += (BASE_SPEED * t.speedMult * dt) / (t.turn.len || TILE);
    t.turn.s = Math.min(1, t.turn.s);

    const s = t.turn.s;
    const u = 1 - s;

    const x = u*u*t.turn.from.x + 2*u*s*t.turn.ctrl.x + s*s*t.turn.to.x;
    const y = u*u*t.turn.from.y + 2*u*s*t.turn.ctrl.y + s*s*t.turn.to.y;

    spr.setPosition(x, y);

    if (s >= 1) {
      t.dir = t.turn.newDir;
      spr.setRotation(nav.angleForDir(t.dir));
      t.turn = null;
      return;
    }

    const ang = Phaser.Math.Angle.Between(0, 0, t.turn.newDir.x, t.turn.newDir.y);
    spr.setRotation(ang + Math.PI/2);
  }

  // ====== CLEANUP ======
  destroy() {
    if (this.spawnTimer) {
      this.spawnTimer.destroy();
      this.spawnTimer = null;
    }
    for (const t of this.traffic) {
      if (t.spr) t.spr.destroy();
    }
    this.traffic = [];
  }
}
