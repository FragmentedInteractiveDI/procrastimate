// FILE: src/game/builder/BuilderUISystem.js
// Manages UI state, tile categories, selections, and unlock UX

import { BaseSystem } from '../scenes/systems/BaseSystem.js';

export class BuilderUISystem extends BaseSystem {
  static get defaultConfig() {
    return {
      // Tile categories for organized UI
      CATEGORIES: {
        infrastructure: {
          name: 'Roads',
          icon: '🛣️',
          color: '#6b7280',
          tiles: ['road', 'avenue', 'roundabout'],
        },
        residential: {
          name: 'Housing',
          icon: '🏠',
          color: '#f59e0b',
          tiles: ['house', 'home'], // house = NPC homes, home = player home
        },
        commercial: {
          name: 'Business',
          icon: '🏢',
          color: '#60a5fa',
          tiles: ['bank', 'paintshop', 'garage', 'shop', 'hq'],
        },
        special: {
          name: 'Special',
          icon: '⭐',
          color: '#fb7185',
          tiles: ['apb'], // Only APB station
        },
        decoration: {
          name: 'Deco',
          icon: '🌳',
          color: '#34d399',
          tiles: ['park'],
        },
      },

      // Static tile metadata (names, icons, base colors)
      TILE_INFO: {
        road:       { name: 'Road', icon: '🛣️', color: '#6b7280' },
        avenue:     { name: 'Avenue', icon: '🛣️', color: '#9ca3af' },
        roundabout: { name: 'Roundabout', icon: '↻', color: '#a3a3a3' },
        home:       { name: 'Player Home', icon: '🏡', color: '#fb7185' }, // Player's starter home
        house:      { name: 'House', icon: '🏠', color: '#f59e0b' },
        park:       { name: 'Park', icon: '🌳', color: '#34d399' },
        shop:       { name: 'Shop', icon: '🏬', color: '#60a5fa' },
        hq:         { name: 'HQ', icon: '🏢', color: '#93c5fd' },
        apb:        { name: 'APB Station', icon: '🚓', color: '#f87171' },
        garage:     { name: 'Garage', icon: '🚗', color: '#38bdf8' },
        paintshop:  { name: 'Paint Shop', icon: '🎨', color: '#f97316' },
        bank:       { name: 'Bank', icon: '🏦', color: '#eab308' },
      },
    };
  }

  onInitialize() {
    // Reference to inventory system (set by BuilderManager / CityBuilder)
    this.inventorySystem = null;

    // Active category
    this.activeCategory = 'infrastructure';

    // UI state
    this.darkMode = true;
    this.showToast = false;
    this.toastMessage = '';
    this.toastTimeout = null;

    // Ghost cursor state
    this.ghostPosition = { x: 0, y: 0 };
    this.ghostVisible = false;

    // Drag mode
    this.dragMode = null; // null | 'place' | 'erase'

    // Unlock modal state
    this.unlockModalOpen = false;

    this.emit('ui:initialized');
  }

  onUpdate(time, delta) {
    // UI state updates are event-driven
  }

