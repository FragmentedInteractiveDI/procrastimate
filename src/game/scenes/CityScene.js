// FILE: src/game/scenes/CityScene.js
// City driving + traffic + APB + HUD + routing + end-of-run summary + APB spawn ramp.
// Personas: aggressive | fast | neutral | slow (+ tailgating + rare chaos crashes).

import Phaser from "phaser";
import {
  computeCityIncomeSnapshot,
  getApbStatus,
  markApbRunStarted,
} from "../../modules/cityEconomy";
import { isBoostActive, getBoostTimes, onChange as onBoostChange } from "../../modules/boost";
import { addCoins } from "../../modules/wallet";
import { loadCityAssets, getRoadTextureKey, getBuildingTextureKey, getRandomTrafficVehicle, textureExists } from "../../assets/cityAssets";
import { GridSystem, lanePositionFor } from "./systems/GridSystem.js";
import { RevealSystem } from "./systems/RevealSystem.js";
import { NavigationSystem, lanePointInCell, laneSnapPoint, entryPosition, turnType } from "./systems/NavigationSystem.js";
import { RenderSystem } from "./systems/RenderSystem.js";
import { TrafficSystem } from "./systems/TrafficSystem.js";
import { CopSystem } from './systems/CopSystem.js';
import { SystemManager } from './systems/SystemManager.js';

let citySlots = null;
try {
  citySlots = await import("../../modules/citySlots");
} catch {}

// Wire citySlots into global hook so cityEconomy can see active layout
if (typeof window !== "undefined" && citySlots) {
  // soft-dep contract: window.__pmCitySlots -> { loadSim(), getActiveSlot? }
  window.__pmCitySlots = citySlots;
}

// Optional subscription module (gracefully falls back to LS flag)
let subMod = null;
try { subMod = await import("../../modules/subscription"); } catch {}

const TILE = 28;
const PADDING = 40;

// speeds
const CAR_SPEED_IDLE  = 75;  // Reduced from 110
const CAR_SPEED_BOOST = 85; // Reduced from 160
const CAR_SPEED_STACK = 105; // Reduced from 180

const COP_SPEED_IDLE  = 60;  // Reduced from 90
const COP_SPEED_BOOST = 80;  // Reduced from 130
const COP_SPEED_STACK = 95; // Reduced from 150

// traffic
const TRAFFIC_MAX = 10;
const TRAFFIC_SPAWN_MS = 1400;
const TRAFFIC_SPEED = 70; // base; per-car speed = base * persona.mult
const LANE_OFFSET = Math.round(TILE * 0.18);

// spacing
const CELL_GAP_SEC    = 0.28;
const YIELD_PAUSE_SEC = 0.14;
const RESERVE_SEC     = 0.40;

// US/CA rules
const TRAFFIC_SIDE = "right";

// zoom + per-slot keys
const ZOOM_KEY  = "pm_city_zoom_v1";
const ZOOM_MIN  = 0.8;
const ZOOM_MAX  = 5.0;
const ZOOM_STEP = 0.05;

const REVEAL_KEY_BASE   = "pm_city_reveal_v2";
const MM_SCALE_KEY_BASE = "pm_mm_scale_v2";
const MM_POS_KEY_BASE   = "pm_mm_pos_v2";

// minimap
const MM_PAD = 12;
const MM_TILE_BASE = 5;
const MM_SCALES = [2.2, 2.8, 3.6];
const TOP_UI_OFFSET = 24;

// city-builder fallback storage
const BUILDER_LS_KEY = "pm_city_state_v1";

// ===== APB coin rules (new) =====
const EVASION_EVADED = 50;          // +50 when you evade
const BONUS_PER_10_HITS = 1;        // +1 coin per 10 hits, always rounding UP
// Subscriber detection (prefer module, else LS flag `pm_is_subscriber_v1`)
const lsGet = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
function isSubscriber() {
  try { if (subMod?.isSubscriber) return !!subMod.isSubscriber(); } catch {}
  return !!lsGet("pm_is_subscriber_v1", false);
}
function currentHitReward() { return isSubscriber() ? 2 : 1; }
// =================================

// feel tuning
const AUTO_SNAP_STRENGTH = 6.0;
const EDGE_PUSH_PIX      = 3.0;
const EDGE_PUSH_SPEED    = 60.0;
const PLAYER_SPAWN_AVOID_RADIUS = 8 * TILE;
const VIEW_BIAS_MARGIN   = 2 * TILE;
const ROUND_MIN_LAPS     = 1.0;
const ROUND_MAX_LAPS     = 2.0;
const ROUND_STEP         = 0.25;

// APB routing tuning
const STALL_SECONDS       = 1.8;
const REPLAN_EVERY_SEC    = 0.6;
const CAR_ROUTE_RETARGET  = 2.0;
const WAYPOINT_RADIUS_PX  = 8;
const ROUTE_MAX_STEPS     = 600;

// APB summary + ramp
const APB_PB_KEY = "pm_apb_pb_v1";
const APB_RAMP_SPAWNS_PER_SEC = 0.7;

// —— U-turn hygiene ——
// NOTE: this includes U-turns triggered when cars commit narrowly but then
// must escape, not just pure cul-de-sac logic.
const UTURN_COOLDOWN_SEC   = 2.0;
const UTURN_MIN_PROGRESS   = 0.80;
const NO_UTURN_NEAR_RB_CELLS = 1;

