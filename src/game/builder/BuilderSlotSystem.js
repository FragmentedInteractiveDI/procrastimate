// FILE: src/game/builder/BuilderSlotSystem.js
// Manages city layout slots (save/load/switch).
// Slots store ONLY layout + metadata. Inventory is global.
// ES6 MODULE VERSION – includes compatibility layer for BuilderManager.

import { BaseSystem } from "../scenes/systems/BaseSystem.js";

export class BuilderSlotSystem extends BaseSystem {
  static get defaultConfig() {
    return {
      // Builder grid dimensions (engine default)
      GRID_W: 6,
      GRID_H: 6,
      // No other config needed – uses citySlots module
    };
  }

  constructor(config = {}) {
    super(config);

    // Module reference (injected by BuilderManager / React)
    this.citySlotsModule = null;

    // Runtime state
    this.activeSlot = null;
    this.slots = [];
    this.currentLayout = null;

    this.storageHandler = null;
  }

  // Called by BuilderManager right after construction
  setModules(citySlotsModule) {
    this.citySlotsModule = citySlotsModule || null;
  }

  // ---------------------------------------------------------------------------
  // LIFECYCLE
  // ---------------------------------------------------------------------------

  onInitialize() {
    // Ensure we have a slot ID and layout
    const activeId = this.getActiveSlot();
    this.activeSlot = activeId;
    this.slots = this.listSlots();
    this.currentLayout = this.loadSlot(activeId);

    // Listen for slot changes from other tabs/windows
    this.setupStorageListener();

    this.emit("slot:initialized", {
      activeSlot: this.activeSlot,
      layout: this.currentLayout,
      slots: this.slots,
    });
  }

  onUpdate(_time, _delta) {
    // Slot system is event-driven
  }

  onDestroy() {
    if (this.storageHandler && typeof window !== "undefined") {
      window.removeEventListener("storage", this.storageHandler);
    }
  }

  // ---------------------------------------------------------------------------
  // CORE API (new style)
  // ---------------------------------------------------------------------------

  // Get active slot ID (delegates to citySlots module)
  getActiveSlot() {
    try {
      if (!this.citySlotsModule) {
        console.warn(
          "[BuilderSlotSystem] Module not set, using default slot id"
        );
        return "default";
      }

      const { getActiveSlot } = this.citySlotsModule;
      return getActiveSlot() || "default";
    } catch (e) {
      console.error("[BuilderSlotSystem] Failed to get active slot:", e);
      return "default";
    }
  }

  // List all slots
  listSlots() {
    try {
      if (!this.citySlotsModule) return [];
      const { listSlots } = this.citySlotsModule;
      return listSlots() || [];
    } catch (e) {
      console.error("[BuilderSlotSystem] Failed to list slots:", e);
      return [];
    }
  }

  // Load a slot's layout (returns a layout object)
  loadSlot(slotId = null) {
    const id = slotId || this.activeSlot || "default";

    try {
      if (!this.citySlotsModule) {
        return this.getDefaultLayout();
      }

      const { loadSim } = this.citySlotsModule;
      const sim = loadSim(id);

      const layout = this.ensureLayoutShape(
        sim || this.getDefaultLayout()
      );
      this.currentLayout = layout;

      this.emit("slot:loaded", { slotId: id, sim: layout });
      return layout;
    } catch (e) {
      console.error("[BuilderSlotSystem] Failed to load slot:", e);
      const fallback = this.getDefaultLayout();
      this.currentLayout = fallback;
      this.emit("slot:loaded", { slotId: id, sim: fallback, error: e });
      return fallback;
    }
  }

  // Save current layout to slot (layout is full layout object)
  saveSlot(layout, slotId = null) {
    try {
      if (!this.citySlotsModule) {
        return { success: false, reason: "module_not_set" };
      }

      const { saveSim } = this.citySlotsModule;
      const targetSlot = slotId || this.activeSlot || "default";

      const toSave = this.ensureLayoutShape({
        ...(layout || {}),
        meta: {
          ...(layout?.meta || {}),
          kind: layout?.meta?.kind || "city",
          updatedAt: Date.now(),
        },
      });

      saveSim(toSave, targetSlot);

      if (!slotId || targetSlot === this.activeSlot) {
        this.currentLayout = toSave;
      }

      this.emit("slot:saved", { slotId: targetSlot, layout: toSave });

      return { success: true, layout: toSave };
    } catch (e) {
      console.error("[BuilderSlotSystem] Failed to save slot:", e);
      return { success: false, error: e };
    }
  }

  // Switch to a different slot (does NOT touch inventory)
  switchSlot(slotId) {
    try {
      if (!this.citySlotsModule) {
        return { success: false, reason: "module_not_set" };
      }

      const { setActiveSlot } = this.citySlotsModule;
      const success = setActiveSlot(slotId);

      if (success) {
        this.activeSlot = slotId;
        this.currentLayout = this.loadSlot(slotId);
        this.slots = this.listSlots();

        this.emit("slot:switched", {
          slotId,
          layout: this.currentLayout,
          slots: this.slots,
        });

        return { success: true, layout: this.currentLayout };
      }

      return { success: false, reason: "switch_failed" };
    } catch (e) {
      console.error("[BuilderSlotSystem] Failed to switch slot:", e);
      return { success: false, error: e };
    }
  }

  // Create new slot with optional base layout
  createSlot(slotId, baseLayout = null) {
    try {
      if (!this.citySlotsModule) {
        return { success: false, reason: "module_not_set" };
      }

      const { createSlot } = this.citySlotsModule;
      const layout = this.ensureLayoutShape(
        baseLayout || this.getDefaultLayout()
      );

      const success = createSlot(slotId, layout);

      if (success) {
        this.slots = this.listSlots();
        this.emit("slot:created", { slotId, layout });
        return { success: true, layout };
      }

      return { success: false, reason: "create_failed" };
    } catch (e) {
      console.error("[BuilderSlotSystem] Failed to create slot:", e);
      return { success: false, error: e };
    }
  }

