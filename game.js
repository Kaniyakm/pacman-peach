/**
 * BABS' PAC-MAN — Georgia Peach Edition
 * game.js  —  full game logic + sprite rendering + sound
 * For Barbara "Babs" Jackson 🍑
 *
 *
 *  
 */

'use strict';

// ══════════════════════════════════════════════════════
//  SOUND ENGINE  — Web Audio procedural sounds
//  Authentic approximations of original Pac-Man arcade SFX
// ══════════════════════════════════════════════════════
const snd = (() => {
  let ctx = null;
  let muted = false;
  let sirenOsc = null, sirenGain = null, sirenFast = false;
  let frightOsc = null, frightGain = null;
  let wakaPhase = 0;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function master() {
    const g = getCtx().createGain();
    g.gain.value = muted ? 0 : 0.35;
    g.connect(getCtx().destination);
    return g;
  }

  // Waka-waka: alternating short tones
  function waka() {
    if (muted) return;
    const c = getCtx();
    const g = c.createGain();
    g.gain.setValueAtTime(0.28, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.085);
    g.connect(c.destination);
    const o = c.createOscillator();
    o.type = 'square';
    const freq = wakaPhase % 2 === 0 ? 380 : 260;
    wakaPhase++;
    o.frequency.setValueAtTime(freq, c.currentTime);
    o.frequency.linearRampToValueAtTime(freq * 0.7, c.currentTime + 0.07);
    o.connect(g);
    o.start(c.currentTime);
    o.stop(c.currentTime + 0.09);
  }

  // Power pellet eaten
  function power() {
    if (muted) return;
    const c = getCtx(), now = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    g.connect(c.destination);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, now);
    o.frequency.linearRampToValueAtTime(55, now + 0.55);
    o.connect(g);
    o.start(now); o.stop(now + 0.56);
  }

  // Ghost eaten — pitch rises per combo
  function ghost(mul = 1) {
    if (muted) return;
    const c = getCtx(), now = c.currentTime;
    const baseFreq = 300 + mul * 80;
    const g = c.createGain();
    g.gain.setValueAtTime(0.38, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    g.connect(c.destination);
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(baseFreq, now);
    o.frequency.exponentialRampToValueAtTime(baseFreq * 2.2, now + 0.18);
    o.connect(g);
    o.start(now); o.stop(now + 0.23);
  }

  // Death jingle — descending chromatic wobble
  function death() {
    if (muted) return;
    const c = getCtx(), now = c.currentTime;
    const notes = [494,466,440,415,392,370,349,330,311,294,277,262];
    notes.forEach((f, i) => {
      const g = c.createGain();
      g.gain.setValueAtTime(0.32, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.12);
      g.connect(c.destination);
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(g);
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 0.13);
    });
  }

  // Fruit collected
  function fruit(isPeach = false) {
    if (muted) return;
    const c = getCtx(), now = c.currentTime;
    const freqs = isPeach ? [880, 1100, 1320, 1100, 1320, 1760]
                          : [660, 880, 1100, 880];
    freqs.forEach((f, i) => {
      const g = c.createGain();
      g.gain.setValueAtTime(0.22, now + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.07);
      g.connect(c.destination);
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(g);
      o.start(now + i * 0.06);
      o.stop(now + i * 0.06 + 0.08);
    });
  }

  // Level clear fanfare
  function levelClear() {
    if (muted) return;
    const c = getCtx(), now = c.currentTime;
    const seq = [
      [523,0],[659,0.12],[784,0.24],[1047,0.36],[784,0.52],[1047,0.64]
    ];
    seq.forEach(([f, t]) => {
      const g = c.createGain();
      g.gain.setValueAtTime(0.3, now + t);
      g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.18);
      g.connect(c.destination);
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(g);
      o.start(now + t); o.stop(now + t + 0.19);
    });
  }

  // Siren — continuous oscillating tone
  function sirenStart() {
    if (muted || sirenOsc) return;
    const c = getCtx();
    sirenGain = c.createGain();
    sirenGain.gain.value = 0.12;
    sirenGain.connect(c.destination);
    sirenOsc = c.createOscillator();
    sirenOsc.type = 'sawtooth';
    sirenOsc.frequency.value = sirenFast ? 220 : 160;
    // LFO modulation
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfoGain.gain.value = sirenFast ? 40 : 25;
    lfo.frequency.value = sirenFast ? 5 : 3;
    lfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    lfo.start();
    sirenOsc.connect(sirenGain);
    sirenOsc.start();
  }

  function sirenStop() {
    if (!sirenOsc) return;
    try { sirenOsc.stop(); } catch(_) {}
    sirenOsc = null; sirenGain = null;
  }

  function sirenFastMode() {
    sirenFast = true;
    sirenStop(); sirenStart();
  }

  // Frightened mode sound
  function frightStart() {
    if (muted || frightOsc) return;
    const c = getCtx();
    frightGain = c.createGain();
    frightGain.gain.value = 0.14;
    frightGain.connect(c.destination);
    frightOsc = c.createOscillator();
    frightOsc.type = 'square';
    frightOsc.frequency.value = 200;
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lg.gain.value = 60;
    lfo.frequency.value = 8;
    lfo.connect(lg); lg.connect(frightOsc.frequency);
    lfo.start();
    frightOsc.connect(frightGain);
    frightOsc.start();
  }

  function frightStop() {
    if (!frightOsc) return;
    try { frightOsc.stop(); } catch(_) {}
    frightOsc = null; frightGain = null;
  }

  function toggleMute() {
    muted = !muted;
    if (muted) { sirenStop(); frightStop(); }
    return muted;
  }

  function start() { getCtx(); }

  return {
    waka, power, ghost, death, fruit, levelClear,
    sirenStart, sirenStop, sirenFast: sirenFastMode,
    frightStart, frightStop,
    toggleMute, start,
    get muted() { return muted; }
  };
})();