  onDestroy() {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  // ---------- Wiring to Inventory / Unlock System ----------

  /**
   * Called by BuilderManager to wire the inventory system into the UI layer.
   * We keep it optional so existing callers don't break.
   */
  setInventorySystem(inventorySystem) {
    this.inventorySystem = inventorySystem || null;
  }

  /**
   * Dynamic info for a tile from the inventory system (counts, unlocks, costs).
   */
  getTileDynamicInfo(tileId) {
    if (this.inventorySystem && typeof this.inventorySystem.getTileInfo === 'function') {
      return this.inventorySystem.getTileInfo(tileId);
    }

    // Safe default if inventory system not wired
    return {
      id: tileId,
      count: 0,
      mateCost: 0,
      unlockCost: 0,
      unlocked: true,
    };
  }

  /**
   * Full view model for a tile: static label + dynamic unlock/inventory state.
   * This is what the React toolbar should use to render badges, gray-out, etc.
   */
  getTileView(tileId) {
    const base = this.getTileInfo(tileId);
    const dyn = this.getTileDynamicInfo(tileId);

    return {
      id: dyn.id || tileId,
      name: base.name,
      icon: base.icon,
      color: base.color,
      count: dyn.count ?? 0,
      mateCost: dyn.mateCost ?? 0,
      unlockCost: dyn.unlockCost ?? 0,
      unlocked: dyn.unlocked !== false, // default to true if undefined
    };
  }

  /**
   * Attempt to unlock a building via the inventory system (MateCoins).
   * Emits events and uses toast for feedback.
   */
  requestUnlock(tileId) {
    const id = tileId;

    if (!this.inventorySystem || typeof this.inventorySystem.unlockTile !== 'function') {
      this.showToastMessage('Unlock system unavailable');
      return { success: false, reason: 'no_inventory_system' };
    }

    const result = this.inventorySystem.unlockTile(id);

    if (result.success) {
      const info = this.getTileInfo(id);
      this.showToastMessage(`${info.name} unlocked!`);
    } else if (result.reason === 'insufficient_funds') {
      this.showToastMessage('Not enough MateCoins to unlock');
    } else if (!result.already) {
      this.showToastMessage('Unlock failed');
    }

    this.emit('ui:unlock_attempted', {
      tileId: id,
      result,
    });

    // Also refresh UI consumers (toolbars, modals)
    this.emit('ui:unlock_state_changed', {
      tileId: id,
      unlocked: this.inventorySystem.isUnlocked
        ? this.inventorySystem.isUnlocked(id)
        : true,
    });

    return result;
  }

  // ---------- Categories / Tiles ----------

  // Get all categories
  getCategories() {
    return this.config.CATEGORIES;
  }

  // Get category by ID
  getCategory(categoryId) {
    return this.config.CATEGORIES[categoryId] || null;
  }

  // Get static tile info
  getTileInfo(tileId) {
    return this.config.TILE_INFO[tileId] || {
      name: tileId,
      icon: '❓',
      color: '#999999',
    };
  }

  // Set active category
  setActiveCategory(categoryId) {
    if (this.config.CATEGORIES[categoryId]) {
      this.activeCategory = categoryId;
      this.emit('ui:category_changed', { categoryId });
      return true;
    }
    return false;
  }

  // Get active category
  getActiveCategory() {
    return this.activeCategory;
  }

  // Get raw tile ids for active category
  getActiveCategoryTiles() {
    const category = this.config.CATEGORIES[this.activeCategory];
    return category ? category.tiles : [];
  }

  /**
   * Get full view models for tiles in the active category.
   * React should prefer this over getActiveCategoryTiles() when rendering.
   */
  getActiveCategoryTileViews() {
    return this.getActiveCategoryTiles().map((id) => this.getTileView(id));
  }

  /**
   * Get view models for all tiles by category.
   * Useful for the Unlock Buildings modal.
   */
  getAllCategoryTileViews() {
    const result = {};
    const cats = this.config.CATEGORIES || {};

    for (const [catId, cat] of Object.entries(cats)) {
      result[catId] = (cat.tiles || []).map((id) => this.getTileView(id));
    }

    return result;
  }

  // ---------- Toasts ----------

  // Show toast message
  showToastMessage(message, duration = 1600) {
    this.showToast = true;
    this.toastMessage = message;

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    this.toastTimeout = setTimeout(() => {
      this.showToast = false;
      this.toastMessage = '';
      this.emit('ui:toast_hidden');
    }, duration);

    this.emit('ui:toast_shown', { message, duration });
  }

  // Hide toast
  hideToast() {
    this.showToast = false;
    this.toastMessage = '';

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }

    this.emit('ui:toast_hidden');
  }

  // Get toast state
  getToast() {
    return {
      visible: this.showToast,
      message: this.toastMessage,
    };
  }

  // ---------- Dark mode ----------

  // Set dark mode
  setDarkMode(enabled) {
    this.darkMode = enabled;
    this.emit('ui:dark_mode_changed', { enabled });
  }

  // Get dark mode
  getDarkMode() {
    return this.darkMode;
  }

  // ---------- Ghost cursor ----------

  // Set ghost cursor position
  setGhostPosition(x, y) {
    this.ghostPosition = { x, y };
    this.emit('ui:ghost_moved', { x, y });
  }

  // Show/hide ghost cursor
  setGhostVisible(visible) {
    this.ghostVisible = visible;
    this.emit('ui:ghost_visibility_changed', { visible });
  }

  // Get ghost state
  getGhost() {
    return {
      position: this.ghostPosition,
      visible: this.ghostVisible,
    };
  }

  // ---------- Drag mode ----------

  // Set drag mode
  setDragMode(mode) {
    this.dragMode = mode;
    this.emit('ui:drag_mode_changed', { mode });
  }

  // Get drag mode
  getDragMode() {
    return this.dragMode;
  }

  // ---------- Unlock modal state ----------

  openUnlockModal() {
    this.unlockModalOpen = true;
    this.emit('ui:unlock_modal_opened');
  }

  closeUnlockModal() {
    this.unlockModalOpen = false;
    this.emit('ui:unlock_modal_closed');
  }

  isUnlockModalOpen() {
    return this.unlockModalOpen;
  }

  // ---------- Debug ----------

  getDebugInfo() {
    const base = super.getDebugInfo();
    return {
      ...base,
      activeCategory: this.activeCategory,
      darkMode: this.darkMode,
      toastVisible: this.showToast,
      dragMode: this.dragMode,
      unlockModalOpen: this.unlockModalOpen,
    };
  }
}