// —— Personas ——
// Aggressive drivers:
//   - high speed multiplier
//   - more likely to ignore yields
//   - shorter follow gap
//   - higher rear-end crash rate
// Slow drivers:
//   - low speed multiplier
//   - never ignore yields
//   - large follow gap
//
// All cars have a small chaosCrash chance that rises with APB intensity to
// keep the city feeling "alive" and occasionally messy.
const PERSONAS = {
  aggressive: { mult: 1.28, tint: 0xff6b6b, ignoreYield: 0.40, uturnCd: 1.0, chaosBias: 1.9, tex: "pm_diamond",
                followGapPx: 7, rearendRate: 0.55, crashDistPx: 5 },
  fast:       { mult: 1.12, tint: 0xffc06b, ignoreYield: 0.12, uturnCd: 1.5, chaosBias: 1.1, tex: "pm_dot",
                followGapPx: 10, rearendRate: 0.06, crashDistPx: 5 },
  neutral:    { mult: 1.00, tint: 0xbfd1ff, ignoreYield: 0.04, uturnCd: 2.0, chaosBias: 1.0, tex: "pm_dot",
                followGapPx: 12, rearendRate: 0.01, crashDistPx: 5 },
  slow:       { mult: 0.86, tint: 0x9fc7ff, ignoreYield: 0.00, uturnCd: 2.6, chaosBias: 0.8, tex: "pm_square",
                followGapPx: 15, rearendRate: 0.00, crashDistPx: 5 },
};
const PERSONA_WEIGHTS = [
  ["neutral",    0.68],
  ["aggressive", 0.14],
  ["slow",       0.14],
  ["fast",       0.04],
];
const CHAOS_CRASH_BASE = 0.020;

// visuals
const CAR_ROT_OFFSET = Math.PI / 2;
// Muted ground / park colors so the city feels less "loud"
const GRASS_TINT  = 0x4a5a3a;
const GRASS_ALPHA = 0.9;
const PARK_COLOR  = 0x225233;

// helpers
const vec = (x,y)=>new Phaser.Math.Vector2(x,y);
const cellKey = (gx, gy) => `${gx},${gy}`;

// Convert world coordinates (with PADDING) to worldLayer-relative coordinates
const toLayerCoords = (worldX, worldY) => ({ x: worldX - PADDING, y: worldY - PADDING });

// Bézier length (5-pt Gauss–Legendre)
function quadLen(p0, p1, p2) {
  const t = [0.0469101, 0.230765, 0.5, 0.769235, 0.95309];
  const w = [0.118463, 0.239314, 0.284444, 0.239314, 0.118463];
  let L = 0;
  for (let i=0;i<5;i++){
    const s = t[i], u = 1 - s;
    const dx = 2*(u*(p1.x - p0.x) + s*(p2.x - p1.x));
    const dy = 2*(u*(p1.y - p0.y) + s*(p2.y - p1.y));
    L += w[i] * Math.hypot(dx, dy);
  }
  return L;
}

// ——— grid decoding ———
function normBase(cell) {
  if (!cell) return "empty";
  const str = String(cell);
  const at = str.indexOf("@");
  const raw = at === -1 ? str : str.slice(0, at);
  switch (raw) {
    case "r": case "road":        return "road";
    case "av": case "avenue":     return "avenue";
    case "rb": case "roundabout": return "roundabout";
    case "home": case "h":        return "home";
    case "house":                 return "house";
    case "s": case "shop":        return "shop";
    case "p": case "park":        return "park";
    case "hq":                    return "hq";
    case "st": case "start":      return "start";
    default:                      return raw;
  }
}
function toCodeFromId(id) {
  switch (id) {
    case "road": return "r"; case "avenue": return "av"; case "roundabout": return "rb";
    case "home": return "home"; case "house": return "house"; case "shop": return "s";
    case "park": return "p"; case "hq": return "hq"; case "start": return "st";
    default: return id || "";
  }
}

// ——— production state ———
function computeProdStateNow() {
  if (!isBoostActive()) return "idle";
  const { mult, remainingSec } = getBoostTimes();
  if (remainingSec >= 7200 || mult >= 12) return "stacked";
  return "boosted";
}
function makePerSlotKey(base, slotId) { return slotId ? `${base}:${slotId}` : `${base}:default`; }

// ——— sim load ———
function loadFromSlots() {
  if (!citySlots?.loadSim) return null;
  try {
    const active = citySlots.getActiveSlot?.() || null;
    // Explicitly load the active slot’s layout
    const sim = active ? citySlots.loadSim(active) : citySlots.loadSim();
    if (sim?.grid?.length) {
      const w = sim.grid[0]?.length || 0;
      const h = sim.grid.length;
      return { slotId: active, w, h, grid: sim.grid };
    }
  } catch {}
  return null;
}
function loadFromBuilderLS() {
  const snap = lsGet(BUILDER_LS_KEY, null);
  if (!snap || !Number.isFinite(snap.cols) || !Number.isFinite(snap.rows)) return null;
  const w = snap.cols, h = snap.rows;
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => "" ));
  for (const t of snap.tiles || []) {
    const x = t?.x|0, y = t?.y|0;
    if (x>=0 && y>=0 && x<w && y<h) grid[y][x] = toCodeFromId(t.id);
  }
  return { slotId: null, w, h, grid };
}
function loadDefault() {
  const w = 12, h = 10;
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => ""  ));
  grid[5][2] = "home";
  grid[5][3] = "r"; grid[5][4] = "r"; grid[6][4] = "r";
  grid[5][5] = "rb";
  grid[5][6] = "r"; grid[4][5] = "r"; grid[6][5] = "r";
  return { slotId: null, w, h, grid };
}
function loadActiveLayout(){ return loadFromSlots() || loadFromBuilderLS() || loadDefault(); }
const safeHash = (sim) => JSON.stringify([sim?.slotId||"", sim?.w||0, sim?.h||0, sim?.grid?.[0]?.[0]||""]);

// lane helpers - return grid-relative coordinates (for use with worldLayer)
// Note: lanePositionFor is now imported from GridSystem

// Lane helper functions are now imported from NavigationSystem

