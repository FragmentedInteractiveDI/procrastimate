// FILE: src/game/scenes/systems/CopSystem.js
// APB cop chase system with BFS pathfinding, routing, and catch detection

import { BaseSystem } from './BaseSystem.js';
import { lanePositionFor } from './GridSystem.js';

const TILE = 28;

export class CopSystem extends BaseSystem {
  static dependencies = ['grid', 'navigation'];
  
  static defaultConfig = {
    STALL_SECONDS: 1.8,
    REPLAN_EVERY_SEC: 0.6,
    CAR_ROUTE_RETARGET: 2.0,
    WAYPOINT_RADIUS_PX: 8,
    ROUTE_MAX_STEPS: 600,
    CATCH_DISTANCE: 16,
    COP_SPEED_IDLE: 60,
    COP_SPEED_BOOST: 80,
    COP_SPEED_STACK: 95,
    CAR_ROT_OFFSET: Math.PI / 2,
  };

  onInitialize() {
    // Core state
    this.active = false;
    this.copSpeed = this.config.COP_SPEED_IDLE;
    
    // Routing state
    this.route = null;
    this.routeIdx = 0;
    this.nextReplanAt = 0;
    this.lastDist = Infinity;
    this.stallSec = 0;
    this.lastSeenCar = { x: 0, y: 0 };
    
    // Road graph for BFS
    this.roadAdj = new Map();
    this._buildRoadGraph();
    
    // Sprite references (will be set when sprites are created)
    this.cop = null;
    this.copRing = null;
    this.copRingTween = null;
    
    this.emit('cop:initialized');
  }

  onUpdate(time, delta) {
    if (!this.active || !this.cop || !this.copRing) return;
    
    const dt = delta / 1000;
    const car = this.scene.car;
    
    // Check for catch
    const distNow = Phaser.Math.Distance.Between(car.x, car.y, this.cop.x, this.cop.y);
    
    if (distNow < this.config.CATCH_DISTANCE) {
      this.emit('cop:caught', { 
        position: { x: car.x, y: car.y },
        distance: distNow 
      });
      return;
    }
    
    // Update stall detection
    if (distNow + 0.5 < this.lastDist) {
      this.stallSec = 0;
      this.lastDist = distNow;
    } else {
      this.stallSec += dt;
    }
    
    // Check if replanning needed
    const carDelta = Phaser.Math.Distance.Between(
      this.lastSeenCar.x, 
      this.lastSeenCar.y, 
      car.x, 
      car.y
    );
    
    const nowSec = time / 1000;
    const needReplan =
      (this.stallSec >= this.config.STALL_SECONDS) ||
      (this.route && (nowSec >= this.nextReplanAt)) ||
      (this.route && carDelta >= this.config.CAR_ROUTE_RETARGET);
    
    if (needReplan) {
      if (!this._planRouteToCar()) {
        this.nextReplanAt = nowSec + 0.6;
      } else {
        this.stallSec = 0;
        this.lastDist = distNow;
      }
    }
    
    // Follow route or chase directly
    if (!(this.route && this._followRoute(dt))) {
      this._directChase(dt);
    }
    
    // Update ring position
    this.copRing.setPosition(this.cop.x, this.cop.y);
  }

  onDestroy() {
    this.hide();
    this.roadAdj.clear();
  }

