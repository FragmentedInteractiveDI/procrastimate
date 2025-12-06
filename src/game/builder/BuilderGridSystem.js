// FILE: src/game/builder/BuilderGridSystem.js
// Manages grid dimensions, cell bounds, and unlocked area calculations

import { BaseSystem } from '../scenes/systems/BaseSystem.js';

export class BuilderGridSystem extends BaseSystem {
  static get defaultConfig() {
    return {
      CELL_SIZE: 32,
      BASE_UNLOCK_SIZE: 6,
      GRID_LEVEL_KEY: 'pm_build_grid_level_v1',
      DEFAULT_COLS: 6,  // Builder uses 6x6
      DEFAULT_ROWS: 6,  // Builder uses 6x6
      MIN_SIZE: 6,
    };
  }

  onInitialize() {
    // Grid dimensions - start with default
    this.cols = this.config.DEFAULT_COLS || 6;
    this.rows = this.config.DEFAULT_ROWS || 6;
    this.cellSize = this.config.CELL_SIZE;
    
    // The actual grid data (2D array) - optional, placement system is authoritative
    this.grid = null;
    
    // Unlock level (from Store upgrades)
    this.gridLevel = this.getGridLevelFromStorage();
    
    // Computed unlocked bounds
    this.unlockedBounds = this.computeUnlockedBounds();
    
    // Listen for grid level changes from Store
    this.setupStorageListener();
    
    console.debug('[GridSystem] initialized', { cols: this.cols, rows: this.rows, level: this.gridLevel });
    this.emit('grid:initialized', { cols: this.cols, rows: this.rows });
  }

  onUpdate(time, delta) {
    // Grid system is mostly static, no per-frame updates needed
  }

  onDestroy() {
    if (this.storageHandler) {
      window.removeEventListener('pm_build_grid_changed', this.storageHandler);
      window.removeEventListener('storage', this.storageHandler);
    }
  }

  // Get grid unlock level from localStorage
  getGridLevelFromStorage() {
    if (typeof window === 'undefined') return 0;
    try {
      const v = Number(localStorage.getItem(this.config.GRID_LEVEL_KEY) || '0');
      if (!Number.isFinite(v) || v < 0) return 0;
      return Math.floor(v);
    } catch {
      return 0;
    }
  }

  // **NEW METHOD** - Set grid data and dimensions (called by BuilderManager when loading layout)
  setGrid(grid, w, h) {
    console.debug('[GridSystem] setGrid', { w, h, rows: grid?.length });
    
    if (Array.isArray(grid)) {
      this.grid = grid;
    }
    
    if (w && h) {
      this.setDimensions(w, h);
    } else if (Array.isArray(grid) && grid.length > 0) {
      // Infer dimensions from grid
      const inferredH = grid.length;
      const inferredW = grid[0]?.length || 0;
      if (inferredW && inferredH) {
        this.setDimensions(inferredW, inferredH);
      }
    }
    
    this.emit('grid:set', { cols: this.cols, rows: this.rows, grid: this.grid });
  }

  // Set grid dimensions (when loading a slot)
  setDimensions(cols, rows) {
    const oldCols = this.cols;
    const oldRows = this.rows;
    
    this.cols = Math.max(this.config.MIN_SIZE, cols || this.config.DEFAULT_COLS);
    this.rows = Math.max(this.config.MIN_SIZE, rows || this.config.DEFAULT_ROWS);
    this.unlockedBounds = this.computeUnlockedBounds();
    
    console.debug('[GridSystem] setDimensions', {
      from: `${oldCols}x${oldRows}`,
      to: `${this.cols}x${this.rows}`,
      bounds: this.unlockedBounds
    });
    
    this.emit('grid:resized', { cols: this.cols, rows: this.rows });
  }

  // Compute the unlocked rectangle based on grid level
  computeUnlockedBounds() {
    const cols = this.cols;
    const rows = this.rows;
    const level = this.gridLevel;
    
    if (!cols || !rows) return null;
    
    // For builder, unlock size is BASE_UNLOCK_SIZE (6) regardless of grid level
    // The grid itself is always 6x6 in builder
    const size = Math.max(
      1,
      Math.min(
        Math.min(cols, rows),
        this.config.BASE_UNLOCK_SIZE + Math.max(0, level | 0)
      )
    );

    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const halfW = Math.floor(size / 2);
    const halfH = Math.floor(size / 2);

    let minX = cx - halfW;
    let maxX = minX + size - 1;
    let minY = cy - halfH;
    let maxY = minY + size - 1;

    // Clamp to board
    if (minX < 0) {
      maxX -= minX;
      minX = 0;
    }
    if (maxX >= cols) {
      const diff = maxX - cols + 1;
      minX = Math.max(0, minX - diff);
      maxX = cols - 1;
    }
    if (minY < 0) {
      maxY -= minY;
      minY = 0;
    }
    if (maxY >= rows) {
      const diff = maxY - rows + 1;
      minY = Math.max(0, minY - diff);
      maxY = rows - 1;
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  // Check if a cell is within unlocked bounds
  isCellUnlocked(x, y) {
    if (!this.unlockedBounds) return true;
    const { minX, maxX, minY, maxY } = this.unlockedBounds;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  // Check if coordinates are within grid bounds
  isInBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  // Get all locked cells
  getLockedCells() {
    if (!this.unlockedBounds) return [];
    
    const { minX, maxX, minY, maxY } = this.unlockedBounds;
    const locked = [];
    
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (x < minX || x > maxX || y < minY || y > maxY) {
          locked.push({ x, y });
        }
      }
    }
    
    return locked;
  }

  // Convert grid coordinates to pixel position
  gridToPixel(gx, gy) {
    return {
      x: gx * this.cellSize,
      y: gy * this.cellSize,
    };
  }

  // Convert pixel position to grid coordinates
  pixelToGrid(px, py) {
    return {
      gx: Math.floor(px / this.cellSize),
      gy: Math.floor(py / this.cellSize),
    };
  }

  // Clamp grid coordinates to valid range
  clampToGrid(gx, gy) {
    return {
      gx: Math.max(0, Math.min(this.cols - 1, gx)),
      gy: Math.max(0, Math.min(this.rows - 1, gy)),
    };
  }

  // Setup listener for grid level changes
  setupStorageListener() {
    this.storageHandler = () => {
      const newLevel = this.getGridLevelFromStorage();
      if (newLevel !== this.gridLevel) {
        this.gridLevel = newLevel;
        this.unlockedBounds = this.computeUnlockedBounds();
        this.emit('grid:level_changed', { level: newLevel, bounds: this.unlockedBounds });
      }
    };
    
    window.addEventListener('pm_build_grid_changed', this.storageHandler);
    window.addEventListener('storage', this.storageHandler);
  }

  // Get grid dimensions
  getDimensions() {
    return {
      cols: this.cols,
      rows: this.rows,
      cellSize: this.cellSize,
    };
  }

  // Get unlock info
  getUnlockInfo() {
    return {
      level: this.gridLevel,
      bounds: this.unlockedBounds,
      lockedCellCount: this.getLockedCells().length,
      unlockedCellCount: this.unlockedBounds 
        ? this.unlockedBounds.width * this.unlockedBounds.height 
        : this.cols * this.rows,
    };
  }

  // Debug info
  getDebugInfo() {
    const base = super.getDebugInfo();
    return {
      ...base,
      cols: this.cols,
      rows: this.rows,
      gridLevel: this.gridLevel,
      cellSize: this.cellSize,
      unlockedBounds: this.unlockedBounds,
      hasGrid: this.grid !== null,
    };
  }
}