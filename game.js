/**
 * BABS' PAC-MAN — Georgia Peach Edition
 * game.js  —  full game logic + sprite rendering + sound
 *
 * For Barbara "Babs" Jackson  🍑
 *
 * Requires: sound.js (same folder)
 * Sprite sheets (32px cells):
 *   assets/sprites/pacman.png   8×4
 *   assets/sprites/ghosts.png   8×7
 *   assets/sprites/fruits.png  10×2
 *   assets/sprites/pellets.png  6×2
 */


'use strict';

// ── SOUND safety shim ────────────────────────────────────────────────────
// Guarantees window.SOUND exists even if sound.js loads late or fails.
// All methods are no-ops until sound.js overwrites window.SOUND.
if (typeof window.SOUND === 'undefined') {
  const noop = () => {};
  window.SOUND = {
    play:noop, start:noop, waka:noop, power:noop, ghost:noop,
    fruit:noop, death:noop, levelClear:noop,
    sirenStart:noop, sirenFast:noop, sirenStop:noop,
    frightStart:noop, frightStop:noop,
    toggleMute:(()=>false), isMuted:false,
  };
}
// Convenience alias
const SOUND = window.SOUND;


// ══════════════════════════════════════════════════════════
// § 1  TRIBUTE
// ══════════════════════════════════════════════════════════
const TRIBUTE = Object.freeze({
  name:     'Barbara Jackson',
  nickname: 'BABS',
  hiScore:  3_333_330,
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
// § 2  CONSTANTS
// ══════════════════════════════════════════════════════════
const CFG = Object.freeze({
  TILE:         20,
  COLS:         21,
  ROWS:         23,
  CELL:         32,
  PAC_SPEED:    1.8,
  GHOST_SPEED:  1.4,
  FRIGHT_BASE:  300,
  FRIGHT_MIN:    60,
  READY_FRAMES: 150,
  DEATH_FRAMES:  90,
  SCORE: Object.freeze({ DOT: 10, POWER: 50, GHOST_BASE: 200 }),
});

const TILE_TYPE = Object.freeze({ WALL: 1, DOT: 2, POWER: 3, EMPTY: 0, HOUSE: 4 });

// Scatter/chase phase durations (frames): scatter, chase, scatter, chase...
const PHASE_TIMES=[280,700,200,1600,200,1600,200,Infinity];

const STATE = Object.freeze({
  IDLE:       Symbol('idle'),
  READY:      Symbol('ready'),
  PLAYING:    Symbol('playing'),
  DYING:      Symbol('dying'),
  LEVELCLEAR: Symbol('levelclear'),
  GAMEOVER:   Symbol('gameover'),
});

// ══════════════════════════════════════════════════════════
// § 3  SPRITE SHEET SYSTEM
// ══════════════════════════════════════════════════════════
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
    const C   = CFG.CELL;
    const sc  = scale ?? (CFG.TILE / C);
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

// ══════════════════════════════════════════════════════════
// § 4  CANVAS FALLBACKS
// ══════════════════════════════════════════════════════════
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
  if (frightened) col = (frightTimer<60 && Math.floor(frame/7)%2===0) ? '#FFFFFF':'#0000BB';
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

function fbFruit(ctx, x, y, def) {
  if (def.id === 'orange') { fbOrange(ctx, x, y); return; }
  ctx.save();
  ctx.font = `${Math.round(CFG.TILE*.9)}px serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  if (def.id==='peach'){ctx.shadowColor='#FFAB76';ctx.shadowBlur=16;}
  ctx.fillText(def.emoji||'?', x, y);
  ctx.restore();
}

// ══════════════════════════════════════════════════════════
// § 5  FRUITS
// ══════════════════════════════════════════════════════════
const FRUITS = Object.freeze([
  { id:'cherry',     name:'Cherry',     basePoints:100,  mult:1, minLevel:1 },
  { id:'strawberry', name:'Strawberry', basePoints:300,  mult:1, minLevel:2 },
  { id:'orange',     name:'Orange',     basePoints:500,  mult:1, minLevel:3 },
  { id:'apple',      name:'Apple',      basePoints:700,  mult:1, minLevel:4 },
  { id:'melon',      name:'Melon',      basePoints:1000, mult:1, minLevel:5 },
  { id:'grapes',     name:'Grapes',     basePoints:2000, mult:1, minLevel:6 },
  { id:'watermelon', name:'Watermelon', basePoints:3000, mult:1, minLevel:7 },
  { id:'bell',       name:'Bell',       basePoints:3000, mult:1, minLevel:8 },
  { id:'key',        name:'Key',        basePoints:5000, mult:1, minLevel:9 },
  { id:'peach',      name:'Peach',      basePoints:500,  mult:3, minLevel:1 },
]);

function fruitForLevel(level) {
  const eligible  = FRUITS.filter(f => f.id !== 'peach' && f.minLevel <= level);
  const canonical = eligible.length ? eligible[eligible.length - 1] : FRUITS[0];
  const peachChance = Math.min(0.20 + (level - 1) * 0.04, 0.45);
  return Math.random() < peachChance ? FRUITS.find(f => f.id === 'peach') : canonical;
}

// ══════════════════════════════════════════════════════════
// § 6  BONUS FRUIT
// ══════════════════════════════════════════════════════════
class BonusFruit {
  #def; #x; #y; #timer; #collected=false; #bobFrame=0; #collectFrame=-1;

  constructor(def,x,y,duration=480){this.#def=def;this.#x=x;this.#y=y;this.#timer=duration;}

  get def()       { return this.#def; }
  get x()         { return this.#x; }
  get y()         { return this.#y; }
  get alive()     { return !this.#collected && this.#timer>0; }
  get collected() { return this.#collected; }

  collect() { this.#collected=true; this.#collectFrame=0; }

  update() {
    this.#timer--;
    this.#bobFrame++;
    if (this.#collectFrame>=0) this.#collectFrame++;
  }

  draw(ctx, globalFrame) {
    if (!this.alive && this.#collectFrame<0) return;
    const {x,y}=this;
    const bob  = Math.sin(this.#bobFrame*.1)*2;
    const fade = this.#timer<90 ? this.#timer/90 : 1;
    const col  = FRUIT_COL.get(this.#def.id) ?? 0;
    ctx.save();
    ctx.globalAlpha = this.#collected ? Math.max(0,1-this.#collectFrame/12) : fade;
    const row = (this.#collected && this.#collectFrame<8) ? 1 : 0;
    const drawn = SPRITES.fruits.blit(ctx, col, row, x, y+bob);
    if (!drawn) fbFruit(ctx, x, y+bob, this.#def);
    if (!this.#collected && this.#def.id==='peach') {
      const pulse = 0.3+0.25*Math.sin(this.#bobFrame*.12);
      ctx.globalAlpha = fade*pulse;
      SPRITES.fruits.blit(ctx, col, 1, x, y+bob);
    }
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 7  SCORE POPUP
// ══════════════════════════════════════════════════════════
class ScorePopup {
  constructor(x,y,value,isTriple=false){this.x=x;this.y=y;this.value=value;this.isTriple=isTriple;this.life=75;}
  update(){this.y-=.55;this.life--;}
  get alive(){return this.life>0;}
  draw(ctx){
    ctx.save();
    ctx.globalAlpha=Math.min(this.life/28,1);
    const col=this.isTriple?'#FFAB76':'#00FFFF';
    ctx.fillStyle=col;ctx.shadowColor=col;ctx.shadowBlur=8;
    ctx.font=`bold ${this.isTriple?9:8}px "Press Start 2P"`;
    ctx.textAlign='center';
    if(this.isTriple)ctx.fillText('🍑×3',this.x,this.y-10);
    ctx.fillText(this.value,this.x,this.y);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 8  EVENT BUS
// ══════════════════════════════════════════════════════════
class EventBus {
  #map=new Map();
  on(e,cb){if(!this.#map.has(e))this.#map.set(e,new Set());this.#map.get(e).add(cb);return()=>this.off(e,cb);}
  off(e,cb){this.#map.get(e)?.delete(cb);}
  emit(e,d){this.#map.get(e)?.forEach(cb=>cb(d));}
}
const bus=new EventBus();

// ══════════════════════════════════════════════════════════
// § 9  SCORE MANAGER
// ══════════════════════════════════════════════════════════
class ScoreManager {
  #score=0; #ghostMul=1;
  static BABS_HI=TRIBUTE.hiScore;
  #sync(){document.getElementById('score').textContent=String(this.#score).padStart(7,'0');}
  add(pts){this.#score+=pts;this.#sync();}
  reset(){this.#score=0;this.#ghostMul=1;this.#sync();}
  get score(){return this.#score;}
  ghostEaten(){const p=CFG.SCORE.GHOST_BASE*this.#ghostMul;this.#ghostMul=Math.min(this.#ghostMul*2,8);this.add(p);return p;}
  resetGhostMul(){this.#ghostMul=1;}
  get ghostMul(){return this.#ghostMul;}
}

// ══════════════════════════════════════════════════════════
// § 10  MAP
// ══════════════════════════════════════════════════════════
const BASE_MAP=[
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
// § 11  MAZE
// ══════════════════════════════════════════════════════════
class Maze {
  #grid=[]; #dotsLeft=0;

  clone(){
    this.#grid=BASE_MAP.map(row=>[...row]);
    this.#dotsLeft=this.#grid.flat().filter(v=>v===TILE_TYPE.DOT||v===TILE_TYPE.POWER).length;
    return this;
  }

  eat(col,row){
    const v=this.#grid[row]?.[col];
    if(v===TILE_TYPE.DOT)  {this.#grid[row][col]=TILE_TYPE.EMPTY;this.#dotsLeft--;return'dot';}
    if(v===TILE_TYPE.POWER){this.#grid[row][col]=TILE_TYPE.EMPTY;this.#dotsLeft--;return'power';}
    return null;
  }

  isWall(col,row){return this.#grid[row]?.[col]===TILE_TYPE.WALL;}
  get dotsLeft(){return this.#dotsLeft;}
  get cleared(){return this.#dotsLeft<=0;}

  *walls()  {if(!this.#grid.length)return;for(let r=0;r<CFG.ROWS;r++)for(let c=0;c<CFG.COLS;c++)if(this.#grid[r]?.[c]===TILE_TYPE.WALL) yield{r,c};}
  *pickups(){if(!this.#grid.length)return;for(let r=0;r<CFG.ROWS;r++)for(let c=0;c<CFG.COLS;c++){const v=this.#grid[r]?.[c];if(v===TILE_TYPE.DOT||v===TILE_TYPE.POWER)yield{r,c,type:v};}}

  draw(ctx,frame){
    const T=CFG.TILE;
    for(const{r,c}of this.walls()){
      const x=c*T,y=r*T;
      ctx.fillStyle='#000035';ctx.fillRect(x,y,T,T);
      this.#edges(ctx,r,c,x,y);
    }
    for(const{r,c,type}of this.pickups()){
      const cx=c*T+T/2,cy=r*T+T/2;
      if(type===TILE_TYPE.DOT){
        const drawn=SPRITES.pellets.blit(ctx,0,0,cx,cy);
        if(!drawn){ctx.fillStyle='#FFB8AE';ctx.beginPath();ctx.arc(cx,cy,2.2,0,Math.PI*2);ctx.fill();}
      } else {
        const pCol=1+Math.floor(frame/8)%5;
        const drawn=SPRITES.pellets.blit(ctx,pCol,0,cx,cy);
        if(!drawn){
          const sc=.72+.28*Math.sin(frame*.14);
          ctx.save();ctx.shadowColor='#FFAB76';ctx.shadowBlur=14;
          ctx.fillStyle='#FFD4B0';ctx.beginPath();ctx.arc(cx,cy,5.8*sc,0,Math.PI*2);ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  #edges(ctx,r,c,x,y){
    const T=CFG.TILE,iw=(dr,dc)=>this.#grid[r+dr]?.[c+dc]===TILE_TYPE.WALL;
    ctx.save();ctx.strokeStyle='#2323ee';ctx.shadowColor='#4444ff';ctx.shadowBlur=5;ctx.lineWidth=2.5;ctx.lineCap='round';
    [[!iw(-1,0),x,y+1,x+T,y+1],[!iw(1,0),x,y+T-1,x+T,y+T-1],
     [!iw(0,-1),x+1,y,x+1,y+T],[!iw(0,1),x+T-1,y,x+T-1,y+T]]
    .forEach(([show,x1,y1,x2,y2])=>{if(!show)return;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();});
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 12  ENTITY BASE
// ══════════════════════════════════════════════════════════
class Entity {
  constructor(x,y,speed){this.x=x;this.y=y;this.dx=0;this.dy=0;this.speed=speed;}
  get col(){return Math.round((this.x-CFG.TILE/2)/CFG.TILE);}
  get row(){return Math.round((this.y-CFG.TILE/2)/CFG.TILE);}
  get tileX(){return this.col*CFG.TILE+CFG.TILE/2;}
  get tileY(){return this.row*CFG.TILE+CFG.TILE/2;}
  _hitsWall(maze,nx,ny,m=.42){
    const mg=CFG.TILE*m,T=CFG.TILE;
    for(let r=Math.floor((ny-mg)/T);r<=Math.floor((ny+mg)/T);r++)
      for(let c=Math.floor((nx-mg)/T);c<=Math.floor((nx+mg)/T);c++)
        if(maze.isWall(c,r))return true;
    return false;
  }
  _wrapX(){const w=CFG.COLS*CFG.TILE;if(this.x<0)this.x=w;if(this.x>w)this.x=0;}
}

// ══════════════════════════════════════════════════════════
// § 13  PAC-MAN
// ══════════════════════════════════════════════════════════
class Pacman extends Entity {
  #mouth=.25; #mouthDir=1; #nextDx=0; #nextDy=0;
  deathFrame=0;

  constructor(x,y){super(x,y,CFG.PAC_SPEED);}
  setDir(dx,dy){this.#nextDx=dx;this.#nextDy=dy;}

  update(maze){
    if(this.#nextDx!==this.dx||this.#nextDy!==this.dy)
      if(!this._hitsWall(maze,this.x+this.#nextDx*this.speed,this.y+this.#nextDy*this.speed))
        {this.dx=this.#nextDx;this.dy=this.#nextDy;}
    if(!this._hitsWall(maze,this.x+this.dx*this.speed,this.y+this.dy*this.speed))
      {this.x+=this.dx*this.speed;this.y+=this.dy*this.speed;}
    this._wrapX();
    this.#mouth+=.05*this.#mouthDir;
    if(this.#mouth>=.26||this.#mouth<=.01)this.#mouthDir*=-1;
  }

  draw(ctx,globalFrame,dying=false){
    const {x,y}=this;
    if(dying){
      const col=Math.min(7,Math.floor(this.deathFrame/(CFG.DEATH_FRAMES/8)));
      const drawn=SPRITES.pacman.blit(ctx,col,3,x,y);
      if(!drawn)fbPacman(ctx,x,y,this.dx,this.dy,this.#mouth,true,this.deathFrame);
      return;
    }
    const row=pacRow(this.dx,this.dy);
    const col=pacCol(globalFrame);
    const flipX=this.dx<0;
    const drawn=SPRITES.pacman.blit(ctx,col,row,x,y,undefined,flipX);
    if(!drawn)fbPacman(ctx,x,y,this.dx,this.dy,this.#mouth,false,0);
  }
}

// ══════════════════════════════════════════════════════════
// § 14  GHOST
// ══════════════════════════════════════════════════════════
const GHOST_DEFS = Object.freeze([
  // Blinky starts OUTSIDE the house (row 8 = open area above door)
  {name:'BLINKY', color:'#FF0000', startCol:10, startRow:8,  houseCol:10, houseRow:9 },
  // Pinky/Inky/Clyde start inside (row 9 = house interior top)
  {name:'PINKY',  color:'#FFB8FF', startCol:10, startRow:9,  houseCol:10, houseRow:9 },
  {name:'INKY',   color:'#00FFFF', startCol: 9, startRow:9,  houseCol:9,  houseRow:9 },
  {name:'CLYDE',  color:'#FFB852', startCol:11, startRow:9,  houseCol:11, houseRow:9 },
]);

// Simple AI: each ghost targets pac-man (or runs away during scatter)
const SCATTER_TILES = [{col:18,row:1},{col:2,row:1},{col:18,row:21},{col:2,row:21}];
const AI_TARGET = [
  (g,pac,all)=>({col:pac.col, row:pac.row}),                             // Blinky: direct
  (g,pac,all)=>({col:pac.col+pac.dx*4, row:pac.row+pac.dy*4}),          // Pinky: 4 ahead
  (g,pac,all)=>{                                                          // Inky: blinky vector
    const b=all[0], px=pac.col+pac.dx*2, py=pac.row+pac.dy*2;
    return {col:Math.round(px*2-b.col), row:Math.round(py*2-b.row)};
  },
  (g,pac,all)=>                                                           // Clyde: shy
    Math.hypot(g.col-pac.col,g.row-pac.row)>8
      ? {col:pac.col,row:pac.row}
      : SCATTER_TILES[3],
];

const DIRS = [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}];  // U R D L

class Ghost {
  // public
  color; name; dx=0; dy=0; x=0; y=0;

  // private
  #idx; #aiFn; #speed;
  #frightened=false;
  #eaten=false;
  #inHouse=true;
  // Exit sequence:
  //   step 0 = wait (leaveCountdown > 0)
  //   step 1 = centre horizontally to col 10
  //   step 2 = move up to row 8 (above door)
  //   step 3 = exited, normal movement
  #exitStep=0;
  #leaveCountdown=0;
  #atIntersection=false;

  constructor(def, idx, speed){
    const T=CFG.TILE;
    this.name=def.name; this.color=def.color;
    this.#idx=idx; this.#aiFn=AI_TARGET[idx]; this.#speed=speed;
    this.x=def.startCol*T+T/2;
    this.y=def.startRow*T+T/2;
    // Staggered delays (frames): Blinky exits instantly
    // 0=instant (Blinky outside), 60/120/180 frames for Pinky/Inky/Clyde
    this.#leaveCountdown = [0, 60, 120, 180][idx];
    // Blinky starts outside already
    if(idx===0){ this.#inHouse=false; this.#exitStep=3; this.dx=-1; }
    else { this.dy=1; } // bob down first
  }

  get col(){ return Math.floor(this.x/CFG.TILE); }
  get row(){ return Math.floor(this.y/CFG.TILE); }
  get frightened(){ return this.#frightened; }
  get eaten(){ return this.#eaten; }
  get inHouse(){ return this.#inHouse; }

  setFrightened(on){
    if(this.#eaten) return;
    if(on && !this.#frightened && this.#exitStep===3){
      // Reverse on fright start
      this.dx=-this.dx; this.dy=-this.dy;
    }
    this.#frightened=on;
  }
  setEaten(){ this.#eaten=true; this.#frightened=false; }

  resetToHouse(){
    const T=CFG.TILE, def=GHOST_DEFS[this.#idx];
    this.#eaten=false; this.#frightened=false;
    this.#inHouse=true; this.#exitStep=0;
    this.#leaveCountdown=60;
    this.x=def.houseCol*T+T/2;
    this.y=def.houseRow*T+T/2;
    this.dx=0; this.dy=1;
  }

  update(maze, pac, all, scatterPhase){
    const T=CFG.TILE;
    const spd = this.#eaten ? this.#speed*2
              : this.#frightened ? this.#speed*0.5
              : this.#speed;

    // ── A: RETURNING TO HOUSE (eaten eyes) ──────────────
    if(this.#eaten){
      const hx=GHOST_DEFS[this.#idx].houseCol*T+T/2;
      const hy=GHOST_DEFS[this.#idx].houseRow*T+T/2;
      if(Math.hypot(this.x-hx,this.y-hy)<spd+2){ this.resetToHouse(); return; }
      // Beeline straight to house — no wall checks (eyes phase through walls)
      const dist=Math.hypot(hx-this.x,hy-this.y);
      this.x+=(hx-this.x)/dist*spd;
      this.y+=(hy-this.y)/dist*spd;
      return;
    }

    // ── B: INSIDE HOUSE ──────────────────────────────────
    if(this.#inHouse){
      // Count down before trying to leave
      if(this.#leaveCountdown>0){ this.#leaveCountdown--; return; }

      // Door centre = col 10. Must exit upward past row 7 (open corridor).
      const exitX = 10*T + T/2;   // horizontal centre of ghost door
      const exitY =  7*T + T/2;   // row 7: first fully open row above house

      if(this.#exitStep===0){
        // Slide horizontally to door centre column
        const diff = exitX - this.x;
        if(Math.abs(diff) < spd+0.5){
          this.x = exitX;
          this.dy = -1; this.dx = 0;
          this.#exitStep = 1;
        } else {
          this.x += diff > 0 ? spd : -spd;
        }
      }

      if(this.#exitStep===1){
        // Move straight up until clear of house structure
        this.y -= spd;
        if(this.y <= exitY){
          this.y = exitY;
          this.#inHouse = false;
          this.#exitStep = 3;
          // Turn left or right depending on which side of map
          this.dx = (this.#idx % 2 === 0) ? -1 : 1;
          this.dy = 0;
        }
      }
      return;
    }

    // ── C: NORMAL GRID MOVEMENT ───────────────────────────
    // Check if we just crossed into a new tile centre
    const centreX = this.col*T+T/2;
    const centreY = this.row*T+T/2;
    const nearCentreX = Math.abs(this.x-centreX)<spd+0.5;
    const nearCentreY = Math.abs(this.y-centreY)<spd+0.5;

    if(nearCentreX && nearCentreY){
      // Snap to exact centre
      this.x=centreX; this.y=centreY;
      const col=this.col, row=this.row;

      // Build list of valid directions (no U-turn, no walls)
      const valid=DIRS.filter(d=>{
        if(d.dx===-this.dx && d.dy===-this.dy) return false; // no U-turn
        return !maze.isWall(col+d.dx, row+d.dy);
      });

      // If no valid moves (dead end), allow U-turn
      const candidates = valid.length ? valid
        : DIRS.filter(d=>!maze.isWall(col+d.dx,row+d.dy));

      if(candidates.length){
        let chosen;
        if(this.#frightened){
          // Random walk
          chosen=candidates[Math.floor(Math.random()*candidates.length)];
        } else {
          // Chase/scatter: pick direction whose next tile is closest to target
          const target = scatterPhase
            ? SCATTER_TILES[this.#idx]
            : (() => {
                const t=this.#aiFn(this,pac,all);
                return {col: Math.round(t.col??t.x/T), row: Math.round(t.row??t.y/T)};
              })();
          chosen=candidates.reduce((best,d)=>{
            const dc=col+d.dx-target.col, dr=row+d.dy-target.row;
            const dist=dc*dc+dr*dr;
            return dist<best.dist?{d,dist}:{...best};
          },{d:candidates[0],dist:Infinity}).d;
        }
        this.dx=chosen.dx; this.dy=chosen.dy;
      }
    }

    // Move
    const nx=this.x+this.dx*spd;
    const ny=this.y+this.dy*spd;
    // Wall check: test ahead in movement direction
    const checkCol = this.dx!==0
      ? Math.floor((nx + this.dx*T*0.45)/T)
      : Math.floor(nx/T);
    const checkRow = this.dy!==0
      ? Math.floor((ny + this.dy*T*0.45)/T)
      : Math.floor(ny/T);
    if(!maze.isWall(checkCol, checkRow)){
      this.x=nx; this.y=ny;
    } else {
      this.x=this.col*T+T/2; this.y=this.row*T+T/2;
    }

    // Tunnel wrap
    const w=CFG.COLS*T;
    if(this.x<0)this.x=w; if(this.x>w)this.x=0;
  }

  draw(ctx, globalFrame, frightTimer){
    const {x,y}=this;
    ctx.save();
    if(this.#inHouse) ctx.globalAlpha=0.6;
    let drawn=false;
    if(this.#eaten){
      let dc=0;
      if(this.dx>0)dc=0; else if(this.dx<0)dc=2;
      else if(this.dy<0)dc=4; else dc=6;
      drawn=SPRITES.ghosts.blit(ctx,dc,6,x,y);
    } else if(this.#frightened){
      const flash=frightTimer<60&&Math.floor(globalFrame/7)%2===0;
      drawn=SPRITES.ghosts.blit(ctx,Math.floor(globalFrame/6)%8,flash?5:4,x,y);
    } else {
      drawn=SPRITES.ghosts.blit(ctx,ghostBodyCol(this.dx,this.dy,globalFrame),this.#idx,x,y);
    }
    if(!drawn) fbGhost(ctx,x,y,this.color,this.dx,this.dy,this.#frightened,frightTimer,globalFrame);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 15  HUD
// ══════════════════════════════════════════════════════════
const HUD={
  setLevel(n){document.getElementById('level').textContent=String(n).padStart(2,'0');},
  setLives(n){document.querySelectorAll('.life-icon').forEach((el,i)=>el.classList.toggle('dead',i>=n));},
  show(id){document.getElementById(id)?.classList.remove('overlay--hidden');},
  hide(id){document.getElementById(id)?.classList.add('overlay--hidden');},
  setFinalScore(n){document.getElementById('final-score').textContent=String(n).padStart(7,'0');},
  setGameOverMsg(m){document.getElementById('gameover-msg').textContent=m;},
  setReady(on){document.getElementById('ready-text')?.classList.toggle('overlay--hidden',!on);},
  setMuteBtn(muted){
    const btn=document.getElementById('mute-btn');
    if(btn)btn.textContent=muted?'🔇 MUTED':'🔊 SOUND';
  },
  setActiveFruit(def){
    if(!def){
      document.getElementById('active-fruit-icon').textContent='·';
      document.getElementById('active-fruit-name').textContent='—';
      document.getElementById('active-fruit-pts').textContent='';
      return;
    }
    const iconMap={orange:'🟠'};
    const icon=iconMap[def.id]||def.emoji||def.name[0];
    const pts=def.basePoints*def.mult;
    document.getElementById('active-fruit-icon').textContent=icon;
    document.getElementById('active-fruit-name').textContent=def.name+(def.mult>1?` ×${def.mult}!`:'');
    document.getElementById('active-fruit-pts').textContent=`${pts} PTS`;
    document.getElementById('active-fruit-icon').style.color=def.id==='peach'?'#FFAB76':'';
  },
};

// ══════════════════════════════════════════════════════════
// § 16  GAME — state machine
// ══════════════════════════════════════════════════════════
class Game {
  #canvas; #ctx;
  #maze   = new Maze();
  #score  = new ScoreManager();
  #pac    = null;
  #ghosts = [];
  #popups = [];
  #state  = STATE.IDLE;
  #frame  = 0;
  #frightTimer   = 0;
  #readyTimer    = 0;
  #deathTimer    = 0;
  #level  = 1;
  #lives  = 3;
  #dotEatenCount = 0;
  #fruits        = [];    // array of active BonusFruit objects
  #fruitSpawnDots = [];   // dot counts at which to spawn
  #sirenFast     = false;   // track whether we've already called sirenFast
  #phaseTimer    = 0;       // scatter/chase phase frame counter
  #phaseIdx      = 0;       // index into PHASE_TIMES
  #scatterPhase  = true;    // true=scatter, false=chase

  constructor(canvasId){
    this.#canvas=document.getElementById(canvasId);
    this.#ctx=this.#canvas.getContext('2d');
    this.#canvas.width=CFG.COLS*CFG.TILE;
    this.#canvas.height=CFG.ROWS*CFG.TILE;
    this.#bindInput();
    this.#maze.clone();
    document.getElementById('highscore').textContent=String(TRIBUTE.hiScore).padStart(7,'0');
    HUD.show('overlay-start');
    requestAnimationFrame(this.#loop);
  }

  #setState(s){this.#state=s;bus.emit('state:change',s);}

  // ── START / INIT ────────────────────────────────────────
  startGame(){
    HUD.hide('overlay-start'); HUD.hide('overlay-gameover');
    this.#score.reset(); this.#level=1; this.#lives=3;
    HUD.setLevel(1); HUD.setLives(3);
    this.#initLevel();
    SOUND.start();   // 🎵 Opening jingle on every new game
  }

  #initLevel(){
    this.#maze.clone();
    const T=CFG.TILE;
    this.#pac=new Pacman(10*T+T/2,16*T+T/2);
    const spd=Math.min(CFG.GHOST_SPEED+(this.#level-1)*.08,2.2);
    this.#ghosts=GHOST_DEFS.map((def,i)=>new Ghost(def,i,spd));
    this.#popups=[]; this.#frightTimer=0;
    this.#dotEatenCount=0; this.#fruits=[];
    // Spawn fruits at 3 random dot thresholds between 40-160
    const total=this.#maze.dotsLeft||186;
    const t1=Math.floor(total*0.22+Math.random()*20);
    const t2=Math.floor(total*0.45+Math.random()*20);
    const t3=Math.floor(total*0.68+Math.random()*20);
    this.#fruitSpawnDots=[t1,t2,t3].sort((a,b)=>a-b);
    this.#sirenFast=false;
    this.#phaseTimer=0;
    this.#phaseIdx=0;
    this.#scatterPhase=true;
    this.#score.resetGhostMul();
    this.#setState(STATE.READY);
    this.#readyTimer=CFG.READY_FRAMES;
    HUD.setReady(true); HUD.setActiveFruit(null);
    SOUND.sirenStop();    // clear any old siren before ready phase
    SOUND.frightStop();
  }

  // ── MAIN LOOP ───────────────────────────────────────────
  #loop=()=>{this.#update();this.#draw();requestAnimationFrame(this.#loop);};

  #update(){
    this.#frame++;
    switch(this.#state){
      case STATE.READY:
        if(--this.#readyTimer<=0){
          this.#setState(STATE.PLAYING);
          HUD.setReady(false);
          SOUND.sirenStart();   // 🎵 Siren starts when play begins
        }
        break;
      case STATE.PLAYING:
        this.#updatePlaying();
        break;
      case STATE.DYING:
        this.#pac.deathFrame++;
        if(--this.#deathTimer<=0) this.#handleDeath();
        break;
    }
    this.#popups=this.#popups.filter(p=>{p.update();return p.alive;});
  }

  #updatePlaying(){
    // ── Scatter/chase phase timer ──
    if(this.#frightTimer===0){
      this.#phaseTimer++;
      const limit=PHASE_TIMES[this.#phaseIdx]??Infinity;
      if(this.#phaseTimer>=limit){
        this.#phaseTimer=0;
        this.#phaseIdx++;
        this.#scatterPhase=!this.#scatterPhase;
        // Ghosts reverse direction on phase switch (classic rule)
        this.#ghosts.forEach(g=>{if(!g.inHouse&&!g.eaten){g.dx=-g.dx;g.dy=-g.dy;}});
      }
    }

    // ── Fright timer countdown ──
    if(this.#frightTimer>0){
      this.#frightTimer--;
      if(this.#frightTimer===0){
        // 🎵 Fright ends — stop warble, resume siren
        this.#ghosts.forEach(g=>g.setFrightened(false));
        SOUND.frightStop();
        SOUND.sirenStart();
      }
    }

    this.#pac.update(this.#maze);

    // ── Eat dot / power ──
    const eaten=this.#maze.eat(this.#pac.col,this.#pac.row);
    if(eaten==='dot'){
      this.#score.add(CFG.SCORE.DOT);
      this.#dotEatenCount++;
      this.#checkFruitSpawn();
      SOUND.waka();   // 🎵 Waka chomp

      // 🎵 Speed up siren when fewer than 30 dots remain
      if(!this.#sirenFast && this.#maze.dotsLeft<30 && this.#frightTimer===0){
        this.#sirenFast=true;
        SOUND.sirenFast();
      }
    } else if(eaten==='power'){
      this.#score.add(CFG.SCORE.POWER);
      const dur=Math.max(CFG.FRIGHT_MIN,CFG.FRIGHT_BASE-(this.#level-1)*25);
      this.#frightTimer=dur;
      this.#score.resetGhostMul();
      this.#ghosts.forEach(g=>g.setFrightened(true));
      SOUND.power();        // 🎵 Power pellet sound
      SOUND.sirenStop();    // 🎵 Stop siren during fright
      SOUND.frightStart();  // 🎵 Start fright warble
    }

    // ── Bonus fruits update + collection ──
    for(const fruit of this.#fruits){
      if(!fruit.alive) continue;
      fruit.update();
      const dist=Math.hypot(fruit.x-this.#pac.x,fruit.y-this.#pac.y);
      if(dist<CFG.TILE*.8){
        const def=fruit.def, pts=def.basePoints*def.mult;
        this.#score.add(pts);
        this.#popups.push(new ScorePopup(fruit.x,fruit.y,pts,def.mult>1));
        fruit.collect();
        SOUND.fruit(def.id==='peach');
      }
    }
    // Prune expired fruits
    this.#fruits=this.#fruits.filter(f=>f.alive||f.collected);
    if(this.#fruits.every(f=>!f.alive)) HUD.setActiveFruit(null);

    // ── Ghost updates ──
    this.#ghosts.forEach(g=>g.update(this.#maze,this.#pac,this.#ghosts,this.#scatterPhase));

    // ── Collision detection ──
    for(const ghost of this.#ghosts){
      const dist=Math.hypot(ghost.x-this.#pac.x,ghost.y-this.#pac.y);
      if(dist>=CFG.TILE*.75) continue;

      if(ghost.frightened){
        const pts=this.#score.ghostEaten();
        ghost.setEaten();
        this.#popups.push(new ScorePopup(ghost.x,ghost.y,pts));
        SOUND.ghost(this.#score.ghostMul);  // 🎵 Ghost eaten (pitch rises per ghost)
        // If all ghosts eaten, restart fright sound
        const anyFrightened=this.#ghosts.some(g=>g.frightened);
        if(!anyFrightened){ SOUND.frightStop(); SOUND.sirenStart(); }
      } else if(!ghost.eaten&&!ghost.inHouse){
        // 🎵 Pac-Man hit — stop everything, start death
        SOUND.sirenStop();
        SOUND.frightStop();
        this.#setState(STATE.DYING);
        this.#deathTimer=CFG.DEATH_FRAMES;
        this.#pac.deathFrame=0;
        HUD.setReady(false);
        SOUND.death();  // 🎵 Death fanfare
        return;
      }
    }

    if(this.#maze.cleared) this.#triggerLevelClear();
  }

  // ── FRUIT SPAWN ─────────────────────────────────────────
  #checkFruitSpawn(){
    const T=CFG.TILE;
    // Spawn at each threshold dot count (only once each)
    while(this.#fruitSpawnDots.length && this.#dotEatenCount>=this.#fruitSpawnDots[0]){
      this.#fruitSpawnDots.shift();
      // Random position near centre of maze (away from walls)
      // All spots verified against BASE_MAP — every one is a dot cell (value=2)
      const SPOTS=[
        {x: 9*T+T/2, y: 1*T+T/2},   // top corridor left-centre
        {x:11*T+T/2, y: 1*T+T/2},   // top corridor right-centre
        {x: 9*T+T/2, y: 4*T+T/2},   // upper open area left
        {x:11*T+T/2, y: 4*T+T/2},   // upper open area right
        {x: 1*T+T/2, y: 6*T+T/2},   // left side mid
        {x:19*T+T/2, y: 6*T+T/2},   // right side mid
        {x: 1*T+T/2, y:14*T+T/2},   // left side lower
        {x:19*T+T/2, y:14*T+T/2},   // right side lower
        {x: 9*T+T/2, y:20*T+T/2},   // bottom corridor left
        {x:11*T+T/2, y:20*T+T/2},   // bottom corridor right
      ];
      const spot=SPOTS[Math.floor(Math.random()*SPOTS.length)];
      this.#spawnFruit(spot.x, spot.y);
    }
  }

  #spawnFruit(x,y){
    const def=fruitForLevel(this.#level);
    const fruit=new BonusFruit(def,x,y,360+Math.floor(Math.random()*120));
    this.#fruits.push(fruit);
    HUD.setActiveFruit(def);
  }

  // ── DEATH / GAME OVER / LEVEL CLEAR ────────────────────
  #handleDeath(){
    this.#lives--;
    HUD.setLives(this.#lives);
    if(this.#lives<=0){
      this.#triggerGameOver();
    } else {
      this.#initLevel();
    }
  }

  #triggerLevelClear(){
    this.#setState(STATE.LEVELCLEAR);
    SOUND.sirenStop();    // 🎵 Stop siren
    SOUND.frightStop();
    SOUND.levelClear();   // 🎵 Level clear fanfare
    HUD.show('overlay-levelclear');
    setTimeout(()=>{
      HUD.hide('overlay-levelclear');
      this.#level++;
      HUD.setLevel(this.#level);
      this.#initLevel();
    }, 2400);
  }

  #triggerGameOver(){
    this.#setState(STATE.GAMEOVER);
    SOUND.sirenStop();   // 🎵 Ensure all sounds stopped
    SOUND.frightStop();
    HUD.setFinalScore(this.#score.score);
    const msgs=TRIBUTE.gameoverMessages;
    HUD.setGameOverMsg(msgs[Math.floor(Math.random()*msgs.length)]);
    HUD.show('overlay-gameover');
  }

  // ── DRAW ────────────────────────────────────────────────
  #draw(){
    const ctx=this.#ctx;
    ctx.fillStyle='#000008';
    ctx.fillRect(0,0,this.#canvas.width,this.#canvas.height);
    this.#maze.draw(ctx,this.#frame);

    if(this.#state!==STATE.IDLE&&this.#state!==STATE.GAMEOVER){
      const dying=this.#state===STATE.DYING;
      if(!dying||this.#pac.deathFrame<75) this.#pac.draw(ctx,this.#frame,dying);
      this.#fruits.forEach(f=>f.draw(ctx,this.#frame));
      this.#ghosts.forEach(g=>g.draw(ctx,this.#frame,this.#frightTimer));
      this.#popups.forEach(p=>p.draw(ctx));
    }

    // BABS watermark
    if(this.#state===STATE.PLAYING){
      const cycle=this.#frame%700;
      if(cycle<140){
        const alpha=Math.sin((cycle/140)*Math.PI)*.055;
        ctx.save(); ctx.globalAlpha=alpha;
        ctx.fillStyle='#FFAB76'; ctx.font='bold 18px "Press Start 2P"';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('B A B S',this.#canvas.width/2,this.#canvas.height/2-10);
        ctx.font='12px "Playfair Display"'; ctx.fillStyle='#FFD4B0';
        ctx.fillText('Georgia Peach 🍑',this.#canvas.width/2,this.#canvas.height/2+14);
        ctx.restore();
      }
    }
  }

  // ── INPUT ───────────────────────────────────────────────
  #bindInput(){
    const keyMap=new Map([
      ['ArrowLeft',[-1,0]],['a',[-1,0]],['ArrowRight',[1,0]],['d',[1,0]],
      ['ArrowUp',[0,-1]],  ['w',[0,-1]],['ArrowDown',[0,1]], ['s',[0,1]],
    ]);
    const tryStart=()=>{
      if(this.#state===STATE.IDLE||this.#state===STATE.GAMEOVER) this.startGame();
    };
    document.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){tryStart();return;}
      // M key = mute toggle
      if(e.key==='m'||e.key==='M'){
        const muted=SOUND.toggleMute();  // 🎵 Mute toggle via M key
        HUD.setMuteBtn(muted);
        return;
      }
      if(this.#state!==STATE.PLAYING) return;
      const dir=keyMap.get(e.key);
      if(dir){const[dx,dy]=dir;this.#pac.setDir(dx,dy);e.preventDefault();}
    });

    // Mute button click
    document.getElementById('mute-btn')?.addEventListener('click',()=>{
      const muted=SOUND.toggleMute();
      HUD.setMuteBtn(muted);
    });

    // D-pad touch
    Object.entries({'dpad-up':[0,-1],'dpad-down':[0,1],'dpad-left':[-1,0],'dpad-right':[1,0]})
      .forEach(([id,[dx,dy]])=>{
        document.getElementById(id)?.addEventListener('touchstart',e=>{
          e.preventDefault(); tryStart();
          if(this.#state===STATE.PLAYING) this.#pac.setDir(dx,dy);
        },{passive:false});
      });

    // Swipe
    let sx=0,sy=0;
    this.#canvas.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;tryStart();},{passive:true});
    this.#canvas.addEventListener('touchend',e=>{
      if(this.#state!==STATE.PLAYING) return;
      const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy;
      Math.abs(dx)>Math.abs(dy)?this.#pac.setDir(dx>0?1:-1,0):this.#pac.setDir(0,dy>0?1:-1);
    },{passive:true});
  }

  // Public mute accessor for window.__babs__
  toggleMute(){ const m=SOUND.toggleMute(); HUD.setMuteBtn(m); return m; }
}

// ══════════════════════════════════════════════════════════
// SPLASH + BOOT
// ══════════════════════════════════════════════════════════
const splash=document.getElementById('splash');
const dismissSplash=()=>{
  splash.classList.add('fade-out');
  setTimeout(()=>splash.classList.add('gone'),800);
};
setTimeout(dismissSplash,5000);
splash.addEventListener('click',dismissSplash,{once:true});
document.addEventListener('keydown',dismissSplash,{once:true});

const game=new Game('canvas');
window.__babs__=game;