  // Public API
  spawn(position = null) {
    if (this.active) return false;
    
    // Get sprite references if not already set
    if (!this.cop) {
      this.cop = this.scene.cop;
      this.copRing = this.scene.copRing;
    }
    
    // Safety check
    if (!this.cop || !this.copRing) {
      console.warn('[CopSystem] Cop sprites not ready yet');
      return false;
    }
    
    let pos;
    if (position) {
      pos = position;
    } else {
      pos = this._randomRoadPixel();
      if (!pos) {
        const car = this.scene.car;
        const { gx, gy } = this.scene.gridSystem.pixToCell(car.x, car.y);
        pos = { x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2 };
      }
    }
    
    this.cop.setPosition(pos.x, pos.y).setVisible(true);
    this.copRing.setPosition(pos.x, pos.y).setVisible(true);
    
    this.copRingTween?.stop();
    this.copRingTween = this.scene.tweens.add({
      targets: this.copRing,
      scale: { from: 1, to: 1.25 },
      alpha: { from: 0.28, to: 0.10 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    this.active = true;
    this._resetRoute();
    this.lastSeenCar = { x: this.scene.car.x, y: this.scene.car.y };
    
    this.emit('cop:spawned', { position: pos });
    
    // Refresh entity depths
    this.scene._refreshEntityDepths?.();
    
    return true;
  }

  hide() {
    this.active = false;
    
    if (this.cop) {
      this.cop.setVisible(false);
    }
    if (this.copRing) {
      this.copRing.setVisible(false);
    }
    if (this.copRingTween) {
      this.copRingTween.stop();
      this.copRingTween = null;
    }
    
    this._resetRoute();
    
    this.emit('cop:hidden');
  }

  setSpeed(prodState) {
    switch (prodState) {
      case 'stacked':
        this.copSpeed = this.config.COP_SPEED_STACK;
        break;
      case 'boosted':
        this.copSpeed = this.config.COP_SPEED_BOOST;
        break;
      default:
        this.copSpeed = this.config.COP_SPEED_IDLE;
        break;
    }
  }

  isActive() {
    return this.active;
  }

  // Private methods
  _buildRoadGraph() {
    const grid = this.scene.gridSystem;
    const adj = new Map();
    const cellKey = (gx, gy) => `${gx},${gy}`;
    
    const add = (a, b) => {
      const k = cellKey(a.gx, a.gy);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push(b);
    };
    
    for (let gy = 0; gy < this.scene.h; gy++) {
      for (let gx = 0; gx < this.scene.w; gx++) {
        if (!grid.isRoadCell(gx, gy)) continue;
        
        const here = { gx, gy };
        for (const [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
          const nx = gx + dx, ny = gy + dy;
          if (grid.isRoadCell(nx, ny)) {
            add(here, { gx: nx, gy: ny });
          }
        }
      }
    }
    
    this.roadAdj = adj;
  }

  _bfsPath(start, goal) {
    if (!start || !goal) return null;
    
    const cellKey = (gx, gy) => `${gx},${gy}`;
    const sk = cellKey(start.gx, start.gy);
    const gk = cellKey(goal.gx, goal.gy);
    
    if (sk === gk) return [start];
    
    const q = [sk];
    const prev = new Map();
    prev.set(sk, null);
    
    let steps = 0;
    while (q.length && steps < this.config.ROUTE_MAX_STEPS) {
      const k = q.shift();
      if (k === gk) break;
      
      const neigh = this.roadAdj.get(k) || [];
      for (const n of neigh) {
        const nk = cellKey(n.gx, n.gy);
        if (prev.has(nk)) continue;
        prev.set(nk, k);
        q.push(nk);
      }
      steps++;
    }
    
    if (!prev.has(gk)) return null;
    
    const path = [];
    for (let cur = gk; cur; cur = prev.get(cur)) {
      const [gx, gy] = cur.split(',').map(Number);
      path.push({ gx, gy });
    }
    path.reverse();
    return path;
  }

  _planRouteToCar() {
    const grid = this.scene.gridSystem;
    const car = this.scene.car;
    
    const start = grid.pixToCell(this.cop.x, this.cop.y);
    const goal = grid.pixToCell(car.x, car.y);
    
    if (!grid.isRoadCell(start.gx, start.gy) || !grid.isRoadCell(goal.gx, goal.gy)) {
      return false;
    }
    
    const path = this._bfsPath(start, goal);
    if (!path || path.length < 2) return false;
    
    this.route = path;
    this.routeIdx = 1;
    this.nextReplanAt = this.scene.time.now / 1000 + this.config.REPLAN_EVERY_SEC;
    this.lastSeenCar = { x: car.x, y: car.y };
    
    return true;
  }

  _followRoute(dt) {
    if (!this.route) return false;
    if (this.routeIdx >= this.route.length) return false;
    
    const grid = this.scene.gridSystem;
    const cur = grid.pixToCell(this.cop.x, this.cop.y);
    const tgt = this.route[this.routeIdx];
    
    const dx = Math.sign(tgt.gx - cur.gx);
    const dy = Math.sign(tgt.gy - cur.gy);
    const dir = Math.abs(dx) > 0 ? { x: dx, y: 0 } : { x: 0, y: dy };
    
    const pos = lanePositionFor(
      tgt.gx, 
      tgt.gy, 
      dir, 
      grid.isRoundaboutCell(tgt.gx, tgt.gy)
    );
    
    const v = new Phaser.Math.Vector2(pos.x - this.cop.x, pos.y - this.cop.y);
    const dist = v.length();
    
    if (dist < this.config.WAYPOINT_RADIUS_PX) {
      this.routeIdx++;
      return true;
    }
    
    if (dist > 1) {
      v.normalize().scale(this.copSpeed * dt);
      const nx = this.cop.x + v.x;
      const ny = this.cop.y + v.y;
      
      if (grid.isRoadPixel(nx, this.cop.y)) this.cop.x = nx;
      if (grid.isRoadPixel(this.cop.x, ny)) this.cop.y = ny;
      
      const angle = Phaser.Math.Angle.Between(0, 0, v.x, v.y);
      this.cop.setRotation(angle + this.config.CAR_ROT_OFFSET);
    }
    
    return true;
  }

  _directChase(dt) {
    const grid = this.scene.gridSystem;
    const car = this.scene.car;
    
    const chase = new Phaser.Math.Vector2(car.x - this.cop.x, car.y - this.cop.y);
    
    if (chase.lengthSq() > 1) {
      chase.normalize().scale(this.copSpeed * dt);
      const nx = this.cop.x + chase.x;
      const ny = this.cop.y + chase.y;
      
      if (grid.isRoadPixel(nx, this.cop.y)) this.cop.x = nx;
      if (grid.isRoadPixel(this.cop.x, ny)) this.cop.y = ny;
      
      const angle = Phaser.Math.Angle.Between(0, 0, chase.x, chase.y);
      this.cop.setRotation(angle + this.config.CAR_ROT_OFFSET);
    }
  }

  _resetRoute() {
    this.route = null;
    this.routeIdx = 0;
    this.nextReplanAt = 0;
    this.lastDist = Infinity;
    this.stallSec = 0;
    const car = this.scene.car;
    if (car) {
      this.lastSeenCar = { x: car.x, y: car.y };
    }
  }

  _randomRoadPixel() {
    const grid = this.scene.gridSystem;
    const roads = [];
    
    for (let y = 0; y < this.scene.h; y++) {
      for (let x = 0; x < this.scene.w; x++) {
        if (grid.isRoadCell(x, y)) {
          roads.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
        }
      }
    }
    
    if (!roads.length) return null;
    return roads[Math.floor(Math.random() * roads.length)];
  }

  // Debug
  getDebugInfo() {
    return {
      ...super.getDebugInfo(),
      active: this.active,
      copSpeed: this.copSpeed,
      hasRoute: !!this.route,
      routeLength: this.route?.length || 0,
      routeProgress: this.routeIdx,
      stallSec: this.stallSec.toFixed(2),
      lastDist: this.lastDist.toFixed(1),
    };
  }
}