// canonical tiles registry + type-safe normalizer

export const TILES = {
  road:       { id: "road",       code: "r",        placeable: true,  drivable: true,  kind: "road", lanes: 1, cost: 1 },
  avenue:     { id: "avenue",     code: "av",       placeable: true,  drivable: true,  kind: "road", lanes: 2, cost: 2 },
  roundabout: { id: "roundabout", code: "rb",       placeable: true,  drivable: true,  kind: "rb",   lanes: 1, cost: 2 },

  home:       { id: "home",       code: "home",     placeable: true,  drivable: true,  kind: "poi",  cost: 1 },
  house:      { id: "house",      code: "house",    placeable: true,  drivable: false, kind: "poi",  cost: 1 },
  park:       { id: "park",       code: "p",        placeable: true,  drivable: false, kind: "poi",  cost: 1 },
  shop:       { id: "shop",       code: "s",        placeable: true,  drivable: false, kind: "poi",  cost: 1 },
  hq:         { id: "hq",         code: "hq",       placeable: true,  drivable: false, kind: "poi",  cost: 1 },

  // new buildings
  apb:        { id: "apb",        code: "apb",      placeable: true,  drivable: false, kind: "poi",  cost: 1 },
  bank:       { id: "bank",       code: "bank",     placeable: true,  drivable: false, kind: "poi",  cost: 1 },
  garage:     { id: "garage",     code: "garage",   placeable: true,  drivable: false, kind: "poi",  cost: 1 },
  paintshop:  { id: "paintshop",  code: "paintshop",placeable: true,  drivable: false, kind: "poi",  cost: 1 },
} as const;

export type TileId = keyof typeof TILES;

// include all legacy shorthands here; the value must be a valid TileId
const CODE_TO_ID: Record<string, TileId> = {
  // canonical ids
  road: "road",
  avenue: "avenue",
  roundabout: "roundabout",
  home: "home",
  house: "house",
  park: "park",
  shop: "shop",
  hq: "hq",
  apb: "apb",
  bank: "bank",
  garage: "garage",
  paintshop: "paintshop",

  // short/legacy
  r: "road",
  av: "avenue",
  rb: "roundabout",
  h: "home",
  st: "home",
  start: "home",
  p: "park",
  s: "shop",
};

export function normalizeId(x: string | null | undefined): TileId | "" {
  if (!x) return "";
  const key = String(x).toLowerCase();
  return (CODE_TO_ID[key] ?? "") as TileId | "";
}

// if you still want a codes map for UI, expose this typed helper
export const CODES: Record<string, TileId> = Object.fromEntries(
  (Object.values(TILES) as Array<(typeof TILES)[TileId]>).map((t) => [t.code, t.id])
) as Record<string, TileId>;
