// FILE: src/modules/paintShop.js
// Paint shop system for vehicle and house customization

const PAINT_SHOP_KEY = "pm_paint_shop_v1";
const PAINT_SHOP_LEVEL_KEY = "pm_paint_shop_level_v1";
const PLAYER_VEHICLE_KEY = "pm_player_vehicle_v1";
const HOUSE_COLORS_KEY = "pm_house_colors_v1";

// Paint shop upgrade tiers
export const PAINT_SHOP_TIERS = {
  SMALL: {
    level: 1,
    name: "Small Paint Shop",
    unlockCost: 5000, // Mate Coins to unlock
    features: ['vehicle_tints'],
    vehicleTintCost: 50,
    description: "Basic vehicle color tinting",
  },
  MEDIUM: {
    level: 2,
    name: "Medium Paint Shop",
    upgradeCost: 15000, // Mate Coins to upgrade from Small
    features: ['vehicle_tints', 'vehicle_metallic', 'house_tints'],
    vehicleTintCost: 50,
    vehicleMetallicCost: 200,
    houseTintCost: 100,
    description: "Vehicle + house painting, metallic colors",
  },
  LARGE: {
    level: 3,
    name: "Large Paint Shop",
    upgradeCost: 35000, // Mate Coins to upgrade from Medium
    features: ['vehicle_tints', 'vehicle_metallic', 'vehicle_premium', 'house_tints', 'house_premium'],
    vehicleTintCost: 50,
    vehicleMetallicCost: 200,
    vehiclePremiumCost: 1000,
    houseTintCost: 100,
    housePremiumCost: 500,
    description: "All colors + premium skins",
  },
};

// Available colors for tinting
export const VEHICLE_TINT_COLORS = {
  red: { name: 'Red', tint: 0xff4444, cost: 50 },
  blue: { name: 'Blue', tint: 0x4444ff, cost: 50 },
  green: { name: 'Green', tint: 0x44ff44, cost: 50 },
  yellow: { name: 'Yellow', tint: 0xffff44, cost: 50 },
  purple: { name: 'Purple', tint: 0xff44ff, cost: 50 },
  orange: { name: 'Orange', tint: 0xff8844, cost: 50 },
  white: { name: 'White', tint: 0xffffff, cost: 50 },
  black: { name: 'Black', tint: 0x333333, cost: 50 },
};

export const VEHICLE_METALLIC_COLORS = {
  chrome: { name: 'Chrome', tint: 0xdddddd, cost: 200 },
  gold: { name: 'Gold', tint: 0xffd700, cost: 200 },
  silver: { name: 'Silver', tint: 0xc0c0c0, cost: 200 },
  bronze: { name: 'Bronze', tint: 0xcd7f32, cost: 200 },
};

// Premium vehicle skins (hand-painted, not tints)
export const VEHICLE_PREMIUM_SKINS = {
  purple_gradient: { name: 'Purple Gradient', key: 'vehicle_player_purple', cost: 1000 },
  // Add more as you create them
};

