/**
 * BABS' MS. PAC-MAN \u2014 Georgia Peach Edition
 * game.js  \u2014  full game logic + sprite rendering + sound
 * For Barbara "Babs" Jackson  \u{1F351}
 * Ms. Pac-Man theme with level timer, auto-advance, and arcade sounds.
 */

// ES modules are implicitly strict \u2014 no 'use strict' needed or allowed after import.
import { snd } from './sound.js';

// ??????????????????????????????????????????????????????????
// ? 1  TRIBUTE
// ??????????????????????????????????????????????????????????
const TRIBUTE = Object.freeze({
  name:     'Barbara Jackson',
  nickname: 'BABS',
  hiScore:  3333330,
  hiYear:   '1987',
  gameoverMessages: [
    "Babs would've kept going! \u{1F351}",
    "Sweet as a peach \u2014 try again! \u{1F351}",
    "Georgia never quits! \u{1F351}",
    "One more for Babs! \u{1F351}",
    "She never gave up \u2014 neither should you! \u{1F351}",
    "Babs scored higher with her eyes closed! \u{1F351}",
  ],
});

// ??????????????????????????????????????????????????????????
// ? 2  CONSTANTS
// ??????????????????????????????????????????????????????????
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

const STATE = Object.freeze({
  IDLE:       Symbol('idle'),
  READY:      Symbol('ready'),
  PLAYING:    Symbol('playing'),
  DYING:      Symbol('dying'),
  TIMEOUT:    Symbol('timeout'),   // level timer hit zero
  LEVELCLEAR: Symbol('levelclear'),
  GAMEOVER:   Symbol('gameover'),
});

// ??????????????????????????????????????????????????????????
// ? 3  SPRITE SHEET SYSTEM
// ??????????????????????????????????????????????????????????
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

