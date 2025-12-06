// FILE: src/game/builder/BuilderPlacementSystem.js
// Manages tile placement, validation, and rules
// GLOBAL OWNERSHIP MODEL - Final Production Version

import { BaseSystem } from '../scenes/systems/BaseSystem.js';

export class BuilderPlacementSystem extends BaseSystem {
  static get defaultConfig() {
    return {
      // Tile categories
      ROADLIKE: new Set(['road', 'avenue', 'roundabout']),
      BUILDINGS: new Set(['home', 'house', 'park', 'shop', 'hq', 'apb', 'bank', 'garage', 'paintshop']),
      
      // Placement rules
      BUILDINGS_REQUIRE_ROAD: true,
    };
  }

  onInitialize() {
    // Placed tiles map (key: "x,y", value: tile object)
    this.placedTiles = new Map();
    
    // Current selection
    this.selectedTile = 'erase';
    this.rotation = 0;
    
    this.emit('placement:initialized');
  }

  onUpdate(time, delta) {
    // Placement is event-driven
  }

  onDestroy() {
    this.placedTiles.clear();
  }

  // Set selected tile
  setSelected(tileId, rotation = 0) {
    this.selectedTile = tileId;
    this.rotation = rotation;
    this.emit('placement:selected', { tileId, rotation });
  }

  // Rotate current selection
  rotate(degrees = 90) {
    this.rotation = (this.rotation + degrees) % 360;
    this.emit('placement:rotated', { rotation: this.rotation });
  }

  // Get tile key for map
  keyOf(x, y) {
    return `${x},${y}`;
  }

  // Check if position has a tile
  hasTileAt(x, y) {
    return this.placedTiles.has(this.keyOf(x, y));
  }

  // Get tile at position
  getTileAt(x, y) {
    return this.placedTiles.get(this.keyOf(x, y)) || null;
  }

  // Check if tile is road-like
  isRoadLike(tileId) {
    return this.config.ROADLIKE.has(tileId);
  }

  // Check if tile is a building
  isBuilding(tileId) {
    return this.config.BUILDINGS.has(tileId);
  }

  // Check if position has adjacent road
  hasAdjacentRoad(x, y) {
    const neighbors = [
      this.getTileAt(x, y - 1), // north
      this.getTileAt(x, y + 1), // south
      this.getTileAt(x - 1, y), // west
      this.getTileAt(x + 1, y), // east
    ];
    
    return neighbors.some(tile => tile && this.isRoadLike(tile.id));
  }

  // Count how many of a tile type are currently on board
  countTileType(tileId) {
    let count = 0;
    for (const tile of this.placedTiles.values()) {
      if (tile.id === tileId) {
        count++;
      }
    }
    return count;
  }

  // Validate placement using global ownership
  validatePlacement(x, y, tileId, gridSystem, inventorySystem) {
    // Check grid bounds
    if (!gridSystem.isInBounds(x, y)) {
      return { valid: false, reason: 'out_of_bounds' };
    }
    
    // Check if cell is unlocked
    if (!gridSystem.isCellUnlocked(x, y)) {
      return { valid: false, reason: 'locked_area' };
    }
    
    // Check if tile is unlocked (for buildings)
    if (inventorySystem && !inventorySystem.isUnlocked(tileId)) {
      return { valid: false, reason: 'not_unlocked' };
    }
    
    // **GLOBAL OWNERSHIP CHECK**
    if (inventorySystem) {
      const existing = this.getTileAt(x, y);
      const currentCount = this.countTileType(tileId);
      
      // If replacing same tile type, don't increment count
      const effectiveCount = (existing && existing.id === tileId) 
        ? currentCount 
        : currentCount + 1;
      
      const maxAllowed = inventorySystem.getMaxAllowed(tileId);
      
      if (effectiveCount > maxAllowed) {
        return { valid: false, reason: 'max_owned_reached', maxAllowed, currentCount };
      }
    }
    
    // Buildings require adjacent road
    if (this.config.BUILDINGS_REQUIRE_ROAD && this.isBuilding(tileId)) {
      if (!this.hasAdjacentRoad(x, y)) {
        return { valid: false, reason: 'needs_road' };
      }
    }
    
    return { valid: true };
  }

  // Place tile at position (NO inventory mutation)
  placeTile(x, y, tileId, rotation = 0) {
    const key = this.keyOf(x, y);
    const existing = this.placedTiles.get(key);
    
    // Remove existing tile
    if (existing) {
      this.placedTiles.delete(key);
      this.emit('placement:removed', { x, y, tile: existing });
    }
    
    // Place new tile
    const tile = { x, y, id: tileId, rot: rotation };
    this.placedTiles.set(key, tile);
    
    this.emit('placement:placed', { x, y, tile, replaced: existing });
    
    return { success: true, tile, replaced: existing };
  }

