// FILE: src/game/scenes/systems/TrafficSystem.js
// Traffic spawning, movement AI, and collision detection (clean deterministic core)

import Phaser from "phaser";
import { lanePositionFor } from "./GridSystem.js";
import { getRandomTrafficVehicle } from "../../../assets/cityAssets.js";

// ===== CONSTANTS =====
const TILE = 28;
const TRAFFIC_MAX = 10;
const TRAFFIC_SPAWN_MS = 1400;
const BASE_SPEED = 45; // px/sec (reduced from 70 for slower traffic)
const PLAYER_SPAWN_AVOID_RADIUS = 8 * TILE;
const VIEW_BIAS_MARGIN = 2 * TILE;

// Personas define different traffic behaviors
const PERSONAS = {
  aggressive: { tex: "pm_dot",     tint: 0xff7d7d, mult: 1.25, followGapPx: 18 },
  fast:       { tex: "pm_square",  tint: 0xffcc66, mult: 1.15, followGapPx: 22 },
  neutral:    { tex: "pm_dot",     tint: 0xbfd1ff, mult: 1.0,  followGapPx: 28 },
  slow:       { tex: "pm_diamond", tint: 0xa5d1a5, mult: 0.75, followGapPx: 34 }
};

const PERSONA_WEIGHTS = [
  ["aggressive", 0.10],
  ["fast", 0.25],
  ["neutral", 0.50],
  ["slow", 0.15]
];

// ===== HELPERS =====

