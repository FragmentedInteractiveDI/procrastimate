// FILE: src/game/scenes/systems/NavigationSystem.js
// Turn logic, direction helpers, and lane positioning

import Phaser from "phaser";
import { lanePositionFor } from "./GridSystem.js";

const TILE = 28;
const TRAFFIC_SIDE = "right";
const CAR_ROT_OFFSET = Math.PI / 2;

/**
 * NavigationSystem handles direction calculations, turns, and lane positioning
 */
export class NavigationSystem {
  constructor(scene) {
    this.scene = scene;
  }

  // ========== BASIC DIRECTION HELPERS ==========

  /**
   * Turn right from current direction
   */
  turnRight(d) {
    if (d.x === 1) return { x: 0, y: 1 };
    if (d.x === -1) return { x: 0, y: -1 };
    if (d.y === 1) return { x: -1, y: 0 };
    return { x: 1, y: 0 };
  }

  /**
   * Turn left from current direction
   */
  turnLeft(d) {
    if (d.x === 1) return { x: 0, y: -1 };
    if (d.x === -1) return { x: 0, y: 1 };
    if (d.y === 1) return { x: 1, y: 0 };
    return { x: -1, y: 0 };
  }

  /**
   * Continue straight (copy direction)
   */
  goStraight(d) {
    return { x: d.x, y: d.y };
  }

  /**
   * Reverse direction (180° turn)
   */
  reverseDir(d) {
    return { x: -d.x, y: -d.y };
  }

  // ========== ROUNDABOUT-SPECIFIC TURNS ==========

  /**
   * Circulate turn (for entering/staying in roundabout)
   * Right-hand traffic: turn left (counter-clockwise)
   * Left-hand traffic: turn right (clockwise)
   */
  circulateTurn(d) {
    return TRAFFIC_SIDE === "right" ? this.turnLeft(d) : this.turnRight(d);
  }

  /**
   * Exit turn (for leaving roundabout)
   * Right-hand traffic: turn right (exit)
   * Left-hand traffic: turn left (exit)
   */
  exitTurn(d) {
    return TRAFFIC_SIDE === "right" ? this.turnRight(d) : this.turnLeft(d);
  }

  // ========== DIRECTION ENCODING ==========

  /**
   * Create string code for direction (e.g. "1,0" for east)
   */
  dirCode(d) {
    return `${(Math.sign(d.x) | 0)},${(Math.sign(d.y) | 0)}`;
  }

  /**
   * Calculate rotation angle for a direction
   */
  angleForDir(dir) {
    const dx = (dir && typeof dir.x === "number") ? dir.x : 0;
    const dy = (dir && typeof dir.y === "number") ? dir.y : 0;
    if (!dx && !dy) return 0;
    return Phaser.Math.Angle.Between(0, 0, dx, dy) + CAR_ROT_OFFSET;
  }

  // ========== TURN TYPE CLASSIFICATION ==========

  /**
   * Classify turn type (left, right, or straight)
   */
  turnType(fromDir, toDir) {
    const z = fromDir.x * toDir.y - fromDir.y * toDir.x;
    if (z > 0) return "left";
    if (z < 0) return "right";
    return "straight";
  }

  // ========== LANE POSITIONING ==========

  /**
   * Get a point along the lane within a cell
   * @param {number} gx - Grid X
   * @param {number} gy - Grid Y
   * @param {object} dir - Direction {x, y}
   * @param {number} t - Progress (0-1) through the cell
   * @returns {object} {x, y} position along lane
   */
  lanePointInCell(gx, gy, dir, t) {
    const baseX = gx * TILE;  // Grid-relative
    const baseY = gy * TILE;
    
    if (Math.abs(dir.x) > 0) {
      // Horizontal movement
      const laneY = lanePositionFor(gx, gy, dir, false).y;
      const x0 = dir.x > 0 ? baseX : baseX + TILE;
      const x1 = dir.x > 0 ? baseX + TILE : baseX;
      return { x: x0 + (x1 - x0) * t, y: laneY };
    } else {
      // Vertical movement
      const laneX = lanePositionFor(gx, gy, dir, false).x;
      const y0 = dir.y > 0 ? baseY : baseY + TILE;
      const y1 = dir.y > 0 ? baseY + TILE : baseY;
      return { x: laneX, y: y0 + (y1 - y0) * t };
    }
  }

