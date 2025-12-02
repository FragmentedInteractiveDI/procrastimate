// FILE: src/modules/garage.js
// Garage system for vehicle upgrades (performance, APB bonuses, utility)

const GARAGE_KEY = "pm_garage_v1";
const GARAGE_UPGRADES_KEY = "pm_garage_upgrades_v1";

// Garage unlock and upgrade tiers
export const GARAGE_TIERS = {
  SMALL: {
    level: 1,
    name: "Small Garage",
    unlockCost: 8000, // Mate Coins to unlock
    maxUpgradeLevel: 3, // Can upgrade each stat to level 3
    description: "Basic vehicle upgrades",
  },
  MEDIUM: {
    level: 2,
    name: "Medium Garage",
    upgradeCost: 20000,
    maxUpgradeLevel: 5, // Can upgrade each stat to level 5
    description: "Advanced upgrades + APB bonuses",
  },
  LARGE: {
    level: 3,
    name: "Large Garage",
    upgradeCost: 45000,
    maxUpgradeLevel: 10, // Max level for all upgrades
    description: "Elite upgrades + all bonuses",
  },
};

// Upgrade categories and their effects
export const UPGRADE_CATEGORIES = {
  // PERFORMANCE UPGRADES
  performance: {
    nitrous: {
      name: "Nitrous Boost",
      description: "Temporary speed burst",
      icon: "🚀",
      maxLevel: 10,
      baseCost: 500,
      costMultiplier: 1.5,
      effects: {
        1: { boostDuration: 2, boostSpeed: 1.3, cooldown: 20 },
        2: { boostDuration: 2.5, boostSpeed: 1.35, cooldown: 18 },
        3: { boostDuration: 3, boostSpeed: 1.4, cooldown: 16 },
        4: { boostDuration: 3.5, boostSpeed: 1.45, cooldown: 14 },
        5: { boostDuration: 4, boostSpeed: 1.5, cooldown: 12 },
        6: { boostDuration: 4.5, boostSpeed: 1.55, cooldown: 11 },
        7: { boostDuration: 5, boostSpeed: 1.6, cooldown: 10 },
        8: { boostDuration: 5.5, boostSpeed: 1.65, cooldown: 9 },
        9: { boostDuration: 6, boostSpeed: 1.7, cooldown: 8 },
        10: { boostDuration: 7, boostSpeed: 1.8, cooldown: 7 },
      },
    },
    handling: {
      name: "Handling",
      description: "Tighter turns, less drift",
      icon: "🎯",
      maxLevel: 10,
      baseCost: 400,
      costMultiplier: 1.4,
      effects: {
        1: { turnSpeed: 1.1, driftReduction: 0.9 },
        2: { turnSpeed: 1.15, driftReduction: 0.85 },
        3: { turnSpeed: 1.2, driftReduction: 0.8 },
        4: { turnSpeed: 1.25, driftReduction: 0.75 },
        5: { turnSpeed: 1.3, driftReduction: 0.7 },
        6: { turnSpeed: 1.35, driftReduction: 0.65 },
        7: { turnSpeed: 1.4, driftReduction: 0.6 },
        8: { turnSpeed: 1.45, driftReduction: 0.55 },
        9: { turnSpeed: 1.5, driftReduction: 0.5 },
        10: { turnSpeed: 1.6, driftReduction: 0.4 },
      },
    },
    acceleration: {
      name: "Acceleration",
      description: "Faster from stops",
      icon: "⚡",
      maxLevel: 10,
      baseCost: 350,
      costMultiplier: 1.3,
      effects: {
        1: { accelerationBonus: 1.1 },
        2: { accelerationBonus: 1.15 },
        3: { accelerationBonus: 1.2 },
        4: { accelerationBonus: 1.25 },
        5: { accelerationBonus: 1.3 },
        6: { accelerationBonus: 1.35 },
        7: { accelerationBonus: 1.4 },
        8: { accelerationBonus: 1.45 },
        9: { accelerationBonus: 1.5 },
        10: { accelerationBonus: 1.6 },
      },
    },
  },

  // APB BONUS UPGRADES
  apb_bonus: {
    coin_magnet: {
      name: "Coin Magnet",
      description: "Increased pickup radius during APB",
      icon: "🧲",
      maxLevel: 10,
      baseCost: 600,
      costMultiplier: 1.6,
      effects: {
        1: { radiusBonus: 1.2 },
        2: { radiusBonus: 1.3 },
        3: { radiusBonus: 1.4 },
        4: { radiusBonus: 1.5 },
        5: { radiusBonus: 1.6 },
        6: { radiusBonus: 1.7 },
        7: { radiusBonus: 1.8 },
        8: { radiusBonus: 1.9 },
        9: { radiusBonus: 2.0 },
        10: { radiusBonus: 2.5 },
      },
    },
    coin_multiplier: {
      name: "Coin Multiplier",
      description: "Earn more coins per traffic catch",
      icon: "💰",
      maxLevel: 10,
      baseCost: 800,
      costMultiplier: 1.8,
      effects: {
        1: { multiplier: 1.1 },
        2: { multiplier: 1.15 },
        3: { multiplier: 1.2 },
        4: { multiplier: 1.25 },
        5: { multiplier: 1.3 },
        6: { multiplier: 1.4 },
        7: { multiplier: 1.5 },
        8: { multiplier: 1.6 },
        9: { multiplier: 1.75 },
        10: { multiplier: 2.0 },
      },
    },
    extended_timer: {
      name: "Extended Timer",
      description: "APB lasts longer",
      icon: "⏱️",
      maxLevel: 10,
      baseCost: 700,
      costMultiplier: 1.7,
      effects: {
        1: { timeBonus: 1.05 },
        2: { timeBonus: 1.1 },
        3: { timeBonus: 1.15 },
        4: { timeBonus: 1.2 },
        5: { timeBonus: 1.25 },
        6: { timeBonus: 1.3 },
        7: { timeBonus: 1.35 },
        8: { timeBonus: 1.4 },
        9: { timeBonus: 1.45 },
        10: { timeBonus: 1.5 },
      },
    },
  },

  // UTILITY UPGRADES
  utility: {
    stealth_mode: {
      name: "Stealth Mode",
      description: "Cop detection radius reduced",
      icon: "🥷",
      maxLevel: 10,
      baseCost: 550,
      costMultiplier: 1.5,
      effects: {
        1: { detectionReduction: 0.95 },
        2: { detectionReduction: 0.9 },
        3: { detectionReduction: 0.85 },
        4: { detectionReduction: 0.8 },
        5: { detectionReduction: 0.75 },
        6: { detectionReduction: 0.7 },
        7: { detectionReduction: 0.65 },
        8: { detectionReduction: 0.6 },
        9: { detectionReduction: 0.55 },
        10: { detectionReduction: 0.5 },
      },
    },
    lucky_charm: {
      name: "Lucky Charm",
      description: "Chance for bonus rewards",
      icon: "🍀",
      maxLevel: 10,
      baseCost: 650,
      costMultiplier: 1.6,
      effects: {
        1: { bonusChance: 0.05 },
        2: { bonusChance: 0.08 },
        3: { bonusChance: 0.11 },
        4: { bonusChance: 0.14 },
        5: { bonusChance: 0.17 },
        6: { bonusChance: 0.20 },
        7: { bonusChance: 0.23 },
        8: { bonusChance: 0.26 },
        9: { bonusChance: 0.30 },
        10: { bonusChance: 0.35 },
      },
    },
    efficiency: {
      name: "Efficiency",
      description: "Reduced upgrade costs",
      icon: "💡",
      maxLevel: 10,
      baseCost: 450,
      costMultiplier: 1.4,
      effects: {
        1: { costReduction: 0.95 },
        2: { costReduction: 0.93 },
        3: { costReduction: 0.91 },
        4: { costReduction: 0.89 },
        5: { costReduction: 0.87 },
        6: { costReduction: 0.85 },
        7: { costReduction: 0.83 },
        8: { costReduction: 0.81 },
        9: { costReduction: 0.79 },
        10: { costReduction: 0.75 },
      },
    },
  },
};

