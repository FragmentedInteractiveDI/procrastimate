// FILE: src/game/scenes/systems/ConfigValidator.js
// Validation utilities for system configurations
// Provides type checking, bounds validation, and schema validation

/**
 * ConfigValidator - Utilities for validating system configurations
 * 
 * Usage:
 * const validator = new ConfigValidator();
 * validator.number('speed', config.speed, { min: 0, max: 100 });
 * const errors = validator.getErrors();
 */
export class ConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate a number
   * @param {string} name - Field name
   * @param {*} value - Value to validate
   * @param {object} opts - Validation options { min, max, integer }
   */
  number(name, value, opts = {}) {
    if (typeof value !== 'number' || isNaN(value)) {
      this.errors.push(`${name} must be a number`);
      return;
    }

    if (opts.min !== undefined && value < opts.min) {
      this.errors.push(`${name} must be >= ${opts.min} (got ${value})`);
    }

    if (opts.max !== undefined && value > opts.max) {
      this.errors.push(`${name} must be <= ${opts.max} (got ${value})`);
    }

    if (opts.integer && !Number.isInteger(value)) {
      this.errors.push(`${name} must be an integer (got ${value})`);
    }

    if (opts.positive && value <= 0) {
      this.errors.push(`${name} must be positive (got ${value})`);
    }
  }

  /**
   * Validate a string
   * @param {string} name - Field name
   * @param {*} value - Value to validate
   * @param {object} opts - Validation options { minLength, maxLength, pattern, enum }
   */
  string(name, value, opts = {}) {
    if (typeof value !== 'string') {
      this.errors.push(`${name} must be a string`);
      return;
    }

    if (opts.minLength !== undefined && value.length < opts.minLength) {
      this.errors.push(`${name} must be at least ${opts.minLength} characters`);
    }

    if (opts.maxLength !== undefined && value.length > opts.maxLength) {
      this.errors.push(`${name} must be at most ${opts.maxLength} characters`);
    }

    if (opts.pattern && !opts.pattern.test(value)) {
      this.errors.push(`${name} does not match required pattern`);
    }

    if (opts.enum && !opts.enum.includes(value)) {
      this.errors.push(`${name} must be one of: ${opts.enum.join(', ')}`);
    }
  }

  /**
   * Validate a boolean
   * @param {string} name - Field name
   * @param {*} value - Value to validate
   */
  boolean(name, value) {
    if (typeof value !== 'boolean') {
      this.errors.push(`${name} must be a boolean`);
    }
  }

  /**
   * Validate an object
   * @param {string} name - Field name
   * @param {*} value - Value to validate
   * @param {object} opts - Validation options { required }
   */
  object(name, value, opts = {}) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      this.errors.push(`${name} must be an object`);
      return;
    }

    if (opts.required) {
      for (const key of opts.required) {
        if (!(key in value)) {
          this.errors.push(`${name}.${key} is required`);
        }
      }
    }
  }

  /**
   * Validate an array
   * @param {string} name - Field name
   * @param {*} value - Value to validate
   * @param {object} opts - Validation options { minLength, maxLength, itemType }
   */
  array(name, value, opts = {}) {
    if (!Array.isArray(value)) {
      this.errors.push(`${name} must be an array`);
      return;
    }

    if (opts.minLength !== undefined && value.length < opts.minLength) {
      this.errors.push(`${name} must have at least ${opts.minLength} items`);
    }

    if (opts.maxLength !== undefined && value.length > opts.maxLength) {
      this.errors.push(`${name} must have at most ${opts.maxLength} items`);
    }

    if (opts.itemType) {
      value.forEach((item, index) => {
        if (typeof item !== opts.itemType) {
          this.errors.push(`${name}[${index}] must be a ${opts.itemType}`);
        }
      });
    }
  }

  /**
   * Validate a function
   * @param {string} name - Field name
   * @param {*} value - Value to validate
   */
  function(name, value) {
    if (typeof value !== 'function') {
      this.errors.push(`${name} must be a function`);
    }
  }

  /**
   * Add a warning
   * @param {string} message - Warning message
   */
  warn(message) {
    this.warnings.push(message);
  }

  /**
   * Add a custom error
   * @param {string} message - Error message
   */
  error(message) {
    this.errors.push(message);
  }

  /**
   * Check if validation passed
   * @returns {boolean}
   */
  isValid() {
    return this.errors.length === 0;
  }

  /**
   * Get all errors
   * @returns {string[]}
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Get all warnings
   * @returns {string[]}
   */
  getWarnings() {
    return [...this.warnings];
  }

  /**
   * Get all issues (errors + warnings)
   * @returns {object}
   */
  getAllIssues() {
    return {
      errors: this.getErrors(),
      warnings: this.getWarnings()
    };
  }

  /**
   * Clear all errors and warnings
   */
  clear() {
    this.errors = [];
    this.warnings = [];
  }
}

/**
 * Quick validation helpers
 */
export const validate = {
  /**
   * Validate traffic config
   * @param {object} config - Traffic configuration
   * @returns {string[]} Errors
   */
  trafficConfig(config) {
    const v = new ConfigValidator();

    v.number('TRAFFIC_MAX', config.TRAFFIC_MAX, { min: 1, max: 50, integer: true });
    v.number('TRAFFIC_SPAWN_MS', config.TRAFFIC_SPAWN_MS, { min: 100, max: 10000, integer: true });
    v.number('BASE_SPEED', config.BASE_SPEED, { min: 1, max: 200 });
    v.object('PERSONAS', config.PERSONAS);

    if (config.PERSONAS) {
      for (const [name, persona] of Object.entries(config.PERSONAS)) {
        v.number(`PERSONAS.${name}.mult`, persona.mult, { min: 0.1, max: 3.0 });
        v.number(`PERSONAS.${name}.followGapPx`, persona.followGapPx, { min: 5, max: 100 });
        v.number(`PERSONAS.${name}.tint`, persona.tint, { min: 0, max: 0xFFFFFF, integer: true });
      }
    }

    return v.getErrors();
  },

  /**
   * Validate cop config
   * @param {object} config - Cop configuration
   * @returns {string[]} Errors
   */
  copConfig(config) {
    const v = new ConfigValidator();

    v.number('COP_SPEED_IDLE', config.COP_SPEED_IDLE, { min: 1, max: 200 });
    v.number('COP_SPEED_BOOST', config.COP_SPEED_BOOST, { min: 1, max: 300 });
    v.number('COP_SPEED_STACK', config.COP_SPEED_STACK, { min: 1, max: 400 });
    v.number('REPLAN_INTERVAL', config.REPLAN_INTERVAL, { min: 0.1, max: 10 });
    v.number('STALL_SECONDS', config.STALL_SECONDS, { min: 0.5, max: 10 });
    v.number('CATCH_DISTANCE', config.CATCH_DISTANCE, { min: 5, max: 50 });

    // Performance warnings
    if (config.REPLAN_INTERVAL < 0.5) {
      v.warn('REPLAN_INTERVAL < 0.5 may cause performance issues');
    }

    if (config.COP_SPEED_STACK > 200) {
      v.warn('COP_SPEED_STACK > 200 may make game too difficult');
    }

    return v.getErrors();
  }
};