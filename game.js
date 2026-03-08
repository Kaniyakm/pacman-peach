/**
 * BABS' MS. PAC-MAN — Georgia Peach Edition
 * game.js  —  all game logic
 *
 * A tribute to Barbara "Babs" Jackson — Georgia's greatest Pac-Man player.
 * Built with pure Vanilla JavaScript ES6+. No frameworks. No dependencies. Just love.
 *
 * Custom Pac-Man tribute for Barbara "Babs" Jackson from Georgia.
 * Her legendary high score of 3,333,330 (set in 1987) is permanently displayed — and can never be beaten.
 *
 * Special Features
 *   🍑 Georgia Peach gives TRIPLE points — Babs' favourite fruit
 *   All 10 classic Pac-Man fruits: Cherry · Strawberry · Orange · Apple · Melon · Grapes · Watermelon · Bell · Key · Peach
 *   BABS' unbeatable high score: 3,333,330 — hardcoded, read-only, permanent
 *   Dedication splash screen on every load
 *   Retro CRT scanline aesthetic with Georgia night sky
 *   Fully responsive — keyboard + mobile swipe + D-pad
 *
 * ES6+ features used throughout:
 *   § Private class fields  (#field)
 *   § Custom generators     (*function / yield)
 *   § Symbol enums          (STATE)
 *   § Strategy pattern      (GhostAI functions)
 *   § Observer / EventBus   (Map + Set)
 *   § Object.freeze()       (CONFIG, STATE, FRUITS)
 *   § Map for keybindings   (O(1) input lookup)
 *   § Destructuring         (everywhere)
 *
 * "Sweet as a Georgia peach — she played every game with all her heart."
 * Barbara "Babs" Jackson · Georgia 🍑 · Forever the high score holder
 */

'use strict';

// ══════════════════════════════════════════════════════════
// § 1  TRIBUTE  —  all personalisation lives here
//      Change name, hi-score, messages — nothing else needs touching
// ══════════════════════════════════════════════════════════
const TRIBUTE = Object.freeze({
  name:     'Barbara Jackson',
  nickname: 'BABS',
  hiScore:  3_333_330,      // legendary, unbeatable, permanently displayed
  hiYear:   '1987',

  gameoverMessages: [
    "Babs would've kept going! 🍑",
    "Sweet as a peach — try again! 🍑",
    "Georgia never quits! 🍑",
    "One more for Babs! 🍑",
    "She never gave up — neither should you! 🍑",
    "Babs scored higher with her eyes closed! 🍑",
  ],
});

// ══════════════════════════════════════════════════════════
// § 2  CONSTANTS  —  frozen so nothing can mutate config at runtime
// ══════════════════════════════════════════════════════════
const CFG = Object.freeze({
  TILE:         20,
  COLS:         21,
  ROWS:         23,
  PAC_SPEED:    1.8,
  GHOST_SPEED:  1.4,
  FRIGHT_BASE:  300,   // frames of fright on level 1
  FRIGHT_MIN:    60,   // minimum fright frames at high levels
  READY_FRAMES: 150,   // "READY!" display duration
  DEATH_FRAMES:  90,   // death animation duration
  SCORE: Object.freeze({
    DOT:        10,
    POWER:      50,
    GHOST_BASE: 200,
  }),
});

// ── Tile type enum ────────────────────────────────────────
const CELL = Object.freeze({ WALL: 1, DOT: 2, POWER: 3, EMPTY: 0, HOUSE: 4 });

// ── Game state enum — Symbol() guarantees unique values ───
const STATE = Object.freeze({
  IDLE:       Symbol('idle'),
  READY:      Symbol('ready'),
  PLAYING:    Symbol('playing'),
  DYING:      Symbol('dying'),
  LEVELCLEAR: Symbol('levelclear'),
  GAMEOVER:   Symbol('gameover'),
});