// ——— persona utils ———
function pickPersonaKey(){
  const r = Math.random();
  let acc = 0;
  for (const [key, w] of PERSONA_WEIGHTS) {
    acc += w;
    if (r <= acc) return key;
  }
  return "neutral";
}

export default class CityScene extends Phaser.Scene {
  constructor(){ 
    super("CityScene");
    this.systemManager = null;
    this.gridSystem = null;
    this.revealSystem = null;
    this.navigationSystem = null;
    this.renderSystem = null;
    this.trafficSystem = null;
    this.copSystem = null;
  }

  init(){
    const sim = loadActiveLayout();
    this.activeSlotId = sim.slotId;
    this.applySim(sim.grid, sim.w, sim.h);
    this._lastSimHash = safeHash(sim);
    this._reloadLock = false;

    this.prodState = computeProdStateNow();
    this.carSpeed = CAR_SPEED_IDLE;
    this.copSpeed = COP_SPEED_IDLE;
    this._recalcSpeeds();

    this.currPerMin = 0;
    this._incomeCarry = 0; // fractional carryover

    // Traffic system manages: this.traffic, this.cellPassTS, this.laneReserveTS
    this.copRingTween = null;

    this.mmScaleIdx = Number(lsGet(makePerSlotKey(MM_SCALE_KEY_BASE, this.activeSlotId), 0)) || 0;
    this.minimapOn = true;
    this.mmPos = lsGet(makePerSlotKey(MM_POS_KEY_BASE, this.activeSlotId), { x: null, y: null });

    // ===== SystemManager Setup =====
    this.systemManager = new SystemManager(this);

    this.systemManager.register([
      { name: 'grid', class: GridSystem },
      { name: 'navigation', class: NavigationSystem },
      { name: 'reveal', class: RevealSystem, deps: ['grid'] },
      { name: 'render', class: RenderSystem, deps: ['grid', 'reveal'] },
      { name: 'traffic', class: TrafficSystem, deps: ['grid', 'navigation'] },
      { name: 'cop', class: CopSystem, deps: ['grid', 'navigation'] }
    ]);

    // Initialize all systems (handles dependencies automatically)
    this.systemManager.initializeAll().then(() => {
      this.gridSystem = this.systemManager.getSystem('grid');
      this.navigationSystem = this.systemManager.getSystem('navigation');
      this.revealSystem = this.systemManager.getSystem('reveal');
      this.renderSystem = this.systemManager.getSystem('render');
      this.trafficSystem = this.systemManager.getSystem('traffic');
      this.copSystem = this.systemManager.getSystem('cop');
      
      console.log('[SystemManager] All systems ready!');
    });

    // APB runtime state
    this.apb = false;
    this.apbRemaining = 0;
    this.apbBaseEarned = 0;
    this.apbHits = 0;
    this.apbHitReward = 1;



    // APB summary/ramp trackers
    this._apbStartedAt = 0;
    this._apbCaught = false;
    this._apbSpawnCarry = 0;

    // feel helpers
    this.lastCarDir = new Phaser.Math.Vector2(1,0);

    // performance throttles
    this._mmDirty = true;
    this._mmNextOverlayAt = 0;
    this._mmOverlayHz = 8;
    this._nextHudAt = 0;
    this._maxDt = 0.050;
    this._nextFlickerAt = 0;
    this._flickerHz = 12;
  }

  applySim(gridIn, wIn, hIn){
    const grid = Array.isArray(gridIn) ? gridIn : [];
    this.grid = grid;
    this.h = hIn || grid.length || 6;
    this.w = wIn || (grid[0]?.length || 6);
    this.drive = Array.from({ length: this.h }, (_, y) =>
      Array.from({ length: this.w }, (_, x) => {
        const b = normBase(this.grid[y]?.[x]);
        return b === "road" || b === "avenue" || b === "start" || b === "roundabout";
      })
    );
    
    // Initialize GridSystem with scene reference
    this.gridSystem = new GridSystem(this);
  }

  // lane occupancy helpers

  preload(){
    // ===== LOAD CITY PNG ASSETS =====
    loadCityAssets(this);
    
    // ===== GENERATE TEMPORARY SPRITES FOR GAMEPLAY =====
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // player
    g.fillStyle(0xffc04a, 1).fillCircle(6, 6, 6);
    g.fillStyle(0x222222, 1).fillTriangle(6, 1, 10, 8, 2, 8);
    g.generateTexture("pm_car", 12, 12); g.clear();

    // cop
    g.fillStyle(0x4aa3ff, 1).fillTriangle(6, 1, 1, 11, 11, 11);
    g.generateTexture("pm_cop", 12, 12); g.clear();

    // traffic sprites (3 variants)
    // dot
    g.fillStyle(0xf2d27a, 1).fillCircle(3, 3, 3);
    g.generateTexture("pm_dot", 6, 6); g.clear();
    // square (slow/passive)
    g.fillStyle(0xf2d27a, 1).fillRect(0, 0, 7, 7);
    g.generateTexture("pm_square", 7, 7); g.clear();
    // diamond (aggressive)
    g.fillStyle(0xf2d27a, 1);
    g.save();
    g.translateCanvas(5,5); g.rotateCanvas(Math.PI/4); g.fillRect(-3, -3, 6, 6); g.restore();
    g.generateTexture("pm_diamond", 10, 10); g.clear();

    // lane paint
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 8, 2);
    g.generateTexture("pm_lane", 8, 2); g.clear();

    // crash textures
    g.fillStyle(0xffb84d, 1).fillCircle(4,4,4);
    g.fillStyle(0xff5e3a, 1).fillCircle(4,4,2.2);
    g.generateTexture("pm_fire", 8, 8); g.clear();