// ??????????????????????????????????????????????????????????
// ? 4  CANVAS FALLBACKS
// ??????????????????????????????????????????????????????????
// Draw just the Ms. Pac-Man accessories (bow + beauty mark) in screen space.
// Called separately so they sit on top of both the sprite and the fallback body.
function fbMsPacBow(ctx, x, y, r) {
  ctx.save();
  const bx = x, by = y - r * 0.84;
  ctx.shadowColor = '#FF0066'; ctx.shadowBlur = 5;
  ctx.fillStyle   = '#FF1177';
  // left bow lobe
  ctx.beginPath(); ctx.ellipse(bx - r*.22, by, r*.22, r*.14, -0.32, 0, Math.PI*2); ctx.fill();
  // right bow lobe
  ctx.beginPath(); ctx.ellipse(bx + r*.22, by, r*.22, r*.14,  0.32, 0, Math.PI*2); ctx.fill();
  // centre knot
  ctx.fillStyle = '#CC0044';
  ctx.beginPath(); ctx.ellipse(bx, by, r*.09, r*.09, 0, 0, Math.PI*2); ctx.fill();
  // beauty mark
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = '#331100';
  ctx.beginPath(); ctx.arc(x + r*.36, y + r*.24, r*.055, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function fbPacman(ctx, x, y, dx, dy, mouthDeg, dying, deathPct) {
  const r = CFG.TILE * 0.47;

  // ----- body (rotated with direction) -----
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
    // red lipstick at the leading edge
    ctx.fillStyle = '#FF3355';
    ctx.beginPath(); ctx.arc(r*0.52, 0, r*0.19, m*0.8, (Math.PI*2-m)*0.9); ctx.fill();
  }
  ctx.restore();

  // ----- Ms. Pac-Man accessories (screen-space, never rotated) -----
  if (!dying) fbMsPacBow(ctx, x, y, r);
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

// FIX: ctx.fillStyle='white' added \u2014 previously missing, so text inherited
// near-black #000008 and was invisible against the black canvas background.
// emoji property is now populated on every FRUITS entry (see ? 5).
function fbFruit(ctx, x, y, def) {
  if (def.id === 'orange') { fbOrange(ctx, x, y); return; }
  ctx.save();
  ctx.font = `${Math.round(CFG.TILE*.9)}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'white';                    // ? FIX: was absent entirely
  if (def.id === 'peach') {
    ctx.shadowColor = '#FFAB76';
    ctx.shadowBlur  = 16;
  }
  ctx.fillText(def.emoji || '?', x, y);
  ctx.restore();
}

// ??????????????????????????????????????????????????????????
// ? 5  FRUITS
// FIX: emoji property added to every entry.  fbFruit was calling
// def.emoji||'?' \u2014 without the property every fruit rendered as '?'.
// ??????????????????????????????????????????????????????????
const FRUITS = Object.freeze([
  { id:'cherry',     emoji:'\u{1F352}', name:'Cherry',     basePoints:100,  mult:1, minLevel:1 },
  { id:'strawberry', emoji:'\u{1F353}', name:'Strawberry', basePoints:300,  mult:1, minLevel:2 },
  { id:'orange',     emoji:'\u{1F34A}', name:'Orange',     basePoints:500,  mult:1, minLevel:3 },
  { id:'apple',      emoji:'\u{1F34E}', name:'Apple',      basePoints:700,  mult:1, minLevel:4 },
  { id:'melon',      emoji:'\u{1F348}', name:'Melon',      basePoints:1000, mult:1, minLevel:5 },
  { id:'grapes',     emoji:'\u{1F347}', name:'Grapes',     basePoints:2000, mult:1, minLevel:6 },
  { id:'watermelon', emoji:'\u{1F349}', name:'Watermelon', basePoints:3000, mult:1, minLevel:7 },
  { id:'bell',       emoji:'\u{1F514}', name:'Bell',       basePoints:3000, mult:1, minLevel:8 },
  { id:'key',        emoji:'\u{1F5DD}', name:'Key',        basePoints:5000, mult:1, minLevel:9 },
  { id:'peach',      emoji:'\u{1F351}', name:'Peach',      basePoints:500,  mult:3, minLevel:1 },
]);

function fruitForLevel(level) {
  const pool = FRUITS.filter(f => f.id !== 'peach');
  // 60% chance: level-appropriate fruit (cherry on L1, strawberry on L2, etc.)
  // 40% chance: fully random from all fruits \u2014 keeps variety even on L1
  const levelIdx  = Math.min(level - 1, pool.length - 1);
  const canonical = Math.random() < 0.6 ? pool[levelIdx]
                  : pool[Math.floor(Math.random() * pool.length)];
  const peachChance = Math.min(0.15 + (level - 1) * 0.03, 0.40);
  return Math.random() < peachChance ? FRUITS.find(f => f.id === 'peach') : canonical;
}

// ??????????????????????????????????????????????????????????
// ? 6  BONUS FRUIT
// ??????????????????????????????????????????????????????????
class BonusFruit {
  #def; #x; #y; #timer; #collected=false; #bobFrame=0; #collectFrame=-1;

  constructor(def,x,y,duration=480){this.#def=def;this.#x=x;this.#y=y;this.#timer=duration;}

  get def()       { return this.#def; }
  get x()         { return this.#x; }
  get y()         { return this.#y; }
  get alive()     { return !this.#collected && this.#timer>0; }
  get collected() { return this.#collected; }

  collect() { this.#collected=true; this.#collectFrame=0; }
  get fadeComplete(){ return this.#collected && this.#collectFrame>=12; }

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

// ??????????????????????????????????????????????????????????
// ? 7  SCORE POPUP
// ??????????????????????????????????????????????????????????
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
    if(this.isTriple)ctx.fillText('\u{1F351}\u00D73',this.x,this.y-10);
    ctx.fillText(this.value,this.x,this.y);
    ctx.restore();
  }
}

// ??????????????????????????????????????????????????????????
// ? 8  EVENT BUS
// ??????????????????????????????????????????????????????????
class EventBus {
  #map=new Map();
  on(e,cb){if(!this.#map.has(e))this.#map.set(e,new Set());this.#map.get(e).add(cb);return()=>this.off(e,cb);}
  off(e,cb){this.#map.get(e)?.delete(cb);}
  emit(e,d){this.#map.get(e)?.forEach(cb=>cb(d));}
}
const bus=new EventBus();

// ??????????????????????????????????????????????????????????
// ? 9  SCORE MANAGER
// ??????????????????????????????????????????????????????????
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

// ??????????????????????????????????????????????????????????
// ? 10  MAP
// ??????????????????????????????????????????????????????????
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

// ??????????????????????????????????????????????????????????
// ? 11  MAZE
// ??????????????????????????????????????????????????????????
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

// ??????????????????????????????????????????????????????????
// ? 12  ENTITY BASE
// ??????????????????????????????????????????????????????????
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

// ??????????????????????????????????????????????????????????
// ? 13  PAC-MAN
// ??????????????????????????????????????????????????????????
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
    const r=CFG.TILE*0.47;
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
    if(!drawn) fbPacman(ctx,x,y,this.dx,this.dy,this.#mouth,false,0);
    else       fbMsPacBow(ctx,x,y,r); // bow + beauty mark over sprite too
  }
}

// ??????????????????????????????????????????????????????????
// ? 14  GHOST
//
// FIX 1 \u2014 exit position:
//   Old code placed ghosts at row 9 (col 10) then set dy=-1.
//   map[8][10] = WALL, so the very first move upward was always blocked.
//   Ghosts oscillated in the pen but never escaped.
//   Fix: on release, teleport to row 7, col 10 \u2014 the open corridor directly
//   above the ghost house. This matches how the original arcade handles the
//   moment a ghost passes through the door.
//
// FIX 2 \u2014 scatter / chase mode:
//   update() now accepts a `scatter` boolean forwarded from the Game's
//   phase timer.  #chooseDir() uses each ghost's home corner as its target
//   during scatter, and the normal chase AI during chase.
//   GHOST_DEFS now includes scatterTarget coordinates.
// ??????????????????????????????????????????????????????????
const GhostAI={
  blinky:(g,pac)=>({x:pac.x,y:pac.y}),
  pinky: (g,pac)=>({x:pac.x+pac.dx*CFG.TILE*4,y:pac.y+pac.dy*CFG.TILE*4}),
  inky:  (g,pac,all)=>{const b=all[0],px=pac.x+pac.dx*CFG.TILE*2,py=pac.y+pac.dy*CFG.TILE*2;return{x:px*2-b.x,y:py*2-b.y};},
  clyde: (g,pac)=>Math.hypot(g.x-pac.x,g.y-pac.y)>CFG.TILE*8?{x:pac.x,y:pac.y}:{x:0,y:CFG.ROWS*CFG.TILE},
};
const AI_FNS=[GhostAI.blinky,GhostAI.pinky,GhostAI.inky,GhostAI.clyde];

const GHOST_DEFS=Object.freeze([
  // Blinky starts OUTSIDE the house (original Pac-Man behaviour).
  // startOutside=true skips the inHouse logic entirely.
  {name:'BLINKY',color:'#FF0000',startCol:10,startRow:7, startOutside:true,
   scatterTarget:{x:CFG.COLS*CFG.TILE, y:0}},
  {name:'PINKY', color:'#FFB8FF',startCol:10,startRow:10,startOutside:false,
   scatterTarget:{x:0,                 y:0}},
  {name:'INKY',  color:'#00FFFF',startCol:9, startRow:10,startOutside:false,
   scatterTarget:{x:CFG.COLS*CFG.TILE, y:CFG.ROWS*CFG.TILE}},
  {name:'CLYDE', color:'#FFB852',startCol:11,startRow:10,startOutside:false,
   scatterTarget:{x:0,                 y:CFG.ROWS*CFG.TILE}},
]);

class Ghost extends Entity {
  #frightened=false; #eaten=false; #inHouse=true; #leaveTimer=0; #ai; #idx;
  #scatterTarget;
  color; name;

  constructor({name,color,startCol,startRow,scatterTarget,startOutside},idx,speed){
    const T=CFG.TILE;
    super(startCol*T+T/2,startRow*T+T/2,speed);
    this.name=name; this.color=color; this.#idx=idx;
    this.#ai=AI_FNS[idx];
    this.#scatterTarget=scatterTarget;
    if(startOutside){
      // Blinky: already in the corridor above the house, no house logic needed
      this.#inHouse=false;
      this.dx=1; this.dy=0;
      this.#leaveTimer=0;
    } else {
      // Pinky=0 frames, Inky=60 frames (1s), Clyde=120 frames (2s)
      this.#leaveTimer=[0,0,60,120][idx];
      this.dy=-1;
    }
  }

  get frightened(){return this.#frightened;}
  get eaten(){return this.#eaten;}
  get inHouse(){return this.#inHouse;}

  setFrightened(on){if(!this.#eaten)this.#frightened=on;}
  setEaten(){this.#eaten=true;this.#frightened=false;}

  resetToHouse(){
    this.#eaten=false; this.#inHouse=true; this.#leaveTimer=60;
    // Reset to centre of pen
    this.x=CFG.TILE*10+CFG.TILE/2;
    this.y=CFG.TILE*10+CFG.TILE/2;
    this.dx=0; this.dy=0;
  }

  // scatter=true  ? target home corner  (Scatter phase)
  // scatter=false ? run chase AI        (Chase phase)
  update(maze, pac, all, frame, scatter=false){
    const T=CFG.TILE;
    const spd=this.#eaten?this.speed*2:this.#frightened?this.speed*.5:this.speed;

    if(this.#inHouse){
      this.#leaveTimer--;
      this.y+=Math.sin(frame*.12+this.#idx*1.3)*.35;   // bob while waiting
      if(this.#leaveTimer<=0){
        this.#inHouse=false;
        // FIX: row 7 col 10 is an open (EMPTY=0) tile in the corridor above
        // the ghost house. Previous row 9 ? row 8 path hits map[8][10]=WALL.
        this.x=T*10+T/2;
        this.y=T*7+T/2;
        this.dx=(Math.random()<.5)?-1:1;  // spread left/right on exit
        this.dy=0;
      }
      return;
    }

    if(this.#eaten){
      const hx=T*10+T/2, hy=T*10+T/2;
      if(Math.hypot(this.x-hx,this.y-hy)<spd+1){this.resetToHouse();return;}
    }

    const aligned=Math.abs(this.x-this.tileX)<spd+.5&&Math.abs(this.y-this.tileY)<spd+.5;
    if(aligned){
      this.x=this.tileX; this.y=this.tileY;
      this.#chooseDir(maze,pac,all,scatter);
    }
    if(!this._hitsWall(maze,this.x+this.dx*spd,this.y+this.dy*spd)){
      this.x+=this.dx*spd; this.y+=this.dy*spd;
    } else {
      // Recover from mid-tile block (e.g. right after exiting house)
      this.#chooseDir(maze,pac,all,scatter);
    }
    this._wrapX();
  }

  #chooseDir(maze,pac,all,scatter=false){
    const T=CFG.TILE;
    const DIRS=[{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const valid=DIRS.filter(({dx,dy})=>
      !(dx===-this.dx&&dy===-this.dy)&&
      !this._hitsWall(maze,this.x+dx*T,this.y+dy*T)
    );
    if(!valid.length){
      const rev=DIRS.find(d=>d.dx===-this.dx&&d.dy===-this.dy);
      if(rev){this.dx=rev.dx;this.dy=rev.dy;}
      return;
    }
    if(this.#frightened){
      const p=valid[Math.floor(Math.random()*valid.length)];
      this.dx=p.dx;this.dy=p.dy;
      return;
    }
    // eaten ? head back to house; scatter ? home corner; chase ? AI target
    const target=this.#eaten
      ? {x:CFG.TILE*10+CFG.TILE/2, y:CFG.TILE*10+CFG.TILE/2}
      : scatter
        ? this.#scatterTarget
        : this.#ai(this,pac,all);

    const best=valid.reduce((acc,d)=>{
      const dist=Math.hypot(this.x+d.dx*T-target.x,this.y+d.dy*T-target.y);
      return dist<acc.dist?{...d,dist}:acc;
    },{dist:Infinity});
    if(best.dist<Infinity){this.dx=best.dx;this.dy=best.dy;}
  }

  draw(ctx,globalFrame,frightTimer){
    const {x,y}=this;
    ctx.save();
    if(this.#inHouse)ctx.globalAlpha=.5;
    let drawn=false;
    if(this.#eaten){
      let dirCol=0;
      if(this.dx>0)dirCol=0;else if(this.dx<0)dirCol=2;
      else if(this.dy<0)dirCol=4;else dirCol=6;
      dirCol+=Math.floor(globalFrame/8)%2;
      drawn=SPRITES.ghosts.blit(ctx,dirCol,6,x,y);
    } else if(this.#frightened){
      const flashing=frightTimer<60&&Math.floor(globalFrame/7)%2===0;
      const row=flashing?5:4;
      const col=Math.floor(globalFrame/6)%8;
      drawn=SPRITES.ghosts.blit(ctx,col,row,x,y);
    } else {
      const row=this.#idx;
      const col=ghostBodyCol(this.dx,this.dy,globalFrame);
      drawn=SPRITES.ghosts.blit(ctx,col,row,x,y);
    }
    if(!drawn)fbGhost(ctx,x,y,this.color,this.dx,this.dy,this.#frightened,frightTimer,globalFrame);
    ctx.restore();
  }
}

// ??????????????????????????????????????????????????????????
// ? 15  HUD
// ??????????????????????????????????????????????????????????
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
    if(btn)btn.textContent=muted?'\u{1F507} MUTED':'\u{1F50A} SOUND';
  },
  setActiveFruit(def){
    if(!def){
      document.getElementById('active-fruit-icon').textContent='\u00B7';
      document.getElementById('active-fruit-name').textContent='\u2014';
      document.getElementById('active-fruit-pts').textContent='';
      return;
    }
    const pts=def.basePoints*def.mult;
    document.getElementById('active-fruit-icon').textContent=def.emoji||def.name[0];
    document.getElementById('active-fruit-name').textContent=def.name+(def.mult>1?` \u00D7${def.mult}!`:'');
    document.getElementById('active-fruit-pts').textContent=`${pts} PTS`;
    document.getElementById('active-fruit-icon').style.color=def.id==='peach'?'#FFAB76':'';
  },
};

// ??????????????????????????????????????????????????????????
// ? 16  SCATTER / CHASE SCHEDULE
//
// Classic Pac-Man alternates scatter and chase in a fixed phase sequence.
// Durations in frames (?60 fps).
//   Level 1:  S7 C20 S7 C20 S5 C20 S5 C?
//   Level 2+: shorter scatter windows
// ??????????????????????????????????????????????????????????
function buildModeSchedule(level){
  const s7=420, s5=300, s1=60, c20=1200, cInf=Number.MAX_SAFE_INTEGER;
  if(level===1){
    return [
      {scatter:true, dur:s7},{scatter:false,dur:c20},
      {scatter:true, dur:s7},{scatter:false,dur:c20},
      {scatter:true, dur:s5},{scatter:false,dur:c20},
      {scatter:true, dur:s5},{scatter:false,dur:cInf},
    ];
  }
  return [
    {scatter:true, dur:s5},{scatter:false,dur:c20},
    {scatter:true, dur:s5},{scatter:false,dur:c20},
    {scatter:true, dur:s5},{scatter:false,dur:c20},
    {scatter:true, dur:s1},{scatter:false,dur:cInf},
  ];
}

// ??????????????????????????????????????????????????????????
// ? 17  GAME \u2014 state machine
// ??????????????????????????????????????????????????????????
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

  // Level countdown timer (frames)
  #levelTimer     = 0;
  #levelTimeLimit = 0;
  // Frame-based level-clear transition (replaces setTimeout)
  #levelClearTimer = 0;
  // TIME UP flash counter
  #timeUpFlash     = 0;

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

  // ?? START / INIT ????????????????????????????????????????
  startGame(){
    HUD.hide('overlay-start'); HUD.hide('overlay-gameover');
    this.#score.reset(); this.#level=1; this.#lives=3;
    HUD.setLevel(1); HUD.setLives(3);
    this.#initLevel();
    snd.start();
  }

  #initLevel(){
    this.#maze.clone();
    const T=CFG.TILE;
    this.#pac=new Pacman(10*T+T/2,16*T+T/2);
    const spd=Math.min(CFG.GHOST_SPEED+(this.#level-1)*.08,2.2);
    this.#ghosts=GHOST_DEFS.map((def,i)=>new Ghost(def,i,spd));
    this.#popups=[]; this.#bonus=null; this.#frightTimer=0;
    this.#dotEatenCount=0; this.#fruit1Spawned=false; this.#fruit2Spawned=false;
    this.#sirenFast=false;
    this.#score.resetGhostMul();

    // Build and start scatter/chase schedule for this level
    this.#modeSchedule=buildModeSchedule(this.#level);
    this.#modePhase=0;
    this.#scatterMode=this.#modeSchedule[0].scatter;
    this.#modeTimer=this.#modeSchedule[0].dur;

    // Level countdown: 120s on L1, shrinks by 10s per level, min 45s
    this.#levelTimeLimit = Math.max(45, 120 - (this.#level-1)*10) * 60;
    this.#levelTimer     = this.#levelTimeLimit;
    this.#timeUpFlash    = 0;

    this.#setState(STATE.READY);
    this.#readyTimer=CFG.READY_FRAMES;
    HUD.setReady(true); HUD.setActiveFruit(null);
    snd.sirenStop();
    snd.frightStop();
  }

  // ?? MAIN LOOP ???????????????????????????????????????????
  #loop=()=>{this.#update();this.#draw();requestAnimationFrame(this.#loop);};

  #update(){
    this.#frame++;
    switch(this.#state){
      case STATE.READY:
        if(--this.#readyTimer<=0){
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
        if(--this.#deathTimer<=0) this.#handleDeath();
        break;
      case STATE.TIMEOUT:
        // Flash TIME UP for 2 seconds then lose a life
        if(++this.#timeUpFlash>=120) this.#handleDeath();
        break;
      case STATE.LEVELCLEAR:
        // Auto-advance after ~2.4 s (144 frames)
        if(--this.#levelClearTimer<=0){
          HUD.hide('overlay-levelclear');
          this.#level++;
          HUD.setLevel(this.#level);
          this.#initLevel();
        }
        break;
    }
    this.#popups=this.#popups.filter(p=>{p.update();return p.alive;});
  }

  // ?? SCATTER / CHASE PHASE TIMER ?????????????????????????
  #tickModeTimer(){
    if(this.#frightTimer>0) return;   // pause cycle while frightened
    if(--this.#modeTimer<=0){
      const next=this.#modePhase+1;
      if(next<this.#modeSchedule.length){
        this.#modePhase=next;
        const ph=this.#modeSchedule[next];
        this.#scatterMode=ph.scatter;
        this.#modeTimer=ph.dur;
      } else {
        this.#scatterMode=false;
        this.#modeTimer=Number.MAX_SAFE_INTEGER;
      }
    }
  }

  #updatePlaying(){
    this.#tickModeTimer();

    // Level countdown
    if(--this.#levelTimer<=0) { this.#triggerTimeout(); return; }

    // Fright timer
    if(this.#frightTimer>0){
      this.#frightTimer--;
      if(this.#frightTimer===0){
        this.#ghosts.forEach(g=>g.setFrightened(false));
        snd.frightStop();
        snd.sirenStart();
      }
    }

    this.#pac.update(this.#maze);

    // Eat dot / power pellet
    const eaten=this.#maze.eat(this.#pac.col,this.#pac.row);
    if(eaten==='dot'){
      this.#score.add(CFG.SCORE.DOT);
      this.#dotEatenCount++;
      this.#checkFruitSpawn();
      snd.waka();
      if(!this.#sirenFast&&this.#maze.dotsLeft<30&&this.#frightTimer===0){
        this.#sirenFast=true;
        snd.sirenFast();
      }
    } else if(eaten==='power'){
      this.#score.add(CFG.SCORE.POWER);
      const dur=Math.max(CFG.FRIGHT_MIN,CFG.FRIGHT_BASE-(this.#level-1)*25);
      this.#frightTimer=dur;
      this.#score.resetGhostMul();
      this.#ghosts.forEach(g=>g.setFrightened(true));
      snd.power();
      snd.sirenStop();
      snd.frightStart();
    }

    // Bonus fruit \u2014 update every frame (not just while alive) so fade-out animates
    if(this.#bonus){
      this.#bonus.update();
      if(this.#bonus.alive){
        const dist=Math.hypot(this.#bonus.x-this.#pac.x,this.#bonus.y-this.#pac.y);
        if(dist<CFG.TILE*.8){
          const def=this.#bonus.def, pts=def.basePoints*def.mult;
          this.#score.add(pts);
          this.#popups.push(new ScorePopup(this.#bonus.x,this.#bonus.y,pts,def.mult>1));
          this.#bonus.collect();
          HUD.setActiveFruit(null);
          snd.fruit(def.id==='peach');
        }
      } else if(!this.#bonus.collected){
        // Timed out without being eaten
        HUD.setActiveFruit(null); this.#bonus=null;
      } else if(this.#bonus.fadeComplete){
        // Fade animation finished \u2014 remove from scene
        this.#bonus=null;
      }
    }

    // Ghost updates \u2014 pass current scatter mode flag
    this.#ghosts.forEach(g=>
      g.update(this.#maze,this.#pac,this.#ghosts,this.#frame,this.#scatterMode)
    );

    // Collision
    for(const ghost of this.#ghosts){
      const dist=Math.hypot(ghost.x-this.#pac.x,ghost.y-this.#pac.y);
      if(dist>=CFG.TILE*.75) continue;

      if(ghost.frightened){
        const pts=this.#score.ghostEaten();
        ghost.setEaten();
        this.#popups.push(new ScorePopup(ghost.x,ghost.y,pts));
        snd.ghost(this.#score.ghostMul);
        const anyFrightened=this.#ghosts.some(g=>g.frightened);
        if(!anyFrightened){snd.frightStop();snd.sirenStart();}
      } else if(!ghost.eaten&&!ghost.inHouse){
        snd.sirenStop();
        snd.frightStop();
        this.#setState(STATE.DYING);
        this.#deathTimer=CFG.DEATH_FRAMES;
        this.#pac.deathFrame=0;
        HUD.setReady(false);
        snd.death();
        return;
      }
    }

    if(this.#maze.cleared) this.#triggerLevelClear();
  }

  // ?? FRUIT SPAWN ?????????????????????????????????????????
  // Spawn position: col 10, row 16 = EMPTY (0) in BASE_MAP.
  #checkFruitSpawn(){
    const T=CFG.TILE, spawnX=10*T+T/2, spawnY=16*T+T/2;
    if(!this.#fruit1Spawned&&this.#dotEatenCount>=70){
      this.#fruit1Spawned=true; this.#spawnFruit(spawnX,spawnY);
    } else if(!this.#fruit2Spawned&&this.#dotEatenCount>=170){
      this.#fruit2Spawned=true; this.#spawnFruit(spawnX,spawnY);
    }
  }

  #spawnFruit(x,y){
    const def=fruitForLevel(this.#level);
    this.#bonus=new BonusFruit(def,x,y);
    HUD.setActiveFruit(def);
  }

  // ?? DEATH / GAME OVER / LEVEL CLEAR ????????????????????
  #handleDeath(){
    this.#lives--;
    HUD.setLives(this.#lives);
    if(this.#lives<=0){
      this.#triggerGameOver();
    } else {
      this.#initLevel();
    }
  }

  #triggerTimeout(){
    snd.sirenStop();
    snd.frightStop();
    snd.timeUp();
    this.#setState(STATE.TIMEOUT);
    this.#timeUpFlash = 0;
  }

  #triggerLevelClear(){
    this.#setState(STATE.LEVELCLEAR);
    snd.sirenStop();
    snd.frightStop();
    snd.levelClear();
    HUD.show('overlay-levelclear');
    this.#levelClearTimer = 144; // ~2.4 s at 60 fps \u2014 game loop counts it down
  }

  #triggerGameOver(){
    this.#setState(STATE.GAMEOVER);
    snd.sirenStop();
    snd.frightStop();
    HUD.setFinalScore(this.#score.score);
    const msgs=TRIBUTE.gameoverMessages;
    HUD.setGameOverMsg(msgs[Math.floor(Math.random()*msgs.length)]);
    HUD.show('overlay-gameover');
  }

  // ?? DRAW ????????????????????????????????????????????????
  #draw(){
    const ctx=this.#ctx;
    ctx.fillStyle='#000008';
    ctx.fillRect(0,0,this.#canvas.width,this.#canvas.height);
    this.#maze.draw(ctx,this.#frame);

    if(this.#state!==STATE.IDLE&&this.#state!==STATE.GAMEOVER){
      const dying=this.#state===STATE.DYING||this.#state===STATE.TIMEOUT;
      if(!dying||this.#pac.deathFrame<75) this.#pac.draw(ctx,this.#frame,this.#state===STATE.DYING);
      this.#bonus?.draw(ctx,this.#frame);
      this.#ghosts.forEach(g=>g.draw(ctx,this.#frame,this.#frightTimer));
      this.#popups.forEach(p=>p.draw(ctx));
    }

    // Level timer bar (bottom of canvas)
    if(this.#state===STATE.PLAYING||this.#state===STATE.READY){
      const pct  = this.#levelTimer / this.#levelTimeLimit;
      const bw   = this.#canvas.width;
      const bh   = 5;
      const by   = this.#canvas.height - bh;
      ctx.fillStyle='#111';
      ctx.fillRect(0, by, bw, bh);
      // Colour: green -> yellow -> red
      const barColor = pct>0.5?'#00DD44':pct>0.25?'#FFCC00':'#FF2222';
      ctx.fillStyle  = barColor;
      ctx.fillRect(0, by, bw*pct, bh);
      // Seconds label when below 30s
      const secs = Math.ceil(this.#levelTimer/60);
      if(secs<=30){
        const flash = secs<=10 && Math.floor(this.#frame/15)%2===0;
        ctx.save();
        ctx.globalAlpha = flash?0.4:1;
        ctx.fillStyle   = secs<=10?'#FF4444':'#FFCC00';
        ctx.font        = '7px "Press Start 2P"';
        ctx.textAlign   = 'right';
        ctx.textBaseline= 'bottom';
        ctx.fillText(`${secs}s`, bw-3, by-1);
        ctx.restore();
      }
    }

    // TIME UP flash overlay
    if(this.#state===STATE.TIMEOUT){
      const alpha=0.7*Math.abs(Math.sin(this.#timeUpFlash*0.13));
      ctx.save();
      ctx.globalAlpha=alpha;
      ctx.fillStyle='#FF2222';
      ctx.font='bold 14px "Press Start 2P"';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor='#FF0000'; ctx.shadowBlur=20;
      ctx.fillText('TIME UP!',this.#canvas.width/2,this.#canvas.height/2);
      ctx.restore();
    }

    // BABS / Ms. Pac-Man watermark
    if(this.#state===STATE.PLAYING){
      const cycle=this.#frame%700;
      if(cycle<140){
        const alpha=Math.sin((cycle/140)*Math.PI)*.055;
        ctx.save(); ctx.globalAlpha=alpha;
        ctx.fillStyle='#FF88BB'; ctx.font='bold 18px "Press Start 2P"';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('MS. BABS',this.#canvas.width/2,this.#canvas.height/2-10);
        ctx.font='12px "Playfair Display"'; ctx.fillStyle='#FFD4B0';
        ctx.fillText('Georgia Peach \u{1F351}',this.#canvas.width/2,this.#canvas.height/2+14);
        ctx.restore();
      }
    }
  }

  // ?? INPUT ???????????????????????????????????????????????
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
      if(e.key==='m'||e.key==='M'){
        const muted=snd.toggleMute();
        HUD.setMuteBtn(muted);
        return;
      }
      if(this.#state!==STATE.PLAYING) return;
      const dir=keyMap.get(e.key);
      if(dir){const[dx,dy]=dir;this.#pac.setDir(dx,dy);e.preventDefault();}
    });

    document.getElementById('mute-btn')?.addEventListener('click',()=>{
      const muted=snd.toggleMute();
      HUD.setMuteBtn(muted);
    });

    Object.entries({'dpad-up':[0,-1],'dpad-down':[0,1],'dpad-left':[-1,0],'dpad-right':[1,0]})
      .forEach(([id,[dx,dy]])=>{
        document.getElementById(id)?.addEventListener('touchstart',e=>{
          e.preventDefault(); tryStart();
          if(this.#state===STATE.PLAYING) this.#pac.setDir(dx,dy);
        },{passive:false});
      });

    let sx=0,sy=0;
    this.#canvas.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;tryStart();},{passive:true});
    this.#canvas.addEventListener('touchend',e=>{
      if(this.#state!==STATE.PLAYING) return;
      const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy;
      Math.abs(dx)>Math.abs(dy)?this.#pac.setDir(dx>0?1:-1,0):this.#pac.setDir(0,dy>0?1:-1);
    },{passive:true});
  }

  toggleMute(){ const m=snd.toggleMute(); HUD.setMuteBtn(m); return m; }
}

// ??????????????????????????????????????????????????????????
// SPLASH + BOOT
// ??????????????????????????????????????????????????????????
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
