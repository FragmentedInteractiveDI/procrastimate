// FILE: src/game/scenes/systems/GridSystem.js
// Grid calculations, cell math, road detection, and spatial queries
// NOW EXTENDS BaseSystem for lifecycle management

import { BaseSystem } from './BaseSystem.js';

const TILE = 28;
const LANE_OFFSET = Math.round(TILE * 0.18);
const NO_UTURN_NEAR_RB_CELLS = 1;

/**
 * Helper: Normalize cell string to base type
 */
function normBase(cell) {
  if (!cell) return "empty";
  const str = String(cell);
  const at = str.indexOf("@");
  const raw = at === -1 ? str : str.slice(0, at);
  switch (raw) {
    case "r":
    case "road":
      return "road";
    case "av":
    case "avenue":
      return "avenue";
    case "rb":
    case "roundabout":
      return "roundabout";
    case "home":
    case "h":
      return "home";
    case "house":
      return "house";
    case "s":
    case "shop":
      return "shop";
    case "p":
    case "park":
      return "park";
    case "hq":
      return "hq";
    case "st":
    case "start":
      return "start";
    default:
      return raw;
  }
}

/**
 * Get lane position for a given cell and direction
 */
export function lanePositionFor(gx, gy, dir, isRoundabout) {
  const cx = gx * TILE + TILE / 2; // Grid-relative (no PADDING)
  const cy = gy * TILE + TILE / 2;

  // Regular roads: offset to create two lanes (US right-hand traffic)
  if (!isRoundabout) {
    // For horizontal roads (moving east/west)
    if (Math.abs(dir.x) > 0) {
      const yOffset = dir.x > 0 ? LANE_OFFSET : -LANE_OFFSET;
      return { x: cx, y: cy + yOffset };
    }
    // For vertical roads (moving north/south)
    else {
      const xOffset = dir.y > 0 ? -LANE_OFFSET : LANE_OFFSET;
      return { x: cx + xOffset, y: cy };
    }
  }

  // Roundabouts: offset along a ring path (counter-clockwise for right-hand traffic)
  const ring = Math.round(TILE * 0.25);
  if (dir.x > 0) return { x: cx, y: cy + ring };
  if (dir.x < 0) return { x: cx, y: cy - ring };
  if (dir.y > 0) return { x: cx - ring, y: cy };
  return { x: cx + ring, y: cy };
}

/**
 * GridSystem handles all spatial calculations and grid queries
 * NOW EXTENDS BaseSystem for proper lifecycle management
 */
export class GridSystem extends BaseSystem {
  static dependencies = [];
  
  static defaultConfig = {
    tileSize: TILE,
    laneOffset: LANE_OFFSET,
    noUturnNearRbCells: NO_UTURN_NEAR_RB_CELLS
  };

  constructor(scene, dependencies = {}, eventBus = null, config = {}) {
    super(scene, dependencies, eventBus, config);
  }

  onInitialize() {
    // GridSystem is ready immediately - no async setup needed
    this.emit('grid:initialized', { w: this.scene.w, h: this.scene.h });
  }

  // ========== BASIC GRID QUERIES ==========

  pixToCell(px, py) {
    return { gx: Math.floor(px / TILE), gy: Math.floor(py / TILE) };
  }

  isInsideGrid(gx, gy) {
    return gx >= 0 && gy >= 0 && gx < this.scene.w && gy < this.scene.h;
  }

  isRoadCell(gx, gy) {
    return this.isInsideGrid(gx, gy) && this.scene.drive[gy][gx];
  }

  isRoadPixel(px, py) {
    const { gx, gy } = this.pixToCell(px, py);
    return this.isRoadCell(gx, gy);
  }

  leaveWorld(nx, ny) {
    const { gx, gy } = this.pixToCell(nx, ny);
    return !this.isInsideGrid(gx, gy);
  }

  isRoadTile(gx, gy) {
    if (gy < 0 || gy >= this.scene.h || gx < 0 || gx >= this.scene.w) return false;
    const b = normBase(this.scene.grid[gy]?.[gx]);
    return b === "road" || b === "avenue" || b === "roundabout";
  }

  isRoundaboutCell(gx, gy) {
    return normBase(this.scene.grid[gy]?.[gx]) === "roundabout";
  }

  roadNeighbors(gx, gy) {
    return {
      n: this.isRoadTile(gx, gy - 1),
      s: this.isRoadTile(gx, gy + 1),
      w: this.isRoadTile(gx - 1, gy),
      e: this.isRoadTile(gx + 1, gy)
    };
  }

