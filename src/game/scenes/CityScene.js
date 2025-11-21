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
const CAR_SPEED_IDLE  = 110;
const CAR_SPEED_BOOST = 160;
const CAR_SPEED_STACK = 180;

const COP_SPEED_IDLE  = 90;
const COP_SPEED_BOOST = 130;
const COP_SPEED_STACK = 150;

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
const UTURN_COOLDOWN_SEC   = 2.0;
const UTURN_MIN_PROGRESS   = 0.80;
const NO_UTURN_NEAR_RB_CELLS = 1;

// —— Personas ——
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

// helpers
const vec = (x,y)=>new Phaser.Math.Vector2(x,y);
const cellKey = (gx, gy) => `${gx},${gy}`;

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
    const sim = citySlots.loadSim();
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
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => "" ));
  grid[5][2] = "home";
  grid[5][3] = "r"; grid[5][4] = "r"; grid[6][4] = "r";
  grid[5][5] = "rb";
  grid[5][6] = "r"; grid[4][5] = "r"; grid[6][5] = "r";
  return { slotId: null, w, h, grid };
}
function loadActiveLayout(){ return loadFromSlots() || loadFromBuilderLS() || loadDefault(); }
const safeHash = (sim) => JSON.stringify([sim?.slotId||"", sim?.w||0, sim?.h||0, sim?.grid?.[0]?.[0]||""]);

