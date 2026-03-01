/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   PAC-MAN · Portfolio Edition                           ║
 * ║   Demonstrates: ES6+ Classes, State Machine, EventBus,  ║
 * ║   Canvas API, Destructuring, Iterators, Generators,     ║
 * ║   Symbols, WeakMap, Template Literals, Modules          ║
 * ╚══════════════════════════════════════════════════════════╝
 */

'use strict';

// ══════════════════════════════════════════════
// § 1. CONSTANTS & CONFIGURATION
// ══════════════════════════════════════════════

const CONFIG = Object.freeze({
  TILE:            20,
  COLS:            21,
  ROWS:            23,
  PACMAN_SPEED:    1.8,
  GHOST_SPEED:     1.4,
  FRIGHT_FRAMES:   300,
  FRIGHT_MIN:       60,
  READY_FRAMES:    150,
  DEATH_FRAMES:     90,
  SCORE: Object.freeze({
    DOT:        10,
    POWER:      50,
    GHOST_BASE: 200,
  }),
});

/** Tile values */
const TILE = {
  WALL:    1,
  DOT:     2,
  POWER:   3,
  EMPTY:   0,
  HOUSE:   4,
};

/** Game states — using a Symbol enum for uniqueness */
const STATE = Object.freeze({
  IDLE:       Symbol('idle'),
  READY:      Symbol('ready'),
  PLAYING:    Symbol('playing'),
  DYING:      Symbol('dying'),
  LEVELCLEAR: Symbol('levelclear'),
  GAMEOVER:   Symbol('gameover'),
});

const GHOST_DEFS = Object.freeze([
  { name: 'Blinky', color: '#FF0000', startCol: 10, startRow: 9  },
  { name: 'Pinky',  color: '#FFB8FF', startCol: 9,  startRow: 10 },
  { name: 'Inky',   color: '#00FFFF', startCol: 10, startRow: 10 },
  { name: 'Clyde',  color: '#FFB852', startCol: 11, startRow: 10 },
]);

// ══════════════════════════════════════════════
// § 2. BASE MAP (template — cloned each level)
// ══════════════════════════════════════════════

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

// ══════════════════════════════════════════════
// § 3. EVENT BUS  (Observer Pattern)
// ══════════════════════════════════════════════

class EventBus {
  #listeners = new Map();

  on(event, cb) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(cb);
    return () => this.off(event, cb); // returns unsubscribe fn
  }

  off(event, cb) {
    this.#listeners.get(event)?.delete(cb);
  }

  emit(event, payload) {
    this.#listeners.get(event)?.forEach(cb => cb(payload));
  }
}

// Singleton bus
const bus = new EventBus();

// ══════════════════════════════════════════════
// § 4. SCORE MANAGER  (LocalStorage + Observer)
// ══════════════════════════════════════════════

class ScoreManager {
  #score    = 0;
  #hiScore  = 0;
  #ghostMul = 1; // ghost eat multiplier (doubles per ghost)

  constructor() {
    this.#hiScore = parseInt(localStorage.getItem('pac_hi') ?? '0', 10);
    this.#syncUI();
  }