  /**
   * Snap a position to the correct lane
   */
  laneSnapPoint(gx, gy, dir, x, y) {
    if (Math.abs(dir.x) > 0) {
      const ly = lanePositionFor(gx, gy, dir, false).y;
      return { x, y: ly };
    } else {
      const lx = lanePositionFor(gx, gy, dir, false).x;
      return { x: lx, y };
    }
  }

  /**
   * Get entry position into a cell (slightly inset from edge)
   */
  entryPosition(gx, gy, newDir) {
    const inset = TILE * 0.18;
    const baseX = gx * TILE;  // Grid-relative
    const baseY = gy * TILE;
    
    if (Math.abs(newDir.x) > 0) {
      const x = newDir.x > 0 ? baseX + inset : baseX + TILE - inset;
      const y = lanePositionFor(gx, gy, newDir, false).y;
      return { x, y };
    } else {
      const y = newDir.y > 0 ? baseY + inset : baseY + TILE - inset;
      const x = lanePositionFor(gx, gy, newDir, false).x;
      return { x, y };
    }
  }

  // ========== CORNER CONTROL POINTS ==========

  /**
   * Calculate control point for bezier curve turn
   * Uses lane intersection to avoid diagonal cuts
   * 
   * @param {object} from - Starting point {x, y}
   * @param {object} to - Ending point {x, y}
   * @param {object} fromDir - Incoming direction
   * @param {object} toDir - Outgoing direction
   * @returns {object} Control point {x, y}
   */
  cornerControl(from, to, fromDir, toDir) {
    // For a 90° turn, use intersection of incoming lane Y with outgoing lane X
    
    if (Math.abs(fromDir.x) > 0 && Math.abs(toDir.y) > 0) {
      // Coming horizontally, leaving vertically
      return { x: to.x, y: from.y };
    }
    
    if (Math.abs(fromDir.y) > 0 && Math.abs(toDir.x) > 0) {
      // Coming vertically, leaving horizontally
      return { x: from.x, y: to.y };
    }

    // Fallback (straight or unusual turn) – use midpoint
    return {
      x: (from.x + to.x) * 0.5,
      y: (from.y + to.y) * 0.5,
    };
  }
}

// Export standalone helper functions for use throughout the codebase
export function lanePointInCell(gx, gy, dir, t) {
  const baseX = gx * TILE;
  const baseY = gy * TILE;
  if (Math.abs(dir.x) > 0) {
    const laneY = lanePositionFor(gx, gy, dir, false).y;
    const x0 = dir.x > 0 ? baseX : baseX + TILE;
    const x1 = dir.x > 0 ? baseX + TILE : baseX;
    return { x: x0 + (x1 - x0) * t, y: laneY };
  } else {
    const laneX = lanePositionFor(gx, gy, dir, false).x;
    const y0 = dir.y > 0 ? baseY : baseY + TILE;
    const y1 = dir.y > 0 ? baseY + TILE : baseY;
    return { x: laneX, y: y0 + (y1 - y0) * t };
  }
}

export function laneSnapPoint(gx, gy, dir, x, y) {
  if (Math.abs(dir.x) > 0) {
    const ly = lanePositionFor(gx, gy, dir, false).y;
    return { x, y: ly };
  } else {
    const lx = lanePositionFor(gx, gy, dir, false).x;
    return { x: lx, y };
  }
}

export function entryPosition(gx, gy, newDir) {
  const inset = TILE * 0.18;
  const baseX = gx * TILE;
  const baseY = gy * TILE;
  if (Math.abs(newDir.x) > 0) {
    const x = newDir.x > 0 ? baseX + inset : baseX + TILE - inset;
    const y = lanePositionFor(gx, gy, newDir, false).y;
    return { x, y };
  } else {
    const y = newDir.y > 0 ? baseY + inset : baseY + TILE - inset;
    const x = lanePositionFor(gx, gy, newDir, false).x;
    return { x, y };
  }
}

export function turnType(fromDir, toDir) {
  const z = fromDir.x * toDir.y - fromDir.y * toDir.x;
  if (z > 0) return "left";
  if (z < 0) return "right";
  return "straight";
}