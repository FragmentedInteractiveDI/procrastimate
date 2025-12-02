// src/modules/gearCatalog.ts
export type GearItem = {
  id: string;                // "gear_parkour_boots_v1"
  name: string;
  type: "gear" | "cosmetic" | "license";
  scope: "global" | `mode:${"parkour"|"farm"|"theme_park"|"city_defense"}`;
  slot?: "head"|"suit"|"boots"|"accessory";
  rarity?: "basic"|"pro"|"elite";
  priceCoins?: number;
  mods?: Partial<{
    passive_city_pct: number;
    ticket_price_pct: number;
    ride_maint_cost_pct: number;
    crop_yield_pct: number;
    harvest_speed_pct: number;
    double_jump: boolean;
    parkour_speed_pct: number;
    apb_coin_gain_pct: number;
    apb_time_bonus_sec: number;
    traffic_spawn_pct: number;
    collision_value_pct: number;
  }>;
  set?: { tag: string; piecesRequired: 2|4; bonus: Record<string,number|boolean> };
};