// lane helpers
function lanePositionFor(gx, gy, dir, isRoundabout){
  const cx = PADDING + gx*TILE + TILE/2;
  const cy = PADDING + gy*TILE + TILE/2;
  if (!isRoundabout) {
    if (Math.abs(dir.x) > 0) return { x: cx, y: cy + (dir.x > 0 ? +LANE_OFFSET : -LANE_OFFSET) };
    return { x: cx + (dir.y > 0 ? -LANE_OFFSET : +LANE_OFFSET), y: cy };
  }
  const ring = Math.round(TILE * 0.30);
  if (dir.x > 0)  return { x: cx,        y: cy + ring };
  if (dir.x < 0)  return { x: cx,        y: cy - ring };
  if (dir.y > 0)  return { x: cx - ring, y: cy       };
  return            { x: cx + ring, y: cy       };
}
function lanePointInCell(gx, gy, dir, t){
  const baseX = PADDING + gx*TILE;
  const baseY = PADDING + gy*TILE;
  if (Math.abs(dir.x) > 0){
    const laneY = lanePositionFor(gx, gy, dir, false).y;
    const x0 = dir.x > 0 ? baseX : baseX + TILE;
    const x1 = dir.x > 0 ? baseX + TILE : baseX;
    return { x: x0 + (x1 - x0) * t, y: laneY };
  } else {
    const laneX = lanePositionFor(gx, gy, dir, false).x;
    const y0 = dir.y > 0 ? baseY : baseY + TILE;
    const y1 = dir.y > 0 ? baseY + TILE : baseY;
    return { x: laneX, y: y0 + (y1 - y0) * t };
  }
}
function laneSnapPoint(gx, gy, dir, x, y){
  if (Math.abs(dir.x) > 0){
    const ly = lanePositionFor(gx, gy, dir, false).y;
    return { x, y: ly };
  } else {
    const lx = lanePositionFor(gx, gy, dir, false).x;
    return { x: lx, y };
  }
}
function entryPosition(gx, gy, newDir) {
  const inset = TILE * 0.18;
  const baseX = PADDING + gx * TILE;
  const baseY = PADDING + gy * TILE;
  if (Math.abs(newDir.x) > 0) {
    const x = newDir.x > 0 ? baseX + inset : baseX + TILE - inset;
    const y = lanePositionFor(gx, gy, newDir, false).y;
    return { x, y };
  } else {
    const y = newDir.y > 0 ? baseY + inset : baseY + TILE - inset;
    const x = lanePositionFor(gx, gy, newDir, false).x;
    return { x, y };
  }
}
function turnType(fromDir, toDir){
  const z = fromDir.x * toDir.y - fromDir.y * toDir.x;
  if (z > 0) return "left";
  if (z < 0) return "right";
  return "straight";
}

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
  constructor(){ super("CityScene"); }

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

    this.traffic = [];
    this.copRingTween = null;

    // occupancy + reservations
    this.cellPassTS    = new Map();
    this.laneReserveTS = new Map();

    this.mmScaleIdx = Number(lsGet(makePerSlotKey(MM_SCALE_KEY_BASE, this.activeSlotId), 0)) || 0;
    this.minimapOn = true;
    this.mmPos = lsGet(makePerSlotKey(MM_POS_KEY_BASE, this.activeSlotId), { x: null, y: null });

    this.revealKey = makePerSlotKey(REVEAL_KEY_BASE, this.activeSlotId);
    this.reveal = this.loadReveal();
    this.lastCellKey = "";

    // APB runtime state
    this.apb = false;
    this.apbRemaining = 0;
    this.apbBaseEarned = 0;
    this.apbHits = 0;
    this.apbHitReward = 1;

    // cop routing state
    this.copRoute = null;
    this.copRouteIdx = 0;
    this._copNextReplanAt = 0;
    this._copLastDist = Infinity;
    this._copStallSec = 0;
    this._copLastSeenCar = { x: 0, y: 0 };

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

    // precompute road graph
    this._buildRoadGraph();
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
  }

  // ——— road graph + BFS ———
  _buildRoadGraph(){
    const adj = new Map();
    const ok = (x,y)=> this.isRoadCell(x,y);
    const add = (a,b) => { const k = cellKey(a.gx,a.gy); if(!adj.has(k)) adj.set(k,[]); adj.get(k).push(b); };
    for (let gy=0; gy<this.h; gy++){
      for (let gx=0; gx<this.w; gx++){
        if (!ok(gx,gy)) continue;
        const here = { gx, gy };
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=gx+dx, ny=gy+dy;
          if (ok(nx,ny)) add(here,{gx:nx,gy:ny});
        }
      }
    }
    this._roadAdj = adj;
  }
  _bfsPath(start, goal){
    if (!start || !goal) return null;
    const sk = cellKey(start.gx,start.gy), gk = cellKey(goal.gx,goal.gy);
    if (sk===gk) return [start];
    const q=[sk], prev=new Map(); prev.set(sk,null);
    let steps=0;
    while(q.length && steps < ROUTE_MAX_STEPS){
      const k=q.shift();
      if (k===gk) break;
      const neigh = (this._roadAdj.get(k)||[]);
      for(const n of neigh){
        const nk = cellKey(n.gx,n.gy);
        if (prev.has(nk)) continue;
        prev.set(nk,nk===sk?null:k);
        q.push(nk);
      }
      steps++;
    }
    if (!prev.has(gk)) return null;
    const path=[];
    for(let cur=gk; cur; cur=prev.get(cur)){
      const [gx,gy]=cur.split(",").map(Number);
      path.push({gx,gy});
    }
    path.reverse();
    return path;
  }

  // lane occupancy helpers
  dirCode(d){ return `${(Math.sign(d.x)|0)},${(Math.sign(d.y)|0)}`; }
  laneKey(gx,gy,dir){ return `${gx},${gy},${this.dirCode(dir)}`; }
  laneReserveKey(gx,gy,dir){ return `${gx},${gy},${this.dirCode(dir)},RES`; }
  reserveLane(gx,gy,dir,untilSec){ this.laneReserveTS.set(this.laneReserveKey(gx,gy,dir), untilSec); }
  canEnterLane(gx,gy,dir,nowSec){
    if (!this.isRoadCell(gx,gy)) return false;
    const k  = this.laneKey(gx,gy,dir);
    const last = this.cellPassTS.get(k) || 0;
    const rsv  = this.laneReserveTS.get(this.laneReserveKey(gx,gy,dir)) || 0;
    return (nowSec - last) >= CELL_GAP_SEC && nowSec >= rsv;
  }
  markLanePass(gx,gy,dir,nowSec){ this.cellPassTS.set(this.laneKey(gx,gy,dir), nowSec); }

  randomRoadPixel(){
    const cells=[];
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++) if(this.isRoadCell(x,y)) cells.push({gx:x,gy:y});
    if (!cells.length) return null;
    const pick = cells[(Math.random()*cells.length)|0];
    return { x: pick.gx*TILE, y: pick.gy*TILE };
  }

  preload(){
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
    this.worldLayer = this.add.container(0, 0);
    this.uiLayer = this.add.container(0, 0).setDepth(100000);
    worldCam.ignore(this.uiLayer);
    this.uiCam.ignore(this.worldLayer);

    // world graphics
    this.worldGfx = this.add.graphics().setPosition(PADDING, PADDING).setDepth(1);
    this.roadDetailGfx = this.add.graphics().setPosition(PADDING, PADDING).setDepth(2);
    this.fogGfx = this.add.graphics().setDepth(3);
    this.worldLayer.add([this.worldGfx, this.roadDetailGfx, this.fogGfx]);

    // player + cop
    const spawn = this.findStart() || { x: TILE, y: TILE };
    this.car = this.add.image(PADDING + spawn.x + TILE/2, PADDING + spawn.y + TILE/2, "pm_car")
      .setOrigin(0.5).setDepth(10).setVisible(true);
    this.worldLayer.add(this.car);

    this.cop = this.add.image(this.car.x, this.car.y, "pm_cop")
      .setOrigin(0.5).setVisible(false).setDepth(9);
    this.copRing = this.add.circle(this.cop.x, this.cop.y, 8, 0xff3355, 0.22)
      .setStrokeStyle(2, 0xffc0c8, 0.9).setVisible(false).setDepth(8);
    this.worldLayer.add([this.cop, this.copRing]);

    // camera follow + zoom
    const worldW = PADDING*2 + this.w*TILE;
    const worldH = PADDING*2 + this.h*TILE;
    worldCam.setBounds(0, 0, worldW, worldH);
    worldCam.startFollow(this.car, true, 0.15, 0.15);
    worldCam.setZoom(this.loadZoom());
    this.installZoomControls(worldCam);

    // HUD
    this.helpTxt = this.add.text(PADDING, PADDING - 16,
      "City: SPACE to run APB. Arrows/WASD drive. Q/E zoom. M minimap.",
      { fontFamily: "monospace", fontSize: 12, color: "#aab2bc" }
    ).setScrollFactor(0);
    this.hud = this.add.text(PADDING, PADDING - 32, "", {
      fontFamily: "monospace", fontSize: 14, color: "#e8d08a",
      backgroundColor: "rgba(27,31,35,0.25)", padding: { left: 6, right: 6, top: 3, bottom: 3 },
    }).setScrollFactor(0);
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
      this.drawMinimap(true);
    });
    this.input.keyboard.on("keydown-M", () => {
      if (!this.minimapOn) this.minimapOn = true;
      else this.mmScaleIdx = (this.mmScaleIdx + 1) % MM_SCALES.length;
      try { localStorage.setItem(makePerSlotKey(MM_SCALE_KEY_BASE, this.activeSlotId), JSON.stringify(this.mmScaleIdx)); } catch {}
      this._mmDirty = true;
      this.drawMinimap(true);
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
      let r = this.randomRoadPixel();
      if (!r) {
        const { gx, gy } = this.pixToCell(this.car.x, this.car.y);
        r = { x: gx*TILE, y: gy*TILE };
      }
      this.cop.setPosition(PADDING + r.x + TILE/2, PADDING + r.y + TILE/2).setVisible(true);
      this.copRing.setPosition(this.cop.x, this.cop.y).setVisible(true);
      this.copRingTween?.stop();
      this.copRingTween = this.tweens.add({
        targets: this.copRing, scale: { from: 1, to: 1.25 }, alpha: { from: 0.28, to: 0.10 },
        duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
    };
    this.hideCop = () => { this.cop.setVisible(false); this.copRing.setVisible(false); this.copRingTween?.stop(); };

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
      for (const t of this.traffic) t.spr.setTint(0xffea76);
      this._copRouteReset();
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
    this.drawWorld(); this.drawFog(); this.revealAtCurrentCell(true); this._mmDirty = true; this.drawMinimap(true);
    this.time.addEvent({ delay: TRAFFIC_SPAWN_MS, loop: true, callback: () => this.spawnTraffic() });
    this.unsubBoost = onBoostChange(({ mult, remainingSec }) => this.applyBoost(mult, remainingSec * 1000));
    this._storageHandler = () => { this._needReload = true; };
    window.addEventListener("storage", this._storageHandler);
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.reloadFromActiveLayout() });
    this.scale.on("resize", (s) => { this.uiCam.setSize(s.width, s.height); this._mmDirty = true; this.drawMinimap(true); });

    // debug toggle
    this._trafficDebug = false;
    this.input.keyboard.on("keydown-T", () => { this._trafficDebug = !this._trafficDebug; });
  }

  _recalcSpeeds(){
    switch (this.prodState) {
      case "stacked": this.carSpeed = CAR_SPEED_STACK; this.copSpeed = COP_SPEED_STACK; break;
      case "boosted": this.carSpeed = CAR_SPEED_BOOST; this.copSpeed = COP_SPEED_BOOST; break;
      default: this.carSpeed = CAR_SPEED_IDLE; this.copSpeed = COP_SPEED_IDLE; break;
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
    this.drawMinimap(true);
  }
  installZoomControls(worldCam){
    const upd = (z)=>this.setZoom(z);
    this.input.on("wheel", (_p,_go,_dx,dy)=>{ upd(worldCam.zoom + (dy>0?-1:1)*ZOOM_STEP); });
    this.input.keyboard.on("keydown-Q", ()=>upd(worldCam.zoom - ZOOM_STEP));
    this.input.keyboard.on("keydown-E", ()=>upd(worldCam.zoom + ZOOM_STEP));
  }

  loadReveal(){
    const raw = lsGet(this.revealKey, null);
    const ok = raw && typeof raw==="object" && raw.w===this.w && raw.h===this.h && raw.cells && typeof raw.cells==="object";
    return ok ? raw : { w:this.w, h:this.h, cells:{} };
  }
  saveReveal(){ try { localStorage.setItem(this.revealKey, JSON.stringify(this.reveal)); } catch {} }
  isRevealed(gx,gy){ return !!this.reveal.cells[cellKey(gx,gy)]; }
  markRevealed(gx,gy){
    if (gx<0||gy<0||gx>=this.w||gy>=this.h) return false;
    const k = cellKey(gx,gy); if (this.reveal.cells[k]) return false;
    this.reveal.cells[k]=1; return true;
  }
  revealAtCurrentCell(force=false){
    const {gx,gy}=this.pixToCell(this.car.x,this.car.y);
    const key = cellKey(gx,gy);
    if (!force && key===this.lastCellKey) return;
    this.lastCellKey = key;
    let changed = this.markRevealed(gx,gy);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) changed = this.markRevealed(gx+dx,gy+dy) || changed;
    if (changed || force){ this.saveReveal(); this.drawFog(); this._mmDirty = true; this.drawMinimap(true); }
  }
  drawFog(){
    const g=this.fogGfx; g.clear(); g.fillStyle(0x000000,0.55);
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++)
      if(!this.isRevealed(x,y)) g.fillRect(PADDING+x*TILE, PADDING+y*TILE, TILE, TILE);
  }

  countTiles(){
    const c={ road:0, avenue:0, roundabout:0, home:0, house:0, shop:0, park:0, hq:0, start:0 };
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++){ const b=normBase(this.grid[y]?.[x]); if(c[b]!==undefined) c[b]+=1; }
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
  drawWorld(){
    const g=this.worldGfx, dg=this.roadDetailGfx; if(!g||!dg) return;
    g.clear(); dg.clear();
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++){
      const b=normBase(this.grid[y]?.[x]); const px=x*TILE, py=y*TILE;
      switch(b){
        case "road": this.drawRoadSmart(g,dg,x,y,false); break;
        case "avenue": this.drawRoadSmart(g,dg,x,y,true); break;
        case "roundabout": this.drawRoundabout(g,dg,x,y); break;
        case "park": this.drawPark(g,px,py); break;
        case "home":
        case "house": this.drawHouse(g,px,py); break;
        case "shop": this.drawShop(g,px,py); break;
        case "hq": this.drawHQ(g,px,py); break;
        case "start": this.drawStart(g,px,py); break;
        default: this.drawEmpty(g,px,py); break;
      }
    }
    g.lineStyle(1,0x000000,0.18);
    for(let x=0;x<=this.w;x++) g.lineBetween(x*TILE,0,x*TILE,this.h*TILE);
    for(let y=0;y<=this.h;y++) g.lineBetween(0,y*TILE,this.w*TILE,y*TILE);
    this._mmDirty = true;
  }
  isRoadTile(gx,gy){
    if (gy<0||gy>=this.h||gx<0||gx>=this.w) return false;
    const b=normBase(this.grid[gy]?.[gx]); return b==="road"||b==="avenue"||"roundabout"===b;
  }
  roadNeighbors(gx,gy){ return { n:this.isRoadTile(gx,gy-1), s:this.isRoadTile(gx,gy+1), w:this.isRoadTile(gx-1,gy), e:this.isRoadTile(gx+1,gy) }; }
  isRoundaboutCell(gx,gy){ return normBase(this.grid[gy]?.[gx])==="roundabout"; }
  drawRoadSmart(g,dg,gx,gy,avenue){
    const x=gx*TILE, y=gy*TILE;
    g.fillStyle(avenue?0x2e2e2e:0x343434,1).fillRect(x,y,TILE,TILE);
    g.lineStyle(1,0x222222,0.9).strokeRect(x+0.5,y+0.5,TILE-1,TILE-1);
    const nb=this.roadNeighbors(gx,gy);
    if (nb.w && nb.e){ const ymid=y+TILE/2-1; dg.fillStyle(0xffffff,0.35); for(let i=x+2;i<x+TILE-6;i+=8) dg.fillRect(i,ymid,6,2); }
    if (nb.n && nb.s){ const xmid=x+TILE/2-1; dg.fillStyle(0xffffff,0.35); for(let j=y+2;j<y+TILE-6;j+=8) dg.fillRect(xmid,j,2,6); }
    if (avenue && nb.n && nb.s){ const xm=x+TILE/2-2; dg.fillStyle(0xfff3,0.22).fillRect(xm,y+2,4,TILE-4); }
  }
  drawRoundabout(g,dg,gx,gy){
    const x=gx*TILE, y=gy*TILE, cx=x+TILE/2, cy=y+TILE/2;
    g.fillStyle(0x343434,1).fillRect(x,y,TILE,TILE);
    g.lineStyle(1,0x222222,0.9).strokeRect(x+0.5,y+0.5,TILE-1,TILE-1);
    const rOuter=TILE*0.26, rInner=TILE*0.14;
    dg.fillStyle(0x222326,1).fillCircle(cx,cy,rOuter);
    dg.fillStyle(0x111215,1).fillCircle(cx,cy,rInner);
    dg.lineStyle(1,0x2b2d31,0.9).strokeCircle(cx,cy,rOuter);
  }
  drawEmpty(g,x,y){ g.fillStyle(0x21252b,1).fillRect(x,y,TILE,TILE); }
  drawPark(g,x,y){ g.fillStyle(0x2b8a3e,1).fillRect(x,y,TILE,TILE); }
  drawHouse(g,x,y){ g.fillStyle(0x4a4a4a,1).fillRect(x,y,TILE,TILE); }
  drawShop(g,x,y){ g.fillStyle(0x6078ff,1).fillRect(x,y,TILE,TILE); }
  drawHQ(g,x,y){ g.fillStyle(0xb94b5e,1).fillRect(x,y,TILE,TILE); }
  drawStart(g,x,y){ g.fillStyle(0xe2a23a,1).fillRect(x,y,TILE,TILE);
    g.fillStyle(0x000000,0.25).fillTriangle(x+TILE*0.2,y+TILE*0.7, x+TILE*0.5,y+TILE*0.3, x+TILE*0.8,y+TILE*0.7); }

  pixToCell(px,py){ return { gx: Math.floor((px-PADDING)/TILE), gy: Math.floor((py-PADDING)/TILE) }; }
  isInsideGrid(gx,gy){ return gx>=0 && gy>=0 && gx<this.w && gy<this.h; }
  isRoadCell(gx,gy){ return this.isInsideGrid(gx,gy) && this.drive[gy][gx]; }
  isRoadPixel(px,py){ const {gx,gy}=this.pixToCell(px,py); return this.isRoadCell(gx,gy); }
  leaveWorld(nx,ny){ const {gx,gy}=this.pixToCell(nx,ny); return !this.isInsideGrid(gx,gy); }

  findStart(){
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++)
      if(normBase(this.grid[y]?.[x])==="start") return { x:x*TILE, y:y*TILE };
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++){
      if (normBase(this.grid[y]?.[x])==="home"){
        const opts=[[1,0],[-1,0],[0,1],[0,-1]];
        for(const [dx,dy] of opts){
          const gx=x+dx, gy=y+dy;
          if (this.isRoadCell(gx,gy)) return { x:gx*TILE, y:gy*TILE };
        }
      }
    }
    for(let y=0;y<this.h;y++) for(let x=0;x<this.w;x++) if(this.isRoadCell(x,y)) return { x:x*TILE, y:y*TILE };
    return { x:0, y:0 };
  }

  // base turns
  turnRight(d){ if (d.x===1) return {x:0,y:1}; if (d.x===-1) return {x:0,y:-1}; if (d.y===1) return {x:-1,y:0}; return {x:1,y:0}; }
  goStraight(d){ return {x:d.x, y:d.y}; }
  turnLeft(d){ if (d.x===1) return {x:0,y:-1}; if (d.x===-1) return {x:0,y:1}; if (d.y===1) return {x:1,y:0}; return {x:-1,y:0}; }
  circulateTurn(d){ return (TRAFFIC_SIDE==="right") ? this.turnLeft(d) : this.turnRight(d); }
  exitTurn(d){ return (TRAFFIC_SIDE==="right") ? this.turnRight(d) : this.turnLeft(d); }

  cornerControl(gx, gy, _fromDir, toDir){
    const round = this.isRoundaboutCell(gx, gy);
    const cx = PADDING + gx*TILE + TILE/2;
    const cy = PADDING + gy*TILE + TILE/2;
    if (round) return { x: cx, y: cy };
    const edgeX = (toDir.x!==0) ? PADDING + (gx + (toDir.x>0?1:0)) * TILE : cx;
    const edgeY = (toDir.y!==0) ? PADDING + (gy + (toDir.y>0?1:0)) * TILE : cy;
    return { x: edgeX, y: edgeY };
  }
  cellProgress(dir, x, y, baseX, baseY) {
    if (Math.abs(dir.x) > 0) return dir.x > 0 ? (x - baseX) / TILE : ((baseX + TILE) - x) / TILE;
    return dir.y > 0 ? (y - baseY) / TILE : ((baseY + TILE) - y) / TILE;
  }
  startBezierTurn(t, cNow, chooseDir, dstCell, nowSec, progInCell=0.7){
    const sClamped = Math.max(0.06, Math.min(0.95, progInCell));
    const from = lanePointInCell(cNow.gx, cNow.gy, t.dir, sClamped);
    const ctrl = this.cornerControl(cNow.gx, cNow.gy, t.dir, chooseDir);
    const to   = entryPosition(dstCell.x, dstCell.y, chooseDir);
    const len  = quadLen(from, ctrl, to) || TILE;
    this.reserveLane(dstCell.x, dstCell.y, chooseDir, nowSec + RESERVE_SEC);
    t.turn = { s:0, from, ctrl, to, len, newDir:{x:chooseDir.x,y:chooseDir.y}, dst:{x:dstCell.x,y:dstCell.y} };
  }

  // ——— U-turn helpers ———
  reverseDir(d){ return { x: -d.x, y: -d.y }; }
  startUTurn(t, cNow, nowSec, progInCell=0.8){
    const dir = t.dir;
    const sClamped = Math.max(0.06, Math.min(0.95, progInCell));
    const from = lanePointInCell(cNow.gx, cNow.gy, dir, sClamped);

    const center = {
      x: PADDING + cNow.gx*TILE + TILE/2,
      y: PADDING + cNow.gy*TILE + TILE/2
    };
    const to   = entryPosition(cNow.gx, cNow.gy, this.reverseDir(dir));

    const ctrl = {
      x: center.x + (dir.y !== 0 ? 0 : (dir.x > 0 ? +TILE*0.35 : -TILE*0.35)),
      y: center.y + (dir.x !== 0 ? 0 : (dir.y > 0 ? +TILE*0.35 : -TILE*0.35)),
    };

    const len = quadLen(from, ctrl, to) || TILE;
    t.turn = {
      s:0, from, ctrl, to, len,
      newDir: this.reverseDir(dir),
      dst: { x:cNow.gx, y:cNow.gy }
    };
    this.reserveLane(cNow.gx, cNow.gy, t.turn.newDir, nowSec + RESERVE_SEC*0.6);
  }

  // —— NEW: local tests for safe U-turns ——
  isRoundaboutNeighbor(gx, gy){
    for (let dx=-NO_UTURN_NEAR_RB_CELLS; dx<=NO_UTURN_NEAR_RB_CELLS; dx++){
      for (let dy=-NO_UTURN_NEAR_RB_CELLS; dy<=NO_UTURN_NEAR_RB_CELLS; dy++){
        if (dx===0 && dy===0) continue;
        const x=gx+dx, y=gy+dy;
        if (this.isInsideGrid(x,y) && this.isRoundaboutCell(x,y)) return true;
      }
    }
    return false;
  }
  trueCulDeSac(cNow, dir){
    const f1 = { x: cNow.gx + dir.x, y: cNow.gy + dir.y };
    if (this.isRoadCell(f1.x, f1.y)) {
      const l = this.turnLeft(dir), r = this.turnRight(dir);
      const l1 = { x: f1.x + l.x, y: f1.y + l.y };
      const r1 = { x: f1.x + r.x, y: f1.y + r.y };
      const f2 = { x: f1.x + dir.x, y: f1.y + dir.y };
      if (this.isRoadCell(l1.x,l1.y) || this.isRoadCell(r1.x,r1.y) || this.isRoadCell(f2.x,f2.y)) return false;
      return true;
    }
    const nearRB = this.isRoundaboutCell(cNow.gx, cNow.gy) || this.isRoundaboutNeighbor(cNow.gx, cNow.gy);
    return !nearRB;
  }

  edgeRoadCells(){
    const cells = [];
    for (let x=0;x<this.w;x++){
      if (this.isRoadCell(x,0) && this.isRoadCell(x,1)) cells.push({gx:x, gy:0, dir:{x:0,y:1}});
      if (this.isRoadCell(x,this.h-1) && this.isRoadCell(x,this.h-2)) cells.push({gx:x, gy:this.h-1, dir:{x:0,y:-1}});
    }
    for (let y=0;y<this.h;y++){
      if (this.isRoadCell(0,y) && this.isRoadCell(1,y)) cells.push({gx:0, gy:y, dir:{x:1,y:0}});
      if (this.isRoadCell(this.w-1,y) && this.isRoadCell(this.w-2,y)) cells.push({gx:this.w-1, gy:y, dir:{x:-1,y:0}});
    }
    return cells;
  }

  pickSpawnPoint(){
    const cam = this.cameras.main;
    const view = cam.worldView;
    const marginRect = new Phaser.Geom.Rectangle(
      view.x - VIEW_BIAS_MARGIN, view.y - VIEW_BIAS_MARGIN,
      view.width + VIEW_BIAS_MARGIN*2, view.height + VIEW_BIAS_MARGIN*2
    );
    const car = new Phaser.Math.Vector2(this.car.x, this.car.y);

    const starts = [];
    for (const e of this.edgeRoadCells()) starts.push(e);
    for (let gy = 0; gy < this.h; gy++) for (let gx = 0; gx < this.w; gx++) {
      if (!this.isRoadCell(gx, gy)) continue;
      const axis = this.roadOrientation(gx, gy);
      const dirs = axis === "h" ? [{x:1,y:0},{x:-1,y:0}] : [{x:0,y:1},{x:0,y:-1}];
      for (const d of dirs) {
        const nx = gx + d.x, ny = gy + d.y;
        if (this.isRoadCell(nx, ny)) starts.push({ gx, gy, dir: d });
      }
    }
    if (!starts.length) return null;

    const scored = [];
    for (const s of starts) {
      const px = PADDING + s.gx*TILE + TILE/2;
      const py = PADDING + s.gy*TILE + TILE/2;
      const inView = marginRect.contains(px, py);
      const farFromPlayer = Phaser.Math.Distance.Between(px, py, car.x, car.y) > PLAYER_SPAWN_AVOID_RADIUS;
      const score = (inView ? 0 : 2) + (farFromPlayer ? 1 : 0);
      scored.push({ s, score });
    }
    scored.sort((a,b)=>b.score-a.score);
    const topScore = scored[0].score;
    const top = scored.filter(k=>k.score===topScore).map(k=>k.s);
    return top[(Math.random()*top.length)|0];
  }

  spawnTraffic(){
    if (this.traffic.length >= TRAFFIC_MAX) return;
    const cell = this.pickSpawnPoint();
    if (!cell) return;

    let dir = cell.dir
      ? vec(cell.dir.x, cell.dir.y)
      : (() => {
          const axis = this.roadOrientation(cell.gx, cell.gy);
          return axis==="h" ? vec(Math.random()<0.5?1:-1,0) : vec(0,Math.random()<0.5?1:-1);
        })();

    const nowSec = this.time.now/1000;
    if (!this.canEnterLane(cell.gx, cell.gy, dir, nowSec)) return;

    const fwd = { x: cell.gx + dir.x, y: cell.gy + dir.y };
    if (!this.isRoadCell(fwd.x, fwd.y)) return;

    // persona selection
    const kind = pickPersonaKey();
    const P = PERSONAS[kind];

    const pos = lanePositionFor(cell.gx, cell.gy, dir, this.isRoundaboutCell(cell.gx, cell.gy));
    const spr = this.add.image(pos.x, pos.y, P.tex)
      .setTint(this.apb ? 0xffea76 : P.tint)
      .setDepth(4).setAlpha(0.95);
    this.worldLayer.add(spr);

    // store per-car traits
    this.traffic.push({
      spr, dir, wait:0, inRound:false, laps:0, lastKey:"", turn:null,
      lastUTurnAt: -999, justExitedRBUntil: 0,
      kind,
      speedMult: P.mult,
      ignoreYield: P.ignoreYield,
      uturnCd: P.uturnCd,
      chaosBias: P.chaosBias,
      followGapPx: P.followGapPx,
      rearendRate: P.rearendRate,
      crashDistPx: P.crashDistPx,
      chaosHoldCellKey: "", // prevents turning in this cell once triggered
    });
    this.markLanePass(cell.gx, cell.gy, dir, nowSec);
  }

  roadOrientation(gx,gy){
    const nb=this.roadNeighbors(gx,gy);
    const horiz=(nb.w||nb.e), vert=(nb.n||nb.s);
    if (horiz && !vert) return "h";
    if (vert && !horiz) return "v";
    return Math.random()<0.5 ? "h" : "v";
  }

  edgePosition(gx, gy, newDir){
    if (Math.abs(newDir.x) > 0) {
      const x = PADDING + (gx + (newDir.x > 0 ? 1 : 0)) * TILE;
      const y = lanePositionFor(gx, gy, newDir, this.isRoundaboutCell(gx, gy)).y;
      return { x, y };
    } else {
      const y = PADDING + (gy + (newDir.y > 0 ? 1 : 0)) * TILE;
      const x = lanePositionFor(gx, gy, newDir, this.isRoundaboutCell(gx, gy)).x;
      return { x, y };
    }
  }

  canPlanTurnFrom(cNow, _dir, chooseDir, nowSec){
    const first = { x: cNow.gx + chooseDir.x, y: cNow.gy + chooseDir.y };
    const second = { x: first.x + chooseDir.x, y: first.y + chooseDir.y };
    const ok1 = this.isRoadCell(first.x, first.y) && this.canEnterLane(first.x, first.y, chooseDir, nowSec);
    const ok2 = this.isRoadCell(second.x, second.y);
    return ok1 && ok2 ? { first, second } : null;
  }

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
  _carAheadSameLane(t){
    const meX = t.spr.x, meY = t.spr.y;
    const horiz = Math.abs(t.dir.x) > 0;
    let best = null;
    for (let i=0;i<this.traffic.length;i++){
      const o = this.traffic[i];
      if (o === t || o.turn) continue;
      if (o.dir.x !== t.dir.x || o.dir.y !== t.dir.y) continue;
      if (horiz){
        if (Math.abs(o.spr.y - meY) > 1.0) continue;
        const ahead = (t.dir.x>0) ? (o.spr.x > meX) : (o.spr.x < meX);
        if (!ahead) continue;
        const dpx = Math.abs(o.spr.x - meX);
        if (!best || dpx < best.dpx) best = { idx:i, dpx, x:o.spr.x, y:o.spr.y };
      }else{
        if (Math.abs(o.spr.x - meX) > 1.0) continue;
        const ahead = (t.dir.y>0) ? (o.spr.y > meY) : (o.spr.y < meY);
        if (!ahead) continue;
        const dpx = Math.abs(o.spr.y - meY);
        if (!best || dpx < best.dpx) best = { idx:i, dpx, x:o.spr.x, y:o.spr.y };
      }
    }
    return best;
  }

  _applyFollowGapClamp(t, nx, ny, lead){
    if (!lead) return { nx, ny, clamped:false };
    const gap = Math.max(3, t.followGapPx||10);
    const horiz = Math.abs(t.dir.x) > 0;
    if (horiz){
      if (t.dir.x>0){
        const maxX = lead.x - gap;
        if (nx > maxX) return { nx:maxX, ny, clamped:true };
      } else {
        const minX = lead.x + gap;
        if (nx < minX) return { nx:minX, ny, clamped:true };
      }
    } else {
      if (t.dir.y>0){
        const maxY = lead.y - gap;
        if (ny > maxY) return { nx, ny:maxY, clamped:true };
      } else {
        const minY = lead.y + gap;
        if (ny < minY) return { nx, ny:minY, clamped:true };
      }
    }
    return { nx, ny, clamped:false };
  }

  _maybeRearEnd(t, leadInfo, dt){
    if (!leadInfo) return false;
    const dangerPx = Math.max(3, t.crashDistPx||5);
    if (leadInfo.dpx > dangerPx) return false;
    const rate = Math.max(0, t.rearendRate||0);
    const p = 1 - Math.exp(-rate * dt);
    if (Math.random() < p){
      const L = this.traffic[leadInfo.idx];
      const cx = (t.spr.x + L.spr.x) * 0.5;
      const cy = (t.spr.y + L.spr.y) * 0.5;
      this.spawnCrash(cx, cy);
      if (Math.random() < 0.6){
        L.spr.destroy(); this.traffic.splice(leadInfo.idx, 1);
      }
      t._flagCrashed = true;
      return true;
    }
    return false;
  }

  stepTraffic(dt){
    const nowSec = this.time.now/1000;
    if (this._trafficDebug) this.roadDetailGfx.clear();

    for (let i=this.traffic.length-1;i>=0;i--){
      const t=this.traffic[i];
      if (t.wait>0){ t.wait-=dt; continue; }

      if (this.apb && this.time.now >= this._nextFlickerAt) {
        t.spr.setAlpha(0.85 + 0.1*Math.sin(this.time.now*0.02));
      } else if (!this.apb) {
        const baseTint = PERSONAS[t.kind]?.tint ?? 0xbfd1ff;
        if (t.spr.tintTopLeft !== baseTint) t.spr.setTint(baseTint);
      }

      if (t.turn){
        const speed = (TRAFFIC_SPEED * t.speedMult) * 0.9 * dt;
        const a = Math.min(1, speed / (t.turn.len || TILE));
        t.turn.s = Math.min(1, t.turn.s + a);

        const s = t.turn.s, u = 1 - s;
        const x = u*u*t.turn.from.x + 2*u*s*t.turn.ctrl.x + s*s*t.turn.to.x;
        const y = u*u*t.turn.from.y + 2*u*s*t.turn.ctrl.y + s*s*t.turn.to.y;
        t.spr.setPosition(x, y);

        if (t.turn.s >= 1){
          this.markLanePass(t.turn.dst.x, t.turn.dst.y, t.turn.newDir, nowSec);
          t.dir.set(t.turn.newDir.x, t.turn.newDir.y);
          t.turn = null;
          t.wait = 0.04;
        }
        continue;
      }

      const cNow = this.pixToCell(t.spr.x, t.spr.y);
      const baseX = PADDING + cNow.gx*TILE, baseY = PADDING + cNow.gy*TILE;
      const prog  = this.cellProgress(t.dir, t.spr.x, t.spr.y, baseX, baseY);

      if (!this.isRoundaboutCell(cNow.gx, cNow.gy)) {
        const leftD = this.turnLeft(t.dir);
        const rghtD = this.exitTurn(t.dir);

        let rightPlan = this.canPlanTurnFrom(cNow, t.dir, rghtD, nowSec);
        let leftPlan  = this.canPlanTurnFrom(cNow, t.dir, leftD,  nowSec);

        if (rightPlan && !this.canEnterLane(rightPlan.first.x, rightPlan.first.y, rghtD, nowSec)) {
          if (Math.random() < (t.ignoreYield||0)) { /* allow */ }
          else rightPlan = null;
        }
        if (leftPlan && !this.canEnterLane(leftPlan.first.x, leftPlan.first.y, leftD, nowSec)) {
          if (Math.random() < (t.ignoreYield||0)) { /* allow */ }
          else leftPlan = null;
        }

        const DECIDE_START = 0.20, DECIDE_END = 0.92;
        let chooseDir = null, dstCell = null;

        const fwd1 = { x: cNow.gx + t.dir.x, y: cNow.gy + t.dir.y };
        const fwd2 = { x: fwd1.x + t.dir.x, y: fwd1.y + t.dir.y };
        const deadAhead = !this.isRoadCell(fwd1.x, fwd1.y) || !this.isRoadCell(fwd2.x, fwd2.y);

        const cellK = cellKey(cNow.gx, cNow.gy);
        const chaosChance = CHAOS_CRASH_BASE * (t.chaosBias || 1.0) * (this.apb ? 1.25 : 1.0);
        if (prog >= DECIDE_START && prog <= DECIDE_END && t.chaosHoldCellKey !== cellK) {
          if (Math.random() < chaosChance) {
            t.chaosHoldCellKey = cellK;
          }
        }

        if (t.chaosHoldCellKey !== cellK) {
          if (prog >= DECIDE_START && prog <= DECIDE_END){
            if (deadAhead) {
              if (rightPlan) { chooseDir = rghtD; dstCell = rightPlan.first; }
              else if (leftPlan) { chooseDir = leftD; dstCell = leftPlan.first; }
            } else {
              const opts = [];
              if (rightPlan) opts.push({ d:rghtD, c:rightPlan.first });
              if (leftPlan)  opts.push({ d:leftD,  c:leftPlan.first  });
              if (opts.length && Math.random()<0.20){
                const pick = opts[(Math.random()*opts.length)|0];
                chooseDir = pick.d; dstCell = pick.c;
              }
            }
          } else if (prog > DECIDE_END) {
            if (deadAhead) {
              if (rightPlan) { chooseDir = rghtD; dstCell = rightPlan.first; }
              else if (leftPlan) { chooseDir = leftD; dstCell = leftPlan.first; }
            }
          }
        }

        if (chooseDir){
          const tt = turnType(t.dir, chooseDir);
          const bias = tt === "left" ? +0.05 : tt === "right" ? -0.03 : 0;
          const progAdj = Math.max(0.0, Math.min(1.0, prog + bias));
          this.startBezierTurn(t, cNow, chooseDir, dstCell, nowSec, progAdj);
          continue;
        }

        const nowS = this.time.now/1000;
        const canUTCooldown = (nowS - (t.lastUTurnAt||-999)) >= (t.uturnCd ?? UTURN_COOLDOWN_SEC);
        const notJustExitedRB = nowS >= (t.justExitedRBUntil||0);
        const okProg = prog >= UTURN_MIN_PROGRESS;
        if (!rightPlan && !leftPlan && okProg && canUTCooldown && notJustExitedRB && this.trueCulDeSac(cNow, t.dir)) {
          this.startUTurn(t, cNow, nowSec, prog);
          t.lastUTurnAt = nowS;
          continue;
        }
      }

      // straight motion + tailgating
      const speed = (TRAFFIC_SPEED * (t.speedMult || 1)) * dt;
      let nx = t.spr.x + t.dir.x*speed;
      let ny = t.spr.y + t.dir.y*speed;

      if (this.leaveWorld(nx, ny)) { t.spr.destroy(); this.traffic.splice(i,1); continue; }

      const cNext = this.pixToCell(nx, ny);

      if (this.isRoundaboutCell(cNow.gx, cNow.gy)) {
        t.inRound = true;
        const right = this.exitTurn(t.dir);
        const gxExit = cNow.gx + right.x, gyExit = cNow.gy + right.y;

        const exitHasRoad = this.isRoadCell(gxExit, gyExit) && !this.isRoundaboutCell(gxExit, gyExit);
        const exitClear   = exitHasRoad && this.canEnterLane(gxExit, gyExit, right, nowSec);
        const gxFar = gxExit + right.x, gyFar = gyExit + right.y;
        const farOk = this.isRoadCell(gxFar, gyFar);

        const mustExit = t.laps >= ROUND_MAX_LAPS;
        const readyExit = exitClear && (t.laps >= ROUND_MIN_LAPS) && (farOk || Math.random()<0.25);

        if (exitClear && (mustExit || readyExit)) {
          t.dir.set(right.x, right.y);
          const posExit = lanePositionFor(gxExit, gyExit, t.dir, this.isRoundaboutCell(gxExit, gyExit));
          t.spr.setPosition(posExit.x, posExit.y);
          this.markLanePass(gxExit, gyExit, t.dir, nowSec);
          t.inRound = false; t.laps = 0; t.wait = 0.08;
          t.justExitedRBUntil = this.time.now/1000 + 0.8;
          continue;
        }

        const r = this.circulateTurn(t.dir);
        t.dir.set(r.x, r.y);
        const pos = lanePositionFor(cNow.gx, cNow.gy, t.dir, true);
        t.spr.setPosition(pos.x, pos.y);
        t.wait = 0.06;
        t.laps += ROUND_STEP;
        continue;
      }

      // persona chaos: crash if overshoot into dead end
      const fwdCell = { x: cNow.gx + t.dir.x, y: cNow.gy + t.dir.y };
      if (!this.isRoadCell(fwdCell.x, fwdCell.y) && this.isRoadPixel(t.spr.x, t.spr.y) && this.cellProgress(t.dir, t.spr.x, t.spr.y, PADDING + cNow.gx*TILE, PADDING + cNow.gy*TILE) > 0.92) {
        this.spawnCrash(t.spr.x, t.spr.y);
        t.spr.destroy();
        this.traffic.splice(i,1);
        continue;
      }

      // standard lane spacing/yield at cell boundary
      if ((cNext.gx!==cNow.gx || cNext.gy!==cNow.gy) && this.isRoadCell(cNext.gx,cNext.gy)) {
        if (!this.canEnterLane(cNext.gx, cNext.gy, t.dir, nowSec)){
          if (Math.random() < (t.ignoreYield||0)) {
            this.markLanePass(cNext.gx, cNext.gy, t.dir, nowSec);
          } else {
            t.wait=YIELD_PAUSE_SEC; continue;
          }
        }
      }

      if (this.isRoadPixel(nx,ny)) {
        if (Math.abs(t.dir.x) > 0){
          const use = (cNext.gx!==cNow.gx && cNext.gy===cNow.gy) ? cNext : cNow;
          ny = lanePositionFor(use.gx, use.gy, t.dir, false).y;
        } else {
          const use = (cNext.gy!==cNow.gy && cNext.gx===cNow.gx) ? cNext : cNow;
          nx = lanePositionFor(use.gx, use.gy, t.dir, false).x;
        }

        const ahead = this._carAheadSameLane(t);
        if (ahead){
          if (this._maybeRearEnd(t, ahead, dt)) {
            if (t._flagCrashed){
              t.spr.destroy();
              this.traffic.splice(i,1);
              continue;
            }
          }
          const cl = this._applyFollowGapClamp(t, nx, ny, ahead);
          nx = cl.nx; ny = cl.ny;
        }

        if (cNext.gx!==cNow.gx || cNext.gy!==cNow.gy) this.markLanePass(cNext.gx, cNext.gy, t.dir, nowSec);
        t.spr.x = nx; t.spr.y = ny;
        continue;
      }

      // choose next direction
      const options=[];
      if (this.isRoadCell(cNow.gx+1,cNow.gy)) options.push(vec(1,0));
      if (this.isRoadCell(cNow.gx-1,cNow.gy)) options.push(vec(-1,0));
      if (this.isRoadCell(cNow.gx,cNow.gy+1)) options.push(vec(0,1));
      if (this.isRoadCell(cNow.gx,cNow.gy-1)) options.push(vec(0,-1));

      const back = vec(-t.dir.x,-t.dir.y);
      const candidates = options.filter(v => !(v.x===back.x && v.y===back.y));
      const fwd = vec(t.dir.x,t.dir.y);
      let picked = candidates.find(v => v.x===fwd.x && v.y===fwd.y) ||
                   candidates[(Math.random()*candidates.length)|0] ||
                   options[(Math.random()*options.length)|0];

      if (picked){
        const gx2=cNow.gx+picked.x, gy2=cNow.gy+picked.y;
        if (!this.canEnterLane(gx2, gy2, picked, nowSec)) {
          if (Math.random() < (t.ignoreYield||0)) {
            this.markLanePass(gx2, gy2, picked, nowSec);
            t.dir.set(picked.x,picked.y);
            const edge = this.edgePosition(cNow.gx, cNow.gy, t.dir);
            t.spr.setPosition(edge.x, edge.y);
          } else {
            t.wait=YIELD_PAUSE_SEC;
          }
        } else {
          t.dir.set(picked.x,picked.y);
          const edge = this.edgePosition(cNow.gx, cNow.gy, t.dir);
          t.spr.setPosition(edge.x, edge.y);
          this.markLanePass(gx2,gy2,t.dir,nowSec);
        }
      } else {
        this.spawnCrash(t.spr.x, t.spr.y);
        t.spr.destroy(); this.traffic.splice(i,1);
      }
    }
    if (this.apb) this._nextFlickerAt = this.time.now + (1000/this._flickerHz);
  }

  // ——— APB cop routing helpers ———
  _copRouteReset(){
    this.copRoute = null;
    this.copRouteIdx = 0;
    this._copNextReplanAt = 0;
    this._copLastDist = Infinity;
    this._copStallSec = 0;
    this._copLastSeenCar = { x: this.car.x, y: this.car.y };
  }
  _centerOf(gx,gy){ return { x: PADDING + gx*TILE + TILE/2, y: PADDING + gy*TILE + TILE/2 }; }
  _planRouteToCar(){
    const start = this.pixToCell(this.cop.x, this.cop.y);
    const goal  = this.pixToCell(this.car.x, this.car.y);
    if (!this.isRoadCell(start.gx,start.gy) || !this.isRoadCell(goal.gx,goal.gy)) return false;
    const path = this._bfsPath(start, goal);
    if (!path || path.length<2) return false;
    this.copRoute = path;
    this.copRouteIdx = 1;
    this._copNextReplanAt = this.time.now/1000 + REPLAN_EVERY_SEC;
    this._copLastSeenCar = { x: this.car.x, y: this.car.y };
    return true;
  }
  _followRoute(dt){
    if (!this.copRoute) return false;
    if (this.copRouteIdx >= this.copRoute.length) return false;

    const cur = this.pixToCell(this.cop.x, this.cop.y);
    const tgt = this.copRoute[this.copRouteIdx];
    const dx = Math.sign(tgt.gx - cur.gx);
    const dy = Math.sign(tgt.gy - cur.gy);
    const dir = (Math.abs(dx) > 0) ? {x:dx,y:0} : {x:0,y:dy};

    const pos = lanePositionFor(tgt.gx, tgt.gy, dir, this.isRoundaboutCell(tgt.gx, tgt.gy));
    const v = new Phaser.Math.Vector2(pos.x - this.cop.x, pos.y - this.cop.y);
    const dist = v.length();
    if (dist < WAYPOINT_RADIUS_PX){
      this.copRouteIdx++;
      return true;
    }
    if (dist > 1){
      v.normalize().scale(this.copSpeed*dt);
      const nx=this.cop.x+v.x, ny=this.cop.y+v.y;
      if (this.isRoadPixel(nx,this.cop.y)) this.cop.x=nx;
      if (this.isRoadPixel(this.cop.x,ny)) this.cop.y=ny;
    }
    return true;
  }

  shutdown(){
    this.unsubBoost?.();
    window.removeEventListener("storage", this._storageHandler);
    if (this._onApbStatus) window.removeEventListener("apb:status", this._onApbStatus);
    this.copRingTween?.stop();
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

      if (this.isRoadPixel(nx,ny)){ this.car.x=nx; this.car.y=ny; }
      else { if (this.isRoadPixel(nx,this.car.y)) this.car.x=nx; if (this.isRoadPixel(this.car.x,ny)) this.car.y=ny; }

      this.lastCarDir.set(Math.sign(v.x||0), Math.sign(v.y||0));
      const ang = Phaser.Math.Angle.Between(0,0,v.x,v.y);
      this.car.setRotation(ang + CAR_ROT_OFFSET);

      const { gx, gy } = this.pixToCell(this.car.x, this.car.y);
      if (this.isRoadCell(gx, gy)) {
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
      this.revealAtCurrentCell(false);
      this._mmDirty = true;
    }

    // APB loop with routing
    if (this.apb){
      this.apbRemaining = Math.max(0, this.apbRemaining - dt);

      const distNow = Phaser.Math.Distance.Between(this.car.x,this.car.y,this.cop.x,this.cop.y);

      if (distNow + 0.5 < this._copLastDist) {
        this._copStallSec = 0;
        this._copLastDist = distNow;
      } else {
        this._copStallSec += dt;
      }

      const carDelta = Phaser.Math.Distance.Between(this._copLastSeenCar.x, this._copLastSeenCar.y, this.car.x, this.car.y);

      const nowSec = this.time.now/1000;
      const needReplan =
        (this._copStallSec >= STALL_SECONDS) ||
        (this.copRoute && (nowSec >= this._copNextReplanAt)) ||
        (this.copRoute && carDelta >= CAR_ROUTE_RETARGET);

      if (needReplan) {
        if (!this._planRouteToCar()) {
          this._copNextReplanAt = nowSec + 0.6;
        } else {
          this._copStallSec = 0;
          this._copLastDist = distNow;
        }
      }

      if (!(this.copRoute && this._followRoute(dt))) {
        const chase = new Phaser.Math.Vector2(this.car.x - this.cop.x, this.car.y - this.cop.y);
        if (chase.lengthSq()>1){
          chase.normalize().scale(this.copSpeed*dt);
          const nx=this.cop.x+chase.x, ny=this.cop.y+chase.y;
          if (this.isRoadPixel(nx,this.cop.y)) this.cop.x=nx;
          if (this.isRoadPixel(this.cop.x,ny)) this.cop.y=ny;
        }
      }

      this.copRing.setPosition(this.cop.x,this.cop.y);
      const caught = Phaser.Math.Distance.Between(this.car.x,this.car.y,this.cop.x,this.cop.y) < 16;

      if (caught){
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
        this.apb=false; this.apbRemaining=0; this.hideCop(); this._copRouteReset();
        for (const t of this.traffic) t.spr.setTint(0xbfd1ff);
        this.updateCityHud();
        this.showApbSummary(stats);
      }
      else if (this.apbRemaining<=0){
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
        this.apb=false; this.hideCop(); this._copRouteReset();
        for (const t of this.traffic) t.spr.setTint(0xbfd1ff);
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

    // traffic
    this.stepTraffic(dt);

    // APB intensity ramp
    if (this.apb){
      this._apbSpawnCarry += APB_RAMP_SPAWNS_PER_SEC * dt;
      while (this._apbSpawnCarry >= 1){
        this.spawnTraffic();
        this._apbSpawnCarry -= 1;
      }
    } else {
      this._apbSpawnCarry = 0;
    }

    // pickups
    if (!this._carGraceUntil || this.time.now >= this._carGraceUntil) {
      const carX = this.car.x, carY = this.car.y;
      let pickedIdx = -1;
      for (let i = 0; i < this.traffic.length; i++) {
        const t = this.traffic[i];
        const d2 = Phaser.Math.Distance.Squared(carX, carY, t.spr.x, t.spr.y);
        if (d2 < 12*12) { pickedIdx = i; break; }
      }
      if (pickedIdx >= 0) {
        const t = this.traffic[pickedIdx];
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
        this.traffic.splice(pickedIdx, 1);
        this._carGraceUntil = this.time.now + 220;
      }
    }

    if (this.time.now >= this._nextHudAt) { this.updateCityHud(); this._nextHudAt = this.time.now + 300; }
    if (this.minimapOn) this.drawMinimap(false);

    if (this._needReload && !this._reloadLock){
      this._reloadLock=true; this._needReload=false;
      this.time.delayedCall(80, ()=>{ this._reloadLock=false; this.reloadFromActiveLayout(true); });
    }
  }

  drawMinimap(force){
    if (!this.minimapOn || !this.uiCam || (this.sys && this.sys.isDestroyed)) return;
    const now = this.time.now;
    const overlayInterval = 1000 / this._mmOverlayHz;

    const scale = MM_SCALES[this.mmScaleIdx] || MM_SCALES[0];
    const tile = Math.max(3, Math.round(MM_TILE_BASE*scale));
    const w=this.w*tile, h=this.h*tile;

    let x=this.mmPos.x, y=this.mmPos.y;
    if (x==null || y==null){
      x=this.scale.width-w-MM_PAD-6; y=MM_PAD+TOP_UI_OFFSET; this.mmPos={x,y};
    }

    if (force || this._mmDirty) {
      const g = this.minimapBack;
      g.clear();
      g.fillStyle(0x0b0e12,0.68).fillRoundedRect(x-6,y-6,w+12,h+12,8);
      g.lineStyle(1, 0x3a3f46, 0.9).strokeRoundedRect(x-6,y-6,w+12,h+12,8);

      for (let gy=0;gy<this.h;gy++) for (let gx=0;gx<this.w;gx++){
        const b=normBase(this.grid[gy]?.[gx]);
        let col=0x1f232a;
        if (b==="road") col=0x3a3a3a; else if (b==="avenue") col=0x747474; else if (b==="roundabout") col=0x8a6d2b;
        else if (b==="home"||b==="house") col=0x6b5e4a; else if (b==="shop") col=0x5b7bd8; else if (b==="park") col=0x2c8c4a;
        else if (b==="hq") col=0xb24a5c; else if (b==="start") col=0xe0a134;
        if (!this.isRevealed(gx,gy)) col=0x0b0b0b;
        g.fillStyle(col,1).fillRect(x+gx*tile, y+gy*tile, tile, tile);
      }

      this.mmZone.setPosition(x-6,y-6).setSize(w+12,h+12);
      this._mmDirty = false;
      this._mmNextOverlayAt = 0;
    }

    if (now >= this._mmNextOverlayAt) {
      const og = this.minimapOverlay; og.clear();
      const pc=this.pixToCell(this.car.x,this.car.y);
      og.fillStyle(0xffcc66,1).fillRect(x+pc.gx*tile, y+pc.gy*tile, tile, tile);
      if (this.apb && this.cop?.visible){
        const cc=this.pixToCell(this.cop.x,this.cop.y);
        og.fillStyle(0xff5577,1).fillRect(x+cc.gx*tile, y+cc.gy*tile, tile, tile);
      }
      this._mmNextOverlayAt = now + overlayInterval;
    }
  }

  reloadFromActiveLayout(force=false){
    const sim=loadActiveLayout(); const hash=safeHash(sim);
    if (!force && hash===this._lastSimHash) return;
    this._lastSimHash=hash;

    this.activeSlotId=sim.slotId;
    this.applySim(sim.grid, sim.w, sim.h);
    this._buildRoadGraph();

    this.revealKey = makePerSlotKey(REVEAL_KEY_BASE, this.activeSlotId);
    this.reveal = this.loadReveal();
    this.mmScaleIdx = Number(lsGet(makePerSlotKey(MM_SCALE_KEY_BASE, this.activeSlotId), 0)) || 0;
    this.mmPos = lsGet(makePerSlotKey(MM_POS_KEY_BASE, this.activeSlotId), { x:null, y:null });

    this.drawWorld();
    const spawn=this.findStart()||{x:TILE,y:TILE};
    this.car.setPosition(PADDING+spawn.x+TILE/2, PADDING+spawn.y+TILE/2).setDepth(10).setVisible(true);
    if (this.apb) this.spawnCop?.();
    this.updateCityHud(); this.drawFog(); this.revealAtCurrentCell(true);
    this._mmDirty = true; this.drawMinimap(true);
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
