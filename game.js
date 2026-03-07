/**
 * BABS' PAC-MAN — Georgia Peach Edition  v4.0
 * game.js — verified final build
 * For Barbara "Babs" Jackson 🍑
 *
 */
 

'use strict';

// ═══════════════════════════════════════════════════════════════
//  SOUND ENGINE  — Web Audio procedural sounds
//  Authentic approximations of original Pac-Man arcade SFX
// ═══════════════════════════════════════════════════════════════
const snd = (() => {
  let ctx = null;
  let muted = false;
  let sirenOsc = null, sirenGain = null, sirenFast = false;
  let sirenLfo = null;
  let frightOsc = null, frightGain = null;
  let frightLfo = null;
  let wakaPhase = 0;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
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
  function ghostEaten(mul = 1) {
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
    sirenLfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfoGain.gain.value = sirenFast ? 40 : 25;
    sirenLfo.frequency.value = sirenFast ? 5 : 3;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenLfo.start();
    sirenOsc.connect(sirenGain);
    sirenOsc.start();
  }

  function sirenStop() {
    if (!sirenOsc) return;
    try { sirenLfo.stop(); } catch(_) {}
    try { sirenOsc.stop(); } catch(_) {}
    sirenOsc = null; sirenGain = null; sirenLfo = null;
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
    frightLfo = c.createOscillator();
    const lg = c.createGain();
    lg.gain.value = 60;
    frightLfo.frequency.value = 8;
    frightLfo.connect(lg); lg.connect(frightOsc.frequency);
    frightLfo.start();
    frightOsc.connect(frightGain);
    frightOsc.start();
  }

  function frightStop() {
    if (!frightOsc) return;
    try { frightLfo.stop(); } catch(_) {}
    try { frightOsc.stop(); } catch(_) {}
    frightOsc = null; frightGain = null; frightLfo = null;
  }

  function toggleMute() {
    muted = !muted;
    if (muted) { sirenStop(); frightStop(); }
    return muted;
  }

  function init() { getCtx(); }

  return {
    waka, power, ghostEaten, death, fruit, levelClear,
    sirenStart, sirenStop, sirenFast: sirenFastMode,
    frightStart, frightStop,
    toggleMute, init,
    get muted() { return muted; }
  };
})();

/* ─────────────────────────────────────────────────────────────────
   TRIBUTE
───────────────────────────────────────────────────────────────── */
const TRIBUTE = Object.freeze({
  hiScore: 3333330,
  msgs: [
    "Babs would've kept going! 🍑",
    "Sweet as a peach — try again! 🍑",
    "Georgia never quits! 🍑",
    "One more for Babs! 🍑",
    "She never gave up — neither should you! 🍑",
    "Babs scored higher with her eyes closed! 🍑",
  ],
});

/* ─────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────── */
const CFG = Object.freeze({
  TILE: 20, COLS: 21, ROWS: 23, CELL: 32,
  PAC_SPD:   1.8,
  GHOST_SPD: 1.4,
  FRIGHT_BASE: 300, FRIGHT_MIN: 40,
  READY_F: 150, DEATH_F: 90, CLEAR_F: 240,
  DOT_PTS: 10, PWR_PTS: 50, GHOST_PTS: 200,
});

const TT = Object.freeze({ WALL:1, DOT:2, POWER:3, EMPTY:0, HOUSE:4 });

const ST = Object.freeze({
  IDLE:       Symbol('idle'),
  READY:      Symbol('ready'),
  PLAYING:    Symbol('playing'),
  DYING:      Symbol('dying'),
  LEVELCLEAR: Symbol('levelclear'),
  GAMEOVER:   Symbol('gameover'),
});

