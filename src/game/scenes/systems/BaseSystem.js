// FILE: src/game/scenes/systems/BaseSystem.js
// Abstract base class for all game systems
// Provides standard lifecycle, config validation, and state management

import { SystemState } from './SystemManager.js';

/**
 * BaseSystem - Abstract base class for all systems
 * 
 * Provides:
 * - Standard lifecycle hooks (initialize, update, pause, resume, destroy)
 * - Config validation
 * - State management
 * - Event bus integration
 * - Performance tracking
 * - Serialization support
 * 
 * Subclasses should:
 * - Call super() in constructor
 * - Override lifecycle methods as needed
 * - Define static dependencies array
 * - Define static defaultConfig object
 * - Implement validateConfig() if needed
 */
export class BaseSystem {
  /**
   * System dependencies (override in subclass)
   * @type {string[]}
   */
  static dependencies = [];

  /**
   * Default configuration (override in subclass)
   * @type {object}
   */
  static defaultConfig = {};

  /**
   * Constructor
   * @param {object} scene - Phaser scene reference
   * @param {object} dependencies - Injected dependency systems
   * @param {object} eventBus - Event bus for pub/sub
   * @param {object} config - System configuration
   */
  constructor(scene, dependencies = {}, eventBus = null, config = {}) {
    this.scene = scene;
    this.deps = dependencies;
    this.eventBus = eventBus;
    
    // Merge config with defaults
    this.config = this._mergeConfig(config);
    
    // Validate config
    this._validateConfig();
    
    // State
    this.state = SystemState.UNINITIALIZED;
    this.enabled = true;
    
    // Metrics
    this.metrics = {
      updateCount: 0,
      updateTime: 0,
      avgUpdateTime: 0,
      errors: 0
    };
  }

  // ========== CONFIG ==========

  /**
   * Merge user config with defaults
   * @param {object} userConfig - User-provided config
   * @returns {object} Merged config
   */
  _mergeConfig(userConfig) {
    return {
      ...this.constructor.defaultConfig,
      ...userConfig
    };
  }

  /**
   * Validate configuration
   * Override in subclass for custom validation
   */
  _validateConfig() {
    const errors = this.validateConfig(this.config);
    if (errors.length > 0) {
      console.warn(`[${this.constructor.name}] Config validation warnings:`, errors);
    }
  }

  /**
   * Validate config (override in subclass)
   * @param {object} config - Configuration to validate
   * @returns {string[]} Array of error messages (empty if valid)
   */
  validateConfig(config) {
    return [];
  }

  /**
   * Apply new configuration
   * @param {object} newConfig - New configuration
   */
  applyConfig(newConfig) {
    this.config = this._mergeConfig(newConfig);
    this._validateConfig();
    this.onConfigChanged(this.config);
  }

  /**
   * Called when config changes (override in subclass)
   * @param {object} newConfig - New configuration
   */
  onConfigChanged(newConfig) {
    // Override in subclass
  }

  // ========== LIFECYCLE ==========

  /**
   * Initialize system (override in subclass)
   * Called once when system is created
   */
  async initialize() {
    this.state = SystemState.READY;
    this.onInitialize();
  }

  /**
   * Called after initialization (override in subclass)
   */
  onInitialize() {
    // Override in subclass
  }

  /**
   * Update system (override in subclass)
   * Called every frame
   * @param {number} time - Total elapsed time
   * @param {number} delta - Delta time since last frame
   */
  update(time, delta) {
    if (!this.enabled || this.state !== SystemState.READY) return;

    const start = performance.now();
    
    try {
      this.onUpdate(time, delta);
      
      // Track metrics
      const updateTime = performance.now() - start;
      this.metrics.updateTime = updateTime;
      this.metrics.updateCount++;
      this.metrics.avgUpdateTime = 
        (this.metrics.avgUpdateTime * (this.metrics.updateCount - 1) + updateTime) / 
        this.metrics.updateCount;
    } catch (error) {
      this.metrics.errors++;
      console.error(`[${this.constructor.name}] Update error:`, error);
      
      // Disable after too many errors
      if (this.metrics.errors > 10) {
        this.enabled = false;
        this.state = SystemState.ERROR;
        console.error(`[${this.constructor.name}] Disabled due to repeated errors`);
      }
    }
  }