// ══════════════════════════════════════════════════════════
// § 3  FRUIT SYSTEM
//      9 classic Pac-Man fruits + 🍑 Peach (TRIPLE points!)
//      Orange is drawn manually on canvas so it's unmistakably
//      an orange — no ambiguous emoji rendering.
// ══════════════════════════════════════════════════════════
const FRUITS = Object.freeze([
  // { id, emoji, name, basePoints, mult, minLevel }
  { id: 'cherry',     emoji: '🍒', name: 'Cherry',     basePoints: 100,  mult: 1, minLevel: 1 },
  { id: 'strawberry', emoji: '🍓', name: 'Strawberry', basePoints: 300,  mult: 1, minLevel: 2 },
  { id: 'orange',     emoji: null, name: 'Orange',     basePoints: 500,  mult: 1, minLevel: 3 }, // drawn manually
  { id: 'apple',      emoji: '🍎', name: 'Apple',      basePoints: 700,  mult: 1, minLevel: 4 },
  { id: 'melon',      emoji: '🍈', name: 'Melon',      basePoints: 1000, mult: 1, minLevel: 5 },
  { id: 'grapes',     emoji: '🍇', name: 'Grapes',     basePoints: 2000, mult: 1, minLevel: 6 },
  { id: 'watermelon', emoji: '🍉', name: 'Watermelon', basePoints: 3000, mult: 1, minLevel: 7 },
  { id: 'bell',       emoji: '🔔', name: 'Bell',       basePoints: 3000, mult: 1, minLevel: 8 },
  { id: 'key',        emoji: '🗝️', name: 'Key',        basePoints: 5000, mult: 1, minLevel: 9 },
  { id: 'peach',      emoji: '🍑', name: 'Peach',      basePoints: 500,  mult: 3, minLevel: 1 }, // always eligible
]);

/**
 * Returns the fruit definition to spawn for a given level.
 * Peach always has a 20–45% chance regardless of level.
 */
function fruitForLevel(level) {
  const eligible  = FRUITS.filter(f => f.id !== 'peach' && f.minLevel <= level);
  const canonical = eligible.length ? eligible[eligible.length - 1] : FRUITS[0];
  const peachChance = Math.min(0.20 + (level - 1) * 0.04, 0.45);
  return Math.random() < peachChance
    ? FRUITS.find(f => f.id === 'peach')
    : canonical;
}

// ══════════════════════════════════════════════════════════
// § 4  BONUS FRUIT  —  spawns on the board, bobs and fades
// ══════════════════════════════════════════════════════════
class BonusFruit {
  #def; #x; #y; #timer; #collected = false; #bobFrame = 0;

  constructor(def, x, y, duration = 480) {
    this.#def   = def;
    this.#x     = x;
    this.#y     = y;
    this.#timer = duration;
  }