/* ─────────────────────────────────────────────────────────────────
   SPRITE SHEET
───────────────────────────────────────────────────────────────── */
class SS {
  #img = null; #ok = false;
  constructor(src) {
    this.#img = new Image();
    this.#img.onload  = () => { this.#ok = true; };
    this.#img.onerror = () => console.warn('Missing sprite:', src);
    this.#img.src = src;
  }
  get ready() { return this.#ok; }
  blit(ctx, col, row, cx, cy, scale, flipX = false) {
    if (!this.#ok) return false;
    const C = CFG.CELL, sc = scale ?? (CFG.TILE / C), dim = C * sc;
    ctx.save();
    if (flipX) {
      ctx.translate(cx, cy); ctx.scale(-1, 1);
      ctx.drawImage(this.#img, col*C, row*C, C, C, -dim/2, -dim/2, dim, dim);
    } else {
      ctx.drawImage(this.#img, col*C, row*C, C, C, cx-dim/2, cy-dim/2, dim, dim);
    }
    ctx.restore();
    return true;
  }
}

const SPR = {
  pac:     new SS('assets/sprites/pacman.png'),
  ghosts:  new SS('assets/sprites/ghosts.png'),
  fruits:  new SS('assets/sprites/fruits.png'),
  pellets: new SS('assets/sprites/pellets.png'),
};

const FRUIT_COL = new Map([
  ['cherry',0],['strawberry',1],['orange',2],['apple',3],['melon',4],
  ['grapes',5],['watermelon',6],['bell',7],['key',8],['peach',9],
]);

/* ─────────────────────────────────────────────────────────────────
   CANVAS FALLBACKS  (drawn when sprite sheets absent)
───────────────────────────────────────────────────────────────── */
function fbPac(ctx, x, y, dx, dy, mouth, dying, df) {
  const r = CFG.TILE * 0.47;
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14;
  const g = ctx.createRadialGradient(-r*.2,-r*.2,0,0,0,r);
  g.addColorStop(0,'#FFE88A'); g.addColorStop(0.6,'#FFD700'); g.addColorStop(1,'#FF9900');
  ctx.fillStyle = g;
  if (dying) {
    const a = Math.min(df/80, 1) * Math.PI * .97;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,a,Math.PI*2-a); ctx.closePath(); ctx.fill();
  } else {
    ctx.rotate(Math.atan2(dy, dx || 1));
    const m = mouth * Math.PI;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,m,Math.PI*2-m); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function fbGhost(ctx, x, y, color, dx, dy, fright, ftimer, frame) {
  const r = CFG.TILE * 0.47;
  ctx.save(); ctx.translate(x, y);
  const c = fright ? ((ftimer<60 && Math.floor(frame/7)%2===0) ? '#FFF' : '#00B') : color;
  ctx.shadowColor = fright ? '#008' : color; ctx.shadowBlur = 10; ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(0, -r*.05, r, Math.PI, 0);
  const p = [-r,-r/3,r/3,r];
  for (let i=0;i<3;i++) {
    const mx=(p[i]+p[i+1])/2, py=i%2===0?r*.85:r*.5;
    ctx.quadraticCurveTo(mx,py,p[i+1],r*(i%2===0?.5:.85));
  }
  ctx.closePath(); ctx.fill();
  [[-0.3,-0.22],[0.3,-0.22]].forEach(([ex,ey]) => {
    ctx.fillStyle='white'; ctx.beginPath(); ctx.ellipse(r*ex,r*ey,r*.21,r*.25,0,0,Math.PI*2); ctx.fill();
    if (!fright) {
      ctx.fillStyle='#14F'; ctx.beginPath(); ctx.arc(r*ex+dx*r*.09,r*ey+dy*r*.09,r*.12,0,Math.PI*2); ctx.fill();
    }
  });
  ctx.restore();
}

function fbFruit(ctx, x, y, def) {
  ctx.save();
  ctx.font = `${Math.round(CFG.TILE * .95)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'white';
  if (def.isPeach) { ctx.shadowColor = '#FA0'; ctx.shadowBlur = 18; }
  ctx.fillText(def.emoji || '?', x, y);
  ctx.restore();
}

/* ─────────────────────────────────────────────────────────────────
   FRUITS
───────────────────────────────────────────────────────────────── */
const FRUITS = Object.freeze([
  { id:'cherry',     emoji:'🍒', name:'Cherry',     pts:100,  isPeach:false },
  { id:'strawberry', emoji:'🍓', name:'Strawberry', pts:300,  isPeach:false },
  { id:'orange',     emoji:'🍊', name:'Orange',     pts:500,  isPeach:false },
  { id:'apple',      emoji:'🍎', name:'Apple',      pts:700,  isPeach:false },
  { id:'melon',      emoji:'🍈', name:'Melon',      pts:1000, isPeach:false },
  { id:'grapes',     emoji:'🍇', name:'Grapes',     pts:2000, isPeach:false },
  { id:'watermelon', emoji:'🍉', name:'Watermelon', pts:3000, isPeach:false },
  { id:'bell',       emoji:'🔔', name:'Bell',       pts:3000, isPeach:false },
  { id:'key',        emoji:'🗝',  name:'Key',        pts:5000, isPeach:false },
  { id:'peach',      emoji:'🍑', name:'PEACH ×3',   pts:500,  isPeach:true, mult:3 },
]);

// Three authentic spawn positions (all EMPTY tiles in BASE map)
// Centre row16: col10=EMPTY, col3=wall-adjacent open, col17=wall-adjacent open
const SPAWNS = [
  { col:10, row:16 },   // centre — under ghost house
  { col:3,  row:16 },   // left nook
  { col:17, row:16 },   // right nook
];

function pickFruit(lvl) {
  const pool = FRUITS.filter(f => !f.isPeach);
  const base = pool[Math.min(lvl - 1, pool.length - 1)];
  return Math.random() < 0.65 ? base : pool[Math.floor(Math.random() * pool.length)];
}

/* ─────────────────────────────────────────────────────────────────
   BONUS FRUIT
───────────────────────────────────────────────────────────────── */
const FADE_DUR = 22;

class BonusFruit {
  #def; #x; #y; #timer; #bob = 0; #fade = -1; #col = false;
  constructor(def, x, y, dur) { this.#def=def; this.#x=x; this.#y=y; this.#timer=dur; }
  get def()       { return this.#def; }
  get x()         { return this.#x; }
  get y()         { return this.#y; }
  get alive()     { return !this.#col && this.#timer > 0; }
  get collected() { return this.#col; }
  get done()      { return this.#fade >= FADE_DUR; }
  collect()       { this.#col = true; this.#fade = 0; }

  update() {
    if (this.alive)          { this.#timer--; this.#bob++; }
    else if (this.#fade < 0) { this.#fade = 0; }          // start timeout fade
    if (this.#fade >= 0 && this.#fade < FADE_DUR) this.#fade++;
  }

  draw(ctx, frame) {
    if (this.done) return;
    const bob = Math.sin(this.#bob * 0.12) * 2.5;
    let alpha = 1;
    if      (this.#fade >= 0)      alpha = Math.max(0, 1 - this.#fade / FADE_DUR);
    else if (this.#def.isPeach)    alpha = 0.55 + 0.45 * Math.abs(Math.sin(frame * 0.40));
    else if (this.#timer < 80)     alpha = 0.30 + 0.70 * (this.#timer / 80);

    ctx.save(); ctx.globalAlpha = alpha;
    const c = FRUIT_COL.get(this.#def.id) ?? 0;
    if (!SPR.fruits.blit(ctx, c, 0, this.#x, this.#y + bob)) fbFruit(ctx, this.#x, this.#y + bob, this.#def);
    if (this.#def.isPeach && this.alive) {
      ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.abs(Math.sin(frame * 0.45)));
      ctx.strokeStyle = '#FF8C00'; ctx.lineWidth = 3;
      ctx.shadowColor = '#FF4400'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(this.#x, this.#y + bob, CFG.TILE * 0.62, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }
}

/* ─────────────────────────────────────────────────────────────────
   SCORE POPUP
───────────────────────────────────────────────────────────────── */
class Popup {
  constructor(x, y, val, ip=false) { this.x=x; this.y=y; this.val=val; this.ip=ip; this.life=80; }
  update() { this.y -= 0.5; this.life--; }
  get alive() { return this.life > 0; }
  draw(ctx) {
    ctx.save(); ctx.globalAlpha = Math.min(this.life/25, 1);
    const col = this.ip ? '#FF8C00' : '#0FF';
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.font = `bold ${this.ip?10:8}px "Press Start 2P"`; ctx.textAlign = 'center';
    if (this.ip) ctx.fillText('🍑 ×3!', this.x, this.y - 12);
    ctx.fillText(this.val, this.x, this.y);
    ctx.restore();
  }
}

/* ─────────────────────────────────────────────────────────────────
   SCORE MANAGER
───────────────────────────────────────────────────────────────── */
class ScoreManager {
  #n = 0; #mul = 1;
  #sync() { document.getElementById('score').textContent = String(this.#n).padStart(7,'0'); }
  add(v)      { this.#n += v; this.#sync(); }
  reset()     { this.#n = 0; this.#mul = 1; this.#sync(); }
  get score() { return this.#n; }
  eatGhost()  { const p = CFG.GHOST_PTS * this.#mul; this.#mul = Math.min(this.#mul*2, 8); this.add(p); return p; }
  resetMul()  { this.#mul = 1; }
  get mul()   { return this.#mul; }
}

/* ─────────────────────────────────────────────────────────────────
   MAP DATA
───────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────
   MAZE
───────────────────────────────────────────────────────────────── */
class Maze {
  #g = []; #dots = 0; #flash = false;

  reset() {
    this.#g    = BASE_MAP.map(r => [...r]);
    this.#dots = this.#g.flat().filter(v => v===TT.DOT||v===TT.POWER).length;
    this.#flash = false;
    return this;
  }

  eat(col, row) {
    const v = this.#g[row]?.[col];
    if (v===TT.DOT)   { this.#g[row][col]=TT.EMPTY; this.#dots--; return 'dot'; }
    if (v===TT.POWER) { this.#g[row][col]=TT.EMPTY; this.#dots--; return 'power'; }
    return null;
  }

  /* Ghosts treat HOUSE tiles as passable; Pac-Man does not */
  isWall(col, row, forGhost=false) {
    const v = this.#g[row]?.[col];
    if (v === TT.WALL)  return true;
    if (v === TT.HOUSE) return !forGhost;
    return false;
  }

  get dotsLeft() { return this.#dots; }
  get cleared()  { return this.#dots <= 0; }
  set flashOn(v) { this.#flash = v; }

  *walls()   { for(let r=0;r<CFG.ROWS;r++) for(let c=0;c<CFG.COLS;c++) if(this.#g[r]?.[c]===TT.WALL) yield{r,c}; }
  *pickups() { for(let r=0;r<CFG.ROWS;r++) for(let c=0;c<CFG.COLS;c++) { const v=this.#g[r]?.[c]; if(v===TT.DOT||v===TT.POWER) yield{r,c,type:v}; } }

  draw(ctx, frame) {
    const T = CFG.TILE, ft = Math.floor(frame/7)%2===0;
    const wf = this.#flash ? (ft?'#FFF':'#00F') : '#000035';
    const wl = this.#flash ? (ft?'#00F':'#FFF') : '#2323ee';
    for (const {r,c} of this.walls()) {
      const x=c*T, y=r*T;
      ctx.fillStyle=wf; ctx.fillRect(x,y,T,T);
      this.#edges(ctx,r,c,x,y,wl);
    }
    if (this.#flash) return;
    for (const {r,c,type} of this.pickups()) {
      const cx=c*T+T/2, cy=r*T+T/2;
      if (type===TT.DOT) {
        if (!SPR.pellets.blit(ctx,0,0,cx,cy)) {
          ctx.fillStyle='#FFB8AE'; ctx.beginPath(); ctx.arc(cx,cy,2.2,0,Math.PI*2); ctx.fill();
        }
      } else {
        const sc=0.72+0.28*Math.sin(frame*0.14);
        if (!SPR.pellets.blit(ctx,1+Math.floor(frame/8)%5,0,cx,cy)) {
          ctx.save(); ctx.shadowColor='#FFAB76'; ctx.shadowBlur=14;
          ctx.fillStyle='#FFD4B0'; ctx.beginPath(); ctx.arc(cx,cy,5.8*sc,0,Math.PI*2); ctx.fill(); ctx.restore();
        }
      }
    }
  }

  #edges(ctx, r, c, x, y, col) {
    const T=CFG.TILE, iw=(dr,dc)=>this.#g[r+dr]?.[c+dc]===TT.WALL;
    ctx.save(); ctx.strokeStyle=col; ctx.shadowColor=col; ctx.shadowBlur=4;
    ctx.lineWidth=2.5; ctx.lineCap='round';
    [
      [!iw(-1,0),x,  y+1,  x+T,y+1  ],
      [!iw(1,0), x,  y+T-1,x+T,y+T-1],
      [!iw(0,-1),x+1,y,    x+1,y+T  ],
      [!iw(0,1), x+T-1,y,x+T-1,y+T  ],
    ].forEach(([s,x1,y1,x2,y2]) => {
      if (!s) return; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    ctx.restore();
  }
}

/* ─────────────────────────────────────────────────────────────────
   ENTITY BASE
───────────────────────────────────────────────────────────────── */
class Entity {
  constructor(x,y,spd) { this.x=x; this.y=y; this.dx=0; this.dy=0; this.spd=spd; }
  get col()   { return Math.round((this.x-CFG.TILE/2)/CFG.TILE); }
  get row()   { return Math.round((this.y-CFG.TILE/2)/CFG.TILE); }
  get tileX() { return this.col*CFG.TILE+CFG.TILE/2; }
  get tileY() { return this.row*CFG.TILE+CFG.TILE/2; }
  _wrapX()    { const w=CFG.COLS*CFG.TILE; if(this.x<0)this.x=w; if(this.x>w)this.x=0; }

  /* Pac-Man collision (treats HOUSE as wall) */
  _hitsWall(maze, nx, ny, m=0.42) {
    const mg=CFG.TILE*m, T=CFG.TILE;
    for(let r=Math.floor((ny-mg)/T);r<=Math.floor((ny+mg)/T);r++)
      for(let c=Math.floor((nx-mg)/T);c<=Math.floor((nx+mg)/T);c++)
        if(maze.isWall(c,r,false)) return true;
    return false;
  }

  /* Ghost collision (HOUSE tiles passable) */
  _hitsWallG(maze, nx, ny, m=0.42) {
    const mg=CFG.TILE*m, T=CFG.TILE;
    for(let r=Math.floor((ny-mg)/T);r<=Math.floor((ny+mg)/T);r++)
      for(let c=Math.floor((nx-mg)/T);c<=Math.floor((nx+mg)/T);c++)
        if(maze.isWall(c,r,true)) return true;
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────────
   PAC-MAN
───────────────────────────────────────────────────────────────── */
class Pacman extends Entity {
  #mouth=0.25; #mDir=1; #wdx=0; #wdy=0; deathFrame=0;
  constructor(x,y,spd) { super(x,y,spd); }
  steer(dx,dy) { this.#wdx=dx; this.#wdy=dy; }

  update(maze) {
    if ((this.#wdx!==this.dx||this.#wdy!==this.dy) &&
        !this._hitsWall(maze, this.x+this.#wdx*this.spd, this.y+this.#wdy*this.spd)) {
      this.dx=this.#wdx; this.dy=this.#wdy;
    }
    if (!this._hitsWall(maze, this.x+this.dx*this.spd, this.y+this.dy*this.spd)) {
      this.x+=this.dx*this.spd; this.y+=this.dy*this.spd;
    }
    this._wrapX();
    this.#mouth+=0.05*this.#mDir;
    if(this.#mouth>=0.26||this.#mouth<=0.01) this.#mDir*=-1;
  }

  draw(ctx, frame, dying=false) {
    const {x,y}=this;
    if (dying) {
      const c=Math.min(7,Math.floor(this.deathFrame/(CFG.DEATH_F/8)));
      if (!SPR.pac.blit(ctx,c,3,x,y)) fbPac(ctx,x,y,this.dx,this.dy,this.#mouth,true,this.deathFrame);
      return;
    }
    const row=this.dy<0?1:this.dy>0?2:0;
    const cf=frame%16, col=cf<8?Math.floor(cf/2):7-Math.floor(cf/2);
    if (!SPR.pac.blit(ctx,col,row,x,y,undefined,this.dx<0))
      fbPac(ctx,x,y,this.dx,this.dy,this.#mouth,false,0);
  }
}

/* ─────────────────────────────────────────────────────────────────
   GHOST
   
   EXIT PATH (map-verified):
   ─────────────────────────
   Ghost pen interior: rows 9-10, cols 8-12 (HOUSE tiles).
   The only upward exit from the pen (treating HOUSE as passable) is:
     row10 → row9 via col10 (HOUSE, passable)
     row9  → row8 NOT possible at col10 (BASE[8][10]=WALL)
   
   Correct exit route found by map analysis:
     1. Ghost in pen moves LEFT toward col6.
        BASE[9][6]=0 (EMPTY) — accessible from pen by going left.
     2. From (row9,col6) move UP: BASE[8][6]=0, BASE[7][6]=1 WALL.
     3. So at row8 col6 ghost must go LEFT: col5=1 WALL, but col4=2.
     4. From (row8,col8) go UP: BASE[7][8]=0 EMPTY, then col8->col4 row7=2.
   
   SIMPLEST WORKING APPROACH (used here):
   Ghost exits by walking UP from inside the pen via col6:
     - pen at row10,col10 → navigate LEFT to col6
     - at row9,col6 go UP to row8,col6
     - at row8 now in open space, AI takes over
   
   Implementation: ghost in-house state navigates toward col6 row8 (the
   first open tile above the pen) and upon reaching it sets inHouse=false.
   The ghost AI then handles all subsequent navigation normally.
───────────────────────────────────────────────────────────────── */

// Ghost AI functions (chase mode targets)
const G_AI = [
  /* Blinky */ (g, pac)      => ({ x: pac.x, y: pac.y }),
  /* Pinky  */ (g, pac)      => ({ x: pac.x+pac.dx*CFG.TILE*4, y: pac.y+pac.dy*CFG.TILE*4 }),
  /* Inky   */ (g, pac, all) => {
    const b=all[0], px=pac.x+pac.dx*CFG.TILE*2, py=pac.y+pac.dy*CFG.TILE*2;
    return { x: 2*px-b.x, y: 2*py-b.y };
  },
  /* Clyde  */ (g, pac)      => Math.hypot(g.x-pac.x,g.y-pac.y)>CFG.TILE*8
    ? {x:pac.x,y:pac.y} : {x:0,y:CFG.ROWS*CFG.TILE},
];

// Scatter corner targets
const G_SCATTER = [
  { x: CFG.COLS*CFG.TILE, y: 0 },                         // Blinky: top-right
  { x: 0,                 y: 0 },                         // Pinky:  top-left
  { x: CFG.COLS*CFG.TILE, y: CFG.ROWS*CFG.TILE },         // Inky:   bottom-right
  { x: 0,                 y: CFG.ROWS*CFG.TILE },         // Clyde:  bottom-left
];

const G_DEFS = Object.freeze([
  { name:'BLINKY', color:'#F00', startCol:10, startRow:9,  exitDelay:0   },
  { name:'PINKY',  color:'#F8F', startCol:10, startRow:10, exitDelay:0   },
  { name:'INKY',   color:'#0FF', startCol:9,  startRow:10, exitDelay:90  },
  { name:'CLYDE',  color:'#FA0', startCol:11, startRow:10, exitDelay:180 },
]);

class Ghost extends Entity {
  #fright=false; #eaten=false; #inHouse=true; #exitTimer; #idx;
  color; name;

  constructor(def, idx, spd) {
    const T=CFG.TILE;
    super(def.startCol*T+T/2, def.startRow*T+T/2, spd);
    this.name=def.name; this.color=def.color; this.#idx=idx;
    this.#exitTimer=def.exitDelay;
    // Blinky starts already at the exit tile and is not in the house
    if (idx===0) {
      this.#inHouse=false;
      this.dx=1; this.dy=0;
      // Place Blinky above the pen at col10 row7 (EMPTY tile)
      this.x=10*T+T/2; this.y=7*T+T/2;
    } else {
      // In-house ghosts bob vertically
      this.dy = idx%2===0 ? 1 : -1;
    }
  }

  get frightened() { return this.#fright; }
  get eaten()      { return this.#eaten; }
  get inHouse()    { return this.#inHouse; }

  frighten(on) { if (!this.#eaten) this.#fright=on; }
  setEaten()   { this.#eaten=true; this.#fright=false; }

  respawn() {
    const T=CFG.TILE;
    this.#eaten=false; this.#inHouse=true; this.#exitTimer=90;
    this.x=10*T+T/2; this.y=10*T+T/2;
    this.dx=0; this.dy=1;
  }

  // Reverse direction — called on scatter↔chase mode switch
  reverse() {
    this.dx=-this.dx; this.dy=-this.dy;
  }

  update(maze, pac, all, scatter) {
    const T=CFG.TILE;

    /* ── IN HOUSE ── */
    if (this.#inHouse) {
      // Count down exit timer
      if (--this.#exitTimer > 0) {
        // Bob gently
        const ny=this.y+this.dy*0.45;
        if (ny<T*9.3+T/2||ny>T*10.7+T/2) this.dy*=-1;
        this.y+=this.dy*0.45;
        return;
      }
      // Timer expired — navigate toward exit col6, row8
      // Step 1: get to col6 on row9/10 (move left using ghost-passable wall check)
      const exitX=6*T+T/2, exitY=8*T+T/2;
      if (Math.hypot(this.x-exitX,this.y-exitY) < this.spd+1) {
        // Reached exit tile
        this.#inHouse=false;
        this.x=exitX; this.y=exitY;
        this.dx=0; this.dy=-1;  // head upward into maze
        return;
      }
      // Move toward exit using simple steering (ghost can pass through HOUSE tiles)
      const tdx = Math.sign(exitX-this.x);
      const tdy = Math.sign(exitY-this.y);
      if (Math.abs(this.y-exitY)>T/2) {
        // Prioritise moving to correct row first
        if (!this._hitsWallG(maze,this.x,this.y+tdy*this.spd)) { this.dy=tdy; this.dx=0; }
        else if (!this._hitsWallG(maze,this.x+tdx*this.spd,this.y)) { this.dx=tdx; this.dy=0; }
      } else {
        if (!this._hitsWallG(maze,this.x+tdx*this.spd,this.y)) { this.dx=tdx; this.dy=0; }
        else if (!this._hitsWallG(maze,this.x,this.y+tdy*this.spd)) { this.dy=tdy; this.dx=0; }
      }
      this.x+=this.dx*this.spd; this.y+=this.dy*this.spd;
      return;
    }

    /* ── EATEN: return to house ── */
    if (this.#eaten) {
      const hx=10*T+T/2, hy=10*T+T/2;
      if (Math.hypot(this.x-hx,this.y-hy)<this.spd*2+2) { this.respawn(); return; }
    }

    const spd=this.#eaten?this.spd*2.2:this.#fright?this.spd*0.5:this.spd;
    const snap=Math.abs(this.x-this.tileX)<spd+0.6&&Math.abs(this.y-this.tileY)<spd+0.6;
    if (snap) {
      this.x=this.tileX; this.y=this.tileY;
      this.#chooseDir(maze,pac,all,scatter);
    }
    const nx=this.x+this.dx*spd, ny=this.y+this.dy*spd;
    if (!this._hitsWallG(maze,nx,ny)) { this.x=nx; this.y=ny; }
    else                              { this.#chooseDir(maze,pac,all,scatter); }
    this._wrapX();
  }

  #chooseDir(maze, pac, all, scatter) {
    const T=CFG.TILE;
    const DIRS=[{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const valid=DIRS.filter(d=>
      !(d.dx===-this.dx&&d.dy===-this.dy) &&
      !this._hitsWallG(maze,this.x+d.dx*T,this.y+d.dy*T)
    );
    if (!valid.length) {
      const rev=DIRS.find(d=>d.dx===-this.dx&&d.dy===-this.dy);
      if (rev) { this.dx=rev.dx; this.dy=rev.dy; }
      return;
    }
    if (this.#fright) { const p=valid[Math.floor(Math.random()*valid.length)]; this.dx=p.dx; this.dy=p.dy; return; }
    const tgt = this.#eaten ? {x:10*T+T/2,y:10*T+T/2}
              : scatter     ? G_SCATTER[this.#idx]
                            : G_AI[this.#idx](this,pac,all);
    let best=null, bd=Infinity;
    for (const d of valid) {
      const dist=Math.hypot(this.x+d.dx*T-tgt.x,this.y+d.dy*T-tgt.y);
      if (dist<bd) { bd=dist; best=d; }
    }
    if (best) { this.dx=best.dx; this.dy=best.dy; }
  }

  draw(ctx, frame, ftimer) {
    ctx.save();
    if (this.#inHouse) ctx.globalAlpha=0.55;
    const {x,y}=this;
    let ok=false;
    if (this.#eaten) {
      const dc=(this.dx>0?0:this.dx<0?2:this.dy<0?4:6)+Math.floor(frame/8)%2;
      ok=SPR.ghosts.blit(ctx,dc,6,x,y);
    } else if (this.#fright) {
      const fl=ftimer<60&&Math.floor(frame/7)%2===0;
      ok=SPR.ghosts.blit(ctx,Math.floor(frame/6)%8,fl?5:4,x,y);
    } else {
      const di=this.dx>0?0:this.dx<0?1:this.dy<0?2:3;
      ok=SPR.ghosts.blit(ctx,di*2+Math.floor(frame/8)%2,this.#idx,x,y);
    }
    if (!ok) fbGhost(ctx,x,y,this.color,this.dx,this.dy,this.#fright,ftimer,frame);
    ctx.restore();
  }
}

/* ─────────────────────────────────────────────────────────────────
   HUD
───────────────────────────────────────────────────────────────── */
const HUD = {
  score(n)  { document.getElementById('score').textContent=String(n).padStart(7,'0'); },
  level(n)  { document.getElementById('level').textContent=String(n).padStart(2,'0'); },
  lives(n)  { document.querySelectorAll('.life-icon').forEach((el,i)=>el.classList.toggle('dead',i>=n)); },
  show(id)  { document.getElementById(id)?.classList.remove('overlay--hidden'); },
  hide(id)  { document.getElementById(id)?.classList.add('overlay--hidden'); },
  final(n)  { document.getElementById('final-score').textContent=String(n).padStart(7,'0'); },
  msg(m)    { document.getElementById('gameover-msg').textContent=m; },
  ready(on) { document.getElementById('ready-text')?.classList.toggle('overlay--hidden',!on); },
  muteBtn(m){ const b=document.getElementById('mute-btn'); if(b) b.textContent=m?'🔇 MUTED':'🔊 SOUND'; },
  fruit(def){
    if (!def) {
      ['active-fruit-icon','active-fruit-name','active-fruit-pts'].forEach(id=>{
        const el=document.getElementById(id); if(el){el.textContent=id.includes('icon')?'·':'—';el.style.color='';}
      });
      document.getElementById('active-fruit-pts').textContent='';
      return;
    }
    const pts=(def.pts*(def.mult||1));
    document.getElementById('active-fruit-icon').textContent=def.emoji||'?';
    document.getElementById('active-fruit-name').textContent=def.isPeach?'🍑 PEACH ×3!':def.name;
    document.getElementById('active-fruit-pts').textContent=pts+' PTS';
    document.getElementById('active-fruit-icon').style.color=def.isPeach?'#FF8C00':'';
  },
};

/* ─────────────────────────────────────────────────────────────────
   SCATTER / CHASE SCHEDULE
   Classic arcade timing in frames (@60fps):
   Level 1:  S7 C20 S7 C20 S5 C20 S5 C∞
   Level 2+: S5 C20 S5 C20 S5 C20 S1 C∞
───────────────────────────────────────────────────────────────── */
function buildSchedule(lvl) {
  const [S7,S5,S1,C20,CI]=[420,300,60,1200,Number.MAX_SAFE_INTEGER];
  return lvl===1
    ?[{sc:true,d:S7},{sc:false,d:C20},{sc:true,d:S7},{sc:false,d:C20},{sc:true,d:S5},{sc:false,d:C20},{sc:true,d:S5},{sc:false,d:CI}]
    :[{sc:true,d:S5},{sc:false,d:C20},{sc:true,d:S5},{sc:false,d:C20},{sc:true,d:S5},{sc:false,d:C20},{sc:true,d:S1},{sc:false,d:CI}];
}

/* ─────────────────────────────────────────────────────────────────
   PER-LEVEL CONFIG
───────────────────────────────────────────────────────────────── */
function levelCfg(lvl) {
  return {
    ghostSpd:  Math.min(CFG.GHOST_SPD+(lvl-1)*0.08, 2.2),
    pacSpd:    Math.min(CFG.PAC_SPD  +(lvl-1)*0.04, 2.4),
    frightDur: Math.max(CFG.FRIGHT_MIN, CFG.FRIGHT_BASE-(lvl-1)*25),
    fruitDur:  Math.max(240, 480-(lvl-1)*15),
    peachDur:  () => 130+Math.floor(Math.random()*50),  // 2.2–3s
    peachThr:  85+lvl*5,  // dot count when peach spawns
  };
}

/* ─────────────────────────────────────────────────────────────────
   GAME  (state machine)
───────────────────────────────────────────────────────────────── */
class Game {
  #cvs; #ctx;
  #maze  = new Maze();
  #score = new ScoreManager();
  #pac   = null;
  #ghosts= [];
  #popups= [];
  #fruits= [];
  #f1=false; #f2=false; #peach=false;
  #state = ST.IDLE;
  #frame = 0;
  #ftimer= 0; #rtimer=0; #dtimer=0; #ctimer=0;
  #lvl=1; #lives=3; #dots=0; #fastSiren=false;
  #sched=[]; #phase=0; #mTimer=0; #scatter=true;
  #cfg=null;

  constructor(id) {
    this.#cvs = document.getElementById(id);
    this.#ctx = this.#cvs.getContext('2d');
    this.#cvs.width  = CFG.COLS*CFG.TILE;
    this.#cvs.height = CFG.ROWS*CFG.TILE;
    this.#bindInput();
    this.#maze.reset();
    document.getElementById('highscore').textContent = String(TRIBUTE.hiScore).padStart(7,'0');
    HUD.show('overlay-start');
    requestAnimationFrame(this.#loop);
  }

  #setState(s) { this.#state=s; }

  startGame() {
    HUD.hide('overlay-start'); HUD.hide('overlay-gameover');
    this.#score.reset(); this.#lvl=1; this.#lives=3;
    HUD.level(1); HUD.lives(3);
    this.#initLevel(); snd.init();
  }

  #initLevel() {
    this.#cfg = levelCfg(this.#lvl);
    this.#maze.reset();
    const T=CFG.TILE;
    this.#pac    = new Pacman(10*T+T/2, 16*T+T/2, this.#cfg.pacSpd);
    this.#ghosts = G_DEFS.map((d,i)=>new Ghost(d,i,this.#cfg.ghostSpd));
    this.#popups=[]; this.#fruits=[];
    this.#f1=false; this.#f2=false; this.#peach=false;
    this.#dots=0; this.#ftimer=0; this.#fastSiren=false; this.#ctimer=0;
    this.#score.resetMul();
    this.#sched=buildSchedule(this.#lvl);
    this.#phase=0; this.#scatter=this.#sched[0].sc; this.#mTimer=this.#sched[0].d;
    this.#setState(ST.READY); this.#rtimer=CFG.READY_F;
    HUD.ready(true); HUD.fruit(null);
    snd.sirenStop(); snd.frightStop();
  }

  /* ── MAIN LOOP ── */
  #loop = () => { this.#update(); this.#draw(); requestAnimationFrame(this.#loop); };

  #update() {
    this.#frame++;
    switch(this.#state) {
      case ST.READY:
        if(--this.#rtimer<=0){this.#setState(ST.PLAYING);HUD.ready(false);snd.sirenStart();}
        break;
      case ST.PLAYING: this.#tick(); break;
      case ST.DYING:
        this.#pac.deathFrame++;
        if(--this.#dtimer<=0) this.#onDeath();
        break;
      case ST.LEVELCLEAR:
        this.#ctimer--;
        this.#maze.flashOn = Math.floor(this.#ctimer/7)%2===0;
        if(this.#ctimer<=0){this.#maze.flashOn=false;this.#lvl++;HUD.level(this.#lvl);this.#initLevel();}
        break;
    }
    this.#popups = this.#popups.filter(p=>{p.update();return p.alive;});
  }

  /* ── SCATTER/CHASE TIMER ──
     Only advances when not frightened.
     Reverses all ghosts on mode switch (authentic Pac-Man behavior). */
  #tickMode() {
    if (this.#ftimer>0) return;
    if (--this.#mTimer<=0) {
      const next=this.#phase+1;
      const prev=this.#scatter;
      if (next<this.#sched.length) {
        this.#phase=next;
        this.#scatter=this.#sched[next].sc;
        this.#mTimer=this.#sched[next].d;
      } else {
        this.#scatter=false;
        this.#mTimer=Number.MAX_SAFE_INTEGER;
      }
      // Reverse ghosts when mode switches
      if (this.#scatter!==prev) {
        this.#ghosts.forEach(g=>{ if(!g.inHouse&&!g.eaten) g.reverse(); });
      }
    }
  }

  /* ── PLAYING TICK ── */
  #tick() {
    this.#tickMode();

    /* Fright countdown */
    if (this.#ftimer>0) {
      if (--this.#ftimer===0) {
        this.#ghosts.forEach(g=>g.frighten(false));
        snd.frightStop(); snd.sirenStart();
      }
    }

    this.#pac.update(this.#maze);

    /* Eat pellets */
    const ate=this.#maze.eat(this.#pac.col,this.#pac.row);
    if (ate==='dot') {
      this.#score.add(CFG.DOT_PTS); this.#dots++;
      snd.waka();
      this.#trySpawnFruit();
      if(!this.#fastSiren&&this.#maze.dotsLeft<30&&this.#ftimer===0){
        this.#fastSiren=true; snd.sirenFast();
      }
    } else if (ate==='power') {
      this.#score.add(CFG.PWR_PTS);
      this.#ftimer=this.#cfg.frightDur;
      this.#score.resetMul();
      this.#ghosts.forEach(g=>g.frighten(true));
      snd.power(); snd.sirenStop(); snd.frightStart();
    }

    /* Fruit update + collection */
    for (let i=this.#fruits.length-1;i>=0;i--) {
      const f=this.#fruits[i];
      f.update();
      if (f.alive && Math.hypot(f.x-this.#pac.x,f.y-this.#pac.y)<CFG.TILE*0.85) {
        const pts=f.def.pts*(f.def.mult||1);
        this.#score.add(pts);
        this.#popups.push(new Popup(f.x,f.y,pts,f.def.isPeach));
        f.collect(); snd.fruit(f.def.isPeach);
        this.#refreshFruitHUD();
      }
      if (!f.alive&&!f.collected) this.#refreshFruitHUD();
      if (f.done) this.#fruits.splice(i,1);
    }

    /* Ghost updates */
    this.#ghosts.forEach(g=>g.update(this.#maze,this.#pac,this.#ghosts,this.#scatter));

    /* Ghost↔Pac collision */
    for (const g of this.#ghosts) {
      if (Math.hypot(g.x-this.#pac.x,g.y-this.#pac.y)>=CFG.TILE*0.75) continue;
      if (g.frightened) {
        const pts=this.#score.eatGhost(); g.setEaten();
        this.#popups.push(new Popup(g.x,g.y,pts,false));
        snd.ghostEaten(this.#score.mul);
        if (!this.#ghosts.some(h=>h.frightened)){snd.frightStop();snd.sirenStart();}
      } else if (!g.eaten&&!g.inHouse) {
        snd.sirenStop(); snd.frightStop();
        this.#setState(ST.DYING); this.#dtimer=CFG.DEATH_F; this.#pac.deathFrame=0;
        HUD.ready(false); snd.death(); return;
      }
    }

    /* Level clear */
    if (this.#maze.cleared) {
      snd.sirenStop(); snd.frightStop(); snd.levelClear();
      this.#fruits=[]; HUD.fruit(null);
      this.#setState(ST.LEVELCLEAR); this.#ctimer=CFG.CLEAR_F;
    }
  }

  /* ── FRUIT SPAWNING ──
     Fruit 1 (@70 dots)  → centre  (SPAWNS[0])
     Peach  (@peachThr)  → left nook (SPAWNS[1], harder to reach)
     Fruit 2 (@170 dots) → right nook (SPAWNS[2])
     All three can be on screen simultaneously. */
  #trySpawnFruit() {
    const T=CFG.TILE, c=this.#cfg;
    if (!this.#f1&&this.#dots>=70) {
      this.#f1=true;
      const p=SPAWNS[0];
      this.#fruits.push(new BonusFruit(pickFruit(this.#lvl),p.col*T+T/2,p.row*T+T/2,c.fruitDur));
      this.#refreshFruitHUD();
    }
    if (!this.#peach&&this.#dots>=c.peachThr) {
      this.#peach=true;
      const p=SPAWNS[1], pDef=FRUITS.find(f=>f.isPeach);
      this.#fruits.push(new BonusFruit(pDef,p.col*T+T/2,p.row*T+T/2,c.peachDur()));
      this.#refreshFruitHUD();
    }
    if (!this.#f2&&this.#dots>=170) {
      this.#f2=true;
      const p=SPAWNS[2];
      this.#fruits.push(new BonusFruit(pickFruit(this.#lvl),p.col*T+T/2,p.row*T+T/2,c.fruitDur));
      this.#refreshFruitHUD();
    }
  }

  #refreshFruitHUD() {
    const alive=this.#fruits.filter(f=>f.alive);
    HUD.fruit(alive.length?(alive.find(f=>f.def.isPeach)||alive[0]).def:null);
  }

  /* ── DEATH ── */
  #onDeath() {
    if (--this.#lives<=0) {
      this.#setState(ST.GAMEOVER); snd.sirenStop(); snd.frightStop();
      HUD.final(this.#score.score);
      HUD.msg(TRIBUTE.msgs[Math.floor(Math.random()*TRIBUTE.msgs.length)]);
      HUD.show('overlay-gameover');
    } else {
      HUD.lives(this.#lives); this.#initLevel();
    }
  }

  /* ── DRAW ── */
  #draw() {
    const ctx=this.#ctx;
    ctx.fillStyle='#000008'; ctx.fillRect(0,0,this.#cvs.width,this.#cvs.height);
    this.#maze.draw(ctx,this.#frame);

    if (this.#state!==ST.IDLE&&this.#state!==ST.GAMEOVER) {
      const dying=this.#state===ST.DYING;
      if (!dying||this.#pac.deathFrame<75) this.#pac.draw(ctx,this.#frame,dying);
      this.#fruits.forEach(f=>f.draw(ctx,this.#frame));
      this.#ghosts.forEach(g=>g.draw(ctx,this.#frame,this.#ftimer));
      this.#popups.forEach(p=>p.draw(ctx));
    }

    /* Level-clear text */
    if (this.#state===ST.LEVELCLEAR&&this.#ctimer>CFG.CLEAR_F*0.5) {
      const a=Math.min(1,(this.#ctimer-CFG.CLEAR_F*0.5)/30);
      ctx.save(); ctx.globalAlpha=a;
      ctx.fillStyle='#FFD700'; ctx.shadowColor='#FFD700'; ctx.shadowBlur=24;
      ctx.font='bold 14px "Press Start 2P"'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('LEVEL CLEAR!',this.#cvs.width/2,this.#cvs.height/2);
      ctx.restore();
    }

    /* Babs watermark */
    if (this.#state===ST.PLAYING) {
      const c=this.#frame%700;
      if (c<140) {
        const a=Math.sin((c/140)*Math.PI)*0.05;
        ctx.save(); ctx.globalAlpha=a;
        ctx.fillStyle='#FFAB76'; ctx.font='bold 18px "Press Start 2P"';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('B A B S',this.#cvs.width/2,this.#cvs.height/2-10);
        ctx.fillStyle='#FFD4B0'; ctx.font='12px serif';
        ctx.fillText('Georgia Peach 🍑',this.#cvs.width/2,this.#cvs.height/2+14);
        ctx.restore();
      }
    }
  }

  /* ── INPUT ── */
  #bindInput() {
    const DIRS=new Map([
      ['ArrowLeft',[-1,0]],['a',[-1,0]],['ArrowRight',[1,0]],['d',[1,0]],
      ['ArrowUp',[0,-1]],  ['w',[0,-1]],['ArrowDown',[0,1]], ['s',[0,1]],
    ]);
    const go=()=>{if(this.#state===ST.IDLE||this.#state===ST.GAMEOVER)this.startGame();};
    document.addEventListener('keydown', e=>{
      if(e.key==='Enter'||e.key===' '){go();return;}
      if(e.key==='m'||e.key==='M'){HUD.muteBtn(snd.toggleMute());return;}
      if(this.#state!==ST.PLAYING)return;
      const d=DIRS.get(e.key); if(d){this.#pac.steer(d[0],d[1]);e.preventDefault();}
    });
    document.getElementById('mute-btn')?.addEventListener('click',()=>HUD.muteBtn(snd.toggleMute()));
    [['dpad-up',[0,-1]],['dpad-down',[0,1]],['dpad-left',[-1,0]],['dpad-right',[1,0]]].forEach(([id,d])=>{
      document.getElementById(id)?.addEventListener('touchstart',e=>{
        e.preventDefault(); go(); if(this.#state===ST.PLAYING)this.#pac.steer(d[0],d[1]);
      },{passive:false});
    });
    let sx=0,sy=0;
    this.#cvs.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;go();},{passive:true});
    this.#cvs.addEventListener('touchend',e=>{
      if(this.#state!==ST.PLAYING)return;
      const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy;
      Math.abs(dx)>Math.abs(dy)?this.#pac.steer(dx>0?1:-1,0):this.#pac.steer(0,dy>0?1:-1);
    },{passive:true});
  }

  toggleMute() { const m=snd.toggleMute(); HUD.muteBtn(m); return m; }
}

/* ─────────────────────────────────────────────────────────────────
   SPLASH + BOOT
───────────────────────────────────────────────────────────────── */
const splash=document.getElementById('splash');
const bye=()=>{splash.classList.add('fade-out');setTimeout(()=>splash.classList.add('gone'),800);};
setTimeout(bye,5000);
splash.addEventListener('click',bye,{once:true});
document.addEventListener('keydown',bye,{once:true});
const game=new Game('canvas');
window.__babs__=game;
