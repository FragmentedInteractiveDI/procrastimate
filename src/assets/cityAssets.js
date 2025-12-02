// FILE: src/assets/cityAssets.js
// Central manifest for all city building tile assets and vehicles

const ASSET_BASE_PATH = '/assets/city';

export const CITY_ASSETS = {
  // TERRAIN TILES (64x64, top-down view)
  terrain: [
    { key: 'terrain_grass', path: 'terrain/terrain_grass.png' },
    { key: 'terrain_dirt', path: 'terrain/terrain_dirt.png' },
    { key: 'terrain_water', path: 'terrain/terrain_water.png' },
    { key: 'terrain_river', path: 'terrain/terrain_river.png' },
  ],

  // ROAD TILES (64x64, top-down view)
  roads: [
    { key: 'road_straight_h', path: 'roads/road_straight_h.png' },
    { key: 'road_straight_v', path: 'roads/road_straight_v.png' },
    { key: 'road_corner_tl', path: 'roads/road_corner_tl.png' },
    { key: 'road_corner_tr', path: 'roads/road_corner_tr.png' },
    { key: 'road_corner_bl', path: 'roads/road_corner_bl.png' },
    { key: 'road_corner_br', path: 'roads/road_corner_br.png' },
    { key: 'road_t_up', path: 'roads/road_t_up.png' },
    { key: 'road_t_down', path: 'roads/road_t_down.png' },
    { key: 'road_t_left', path: 'roads/road_t_left.png' },
    { key: 'road_t_right', path: 'roads/road_t_right.png' },
    { key: 'road_cross', path: 'roads/road_cross.png' },
    { key: 'road_deadend_up', path: 'roads/road_deadend_up.png' },
    { key: 'road_deadend_down', path: 'roads/road_deadend_down.png' },
    { key: 'road_deadend_left', path: 'roads/road_deadend_left.png' },
    { key: 'road_deadend_right', path: 'roads/road_deadend_right.png' },
    { key: 'road_roundabout', path: 'roads/road_roundabout.png' },
  ],

  // BUILDINGS (64x96, 3/4 perspective)
  buildings: [
    // Player home (starter)
    { key: 'building_house_small_brown', path: 'buildings/building_house_small_brown.png' },
    { key: 'building_house_small_purple', path: 'buildings/building_house_small_purple.png' },
    
    // Base versions for tinting
    { key: 'building_house_small_base', path: 'buildings/building_house_small_base.png' },
    
    // Generic NPC houses
    { key: 'building_house_generic', path: 'buildings/building_house_generic.png' },
    
    // Commercial buildings
    { key: 'building_shop_small', path: 'buildings/building_shop_small.png' },
    { key: 'building_hq_small', path: 'buildings/building_hq_small.png' },
    
    // Special buildings
    { key: 'building_apb_small', path: 'buildings/building_apb_small.png' },
    { key: 'building_paintshop_small', path: 'buildings/building_paintshop_small.png' },
    { key: 'building_garage_small', path: 'buildings/building_garage_small.png' },
    { key: 'building_bank_small', path: 'buildings/building_bank_small.png' },
  ],

  // VEHICLES (32x32, top-down view)
  vehicles: {
    // Player vehicles - base versions for tinting
    player_base: [
      { key: 'vehicle_player_compact_base', path: 'vehicles/vehicle_player_compact_base.png' },
      { key: 'vehicle_player_sedan_base', path: 'vehicles/vehicle_player_sedan_base.png' },
      { key: 'vehicle_player_sports_base', path: 'vehicles/vehicle_player_sports_base.png' },
      { key: 'vehicle_player_suv_base', path: 'vehicles/vehicle_player_suv_base.png' },
    ],
    
    // Player vehicles - premium skins
    player_premium: [
      { key: 'vehicle_player_purple', path: 'vehicles/vehicle_player_purple.png' },
      { key: 'vehicle_player_compact', path: 'vehicles/vehicle_player_compact_base.png' }, // fallback
    ],
    
    // Traffic vehicles
    traffic: [
      { key: 'vehicle_sedan', path: 'vehicles/vehicle_sedan.png' },
      { key: 'vehicle_compact', path: 'vehicles/vehicle_compact.png' },
      { key: 'vehicle_sports', path: 'vehicles/vehicle_sports.png' },
    ],
    
    // Cop vehicle
    cop: [
      { key: 'vehicle_cop', path: 'vehicles/vehicle_cop.png' },
    ],
  },

  // DECORATIONS (various sizes)
  decorations: [
    // Trees (48x96 or 64x96)
    // { key: 'deco_tree', path: 'decorations/deco_tree.png' },
    
    // Street lamps (32x64)
    // { key: 'deco_lamp', path: 'decorations/deco_lamp.png' },
    
    // Benches (32x24)
    // { key: 'deco_bench', path: 'decorations/deco_bench.png' },
  ],
};

/**
 * Load all city assets into Phaser scene
 * @param {Phaser.Scene} scene - The Phaser scene
 */