  roadOrientation(gx, gy) {
    const nb = this.roadNeighbors(gx, gy);
    const horiz = nb.w || nb.e;
    const vert = nb.n || nb.s;
    if (horiz && !vert) return "h";
    if (vert && !horiz) return "v";
    return Math.random() < 0.5 ? "h" : "v";
  }

  isRoundaboutNeighbor(gx, gy) {
    for (let dx = -NO_UTURN_NEAR_RB_CELLS; dx <= NO_UTURN_NEAR_RB_CELLS; dx++) {
      for (let dy = -NO_UTURN_NEAR_RB_CELLS; dy <= NO_UTURN_NEAR_RB_CELLS; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (this.isInsideGrid(x, y) && this.isRoundaboutCell(x, y)) return true;
      }
    }
    return false;
  }

  edgeRoadCells() {
    const cells = [];
    for (let x = 0; x < this.scene.w; x++) {
      if (this.isRoadCell(x, 0) && this.isRoadCell(x, 1))
        cells.push({ gx: x, gy: 0, dir: { x: 0, y: 1 } });
      if (this.isRoadCell(x, this.scene.h - 1) && this.isRoadCell(x, this.scene.h - 2))
        cells.push({ gx: x, gy: this.scene.h - 1, dir: { x: 0, y: -1 } });
    }
    for (let y = 0; y < this.scene.h; y++) {
      if (this.isRoadCell(0, y) && this.isRoadCell(1, y))
        cells.push({ gx: 0, gy: y, dir: { x: 1, y: 0 } });
      if (this.isRoadCell(this.scene.w - 1, y) && this.isRoadCell(this.scene.w - 2, y))
        cells.push({ gx: this.scene.w - 1, gy: y, dir: { x: -1, y: 0 } });
    }
    return cells;
  }

  edgePosition(gx, gy, newDir) {
    if (Math.abs(newDir.x) > 0) {
      const x = (gx + (newDir.x > 0 ? 1 : 0)) * TILE;
      const y = lanePositionFor(gx, gy, newDir, this.isRoundaboutCell(gx, gy)).y;
      return { x, y };
    } else {
      const y = (gy + (newDir.y > 0 ? 1 : 0)) * TILE;
      const x = lanePositionFor(gx, gy, newDir, this.isRoundaboutCell(gx, gy)).x;
      return { x, y };
    }
  }

  cellProgress(dir, x, y, baseX, baseY) {
    if (Math.abs(dir.x) > 0) {
      return dir.x > 0 ? (x - baseX) / TILE : (baseX + TILE - x) / TILE;
    }
    return dir.y > 0 ? (y - baseY) / TILE : (baseY + TILE - y) / TILE;
  }

  canPlanTurnFrom(cNow, _dir, chooseDir, nowSec) {
    const first = { x: cNow.gx + chooseDir.x, y: cNow.gy + chooseDir.y };
    const second = { x: first.x + chooseDir.x, y: first.y + chooseDir.y };

    if (!this.scene.trafficSystem || !this.scene.trafficSystem.canEnterLane) {
      console.warn("TrafficSystem not ready in canPlanTurnFrom");
      return null;
    }

    const ok1 =
      this.isRoadCell(first.x, first.y) &&
      this.scene.trafficSystem.canEnterLane(first.x, first.y, chooseDir, nowSec);
    const ok2 = this.isRoadCell(second.x, second.y);
    return ok1 && ok2 ? { first, second } : null;
  }

  trueCulDeSac(cNow, dir) {
    const f1 = { x: cNow.gx + dir.x, y: cNow.gy + dir.y };
    if (this.isRoadCell(f1.x, f1.y)) {
      const l = this.scene.navigationSystem.turnLeft(dir);
      const r = this.scene.navigationSystem.turnRight(dir);
      const l1 = { x: f1.x + l.x, y: f1.y + l.y };
      const r1 = { x: f1.x + r.x, y: f1.y + r.y };
      const f2 = { x: f1.x + dir.x, y: f1.y + dir.y };
      if (
        this.isRoadCell(l1.x, l1.y) ||
        this.isRoadCell(r1.x, r1.y) ||
        this.isRoadCell(f2.x, f2.y)
      ) {
        return false;
      }
      return true;
    }
    const nearRB =
      this.isRoundaboutCell(cNow.gx, cNow.gy) ||
      this.isRoundaboutNeighbor(cNow.gx, cNow.gy);
    return !nearRB;
  }
}