// ══════════════════════════════════════════════════════
//  1  TRIBUTE
// ══════════════════════════════════════════════════════
const TRIBUTE = Object.freeze({
  name:     'Barbara Jackson',
  nickname: 'BABS',
  hiScore:  3333330,
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

// ══════════════════════════════════════════════════════
//  2  CONSTANTS
// ══════════════════════════════════════════════════════
const CFG = Object.freeze({
  TILE:         20,
  COLS:         21,
  ROWS:         23,
  CELL:         32,
  PAC_SPEED:    1.8,
  GHOST_SPEED:  1.4,
  FRIGHT_BASE:  300,   // frames of fright on level 1
  FRIGHT_MIN:    40,   // never go below this
  READY_FRAMES: 150,   // ~2.5 s countdown
  DEATH_FRAMES:  90,
  LEVELCLEAR_FLASH: 60, // frames of maze flashing before next level
  SCORE: Object.freeze({ DOT: 10, POWER: 50, GHOST_BASE: 200 }),
});

const TILE_TYPE = Object.freeze({ WALL: 1, DOT: 2, POWER: 3, EMPTY: 0, HOUSE: 4 });

const STATE = Object.freeze({
  IDLE:       Symbol('idle'),
  READY:      Symbol('ready'),
  PLAYING:    Symbol('playing'),
  DYING:      Symbol('dying'),
  LEVELCLEAR: Symbol('levelclear'),
  GAMEOVER:   Symbol('gameover'),
});

// ══════════════════════════════════════════════════════
//  3  SPRITE SHEET SYSTEM
// ══════════════════════════════════════════════════════
class SpriteSheet {
  #img   = null;
  #ready = false;

  constructor(src) {
    this.#img = new Image();
    this.#img.onload  = () => { this.#ready = true; };
    this.#img.onerror = () => console.warn(`Sprite load failed: ${src}`);
    this.#img.src = src;
  }

  get ready() { return this.#ready; }

  blit(ctx, col, row, dx, dy, scale, flipX = false) {
    if (!this.#ready) return false;
    const C  = CFG.CELL;
    const sc = scale ?? (CFG.TILE / C);
    const dim = C * sc;
    ctx.save();
    if (flipX) {
      ctx.translate(dx, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(this.#img, col*C, row*C, C, C, -dim/2, -dim/2, dim, dim);
    } else {
      ctx.drawImage(this.#img, col*C, row*C, C, C, dx-dim/2, dy-dim/2, dim, dim);
    }
    ctx.restore();
    return true;
  }
}

const SPRITES = {
  pacman:  new SpriteSheet('assets/sprites/pacman.png'),
  ghosts:  new SpriteSheet('assets/sprites/ghosts.png'),
  fruits:  new SpriteSheet('assets/sprites/fruits.png'),
  pellets: new SpriteSheet('assets/sprites/pellets.png'),
};

function pacRow(dx, dy) {
  if (dy < 0) return 1;
  if (dy > 0) return 2;
  return 0;
}
function pacCol(frame) {
  const f = frame % 16;
  return f < 8 ? Math.floor(f / 2) : 7 - Math.floor(f / 2);
}
function ghostBodyCol(dx, dy, frame) {
  let dirIdx = 0;
  if      (dx  > 0) dirIdx = 0;
  else if (dx  < 0) dirIdx = 1;
  else if (dy  < 0) dirIdx = 2;
  else              dirIdx = 3;
  return dirIdx * 2 + (Math.floor(frame / 8) % 2);
}

const FRUIT_COL = new Map([
  ['cherry',0],['strawberry',1],['orange',2],['apple',3],['melon',4],
  ['grapes',5],['watermelon',6],['bell',7],['key',8],['peach',9],
]);

// ══════════════════════════════════════════════════════
//  4  CANVAS FALLBACKS  (used when sprite sheet not loaded)
// ══════════════════════════════════════════════════════
function fbPacman(ctx, x, y, dx, dy, mouthDeg, dying, deathPct) {
  const r = CFG.TILE * 0.47;
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14;
  const g = ctx.createRadialGradient(-r*.2,-r*.2,0,0,0,r);
  g.addColorStop(0,'#FFE88A'); g.addColorStop(0.6,'#FFD700'); g.addColorStop(1,'#FF9900');
  ctx.fillStyle = g;
  if (dying) {
    const p = Math.min(deathPct/80,1), a = p*Math.PI*.97;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,a,Math.PI*2-a); ctx.closePath(); ctx.fill();
  } else {
    ctx.rotate(Math.atan2(dy, dx||1));
    const m = mouthDeg * Math.PI;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,m,Math.PI*2-m); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function fbGhost(ctx, x, y, color, dx, dy, frightened, frightTimer, frame) {
  const r = CFG.TILE * 0.47;
  ctx.save(); ctx.translate(x, y);
  let col = color;
  if (frightened) col = (frightTimer<60 && Math.floor(frame/7)%2===0) ? '#FFFFFF' : '#0000BB';
  ctx.shadowColor = frightened?'#000088':color; ctx.shadowBlur=10; ctx.fillStyle=col;
  ctx.beginPath(); ctx.arc(0,-r*.05,r,Math.PI,0);
  const pts=[-r,-r/3,r/3,r];
  for(let i=0;i<3;i++){const mx=(pts[i]+pts[i+1])/2,py=i%2===0?r*.85:r*.5;ctx.quadraticCurveTo(mx,py,pts[i+1],r*(i%2===0?.5:.85));}
  ctx.closePath(); ctx.fill();
  [[-0.3,-0.22],[0.3,-0.22]].forEach(([ex,ey])=>{
    ctx.fillStyle='white'; ctx.beginPath(); ctx.ellipse(r*ex,r*ey,r*.21,r*.25,0,0,Math.PI*2); ctx.fill();
    if(!frightened){ctx.fillStyle='#1144FF';ctx.beginPath();ctx.arc(r*ex+dx*r*.09,r*ey+dy*r*.09,r*.12,0,Math.PI*2);ctx.fill();}
  });
  ctx.restore();
}

function fbOrange(ctx, x, y) {
  const r = CFG.TILE * 0.42;
  ctx.save(); ctx.translate(x,y);
  const g=ctx.createRadialGradient(-r*.25,-r*.25,0,0,0,r);
  g.addColorStop(0,'#FFE066'); g.addColorStop(0.4,'#FF9900'); g.addColorStop(1,'#CC5500');
  ctx.shadowColor='#FF8800'; ctx.shadowBlur=8; ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
  for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2;ctx.strokeStyle='rgba(200,80,0,.3)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.stroke();}
  ctx.fillStyle='#2EAA1A'; ctx.beginPath(); ctx.ellipse(0,-r*.9,r*.15,r*.32,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#1A6610'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,-r*.72); ctx.lineTo(0,-r*1.05); ctx.stroke();
  ctx.restore();
}

// FIX: fillStyle='white' ensures text is visible on dark canvas
function fbFruit(ctx, x, y, def) {
  if (def.id === 'orange') { fbOrange(ctx, x, y); return; }
  ctx.save();
  ctx.font = `${Math.round(CFG.TILE*.9)}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'white';    // ← FIX: was absent, causing invisible text
  if (def.id === 'peach') {
    ctx.shadowColor = '#FFAB76';
    ctx.shadowBlur  = 16;
  }
  ctx.fillText(def.emoji || '?', x, y);
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  5  FRUITS — emoji property on every entry (FIX)
//     fruitForLevel() — selects fruit appropriate for level
// ══════════════════════════════════════════════════════
const FRUITS = Object.freeze([
  { id:'cherry',     emoji:'🍒', name:'Cherry',     basePoints:100,  mult:1, minLevel:1  },
  { id:'strawberry', emoji:'🍓', name:'Strawberry', basePoints:300,  mult:1, minLevel:2  },
  { id:'orange',     emoji:'🍊', name:'Orange',     basePoints:500,  mult:1, minLevel:3  },
  { id:'apple',      emoji:'🍎', name:'Apple',      basePoints:700,  mult:1, minLevel:4  },
  { id:'melon',      emoji:'🍈', name:'Melon',      basePoints:1000, mult:1, minLevel:5  },
  { id:'grapes',     emoji:'🍇', name:'Grapes',     basePoints:2000, mult:1, minLevel:6  },
  { id:'watermelon', emoji:'🍉', name:'Watermelon', basePoints:3000, mult:1, minLevel:7  },
  { id:'bell',       emoji:'🔔', name:'Bell',       basePoints:3000, mult:1, minLevel:8  },
  { id:'key',        emoji:'🗝', name:'Key',        basePoints:5000, mult:1, minLevel:9  },
  { id:'peach',      emoji:'🍑', name:'Peach',      basePoints:500,  mult:3, minLevel:1  },
]);

function fruitForLevel(level) {
  const pool = FRUITS.filter(f => f.id !== 'peach');
  const levelIdx  = Math.min(level - 1, pool.length - 1);
  // 60% level-appropriate, 40% random variety
  const canonical = Math.random() < 0.6 ? pool[levelIdx]
                  : pool[Math.floor(Math.random() * pool.length)];
  // Peach chance increases with level, capped at 40%
  const peachChance = Math.min(0.15 + (level - 1) * 0.03, 0.40);
  return Math.random() < peachChance ? FRUITS.find(f => f.id === 'peach') : canonical;
}

// ══════════════════════════════════════════════════════
//  6  BONUS FRUIT
//  FIX: full fade-out on BOTH collect and timeout
//  Fruit disappears cleanly in both cases
// ══════════════════════════════════════════════════════
class BonusFruit {
  #def; #x; #y; #timer; #maxTimer;
  #collected = false;
  #bobFrame  = 0;
  #fadeFrame = -1;   // counts up during any fade (collect OR timeout)
  #fadeDur   = 18;   // frames for fade animation

  constructor(def, x, y, duration = 480) {
    this.#def      = def;
    this.#x        = x;
    this.#y        = y;
    this.#timer    = duration;
    this.#maxTimer = duration;
  }

  get def()          { return this.#def; }
  get x()            { return this.#x; }
  get y()            { return this.#y; }
  get alive()        { return !this.#collected && this.#timer > 0; }
  get collected()    { return this.#collected; }
  get doneRendering(){ return this.#fadeFrame >= this.#fadeDur; }

  collect() {
    this.#collected = true;
    this.#fadeFrame = 0;
  }

  update() {
    if (this.alive) {
      this.#timer--;
      this.#bobFrame++;
      // Start fade when 90 frames remain
    } else if (!this.#collected && this.#fadeFrame < 0) {
      // Timer hit zero without being collected — start timeout fade
      this.#fadeFrame = 0;
    }
    if (this.#fadeFrame >= 0) this.#fadeFrame++;
  }

  draw(ctx, globalFrame) {
    if (this.doneRendering) return;

    const { x, y } = this;
    const bob  = Math.sin(this.#bobFrame * .1) * 2;

    // Calculate alpha
    let alpha;
    if (this.#fadeFrame >= 0) {
      // Fading out (either eaten or timed out)
      alpha = Math.max(0, 1 - this.#fadeFrame / this.#fadeDur);
    } else if (this.#timer < 90) {
      // Low time warning — pulse fade
      alpha = 0.4 + 0.6 * (this.#timer / 90);
    } else {
      alpha = 1;
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    const col = FRUIT_COL.get(this.#def.id) ?? 0;
    const drawn = SPRITES.fruits.blit(ctx, col, 0, x, y + bob);
    if (!drawn) fbFruit(ctx, x, y + bob, this.#def);

    // Peach glow pulse
    if (this.alive && this.#def.id === 'peach') {
      const pulse = 0.3 + 0.25 * Math.sin(this.#bobFrame * .12);
      ctx.globalAlpha = alpha * pulse;
      SPRITES.fruits.blit(ctx, col, 1, x, y + bob);
    }

    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════
//  7  SCORE POPUP
// ══════════════════════════════════════════════════════
class ScorePopup {
  constructor(x, y, value, isTriple = false) {
    this.x = x; this.y = y; this.value = value;
    this.isTriple = isTriple; this.life = 75;
  }
  update() { this.y -= .55; this.life--; }
  get alive() { return this.life > 0; }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.min(this.life / 28, 1);
    const col = this.isTriple ? '#FFAB76' : '#00FFFF';
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.font = `bold ${this.isTriple ? 9 : 8}px "Press Start 2P"`;
    ctx.textAlign = 'center';
    if (this.isTriple) ctx.fillText('🍑×3', this.x, this.y - 10);
    ctx.fillText(this.value, this.x, this.y);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════
//  8  EVENT BUS
// ══════════════════════════════════════════════════════
class EventBus {
  #map = new Map();
  on(e, cb) { if (!this.#map.has(e)) this.#map.set(e, new Set()); this.#map.get(e).add(cb); return () => this.off(e, cb); }
  off(e, cb) { this.#map.get(e)?.delete(cb); }
  emit(e, d) { this.#map.get(e)?.forEach(cb => cb(d)); }
}
const bus = new EventBus();

// ══════════════════════════════════════════════════════
//  9  SCORE MANAGER
// ══════════════════════════════════════════════════════
class ScoreManager {
  #score = 0; #ghostMul = 1;
  static BABS_HI = TRIBUTE.hiScore;
  #sync() { document.getElementById('score').textContent = String(this.#score).padStart(7,'0'); }
  add(pts)   { this.#score += pts; this.#sync(); }
  reset()    { this.#score = 0; this.#ghostMul = 1; this.#sync(); }
  get score()    { return this.#score; }
  ghostEaten()   { const p = CFG.SCORE.GHOST_BASE * this.#ghostMul; this.#ghostMul = Math.min(this.#ghostMul * 2, 8); this.add(p); return p; }
  resetGhostMul(){ this.#ghostMul = 1; }
  get ghostMul() { return this.#ghostMul; }
}

// ══════════════════════════════════════════════════════
//  10  MAP
// ══════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════
//  11  MAZE
// ══════════════════════════════════════════════════════
class Maze {
  #grid = []; #dotsLeft = 0; #flashOn = false;

  clone() {
    this.#grid = BASE_MAP.map(row => [...row]);
    this.#dotsLeft = this.#grid.flat().filter(v => v === TILE_TYPE.DOT || v === TILE_TYPE.POWER).length;
    return this;
  }

  eat(col, row) {
    const v = this.#grid[row]?.[col];
    if (v === TILE_TYPE.DOT)   { this.#grid[row][col] = TILE_TYPE.EMPTY; this.#dotsLeft--; return 'dot'; }
    if (v === TILE_TYPE.POWER) { this.#grid[row][col] = TILE_TYPE.EMPTY; this.#dotsLeft--; return 'power'; }
    return null;
  }

  isWall(col, row)   { return this.#grid[row]?.[col] === TILE_TYPE.WALL; }
  get dotsLeft()     { return this.#dotsLeft; }
  get cleared()      { return this.#dotsLeft <= 0; }
  set flashOn(v)     { this.#flashOn = v; }

  *walls()   { if (!this.#grid.length) return; for (let r=0;r<CFG.ROWS;r++) for (let c=0;c<CFG.COLS;c++) if (this.#grid[r]?.[c] === TILE_TYPE.WALL) yield {r,c}; }
  *pickups() { if (!this.#grid.length) return; for (let r=0;r<CFG.ROWS;r++) for (let c=0;c<CFG.COLS;c++) { const v=this.#grid[r]?.[c]; if (v===TILE_TYPE.DOT||v===TILE_TYPE.POWER) yield {r,c,type:v}; } }

  draw(ctx, frame) {
    const T = CFG.TILE;
    // Flash maze white on level clear
    const wallColor = this.#flashOn
      ? (Math.floor(frame / 6) % 2 === 0 ? '#FFFFFF' : '#2323ee')
      : '#000035';
    const lineColor = this.#flashOn
      ? (Math.floor(frame / 6) % 2 === 0 ? '#000035' : '#FFFFFF')
      : '#2323ee';

    for (const {r,c} of this.walls()) {
      const x = c*T, y = r*T;
      ctx.fillStyle = wallColor; ctx.fillRect(x, y, T, T);
      this.#edges(ctx, r, c, x, y, lineColor);
    }
    if (this.#flashOn) return; // Don't draw pellets during flash

    for (const {r,c,type} of this.pickups()) {
      const cx = c*T+T/2, cy = r*T+T/2;
      if (type === TILE_TYPE.DOT) {
        const drawn = SPRITES.pellets.blit(ctx, 0, 0, cx, cy);
        if (!drawn) { ctx.fillStyle='#FFB8AE'; ctx.beginPath(); ctx.arc(cx,cy,2.2,0,Math.PI*2); ctx.fill(); }
      } else {
        const pCol = 1 + Math.floor(frame/8)%5;
        const drawn = SPRITES.pellets.blit(ctx, pCol, 0, cx, cy);
        if (!drawn) {
          const sc = .72 + .28*Math.sin(frame*.14);
          ctx.save(); ctx.shadowColor='#FFAB76'; ctx.shadowBlur=14;
          ctx.fillStyle='#FFD4B0'; ctx.beginPath(); ctx.arc(cx,cy,5.8*sc,0,Math.PI*2); ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  #edges(ctx, r, c, x, y, lineColor = '#2323ee') {
    const T = CFG.TILE;
    const iw = (dr,dc) => this.#grid[r+dr]?.[c+dc] === TILE_TYPE.WALL;
    ctx.save();
    ctx.strokeStyle = lineColor; ctx.shadowColor = lineColor; ctx.shadowBlur = 5;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    [
      [!iw(-1,0), x,   y+1,   x+T, y+1  ],
      [!iw(1,0),  x,   y+T-1, x+T, y+T-1],
      [!iw(0,-1), x+1, y,     x+1, y+T  ],
      [!iw(0,1),  x+T-1, y, x+T-1, y+T  ],
    ].forEach(([show,x1,y1,x2,y2]) => {
      if (!show) return;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════
//  12  ENTITY BASE
// ══════════════════════════════════════════════════════
class Entity {
  constructor(x, y, speed) { this.x=x; this.y=y; this.dx=0; this.dy=0; this.speed=speed; }
  get col()   { return Math.round((this.x - CFG.TILE/2) / CFG.TILE); }
  get row()   { return Math.round((this.y - CFG.TILE/2) / CFG.TILE); }
  get tileX() { return this.col * CFG.TILE + CFG.TILE/2; }
  get tileY() { return this.row * CFG.TILE + CFG.TILE/2; }
  _hitsWall(maze, nx, ny, m = .42) {
    const mg = CFG.TILE*m, T = CFG.TILE;
    for (let r = Math.floor((ny-mg)/T); r <= Math.floor((ny+mg)/T); r++)
      for (let c = Math.floor((nx-mg)/T); c <= Math.floor((nx+mg)/T); c++)
        if (maze.isWall(c, r)) return true;
    return false;
  }
  _wrapX() { const w = CFG.COLS*CFG.TILE; if (this.x < 0) this.x = w; if (this.x > w) this.x = 0; }
}

// ══════════════════════════════════════════════════════
//  13  PAC-MAN
// ══════════════════════════════════════════════════════
class Pacman extends Entity {
  #mouth = .25; #mouthDir = 1; #nextDx = 0; #nextDy = 0;
  deathFrame = 0;

  constructor(x, y) { super(x, y, CFG.PAC_SPEED); }
  setDir(dx, dy) { this.#nextDx = dx; this.#nextDy = dy; }

  update(maze) {
    if (this.#nextDx !== this.dx || this.#nextDy !== this.dy)
      if (!this._hitsWall(maze, this.x + this.#nextDx*this.speed, this.y + this.#nextDy*this.speed))
        { this.dx = this.#nextDx; this.dy = this.#nextDy; }
    if (!this._hitsWall(maze, this.x + this.dx*this.speed, this.y + this.dy*this.speed))
      { this.x += this.dx*this.speed; this.y += this.dy*this.speed; }
    this._wrapX();
    this.#mouth += .05 * this.#mouthDir;
    if (this.#mouth >= .26 || this.#mouth <= .01) this.#mouthDir *= -1;
  }

  draw(ctx, globalFrame, dying = false) {
    const {x,y} = this;
    if (dying) {
      const col = Math.min(7, Math.floor(this.deathFrame / (CFG.DEATH_FRAMES/8)));
      const drawn = SPRITES.pacman.blit(ctx, col, 3, x, y);
      if (!drawn) fbPacman(ctx, x, y, this.dx, this.dy, this.#mouth, true, this.deathFrame);
      return;
    }
    const row   = pacRow(this.dx, this.dy);
    const col   = pacCol(globalFrame);
    const flipX = this.dx < 0;
    const drawn = SPRITES.pacman.blit(ctx, col, row, x, y, undefined, flipX);
    if (!drawn) fbPacman(ctx, x, y, this.dx, this.dy, this.#mouth, false, 0);
  }
}

// ══════════════════════════════════════════════════════
//  14  GHOST
//
//  FIX 1 — exit position:
//    On release, teleport to row 7 col 10 — open corridor directly above
//    ghost house. map[8][10] = WALL would have blocked old row 9 exit.
//
//  FIX 2 — scatter / chase mode:
//    update() accepts scatter boolean from Game's phase timer.
//    #chooseDir() uses home corner in scatter, chase AI in chase.
//
//  FIX 3 — immediate chase after exit:
//    After exiting house, ghost immediately participates in scatter/chase
//    cycle — no extra delay.
// ══════════════════════════════════════════════════════
const GhostAI = {
  blinky: (g, pac)      => ({ x: pac.x, y: pac.y }),
  pinky:  (g, pac)      => ({ x: pac.x + pac.dx*CFG.TILE*4, y: pac.y + pac.dy*CFG.TILE*4 }),
  inky:   (g, pac, all) => { const b=all[0], px=pac.x+pac.dx*CFG.TILE*2, py=pac.y+pac.dy*CFG.TILE*2; return {x:px*2-b.x, y:py*2-b.y}; },
  clyde:  (g, pac)      => Math.hypot(g.x-pac.x, g.y-pac.y) > CFG.TILE*8 ? {x:pac.x, y:pac.y} : {x:0, y:CFG.ROWS*CFG.TILE},
};
const AI_FNS = [GhostAI.blinky, GhostAI.pinky, GhostAI.inky, GhostAI.clyde];

const GHOST_DEFS = Object.freeze([
  // Blinky: starts OUTSIDE house (classic behavior)
  { name:'BLINKY', color:'#FF0000', startCol:10, startRow:7,  startOutside:true,
    scatterTarget:{x:CFG.COLS*CFG.TILE, y:0} },
  { name:'PINKY',  color:'#FFB8FF', startCol:10, startRow:10, startOutside:false,
    scatterTarget:{x:0,                y:0} },
  { name:'INKY',   color:'#00FFFF', startCol:9,  startRow:10, startOutside:false,
    scatterTarget:{x:CFG.COLS*CFG.TILE, y:CFG.ROWS*CFG.TILE} },
  { name:'CLYDE',  color:'#FFB852', startCol:11, startRow:10, startOutside:false,
    scatterTarget:{x:0,                y:CFG.ROWS*CFG.TILE} },
]);

class Ghost extends Entity {
  #frightened = false; #eaten = false; #inHouse = true;
  #leaveTimer = 0; #ai; #idx; #scatterTarget;
  color; name;

  constructor({ name, color, startCol, startRow, scatterTarget, startOutside }, idx, speed) {
    const T = CFG.TILE;
    super(startCol*T + T/2, startRow*T + T/2, speed);
    this.name = name; this.color = color; this.#idx = idx;
    this.#ai = AI_FNS[idx];
    this.#scatterTarget = scatterTarget;

    if (startOutside) {
      // Blinky: in corridor above house, goes right immediately
      this.#inHouse = false;
      this.dx = 1; this.dy = 0;
      this.#leaveTimer = 0;
    } else {
      // Pinky leaves immediately, Inky waits 60f, Clyde waits 120f
      this.#leaveTimer = [0, 0, 60, 120][idx];
      this.dy = -1;
    }
  }

  get frightened() { return this.#frightened; }
  get eaten()      { return this.#eaten; }
  get inHouse()    { return this.#inHouse; }

  setFrightened(on) { if (!this.#eaten) this.#frightened = on; }
  setEaten()        { this.#eaten = true; this.#frightened = false; }

  resetToHouse() {
    this.#eaten = false; this.#inHouse = true; this.#leaveTimer = 60;
    this.x = CFG.TILE*10 + CFG.TILE/2;
    this.y = CFG.TILE*10 + CFG.TILE/2;
    this.dx = 0; this.dy = 0;
  }

  // scatter=true → target home corner; scatter=false → chase AI
  update(maze, pac, all, frame, scatter = false) {
    const T = CFG.TILE;
    const spd = this.#eaten ? this.speed*2 : this.#frightened ? this.speed*.5 : this.speed;

    if (this.#inHouse) {
      this.#leaveTimer--;
      this.y += Math.sin(frame*.12 + this.#idx*1.3) * .35; // bob while waiting
      if (this.#leaveTimer <= 0) {
        this.#inHouse = false;
        // FIX: row 7 col 10 = open EMPTY tile directly above ghost house door
        this.x = T*10 + T/2;
        this.y = T*7  + T/2;
        this.dx = (Math.random() < .5) ? -1 : 1;
        this.dy = 0;
      }
      return;
    }

    if (this.#eaten) {
      const hx = T*10 + T/2, hy = T*10 + T/2;
      if (Math.hypot(this.x - hx, this.y - hy) < spd + 1) { this.resetToHouse(); return; }
    }

    const aligned = Math.abs(this.x - this.tileX) < spd+.5 && Math.abs(this.y - this.tileY) < spd+.5;
    if (aligned) {
      this.x = this.tileX; this.y = this.tileY;
      this.#chooseDir(maze, pac, all, scatter);
    }
    if (!this._hitsWall(maze, this.x + this.dx*spd, this.y + this.dy*spd)) {
      this.x += this.dx*spd; this.y += this.dy*spd;
    } else {
      this.#chooseDir(maze, pac, all, scatter);
    }
    this._wrapX();
  }

  #chooseDir(maze, pac, all, scatter = false) {
    const T = CFG.TILE;
    const DIRS = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const valid = DIRS.filter(({dx,dy}) =>
      !(dx === -this.dx && dy === -this.dy) &&
      !this._hitsWall(maze, this.x + dx*T, this.y + dy*T)
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
      ? { x: CFG.TILE*10 + CFG.TILE/2, y: CFG.TILE*10 + CFG.TILE/2 }
      : scatter
        ? this.#scatterTarget
        : this.#ai(this, pac, all);

    const best = valid.reduce((acc, d) => {
      const dist = Math.hypot(this.x + d.dx*T - target.x, this.y + d.dy*T - target.y);
      return dist < acc.dist ? {...d, dist} : acc;
    }, {dist: Infinity});
    if (best.dist < Infinity) { this.dx = best.dx; this.dy = best.dy; }
  }

  draw(ctx, globalFrame, frightTimer) {
    const {x,y} = this;
    ctx.save();
    if (this.#inHouse) ctx.globalAlpha = .5;
    let drawn = false;
    if (this.#eaten) {
      let dirCol = 0;
      if (this.dx>0) dirCol=0; else if (this.dx<0) dirCol=2;
      else if (this.dy<0) dirCol=4; else dirCol=6;
      dirCol += Math.floor(globalFrame/8) % 2;
      drawn = SPRITES.ghosts.blit(ctx, dirCol, 6, x, y);
    } else if (this.#frightened) {
      const flashing = frightTimer < 60 && Math.floor(globalFrame/7)%2 === 0;
      const row = flashing ? 5 : 4;
      const col = Math.floor(globalFrame/6) % 8;
      drawn = SPRITES.ghosts.blit(ctx, col, row, x, y);
    } else {
      const row = this.#idx;
      const col = ghostBodyCol(this.dx, this.dy, globalFrame);
      drawn = SPRITES.ghosts.blit(ctx, col, row, x, y);
    }
    if (!drawn) fbGhost(ctx, x, y, this.color, this.dx, this.dy, this.#frightened, frightTimer, globalFrame);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════
//  15  HUD
// ══════════════════════════════════════════════════════
const HUD = {
  setLevel(n)      { document.getElementById('level').textContent = String(n).padStart(2,'0'); },
  setLives(n)      { document.querySelectorAll('.life-icon').forEach((el,i) => el.classList.toggle('dead', i>=n)); },
  show(id)         { document.getElementById(id)?.classList.remove('overlay--hidden'); },
  hide(id)         { document.getElementById(id)?.classList.add('overlay--hidden'); },
  setFinalScore(n) { document.getElementById('final-score').textContent = String(n).padStart(7,'0'); },
  setGameOverMsg(m){ document.getElementById('gameover-msg').textContent = m; },
  setReady(on)     { document.getElementById('ready-text')?.classList.toggle('overlay--hidden', !on); },
  setMuteBtn(muted){ const btn = document.getElementById('mute-btn'); if(btn) btn.textContent = muted ? '🔇 MUTED' : '🔊 SOUND'; },
  setActiveFruit(def) {
    if (!def) {
      document.getElementById('active-fruit-icon').textContent = '·';
      document.getElementById('active-fruit-name').textContent = '—';
      document.getElementById('active-fruit-pts').textContent  = '';
      return;
    }
    const pts = def.basePoints * def.mult;
    document.getElementById('active-fruit-icon').textContent  = def.emoji || def.name[0];
    document.getElementById('active-fruit-name').textContent  = def.name + (def.mult > 1 ? ` ×${def.mult}!` : '');
    document.getElementById('active-fruit-pts').textContent   = `${pts} PTS`;
    document.getElementById('active-fruit-icon').style.color  = def.id === 'peach' ? '#FFAB76' : '';
  },
};

// ══════════════════════════════════════════════════════
//  16  SCATTER / CHASE SCHEDULE
//  Classic Pac-Man phase durations (in frames @ ~60fps)
//  Level 1:   S7  C20 S7  C20 S5  C20 S5  C∞
//  Level 2+:  S5  C20 S5  C20 S5  C20 S1  C∞
// ══════════════════════════════════════════════════════
function buildModeSchedule(level) {
  const s7=420, s5=300, s1=60, c20=1200, cInf=Number.MAX_SAFE_INTEGER;
  if (level === 1) {
    return [
      {scatter:true,  dur:s7}, {scatter:false, dur:c20},
      {scatter:true,  dur:s7}, {scatter:false, dur:c20},
      {scatter:true,  dur:s5}, {scatter:false, dur:c20},
      {scatter:true,  dur:s5}, {scatter:false, dur:cInf},
    ];
  }
  return [
    {scatter:true,  dur:s5}, {scatter:false, dur:c20},
    {scatter:true,  dur:s5}, {scatter:false, dur:c20},
    {scatter:true,  dur:s5}, {scatter:false, dur:c20},
    {scatter:true,  dur:s1}, {scatter:false, dur:cInf},
  ];
}

// ══════════════════════════════════════════════════════
//  17  LEVEL TIMING HELPER
//  Returns per-level config: ghost speed, fright duration, fruit duration
// ══════════════════════════════════════════════════════
function levelConfig(level) {
  return {
    ghostSpeed:    Math.min(CFG.GHOST_SPEED + (level-1) * 0.08, 2.2),
    pacSpeed:      Math.min(CFG.PAC_SPEED   + (level-1) * 0.04, 2.4),
    frightDur:     Math.max(CFG.FRIGHT_MIN,  CFG.FRIGHT_BASE - (level-1) * 25),
    fruitDuration: Math.max(240, 480 - (level-1) * 20), // fruit stays shorter on higher levels
  };
}

// ══════════════════════════════════════════════════════
//  18  GAME  — state machine
// ══════════════════════════════════════════════════════
class Game {
  #canvas; #ctx;
  #maze   = new Maze();
  #score  = new ScoreManager();
  #pac    = null;
  #ghosts = [];
  #popups = [];
  #bonus  = null;
  #state  = STATE.IDLE;
  #frame  = 0;
  #frightTimer   = 0;
  #readyTimer    = 0;
  #deathTimer    = 0;
  #level  = 1;
  #lives  = 3;
  #dotEatenCount = 0;
  #fruit1Spawned = false;
  #fruit2Spawned = false;
  #sirenFast     = false;

  // Scatter/chase mode
  #modeSchedule = [];
  #modePhase    = 0;
  #modeTimer    = 0;
  #scatterMode  = true;

  // Level clear flash
  #levelClearTimer = 0;
  #levelFlashing   = false;

  // Per-level config cache
  #lvlCfg = null;

  constructor(canvasId) {
    this.#canvas = document.getElementById(canvasId);
    this.#ctx    = this.#canvas.getContext('2d');
    this.#canvas.width  = CFG.COLS * CFG.TILE;
    this.#canvas.height = CFG.ROWS * CFG.TILE;
    this.#bindInput();
    this.#maze.clone();
    document.getElementById('highscore').textContent = String(TRIBUTE.hiScore).padStart(7,'0');
    HUD.show('overlay-start');
    requestAnimationFrame(this.#loop);
  }

  #setState(s) { this.#state = s; bus.emit('state:change', s); }

  // ── START / INIT ─────────────────────────────────────
  startGame() {
    HUD.hide('overlay-start'); HUD.hide('overlay-gameover');
    this.#score.reset(); this.#level = 1; this.#lives = 3;
    HUD.setLevel(1); HUD.setLives(3);
    this.#initLevel();
    snd.start();
  }

  #initLevel() {
    this.#lvlCfg = levelConfig(this.#level);
    this.#maze.clone();
    this.#maze.flashOn = false;

    const T = CFG.TILE;
    this.#pac = new Pacman(10*T + T/2, 16*T + T/2);
    this.#pac.speed = this.#lvlCfg.pacSpeed;

    const spd = this.#lvlCfg.ghostSpeed;
    this.#ghosts = GHOST_DEFS.map((def, i) => new Ghost(def, i, spd));
    this.#popups = []; this.#bonus = null; this.#frightTimer = 0;
    this.#dotEatenCount = 0; this.#fruit1Spawned = false; this.#fruit2Spawned = false;
    this.#sirenFast = false;
    this.#score.resetGhostMul();
    this.#levelClearTimer = 0; this.#levelFlashing = false;

    // Build scatter/chase schedule
    this.#modeSchedule = buildModeSchedule(this.#level);
    this.#modePhase    = 0;
    this.#scatterMode  = this.#modeSchedule[0].scatter;
    this.#modeTimer    = this.#modeSchedule[0].dur;

    this.#setState(STATE.READY);
    this.#readyTimer = CFG.READY_FRAMES;
    HUD.setReady(true); HUD.setActiveFruit(null);
    snd.sirenStop(); snd.frightStop();
  }

  // ── MAIN LOOP ─────────────────────────────────────────
  #loop = () => { this.#update(); this.#draw(); requestAnimationFrame(this.#loop); };

  #update() {
    this.#frame++;
    switch (this.#state) {
      case STATE.READY:
        if (--this.#readyTimer <= 0) {
          this.#setState(STATE.PLAYING);
          HUD.setReady(false);
          snd.sirenStart();
        }
        break;
      case STATE.PLAYING:
        this.#updatePlaying();
        break;
      case STATE.DYING:
        this.#pac.deathFrame++;
        if (--this.#deathTimer <= 0) this.#handleDeath();
        break;
      case STATE.LEVELCLEAR:
        // Flash the maze then advance
        this.#levelClearTimer--;
        this.#maze.flashOn = (this.#levelClearTimer % 12 < 6);
        if (this.#levelClearTimer <= 0) {
          this.#maze.flashOn = false;
          this.#level++;
          HUD.setLevel(this.#level);
          this.#initLevel();
        }
        break;
    }
    this.#popups = this.#popups.filter(p => { p.update(); return p.alive; });
  }

  // ── SCATTER / CHASE TIMER ────────────────────────────
  #tickModeTimer() {
    if (this.#frightTimer > 0) return; // pause during fright
    if (--this.#modeTimer <= 0) {
      const next = this.#modePhase + 1;
      if (next < this.#modeSchedule.length) {
        this.#modePhase  = next;
        const ph = this.#modeSchedule[next];
        this.#scatterMode = ph.scatter;
        this.#modeTimer   = ph.dur;
      } else {
        this.#scatterMode = false;
        this.#modeTimer   = Number.MAX_SAFE_INTEGER;
      }
    }
  }

  #updatePlaying() {
    this.#tickModeTimer();

    // Fright countdown
    if (this.#frightTimer > 0) {
      this.#frightTimer--;
      if (this.#frightTimer === 0) {
        this.#ghosts.forEach(g => g.setFrightened(false));
        snd.frightStop();
        snd.sirenStart();
      }
    }

    this.#pac.update(this.#maze);

    // Eat dot / power pellet
    const eaten = this.#maze.eat(this.#pac.col, this.#pac.row);
    if (eaten === 'dot') {
      this.#score.add(CFG.SCORE.DOT);
      this.#dotEatenCount++;
      this.#checkFruitSpawn();
      snd.waka();
      if (!this.#sirenFast && this.#maze.dotsLeft < 30 && this.#frightTimer === 0) {
        this.#sirenFast = true; snd.sirenFast();
      }
    } else if (eaten === 'power') {
      this.#score.add(CFG.SCORE.POWER);
      const dur = this.#lvlCfg.frightDur;
      this.#frightTimer = dur;
      this.#score.resetGhostMul();
      this.#ghosts.forEach(g => g.setFrightened(true));
      snd.power();
      snd.sirenStop();
      snd.frightStart();
    }

    // Bonus fruit — update every frame for smooth fade
    if (this.#bonus) {
      this.#bonus.update();
      if (this.#bonus.alive) {
        const dist = Math.hypot(this.#bonus.x - this.#pac.x, this.#bonus.y - this.#pac.y);
        if (dist < CFG.TILE * .8) {
          const def = this.#bonus.def, pts = def.basePoints * def.mult;
          this.#score.add(pts);
          this.#popups.push(new ScorePopup(this.#bonus.x, this.#bonus.y, pts, def.mult > 1));
          this.#bonus.collect();
          HUD.setActiveFruit(null);
          snd.fruit(def.id === 'peach');
        }
      } else if (!this.#bonus.collected && this.#bonus.doneRendering) {
        // Timed out AND fade finished — clear HUD and remove
        HUD.setActiveFruit(null);
        this.#bonus = null;
      } else if (this.#bonus.collected && this.#bonus.doneRendering) {
        // Collected AND fade finished — remove
        this.#bonus = null;
      } else if (!this.#bonus.collected && !this.#bonus.alive && !this.#bonus.doneRendering) {
        // Timer hit zero but still fading — keep rendering, clear HUD once
        // HUD already cleared when timer hits 0 (handled below on first tick)
      }
      // Clear HUD the frame the timer expires
      if (this.#bonus && !this.#bonus.alive && !this.#bonus.collected) {
        HUD.setActiveFruit(null);
      }
    }

    // Ghost updates
    this.#ghosts.forEach(g =>
      g.update(this.#maze, this.#pac, this.#ghosts, this.#frame, this.#scatterMode)
    );

    // Ghost collision
    for (const ghost of this.#ghosts) {
      const dist = Math.hypot(ghost.x - this.#pac.x, ghost.y - this.#pac.y);
      if (dist >= CFG.TILE * .75) continue;

      if (ghost.frightened) {
        const pts = this.#score.ghostEaten();
        ghost.setEaten();
        this.#popups.push(new ScorePopup(ghost.x, ghost.y, pts));
        snd.ghost(this.#score.ghostMul);
        const anyFrightened = this.#ghosts.some(g => g.frightened);
        if (!anyFrightened) { snd.frightStop(); snd.sirenStart(); }
      } else if (!ghost.eaten && !ghost.inHouse) {
        snd.sirenStop(); snd.frightStop();
        this.#setState(STATE.DYING);
        this.#deathTimer  = CFG.DEATH_FRAMES;
        this.#pac.deathFrame = 0;
        HUD.setReady(false);
        snd.death();
        return;
      }
    }

    // ── LEVEL CLEAR ──────────────────────────────────────
    // When all dots eaten: stop sounds, play fanfare, flash maze, then auto-advance
    if (this.#maze.cleared) {
      snd.sirenStop(); snd.frightStop();
      snd.levelClear();
      this.#setState(STATE.LEVELCLEAR);
      this.#levelClearTimer = CFG.LEVELCLEAR_FLASH * 4; // ~4s total (flash + pause)
      this.#bonus = null;
      HUD.setActiveFruit(null);
    }
  }

  // ── FRUIT SPAWN ───────────────────────────────────────
  #checkFruitSpawn() {
    const T = CFG.TILE, spawnX = 10*T + T/2, spawnY = 16*T + T/2;
    if (!this.#fruit1Spawned && this.#dotEatenCount >= 70) {
      this.#fruit1Spawned = true;
      this.#spawnFruit(spawnX, spawnY);
    } else if (!this.#fruit2Spawned && this.#dotEatenCount >= 170) {
      this.#fruit2Spawned = true;
      this.#spawnFruit(spawnX, spawnY);
    }
  }

  #spawnFruit(x, y) {
    const def = fruitForLevel(this.#level);
    this.#bonus = new BonusFruit(def, x, y, this.#lvlCfg.fruitDuration);
    HUD.setActiveFruit(def);
  }

  // ── DEATH / GAME OVER ─────────────────────────────────
  #handleDeath() {
    this.#lives--;
    HUD.setLives(this.#lives);
    if (this.#lives <= 0) {
      this.#triggerGameOver();
    } else {
      this.#initLevel();
    }
  }

  #triggerGameOver() {
    this.#setState(STATE.GAMEOVER);
    snd.sirenStop(); snd.frightStop();
    HUD.setFinalScore(this.#score.score);
    const msgs = TRIBUTE.gameoverMessages;
    HUD.setGameOverMsg(msgs[Math.floor(Math.random() * msgs.length)]);
    HUD.show('overlay-gameover');
  }

  // ── DRAW ──────────────────────────────────────────────
  #draw() {
    const ctx = this.#ctx;
    ctx.fillStyle = '#000008';
    ctx.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
    this.#maze.draw(ctx, this.#frame);

    if (this.#state !== STATE.IDLE && this.#state !== STATE.GAMEOVER) {
      const dying = this.#state === STATE.DYING;
      if (!dying || this.#pac.deathFrame < 75) this.#pac.draw(ctx, this.#frame, dying);
      this.#bonus?.draw(ctx, this.#frame);
      this.#ghosts.forEach(g => g.draw(ctx, this.#frame, this.#frightTimer));
      this.#popups.forEach(p => p.draw(ctx));
    }

    // BABS watermark — subtle pulse during play
    if (this.#state === STATE.PLAYING) {
      const cycle = this.#frame % 700;
      if (cycle < 140) {
        const alpha = Math.sin((cycle/140) * Math.PI) * .055;
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFAB76'; ctx.font = 'bold 18px "Press Start 2P"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('B A B S', this.#canvas.width/2, this.#canvas.height/2 - 10);
        ctx.font = '12px "Playfair Display"'; ctx.fillStyle = '#FFD4B0';
        ctx.fillText('Georgia Peach 🍑', this.#canvas.width/2, this.#canvas.height/2 + 14);
        ctx.restore();
      }
    }

    // Level clear "LEVEL CLEAR" text during flash sequence
    if (this.#state === STATE.LEVELCLEAR && this.#levelClearTimer > CFG.LEVELCLEAR_FLASH * 2) {
      const alpha = Math.min(1, (this.#levelClearTimer - CFG.LEVELCLEAR_FLASH*2) / 40);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFD700'; ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 20;
      ctx.font = 'bold 14px "Press Start 2P"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LEVEL CLEAR!', this.#canvas.width/2, this.#canvas.height/2);
      ctx.restore();
    }
  }

  // ── INPUT ─────────────────────────────────────────────
  #bindInput() {
    const keyMap = new Map([
      ['ArrowLeft',[-1,0]], ['a',[-1,0]], ['ArrowRight',[1,0]], ['d',[1,0]],
      ['ArrowUp',[0,-1]],   ['w',[0,-1]], ['ArrowDown',[0,1]],  ['s',[0,1]],
    ]);
    const tryStart = () => {
      if (this.#state === STATE.IDLE || this.#state === STATE.GAMEOVER) this.startGame();
    };
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { tryStart(); return; }
      if (e.key === 'm' || e.key === 'M') {
        const muted = snd.toggleMute(); HUD.setMuteBtn(muted); return;
      }
      if (this.#state !== STATE.PLAYING) return;
      const dir = keyMap.get(e.key);
      if (dir) { const [dx,dy] = dir; this.#pac.setDir(dx, dy); e.preventDefault(); }
    });

    document.getElementById('mute-btn')?.addEventListener('click', () => {
      const muted = snd.toggleMute(); HUD.setMuteBtn(muted);
    });

    Object.entries({'dpad-up':[0,-1],'dpad-down':[0,1],'dpad-left':[-1,0],'dpad-right':[1,0]})
      .forEach(([id,[dx,dy]]) => {
        document.getElementById(id)?.addEventListener('touchstart', e => {
          e.preventDefault(); tryStart();
          if (this.#state === STATE.PLAYING) this.#pac.setDir(dx, dy);
        }, {passive:false});
      });

    let sx = 0, sy = 0;
    this.#canvas.addEventListener('touchstart', e => {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; tryStart();
    }, {passive:true});
    this.#canvas.addEventListener('touchend', e => {
      if (this.#state !== STATE.PLAYING) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      Math.abs(dx) > Math.abs(dy)
        ? this.#pac.setDir(dx > 0 ? 1 : -1, 0)
        : this.#pac.setDir(0, dy > 0 ? 1 : -1);
    }, {passive:true});
  }

  toggleMute() { const m = snd.toggleMute(); HUD.setMuteBtn(m); return m; }
}

// ══════════════════════════════════════════════════════
//  SPLASH + BOOT
// ══════════════════════════════════════════════════════
const splash = document.getElementById('splash');
const dismissSplash = () => {
  splash.classList.add('fade-out');
  setTimeout(() => splash.classList.add('gone'), 800);
};
setTimeout(dismissSplash, 5000);
splash.addEventListener('click', dismissSplash, {once:true});
document.addEventListener('keydown', dismissSplash, {once:true});

const game = new Game('canvas');
window.__babs__ = game;