export function loadCityAssets(scene) {
  // Load terrain
  CITY_ASSETS.terrain.forEach(({ key, path }) => {
    scene.load.image(key, `${ASSET_BASE_PATH}/${path}`);
  });

  // Load roads
  CITY_ASSETS.roads.forEach(({ key, path }) => {
    scene.load.image(key, `${ASSET_BASE_PATH}/${path}`);
  });

  // Load buildings
  CITY_ASSETS.buildings.forEach(({ key, path }) => {
    scene.load.image(key, `${ASSET_BASE_PATH}/${path}`);
  });
  
  // Add aliases for compatibility with existing CityScene code
  scene.load.image('house_small', `${ASSET_BASE_PATH}/buildings/building_house_small_brown.png`);
  scene.load.image('building_shop', `${ASSET_BASE_PATH}/buildings/building_shop_small.png`);
  scene.load.image('building_hq', `${ASSET_BASE_PATH}/buildings/building_hq_small.png`);
  scene.load.image('building_paintshop', `${ASSET_BASE_PATH}/buildings/building_paintshop_small.png`);
  scene.load.image('building_apb', `${ASSET_BASE_PATH}/buildings/building_apb_small.png`);
  scene.load.image('building_garage', `${ASSET_BASE_PATH}/buildings/building_garage_small.png`);
  scene.load.image('building_bank', `${ASSET_BASE_PATH}/buildings/building_bank_small.png`);

  // Load player vehicle bases
  CITY_ASSETS.vehicles.player_base.forEach(({ key, path }) => {
    scene.load.image(key, `${ASSET_BASE_PATH}/${path}`);
  });

  // Load player premium skins
  CITY_ASSETS.vehicles.player_premium.forEach(({ key, path }) => {
    scene.load.image(key, `${ASSET_BASE_PATH}/${path}`);
  });

  // Load traffic vehicles
  CITY_ASSETS.vehicles.traffic.forEach(({ key, path }) => {
    scene.load.image(key, `${ASSET_BASE_PATH}/${path}`);
  });

  // Load cop vehicle
  CITY_ASSETS.vehicles.cop.forEach(({ key, path }) => {
    scene.load.image(key, `${ASSET_BASE_PATH}/${path}`);
  });

  // Load decorations (when available)
  CITY_ASSETS.decorations.forEach(({ key, path }) => {
    scene.load.image(key, `${ASSET_BASE_PATH}/${path}`);
  });
}

/**
 * Get the appropriate road texture key based on neighboring roads
 * @param {string} tileId - The tile ID (road, avenue, etc.)
 * @param {Object} neighbors - Object with n, s, e, w boolean properties
 * @returns {string} - The texture key to use
 */
export function getRoadTextureKey(tileId, neighbors) {
  // Handle roundabout separately
  if (tileId === 'roundabout' || tileId === 'rb') {
    return 'road_roundabout';
  }
  
  // Check all 4 directions
  const up = neighbors.n || false;
  const down = neighbors.s || false;
  const left = neighbors.w || false;
  const right = neighbors.e || false;

  const count = (up ? 1 : 0) + (down ? 1 : 0) + (left ? 1 : 0) + (right ? 1 : 0);

  // 4-way intersection
  if (count === 4) return 'road_cross';

  // T-junctions
  if (count === 3) {
    if (!up) return 'road_t_down';
    if (!down) return 'road_t_up';
    if (!left) return 'road_t_right';
    if (!right) return 'road_t_left';
  }

  // Corners - FIXED: top and bottom were swapped
  if (count === 2) {
    // North + East → TOP-RIGHT corner
    if (up && right) return 'road_corner_tr';
    // North + West → TOP-LEFT corner
    if (up && left) return 'road_corner_tl';
    // South + East → BOTTOM-RIGHT corner
    if (down && right) return 'road_corner_br';
    // South + West → BOTTOM-LEFT corner
    if (down && left) return 'road_corner_bl';
    // Straight roads
    if (up && down) return 'road_straight_v';
    if (left && right) return 'road_straight_h';
  }

  // Dead ends - oriented so the open end faces the neighbor road
  if (count === 1) {
    if (up) return 'road_deadend_up';
    if (down) return 'road_deadend_down';
    if (left) return 'road_deadend_left';
    if (right) return 'road_deadend_right';
  }

  // No connections - default to horizontal
  return 'road_straight_h';
}

/**
 * Get the building texture key based on building type
 * @param {string} buildingType - The building type (home, shop, hq, etc.)
 * @returns {string} - The texture key to use
 */
export function getBuildingTextureKey(buildingType) {
  const typeMap = {
    'home': 'building_house_small_brown',
    'house': 'building_house_generic',
    'shop': 'building_shop_small',
    'hq': 'building_hq_small',
    'apb': 'building_apb_small',
    'paintshop': 'building_paintshop_small',
    'garage': 'building_garage_small',
    'bank': 'building_bank_small',
    'park': 'terrain_grass', // Parks use grass for now
  };

  return typeMap[buildingType] || 'building_house_small_brown';
}

/**
 * Get random traffic vehicle texture
 * @returns {string} - Random traffic vehicle key
 */
export function getRandomTrafficVehicle() {
  const vehicles = ['vehicle_sedan', 'vehicle_compact', 'vehicle_sports'];
  return vehicles[Math.floor(Math.random() * vehicles.length)];
}

/**
 * Check if a texture exists in the scene
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @returns {boolean}
 */
export function textureExists(scene, key) {
  return scene.textures.exists(key);
}