  get def()       { return this.#def; }
  get x()         { return this.#x; }
  get y()         { return this.#y; }
  get alive()     { return !this.#collected && this.#timer > 0; }
  get collected() { return this.#collected; }

  collect() { this.#collected = true; }

  update() {
    this.#timer--;
    this.#bobFrame++;
  }

  draw(ctx) {
    if (!this.alive) return;
    const { x, y } = this, T = CFG.TILE;
    const bob  = Math.sin(this.#bobFrame * 0.1) * 2;
    const fade = this.#timer < 90 ? this.#timer / 90 : 1;

    ctx.save();
    ctx.globalAlpha = fade;

    if (this.#def.id === 'orange') {
      drawOrange(ctx, x, y + bob, T * 0.48);
    } else {
      ctx.font         = `${Math.round(T * 0.9)}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      if (this.#def.id === 'peach') {
        ctx.shadowColor = '#FFAB76';
        ctx.shadowBlur  = 16;
      }
      ctx.fillText(this.#def.emoji, x, y + bob);
    }

    ctx.restore();
  }
}

/**
 * Draws a hand-crafted orange on the canvas.
 * Radial gradient + segment lines + leaf + shine = unmistakably an orange.
 */
function drawOrange(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);

  // Body — orange radial gradient
  const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r);
  g.addColorStop(0,   '#FFE066');
  g.addColorStop(0.4, '#FF9900');
  g.addColorStop(1,   '#CC5500');
  ctx.shadowColor = '#FF8800';
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Segment lines
  ctx.strokeStyle = 'rgba(200,80,0,0.35)';
  ctx.lineWidth   = 0.8;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }

  // Green leaf
  ctx.fillStyle   = '#2EAA1A';
  ctx.shadowColor = '#2EAA1A';
  ctx.shadowBlur  = 4;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.9, r * 0.15, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stem
  ctx.strokeStyle = '#1A6610';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.72);
  ctx.lineTo(0, -r * 1.05);
  ctx.stroke();

  // Shine highlight
  ctx.fillStyle = 'rgba(255,255,200,0.4)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.28, -r * 0.3, r * 0.18, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ══════════════════════════════════════════════════════════
// § 5  SCORE POPUP  —  floats up and fades when scoring
// ══════════════════════════════════════════════════════════
class ScorePopup {
  constructor(x, y, value, isTriple = false) {
    this.x        = x;
    this.y        = y;
    this.value    = value;
    this.isTriple = isTriple;
    this.life     = 75;
  }

  update() { this.y -= 0.55; this.life--; }
  get alive() { return this.life > 0; }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.min(this.life / 28, 1);
    const col = this.isTriple ? '#FFAB76' : '#00FFFF';
    ctx.fillStyle  = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 8;
    ctx.font        = `bold ${this.isTriple ? 9 : 8}px "Press Start 2P"`;
    ctx.textAlign   = 'center';
    if (this.isTriple) {
      ctx.fillText('🍑×3', this.x, this.y - 10);
    }
    ctx.fillText(this.value, this.x, this.y);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 6  EVENT BUS  —  Observer pattern (Map of Set<Function>)
// ══════════════════════════════════════════════════════════
class EventBus {
  #map = new Map();

  on(event, cb) {
    if (!this.#map.has(event)) this.#map.set(event, new Set());
    this.#map.get(event).add(cb);
    return () => this.off(event, cb);   // returns unsubscribe fn
  }

  off(event, cb) { this.#map.get(event)?.delete(cb); }
  emit(event, data) { this.#map.get(event)?.forEach(cb => cb(data)); }
}

const bus = new EventBus();

// ══════════════════════════════════════════════════════════
// § 7  SCORE MANAGER  —  BABS' hi-score is sacred, never overwritten
// ══════════════════════════════════════════════════════════
class ScoreManager {
  #score    = 0;
  #ghostMul = 1;

  static BABS_HI = TRIBUTE.hiScore;

  #sync() {
    const fmt = n => String(n).padStart(7, '0');
    document.getElementById('score').textContent = fmt(this.#score);
    // The #highscore element is set once in Game constructor
    // and is NEVER touched again — BABS' record stands forever
  }

  add(pts)        { this.#score += pts; this.#sync(); }
  reset()         { this.#score = 0; this.#ghostMul = 1; this.#sync(); }
  get score()     { return this.#score; }

  ghostEaten() {
    const pts = CFG.SCORE.GHOST_BASE * this.#ghostMul;
    this.#ghostMul = Math.min(this.#ghostMul * 2, 8);
    this.add(pts);
    return pts;
  }

  resetGhostMul() { this.#ghostMul = 1; }
}

// ══════════════════════════════════════════════════════════
// § 8  MAP DATA
// ══════════════════════════════════════════════════════════
const BASE_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
  [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,1,2,1],
  [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
  [1,1,1,1,2,1,1,1,0,0,0,0,0,1,1,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,0,0,1,1,1,0,0,0,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,1,1,4,4,4,1,1,0,1,2,1,1,1,1],
  [0,0,0,0,2,0,0,1,4,4,4,4,4,1,0,0,2,0,0,0,0],
  [1,1,1,1,2,1,0,1,1,1,1,1,1,1,0,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,1,1,1],
  [1,1,1,1,2,1,0,1,1,1,1,1,1,1,0,1,2,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
  [1,3,2,1,2,2,2,2,2,2,0,2,2,2,2,2,2,1,2,3,1],
  [1,1,2,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1,1],
  [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
  [1,2,1,1,1,1,1,1,2,1,1,1,2,1,1,1,1,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,1,1,2,1,1,1,1,1,1,1,2,1,1,1,1,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// ══════════════════════════════════════════════════════════
// § 9  MAZE  —  clones BASE_MAP each level, exposes generators
// ══════════════════════════════════════════════════════════
class Maze {
  #grid     = [];
  #dotsLeft = 0;

  clone() {
    this.#grid     = BASE_MAP.map(row => [...row]);
    this.#dotsLeft = this.#grid.flat().filter(v => v === CELL.DOT || v === CELL.POWER).length;
    return this;
  }

  eat(col, row) {
    const v = this.#grid[row]?.[col];
    if (v === CELL.DOT)   { this.#grid[row][col] = CELL.EMPTY; this.#dotsLeft--; return 'dot'; }
    if (v === CELL.POWER) { this.#grid[row][col] = CELL.EMPTY; this.#dotsLeft--; return 'power'; }
    return null;
  }

  isWall(col, row)  { return this.#grid[row]?.[col] === CELL.WALL; }
  get dotsLeft()    { return this.#dotsLeft; }
  get cleared()     { return this.#dotsLeft <= 0; }

  // ── ES6 generators — iterable walls and pickups ──────
  *walls() {
    for (let r = 0; r < CFG.ROWS; r++)
      for (let c = 0; c < CFG.COLS; c++)
        if (this.#grid[r][c] === CELL.WALL) yield { r, c };
  }

  *pickups() {
    for (let r = 0; r < CFG.ROWS; r++)
      for (let c = 0; c < CFG.COLS; c++) {
        const v = this.#grid[r][c];
        if (v === CELL.DOT || v === CELL.POWER) yield { r, c, type: v };
      }
  }

  draw(ctx, frame) {
    const T = CFG.TILE;

    // Walls
    for (const { r, c } of this.walls()) {
      const x = c * T, y = r * T;
      ctx.fillStyle = '#000035';
      ctx.fillRect(x, y, T, T);
      this.#edges(ctx, r, c, x, y);
    }

    // Dots and power pellets
    for (const { r, c, type } of this.pickups()) {
      const cx = c * T + T / 2, cy = r * T + T / 2;
      if (type === CELL.DOT) {
        ctx.fillStyle = '#FFB8AE';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Pulsing peach power pellet
        const sc = 0.72 + 0.28 * Math.sin(frame * 0.14);
        ctx.save();
        ctx.shadowColor = '#FFAB76';
        ctx.shadowBlur  = 14;
        ctx.fillStyle   = '#FFD4B0';
        ctx.beginPath();
        ctx.arc(cx, cy, 5.8 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,200,0.7)';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.2 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Draws the glowing blue wall borders
  #edges(ctx, r, c, x, y) {
    const T  = CFG.TILE;
    const iw = (dr, dc) => this.#grid[r + dr]?.[c + dc] === CELL.WALL;

    ctx.save();
    ctx.strokeStyle = '#2323ee';
    ctx.shadowColor = '#4444ff';
    ctx.shadowBlur  = 5;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';

    [
      [!iw(-1, 0), x,       y + 1,   x + T, y + 1  ],
      [!iw(1,  0), x,       y + T-1, x + T, y + T-1],
      [!iw(0, -1), x + 1,   y,       x + 1, y + T  ],
      [!iw(0,  1), x + T-1, y,       x + T-1, y + T],
    ].forEach(([show, x1, y1, x2, y2]) => {
      if (!show) return;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 10  ENTITY BASE CLASS  —  shared movement + collision
// ══════════════════════════════════════════════════════════
class Entity {
  constructor(x, y, speed) {
    this.x     = x;
    this.y     = y;
    this.dx    = 0;
    this.dy    = 0;
    this.speed = speed;
  }

  get col()   { return Math.round((this.x - CFG.TILE / 2) / CFG.TILE); }
  get row()   { return Math.round((this.y - CFG.TILE / 2) / CFG.TILE); }
  get tileX() { return this.col * CFG.TILE + CFG.TILE / 2; }
  get tileY() { return this.row * CFG.TILE + CFG.TILE / 2; }

  _hitsWall(maze, nx, ny, margin = 0.42) {
    const mg = CFG.TILE * margin, T = CFG.TILE;
    for (let r = Math.floor((ny - mg) / T); r <= Math.floor((ny + mg) / T); r++)
      for (let c = Math.floor((nx - mg) / T); c <= Math.floor((nx + mg) / T); c++)
        if (maze.isWall(c, r)) return true;
    return false;
  }

  _wrapX() {
    const w = CFG.COLS * CFG.TILE;
    if (this.x < 0) this.x = w;
    if (this.x > w) this.x = 0;
  }
}

// ══════════════════════════════════════════════════════════
// § 11  PAC-MAN  —  peach-gradient body, queued direction
// ══════════════════════════════════════════════════════════
class Pacman extends Entity {
  #mouth     = 0.25;
  #mouthDir  = 1;
  #nextDx    = 0;
  #nextDy    = 0;
  deathFrame = 0;

  constructor(x, y) { super(x, y, CFG.PAC_SPEED); }

  setDir(dx, dy) { this.#nextDx = dx; this.#nextDy = dy; }

  update(maze) {
    // Try queued direction first
    if (this.#nextDx !== this.dx || this.#nextDy !== this.dy)
      if (!this._hitsWall(maze, this.x + this.#nextDx * this.speed, this.y + this.#nextDy * this.speed))
        { this.dx = this.#nextDx; this.dy = this.#nextDy; }

    // Move in current direction if clear
    if (!this._hitsWall(maze, this.x + this.dx * this.speed, this.y + this.dy * this.speed))
      { this.x += this.dx * this.speed; this.y += this.dy * this.speed; }

    this._wrapX();

    // Animate mouth
    this.#mouth += 0.05 * this.#mouthDir;
    if (this.#mouth >= 0.26 || this.#mouth <= 0.01) this.#mouthDir *= -1;
  }

  draw(ctx, dying = false) {
    const { x, y } = this, r = CFG.TILE * 0.47;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur  = 14;

    // Gradient — same peach gold in both states
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r);
    g.addColorStop(0,   '#FFE88A');
    g.addColorStop(0.6, '#FFD700');
    g.addColorStop(1,   '#FF9900');
    ctx.fillStyle = g;

    if (dying) {
      // Death: pie-slice shrinks
      const p = Math.min(this.deathFrame / 80, 1);
      const a = p * Math.PI * 0.97;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a, Math.PI * 2 - a);
      ctx.closePath();
      ctx.fill();
    } else {
      // Normal: rotating mouth
      ctx.rotate(Math.atan2(this.dy, this.dx || 1));
      const m = this.#mouth * Math.PI;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, m, Math.PI * 2 - m);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 12  GHOST  —  4 classic AI strategies (Strategy pattern)
// ══════════════════════════════════════════════════════════

// Strategy functions — swappable, no switch/case
const GhostAI = {
  blinky: (g, pac)       => ({ x: pac.x, y: pac.y }),
  pinky:  (g, pac)       => ({ x: pac.x + pac.dx * CFG.TILE * 4, y: pac.y + pac.dy * CFG.TILE * 4 }),
  inky:   (g, pac, all)  => {
    const b = all[0];
    const px = pac.x + pac.dx * CFG.TILE * 2;
    const py = pac.y + pac.dy * CFG.TILE * 2;
    return { x: px * 2 - b.x, y: py * 2 - b.y };
  },
  clyde:  (g, pac)       =>
    Math.hypot(g.x - pac.x, g.y - pac.y) > CFG.TILE * 8
      ? { x: pac.x, y: pac.y }
      : { x: 0, y: CFG.ROWS * CFG.TILE },
};

const AI_FNS = [GhostAI.blinky, GhostAI.pinky, GhostAI.inky, GhostAI.clyde];

const GHOST_DEFS = Object.freeze([
  { name: 'BLINKY', color: '#FF0000', startCol: 10, startRow: 9  },
  { name: 'PINKY',  color: '#FFB8FF', startCol: 9,  startRow: 10 },
  { name: 'INKY',   color: '#00FFFF', startCol: 10, startRow: 10 },
  { name: 'CLYDE',  color: '#FFB852', startCol: 11, startRow: 10 },
]);

class Ghost extends Entity {
  #frightened = false;
  #eaten      = false;
  #inHouse    = true;
  #leaveTimer = 0;
  #ai; #idx;
  color; name;

  constructor({ name, color, startCol, startRow }, idx, speed) {
    const T = CFG.TILE;
    super(startCol * T + T / 2, startRow * T + T / 2, speed);
    this.name        = name;
    this.color       = color;
    this.#idx        = idx;
    this.#ai         = AI_FNS[idx];
    this.#leaveTimer = idx * 90;
    this.dy          = -1;
  }

  get frightened() { return this.#frightened; }
  get eaten()      { return this.#eaten; }
  get inHouse()    { return this.#inHouse; }

  setFrightened(on) { if (!this.#eaten) this.#frightened = on; }
  setEaten()        { this.#eaten = true; this.#frightened = false; }

  resetToHouse() {
    this.#eaten      = false;
    this.#inHouse    = true;
    this.#leaveTimer = 60;
    this.x = CFG.TILE * 10 + CFG.TILE / 2;
    this.y = CFG.TILE * 9  + CFG.TILE / 2;
  }

  update(maze, pac, all, frame) {
    const T   = CFG.TILE;
    const spd = this.#eaten
      ? this.speed * 2
      : this.#frightened ? this.speed * 0.5 : this.speed;

    // In ghost house — bob and wait to leave
    if (this.#inHouse) {
      this.#leaveTimer--;
      this.y += Math.sin(frame * 0.12 + this.#idx * 1.3) * 0.35;
      if (this.#leaveTimer <= 0) {
        this.#inHouse = false;
        this.x  = T * 10 + T / 2;
        this.y  = T * 9  + T / 2;
        this.dx = 0; this.dy = -1;
      }
      return;
    }

    // Return-to-house after being eaten
    if (this.#eaten) {
      const hx = T * 10 + T / 2, hy = T * 9 + T / 2;
      if (Math.hypot(this.x - hx, this.y - hy) < spd + 1) {
        this.resetToHouse();
        return;
      }
    }

    // Tile-aligned direction choice
    const aligned =
      Math.abs(this.x - this.tileX) < spd + 0.5 &&
      Math.abs(this.y - this.tileY) < spd + 0.5;

    if (aligned) {
      this.x = this.tileX;
      this.y = this.tileY;
      this.#chooseDir(maze, pac, all);
    }

    if (!this._hitsWall(maze, this.x + this.dx * spd, this.y + this.dy * spd)) {
      this.x += this.dx * spd;
      this.y += this.dy * spd;
    }

    this._wrapX();
  }

  #chooseDir(maze, pac, all) {
    const T    = CFG.TILE;
    const DIRS = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

    // Can't reverse — filter opposite of current direction
    const valid = DIRS.filter(({ dx, dy }) =>
      !(dx === -this.dx && dy === -this.dy) &&
      !this._hitsWall(maze, this.x + dx * T, this.y + dy * T)
    );

    if (!valid.length) {
      const rev = DIRS.find(d => d.dx === -this.dx && d.dy === -this.dy);
      if (rev) { this.dx = rev.dx; this.dy = rev.dy; }
      return;
    }

    if (this.#frightened) {
      const p = valid[Math.floor(Math.random() * valid.length)];
      this.dx = p.dx; this.dy = p.dy;
      return;
    }

    const target = this.#eaten
      ? { x: CFG.TILE * 10 + T / 2, y: CFG.TILE * 9 + T / 2 }
      : this.#ai(this, pac, all);

    const best = valid.reduce((acc, d) => {
      const dist = Math.hypot(this.x + d.dx * T - target.x, this.y + d.dy * T - target.y);
      return dist < acc.dist ? { ...d, dist } : acc;
    }, { dist: Infinity });

    if (best.dist < Infinity) { this.dx = best.dx; this.dy = best.dy; }
  }

  draw(ctx, frame, frightTimer) {
    const { x, y } = this, r = CFG.TILE * 0.47;
    ctx.save();
    ctx.translate(x, y);
    if (this.#inHouse) ctx.globalAlpha = 0.5;

    if (this.#eaten) {
      this.#drawEyes(ctx, r, false);
      ctx.restore();
      return;
    }

    let col = this.color;
    if (this.#frightened)
      col = (frightTimer < 60 && Math.floor(frame / 7) % 2 === 0) ? '#FFFFFF' : '#0000BB';

    ctx.shadowColor = this.#frightened ? '#000088' : this.color;
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = col;

    // Ghost body shape
    ctx.beginPath();
    ctx.arc(0, -r * 0.05, r, Math.PI, 0);
    const pts = [-r, -r / 3, r / 3, r];
    for (let i = 0; i < 3; i++) {
      const mx = (pts[i] + pts[i + 1]) / 2;
      const py = i % 2 === 0 ? r * 0.85 : r * 0.5;
      ctx.quadraticCurveTo(mx, py, pts[i + 1], r * (i % 2 === 0 ? 0.5 : 0.85));
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!this.#frightened) this.#drawEyes(ctx, r, true);
    else                   this.#drawScared(ctx, r);

    ctx.restore();
  }

  #drawEyes(ctx, r, pupils) {
    [[-0.3, -0.22], [0.3, -0.22]].forEach(([ex, ey]) => {
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.ellipse(r * ex, r * ey, r * 0.21, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    if (!pupils) return;
    [[-0.3, -0.22], [0.3, -0.22]].forEach(([ex, ey]) => {
      ctx.fillStyle = '#1144FF';
      ctx.beginPath();
      ctx.arc(r * ex + this.dx * r * 0.09, r * ey + this.dy * r * 0.09, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  #drawScared(ctx, r) {
    ctx.strokeStyle = 'white';
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.05);
    [-0.26, -0.13, 0, 0.13, 0.26, 0.4].forEach((nx, i) =>
      ctx.lineTo(r * nx, r * (i % 2 === 0 ? -0.22 : -0.05))
    );
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.32, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( r * 0.28, -r * 0.32, r * 0.1, 0, Math.PI * 2); ctx.fill();
  }
}

// ══════════════════════════════════════════════════════════
// § 13  HUD  —  DOM update helpers
// ══════════════════════════════════════════════════════════
const HUD = {
  setLevel(n)      { document.getElementById('level').textContent = String(n).padStart(2, '0'); },
  setLives(n)      { document.querySelectorAll('.life-icon').forEach((el, i) => el.classList.toggle('dead', i >= n)); },
  show(id)         { document.getElementById(id)?.classList.remove('overlay--hidden'); },
  hide(id)         { document.getElementById(id)?.classList.add('overlay--hidden'); },
  setFinalScore(n) { document.getElementById('final-score').textContent = String(n).padStart(7, '0'); },
  setGameOverMsg(m){ document.getElementById('gameover-msg').textContent = m; },
  setReady(on)     { document.getElementById('ready-text')?.classList.toggle('overlay--hidden', !on); },

  setActiveFruit(def) {
    if (!def) {
      document.getElementById('active-fruit-icon').textContent = '·';
      document.getElementById('active-fruit-name').textContent = '—';
      document.getElementById('active-fruit-pts').textContent  = '';
      return;
    }
    const icon = def.id === 'orange' ? '🟠' : def.emoji;
    const pts  = def.basePoints * def.mult;
    document.getElementById('active-fruit-icon').textContent = icon;
    document.getElementById('active-fruit-name').textContent = def.name + (def.mult > 1 ? ` ×${def.mult}!` : '');
    document.getElementById('active-fruit-pts').textContent  = `${pts} PTS`;
    document.getElementById('active-fruit-icon').style.color = def.id === 'peach' ? '#FFAB76' : '';
  },
};

// ══════════════════════════════════════════════════════════
// § 14  GAME  —  state machine orchestrator
// ══════════════════════════════════════════════════════════
class Game {
  #canvas; #ctx;
  #maze   = new Maze();
  #score  = new ScoreManager();
  #pac    = null;
  #ghosts = [];
  #popups = [];
  #bonus  = null;          // active BonusFruit on the board

  // State machine
  #state       = STATE.IDLE;
  #frame       = 0;
  #frightTimer = 0;
  #readyTimer  = 0;
  #deathTimer  = 0;
  #level       = 1;
  #lives       = 3;

  // Classic Pac-Man fruit spawn (70 dots / 170 dots)
  #dotEatenCount  = 0;
  #fruit1Spawned  = false;
  #fruit2Spawned  = false;

  constructor(canvasId) {
    this.#canvas        = document.getElementById(canvasId);
    this.#ctx           = this.#canvas.getContext('2d');
    this.#canvas.width  = CFG.COLS * CFG.TILE;
    this.#canvas.height = CFG.ROWS * CFG.TILE;

    this.#bindInput();

    // Set BABS' permanent high score — never touched again
    document.getElementById('highscore').textContent =
      String(TRIBUTE.hiScore).padStart(7, '0');

    HUD.show('overlay-start');
    requestAnimationFrame(this.#loop);
  }

  #setState(s) { this.#state = s; bus.emit('state:change', s); }

  // Called when player presses Enter / Space / tap
  startGame() {
    HUD.hide('overlay-start');
    HUD.hide('overlay-gameover');
    this.#score.reset();
    this.#level = 1;
    this.#lives = 3;
    HUD.setLevel(1);
    HUD.setLives(3);
    this.#initLevel();
  }

// ...rest of your existing Game methods remain unchanged...
}