/* ---------- Helper Functions ---------- */

function lsRead(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function lsWrite(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

/* ---------- Garage Status ---------- */

export function isGarageUnlocked() {
  return lsRead(GARAGE_KEY, false);
}

export function unlockGarage() {
  lsWrite(GARAGE_KEY, true);
  lsWrite(GARAGE_UPGRADES_KEY + '_level', 1);
  return true;
}

export function getGarageLevel() {
  if (!isGarageUnlocked()) return 0;
  return lsRead(GARAGE_UPGRADES_KEY + '_level', 1);
}

export function upgradeGarage(toLevel) {
  if (!isGarageUnlocked()) return false;
  if (toLevel < 1 || toLevel > 3) return false;
  
  const currentLevel = getGarageLevel();
  if (toLevel <= currentLevel) return false;
  
  lsWrite(GARAGE_UPGRADES_KEY + '_level', toLevel);
  return true;
}

export function getGarageTier() {
  const level = getGarageLevel();
  if (level === 0) return null;
  if (level === 1) return GARAGE_TIERS.SMALL;
  if (level === 2) return GARAGE_TIERS.MEDIUM;
  if (level === 3) return GARAGE_TIERS.LARGE;
  return GARAGE_TIERS.SMALL;
}

export function getMaxUpgradeLevel() {
  const tier = getGarageTier();
  return tier ? tier.maxUpgradeLevel : 0;
}

/* ---------- Upgrade Management ---------- */

export function getUpgrades() {
  return lsRead(GARAGE_UPGRADES_KEY, {});
}

export function getUpgradeLevel(category, upgradeId) {
  const upgrades = getUpgrades();
  const key = `${category}.${upgradeId}`;
  return upgrades[key] || 0;
}

export function setUpgradeLevel(category, upgradeId, level) {
  const upgrades = getUpgrades();
  const key = `${category}.${upgradeId}`;
  upgrades[key] = Math.max(0, Math.min(level, 10));
  lsWrite(GARAGE_UPGRADES_KEY, upgrades);
}

export function canUpgrade(category, upgradeId) {
  if (!isGarageUnlocked()) return false;
  
  const currentLevel = getUpgradeLevel(category, upgradeId);
  const maxLevel = getMaxUpgradeLevel();
  
  return currentLevel < maxLevel && currentLevel < 10;
}

export function getUpgradeCost(category, upgradeId) {
  const upgrade = UPGRADE_CATEGORIES[category]?.[upgradeId];
  if (!upgrade) return null;
  
  const currentLevel = getUpgradeLevel(category, upgradeId);
  const nextLevel = currentLevel + 1;
  
  if (nextLevel > 10) return null;
  
  // Cost increases exponentially
  const baseCost = upgrade.baseCost;
  const multiplier = upgrade.costMultiplier;
  const cost = Math.floor(baseCost * Math.pow(multiplier, currentLevel));
  
  // Apply efficiency discount if player has it
  const efficiencyLevel = getUpgradeLevel('utility', 'efficiency');
  if (efficiencyLevel > 0) {
    const efficiencyUpgrade = UPGRADE_CATEGORIES.utility.efficiency;
    const discount = efficiencyUpgrade.effects[efficiencyLevel].costReduction;
    return Math.floor(cost * discount);
  }
  
  return cost;
}

export function purchaseUpgrade(category, upgradeId) {
  if (!canUpgrade(category, upgradeId)) return false;
  
  const currentLevel = getUpgradeLevel(category, upgradeId);
  setUpgradeLevel(category, upgradeId, currentLevel + 1);
  return true;
}

/* ---------- Effect Getters ---------- */

export function getUpgradeEffect(category, upgradeId) {
  const upgrade = UPGRADE_CATEGORIES[category]?.[upgradeId];
  if (!upgrade) return null;
  
  const level = getUpgradeLevel(category, upgradeId);
  if (level === 0) return null;
  
  return upgrade.effects[level] || null;
}

export function getAllActiveEffects() {
  const effects = {
    performance: {},
    apb_bonus: {},
    utility: {},
  };
  
  for (const [category, upgrades] of Object.entries(UPGRADE_CATEGORIES)) {
    for (const [upgradeId, upgrade] of Object.entries(upgrades)) {
      const level = getUpgradeLevel(category, upgradeId);
      if (level > 0) {
        effects[category][upgradeId] = {
          level,
          effect: upgrade.effects[level],
        };
      }
    }
  }
  
  return effects;
}

/* ---------- Interaction Helpers ---------- */

export function isPlayerNearGarage(playerX, playerY, garageX, garageY, radius = 64) {
  const dx = playerX - garageX;
  const dy = playerY - garageY;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}

/* ---------- UI Data ---------- */

export function getAvailableUpgrades() {
  const maxLevel = getMaxUpgradeLevel();
  const upgrades = [];
  
  for (const [category, categoryUpgrades] of Object.entries(UPGRADE_CATEGORIES)) {
    for (const [upgradeId, upgrade] of Object.entries(categoryUpgrades)) {
      const currentLevel = getUpgradeLevel(category, upgradeId);
      const cost = getUpgradeCost(category, upgradeId);
      const effect = getUpgradeEffect(category, upgradeId);
      
      upgrades.push({
        category,
        id: upgradeId,
        name: upgrade.name,
        description: upgrade.description,
        icon: upgrade.icon,
        currentLevel,
        maxLevel: Math.min(upgrade.maxLevel, maxLevel),
        cost,
        effect,
        canUpgrade: currentLevel < maxLevel && currentLevel < upgrade.maxLevel,
      });
    }
  }
  
  return upgrades;
}

export function getUpgradeStats() {
  const upgrades = getUpgrades();
  const totalUpgrades = Object.keys(upgrades).length;
  const totalLevels = Object.values(upgrades).reduce((sum, level) => sum + level, 0);
  
  return {
    totalUpgrades,
    totalLevels,
    garageLevel: getGarageLevel(),
    maxUpgradeLevel: getMaxUpgradeLevel(),
  };
}