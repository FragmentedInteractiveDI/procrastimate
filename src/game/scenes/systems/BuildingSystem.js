// FILE: src/game/scenes/systems/BuildingSystem.js
// Manages building unlocks, placement, and interactions

import { BaseSystem } from './BaseSystem.js';
import { 
  unlockAPBStation, 
  unlockPaintShop, 
  unlockGarage, 
  unlockBank,
  grantHouses,
  isBuildingUnlocked 
} from '../../../modules/buildingUnlocks.js';
import { 
  getInventory, 
  has, 
  consume 
} from '../../../modules/buildInventory.js';

export class BuildingSystem extends BaseSystem {
  static get defaultConfig() {
    return {
      // Unlock costs in Mate Coins
      APB_STATION_COST: 0,        // Free/unlocked by default
      PAINT_SHOP_COST: 5000,
      GARAGE_COST: 8000,
      BANK_COST: 50000,
      HOUSE_COST: 2000,           // Per house
      
      // Interaction radius
      INTERACTION_RADIUS: 64,
      
      // Building types
      SPECIAL_BUILDINGS: ['apb', 'paintshop', 'garage', 'bank'],
    };
  }

  onInitialize() {
    // Track placed buildings in the current city
    this.placedBuildings = new Map(); // buildingId -> { type, gx, gy, x, y }
    
    // Track player interactions
    this.nearbyBuildings = [];
    this.currentInteraction = null;
    
    // Auto-unlock APB station if not unlocked
    this.autoUnlockAPB();
    
    this.emit('building:initialized');
  }

  onUpdate(time, delta) {
    // Update nearby buildings for interaction prompts
    this.updateNearbyBuildings();
  }

  onDestroy() {
    this.placedBuildings.clear();
    this.nearbyBuildings = [];
  }

  // Auto-unlock APB station (free building)
  autoUnlockAPB() {
    if (!has('apb', 1)) {
      unlockAPBStation();
      console.log('[BuildingSystem] Auto-unlocked APB Station');
    }
  }

  // Check if player can afford to unlock a building
  canAffordBuilding(buildingType) {
    const cost = this.getUnlockCost(buildingType);
    if (cost === null) return false;
    
    // Check wallet (you'll need to import your wallet module)
    const { getBalance } = require('../../../modules/wallet.js');
    return getBalance() >= cost;
  }

  // Get unlock cost for a building type
  getUnlockCost(buildingType) {
    switch (buildingType) {
      case 'apb': return this.config.APB_STATION_COST;
      case 'paintshop': return this.config.PAINT_SHOP_COST;
      case 'garage': return this.config.GARAGE_COST;
      case 'bank': return this.config.BANK_COST;
      case 'house': return this.config.HOUSE_COST;
      default: return null;
    }
  }

  // Unlock a building (deducts coins and adds to inventory)
  unlockBuilding(buildingType, skipCostCheck = false) {
    // Check if already unlocked
    if (has(buildingType, 1)) {
      return { success: false, reason: 'already_unlocked' };
    }

    const cost = this.getUnlockCost(buildingType);
    if (cost === null) {
      return { success: false, reason: 'invalid_building' };
    }

    // Check affordability
    if (!skipCostCheck && !this.canAffordBuilding(buildingType)) {
      return { success: false, reason: 'insufficient_funds', cost };
    }

    // Deduct coins
    if (!skipCostCheck && cost > 0) {
      const { deductCoins } = require('../../../modules/wallet.js');
      const deducted = deductCoins(cost);
      if (!deducted) {
        return { success: false, reason: 'deduction_failed' };
      }
    }

    // Unlock the building
    let unlocked = false;
    switch (buildingType) {
      case 'apb':
        unlocked = unlockAPBStation();
        break;
      case 'paintshop':
        unlocked = unlockPaintShop();
        break;
      case 'garage':
        unlocked = unlockGarage();
        break;
      case 'bank':
        unlocked = unlockBank();
        break;
      case 'house':
        unlocked = grantHouses(1);
        break;
    }

    if (unlocked) {
      this.emit('building:unlocked', { buildingType, cost });
      return { success: true, buildingType, cost };
    }

    return { success: false, reason: 'unlock_failed' };
  }

  // Register a placed building in the city
  registerBuilding(buildingId, type, gx, gy, x, y) {
    this.placedBuildings.set(buildingId, {
      id: buildingId,
      type,
      gx,
      gy,
      x,
      y,
      placedAt: Date.now(),
    });

    this.emit('building:placed', { buildingId, type, gx, gy, x, y });
  }

  // Remove a building
  removeBuilding(buildingId) {
    const building = this.placedBuildings.get(buildingId);
    if (!building) return false;

    this.placedBuildings.delete(buildingId);
    this.emit('building:removed', { buildingId });
    return true;
  }

  // Get all buildings of a specific type
  getBuildingsByType(type) {
    const buildings = [];
    for (const [id, building] of this.placedBuildings) {
      if (building.type === type) {
        buildings.push(building);
      }
    }
    return buildings;
  }

  // Get building at grid position
  getBuildingAt(gx, gy) {
    for (const [id, building] of this.placedBuildings) {
      if (building.gx === gx && building.gy === gy) {
        return building;
      }
    }
    return null;
  }

  // Check if player is near a building
  isNearBuilding(buildingId) {
    const building = this.placedBuildings.get(buildingId);
    if (!building) return false;

    const car = this.scene.car;
    if (!car) return false;

    const dx = car.x - building.x;
    const dy = car.y - building.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= this.config.INTERACTION_RADIUS;
  }

  // Update list of nearby buildings for interaction prompts
  updateNearbyBuildings() {
    const car = this.scene.car;
    if (!car) {
      this.nearbyBuildings = [];
      return;
    }

    this.nearbyBuildings = [];

    for (const [id, building] of this.placedBuildings) {
      // Only check special buildings that have interactions
      if (!this.config.SPECIAL_BUILDINGS.includes(building.type)) {
        continue;
      }

      const dx = car.x - building.x;
      const dy = car.y - building.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.config.INTERACTION_RADIUS) {
        this.nearbyBuildings.push({
          ...building,
          distance,
        });
      }
    }

    // Sort by distance (closest first)
    this.nearbyBuildings.sort((a, b) => a.distance - b.distance);
  }

  // Get the closest nearby building for interaction
  getClosestInteractable() {
    return this.nearbyBuildings.length > 0 ? this.nearbyBuildings[0] : null;
  }

  // Interact with a building
  interactWithBuilding(buildingId) {
    const building = this.placedBuildings.get(buildingId);
    if (!building) return false;

    if (!this.isNearBuilding(buildingId)) {
      return false;
    }

    this.currentInteraction = building;
    this.emit('building:interact', { building });
    return true;
  }

  // Get building inventory status
  getBuildingInventory() {
    return getInventory();
  }

  // Check if building is unlocked
  isBuildingUnlocked(buildingType) {
    return has(buildingType, 1);
  }

  // Get all unlocked special buildings
  getUnlockedSpecialBuildings() {
    const unlocked = [];
    for (const type of this.config.SPECIAL_BUILDINGS) {
      if (has(type, 1)) {
        unlocked.push(type);
      }
    }
    return unlocked;
  }

  // Get debug info
  getDebugInfo() {
    const base = super.getDebugInfo();
    return {
      ...base,
      placedBuildingsCount: this.placedBuildings.size,
      nearbyBuildingsCount: this.nearbyBuildings.length,
      currentInteraction: this.currentInteraction?.type || 'none',
      unlockedSpecial: this.getUnlockedSpecialBuildings(),
    };
  }
}