    g.fillStyle(0x999999, 0.95).fillCircle(5,5,5);
    g.fillStyle(0x777777, 0.85).fillCircle(5,5,3);
    g.generateTexture("pm_smoke", 10, 10); g.destroy();
  }

  create(){
    // cameras
    const worldCam = this.cameras.main;
    worldCam.setBackgroundColor(0x111317);
    this.uiCam = this.cameras.add(0,0,this.scale.width,this.scale.height).setScroll(0,0).setZoom(1);

    // listen for APB status changes (e.g., cooldown skipped with ad)
    this._onApbStatus = () => {
      if (!this.sys || this.sys.isDestroyed || !this.hud || !this.hud.scene) return;
      try { this.updateCityHud(); } catch {}
    };
    window.addEventListener("apb:status", this._onApbStatus);

    // layers
    this.worldLayer = this.add.container(PADDING, PADDING);
    this.uiLayer = this.add.container(0, 0).setDepth(100000);
    worldCam.ignore(this.uiLayer);
    this.uiCam.ignore(this.worldLayer);

    // world graphics
    this.worldGfx = this.add.graphics().setPosition(0, 0).setDepth(1);
    this.roadDetailGfx = this.add.graphics().setPosition(0, 0).setDepth(2);
    this.fogGfx = this.add.graphics().setDepth(3);
    this.worldLayer.add([this.worldGfx, this.roadDetailGfx, this.fogGfx]);

    // Wait for SystemManager to finish initializing
    if (!this.gridSystem || !this.renderSystem || !this.trafficSystem || !this.copSystem) {
      this.time.delayedCall(100, () => this.create());
      return;
    }
    
    // Connect fog graphics to RevealSystem
    this.revealSystem.setFogGraphics(this.fogGfx);

    // Systems ready - initialize traffic spawn timer
    this.trafficSystem.initialize();
    
    // player + cop  
    const spawn = this.findStart() || { x: TILE, y: TILE };

    const carTextureKey = textureExists(this, "vehicle_player_compact_base")
      ? "vehicle_player_compact_base"
      : "pm_car";
    const copTextureKey = textureExists(this, "vehicle_cop")
      ? "vehicle_cop"
      : "pm_cop";

    // Grid-relative position (worldLayer's graphics handle PADDING)
    this.car = this.add.image(spawn.x + TILE/2, spawn.y + TILE/2, carTextureKey)
      .setOrigin(0.5).setDepth(100).setVisible(true).setScale(0.30);
    this.worldLayer.add(this.car);

    this.cop = this.add.image(this.car.x, this.car.y, copTextureKey)
      .setOrigin(0.5).setVisible(false).setDepth(99).setScale(0.30);
    this.copRing = this.add.circle(this.cop.x, this.cop.y, 8, 0xff3355, 0.22)
      .setStrokeStyle(2, 0xffc0c8, 0.9).setVisible(false).setDepth(98);
    this.worldLayer.add([this.cop, this.copRing]);

    // camera follow + zoom
    const worldW = PADDING*2 + this.w*TILE;
    const worldH = PADDING*2 + this.h*TILE;
    worldCam.setBounds(0, 0, worldW, worldH);
    worldCam.startFollow(this.car, true, 0.15, 0.15);
    worldCam.setZoom(this.loadZoom());
    this.installZoomControls(worldCam);

    // HUD
    this.helpTxt = this.add.text(
      PADDING,
      PADDING - 16,
      "City: SPACE to run APB. Arrows/WASD drive. Q/E zoom. M minimap.",
      { fontFamily: "monospace", fontSize: 12, color: "#aab2bc" }
    ).setScrollFactor(0);

    this.hud = this.add.text(
      this.scale.width / 2,
      PADDING - 30,
      "",
      {
        fontFamily: "monospace",
        fontSize: 15,
        color: "#ffe8a3",
        backgroundColor: "rgba(0,0,0,0.82)",
        padding: { left: 10, right: 10, top: 4, bottom: 4 },
      }
    )
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    this.uiLayer.add([this.helpTxt, this.hud]);
    this.updateCityHud();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateCityHud() });

    // minimap
    this.minimapBack = this.add.graphics().setAlpha(0.96).setDepth(999).setScrollFactor(0);
    this.minimapOverlay = this.add.graphics().setDepth(1000).setScrollFactor(0);
    this.uiLayer.add([this.minimapBack, this.minimapOverlay]);

    this.mmZone = this.add.zone(0,0,10,10).setOrigin(0).setInteractive({ draggable: true, cursor: "pointer" })
      .setDepth(1001).setScrollFactor(0);
    this.uiLayer.add(this.mmZone);
    this.mmZone.on("drag", (_p, dragX, dragY) => {
      this.mmPos.x = Math.max(4, Math.min(this.scale.width - 40, dragX));
      this.mmPos.y = Math.max(4, Math.min(this.scale.height - 40, dragY));
      try { localStorage.setItem(makePerSlotKey(MM_POS_KEY_BASE, this.activeSlotId), JSON.stringify(this.mmPos)); } catch {}
      this._mmDirty = true;
      this.renderSystem.drawMinimap(true);
    });
    this.input.keyboard.on("keydown-M", () => {
      if (!this.minimapOn) this.minimapOn = true;
      else this.mmScaleIdx = (this.mmScaleIdx + 1) % MM_SCALES.length;
      try { localStorage.setItem(makePerSlotKey(MM_SCALE_KEY_BASE, this.activeSlotId), JSON.stringify(this.mmScaleIdx)); } catch {}
      this._mmDirty = true;
      this.renderSystem.drawMinimap(true);
    });
    this.events.on("zoomChanged", () => { this._mmDirty = true; });

    // input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.W, Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S, Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.UP, Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.Q, Phaser.Input.Keyboard.KeyCodes.E,
      Phaser.Input.Keyboard.KeyCodes.M,
    ]);

    // APB helpers
    this.spawnCop = () => {
      this.copSystem.spawn();
    };
    this.hideCop = () => { this.copSystem.hide(); };

    this.startApb = ({ doMark = true } = {}) => {
      if (this.apb) return false;
      const s = getApbStatus();
      if (!s.canRun) return false;
      if (doMark) markApbRunStarted();
      this.apb = true;
      this.apbRemaining = Math.max(0, Number(s.durationSec) || 0);
      this.apbBaseEarned = 0;
      this.apbHits = 0;
      this.apbHitReward = currentHitReward(); // freeze reward per run (1 or 2)
      this._apbStartedAt = this.time.now;
      this._apbCaught = false;
      this._apbSpawnCarry = 0;
      this.spawnCop();
      for (const t of this.trafficSystem.traffic) t.spr.setTint(0xffea76);
      
      // Listen for cop catch event
      this._copCaughtHandler = () => {
        if (!this.apb) return;
        this.makePopup(this.car.x, this.car.y - 12, `caught`, 0xff3355);
        const durationSec = Math.max(0, Math.round((this.time.now - this._apbStartedAt)/1000));
        const stash = this.apbBaseEarned|0;
        const stats = {
          result: "caught",
          durationSec,
          hits: this.apbHits|0,
          hitCoins: stash,
          bonus: 0,
          evasion: 0,
          total: stash,
        };
        this.apb=false; this.apbRemaining=0; this.hideCop();
        for (const t of this.trafficSystem.traffic) t.spr.setTint(0xbfd1ff);
        this.updateCityHud();
        this.showApbSummary(stats);
      };
      this.copSystem.on('cop:caught', this._copCaughtHandler);
      
      this.updateCityHud();
      return true;
    };

    this.input.keyboard.on("keydown-SPACE", () => { this.startApb({ doMark: true }); });

    // expose minimal API
    this.registry.set("cityApi", {
      center: () => { this.cameras.main.centerOn(this.car.x, this.car.y); },
      follow: (on) => { if (on) this.cameras.main.startFollow(this.car, true, 0.15, 0.15); else this.cameras.main.stopFollow(); },
      getZoom: () => this.cameras.main.zoom,
      setZoom: (z) => this.setZoom(z),
      refresh: () => this.reloadFromActiveLayout(true),
      startApb: (opts) => this.startApb(opts),
      onApbCooldownCleared: () => this.updateCityHud(), // UI can call after ad-skip
    });

    // draw + loops
    this.renderSystem.drawWorld(); this.revealSystem.drawFog(); this.revealSystem.revealAtCurrentCell(true); this._mmDirty = true; this.renderSystem.drawMinimap(true);
    this.unsubBoost = onBoostChange(({ mult, remainingSec }) => this.applyBoost(mult, remainingSec * 1000));
    this._storageHandler = () => { this._needReload = true; };
    window.addEventListener("storage", this._storageHandler);
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.reloadFromActiveLayout() });

    this.scale.on("resize", (s) => {
      this.uiCam.setSize(s.width, s.height);

      if (this.hud) {
        this.hud.setPosition(s.width / 2, PADDING - 30);
      }
      if (this.helpTxt) {
        this.helpTxt.setPosition(PADDING, PADDING - 16);
      }

      this._mmDirty = true;
      this.renderSystem.drawMinimap(true);
    });

    // debug toggle
    this._trafficDebug = false;
    this.input.keyboard.on("keydown-T", () => { this._trafficDebug = !this._trafficDebug; });
  }

  // Ensure entities are drawn above background tiles inside the container
  _refreshEntityDepths() {
    if (!this.worldLayer) return;

    // traffic over tiles
    if (this.trafficSystem.traffic) {
      for (const t of this.trafficSystem.traffic) {
        if (t?.spr) this.worldLayer.bringToTop(t.spr);
      }
    }

    // cop ring, cop, then player on top
    if (this.copRing) this.worldLayer.bringToTop(this.copRing);
    if (this.cop) this.worldLayer.bringToTop(this.cop);
    if (this.car) this.worldLayer.bringToTop(this.car);
  }

  _recalcSpeeds(){
    switch (this.prodState) {
      case "stacked": this.carSpeed = CAR_SPEED_STACK; this.copSpeed = COP_SPEED_STACK; break;
      case "boosted": this.carSpeed = CAR_SPEED_BOOST; this.copSpeed = COP_SPEED_BOOST; break;
      default: this.carSpeed = CAR_SPEED_IDLE; this.copSpeed = COP_SPEED_IDLE; break;
    }
    if (this.copSystem) {
      this.copSystem.setSpeed(this.prodState);
    }
  }

  applyBoost(multInput=1, remainingMs=0){
    const mult = Math.max(1, Number(multInput||1));
    const sec = Math.max(0, Math.floor(remainingMs/1000));
    const next = mult>=12 || sec>=7200 ? "stacked" : mult>1 ? "boosted" : "idle";
    if (next !== this.prodState) { this.prodState = next; this._recalcSpeeds(); }
    this.updateCityHud();
  }

  loadZoom(){ return Phaser.Math.Clamp(Number(lsGet(ZOOM_KEY,1))||1, ZOOM_MIN, ZOOM_MAX); }
  saveZoom(z){ try { localStorage.setItem(ZOOM_KEY, JSON.stringify(Phaser.Math.RoundTo(z, -2))); } catch {} }
  setZoom(z){
    const nz = Phaser.Math.Clamp(z, ZOOM_MIN, ZOOM_MAX);
    this.cameras.main.setZoom(nz);
    this.saveZoom(nz);
    this.events.emit("zoomChanged", nz);
    this._mmDirty = true;
    this.renderSystem.drawMinimap(true);
  }
  installZoomControls(worldCam){
    const upd = (z)=>this.setZoom(z);
    this.input.on("wheel", (_p,_go,_dx,dy)=>{ upd(worldCam.zoom + (dy>0?-1:1)*ZOOM_STEP); });
    this.input.keyboard.on("keydown-Q", ()=>upd(worldCam.zoom - ZOOM_STEP));
    this.input.keyboard.on("keydown-E", ()=>upd(worldCam.zoom + ZOOM_STEP));
  }

  countTiles(){
    const c={ road:0, avenue:0, roundabout:0, home:0, house:0, shop:0, park:0, hq:0, start:0 };
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++){
      const b=normBase(this.grid[y]?.[x]); if(c[b]!==undefined) c[b]+=1;
    }
    return c;
  }

  updateCityHud(){
    // HARD GUARD: avoid renderer crashes if HUD is gone or scene is shutting down
    if (!this.hud || !this.hud.scene || !this.sys || this.sys.isDestroyed) return;

    let s = {};
    try { s = computeCityIncomeSnapshot() || {}; } catch { s = {}; }

    const per = Math.max(0, Number(s.totalPerMin)||0);
    const mult = Math.max(1, Number(s.boostMult)||1);
    const left = Math.max(0, Number(s.remainingBoostSec)||0);
    const crawl = Math.max(0, Number(((s.basePerMin||0)+(s.cityPerMin||0))*0.12).toFixed(2));
    const full  = Math.max(0, Number(((s.basePerMin||0)+(s.cityPerMin||0))*mult).toFixed(2));
    const c = this.countTiles();

    this.currPerMin = per;

    const apb = getApbStatus();

    let txt = `Passive ${per.toFixed(1)}🪙/min  ·  crawl ${crawl}/min  boost ${full}/min  ·  r${c.road}/av${c.avenue}/rb${c.roundabout}/h${c.home+c.house}/s${c.shop}/p${c.park}/hq${c.hq}`;
    if (mult>1 && left>0){ const m=(left/60)|0, s2=left%60; txt += `  ·  x${mult} (${m}:${String(s2).padStart(2,"0")})`; }
    if (this.apb) {
      txt += `  ·  APB ${this.apbRemaining|0}s  stash ${this.apbBaseEarned|0}`;
    } else if (!apb.canRun) {
      txt += `  ·  cooldown ${Math.max(0, apb.cooldownSec|0)}s`;
    }

    try { this.hud.setText(txt); } catch {}
  }

  // drawing


  findStart(){
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++)
      if(normBase(this.grid[y]?.[x])==="start") return { x:x*TILE, y:y*TILE };
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++){
      if (normBase(this.grid[y]?.[x])==="home"){
        const opts=[[1,0],[-1,0],[0,1],[0,-1]];
        for(const [dx,dy] of opts){
          const gx=x+dx, gy=y+dy;
          if (this.gridSystem.isRoadCell(gx,gy)) return { x:gx*TILE, y:gy*TILE };
        }
      }
    }
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++) if(this.gridSystem.isRoadCell(x,y)) return { x:x*TILE, y:y*TILE };
    return { x:0, y:0 };
  }

  randomRoadPixel(){
    const roads = [];
    for(let y=0;y<this.h;y++) {
      for(let x=0;x<this.w;x++) {
        if(this.gridSystem.isRoadCell(x,y)) {
          roads.push({ x:x*TILE, y:y*TILE });
        }
      }
    }
    if(!roads.length) return null;
    return roads[Math.floor(Math.random() * roads.length)];
  }

  // base turns

  // UPDATED: use from/to lane points for the corner control

  // ——— U-turn helpers ———

  // —— NEW: local tests for safe U-turns ——