  // Delete slot
  deleteSlot(slotId) {
    try {
      if (!this.citySlotsModule) {
        return { success: false, reason: "module_not_set" };
      }

      const { deleteSlot } = this.citySlotsModule;
      const success = deleteSlot(slotId);

      if (success) {
        this.slots = this.listSlots();

        // If deleted active slot, re-sync with module's active slot
        if (slotId === this.activeSlot) {
          this.activeSlot = this.getActiveSlot();
          this.currentLayout = this.loadSlot(this.activeSlot);
        }

        this.emit("slot:deleted", {
          slotId,
          activeSlot: this.activeSlot,
        });
        return { success: true };
      }

      return { success: false, reason: "delete_failed" };
    } catch (e) {
      console.error("[BuilderSlotSystem] Failed to delete slot:", e);
      return { success: false, error: e };
    }
  }

  // Rename slot
  renameSlot(slotId, newName) {
    try {
      if (!this.citySlotsModule) {
        return { success: false, reason: "module_not_set" };
      }

      const { renameSlot } = this.citySlotsModule;
      const success = renameSlot(slotId, newName);

      if (success) {
        this.slots = this.listSlots();
        this.emit("slot:renamed", { slotId, newName });
        return { success: true };
      }

      return { success: false, reason: "rename_failed" };
    } catch (e) {
      console.error("[BuilderSlotSystem] Failed to rename slot:", e);
      return { success: false, error: e };
    }
  }

  // ---------------------------------------------------------------------------
  // LAYOUT HELPERS
  // ---------------------------------------------------------------------------

  // Default layout structure (engine-level)
  getDefaultLayout() {
    const w = this.config.GRID_W ?? 6;
    const h = this.config.GRID_H ?? 6;

    return {
      w,
      h,
      grid: [], // BuilderPlacementSystem owns actual tile content
      meta: {
        name: "New Layout",
        kind: "city",
        updatedAt: Date.now(),
      },
    };
  }

  // Ensure layout has required shape fields
  ensureLayoutShape(sim) {
    const base = sim || {};
    const w = base.w || this.config.GRID_W || 6;
    const h = base.h || this.config.GRID_H || 6;

    return {
      w,
      h,
      grid: Array.isArray(base.grid) ? base.grid : [],
      meta: {
        ...(base.meta || {}),
        kind: base.meta?.kind || "city",
      },
    };
  }

  /**
   * Persist an inventory snapshot to current slot.
   * NOTE: With the hybrid model, this is informational only and
   * MUST NOT be used to drive global inventory reconciliation.
   */
  persistInventory(inventory) {
    const sim = this.loadSlot(this.activeSlot);
    sim.meta = sim.meta || {};
    sim.meta.inv = { ...(inventory || {}) };
    sim.meta.updatedAt = Date.now();

    return this.saveSlot(sim, this.activeSlot);
  }

  /**
   * Load inventory snapshot from current slot.
   * Returns whatever was last stored via persistInventory, or null.
   * Engine should treat this as optional telemetry, not authority.
   */
  loadInventory() {
    const sim = this.currentLayout || this.loadSlot(this.activeSlot);
    const inv = sim?.meta?.inv;
    return inv && typeof inv === "object" ? { ...inv } : null;
  }

  // ---------------------------------------------------------------------------
  // CROSS-TAB SYNC
  // ---------------------------------------------------------------------------

  setupStorageListener() {
    if (typeof window === "undefined") return;

    this.storageHandler = (e) => {
      // Slot cap hit event
      if (e && e.key === "pm_layout_slot_cap_hit_v1") {
        try {
          const payload = JSON.parse(e.newValue || "{}");
          this.emit("slot:cap_hit", { cap: payload.cap });
        } catch {
          // ignore parse errors
        }
        return;
      }

      // General storage change - reload slots and active layout if needed
      this.slots = this.listSlots();
      const newActive = this.getActiveSlot();

      if (newActive !== this.activeSlot) {
        this.activeSlot = newActive;
        this.currentLayout = this.loadSlot(newActive);
        this.emit("slot:external_change", {
          activeSlot: newActive,
          layout: this.currentLayout,
        });
      }
    };

    window.addEventListener("storage", this.storageHandler);
  }

  // ---------------------------------------------------------------------------
  // READ-ONLY HELPERS + COMPAT LAYER
  // ---------------------------------------------------------------------------

  getCurrentLayout() {
    return this.currentLayout;
  }

  getSlots() {
    return this.slots;
  }

  // --- Compatibility for existing BuilderManager calls ---

  // Old name used by BuilderManager
  getActiveSlotId() {
    return this.getActiveSlot();
  }

  // Old name used by BuilderManager
  getSlotLayout(slotId) {
    return this.loadSlot(slotId);
  }

  // Used during BuilderManager bootstrap
  bootstrapInitialSlot() {
    const activeSlot = this.getActiveSlot();
    const layout = this.loadSlot(activeSlot);
    const slots = this.listSlots();
    return { activeSlot, layout, slots };
  }

  // Debug info
  getDebugInfo() {
    const base = super.getDebugInfo();
    return {
      ...base,
      activeSlot: this.activeSlot,
      slotCount: this.slots.length,
      layoutSize: this.currentLayout
        ? `${this.currentLayout.w}×${this.currentLayout.h}`
        : "none",
    };
  }
}