  // Remove tile at position (NO inventory mutation)
  removeTile(x, y) {
    const key = this.keyOf(x, y);
    const tile = this.placedTiles.get(key);
    
    if (!tile) {
      return { success: false, reason: 'no_tile' };
    }
    
    this.placedTiles.delete(key);
    this.emit('placement:removed', { x, y, tile });
    
    return { success: true, tile };
  }

  // Clear all tiles
  clearAll() {
    const count = this.placedTiles.size;
    this.placedTiles.clear();
    this.emit('placement:cleared', { count });
    return { success: true, count };
  }

  // Load tiles from array
  loadTiles(tiles) {
    this.placedTiles.clear();
    
    for (const tile of tiles || []) {
      if (tile.x != null && tile.y != null && tile.id) {
        const key = this.keyOf(tile.x, tile.y);
        this.placedTiles.set(key, {
          x: tile.x,
          y: tile.y,
          id: tile.id,
          rot: tile.rot || 0,
        });
      }
    }
    
    console.debug('[PlacementSystem] loadTiles:', this.placedTiles.size, 'tiles loaded');
    this.emit('placement:loaded', { count: this.placedTiles.size });
  }

  // **NEW METHOD** - Load from 2D grid array (called by BuilderManager)
  loadGrid(grid, w, h) {
    console.debug('[PlacementSystem] loadGrid START', { w, h, rows: grid?.length });
    
    this.placedTiles.clear();
    
    if (!Array.isArray(grid)) {
      console.warn('[PlacementSystem] loadGrid: grid is not an array');
      return;
    }
    
    const cols = w || grid[0]?.length || 0;
    const rows = h || grid.length || 0;
    
    let loaded = 0;
    for (let y = 0; y < Math.min(grid.length, rows); y++) {
      const row = grid[y];
      if (!Array.isArray(row)) continue;
      
      for (let x = 0; x < Math.min(row.length, cols); x++) {
        const id = row[x];
        if (id && typeof id === 'string' && id.trim()) {
          const key = this.keyOf(x, y);
          this.placedTiles.set(key, {
            x,
            y,
            id: id.trim(),
            rot: 0,
          });
          loaded++;
        }
      }
    }
    
    console.debug('[PlacementSystem] loadGrid COMPLETE:', loaded, 'tiles loaded');
    this.emit('placement:loaded', { count: loaded });
  }

  // Get all placed tiles as array
  getTilesArray() {
    return Array.from(this.placedTiles.values());
  }

  // Convert to grid format (2D array)
  toGrid(cols, rows) {
    // If cols/rows not provided, infer from placed tiles
    if (!cols || !rows) {
      let maxX = 0;
      let maxY = 0;
      for (const tile of this.placedTiles.values()) {
        if (tile.x > maxX) maxX = tile.x;
        if (tile.y > maxY) maxY = tile.y;
      }
      cols = cols || maxX + 1 || 6;
      rows = rows || maxY + 1 || 6;
    }
    
    const grid = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => '')
    );
    
    for (const tile of this.placedTiles.values()) {
      if (tile.y >= 0 && tile.y < rows && tile.x >= 0 && tile.x < cols) {
        grid[tile.y][tile.x] = tile.id;
      }
    }
    
    return grid;
  }

  // Get tiles that should show as roundabouts (3+ road connections)
  getAutoRoundabouts() {
    const autoRoundabouts = new Set();
    const drivable = new Set();
    
    // Build set of drivable positions
    for (const tile of this.placedTiles.values()) {
      if (this.isRoadLike(tile.id)) {
        drivable.add(this.keyOf(tile.x, tile.y));
      }
    }
    
    // Find roads with 3+ connections
    for (const tile of this.placedTiles.values()) {
      if (tile.id !== 'road' && tile.id !== 'avenue') continue;
      
      const connections = [
        drivable.has(this.keyOf(tile.x, tile.y - 1)),
        drivable.has(this.keyOf(tile.x, tile.y + 1)),
        drivable.has(this.keyOf(tile.x - 1, tile.y)),
        drivable.has(this.keyOf(tile.x + 1, tile.y)),
      ].filter(Boolean).length;
      
      if (connections >= 3) {
        autoRoundabouts.add(this.keyOf(tile.x, tile.y));
      }
    }
    
    return autoRoundabouts;
  }

  // Get statistics
  getStats() {
    const stats = {
      total: this.placedTiles.size,
      byType: {},
    };
    
    for (const tile of this.placedTiles.values()) {
      stats.byType[tile.id] = (stats.byType[tile.id] || 0) + 1;
    }
    
    return stats;
  }

  // Debug info
  getDebugInfo() {
    const base = super.getDebugInfo();
    const stats = this.getStats();
    
    return {
      ...base,
      selectedTile: this.selectedTile,
      rotation: this.rotation,
      placedCount: this.placedTiles.size,
      stats,
    };
  }
}