// True cul-de-sac detection: we only allow U-turn if the car is
// effectively boxed in and not next to a roundabout shortcut.





  // ——— crash burst ———
  spawnCrash(x, y){
    const group = this.add.container(0, 0).setDepth(6);

    for (let i = 0; i < 8; i++){
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 80;
      const s  = this.add.image(x, y, "pm_fire").setScale(0.8 + Math.random()*0.6).setAlpha(1);
      group.add(s);
      this.tweens.add({
        targets: s,
        x: x + Math.cos(a)*sp,
        y: y + Math.sin(a)*sp,
        alpha: 0,
        scale: 0.2,
        duration: 240 + Math.random()*160,
        ease: "Cubic.easeOut",
        onComplete: () => s.destroy()
      });
    }

    for (let i = 0; i < 6; i++){
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 30;
      const puff = this.add.image(x, y, "pm_smoke").setScale(0.7 + Math.random()*0.5).setAlpha(0.9);
      group.add(puff);
      this.tweens.add({
        targets: puff,
        x: x + Math.cos(a)*sp,
        y: y + Math.sin(a)*sp - 8,
        alpha: 0,
        scale: 0.1,
        duration: 620 + Math.random()*180,
        ease: "Sine.easeOut",
        onComplete: () => puff.destroy()
      });
    }

    this.time.delayedCall(800, ()=> group.destroy());
    this.shake(120, 0.0022);
  }

  // —— tailgating helpers ——
