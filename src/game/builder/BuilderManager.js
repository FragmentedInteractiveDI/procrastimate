// FILE: src/game/builder/BuilderManager.js
// FINAL FIX - Correct order: validate FIRST, charge, THEN place

import { BuilderGridSystem } from "./BuilderGridSystem.js";
import { BuilderInventorySystem } from "./BuilderInventorySystem.js";
import { BuilderPlacementSystem } from "./BuilderPlacementSystem.js";
import { BuilderSlotSystem } from "./BuilderSlotSystem.js";
import { BuilderUISystem } from "./BuilderUISystem.js";

// Tiny internal event emitter (avoid Node 'events' in browser)
class MiniEmitter {
  constructor() {
    this._listeners = {};
  }
  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = new Set();
    this._listeners[event].add(handler);
    return () => this.off(event, handler);
  }
  off(event, handler) {
    const set = this._listeners[event];
    if (set) set.delete(handler);
  }
  emit(event, payload) {
    const set = this._listeners[event];
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error("[BuilderManager] listener error", err);
      }
    }
  }
}

export class BuilderManager extends MiniEmitter {
  constructor(externalDeps = {}) {
    super();

    const { buildInventory, wallet, citySlots } = externalDeps;

    const config = {
      grid: { cols: 6, rows: 6 },
      inventory: {},
      placement: {},
      slot: {},
      ui: {},
    };

    // Core systems
    this.gridSystem = new BuilderGridSystem(config.grid || {});
    this.inventorySystem = new BuilderInventorySystem(config.inventory || {});
    this.placementSystem = new BuilderPlacementSystem(config.placement || {});
    this.slotSystem = new BuilderSlotSystem(config.slot || {});
    this.uiSystem = new BuilderUISystem(config.ui || {});

    // Stitch in external modules
    if (buildInventory && wallet) {
      this.inventorySystem.setModules(buildInventory, wallet);
    }

    if (citySlots) {
      this.slotSystem.setModules(citySlots);
    }

    // Store wallet reference for mate coin spending
    this.walletModule = wallet || null;

    if (typeof this.uiSystem.setInventorySystem === "function") {
      this.uiSystem.setInventorySystem(this.inventorySystem);
    }

    // Initialize systems
    this.gridSystem.initialize(config.grid || {});
    this.inventorySystem.initialize({});
    this.slotSystem.initialize();
    this.placementSystem.initialize({
      grid: this.gridSystem,
      placement: this.placementSystem,
      inventory: this.inventorySystem,
      ui: this.uiSystem,
    });
    this.uiSystem.initialize({
      engine: this,
      grid: this.gridSystem,
      inventory: this.inventorySystem,
      placement: this.placementSystem,
      slot: this.slotSystem,
    });

    this._setupEventHandlers();

    const initialLayout =
      this.slotSystem.getCurrentLayout() ||
      this.slotSystem.loadSlot(this.slotSystem.activeSlot);

    if (initialLayout) {
      this._applyLayoutToEngine(initialLayout);
    }
  }

  _setupEventHandlers() {
    this.inventorySystem.on("inventory:changed", (snapshot) => {
      this.emit("inventory:changed", snapshot);
    });

    this.placementSystem.on("placement:changed", (payload) => {
      this.emit("placement:changed", payload);
    });

    this.slotSystem.on("slot:switched", (payload) => {
      this.emit("slot:switched", payload);
      if (payload?.layout) {
        this._applyLayoutToEngine(payload.layout);
      }
    });

    this.slotSystem.on("slot:saved", (payload) => {
      this.emit("slot:saved", payload);
    });

    this.slotSystem.on("slot:created", (payload) => {
      this.emit("slot:created", payload);
    });

    this.slotSystem.on("slot:deleted", (payload) => {
      this.emit("slot:deleted", payload);
    });

    this.slotSystem.on("slot:external_change", (payload) => {
      this.emit("slot:external_change", payload);
      if (payload?.layout) {
        this._applyLayoutToEngine(payload.layout);
      }
    });
  }

  _applyLayoutToEngine(layout) {
    const w = layout.w || 6;
    const h = layout.h || 6;
    const grid = Array.isArray(layout.grid) ? layout.grid : [];

    if (typeof this.gridSystem.setGrid === "function") {
      this.gridSystem.setGrid(grid, w, h);
    }

    if (typeof this.placementSystem.loadGrid === "function") {
      this.placementSystem.loadGrid(grid, w, h);
    }

    if (typeof this.uiSystem.onLayoutChanged === "function") {
      this.uiSystem.onLayoutChanged({ w, h, grid });
    }

    this.emit("layout:applied", { w, h, grid, meta: layout.meta || {} });
  }

  _collectCurrentLayout() {
    const snapshot =
      typeof this.placementSystem.toGrid === "function"
        ? this.placementSystem.toGrid()
        : null;

    const cols = this.gridSystem.cols || 6;
    const rows = this.gridSystem.rows || 6;

    return {
      w: cols,
      h: rows,
      grid: snapshot || [],
      meta: {
        kind: "city",
        updatedAt: Date.now(),
      },
    };
  }