function pickPersonaKey() {
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

// direction helpers via NavigationSystem
function forwardDir(dir) {
  return dir;
}

/**
 * TrafficSystem:
 * - gridSystem is the single source of truth for roads
 * - each car decides locally: forward -> left -> right -> U-turn -> despawn
 * - no lane reservations, no "stuck" state machines
 */
export class TrafficSystem {
  constructor(scene) {
    this.scene = scene;

    // Cars
    this.traffic = [];

    // Spawn timer
    this.spawnTimer = null;
  }

  initialize() {
    this.spawnTimer = this.scene.time.addEvent({
      delay: TRAFFIC_SPAWN_MS,
      loop: true,
      callback: () => this.spawnTraffic()
    });
  }

  // ===== SPAWN LOGIC =====

  pickSpawnPoint() {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const marginRect = new Phaser.Geom.Rectangle(
      view.x - VIEW_BIAS_MARGIN,
      view.y - VIEW_BIAS_MARGIN,
      view.width + VIEW_BIAS_MARGIN * 2,
      view.height + VIEW_BIAS_MARGIN * 2
    );
    const carPos = new Phaser.Math.Vector2(this.scene.car.x, this.scene.car.y);

    const starts = [];

    // Prefer edge roads
    for (const e of this.scene.gridSystem.edgeRoadCells()) {
      starts.push(e);
    }

    // Fallback: any road cell with at least one road neighbor
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

    if (!starts.length) return null;

    // Bias off-screen and away from player
    const scored = starts.map(s => {
      const px = s.gx * TILE + TILE / 2;
      const py = s.gy * TILE + TILE / 2;
      const inView = marginRect.contains(px, py);
      const farFromPlayer =
        Phaser.Math.Distance.Between(px, py, carPos.x, carPos.y) >
        PLAYER_SPAWN_AVOID_RADIUS;
      const score = (inView ? 0 : 2) + (farFromPlayer ? 1 : 0);
      return { s, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topScore = scored[0].score;
    const top = scored.filter(k => k.score === topScore).map(k => k.s);
    return top[(Math.random() * top.length) | 0];
  }

  spawnTraffic() {
    if (this.traffic.length >= TRAFFIC_MAX) return;
    const cell = this.pickSpawnPoint();
    if (!cell) return;

    // Decide initial direction: any neighboring road
    const candidates = [];
    const dirs = [
      vec(1, 0),
      vec(-1, 0),
      vec(0, 1),
      vec(0, -1)
    ];

    for (const d of dirs) {
      const nx = cell.gx + d.x;
      const ny = cell.gy + d.y;
      if (this.scene.gridSystem.isRoadCell(nx, ny)) {
        candidates.push(d);
      }
    }

    if (!candidates.length) return;
    const dir = candidates[(Math.random() * candidates.length) | 0];

    // Persona
    const kind = pickPersonaKey();
    const P = PERSONAS[kind];

    const isRoundabout = this.scene.gridSystem.isRoundaboutCell(cell.gx, cell.gy);
    const pos = lanePositionFor(cell.gx, cell.gy, dir, isRoundabout);

    const vehicleKey = this.scene.textures.exists("vehicle_sedan")
      ? getRandomTrafficVehicle()
      : P.tex;

    const spr = this.scene.add
      .image(pos.x, pos.y, vehicleKey)
      .setTint(this.scene.apb ? 0xffea76 : P.tint)
      .setDepth(4)
      .setAlpha(0.95)
      .setScale(0.25);

    spr.setRotation(this.scene.navigationSystem.angleForDir(dir));
    this.scene.worldLayer.add(spr);

    this.traffic.push({
      spr,
      dir,
      kind,
      speedMult: P.mult,
      followGapPx: P.followGapPx || 28,
      lastCell: null, // Track last cell to detect cell changes
      // Roundabout state (old CityScene style)
      inRound: false,
      rbCell: null,
      rbLaps: 0
    });

    if (this.scene._refreshEntityDepths) {
      this.scene._refreshEntityDepths();
    }
  }

  // ===== AI HELPERS =====

  _findCarAhead(t) {
    const result = [];
    for (const other of this.traffic) {
      if (other === t) continue;
      if (other.dir.x !== t.dir.x || other.dir.y !== t.dir.y) continue;

      const dx = other.spr.x - t.spr.x;
      const dy = other.spr.y - t.spr.y;
      const dot = dx * t.dir.x + dy * t.dir.y;
      if (dot <= 0) continue; // behind or lateral

      const dist = Math.sqrt(dx * dx + dy * dy);
      result.push({ other, dist });
    }
    if (!result.length) return null;
    result.sort((a, b) => a.dist - b.dist);
    return result[0];
  }

  _chooseNextDir(cNow, dir) {
    const nav = this.scene.navigationSystem;
    const grid = this.scene.gridSystem;

    const forward = forwardDir(dir);
    const left = nav.turnLeft(dir);
    const right = nav.turnRight(dir);
    const reverse = nav.reverseDir(dir);

    const options = [];

    function addIfRoad(d) {
      const nx = cNow.gx + d.x;
      const ny = cNow.gy + d.y;
      if (grid.isRoadCell(nx, ny)) {
        options.push({ dir: d, cell: { gx: nx, gy: ny } });
      }
    }

    // preference order: forward -> left -> right -> reverse
    addIfRoad(forward);
    addIfRoad(left);
    addIfRoad(right);
    addIfRoad(reverse);

    if (!options.length) return null;

    // tuneable: could randomize among "good" options later;
    // for now, pick the first (preference order)
    return options[0];
  }

  // ===== UPDATE LOOP =====

  update(time, delta) {
    const dt = delta / 1000;
    this.stepTraffic(dt);
  }

  stepTraffic(dt) {
    const grid = this.scene.gridSystem;
    const nav = this.scene.navigationSystem;

    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const t = this.traffic[i];
      const spr = t.spr;

      if (!spr || !spr.active) {
        this.traffic.splice(i, 1);
        continue;
      }

      // APB tint refresh
      if (this.scene.apb) {
        const baseTint = PERSONAS[t.kind]?.tint ?? 0xbfd1ff;
        const blend = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(baseTint),
          Phaser.Display.Color.ValueToColor(0xffea76),
          100,
          70
        );
        spr.setTint(
          Phaser.Display.Color.GetColor(blend.r, blend.g, blend.b)
        );
      }

      const speed = BASE_SPEED * (t.speedMult || 1) * dt;

      // Current cell
      const cNow = grid.pixToCell(spr.x, spr.y);
      const cellKey = `${cNow.gx},${cNow.gy}`;
      const fwdCell = {
        gx: cNow.gx + t.dir.x,
        gy: cNow.gy + t.dir.y
      };

      // Check if we're in a roundabout
      const inRoundabout = grid.isRoundaboutCell(cNow.gx, cNow.gy);
      
      // EXIT CHECKS: Run every frame (not just on cell change!)
      if (inRoundabout && t.inRound) {
        // Decide: should we exit?
        const shouldExit = Math.random() < 0.08; // 8% per frame (increased from 1%)
        
        if (shouldExit) {
          const center = { x: cNow.gx * TILE + TILE / 2, y: cNow.gy * TILE + TILE / 2 };
          const dx = spr.x - center.x;
          const dy = spr.y - center.y;
          const currentAngle = Math.atan2(dy, dx);
          
          // Determine current cardinal direction
          let currentDir;
          const normalizedAngle = ((currentAngle + Math.PI * 2) % (Math.PI * 2));
          if (normalizedAngle >= Math.PI * 7/4 || normalizedAngle < Math.PI * 1/4) {
            currentDir = { x: 1, y: 0 };
          } else if (normalizedAngle >= Math.PI * 1/4 && normalizedAngle < Math.PI * 3/4) {
            currentDir = { x: 0, y: 1 };
          } else if (normalizedAngle >= Math.PI * 3/4 && normalizedAngle < Math.PI * 5/4) {
            currentDir = { x: -1, y: 0 };
          } else {
            currentDir = { x: 0, y: -1 };
          }
          
          const exitDir = nav.exitTurn(currentDir);
          const exitCell = { gx: cNow.gx + exitDir.x, gy: cNow.gy + exitDir.y };
          
          if (grid.isRoadCell(exitCell.gx, exitCell.gy) && !grid.isRoundaboutCell(exitCell.gx, exitCell.gy)) {
            // Exit successfully
            t.dir = exitDir;
            spr.setRotation(nav.angleForDir(exitDir));
            t.inRound = false;
            t.rbCell = null;
            t.rbLaps = 0;
          }
        }
      }

      // Only make turn decisions when entering a NEW cell
      const enteredNewCell = t.lastCell !== cellKey;
      if (enteredNewCell) {
        t.lastCell = cellKey;

        // ENTRY TRACKING: Only update state on cell change
        if (inRoundabout) {
          if (!t.inRound) {
            t.inRound = true;
            t.rbCell = { gx: cNow.gx, gy: cNow.gy };
            t.rbLaps = 0;
          } else {
            if (t.rbCell && cNow.gx === t.rbCell.gx && cNow.gy === t.rbCell.gy) {
              t.rbLaps = (t.rbLaps || 0) + 1;
            }
          }
        }
        // Normal road logic
        else {
          // Reset roundabout state when on normal roads
          t.inRound = false;
          t.rbCell = null;
          t.rbLaps = 0;
          
          // Sometimes turn randomly even when forward is clear (to explore)
          const exploreChance = Math.random() < 0.15; // 15% chance to explore
          
          if (exploreChance || !grid.isRoadCell(fwdCell.gx, fwdCell.gy)) {
            // Get all valid directions (excluding reverse unless necessary)
            const options = [];
            const left = nav.turnLeft(t.dir);
            const right = nav.turnRight(t.dir);
            const reverse = nav.reverseDir(t.dir);
            
            if (grid.isRoadCell(fwdCell.gx, fwdCell.gy)) {
              options.push({ dir: t.dir, weight: 3 }); // Prefer forward (current direction)
            }
            if (grid.isRoadCell(cNow.gx + left.x, cNow.gy + left.y)) {
              options.push({ dir: left, weight: 1 });
            }
            if (grid.isRoadCell(cNow.gx + right.x, cNow.gy + right.y)) {
              options.push({ dir: right, weight: 1 });
            }
            if (grid.isRoadCell(cNow.gx + reverse.x, cNow.gy + reverse.y)) {
              options.push({ dir: reverse, weight: 0.2 }); // Rarely go back
            }
            
            if (options.length > 0) {
              // Weighted random selection
              const totalWeight = options.reduce((sum, opt) => sum + opt.weight, 0);
              let rand = Math.random() * totalWeight;
              
              for (const opt of options) {
                rand -= opt.weight;
                if (rand <= 0) {
                  t.dir = opt.dir;
                  spr.setRotation(nav.angleForDir(t.dir));
                  break;
                }
              }
            } else {
              // No options, despawn
              spr.destroy();
              this.traffic.splice(i, 1);
              continue;
            }
          }
        }
      }

      // Move forward with simple follow-gap
      const ahead = this._findCarAhead(t);
      let actualSpeed = speed;
      
      if (ahead) {
        const desiredGap = t.followGapPx;
        if (ahead.dist < desiredGap && ahead.dist > 0) {
          const ratio = ahead.dist / desiredGap;
          actualSpeed = speed * Math.max(0, Math.min(1, ratio));
        }
      }

      // Calculate new position
      const currentCell = grid.pixToCell(spr.x, spr.y);
      const isInRoundabout = grid.isRoundaboutCell(currentCell.gx, currentCell.gy);
      
      let nx, ny;
      
      if (isInRoundabout && t.inRound) {
        // Special roundabout movement: move along circular path
        const center = {
          x: currentCell.gx * TILE + TILE / 2,
          y: currentCell.gy * TILE + TILE / 2
        };
        
        // Calculate angle from center
        const dx = spr.x - center.x;
        const dy = spr.y - center.y;
        let angle = Math.atan2(dy, dx);
        
        // Move counter-clockwise (decrease angle for right-hand traffic)
        const radius = TILE * 0.25; // Smaller radius
        const angularSpeed = actualSpeed / radius;
        angle -= angularSpeed;
        
        // Calculate new position on ring
        nx = center.x + Math.cos(angle) * radius;
        ny = center.y + Math.sin(angle) * radius;
        
        // Update sprite rotation to face tangent direction
        // For counter-clockwise: tangent is -90° from radius
        // Add 60° to make it look like driving forward (steering into turn)
        spr.setRotation(angle - Math.PI / 2 + Math.PI / 3); // -90° + 60° = driving angle
      } else {
        // Normal straight movement
        nx = spr.x + t.dir.x * actualSpeed;
        ny = spr.y + t.dir.y * actualSpeed;

        // Snap to proper lane position to stay in lane
        const lanePos = lanePositionFor(currentCell.gx, currentCell.gy, t.dir, false);
        
        // Keep lane discipline: snap perpendicular axis to lane center
        if (Math.abs(t.dir.x) > 0) {
          // Moving horizontally -> snap Y to lane
          ny = lanePos.y;
        } else {
          // Moving vertically -> snap X to lane
          nx = lanePos.x;
        }
      }

      spr.x = nx;
      spr.y = ny;

      // Despawn if way off-grid (sanity clean-up)
      const gx = grid.pixToCell(spr.x, spr.y).gx;
      const gy = grid.pixToCell(spr.x, spr.y).gy;
      if (gx < -2 || gx > this.scene.w + 2 || gy < -2 || gy > this.scene.h + 2) {
        spr.destroy();
        this.traffic.splice(i, 1);
      }
    }
  }

  // ===== CLEANUP =====

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