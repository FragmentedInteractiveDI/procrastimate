// FILE: src/game/scenes/systems/RevealSystem.js
// Fog of war system - tracks exploration and manages visibility

const TILE = 28;
const PADDING = 40;
const REVEAL_KEY_BASE = "pm_city_reveal_v2";

/**
 * Helper: Create unique key for grid cell
 */
const cellKey = (gx, gy) => `${gx},${gy}`;

/**
 * Helper: Get from localStorage with fallback
 */
const lsGet = (k, f) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
};

/**
 * Helper: Create per-slot storage key
 */
function makePerSlotKey(base, slotId) {
  return slotId ? `${base}:${slotId}` : `${base}:default`;
}

/**
 * RevealSystem manages fog of war exploration tracking
 */
export class RevealSystem {
  constructor(scene) {
    this.scene = scene;
    this.revealKey = makePerSlotKey(REVEAL_KEY_BASE, scene.activeSlotId);
    this.reveal = this.loadReveal();
    this.lastCellKey = "";
    this.fogGfx = null; // Will be set by scene
  }

  /**
   * Load reveal data from localStorage
   */
  loadReveal() {
    const raw = lsGet(this.revealKey, null);
    const ok = raw && 
               typeof raw === "object" && 
               raw.w === this.scene.w && 
               raw.h === this.scene.h && 
               raw.cells && 
               typeof raw.cells === "object";
    return ok ? raw : { w: this.scene.w, h: this.scene.h, cells: {} };
  }

  /**
   * Save reveal data to localStorage
   */
  saveReveal() {
    try {
      localStorage.setItem(this.revealKey, JSON.stringify(this.reveal));
    } catch {
      // Ignore localStorage errors
    }
  }

  /**
   * Check if a cell has been revealed
   */
  isRevealed(gx, gy) {
    return !!this.reveal.cells[cellKey(gx, gy)];
  }

  /**
   * Mark a cell as revealed
   * @returns {boolean} true if cell was newly revealed
   */
  markRevealed(gx, gy) {
    // Check bounds
    if (gx < 0 || gy < 0 || gx >= this.scene.w || gy >= this.scene.h) {
      return false;
    }

    const k = cellKey(gx, gy);
    if (this.reveal.cells[k]) {
      return false; // Already revealed
    }

    this.reveal.cells[k] = 1;
    return true; // Newly revealed
  }

  /**
   * Reveal the current cell and adjacent cells around the player
   */
  revealAtCurrentCell(force = false) {
    const { gx, gy } = this.scene.gridSystem.pixToCell(this.scene.car.x, this.scene.car.y);
    const key = cellKey(gx, gy);

    // Avoid redundant work if still in same cell
    if (!force && key === this.lastCellKey) {
      return;
    }

    this.lastCellKey = key;

    // Reveal current cell and neighbors
    let changed = this.markRevealed(gx, gy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      changed = this.markRevealed(gx + dx, gy + dy) || changed;
    }

    // Update fog and minimap if anything changed
    if (changed || force) {
      this.saveReveal();
      this.drawFog();
      this.scene._mmDirty = true;
      this.scene.renderSystem.drawMinimap(true);
    }
  }

  /**
   * Draw fog of war over unrevealed tiles
   */
  drawFog() {
    if (!this.fogGfx) return;

    const g = this.fogGfx;
    g.clear();
    g.fillStyle(0x000000, 0.55);

    for (let y = 0; y < this.scene.h; y++) {
      for (let x = 0; x < this.scene.w; x++) {
        if (!this.isRevealed(x, y)) {
          g.fillRect(PADDING + x * TILE, PADDING + y * TILE, TILE, TILE);
        }
      }
    }
  }

  /**
   * Reset reveal data when layout changes
   */
  reload() {
    this.revealKey = makePerSlotKey(REVEAL_KEY_BASE, this.scene.activeSlotId);
    this.reveal = this.loadReveal();
    this.lastCellKey = "";
  }

  /**
   * Update fog graphics reference (called by scene during create)
   */
  setFogGraphics(fogGfx) {
    this.fogGfx = fogGfx;
  }
}