  getSystems() {
    return {
      grid: this.gridSystem,
      inventory: this.inventorySystem,
      placement: this.placementSystem,
      slot: this.slotSystem,
      ui: this.uiSystem,
    };
  }

  recomputeUsage() {
    if (typeof this.inventorySystem.computeUsage !== "function") {
      return null;
    }
    const layout = this._collectCurrentLayout();
    return this.inventorySystem.computeUsage(layout.grid);
  }

  /**
   * CRITICAL FIX: Proper order
   * 1. Validate placement (DON'T place yet)
   * 2. Calculate cost
   * 3. Charge wallet if needed
   * 4. ONLY THEN actually place the tile
   */
  placeTile(x, y, id, rot = 0) {
    console.debug('[BuilderManager] placeTile START', { x, y, id, rot });
    
    if (!this.placementSystem) {
      console.warn('[BuilderManager] no placement system');
      return { success: false, reason: "no_placement_system" };
    }

    // Step 1: Validate WITHOUT placing yet
    const validation = this.placementSystem.validatePlacement(
      x,
      y,
      id,
      this.gridSystem,
      this.inventorySystem
    );

    if (!validation.valid) {
      console.debug('[BuilderManager] validation failed:', validation.reason);
      return { success: false, reason: validation.reason };
    }

    console.debug('[BuilderManager] validation passed');

    // Step 2: Calculate placement cost
    const currentCount = this.placementSystem.countTileType(id);
    const existing = this.placementSystem.getTileAt(x, y);
    
    // If replacing same tile type, don't increment count
    const effectiveCount = (existing && existing.id === id) 
      ? currentCount 
      : currentCount + 1;

    // IMPORTANT: Use currentCount (before placement) not effectiveCount
    const placementCost = this.inventorySystem.getPlacementCost(id, currentCount);

    console.debug('[BuilderManager] cost calculated:', {
      id,
      currentCount,
      effectiveCount,
      placementCost,
    });

    // Step 3: Charge wallet if there's a cost
    if (placementCost > 0) {
      if (!this.walletModule || !this.walletModule.spendMate) {
        console.warn('[BuilderManager] No wallet module');
        return { success: false, reason: 'no_wallet_module' };
      }

      console.debug('[BuilderManager] charging', placementCost, 'MC');
      
      const spendResult = this.walletModule.spendMate(placementCost, {
        k: 'builder_place',
        tile: id,
        x,
        y,
      });

      // Wallet module returns {ok: true/false} not {success: true/false}
      if (!spendResult.ok) {
        console.warn('[BuilderManager] wallet spend failed:', spendResult);
        return { 
          success: false, 
          reason: 'insufficient_funds',
          cost: placementCost 
        };
      }

      console.debug('[BuilderManager] wallet charged successfully');
    }

    // Step 4: NOW actually place the tile
    console.debug('[BuilderManager] placing tile');
    const res = this.placementSystem.placeTile(x, y, id, rot);
    
    console.debug('[BuilderManager] placement result:', res);
    
    if (res && res.success) {
      // Persist layout to active slot
      const layout = this._collectCurrentLayout();
      this.slotSystem.saveSlot(layout, this.slotSystem.activeSlot);
      
      console.debug('[BuilderManager] tile placed and saved', {
        id,
        x,
        y,
        cost: placementCost,
      });
    } else {
      // CRITICAL: If placement failed AFTER charging, we have a problem
      // This shouldn't happen since we validated first, but log it
      console.error('[BuilderManager] CRITICAL: Placement failed after charging!', {
        chargedAmount: placementCost,
        placementResult: res,
      });
    }
    
    return res;
  }

  removeTile(x, y) {
    if (!this.placementSystem) {
      return { success: false, reason: "no_placement_system" };
    }
    const res = this.placementSystem.removeTile(x, y);
    if (res && res.success) {
      const layout = this._collectCurrentLayout();
      this.slotSystem.saveSlot(layout, this.slotSystem.activeSlot);
    }
    return res;
  }

  loadSlot(slotId) {
    const res = this.slotSystem.switchSlot(slotId);
    if (res && res.success && res.layout) {
      this._applyLayoutToEngine(res.layout);
    }
    return res;
  }

  createSlot(slotId) {
    const baseLayout = this._collectCurrentLayout();
    return this.slotSystem.createSlot(slotId, baseLayout);
  }

  deleteSlot(slotId) {
    return this.slotSystem.deleteSlot(slotId);
  }

  renameSlot(slotId, newName) {
    return this.slotSystem.renameSlot(slotId, newName);
  }

  destroy() {
    try {
      if (this.uiSystem?.destroy) this.uiSystem.destroy();
      if (this.placementSystem?.destroy) this.placementSystem.destroy();
      if (this.inventorySystem?.destroy) this.inventorySystem.destroy();
      if (this.gridSystem?.destroy) this.gridSystem.destroy();
      if (this.slotSystem?.destroy) this.slotSystem.destroy();
    } catch (e) {
      console.error("[BuilderManager] destroy error", e);
    }
  }
}