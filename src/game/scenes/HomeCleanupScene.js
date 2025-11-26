// FILE: src/game/scenes/HomeCleanupScene.js
// Home Cleanup mini-game:
// - 6×6 grid background matching Home layout
// - Player controls ProcrastiMate avatar with arrows/WASD
// - Placed home items act as solid walls
// - Nano Bots wander around empty tiles
// - Collect Nano Bots for Mate Coins

import Phaser from "phaser";
import { getHome } from "../../modules/home";

const GRID_SIZE = 6;
const TILE_SIZE = 80;
const GRID_OFFSET_X = 120;
const GRID_OFFSET_Y = 110; // Moved down from 80 to avoid blocking title

const PLAYER_SPEED = 200;
const NANOBOT_COUNT = 5; // Start with 5 bots
const COINS_PER_BOT = 25;

// Minimal copy of the home icon map so the cleanup grid matches Home.jsx
const HOME_ICONS = {
  home_floor_basic: "⬜",
  home_rug_cozy: "🧶",
  home_sofa_simple: "🛋️",
  home_chair_gamer: "💺",
  home_bed_single: "🛏️",
  home_tv_basic: "📺",
  home_desk_simple: "🧰",
  home_plant_small: "🪴",
  home_lamp_corner: "💡",
};

export default class HomeCleanupScene extends Phaser.Scene {
  constructor() {
    super("HomeCleanupScene");
  }

  init(data) {
    this.nanobotCount = data?.nanobotCount || NANOBOT_COUNT;
    this.coinsPerBot = data?.coinsPerBot || COINS_PER_BOT;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.collected = 0;
    this.totalCoins = 0;
    this._finishReason = "complete";

    // Dark background
    this.add.rectangle(w / 2, h / 2, w, h, 0x09090b);

    // Title
    this.add
      .text(w / 2, 24, "🧹 Home Cleanup", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        fontStyle: "bold",
        color: "#f5f5f4",
      })
      .setOrigin(0.5, 0);

    // Get home layout
    const homeData = getHome();
    this.homeGrid = homeData.cells || [];

    // Draw 6×6 grid background
    this._drawGrid();

    // Spawn player
    this._spawnPlayer();

    // Spawn nanobots on empty tiles
    this._spawnNanobots();