// House tint colors
export const HOUSE_TINT_COLORS = {
  red_brick: { name: 'Red Brick', tint: 0xcc5544, cost: 100 },
  blue_siding: { name: 'Blue Siding', tint: 0x4488cc, cost: 100 },
  yellow: { name: 'Yellow', tint: 0xffdd44, cost: 100 },
  green: { name: 'Green', tint: 0x66cc66, cost: 100 },
  white: { name: 'White', tint: 0xffffff, cost: 100 },
  grey: { name: 'Grey', tint: 0x888888, cost: 100 },
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

/* ---------- Paint Shop Status ---------- */

export function isPaintShopUnlocked() {
  return lsRead(PAINT_SHOP_KEY, false);
}

export function unlockPaintShop() {
  lsWrite(PAINT_SHOP_KEY, true);
  lsWrite(PAINT_SHOP_LEVEL_KEY, 1);
  return true;
}

export function getPaintShopLevel() {
  if (!isPaintShopUnlocked()) return 0;
  return lsRead(PAINT_SHOP_LEVEL_KEY, 1);
}

export function upgradePaintShop(toLevel) {
  if (!isPaintShopUnlocked()) return false;
  if (toLevel < 1 || toLevel > 3) return false;
  
  const currentLevel = getPaintShopLevel();
  if (toLevel <= currentLevel) return false;
  
  lsWrite(PAINT_SHOP_LEVEL_KEY, toLevel);
  return true;
}

export function getPaintShopTier() {
  const level = getPaintShopLevel();
  if (level === 0) return null;
  if (level === 1) return PAINT_SHOP_TIERS.SMALL;
  if (level === 2) return PAINT_SHOP_TIERS.MEDIUM;
  if (level === 3) return PAINT_SHOP_TIERS.LARGE;
  return PAINT_SHOP_TIERS.SMALL;
}

export function canPaintHouses() {
  const level = getPaintShopLevel();
  return level >= 2; // Medium or Large
}

export function canBuyPremiumSkins() {
  const level = getPaintShopLevel();
  return level >= 3; // Large only
}

/* ---------- Player Vehicle ---------- */

export function getPlayerVehicle() {
  return lsRead(PLAYER_VEHICLE_KEY, {
    baseType: 'vehicle_player_compact_base',
    currentSkin: null, // null = using base with tint
    tintColor: null, // null = no tint (original color)
    isPremium: false,
  });
}

export function setPlayerVehicle(vehicle) {
  lsWrite(PLAYER_VEHICLE_KEY, vehicle);
}

export function paintPlayerVehicle(colorId, isMetallic = false) {
  const colors = isMetallic ? VEHICLE_METALLIC_COLORS : VEHICLE_TINT_COLORS;
  const color = colors[colorId];
  if (!color) return false;
  
  const vehicle = getPlayerVehicle();
  vehicle.tintColor = color.tint;
  vehicle.currentSkin = null; // Clear premium skin
  vehicle.isPremium = false;
  setPlayerVehicle(vehicle);
  return true;
}

export function applyPremiumSkin(skinId) {
  const skin = VEHICLE_PREMIUM_SKINS[skinId];
  if (!skin) return false;
  
  const vehicle = getPlayerVehicle();
  vehicle.currentSkin = skin.key;
  vehicle.tintColor = null; // Clear tint
  vehicle.isPremium = true;
  setPlayerVehicle(vehicle);
  return true;
}

export function getPlayerVehicleTextureKey() {
  const vehicle = getPlayerVehicle();
  if (vehicle.isPremium && vehicle.currentSkin) {
    return vehicle.currentSkin;
  }
  return vehicle.baseType;
}

export function getPlayerVehicleTint() {
  const vehicle = getPlayerVehicle();
  return vehicle.tintColor;
}

/* ---------- House Painting ---------- */

export function getHouseColors() {
  return lsRead(HOUSE_COLORS_KEY, {});
}

export function setHouseColor(houseId, colorId) {
  const color = HOUSE_TINT_COLORS[colorId];
  if (!color) return false;
  
  const colors = getHouseColors();
  colors[houseId] = {
    colorId,
    tint: color.tint,
    paintedAt: Date.now(),
  };
  lsWrite(HOUSE_COLORS_KEY, colors);
  return true;
}

export function getHouseColor(houseId) {
  const colors = getHouseColors();
  return colors[houseId] || null;
}

/* ---------- Cost Helpers ---------- */

export function getVehicleTintCost(isMetallic = false) {
  const tier = getPaintShopTier();
  if (!tier) return null;
  
  if (isMetallic) {
    return tier.vehicleMetallicCost || null;
  }
  return tier.vehicleTintCost;
}

export function getVehiclePremiumCost() {
  const tier = getPaintShopTier();
  if (!tier || !tier.vehiclePremiumCost) return null;
  return tier.vehiclePremiumCost;
}

export function getHouseTintCost() {
  const tier = getPaintShopTier();
  if (!tier || !tier.houseTintCost) return null;
  return tier.houseTintCost;
}

/* ---------- Interaction Helpers ---------- */

export function isPlayerNearPaintShop(playerX, playerY, paintShopX, paintShopY, radius = 64) {
  const dx = playerX - paintShopX;
  const dy = playerY - paintShopY;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}

/* ---------- UI Data ---------- */

export function getAvailableVehicleColors() {
  const level = getPaintShopLevel();
  const colors = [];
  
  if (level >= 1) {
    colors.push(...Object.entries(VEHICLE_TINT_COLORS).map(([id, data]) => ({
      id,
      ...data,
      category: 'basic',
    })));
  }
  
  if (level >= 2) {
    colors.push(...Object.entries(VEHICLE_METALLIC_COLORS).map(([id, data]) => ({
      id,
      ...data,
      category: 'metallic',
    })));
  }
  
  if (level >= 3) {
    colors.push(...Object.entries(VEHICLE_PREMIUM_SKINS).map(([id, data]) => ({
      id,
      ...data,
      category: 'premium',
    })));
  }
  
  return colors;
}

export function getAvailableHouseColors() {
  if (!canPaintHouses()) return [];
  return Object.entries(HOUSE_TINT_COLORS).map(([id, data]) => ({
    id,
    ...data,
  }));
}