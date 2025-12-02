// FILE: src/modules/buildingUnlocks.js
// Helper functions to unlock special buildings

import { addItem } from './buildInventory';

/**
 * Unlock the APB Station (should be unlocked by default or early game)
 */
export function unlockAPBStation() {
  addItem('apb', 1);
  return true;
}

/**
 * Unlock the Paint Shop (requires Mate Coins)
 */
export function unlockPaintShop() {
  // This should be called after checking/deducting 5,000 Mate Coins
  addItem('paintshop', 1);
  return true;
}

/**
 * Unlock the Garage (requires Mate Coins)
 */
export function unlockGarage() {
  // This should be called after checking/deducting 8,000 Mate Coins
  addItem('garage', 1);
  return true;
}

/**
 * Unlock the Investment Bank (requires Mate Coins)
 */
export function unlockBank() {
  // This should be called after checking/deducting 50,000 Mate Coins
  addItem('bank', 1);
  return true;
}

/**
 * Grant generic houses (purchased/earned)
 */
export function grantHouses(count = 1) {
  addItem('house', count);
  return true;
}

/**
 * Quick function to unlock all buildings for testing
 * WARNING: Only use for testing/debugging!
 */
export function unlockAllBuildingsForTesting() {
  unlockAPBStation();
  unlockPaintShop();
  unlockGarage();
  unlockBank();
  grantHouses(5);
  console.log('✅ All buildings unlocked for testing');
  return true;
}

/**
 * Check if a building is unlocked
 */
export function isBuildingUnlocked(buildingType) {
  const { has } = require('./buildInventory');
  return has(buildingType, 1);
}