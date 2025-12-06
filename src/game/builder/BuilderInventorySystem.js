// FILE: src/game/builder/BuilderInventorySystem.js
// Global Ownership Model - Engine Version
// - Tracks global owned counts and unlock state
// - NEVER mutates based on per-slot layouts
// - Per-slot "used / available" is derived via getUsageSnapshot
//
// ES6 MODULE VERSION

import { BaseSystem } from '../scenes/systems/BaseSystem.js';

export class BuilderInventorySystem extends BaseSystem {
  static get defaultConfig() {
    return {
      // One-time unlock costs in MateCoins (0 = always unlocked)
      UNLOCK_COSTS: {
        // Infrastructure - always unlocked
        road: 0,
        avenue: 0,
        roundabout: 0,

        // Housing
        home: 0,   // player's home – always available
        house: 0,  // basic NPC house – starter stack

        // Deco
        park: 0,   // starter deco

        // Business
        shop: 0,       // starter business
        garage: 8000,
        paintshop: 5000,
        bank: 50000,
        hq: 25000,

        // Special
        apb: 0, // APB station is always unlocked for now
      },

      // Minimum starting inventory stacks for a fresh profile
      STARTING_STACKS: {
        home: 1,   // one home
        house: 3,  // a couple houses
        park: 1,
        shop: 1,
        apb: 1,
      },

      // Mate costs for placing tiles (beyond owned count)
      MATE_COSTS: {
        road: 25,      // 25 MC per road beyond owned
        avenue: 8,
        roundabout: 15,
        park: 6,
      },

      // Infrastructure tiles (always start unlocked)
      INFRASTRUCTURE: ['road', 'avenue', 'roundabout'],

      // localStorage key for unlock state
      UNLOCK_STORAGE_KEY: 'pm_builder_unlocks_v1',
    };
  }

  constructor(config = {}) {
    super(config);

    // Store module references (passed in from BuilderManager / React)
    this.buildInventoryModule = null;
    this.walletModule = null;

    // Runtime state (GLOBAL, not per-slot)
    this.inventory = {};
    this.unlockState = {};
  }

  // Set module references (called by BuilderManager)
  setModules(buildInventoryModule, walletModule) {
    this.buildInventoryModule = buildInventoryModule;
    this.walletModule = walletModule;
  }

  onInitialize() {
    console.debug('[BuilderInventorySystem] initializing...');
    
    // Load unlock state first
    this.unlockState = this.loadUnlockState();

    // Load global inventory (with starter stacks ensured)
    this.inventory = this.loadInventory();

    console.debug('[BuilderInventorySystem] loaded inventory:', this.inventory);

    // Infrastructure is always unlocked
    for (const id of this.config.INFRASTRUCTURE) {
      this.unlockState[id] = true;
    }

    // Buildings in starter inventory are unlocked
    for (const [id, count] of Object.entries(this.inventory)) {
      if (count > 0 && !this.config.INFRASTRUCTURE.includes(id)) {
        this.unlockState[id] = true;
      }
    }

    // Persist unlock state
    this.saveUnlockState();

    // Listen for inventory changes from other sources
    this.setupInventoryListener();

    this.emit('inventory:initialized', {
      inventory: this.inventory,
      unlocks: { ...this.unlockState },
    });
  }

  onUpdate(time, delta) {
    // Inventory is event-driven, no per-frame updates
  }

  onDestroy() {
    if (this.inventoryHandler && typeof window !== 'undefined') {
      window.removeEventListener('pm_inventory_changed', this.inventoryHandler);
    }
  }

  // ---------------------------------------------------------------------------
  // UNLOCK STATE
  // ---------------------------------------------------------------------------

  loadUnlockState() {
    const key = this.config.UNLOCK_STORAGE_KEY;
    if (typeof window === 'undefined' || !window.localStorage) {
      return {};
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      console.warn('[BuilderInventorySystem] Failed to load unlock state:', e);
      return {};
    }
  }

