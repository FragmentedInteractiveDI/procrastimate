// FILE: src/game/scenes/systems/EventBus.js
// Decoupled event system for inter-system communication
// Allows systems to communicate without direct references

/**
 * EventBus - Pub/Sub event system for loose coupling
 * 
 * Benefits:
 * - Systems don't need direct references to each other
 * - Easy to add/remove listeners
 * - Clean separation of concerns
 * - Debugging via event logs
 * 
 * Usage:
 * // Subscribe
 * eventBus.on('traffic:collision', (data) => { ... });
 * 
 * // Publish
 * eventBus.emit('traffic:collision', { vehicle, position });
 * 
 * // Unsubscribe
 * eventBus.off('traffic:collision', handler);
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.eventLog = [];
    this.debugMode = false;
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {function} handler - Callback function
   * @param {object} context - Optional 'this' context for handler
   * @returns {object} Subscription object with unsubscribe method
   */
  on(event, handler, context = null) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const subscription = { handler, context };
    this.listeners.get(event).push(subscription);

    // Return unsubscribe function
    return {
      unsubscribe: () => this.off(event, handler)
    };
  }

  /**
   * Subscribe to an event (one-time only)
   * @param {string} event - Event name
   * @param {function} handler - Callback function
   * @param {object} context - Optional 'this' context
   */
  once(event, handler, context = null) {
    const wrapper = (...args) => {
      handler.call(context, ...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {function} handler - Handler to remove
   */
  off(event, handler) {
    if (!this.listeners.has(event)) return;

    const handlers = this.listeners.get(event);
    const index = handlers.findIndex(sub => sub.handler === handler);

    if (index !== -1) {
      handlers.splice(index, 1);
    }

    // Clean up empty listener arrays
    if (handlers.length === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Remove all listeners for an event
   * @param {string} event - Event name
   */
  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    // Debug logging
    if (this.debugMode) {
      this.log(event, data);
    }

    if (!this.listeners.has(event)) return;

    const handlers = this.listeners.get(event);

    // Call each handler with proper context
    for (const { handler, context } of handlers) {
      try {
        handler.call(context, data);
      } catch (error) {
        console.error(`Error in event handler for '${event}':`, error);
      }
    }
  }

  /**
   * Log event for debugging
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  log(event, data) {
    const timestamp = Date.now();
    this.eventLog.push({ event, data, timestamp });

    // Keep log size manageable
    if (this.eventLog.length > 1000) {
      this.eventLog.shift();
    }

    console.log(`[EventBus] ${event}`, data);
  }

  /**
   * Enable debug mode
   */
  enableDebug() {
    this.debugMode = true;
  }

  /**
   * Disable debug mode
   */
  disableDebug() {
    this.debugMode = false;
  }

  /**
   * Get event log (for debugging)
   * @param {string} eventFilter - Optional event name filter
   * @returns {array} Filtered event log
   */
  getLog(eventFilter = null) {
    if (eventFilter) {
      return this.eventLog.filter(entry => entry.event === eventFilter);
    }
    return [...this.eventLog];
  }

  /**
   * Clear event log
   */
  clearLog() {
    this.eventLog = [];
  }

  /**
   * Get list of all registered events
   * @returns {array} Event names
   */
  getEvents() {
    return Array.from(this.listeners.keys());
  }

  /**
   * Get listener count for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  listenerCount(event) {
    return this.listeners.has(event) ? this.listeners.get(event).length : 0;
  }

  /**
   * Clean up all listeners and logs
   */
  destroy() {
    this.listeners.clear();
    this.eventLog = [];
  }
}

// ===== STANDARD EVENT NAMES =====
// Define standard events to prevent typos and improve discoverability

export const EVENTS = {
  // System Lifecycle
  SYSTEM_INITIALIZED: 'system:initialized',
  SYSTEM_PAUSED: 'system:paused',
  SYSTEM_RESUMED: 'system:resumed',
  SYSTEM_DESTROYED: 'system:destroyed',

  // Traffic Events
  TRAFFIC_SPAWNED: 'traffic:spawned',
  TRAFFIC_DESPAWNED: 'traffic:despawned',
  TRAFFIC_COLLISION: 'traffic:collision',
  TRAFFIC_ROUNDABOUT_ENTER: 'traffic:roundabout:enter',
  TRAFFIC_ROUNDABOUT_EXIT: 'traffic:roundabout:exit',

  // Cop Events
  COP_SPAWNED: 'cop:spawned',
  COP_HIDDEN: 'cop:hidden',
  COP_ROUTE_PLANNED: 'cop:route:planned',
  COP_ROUTE_FAILED: 'cop:route:failed',
  COP_CAUGHT_PLAYER: 'cop:caught',
  COP_STALLED: 'cop:stalled',

  // Player Events
  PLAYER_MOVED: 'player:moved',
  PLAYER_BOOST_CHANGED: 'player:boost:changed',
  PLAYER_CRASHED: 'player:crashed',

  // Reveal Events
  CELL_REVEALED: 'reveal:cell',
  AREA_REVEALED: 'reveal:area',

  // Game Events
  APB_STARTED: 'apb:started',
  APB_ENDED: 'apb:ended',
  GAME_PAUSED: 'game:paused',
  GAME_RESUMED: 'game:resumed',

  // Config Events
  CONFIG_CHANGED: 'config:changed',
  CONFIG_RELOADED: 'config:reloaded'
};