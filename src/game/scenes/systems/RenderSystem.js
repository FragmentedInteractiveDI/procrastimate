// FILE: src/game/scenes/systems/RenderSystem.js
// World rendering, road drawing, building rendering, and minimap

import { getRoadTextureKey, getBuildingTextureKey } from "../../../assets/cityAssets.js";

const TILE = 28;
const GRASS_TINT = 0x4a5a3a;
const GRASS_ALPHA = 0.9;
const PARK_COLOR = 0x225233;
const MM_PAD = 12;
const MM_TILE_BASE = 5;
const MM_SCALES = [2.2, 2.8, 3.6];
const TOP_UI_OFFSET = 24;

/**
 * Helper: Normalize cell string to base type
 */
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

/**
 * RenderSystem handles all drawing and rendering
 */
export class RenderSystem {
  constructor(scene) {
    this.scene = scene;
    this.tileSprites = [];
  }

  // ========== MAIN WORLD RENDERING ==========

  /**
   * Draw the entire world grid
   */
  drawWorld() {
    const g = this.scene.worldGfx;
    const dg = this.scene.roadDetailGfx;
    if (!g || !dg) return;

    // CRITICAL: Destroy old tile sprites before creating new ones
    if (this.tileSprites) {
      this.tileSprites.forEach(sprite => sprite.destroy());
    }
    this.tileSprites = [];

    g.clear();
    dg.clear();

    // Draw all tiles
    for (let y = 0; y < this.scene.h; y++) {
      for (let x = 0; x < this.scene.w; x++) {
        const b = normBase(this.scene.grid[y]?.[x]);
        const px = x * TILE;
        const py = y * TILE;

        switch (b) {
          case "road":
            this.drawRoadSmart(g, dg, x, y, false);
            break;
          case "avenue":
            this.drawRoadSmart(g, dg, x, y, true);
            break;
          case "roundabout":
            this.drawRoundabout(g, dg, x, y);
            break;
          case "park":
            this.drawPark(g, px, py);
            break;
          case "home":
          case "house":
            this.drawHouse(g, px, py);
            break;
          case "shop":
            this.drawShop(g, px, py);
            break;
          case "hq":
            this.drawHQ(g, px, py);
            break;
          case "start":
            this.drawStart(g, px, py);
            break;
          default:
            this.drawEmpty(g, px, py);
            break;
        }
      }
    }

    // Draw grid lines
    g.lineStyle(1, 0x000000, 0.18);
    for (let x = 0; x <= this.scene.w; x++) {
      g.lineBetween(x * TILE, 0, x * TILE, this.scene.h * TILE);
    }
    for (let y = 0; y <= this.scene.h; y++) {
      g.lineBetween(0, y * TILE, this.scene.w * TILE, y * TILE);
    }

    this.scene._mmDirty = true;

    // After adding tiles, pull entities back to the top of the container
    this.scene._refreshEntityDepths();
  }

  // ========== ROAD RENDERING ==========

  /**
   * Draw a smart road tile with automatic connections
   */
  drawRoadSmart(g, dg, gx, gy, avenue) {
    const x = gx * TILE;
    const y = gy * TILE;

    // Get neighbor information
    const nb = this.scene.gridSystem.roadNeighbors(gx, gy);

    // Determine which road sprite to use based on connections
    const tileId = avenue ? 'avenue' : 'road';
    const textureKey = getRoadTextureKey(tileId, { n: nb.n, s: nb.s, e: nb.e, w: nb.w });

    // Draw the PNG sprite if available, otherwise fallback to old method
    if (this.scene.textures.exists(textureKey)) {
      // Grid-relative position (worldLayer handles offset)
      const sprite = this.scene.add.image(x + TILE / 2, y + TILE / 2, textureKey);
      sprite.setDisplaySize(TILE, TILE);
      sprite.setDepth(1);
      this.scene.worldLayer.add(sprite); // Add to worldLayer for consistent zoom
      this.tileSprites.push(sprite);
    } else {
      // Fallback to procedural graphics if PNG not loaded
      g.fillStyle(avenue ? 0x2e2e2e : 0x343434, 1).fillRect(x, y, TILE, TILE);
      g.lineStyle(1, 0x222222, 0.9).strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      
      // Lane markings
      if (nb.w && nb.e) {
        const ymid = y + TILE / 2 - 1;
        dg.fillStyle(0xffffff, 0.35);
        for (let i = x + 2; i < x + TILE - 6; i += 8) {
          dg.fillRect(i, ymid, 6, 2);
        }
      }
      if (nb.n && nb.s) {
        const xmid = x + TILE / 2 - 1;
        dg.fillStyle(0xffffff, 0.35);
        for (let j = y + 2; j < y + TILE - 6; j += 8) {
          dg.fillRect(xmid, j, 2, 6);
        }
      }
      if (avenue && nb.n && nb.s) {
        const xm = x + TILE / 2 - 2;
        dg.fillStyle(0xfff3, 0.22).fillRect(xm, y + 2, 4, TILE - 4);
      }
    }
  }