// Cars will slow/stop when following another car too closely on the same lane,
// with persona-dependent follow distance and a small probability of rear-end
// collisions under tight spacing.




  shutdown(){
    this.unsubBoost?.();
    window.removeEventListener("storage", this._storageHandler);
    if (this._onApbStatus) window.removeEventListener("apb:status", this._onApbStatus);
    
    if (this._copCaughtHandler && this.copSystem) {
      this.copSystem.off('cop:caught', this._copCaughtHandler);
    }
    
    // Destroy all systems via SystemManager
    if (this.systemManager) {
      this.systemManager.destroy();
    }
  }
  destroy(){ this.shutdown(); super.destroy(); }

  update(_,delta){
    let dt = delta/1000;
    if (dt > this._maxDt) dt = this._maxDt;

    // player movement
    const dx = (this.cursors.right.isDown || this.keys.D.isDown ? 1 : 0) -
               (this.cursors.left.isDown  || this.keys.A.isDown ? 1 : 0);
    const dy = (this.cursors.down.isDown  || this.keys.S.isDown ? 1 : 0) -
               (this.cursors.up.isDown    || this.keys.W.isDown ? 1 : 0);

    const v = new Phaser.Math.Vector2(dx,dy);
    if (v.lengthSq()>0){
      v.normalize().scale(this.carSpeed*dt);
      let nx=this.car.x+v.x, ny=this.car.y+v.y;

      if (this.gridSystem.isRoadPixel(nx,ny)){ this.car.x=nx; this.car.y=ny; }
      else { if (this.gridSystem.isRoadPixel(nx,this.car.x)) this.car.x=nx; if (this.gridSystem.isRoadPixel(this.car.x,ny)) this.car.y=ny; }

      this.lastCarDir.set(Math.sign(v.x||0), Math.sign(v.y||0));
      const ang = Phaser.Math.Angle.Between(0,0,v.x,v.y);
      this.car.setRotation(ang + CAR_ROT_OFFSET);

      const { gx, gy } = this.gridSystem.pixToCell(this.car.x, this.car.y);
      if (this.gridSystem.isRoadCell(gx, gy)) {
        const snap = laneSnapPoint(gx, gy, this.lastCarDir, this.car.x, this.car.y);
        const offX = snap.x - this.car.x;
        const offY = snap.y - this.car.y;
        const snapAlpha = Math.min(1, AUTO_SNAP_STRENGTH * dt);
        this.car.x = Phaser.Math.Linear(this.car.x, snap.x, snapAlpha);
        this.car.y = Phaser.Math.Linear(this.car.y, snap.y, snapAlpha);
        if (Math.abs(offX) > EDGE_PUSH_PIX || Math.abs(offY) > EDGE_PUSH_PIX) {
          const push = EDGE_PUSH_SPEED * dt;
          if (Math.abs(offX) > EDGE_PUSH_PIX) this.car.x += Math.sign(offX) * Math.min(push, Math.abs(offX));
          if (Math.abs(offY) > EDGE_PUSH_PIX) this.car.y += Math.sign(offY) * Math.min(push, Math.abs(offY));
        }
      }
      this.revealSystem.revealAtCurrentCell(false);
      this._mmDirty = true;

      // Keep player on top as it moves (just in case)
      this._refreshEntityDepths();
    }

    // APB loop with routing
    if (this.apb){
      this.apbRemaining = Math.max(0, this.apbRemaining - dt);

      // Update cop ring position
      this.copRing.setPosition(this.cop.x, this.cop.y);

      // Check if time ran out (evaded)
      if (this.apbRemaining<=0){
        const durationSec = Math.max(0, Math.round((this.time.now - this._apbStartedAt)/1000));
        const stash = this.apbBaseEarned|0;
        const hits  = this.apbHits|0;
        const bonus = hits > 0 ? Math.ceil(hits / 10) * BONUS_PER_10_HITS : 0;
        const evasion = EVASION_EVADED;

        if (bonus > 0) { addCoins(bonus); this.makePopup(this.car.x, this.car.y - 12, `+${bonus} bonus`, 0xffea76); this.shake(200, 0.004); }
        if (evasion > 0) { addCoins(evasion); this.makePopup(this.car.x, this.car.y - 24, `+${evasion}`, 0xbfe08a); }

        const stats = {
          result: "evaded",
          durationSec,
          hits,
          hitCoins: stash,
          bonus,
          evasion,
          total: (stash + bonus + evasion)|0,
        };
        this.apb=false; this.hideCop();
        for (const t of this.trafficSystem.traffic) t.spr.setTint(0xbfd1ff);
        this.updateCityHud();
        this.showApbSummary(stats);
      }
    }

    // passive income — whole coins only
    if (this.currPerMin > 0){
      this._incomeCarry += (this.currPerMin / 60) * dt;
      const whole = Math.floor(this._incomeCarry);
      if (whole >= 1) {
        addCoins(whole);
        this._incomeCarry -= whole;
      }
    }

    // APB intensity ramp
    if (this.apb){
      this._apbSpawnCarry += APB_RAMP_SPAWNS_PER_SEC * dt;
      while (this._apbSpawnCarry >= 1){
        this.trafficSystem.spawnTraffic();
        this._apbSpawnCarry -= 1;
      }
    } else {
      this._apbSpawnCarry = 0;
    }

    // pickups
    if (!this._carGraceUntil || this.time.now >= this._carGraceUntil) {
      const carX = this.car.x, carY = this.car.y;
      let pickedIdx = -1;
      for (let i = 0; i < this.trafficSystem.traffic.length; i++) {
        const t = this.trafficSystem.traffic[i];
        const d2 = Phaser.Math.Distance.Squared(carX, carY, t.spr.x, t.spr.y);
        if (d2 < 12*12) { pickedIdx = i; break; }
      }
      if (pickedIdx >= 0) {
        const t = this.trafficSystem.traffic[pickedIdx];
        if (this.apb) {
          const reward = this.apbHitReward|0; // 1 or 2, frozen at start
          addCoins(reward);
          this.apbBaseEarned += reward;
          this.apbHits += 1;
          this.makePopup(t.spr.x, t.spr.y - 10, `+${reward}`, 0xffea76);
          this.shake(90, 0.0025);
        } else {
          this.makePopup(t.spr.x, t.spr.y - 10, `•`, 0x9fb4c8);
        }
        t.spr.destroy();
        this.trafficSystem.traffic.splice(pickedIdx, 1);
        this._carGraceUntil = this.time.now + 220;
      }
    }

    // Update all systems via SystemManager
    if (this.systemManager) {
      this.systemManager.update(this.time.now, delta);
    }

    if (this.time.now >= this._nextHudAt) { this.updateCityHud(); this._nextHudAt = this.time.now + 300; }
    if (this.minimapOn) this.renderSystem.drawMinimap(false);

    if (this._needReload && !this._reloadLock){
      this._reloadLock=true; this._needReload=false;
      this.time.delayedCall(80, ()=>{ this._reloadLock=false; this.reloadFromActiveLayout(true); });
    }
  }


  reloadFromActiveLayout(force=false){
    const sim=loadActiveLayout(); const hash=safeHash(sim);
    if (!force && hash===this._lastSimHash) return;
    this._lastSimHash=hash;

    this.activeSlotId=sim.slotId;
    this.applySim(sim.grid, sim.w, sim.h);
    this._buildRoadGraph();

    // Reload reveal system with new slot ID
    this.revealSystem.reload();
    this.mmScaleIdx = Number(lsGet(makePerSlotKey(MM_SCALE_KEY_BASE, this.activeSlotId), 0)) || 0;
    this.mmPos = lsGet(makePerSlotKey(MM_POS_KEY_BASE, this.activeSlotId), { x:null, y:null });

    this.renderSystem.drawWorld();
    const spawn=this.findStart()||{x:TILE,y:TILE};
    // Grid-relative position, maintain high depth
    this.car.setPosition(spawn.x+TILE/2, spawn.y+TILE/2).setDepth(100).setVisible(true);
    if (this.apb) this.spawnCop?.();
    this.updateCityHud(); this.revealSystem.drawFog(); this.revealSystem.revealAtCurrentCell(true);
    this._mmDirty = true; this.renderSystem.drawMinimap(true);

    // Make sure ordering is still correct after reload
    this._refreshEntityDepths();
  }

  // fx + summary
  shake(ms, intensity){ this.cameras.main.shake(ms, intensity); }
  makePopup(x, y, text, colorInt=0xffffff){
    const hex = "#"+(colorInt>>>0).toString(16).padStart(6,"0");
    const t = this.add.text(x, y, text, { fontFamily:"monospace", fontSize: 12, color: hex })
      .setOrigin(0.5).setDepth(10000).setScrollFactor(0);
    this.tweens.add({
      targets: t, y: y - 18, alpha: { from: 1, to: 0 },
      duration: 600, ease: "Sine.easeOut",
      onComplete: () => t.destroy()
    });
  }

  showApbSummary(stats) {
    // Hard guard: if scene or UI is gone, just bail
    if (!this.sys || this.sys.isDestroyed) return;
    if (!this.cameras || !this.scale) return;

    try {
      // Load / update personal best safely
      let pb = { stash: 0, total: 0 };
      try {
        const raw = localStorage.getItem(APB_PB_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Number.isFinite(parsed?.stash) && Number.isFinite(parsed?.total)) {
            pb = { stash: parsed.stash | 0, total: parsed.total | 0 };
          }
        }
      } catch {}

      const newPB = {
        stash: Math.max(pb.stash | 0, stats.hitCoins | 0),
        total: Math.max(pb.total | 0, stats.total | 0),
      };

      try {
        localStorage.setItem(APB_PB_KEY, JSON.stringify(newPB));
      } catch {}

      const cx = this.scale.width / 2;
      const cy = this.scale.height / 2;

      const panel = this.add
        .container(cx, cy)
        .setDepth(200000)
        .setScrollFactor(0);

      if (this.uiLayer) {
        this.uiLayer.add(panel);
      }

      const destroy = () => {
        panel.destroy();
        this.input.keyboard.removeListener("keydown-ENTER", onEnter);
      };

      const onEnter = (ev) => {
        if (ev.code === "Enter" || ev.key === "Enter") destroy();
      };

      // Dimmed background
      const bg = this.add
        .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0);
      bg.on("pointerup", destroy);

      const margin = 16;
      const baseW = 360;

      const titleText =
        stats.result === "evaded" ? "APB Evaded" : "APB Caught";

      const title = this.add
        .text(0, 0, titleText, {
          fontFamily: "monospace",
          fontSize: 18,
          color: "#ffd27a",
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0);

      const lines = [
        `Time: ${stats.durationSec}s`,
        `Hits: ${stats.hits}  (+${stats.hitCoins})`,
        `Bonus: +${stats.bonus}`,
        `Evasion: +${stats.evasion}`,
        `Total payout: ${stats.total}`,
        `PB (stash/total): ${newPB.stash}/${newPB.total}`,
      ];

      const body = this.add
        .text(0, 0, lines.join("\n"), {
          fontFamily: "monospace",
          fontSize: 14,
          color: "#cbd5e1",
          align: "center",
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0);

      title.setPosition(0, margin);
      body.setPosition(0, title.y + title.height + 8);

      const btn = this.add
        .text(0, 0, "Close (Enter)", {
          fontFamily: "monospace",
          fontSize: 14,
          color: "#111",
          backgroundColor: "#ffd27a",
          padding: { left: 10, right: 10, top: 5, bottom: 5 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0);

      btn.setPosition(0, body.y + body.height + 14);
      btn.on("pointerup", destroy);
      this.input.keyboard.on("keydown-ENTER", onEnter);

      const contentH = btn.y + btn.height + margin;
      const contentW = Math.max(baseW, body.width + 40);

      const box = this.add.graphics().setScrollFactor(0);
      box.fillStyle(0x12151a, 0.98);
      box.fillRoundedRect(-contentW / 2, 0, contentW, contentH, 10);
      box.lineStyle(1, 0x3a3f46, 1);
      box.strokeRoundedRect(-contentW / 2, 0, contentW, contentH, 10);

      panel.add([bg, box, title, body, btn]);

      panel.setAlpha(0);
      this.tweens.add({
        targets: panel,
        alpha: 1,
        duration: 180,
        ease: "Sine.easeOut",
      });
    } catch (err) {
      // Fail-safe: log and keep the game running even if summary fails
      // eslint-disable-next-line no-console
      console.error("APB summary failed:", err);
    }
  }
}