  /**
   * Called on update (override in subclass)
   * @param {number} time - Total elapsed time
   * @param {number} delta - Delta time
   */
  onUpdate(time, delta) {
    // Override in subclass
  }

  /**
   * Pause system
   */
  pause() {
    if (this.state !== SystemState.READY) return;
    this.state = SystemState.PAUSED;
    this.onPause();
  }

  /**
   * Called when paused (override in subclass)
   */
  onPause() {
    // Override in subclass
  }

  /**
   * Resume system
   */
  resume() {
    if (this.state !== SystemState.PAUSED) return;
    this.state = SystemState.READY;
    this.onResume();
  }

  /**
   * Called when resumed (override in subclass)
   */
  onResume() {
    // Override in subclass
  }

  /**
   * Reset system to initial state
   */
  reset() {
    this.onReset();
    this.metrics = {
      updateCount: 0,
      updateTime: 0,
      avgUpdateTime: 0,
      errors: 0
    };
  }

  /**
   * Called when reset (override in subclass)
   */
  onReset() {
    // Override in subclass
  }

  /**
   * Destroy system and clean up
   */
  destroy() {
    this.state = SystemState.DESTROYED;
    this.enabled = false;
    this.onDestroy();
  }

  /**
   * Called when destroyed (override in subclass)
   */
  onDestroy() {
    // Override in subclass
  }

  // ========== STATE ==========

  /**
   * Enable system
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable system
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Check if system is ready
   * @returns {boolean}
   */
  isReady() {
    return this.state === SystemState.READY && this.enabled;
  }

  /**
   * Check if system is paused
   * @returns {boolean}
   */
  isPaused() {
    return this.state === SystemState.PAUSED;
  }

  // ========== EVENTS ==========

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.eventBus) {
      this.eventBus.emit(event, data);
    }
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {function} handler - Event handler
   * @returns {object} Subscription
   */
  on(event, handler) {
    if (this.eventBus) {
      return this.eventBus.on(event, handler, this);
    }
    return null;
  }

  /**
   * Subscribe once to an event
   * @param {string} event - Event name
   * @param {function} handler - Event handler
   */
  once(event, handler) {
    if (this.eventBus) {
      this.eventBus.once(event, handler, this);
    }
  }

  // ========== SERIALIZATION ==========

  /**
   * Serialize system state for save/load
   * Override in subclass to save custom data
   * @returns {object} Serialized state
   */
  serialize() {
    return {
      enabled: this.enabled,
      state: this.state,
      config: this.config
    };
  }

  /**
   * Deserialize system state
   * Override in subclass to load custom data
   * @param {object} data - Serialized state
   */
  deserialize(data) {
    if (data.enabled !== undefined) this.enabled = data.enabled;
    if (data.state !== undefined) this.state = data.state;
    if (data.config !== undefined) this.applyConfig(data.config);
  }

  // ========== METRICS ==========

  /**
   * Get system metrics
   * @returns {object} Metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      updateCount: 0,
      updateTime: 0,
      avgUpdateTime: 0,
      errors: 0
    };
  }

  // ========== DEBUG ==========

  /**
   * Get debug info
   * @returns {object} Debug information
   */
  getDebugInfo() {
    return {
      name: this.constructor.name,
      state: this.state,
      enabled: this.enabled,
      metrics: this.getMetrics(),
      config: this.config
    };
  }

  /**
   * Print debug info to console
   */
  printDebugInfo() {
    console.log(`[${this.constructor.name}] Debug Info:`, this.getDebugInfo());
  }
}