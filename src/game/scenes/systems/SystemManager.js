// FILE: src/game/scenes/systems/SystemManager.js
// Central coordinator for all game systems
// Handles initialization order, dependency injection, lifecycle, and error boundaries

import { EventBus, EVENTS } from './EventBus.js';

/**
 * System lifecycle states
 */
export const SystemState = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  PAUSED: 'paused',
  ERROR: 'error',
  DESTROYED: 'destroyed'
};

/**
 * SystemManager - Coordinates all game systems
 * 
 * Features:
 * - Automatic initialization order based on dependencies
 * - Dependency injection
 * - Lifecycle management (init, pause, resume, destroy)
 * - Error boundaries (one system crash doesn't kill everything)
 * - Performance monitoring
 * - Event bus integration
 * 
 * Usage:
 * const manager = new SystemManager(scene);
 * manager.register([
 *   { name: 'grid', class: GridSystem },
 *   { name: 'traffic', class: TrafficSystem, deps: ['grid', 'navigation'] }
 * ]);
 * manager.initializeAll();
 */
export class SystemManager {
  constructor(scene) {
    this.scene = scene;
    this.systems = new Map();
    this.systemStates = new Map();
    this.systemMetrics = new Map();
    this.eventBus = new EventBus();
    this.debugMode = false;
  }

  // ========== REGISTRATION ==========

  /**
   * Register a system
   * @param {object} config - System configuration
   *   { name: string, class: Class, deps: string[], config: object }
   */
  registerSystem(config) {
    const { name, class: SystemClass, deps = [], config: systemConfig = {} } = config;

    if (this.systems.has(name)) {
      console.warn(`System '${name}' already registered, skipping`);
      return;
    }

    // Store system definition
    this.systems.set(name, {
      name,
      SystemClass,
      deps,
      config: systemConfig,
      instance: null
    });

    this.systemStates.set(name, SystemState.UNINITIALIZED);
    this.systemMetrics.set(name, {
      initTime: 0,
      updateTime: 0,
      updateCount: 0,
      errors: 0
    });

    if (this.debugMode) {
      console.log(`[SystemManager] Registered system: ${name}`);
    }
  }

  /**
   * Register multiple systems
   * @param {array} configs - Array of system configurations
   */
  register(configs) {
    for (const config of configs) {
      this.registerSystem(config);
    }
  }

  // ========== INITIALIZATION ==========