  add(points) {
    this.#score += points;
    if (this.#score > this.#hiScore) {
      this.#hiScore = this.#score;
      localStorage.setItem('pac_hi', this.#hiScore);
    }
    this.#syncUI();
    bus.emit('score:change', { score: this.#score, hiScore: this.#hiScore });
  }

  ghostEaten() {
    const pts = CONFIG.SCORE.GHOST_BASE * this.#ghostMul;
    this.#ghostMul = Math.min(this.#ghostMul * 2, 8);
    this.add(pts);
    return pts;
  }

  resetGhostMul()  { this.#ghostMul = 1; }
  reset()          { this.#score = 0; this.#ghostMul = 1; this.#syncUI(); }
  get score()      { return this.#score; }
  get hiScore()    { return this.#hiScore; }

  #syncUI() {
    const fmt = n => String(n).padStart(5, '0');
    document.getElementById('score').textContent    = fmt(this.#score);
    document.getElementById('highscore').textContent = fmt(this.#hiScore);
  }
}

// ══════════════════════════════════════════════
// § 5. MAZE  (Encapsulates map logic + drawing)
// ══════════════════════════════════════════════

class Maze {
  #grid = [];
  #totalDots = 0;
  #dotsLeft  = 0;

  clone() {
    // Deep copy using map + spread — ES6 destructuring
    this.#grid = BASE_MAP.map(row => [...row]);
    this.#totalDots = this.#grid.flat().filter(v => v === TILE.DOT || v === TILE.POWER).length;
    this.#dotsLeft  = this.#totalDots;
    return this;
  }

  /** @returns {'dot'|'power'|null} */
  eat(col, row) {
    const cell = this.#grid[row]?.[col];
    if (cell === TILE.DOT) {
      this.#grid[row][col] = TILE.EMPTY;
      this.#dotsLeft--;
      return 'dot';
    }
    if (cell === TILE.POWER) {
      this.#grid[row][col] = TILE.EMPTY;
      this.#dotsLeft--;
      return 'power';
    }
    return null;
  }

  isWall(col, row) {
    return this.#grid[row]?.[col] === TILE.WALL;
  }

  get dotsLeft()  { return this.#dotsLeft; }
  get cleared()   { return this.#dotsLeft <= 0; }
  get grid()      { return this.#grid; }

  /**
   * Iterable walls — ES6 custom iterator / generator
   */
  *walls() {
    for (let r = 0; r < CONFIG.ROWS; r++) {
      for (let c = 0; c < CONFIG.COLS; c++) {
        if (this.#grid[r][c] === TILE.WALL) yield { r, c };
      }
    }
  }

  /**
   * Iterable pickups (dots + power pellets)
   */
  *pickups() {
    for (let r = 0; r < CONFIG.ROWS; r++) {
      for (let c = 0; c < CONFIG.COLS; c++) {
        const v = this.#grid[r][c];
        if (v === TILE.DOT || v === TILE.POWER) yield { r, c, type: v };
      }
    }
  }

  draw(ctx, frame) {
    const T = CONFIG.TILE;

    // Draw walls using custom iterator
    for (const { r, c } of this.walls()) {
      const x = c * T;
      const y = r * T;
      ctx.fillStyle = '#050535';
      ctx.fillRect(x, y, T, T);
      this.#drawWallEdges(ctx, r, c, x, y);
    }

    // Draw pickups using custom iterator
    for (const { r, c, type } of this.pickups()) {
      const cx = c * T + T / 2;
      const cy = r * T + T / 2;
      if (type === TILE.DOT) {
        ctx.fillStyle = '#FFB8AE';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const scale = 0.72 + 0.28 * Math.sin(frame * 0.14);
        ctx.save();
        ctx.shadowColor = '#FFB8AE';
        ctx.shadowBlur  = 10;
        ctx.fillStyle   = '#FFD0C0';
        ctx.beginPath();
        ctx.arc(cx, cy, 5.5 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  #drawWallEdges(ctx, r, c, x, y) {
    const T = CONFIG.TILE;
    const isW = (dr, dc) => this.#grid[r + dr]?.[c + dc] === TILE.WALL;

    ctx.save();
    ctx.strokeStyle = '#2323ee';
    ctx.shadowColor = '#4444ff';
    ctx.shadowBlur  = 5;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';

    const edges = [
      [!isW(-1, 0), x,     y + 1,   x + T, y + 1  ],
      [!isW( 1, 0), x,     y + T-1, x + T, y + T-1 ],
      [!isW( 0,-1), x + 1, y,       x + 1, y + T   ],
      [!isW( 0, 1), x+T-1, y,       x+T-1, y + T   ],
    ];

    edges.forEach(([show, x1, y1, x2, y2]) => {
      if (!show) return;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    ctx.restore();
  }
}

// ══════════════════════════════════════════════
// § 6. ENTITY BASE CLASS  (Inheritance root)
// ══════════════════════════════════════════════

class Entity {
  constructor(x, y, speed) {
    this.x     = x;
    this.y     = y;
    this.dx    = 0;
    this.dy    = 0;
    this.speed = speed;
  }

  get col() { return Math.round((this.x - CONFIG.TILE / 2) / CONFIG.TILE); }
  get row() { return Math.round((this.y - CONFIG.TILE / 2) / CONFIG.TILE); }
  get tileX() { return this.col * CONFIG.TILE + CONFIG.TILE / 2; }
  get tileY() { return this.row * CONFIG.TILE + CONFIG.TILE / 2; }

  /** Check if entity's bounding circle overlaps a wall */
  _hitsWall(maze, nx, ny, margin = 0.42) {
    const m  = CONFIG.TILE * margin;
    const T  = CONFIG.TILE;
    const r1 = Math.floor((ny - m) / T);
    const r2 = Math.floor((ny + m) / T);
    const c1 = Math.floor((nx - m) / T);
    const c2 = Math.floor((nx + m) / T);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (maze.isWall(c, r)) return true;
      }
    }
    return false;
  }

  /** Wrap x across tunnel */
  _wrapX() {
    const w = CONFIG.COLS * CONFIG.TILE;
    if (this.x < 0)  this.x = w;
    if (this.x > w) this.x = 0;
  }
}

// ══════════════════════════════════════════════
// § 7. PACMAN  (extends Entity)
// ══════════════════════════════════════════════

class Pacman extends Entity {
  #mouth     = 0.25;
  #mouthDir  = 1;
  #nextDx    = 0;
  #nextDy    = 0;
  deathFrame = 0;

  constructor(x, y) {
    super(x, y, CONFIG.PACMAN_SPEED);
  }

  setDir(dx, dy) {
    this.#nextDx = dx;
    this.#nextDy = dy;
  }

  update(maze) {
    // Try buffered direction first
    if (this.#nextDx !== this.dx || this.#nextDy !== this.dy) {
      const nx = this.x + this.#nextDx * this.speed;
      const ny = this.y + this.#nextDy * this.speed;
      if (!this._hitsWall(maze, nx, ny)) {
        this.dx = this.#nextDx;
        this.dy = this.#nextDy;
      }
    }

    if (!this._hitsWall(maze, this.x + this.dx * this.speed, this.y + this.dy * this.speed)) {
      this.x += this.dx * this.speed;
      this.y += this.dy * this.speed;
    }
    this._wrapX();

    // Animate mouth
    this.#mouth += 0.05 * this.#mouthDir;
    if (this.#mouth >= 0.26 || this.#mouth <= 0.01) this.#mouthDir *= -1;
  }

  draw(ctx, dying = false) {
    const { x, y } = this;
    const r = CONFIG.TILE * 0.48;

    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = '#FFD700';

    if (dying) {
      const p = Math.min(this.deathFrame / 80, 1);
      const a = p * Math.PI * 0.98;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a, Math.PI * 2 - a);
      ctx.closePath();
      ctx.fill();
    } else {
      const faceAngle = Math.atan2(this.dy, this.dx || 1);
      ctx.rotate(faceAngle);
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

// ══════════════════════════════════════════════
// § 8. GHOST  (extends Entity, strategy-based AI)
// ══════════════════════════════════════════════

/**
 * Ghost target strategies — Strategy Pattern via composition
 */
const GhostStrategy = {
  blinky: (ghost, pacman)  => ({ x: pacman.x, y: pacman.y }),

  pinky:  (ghost, pacman)  => ({
    x: pacman.x + pacman.dx * CONFIG.TILE * 4,
    y: pacman.y + pacman.dy * CONFIG.TILE * 4,
  }),

  inky: (ghost, pacman, ghosts) => {
    const blinky = ghosts[0];
    const pivot  = {
      x: pacman.x + pacman.dx * CONFIG.TILE * 2,
      y: pacman.y + pacman.dy * CONFIG.TILE * 2,
    };
    return {
      x: pivot.x * 2 - blinky.x,
      y: pivot.y * 2 - blinky.y,
    };
  },

  clyde: (ghost, pacman) => {
    const dist = Math.hypot(ghost.x - pacman.x, ghost.y - pacman.y);
    return dist > CONFIG.TILE * 8
      ? { x: pacman.x, y: pacman.y }
      : { x: 0, y: CONFIG.ROWS * CONFIG.TILE };
  },
};

const STRATEGIES = [
  GhostStrategy.blinky,
  GhostStrategy.pinky,
  GhostStrategy.inky,
  GhostStrategy.clyde,
];

class Ghost extends Entity {
  #frightened = false;
  #eaten      = false;
  #inHouse    = true;
  #leaveTimer = 0;
  #strategy;
  #index;

  color;
  name;

  constructor({ name, color, startCol, startRow }, index, speed) {
    // Object destructuring in constructor params (ES6+)
    const T = CONFIG.TILE;
    super(startCol * T + T / 2, startRow * T + T / 2, speed);
    this.name      = name;
    this.color     = color;
    this.#index    = index;
    this.#strategy = STRATEGIES[index];
    this.#leaveTimer = index * 90;
    this.dy = -1;
  }

  get frightened() { return this.#frightened; }
  get eaten()      { return this.#eaten; }
  get inHouse()    { return this.#inHouse; }

  setFrightened(on) {
    if (!this.#eaten) this.#frightened = on;
  }

  setEaten() {
    this.#eaten      = true;
    this.#frightened = false;
  }

  resetToHouse() {
    this.#eaten   = false;
    this.#inHouse = true;
    this.#leaveTimer = 60;
    this.x = CONFIG.TILE * 10 + CONFIG.TILE / 2;
    this.y = CONFIG.TILE * 9  + CONFIG.TILE / 2;
  }

  update(maze, pacman, allGhosts, frame) {
    const T   = CONFIG.TILE;
    const spd = this.#eaten ? this.speed * 2 : (this.#frightened ? this.speed * 0.5 : this.speed);

    if (this.#inHouse) {
      this.#leaveTimer--;
      // Subtle bobbing in house
      this.y += Math.sin(frame * 0.12 + this.#index * 1.2) * 0.4;
      if (this.#leaveTimer <= 0) this.#leaveHouse(maze);
      return;
    }

    // Check if eaten ghost returned home
    if (this.#eaten) {
      const homeX = T * 10 + T / 2;
      const homeY = T * 9  + T / 2;
      if (Math.hypot(this.x - homeX, this.y - homeY) < spd + 1) {
        this.resetToHouse();
        return;
      }
    }

    const aligned = Math.abs(this.x - this.tileX) < spd + 0.5 &&
                    Math.abs(this.y - this.tileY) < spd + 0.5;

    if (aligned) {
      this.x = this.tileX;
      this.y = this.tileY;
      this.#chooseDir(maze, pacman, allGhosts);
    }

    if (!this._hitsWall(maze, this.x + this.dx * spd, this.y + this.dy * spd)) {
      this.x += this.dx * spd;
      this.y += this.dy * spd;
    }
    this._wrapX();
  }

  #leaveHouse(maze) {
    this.#inHouse = false;
    this.x = CONFIG.TILE * 10 + CONFIG.TILE / 2;
    this.y = CONFIG.TILE * 9  + CONFIG.TILE / 2;
    this.dx = 0;
    this.dy = -1;
  }

  #chooseDir(maze, pacman, allGhosts) {
    const T = CONFIG.TILE;

    const DIRS = [
      { dx:  1, dy:  0 },
      { dx: -1, dy:  0 },
      { dx:  0, dy:  1 },
      { dx:  0, dy: -1 },
    ];

    // Filter: no reverse + no wall
    const valid = DIRS.filter(({ dx, dy }) => {
      if (dx === -this.dx && dy === -this.dy) return false;
      return !this._hitsWall(maze, this.x + dx * T, this.y + dy * T);
    });

    if (valid.length === 0) {
      // Force reverse if stuck
      const rev = DIRS.find(d => d.dx === -this.dx && d.dy === -this.dy);
      if (rev) ({ dx: this.dx, dy: this.dy } = rev);
      return;
    }

    let target;

    if (this.#frightened) {
      // Randomize when frightened
      const pick = valid[Math.floor(Math.random() * valid.length)];
      ({ dx: this.dx, dy: this.dy } = pick);
      return;
    } else if (this.#eaten) {
      // Head home
      target = { x: CONFIG.TILE * 10 + T / 2, y: CONFIG.TILE * 9 + T / 2 };
    } else {
      // Personality strategy
      target = this.#strategy(this, pacman, allGhosts);
    }

    // Pick best direction — arrow functions + destructuring
    const best = valid.reduce((acc, d) => {
      const nx   = this.x + d.dx * T;
      const ny   = this.y + d.dy * T;
      const dist = Math.hypot(nx - target.x, ny - target.y);
      return dist < acc.dist ? { ...d, dist } : acc;
    }, { dist: Infinity });

    if (best.dist < Infinity) {
      this.dx = best.dx;
      this.dy = best.dy;
    }
  }

  draw(ctx, frame, frightTimer) {
    const { x, y } = this;
    const r = CONFIG.TILE * 0.48;

    ctx.save();
    ctx.translate(x, y);
    if (this.#inHouse) ctx.globalAlpha = 0.55;

    if (this.#eaten) {
      this.#drawEyes(ctx, r);
      ctx.restore();
      return;
    }

    let bodyColor = this.color;
    if (this.#frightened) {
      bodyColor = (frightTimer < 60 && Math.floor(frame / 7) % 2 === 0)
        ? '#FFFFFF' : '#1111AA';
    }

    ctx.shadowColor = this.#frightened ? '#0000ff' : this.color;
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = bodyColor;

    // Body (dome + wavy skirt)
    ctx.beginPath();
    ctx.arc(0, -r * 0.05, r, Math.PI, 0);

    // 3-bump skirt using quadratic curves
    const bumpPts = [-r, -r/3, r/3, r];
    for (let i = 0; i < 3; i++) {
      const midX  = (bumpPts[i] + bumpPts[i + 1]) / 2;
      const peakY = i % 2 === 0 ? r * 0.85 : r * 0.5;
      ctx.quadraticCurveTo(midX, peakY, bumpPts[i + 1], r * (i % 2 === 0 ? 0.5 : 0.85));
    }
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    if (!this.#frightened) {
      this.#drawEyes(ctx, r, true);
    } else {
      this.#drawScaredFace(ctx, r);
    }

    ctx.restore();
  }

  #drawEyes(ctx, r, withPupils = false) {
    // White sclera
    [[-0.32, -0.2], [0.32, -0.2]].forEach(([ex, ey]) => {
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.ellipse(r * ex, r * ey, r * 0.22, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    if (!withPupils) return;

    // Pupils tracking direction
    [[-0.32, -0.2], [0.32, -0.2]].forEach(([ex, ey]) => {
      ctx.fillStyle = '#1155FF';
      ctx.beginPath();
      ctx.arc(r * ex + this.dx * r * 0.1, r * ey + this.dy * r * 0.1, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  #drawScaredFace(ctx, r) {
    ctx.strokeStyle = 'white';
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, -r * 0.05);
    // Zigzag mouth
    [-0.28, -0.14, 0, 0.14, 0.28, 0.42].forEach((nx, i) => {
      ctx.lineTo(r * nx, r * (i % 2 === 0 ? -0.25 : -0.05));
    });
    ctx.stroke();

    // Dot eyes
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.35, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( r * 0.28, -r * 0.35, r * 0.1, 0, Math.PI * 2); ctx.fill();
  }
}

// ══════════════════════════════════════════════
// § 9. SCORE POPUP  (floating text on ghost eat)
// ══════════════════════════════════════════════

class ScorePopup {
  constructor(x, y, value) {
    this.x     = x;
    this.y     = y;
    this.value = value;
    this.life  = 60;
  }

  update() { this.y -= 0.6; this.life--; }
  get alive() { return this.life > 0; }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.min(this.life / 30, 1);
    ctx.fillStyle   = '#00FFFF';
    ctx.font        = `bold 9px "Press Start 2P"`;
    ctx.textAlign   = 'center';
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur  = 8;
    ctx.fillText(this.value, this.x, this.y);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════
// § 10. HUD UPDATER
// ══════════════════════════════════════════════

const HUD = {
  setLevel(n)  { document.getElementById('level').textContent = String(n).padStart(2, '0'); },
  setLives(n)  {
    document.querySelectorAll('.life-icon').forEach((el, i) => {
      el.classList.toggle('dead', i >= n);
    });
    document.getElementById('lives-count')?.textContent && (document.getElementById('lives-count').textContent = n);
  },
  showOverlay(id)  { document.getElementById(id).classList.remove('overlay--hidden'); },
  hideOverlay(id)  { document.getElementById(id).classList.add('overlay--hidden'); },
  setFinalScore(n) { document.getElementById('final-score').textContent = String(n).padStart(5, '0'); },
  showReady(on)    {
    const el = document.getElementById('ready-text');
    el.classList.toggle('overlay--hidden', !on);
  },
};

// ══════════════════════════════════════════════
// § 11. GAME  (State Machine Orchestrator)
// ══════════════════════════════════════════════

class Game {
  // Private fields (ES2020+)
  #canvas;
  #ctx;
  #maze       = new Maze();
  #score      = new ScoreManager();
  #pacman     = null;
  #ghosts     = [];
  #popups     = [];
  #state      = STATE.IDLE;
  #frame      = 0;
  #frightTimer = 0;
  #readyTimer  = 0;
  #deathTimer  = 0;
  #level       = 1;
  #lives       = 3;
  #raf         = null;

  constructor(canvasId) {
    this.#canvas = document.getElementById(canvasId);
    this.#ctx    = this.#canvas.getContext('2d');
    this.#canvas.width  = CONFIG.COLS * CONFIG.TILE;
    this.#canvas.height = CONFIG.ROWS * CONFIG.TILE;

    this.#bindInput();
    HUD.showOverlay('overlay-start');
    this.#loop();
  }

  // ── STATE TRANSITIONS ──────────────────────

  #setState(s) {
    this.#state = s;
    bus.emit('state:change', s);
  }

  startGame() {
    HUD.hideOverlay('overlay-start');
    HUD.hideOverlay('overlay-gameover');
    this.#score.reset();
    this.#level = 1;
    this.#lives = 3;
    HUD.setLevel(this.#level);
    HUD.setLives(this.#lives);
    this.#initLevel();
  }

  #initLevel() {
    this.#maze.clone();
    const T = CONFIG.TILE;

    this.#pacman = new Pacman(10 * T + T / 2, 16 * T + T / 2);

    const spd = Math.min(CONFIG.GHOST_SPEED + (this.#level - 1) * 0.08, 2.2);
    this.#ghosts = GHOST_DEFS.map((def, i) => new Ghost(def, i, spd));

    this.#frightTimer = 0;
    this.#popups      = [];
    this.#score.resetGhostMul();

    this.#setState(STATE.READY);
    this.#readyTimer = CONFIG.READY_FRAMES;
    HUD.showReady(true);
  }

  #startPlaying() {
    this.#setState(STATE.PLAYING);
    HUD.showReady(false);
  }

  #triggerDeath() {
    this.#setState(STATE.DYING);
    this.#deathTimer = CONFIG.DEATH_FRAMES;
    HUD.showReady(false);
  }

  #triggerLevelClear() {
    this.#setState(STATE.LEVELCLEAR);
    HUD.hideOverlay('overlay-gameover');
    HUD.showOverlay('overlay-levelclear');
    setTimeout(() => {
      HUD.hideOverlay('overlay-levelclear');
      this.#level++;
      HUD.setLevel(this.#level);
      this.#initLevel();
    }, 2200);
  }

  #triggerGameOver() {
    this.#setState(STATE.GAMEOVER);
    HUD.setFinalScore(this.#score.score);
    HUD.showOverlay('overlay-gameover');
  }

  // ── MAIN LOOP ──────────────────────────────

  #loop = () => {
    this.#update();
    this.#draw();
    this.#raf = requestAnimationFrame(this.#loop);
  };

  // ── UPDATE ─────────────────────────────────

  #update() {
    this.#frame++;

    switch (this.#state) {
      case STATE.READY:
        if (--this.#readyTimer <= 0) this.#startPlaying();
        break;

      case STATE.PLAYING:
        this.#updatePlaying();
        break;

      case STATE.DYING:
        this.#pacman.deathFrame++;
        if (--this.#deathTimer <= 0) this.#handleDeath();
        break;
    }

    // Popups always tick
    this.#popups = this.#popups.filter(p => { p.update(); return p.alive; });
  }

  #updatePlaying() {
    // Fright countdown
    if (this.#frightTimer > 0 && --this.#frightTimer === 0) {
      this.#ghosts.forEach(g => g.setFrightened(false));
    }

    // Pacman
    this.#pacman.update(this.#maze);

    // Eat dots
    const eaten = this.#maze.eat(this.#pacman.col, this.#pacman.row);
    if (eaten === 'dot') {
      this.#score.add(CONFIG.SCORE.DOT);
    } else if (eaten === 'power') {
      this.#score.add(CONFIG.SCORE.POWER);
      const dur = Math.max(CONFIG.FRIGHT_MIN, CONFIG.FRIGHT_FRAMES - (this.#level - 1) * 25);
      this.#frightTimer = dur;
      this.#score.resetGhostMul();
      this.#ghosts.forEach(g => g.setFrightened(true));
    }

    // Ghosts
    this.#ghosts.forEach(g => g.update(this.#maze, this.#pacman, this.#ghosts, this.#frame));

    // Collision check — using for…of with destructuring
    for (const ghost of this.#ghosts) {
      const dist = Math.hypot(ghost.x - this.#pacman.x, ghost.y - this.#pacman.y);
      if (dist >= CONFIG.TILE * 0.75) continue;

      if (ghost.frightened) {
        const pts = this.#score.ghostEaten();
        ghost.setEaten();
        this.#popups.push(new ScorePopup(ghost.x, ghost.y, pts));
      } else if (!ghost.eaten && !ghost.inHouse) {
        this.#triggerDeath();
        return;
      }
    }

    // Level clear
    if (this.#maze.cleared) this.#triggerLevelClear();
  }

  #handleDeath() {
    this.#lives--;
    HUD.setLives(this.#lives);
    if (this.#lives <= 0) {
      this.#triggerGameOver();
    } else {
      this.#initLevel();
    }
  }

  // ── DRAW ───────────────────────────────────

  #draw() {
    const ctx = this.#ctx;

    ctx.fillStyle = '#000008';
    ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);

    this.#maze.draw(ctx, this.#frame);

    if (this.#state !== STATE.IDLE && this.#state !== STATE.GAMEOVER) {
      const dying = this.#state === STATE.DYING;
      if (!dying || this.#pacman.deathFrame < 75) {
        this.#pacman.draw(ctx, dying);
      }
      this.#ghosts.forEach(g => g.draw(ctx, this.#frame, this.#frightTimer));
      this.#popups.forEach(p => p.draw(ctx));
    }
  }

  // ── INPUT ──────────────────────────────────

  #bindInput() {
    const dirMap = new Map([
      ['ArrowLeft',  [-1,  0]],
      ['ArrowRight', [ 1,  0]],
      ['ArrowUp',    [ 0, -1]],
      ['ArrowDown',  [ 0,  1]],
      ['a',          [-1,  0]],
      ['d',          [ 1,  0]],
      ['w',          [ 0, -1]],
      ['s',          [ 0,  1]],
    ]);

    document.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') &&
          (this.#state === STATE.IDLE || this.#state === STATE.GAMEOVER)) {
        this.startGame();
        return;
      }
      if (this.#state !== STATE.PLAYING) return;
      const dir = dirMap.get(e.key);
      if (dir) {
        const [dx, dy] = dir; // array destructuring
        this.#pacman.setDir(dx, dy);
        e.preventDefault();
      }
    });

    // Mobile D-pad
    const dpadMap = {
      'dpad-up':    [0, -1],
      'dpad-down':  [0,  1],
      'dpad-left':  [-1, 0],
      'dpad-right': [ 1, 0],
    };

    Object.entries(dpadMap).forEach(([id, [dx, dy]]) => {
      document.getElementById(id)?.addEventListener('touchstart', e => {
        e.preventDefault();
        if (this.#state === STATE.IDLE || this.#state === STATE.GAMEOVER) { this.startGame(); return; }
        if (this.#state === STATE.PLAYING) this.#pacman.setDir(dx, dy);
      }, { passive: false });
    });

    // Swipe on canvas
    let sx = 0, sy = 0;
    this.#canvas.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    this.#canvas.addEventListener('touchend', e => {
      if (this.#state === STATE.IDLE || this.#state === STATE.GAMEOVER) { this.startGame(); return; }
      if (this.#state !== STATE.PLAYING) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > Math.abs(dy)) this.#pacman.setDir(dx > 0 ? 1 : -1, 0);
      else                             this.#pacman.setDir(0, dy > 0 ? 1 : -1);
    }, { passive: true });
  }
}

// ══════════════════════════════════════════════
// § 12. BOOTSTRAP
// ══════════════════════════════════════════════

const game = new Game('canvas');

// Expose for DevTools inspection (portfolio showcase)
window.__pacman__ = game;