  /**
   * Draw a roundabout tile
   */
  drawRoundabout(g, dg, gx, gy) {
    const x = gx * TILE;
    const y = gy * TILE;

    // Draw the PNG sprite if available
    if (this.scene.textures.exists('road_roundabout')) {
      const sprite = this.scene.add.image(x + TILE / 2, y + TILE / 2, 'road_roundabout');
      sprite.setDisplaySize(TILE, TILE);
      sprite.setDepth(1);
      this.scene.worldLayer.add(sprite);
      this.tileSprites.push(sprite);
    } else {
      // Fallback to procedural graphics
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      g.fillStyle(0x343434, 1).fillRect(x, y, TILE, TILE);
      g.lineStyle(1, 0x222222, 0.9).strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      const rOuter = TILE * 0.26;
      const rInner = TILE * 0.14;
      dg.fillStyle(0x222326, 1).fillCircle(cx, cy, rOuter);
      dg.fillStyle(0x111215, 1).fillCircle(cx, cy, rInner);
      dg.lineStyle(1, 0x2b2d31, 0.9).strokeCircle(cx, cy, rOuter);
    }
  }

  // ========== TERRAIN & BUILDING RENDERING ==========

  /**
   * Draw empty terrain (grass)
   */
  drawEmpty(g, x, y) {
    // Background ground: muted grass so it doesn't overpower roads/buildings
    if (this.scene.textures.exists('terrain_grass')) {
      const sprite = this.scene.add.image(x + TILE / 2, y + TILE / 2, 'terrain_grass');
      sprite.setDisplaySize(TILE, TILE);
      sprite.setDepth(0);
      sprite.setTint(GRASS_TINT);
      sprite.setAlpha(GRASS_ALPHA);
      this.scene.worldLayer.add(sprite);
      this.tileSprites.push(sprite);
    } else {
      // Slightly darker neutral fallback
      g.fillStyle(0x181b20, 1).fillRect(x, y, TILE, TILE);
    }
  }

  /**
   * Draw a park tile
   */
  drawPark(g, x, y) {
    // Parks stay a touch richer, but still toned down from neon
    g.fillStyle(PARK_COLOR, 1).fillRect(x, y, TILE, TILE);
  }

  /**
   * Draw a house building
   */
  drawHouse(g, x, y) {
    // Draw house building with 3/4 perspective
    if (this.scene.textures.exists('house_small')) {
      const sprite = this.scene.add.image(x + TILE / 2, y + TILE, 'house_small');
      sprite.setOrigin(0.5, 1.0);

      // Scale to fit width but maintain aspect ratio
      const scale = TILE / 64;
      sprite.setScale(scale);

      sprite.setDepth(5);
      this.scene.worldLayer.add(sprite);
      this.tileSprites.push(sprite);
    } else {
      g.fillStyle(0x4a4a4a, 1).fillRect(x, y, TILE, TILE);
    }
  }

  /**
   * Draw a shop building
   */
  drawShop(g, x, y) {
    // Shop uses PNG when available, else colored placeholder
    if (this.scene.textures.exists("building_shop")) {
      const sprite = this.scene.add.image(x + TILE / 2, y + TILE, "building_shop");
      sprite.setOrigin(0.5, 1.0);
      const scale = TILE / 64;
      sprite.setScale(scale);
      sprite.setDepth(5);
      this.scene.worldLayer.add(sprite);
      this.tileSprites.push(sprite);
    } else {
      g.fillStyle(0x6078ff, 1).fillRect(x, y, TILE, TILE);
    }
  }

  /**
   * Draw an HQ building
   */
  drawHQ(g, x, y) {
    // HQ uses PNG when available, else colored placeholder
    if (this.scene.textures.exists("building_hq")) {
      const sprite = this.scene.add.image(x + TILE / 2, y + TILE, "building_hq");
      sprite.setOrigin(0.5, 1.0);
      const scale = TILE / 64;
      sprite.setScale(scale);
      sprite.setDepth(5);
      this.scene.worldLayer.add(sprite);
      this.tileSprites.push(sprite);
    } else {
      g.fillStyle(0xb94b5e, 1).fillRect(x, y, TILE, TILE);
    }
  }