  /**
   * Resolve initialization order based on dependencies
   * @returns {array} Ordered system names
   */
  _resolveInitOrder() {
    const order = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (name) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected involving system: ${name}`);
      }

      visiting.add(name);

      const system = this.systems.get(name);
      if (!system) {
        throw new Error(`System '${name}' not registered (required as dependency)`);
      }

      // Visit dependencies first
      for (const dep of system.deps) {
        visit(dep);
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    // Visit all systems
    for (const name of this.systems.keys()) {
      visit(name);
    }

    return order;
  }

  /**
   * Initialize a single system
   * @param {string} name - System name
   * @returns {boolean} Success
   */
  async initializeSystem(name) {
    const systemDef = this.systems.get(name);
    if (!systemDef) {
      console.error(`System '${name}' not registered`);
      return false;
    }

    // Check if already initialized
    if (this.systemStates.get(name) === SystemState.READY) {
      return true;
    }

    try {
      this.systemStates.set(name, SystemState.INITIALIZING);

      const start = performance.now();

      // Gather dependencies
      const deps = {};
      for (const depName of systemDef.deps) {
        const depSystem = this.systems.get(depName);
        if (!depSystem || !depSystem.instance) {
          throw new Error(`Dependency '${depName}' not initialized`);
        }
        deps[depName] = depSystem.instance;
      }

      // Create instance
      const instance = new systemDef.SystemClass(this.scene, deps, this.eventBus);
      systemDef.instance = instance;

      // Initialize
      if (instance.initialize) {
        await instance.initialize();
      }

      const initTime = performance.now() - start;
      this.systemMetrics.get(name).initTime = initTime;

      this.systemStates.set(name, SystemState.READY);
      this.eventBus.emit(EVENTS.SYSTEM_INITIALIZED, { name, initTime });

      if (this.debugMode) {
        console.log(`[SystemManager] Initialized ${name} in ${initTime.toFixed(2)}ms`);
      }

      return true;
    } catch (error) {
      console.error(`Failed to initialize system '${name}':`, error);
      this.systemStates.set(name, SystemState.ERROR);
      this.systemMetrics.get(name).errors++;
      return false;
    }
  }

  /**
   * Initialize all systems in dependency order
   */
  async initializeAll() {
    const order = this._resolveInitOrder();

    if (this.debugMode) {
      console.log('[SystemManager] Initialization order:', order);
    }

    for (const name of order) {
      const success = await this.initializeSystem(name);
      if (!success) {
        console.error(`System initialization failed at: ${name}`);
        // Continue with other systems (graceful degradation)
      }
    }
  }

  // ========== LIFECYCLE ==========

  /**
   * Pause a system
   * @param {string} name - System name
   */
  pauseSystem(name) {
    const system = this.getSystem(name);
    if (!system) return;

    try {
      if (system.pause) {
        system.pause();
      }
      this.systemStates.set(name, SystemState.PAUSED);
      this.eventBus.emit(EVENTS.SYSTEM_PAUSED, { name });
    } catch (error) {
      console.error(`Error pausing system '${name}':`, error);
    }
  }

  /**
   * Resume a system
   * @param {string} name - System name
   */
  resumeSystem(name) {
    const system = this.getSystem(name);
    if (!system) return;

    try {
      if (system.resume) {
        system.resume();
      }
      this.systemStates.set(name, SystemState.READY);
      this.eventBus.emit(EVENTS.SYSTEM_RESUMED, { name });
    } catch (error) {
      console.error(`Error resuming system '${name}':`, error);
    }
  }

  /**
   * Pause all systems
   */
  pauseAll() {
    for (const name of this.systems.keys()) {
      this.pauseSystem(name);
    }
  }

  /**
   * Resume all systems
   */
  resumeAll() {
    for (const name of this.systems.keys()) {
      this.resumeSystem(name);
    }
  }

  /**
   * Reset a system (destroy and reinitialize)
   * @param {string} name - System name
   */
  async resetSystem(name) {
    const system = this.getSystem(name);
    if (!system) return;

    try {
      if (system.destroy) {
        system.destroy();
      }
      this.systemStates.set(name, SystemState.UNINITIALIZED);
      await this.initializeSystem(name);
    } catch (error) {
      console.error(`Error resetting system '${name}':`, error);
    }
  }

  // ========== UPDATE ==========

  /**
   * Update all systems with error boundaries
   * @param {number} time - Game time
   * @param {number} delta - Delta time
   */
  update(time, delta) {
    for (const [name, systemDef] of this.systems) {
      const state = this.systemStates.get(name);

      // Skip if not ready
      if (state !== SystemState.READY) continue;

      const instance = systemDef.instance;
      if (!instance || !instance.update) continue;

      try {
        const start = performance.now();
        instance.update(time, delta);
        const updateTime = performance.now() - start;

        const metrics = this.systemMetrics.get(name);
        metrics.updateTime = updateTime;
        metrics.updateCount++;
      } catch (error) {
        console.error(`Error updating system '${name}':`, error);
        this.systemMetrics.get(name).errors++;

        // Disable system on repeated errors
        if (this.systemMetrics.get(name).errors > 10) {
          console.error(`System '${name}' disabled due to repeated errors`);
          this.systemStates.set(name, SystemState.ERROR);
        }
      }
    }
  }

  // ========== ACCESS ==========

  /**
   * Get a system instance
   * @param {string} name - System name
   * @returns {object|null} System instance
   */
  getSystem(name) {
    const systemDef = this.systems.get(name);
    return systemDef?.instance || null;
  }

  /**
   * Get system state
   * @param {string} name - System name
   * @returns {string} System state
   */
  getState(name) {
    return this.systemStates.get(name) || SystemState.UNINITIALIZED;
  }

  /**
   * Check if system is ready
   * @param {string} name - System name
   * @returns {boolean}
   */
  isReady(name) {
    return this.getState(name) === SystemState.READY;
  }

  // ========== METRICS ==========

  /**
   * Get system metrics
   * @param {string} name - System name
   * @returns {object} Metrics
   */
  getMetrics(name) {
    return this.systemMetrics.get(name) || null;
  }

  /**
   * Get all metrics
   * @returns {object} All system metrics
   */
  getAllMetrics() {
    const metrics = {};
    for (const [name, data] of this.systemMetrics) {
      metrics[name] = { ...data };
    }
    return metrics;
  }

  /**
   * Print metrics summary
   */
  printMetrics() {
    console.table(this.getAllMetrics());
  }

  // ========== DEBUG ==========

  /**
   * Enable debug mode
   */
  enableDebug() {
    this.debugMode = true;
    this.eventBus.enableDebug();
  }

  /**
   * Disable debug mode
   */
  disableDebug() {
    this.debugMode = false;
    this.eventBus.disableDebug();
  }

  // ========== CLEANUP ==========

  /**
   * Destroy all systems
   */
  destroy() {
    // Destroy in reverse order
    const order = this._resolveInitOrder().reverse();

    for (const name of order) {
      const systemDef = this.systems.get(name);
      if (systemDef?.instance?.destroy) {
        try {
          systemDef.instance.destroy();
          this.eventBus.emit(EVENTS.SYSTEM_DESTROYED, { name });
        } catch (error) {
          console.error(`Error destroying system '${name}':`, error);
        }
      }
    }

    this.systems.clear();
    this.systemStates.clear();
    this.systemMetrics.clear();
    this.eventBus.destroy();
  }
}