    // HUD
    this.scoreText = this.add.text(24, 60, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "18px",
      color: "#bbf7d0",
    });
    this._updateHUD();

    this.hintText = this.add.text(
      w / 2,
      h - 24,
      "Arrows/WASD to move · Collect all Nano Bots!",
      {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#e5e7eb",
      }
    );
    this.hintText.setOrigin(0.5, 1).setAlpha(0.7);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");

    // ESC to exit early
    this.input.keyboard.on("keydown-ESC", () => {
      if (this._finished) return;
      this._finishReason = "escape";
      this._finishCleanup("escape");
    });

    // Nano Bot wandering timer
    this.time.addEvent({
      delay: 900,
      loop: true,
      callback: this._wanderBots,
      callbackScope: this,
    });

    // Track if finished
    this._finished = false;
  }

  /* ---------- grid helpers ---------- */

  _gridIndex(x, y) {
    return y * GRID_SIZE + x;
  }

  _isInsideGrid(x, y) {
    return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;
  }

  _isBlockedTile(x, y) {
    if (!this._isInsideGrid(x, y)) return true;
    const idx = this._gridIndex(x, y);
    const cellId = this.homeGrid[idx];
    // Any placed home item counts as a solid wall
    return !!cellId;
  }

  _tileCenterX(gridX) {
    return GRID_OFFSET_X + gridX * TILE_SIZE;
  }

  _tileCenterY(gridY) {
    return GRID_OFFSET_Y + gridY * TILE_SIZE;
  }

  /* ---------- render background ---------- */

  _drawGrid() {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const px = this._tileCenterX(x);
        const py = this._tileCenterY(y);

        const idx = this._gridIndex(x, y);
        const cellId = this.homeGrid[idx];
        const isFilled = !!cellId;

        // Tile background – neutral greys so furniture isn't neon green
        const tileColor = isFilled ? 0x111827 : 0x020617;
        const tile = this.add.rectangle(
          px,
          py,
          TILE_SIZE - 4,
          TILE_SIZE - 4,
          tileColor
        );
        tile.setStrokeStyle(2, isFilled ? 0x4b5563 : 0x27272a);

        // Show icon for placed home items
        if (isFilled) {
          const iconChar = HOME_ICONS[cellId] || "■";
          this.add
            .text(px, py, iconChar, {
              fontSize: "26px",
              color: "#e5e7eb",
            })
            .setOrigin(0.5);
        }
      }
    }
  }

  /* ---------- player ---------- */

  _spawnPlayer() {
    // Start player roughly in the center of the grid
    const startGridX = Math.floor(GRID_SIZE / 2);
    const startGridY = Math.floor(GRID_SIZE / 2);
    const centerX = this._tileCenterX(startGridX);
    const centerY = this._tileCenterY(startGridY);

    // Player avatar (yellow square)
    const playerBody = this.add.rectangle(0, 0, 32, 32, 0xfacc15);
    const playerStroke = this.add.rectangle(0, 0, 36, 36);
    playerStroke.setStrokeStyle(3, 0x78350f);

    this.player = this.add.container(centerX, centerY, [playerStroke, playerBody]);
    this.player.setSize(32, 32);

    // Store grid position
    this.playerGridX = startGridX;
    this.playerGridY = startGridY;
  }

  /* ---------- Nano Bots ---------- */

  _spawnNanobots() {
    this.nanobots = this.add.group();

    // Get empty tile positions
    const emptyTiles = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const idx = this._gridIndex(x, y);
        if (!this.homeGrid[idx]) {
          emptyTiles.push({ x, y });
        }
      }
    }

    // Shuffle and pick positions
    Phaser.Utils.Array.Shuffle(emptyTiles);
    const spawnCount = Math.min(this.nanobotCount, emptyTiles.length);

    for (let i = 0; i < spawnCount; i++) {
      const { x, y } = emptyTiles[i];
      const px = this._tileCenterX(x);
      const py = this._tileCenterY(y);

      // Nanobot (green circle)
      const botBody = this.add.circle(0, 0, 14, 0x22c55e);
      const botStroke = this.add.circle(0, 0, 16);
      botStroke.setStrokeStyle(2, 0x10b981);

      const bot = this.add.container(px, py, [botStroke, botBody]);
      bot.setSize(28, 28);
      bot.setData("gridX", x);
      bot.setData("gridY", y);

      this.nanobots.add(bot);

      // Gentle pulse animation
      this.tweens.add({
        targets: botBody,
        scale: 1.15,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  // Simple random-walk AI for Nano Bots
  _wanderBots() {
    if (this._finished || !this.nanobots) return;

    const bots = this.nanobots.getChildren();
    if (!bots.length) return;

    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    // Track occupied tiles so bots don't stack
    const occupied = new Set();
    for (const bot of bots) {
      const gx = bot.getData("gridX");
      const gy = bot.getData("gridY");
      occupied.add(`${gx},${gy}`);
    }

    for (const bot of bots) {
      const fromX = bot.getData("gridX");
      const fromY = bot.getData("gridY");
      const startKey = `${fromX},${fromY}`;

      // Shuffle directions per bot
      Phaser.Utils.Array.Shuffle(dirs);

      let targetX = fromX;
      let targetY = fromY;
      let moved = false;

      for (const { dx, dy } of dirs) {
        const nx = fromX + dx;
        const ny = fromY + dy;
        const key = `${nx},${ny}`;

        if (!this._isInsideGrid(nx, ny)) continue;
        if (this._isBlockedTile(nx, ny)) continue; // don't walk through furniture
        if (occupied.has(key)) continue; // avoid other bots

        targetX = nx;
        targetY = ny;
        moved = true;
        // Update occupied map
        occupied.delete(startKey);
        occupied.add(key);
        break;
      }

      if (!moved) continue;

      bot.setData("gridX", targetX);
      bot.setData("gridY", targetY);

      const px = this._tileCenterX(targetX);
      const py = this._tileCenterY(targetY);

      this.tweens.add({
        targets: bot,
        x: px,
        y: py,
        duration: 220,
        ease: "Sine.easeInOut",
      });
    }
  }

  /* ---------- HUD ---------- */

  _updateHUD() {
    this.scoreText.setText(
      `Collected: ${this.collected}/${this.nanobotCount}  ·  +${this.totalCoins} Mate 🪙`
    );
  }

  /* ---------- main loop ---------- */

  update(time, delta) {
    if (this._finished) return;

    this._movePlayer(delta);
    this._checkCollisions();
  }

  _movePlayer(delta) {
    const dt = delta / 1000;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.keys.A?.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.keys.D?.isDown) dx += 1;
    if (this.cursors.up.isDown || this.keys.W?.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.keys.S?.isDown) dy += 1;

    if (dx === 0 && dy === 0) return;

    // Normalize diagonal movement
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;

    const speed = PLAYER_SPEED * dt;
    const oldX = this.player.x;
    const oldY = this.player.y;

    // Proposed new position
    let newX = oldX + dx * speed;
    let newY = oldY + dy * speed;

    // Clamp to grid bounds (center-to-center)
    const clampedX = Phaser.Math.Clamp(
      newX,
      GRID_OFFSET_X,
      GRID_OFFSET_X + (GRID_SIZE - 1) * TILE_SIZE
    );
    const clampedY = Phaser.Math.Clamp(
      newY,
      GRID_OFFSET_Y,
      GRID_OFFSET_Y + (GRID_SIZE - 1) * TILE_SIZE
    );

    // Convert to grid coords
    const targetGridX = Phaser.Math.Clamp(
      Math.round((clampedX - GRID_OFFSET_X) / TILE_SIZE),
      0,
      GRID_SIZE - 1
    );
    const targetGridY = Phaser.Math.Clamp(
      Math.round((clampedY - GRID_OFFSET_Y) / TILE_SIZE),
      0,
      GRID_SIZE - 1
    );

    // If the target tile is blocked by furniture, cancel move
    if (this._isBlockedTile(targetGridX, targetGridY)) {
      this.player.x = oldX;
      this.player.y = oldY;
      return;
    }

    // Commit move
    this.player.x = clampedX;
    this.player.y = clampedY;
    this.playerGridX = targetGridX;
    this.playerGridY = targetGridY;
  }

  _checkCollisions() {
    const playerBounds = new Phaser.Geom.Rectangle(
      this.player.x - 16,
      this.player.y - 16,
      32,
      32
    );

    this.nanobots.children.each((bot) => {
      if (!bot || !bot.active) return;
      
      // Skip if already collected (prevents multiple collections per frame)
      if (bot.getData("collected")) return;

      const botBounds = new Phaser.Geom.Rectangle(
        bot.x - 14,
        bot.y - 14,
        28,
        28
      );

      if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, botBounds)) {
        // Mark as collected immediately to prevent double-counting
        bot.setData("collected", true);
        this._collectBot(bot);
      }
    });
  }

  _collectBot(bot) {
    // Award coins
    this.collected += 1;
    this.totalCoins += this.coinsPerBot;
    this._updateHUD();

    // Simple flash/tween on collect (no external textures required)
    this.tweens.add({
      targets: bot,
      scale: 1.4,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        bot.destroy();
      },
    });

    // FIX: Only finish when ALL bots collected (not >=, use ===)
    if (this.collected === this.nanobotCount) {
      this.time.delayedCall(300, () => {
        this._finishCleanup("complete");
      });
    }
  }

  /* ---------- finish / exit ---------- */

  _finishCleanup(reason) {
    if (this._finished) return;
    this._finished = true;
    this._finishReason = reason || this._finishReason || "complete";

    const w = this.scale.width;
    const h = this.scale.height;

    const panel = this.add.rectangle(w / 2, h / 2, 400, 200, 0x000000, 0.9);
    const border = this.add.rectangle(w / 2, h / 2, 404, 204);
    border.setStrokeStyle(3, 0x22c55e);

    const titleText =
      this._finishReason === "complete"
        ? "🎉 Cleanup Complete!"
        : "Cleanup Finished";

    this.add
      .text(w / 2, h / 2 - 50, titleText, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        fontStyle: "bold",
        color: "#bbf7d0",
      })
      .setOrigin(0.5);

    this.add
      .text(
        w / 2,
        h / 2,
        `Earned: ${this.totalCoins} Mate Coins 🪙`,
        {
          fontFamily: "system-ui, sans-serif",
          fontSize: "18px",
          color: "#fde68a",
        }
      )
      .setOrigin(0.5);

    const button = this.add
      .text(w / 2, h / 2 + 50, "Return Home", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#22c55e",
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on("pointerover", () => {
      button.setStyle({ backgroundColor: "#16a34a" });
    });

    button.on("pointerout", () => {
      button.setStyle({ backgroundColor: "#22c55e" });
    });

    button.on("pointerdown", () => {
      this._exitScene();
    });

    // Also allow ESC/Enter/Space to exit
    this.input.keyboard.once("keydown-ESC", () => this._exitScene());
    this.input.keyboard.once("keydown-ENTER", () => this._exitScene());
    this.input.keyboard.once("keydown-SPACE", () => this._exitScene());
  }

  _exitScene() {
    const payload = {
      mode: "home_cleanup",
      reason: this._finishReason || "complete",
      collected: this.collected,
      totalBots: this.nanobotCount,
      coins: this.totalCoins,
      ts: Date.now(),
    };

    try {
      this.game.events.emit("homeCleanup:complete", payload);
    } catch (e) {
      console.warn("Failed to emit homeCleanup:complete", e);
    }

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.stop("HomeCleanupScene");
    });
  }
}