  /**
   * Draw the start tile (player's home)
   */
  drawStart(g, x, y) {
    // Start tile uses house (player's home)
    if (this.scene.textures.exists('house_small')) {
      const sprite = this.scene.add.image(x + TILE / 2, y + TILE, 'house_small');
      sprite.setOrigin(0.5, 1.0);

      // Scale to fit width but maintain aspect ratio
      const scale = TILE / 64;
      sprite.setScale(scale);

      sprite.setDepth(5);
      this.scene.worldLayer.add(sprite);
      this.tileSprites.push(sprite);
    } else {
      g.fillStyle(0xe2a23a, 1).fillRect(x, y, TILE, TILE);
    }
  }

  // ========== MINIMAP RENDERING ==========

  /**
   * Draw the minimap
   */
  drawMinimap(force) {
    if (!this.scene.minimapOn || !this.scene.uiCam || (this.scene.sys && this.scene.sys.isDestroyed)) {
      return;
    }

    const now = this.scene.time.now;
    const overlayInterval = 1000 / this.scene._mmOverlayHz;

    const scale = MM_SCALES[this.scene.mmScaleIdx] || MM_SCALES[0];
    const tile = Math.max(3, Math.round(MM_TILE_BASE * scale));
    const w = this.scene.w * tile;
    const h = this.scene.h * tile;

    let x = this.scene.mmPos.x;
    let y = this.scene.mmPos.y;
    if (x == null || y == null) {
      x = this.scene.scale.width - w - MM_PAD - 6;
      y = MM_PAD + TOP_UI_OFFSET;
      this.scene.mmPos = { x, y };
    }

    // Draw background and tiles if dirty or forced
    if (force || this.scene._mmDirty) {
      const g = this.scene.minimapBack;
      g.clear();
      g.fillStyle(0x0b0e12, 0.68).fillRoundedRect(x - 6, y - 6, w + 12, h + 12, 8);
      g.lineStyle(1, 0x3a3f46, 0.9).strokeRoundedRect(x - 6, y - 6, w + 12, h + 12, 8);

      for (let gy = 0; gy < this.scene.h; gy++) {
        for (let gx = 0; gx < this.scene.w; gx++) {
          const b = normBase(this.scene.grid[gy]?.[gx]);
          let col = 0x1f232a;
          if (b === "road") col = 0x3a3a3a;
          else if (b === "avenue") col = 0x747474;
          else if (b === "roundabout") col = 0x8a6d2b;
          else if (b === "home" || b === "house") col = 0x6b5e4a;
          else if (b === "shop") col = 0x5b7bd8;
          else if (b === "park") col = 0x2c8c4a;
          else if (b === "hq") col = 0xb24a5c;
          else if (b === "start") col = 0xe0a134;
          if (!this.scene.revealSystem.isRevealed(gx, gy)) col = 0x0b0b0b;
          g.fillStyle(col, 1).fillRect(x + gx * tile, y + gy * tile, tile, tile);
        }
      }

      this.scene.mmZone.setPosition(x - 6, y - 6).setSize(w + 12, h + 12);
      this.scene._mmDirty = false;
      this.scene._mmNextOverlayAt = 0;
    }

    // Draw player and cop overlay
    if (now >= this.scene._mmNextOverlayAt) {
      const og = this.scene.minimapOverlay;
      og.clear();
      const pc = this.scene.gridSystem.pixToCell(this.scene.car.x, this.scene.car.y);
      og.fillStyle(0xffcc66, 1).fillRect(x + pc.gx * tile, y + pc.gy * tile, tile, tile);
      if (this.scene.apb && this.scene.cop?.visible) {
        const cc = this.scene.gridSystem.pixToCell(this.scene.cop.x, this.scene.cop.y);
        og.fillStyle(0xff5577, 1).fillRect(x + cc.gx * tile, y + cc.gy * tile, tile, tile);
      }
      this.scene._mmNextOverlayAt = now + overlayInterval;
    }
  }

  /**
   * Clean up sprites when scene is destroyed
   */
  destroy() {
    if (this.tileSprites) {
      this.tileSprites.forEach(sprite => sprite.destroy());
    }
    this.tileSprites = [];
  }
}