  saveUnlockState() {
    const key = this.config.UNLOCK_STORAGE_KEY;
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(this.unlockState || {}));
    } catch (e) {
      console.warn('[BuilderInventorySystem] Failed to save unlock state:', e);
    }
  }

  isUnlocked(tileId) {
    const id = this.normalizeId(tileId);
    const costs = this.config.UNLOCK_COSTS || {};

    // Tiles explicitly listed with cost 0 are always unlocked
    if (Object.prototype.hasOwnProperty.call(costs, id) && costs[id] === 0) {
      return true;
    }

    // Otherwise rely on stored unlock state
    return !!this.unlockState[id];
  }

  getUnlockCost(tileId) {
    const id = this.normalizeId(tileId);
    const costs = this.config.UNLOCK_COSTS || {};
    return costs[id] ?? 0;
  }

  /**
   * One-time unlock purchase for a tile.
   * Does NOT depend on current layout / slots.
   */
  unlockTile(tileId) {
    const id = this.normalizeId(tileId);

    if (this.isUnlocked(id)) {
      return { success: true, already: true, cost: 0 };
    }

    const cost = this.getUnlockCost(id);
    if (cost <= 0) {
      this.unlockState[id] = true;
      this.saveUnlockState();

      // Grant 1 copy to inventory
      this.addToGlobalInventory(id, 1);

      this.emit('inventory:unlocked', { tileId: id, cost: 0 });
      return { success: true, cost: 0 };
    }

    if (!this.walletModule) {
      return { success: false, reason: 'module_not_set' };
    }

    try {
      const { spendMate } = this.walletModule;
      const result = spendMate(cost, {
        k: 'builder_unlock',
        tile: id,
      });

      if (!result.success) {
        return { success: false, reason: 'insufficient_funds' };
      }

      this.unlockState[id] = true;
      this.saveUnlockState();

      // Grant 1 copy to inventory
      this.addToGlobalInventory(id, 1);

      this.emit('inventory:unlocked', { tileId: id, cost });
      return { success: true, cost };
    } catch (e) {
      console.error('[BuilderInventorySystem] Unlock failed:', e);
      return { success: false, reason: 'error', error: e };
    }
  }

  // ---------------------------------------------------------------------------
  // INVENTORY LOAD / NORMALIZE
  // ---------------------------------------------------------------------------

  loadInventory() {
    try {
      if (!this.buildInventoryModule) {
        console.warn('[BuilderInventorySystem] Module not set, using empty inventory');
        return {};
      }

      const { getInventory } = this.buildInventoryModule;
      const raw = getInventory();
      const normalized = this.normalizeInventory(raw);

      // Ensure starter stacks for fresh profiles
      return this.applyStartingStacks(normalized);
    } catch (e) {
      console.warn('[BuilderInventorySystem] Failed to load inventory:', e);
      return {};
    }
  }

  normalizeInventory(raw) {
    const normalized = {};

    for (const [key, value] of Object.entries(raw || {})) {
      const id = this.normalizeId(key);
      normalized[id] = (normalized[id] || 0) + (value | 0);
    }

    return normalized;
  }

  normalizeId(id) {
    if (!id) return '';
    const str = String(id).toLowerCase();

    if (str === 'r') return 'road';
    if (str === 'av') return 'avenue';
    if (str === 'rb' || str === 'round' || str === 'ra') return 'roundabout';
    if (str === 'st' || str === 'start') return 'home';

    return str;
  }

  applyStartingStacks(inventory) {
    const inv = { ...(inventory || {}) };
    const stacks = this.config.STARTING_STACKS || {};

    if (!this.buildInventoryModule) {
      return inv;
    }

    const { addItem } = this.buildInventoryModule;

    for (const [id, minCount] of Object.entries(stacks)) {
      const normId = this.normalizeId(id);
      const have = inv[normId] || 0;
      if (have < minCount) {
        const add = minCount - have;
        try {
          addItem(normId, add);
        } catch (e) {
          console.warn('[BuilderInventorySystem] Failed to add starter stack for', normId, e);
        }
        inv[normId] = minCount;
      }
    }

    return inv;
  }

  // ---------------------------------------------------------------------------
  // GLOBAL OWNERSHIP API (ENGINE-FACING)
  // ---------------------------------------------------------------------------

  getGlobalCount(tileId) {
    const id = this.normalizeId(tileId);
    return this.inventory[id] || 0;
  }

  /**
   * FIXED: Returns the maximum number of this tile allowed on the board.
   * - For tiles with mate costs: Infinity (can buy unlimited with coins)
   * - For owned tiles without mate costs: owned count
   * - This allows PlacementSystem validation to work correctly
   */
  getMaxAllowed(tileId) {
    const id = this.normalizeId(tileId);
    const mateCost = this.getMateCost(id);
    
    // If tile has a mate cost, unlimited placement is allowed
    // (manager will charge coins for placements beyond owned count)
    if (mateCost > 0) {
      return Infinity;
    }
    
    // Otherwise, can only place as many as owned
    return this.getGlobalCount(id);
  }

  /**
   * Count how many of a given tile are present in a placement map.
   * placementMap: Map<key, { id, ... }>
   */
  countOnBoard(tileId, placementMap) {
    const id = this.normalizeId(tileId);
    let count = 0;

    if (!placementMap || typeof placementMap.values !== 'function') {
      return 0;
    }

    for (const tile of placementMap.values()) {
      if (this.normalizeId(tile.id) === id) {
        count++;
      }
    }

    return count;
  }

  /**
   * Simple "free placement allowed?" check.
   * Manager can use this to decide whether to charge MateCoins.
   */
  canPlace(tileId, currentlyPlacedCount) {
    const id = this.normalizeId(tileId);
    const owned = this.getGlobalCount(id);

    // Can place freely if we own more than what's already on board
    return currentlyPlacedCount < owned;
  }

  /**
   * Returns the MateCoin cost for this placement, given how many of this tile
   * are already on the current board. 0 = free (within owned stack).
   */
  getPlacementCost(tileId, currentlyPlacedCount) {
    const id = this.normalizeId(tileId);
    const owned = this.getGlobalCount(id);

    if (currentlyPlacedCount < owned) {
      return 0; // still within owned stack
    }

    return this.getMateCost(id); // beyond owned → soft-cost placement
  }

  // ---------------------------------------------------------------------------
  // INVENTORY QUERIES
  // ---------------------------------------------------------------------------

  getCount(tileId) {
    return this.getGlobalCount(tileId);
  }

  isAvailable(tileId) {
    const id = this.normalizeId(tileId);
    return this.getGlobalCount(id) > 0 || this.getMateCost(id) > 0;
  }

  getMateCost(tileId) {
    const id = this.normalizeId(tileId);
    return this.config.MATE_COSTS[id] || 0;
  }

  getAvailableTiles() {
    const available = [];

    for (const [id, count] of Object.entries(this.inventory)) {
      if (count > 0) {
        available.push(id);
      }
    }

    return available;
  }

  getTileInfo(tileId) {
    const id = this.normalizeId(tileId);
    return {
      id,
      count: this.getCount(id),
      mateCost: this.getMateCost(id),
      unlockCost: this.getUnlockCost(id),
      unlocked: this.isUnlocked(id),
    };
  }

  // Add a tile to global inventory
  addToGlobalInventory(tileId, count = 1) {
    const id = this.normalizeId(tileId);
    if (!id) return;

    try {
      if (this.buildInventoryModule && this.buildInventoryModule.addItem) {
        this.buildInventoryModule.addItem(id, count);
      }

      // Update local cache
      this.inventory[id] = (this.inventory[id] || 0) + count;
      this.emit('inventory:changed', { tileId: id, count: this.inventory[id] });
    } catch (e) {
      console.error('[BuilderInventorySystem] Failed to add item:', e);
    }
  }

  // Remove a tile from global inventory
  removeFromGlobalInventory(tileId, count = 1) {
    const id = this.normalizeId(tileId);
    if (!id) return;

    const currentCount = this.inventory[id] || 0;
    if (currentCount < count) {
      console.warn('[BuilderInventorySystem] Cannot remove more than owned:', {
        id,
        have: currentCount,
        want: count,
      });
      return;
    }

    try {
      if (this.buildInventoryModule && this.buildInventoryModule.consume) {
        this.buildInventoryModule.consume(id, count);
      }

      // Update local cache
      this.inventory[id] = currentCount - count;
      this.emit('inventory:changed', { tileId: id, count: this.inventory[id] });
    } catch (e) {
      console.error('[BuilderInventorySystem] Failed to remove item:', e);
    }
  }

  // Recompute inventory from module (in case it changed externally)
  refreshInventory() {
    this.inventory = this.loadInventory();
    this.emit('inventory:refreshed', { inventory: this.inventory });
  }

  // Setup listener for external inventory changes
  setupInventoryListener() {
    if (typeof window === 'undefined') return;

    this.inventoryHandler = () => {
      console.debug('[BuilderInventorySystem] External inventory change detected');
      this.refreshInventory();
    };

    window.addEventListener('pm_inventory_changed', this.inventoryHandler);
  }

  // Compute usage snapshot for a given grid layout
  computeUsage(grid) {
    const usage = {
      perTile: {},
      owned: {},
      used: {},
      available: {},
    };

    // Count what's on the grid
    if (Array.isArray(grid)) {
      for (const row of grid) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          if (!cell) continue;
          const id = this.normalizeId(cell);
          usage.perTile[id] = (usage.perTile[id] || 0) + 1;
        }
      }
    }

    // Compute owned, used, available for each tile type
    const allIds = new Set([
      ...Object.keys(this.inventory),
      ...Object.keys(usage.perTile),
      ...Object.keys(this.config.MATE_COSTS || {}),
    ]);

    for (const id of allIds) {
      const owned = this.inventory[id] || 0;
      const used = usage.perTile[id] || 0;
      const available = Math.max(0, owned - used);

      usage.owned[id] = owned;
      usage.used[id] = used;
      usage.available[id] = available;
    }

    return usage;
  }

  // Get inventory snapshot
  getInventory() {
    return { ...this.inventory };
  }

  // Debug info
  getDebugInfo() {
    const base = super.getDebugInfo();
    return {
      ...base,
      inventoryCount: Object.keys(this.inventory).length,
      unlockedCount: Object.keys(this.unlockState).filter(k => this.unlockState[k]).length,
      sample: {
        road: this.getTileInfo('road'),
        home: this.getTileInfo('home'),
      },
    };
  }
}