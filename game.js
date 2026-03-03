/**
 * BABS' PAC-MAN — Georgia Peach Edition
 * game.js  —  full game logic + sprite sheet rendering
 *
 * For Barbara "Babs" Jackson  🍑
 *
 * Sprite sheets (32px cells):
 *   assets/sprites/pacman.png   8×4  — right/up/down rows + death row
 *   assets/sprites/ghosts.png   8×7  — 4 ghosts + fright + flash + eyes
 *   assets/sprites/fruits.png  10×2  — all 10 fruits + glow row
 *   assets/sprites/pellets.png  6×2  — dot + 5 power frames
 */

'use strict';

// ══════════════════════════════════════════════════════════
// § 1  TRIBUTE
// ══════════════════════════════════════════════════════════
const TRIBUTE = Object.freeze({
  name:     'Barbara R. Jackson',
  nickname: 'BABS',
  hiScore:  3_333_330,
  hiYear:   '1995',
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
//
//  pacman.png  (256×128 = 8 cols × 4 rows × 32px)
//    row 0: RIGHT  8 mouth frames (open→close cycle)
//    row 1: UP     8 frames
//    row 2: DOWN   8 frames
//    row 3: DEATH  8 frames (shrink/collapse)
//
//  ghosts.png  (256×224 = 8 cols × 7 rows × 32px)
//    row 0: BLINKY  2 walk frames × 4 dirs (R L U D)
//    row 1: PINKY   same layout
//    row 2: INKY    same layout
//    row 3: CLYDE   same layout
//    row 4: FRIGHTENED 8 frames
//    row 5: FLASH   8 frames (fright ending)
//    row 6: EYES    4 dirs × 2
//
//  fruits.png  (320×64 = 10 cols × 2 rows × 32px)
//    cols: cherry strawberry orange apple melon
//          grapes watermelon bell key peach
//    row 0: normal   row 1: collection glow
//
//  pellets.png (192×64 = 6 cols × 2 rows × 32px)
//    col 0:   dot
//    col 1-5: power pellet pulse frames
//    row 0: normal   row 1: collected/burst
// ══════════════════════════════════════════════════════════

class SpriteSheet {
  #img   = null;
  #ready = false;
  #src;

  constructor(src) {
    this.#src = src;
    this.#img = new Image();
    this.#img.onload  = () => { this.#ready = true; };
    this.#img.onerror = () => console.warn(`Sprite load failed: ${src}`);
    this.#img.src = src;
  }

  get ready() { return this.#ready; }

  /**
   * blit — draw one 32×32 cell centred at (dx, dy) on canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} col   source column (0-based)
   * @param {number} row   source row    (0-based)
   * @param {number} dx    destination centre x
   * @param {number} dy    destination centre y
   * @param {number} scale optional scale (default = CFG.TILE/CFG.CELL)
   * @param {boolean} flipX mirror horizontally (for left-facing Pac-Man)
   */
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

// ── Sprite index helpers ──────────────────────────────────

/** Pac-Man sprite row from current direction */
function pacRow(dx, dy) {
  if (dy < 0) return 1;  // up
  if (dy > 0) return 2;  // down
  return 0;              // right (and left — flipped via ctx.scale)
}

/** Pac-Man mouth column (0–7) from global frame counter */
function pacCol(frame) {
  const f = frame % 16;
  return f < 8 ? Math.floor(f / 2) : 7 - Math.floor(f / 2);
}

/** Ghost body sprite column from direction + walk frame */
function ghostBodyCol(dx, dy, frame) {
  // Layout: R0 R1 | L0 L1 | U0 U1 | D0 D1
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
// § 4  CANVAS FALLBACKS  (used when sprites not yet loaded)
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
  // Eyes
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
// § 5  BONUS FRUIT
// ══════════════════════════════════════════════════════════
class BonusFruit {
  #def; #x; #y; #timer; #collected=false; #bobFrame=0; #collectFrame=-1;

  constructor(def,x,y,duration=480){this.#def=def;this.#x=x;this.#y=y;this.#timer=duration;}

  get def()       {return this.#def;}
  get x()         {return this.#x;}
  get y()         {return this.#y;}
  get alive()     {return !this.#collected && this.#timer>0;}
  get collected() {return this.#collected;}

  collect() {this.#collected=true; this.#collectFrame=0;}

  update() {
    this.#timer--;
    this.#bobFrame++;
    if (this.#collectFrame>=0) this.#collectFrame++;
  }

  draw(ctx, globalFrame) {
    if (!this.alive && this.#collectFrame<0) return;
    const {x,y}=this, T=CFG.TILE;
    const bob  = Math.sin(this.#bobFrame*.1)*2;
    const fade = this.#timer<90 ? this.#timer/90 : 1;
    const col  = FRUIT_COL.get(this.#def.id) ?? 0;

    ctx.save();
    ctx.globalAlpha = this.#collected ? Math.max(0,1-this.#collectFrame/12) : fade;

    // Try sprite — row 1 if just collected (glow), else row 0
    const row = (this.#collected && this.#collectFrame<8) ? 1 : 0;
    const drawn = SPRITES.fruits.blit(ctx, col, row, x, y+bob);
    if (!drawn) fbFruit(ctx, x, y+bob, this.#def);

    // Peach: extra shimmer glow on row 0 using sprite sheet row 1 blended
    if (!this.#collected && this.#def.id==='peach') {
      const pulse = 0.3+0.25*Math.sin(this.#bobFrame*.12);
      ctx.globalAlpha = fade*pulse;
      SPRITES.fruits.blit(ctx, col, 1, x, y+bob);
    }
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 6  SCORE POPUP
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
// § 7  EVENT BUS
// ══════════════════════════════════════════════════════════
class EventBus {
  #map=new Map();
  on(e,cb){if(!this.#map.has(e))this.#map.set(e,new Set());this.#map.get(e).add(cb);return()=>this.off(e,cb);}
  off(e,cb){this.#map.get(e)?.delete(cb);}
  emit(e,d){this.#map.get(e)?.forEach(cb=>cb(d));}
}
const bus=new EventBus();

// ══════════════════════════════════════════════════════════
// § 8  SCORE MANAGER  — BABS' hi-score is sacred
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
}

// ══════════════════════════════════════════════════════════
// § 9  MAP
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
// § 10  MAZE
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
        // Sprite col 0 row 0
        const drawn = SPRITES.pellets.blit(ctx,0,0,cx,cy);
        if(!drawn){ctx.fillStyle='#FFB8AE';ctx.beginPath();ctx.arc(cx,cy,2.2,0,Math.PI*2);ctx.fill();}
      } else {
        // Power pellet: animate through cols 1-5
        const pCol = 1 + Math.floor(frame/8)%5;
        const drawn = SPRITES.pellets.blit(ctx,pCol,0,cx,cy);
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
// § 11  ENTITY BASE
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
// § 12  PAC-MAN  (sprite-driven + canvas fallback)
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
      const row=3;
      const col=Math.min(7,Math.floor(this.deathFrame/(CFG.DEATH_FRAMES/8)));
      const drawn=SPRITES.pacman.blit(ctx,col,row,x,y);
      if(!drawn)fbPacman(ctx,x,y,this.dx,this.dy,this.#mouth,true,this.deathFrame);
      return;
    }

    const row     = pacRow(this.dx,this.dy);
    const col     = pacCol(globalFrame);
    const flipX   = this.dx<0;   // mirror sprite for left-facing
    const drawn   = SPRITES.pacman.blit(ctx,col,row,x,y,undefined,flipX);
    if(!drawn)fbPacman(ctx,x,y,this.dx,this.dy,this.#mouth,false,0);
  }
}

// ══════════════════════════════════════════════════════════
// § 13  GHOST  (sprite-driven + canvas fallback)
// ══════════════════════════════════════════════════════════
const GhostAI={
  blinky:(g,pac)=>{return{x:pac.x,y:pac.y};},
  pinky: (g,pac)=>{return{x:pac.x+pac.dx*CFG.TILE*4,y:pac.y+pac.dy*CFG.TILE*4};},
  inky:  (g,pac,all)=>{const b=all[0],px=pac.x+pac.dx*CFG.TILE*2,py=pac.y+pac.dy*CFG.TILE*2;return{x:px*2-b.x,y:py*2-b.y};},
  clyde: (g,pac)=>Math.hypot(g.x-pac.x,g.y-pac.y)>CFG.TILE*8?{x:pac.x,y:pac.y}:{x:0,y:CFG.ROWS*CFG.TILE},
};
const AI_FNS=[GhostAI.blinky,GhostAI.pinky,GhostAI.inky,GhostAI.clyde];

const GHOST_DEFS=Object.freeze([
  {name:'BLINKY',color:'#FF0000',startCol:10,startRow:9},
  {name:'PINKY', color:'#FFB8FF',startCol:9, startRow:10},
  {name:'INKY',  color:'#00FFFF',startCol:10,startRow:10},
  {name:'CLYDE', color:'#FFB852',startCol:11,startRow:10},
]);

class Ghost extends Entity {
  #frightened=false;#eaten=false;#inHouse=true;#leaveTimer=0;#ai;#idx;
  color;name;

  constructor({name,color,startCol,startRow},idx,speed){
    const T=CFG.TILE;super(startCol*T+T/2,startRow*T+T/2,speed);
    this.name=name;this.color=color;this.#idx=idx;this.#ai=AI_FNS[idx];this.#leaveTimer=idx*90;this.dy=-1;
  }

  get frightened(){return this.#frightened;}
  get eaten(){return this.#eaten;}
  get inHouse(){return this.#inHouse;}

  setFrightened(on){if(!this.#eaten)this.#frightened=on;}
  setEaten(){this.#eaten=true;this.#frightened=false;}

  resetToHouse(){
    this.#eaten=false;this.#inHouse=true;this.#leaveTimer=60;
    this.x=CFG.TILE*10+CFG.TILE/2;this.y=CFG.TILE*9+CFG.TILE/2;
  }

  update(maze,pac,all,frame){
    const T=CFG.TILE;
    const spd=this.#eaten?this.speed*2:this.#frightened?this.speed*.5:this.speed;
    if(this.#inHouse){
      this.#leaveTimer--;
      this.y+=Math.sin(frame*.12+this.#idx*1.3)*.35;
      if(this.#leaveTimer<=0){this.#inHouse=false;this.x=T*10+T/2;this.y=T*9+T/2;this.dx=0;this.dy=-1;}
      return;
    }
    if(this.#eaten){const hx=T*10+T/2,hy=T*9+T/2;if(Math.hypot(this.x-hx,this.y-hy)<spd+1){this.resetToHouse();return;}}
    const aligned=Math.abs(this.x-this.tileX)<spd+.5&&Math.abs(this.y-this.tileY)<spd+.5;
    if(aligned){this.x=this.tileX;this.y=this.tileY;this.#chooseDir(maze,pac,all);}
    if(!this._hitsWall(maze,this.x+this.dx*spd,this.y+this.dy*spd)){this.x+=this.dx*spd;this.y+=this.dy*spd;}
    this._wrapX();
  }

  #chooseDir(maze,pac,all){
    const T=CFG.TILE,DIRS=[{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const valid=DIRS.filter(({dx,dy})=>!(dx===-this.dx&&dy===-this.dy)&&!this._hitsWall(maze,this.x+dx*T,this.y+dy*T));
    if(!valid.length){const rev=DIRS.find(d=>d.dx===-this.dx&&d.dy===-this.dy);if(rev){this.dx=rev.dx;this.dy=rev.dy;}return;}
    if(this.#frightened){const p=valid[Math.floor(Math.random()*valid.length)];this.dx=p.dx;this.dy=p.dy;return;}
    const target=this.#eaten?{x:CFG.TILE*10+T/2,y:CFG.TILE*9+T/2}:this.#ai(this,pac,all);
    const best=valid.reduce((acc,d)=>{const dist=Math.hypot(this.x+d.dx*T-target.x,this.y+d.dy*T-target.y);return dist<acc.dist?{...d,dist}:acc;},{dist:Infinity});
    if(best.dist<Infinity){this.dx=best.dx;this.dy=best.dy;}
  }

  draw(ctx,globalFrame,frightTimer){
    const {x,y}=this;
    ctx.save();
    if(this.#inHouse)ctx.globalAlpha=.5;

    let drawn=false;
    if(this.#eaten){
      // Eyes only — row 6, col based on direction
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

// ══════════════════════════════════════════════════════════
// § 14  HUD
// ══════════════════════════════════════════════════════════
const HUD={
  setLevel(n){document.getElementById('level').textContent=String(n).padStart(2,'0');},
  setLives(n){document.querySelectorAll('.life-icon').forEach((el,i)=>el.classList.toggle('dead',i>=n));},
  show(id){document.getElementById(id)?.classList.remove('overlay--hidden');},
  hide(id){document.getElementById(id)?.classList.add('overlay--hidden');},
  setFinalScore(n){document.getElementById('final-score').textContent=String(n).padStart(7,'0');},
  setGameOverMsg(m){document.getElementById('gameover-msg').textContent=m;},
  setReady(on){document.getElementById('ready-text')?.classList.toggle('overlay--hidden',!on);},
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
// § 15  GAME — state machine
// ══════════════════════════════════════════════════════════
class Game {
  #canvas;#ctx;
  #maze=new Maze();
  #score=new ScoreManager();
  #pac=null;
  #ghosts=[];
  #popups=[];
  #bonus=null;
  #state=STATE.IDLE;
  #frame=0;
  #frightTimer=0;
  #readyTimer=0;
  #deathTimer=0;
  #level=1;
  #lives=3;
  #dotEatenCount=0;
  #fruit1Spawned=false;
  #fruit2Spawned=false;

  constructor(canvasId){
    this.#canvas=document.getElementById(canvasId);
    this.#ctx=this.#canvas.getContext('2d');
    this.#canvas.width=CFG.COLS*CFG.TILE;
    this.#canvas.height=CFG.ROWS*CFG.TILE;
    this.#bindInput();
    this.#maze.clone();   // pre-load grid so first draw frame never hits empty array
    document.getElementById('highscore').textContent=String(TRIBUTE.hiScore).padStart(7,'0');
    HUD.show('overlay-start');
    requestAnimationFrame(this.#loop);
  }

  #setState(s){this.#state=s;bus.emit('state:change',s);}

  startGame(){
    HUD.hide('overlay-start');HUD.hide('overlay-gameover');
    this.#score.reset();this.#level=1;this.#lives=3;
    HUD.setLevel(1);HUD.setLives(3);
    this.#initLevel();
  }

  #initLevel(){
    this.#maze.clone();
    const T=CFG.TILE;
    this.#pac=new Pacman(10*T+T/2,16*T+T/2);
    const spd=Math.min(CFG.GHOST_SPEED+(this.#level-1)*.08,2.2);
    this.#ghosts=GHOST_DEFS.map((def,i)=>new Ghost(def,i,spd));
    this.#popups=[];this.#bonus=null;this.#frightTimer=0;
    this.#dotEatenCount=0;this.#fruit1Spawned=false;this.#fruit2Spawned=false;
    this.#score.resetGhostMul();
    this.#setState(STATE.READY);
    this.#readyTimer=CFG.READY_FRAMES;
    HUD.setReady(true);HUD.setActiveFruit(null);
  }

  #loop=()=>{this.#update();this.#draw();requestAnimationFrame(this.#loop);};

  #update(){
    this.#frame++;
    switch(this.#state){
      case STATE.READY:
        if(--this.#readyTimer<=0){this.#setState(STATE.PLAYING);HUD.setReady(false);}break;
      case STATE.PLAYING:this.#updatePlaying();break;
      case STATE.DYING:
        this.#pac.deathFrame++;
        if(--this.#deathTimer<=0)this.#handleDeath();break;
    }
    this.#popups=this.#popups.filter(p=>{p.update();return p.alive;});
  }

  #updatePlaying(){
    if(this.#frightTimer>0&&--this.#frightTimer===0)this.#ghosts.forEach(g=>g.setFrightened(false));
    this.#pac.update(this.#maze);

    const eaten=this.#maze.eat(this.#pac.col,this.#pac.row);
    if(eaten==='dot'){
      this.#score.add(CFG.SCORE.DOT);this.#dotEatenCount++;this.#checkFruitSpawn();
    } else if(eaten==='power'){
      this.#score.add(CFG.SCORE.POWER);
      const dur=Math.max(CFG.FRIGHT_MIN,CFG.FRIGHT_BASE-(this.#level-1)*25);
      this.#frightTimer=dur;this.#score.resetGhostMul();
      this.#ghosts.forEach(g=>g.setFrightened(true));
    }

    if(this.#bonus?.alive){
      this.#bonus.update();
      const dist=Math.hypot(this.#bonus.x-this.#pac.x,this.#bonus.y-this.#pac.y);
      if(dist<CFG.TILE*.8){
        const def=this.#bonus.def,pts=def.basePoints*def.mult;
        this.#score.add(pts);
        this.#popups.push(new ScorePopup(this.#bonus.x,this.#bonus.y,pts,def.mult>1));
        this.#bonus.collect();HUD.setActiveFruit(null);
      }
    } else if(this.#bonus&&!this.#bonus.alive&&!this.#bonus.collected){
      HUD.setActiveFruit(null);this.#bonus=null;
    }

    this.#ghosts.forEach(g=>g.update(this.#maze,this.#pac,this.#ghosts,this.#frame));

    for(const ghost of this.#ghosts){
      const dist=Math.hypot(ghost.x-this.#pac.x,ghost.y-this.#pac.y);
      if(dist>=CFG.TILE*.75)continue;
      if(ghost.frightened){const pts=this.#score.ghostEaten();ghost.setEaten();this.#popups.push(new ScorePopup(ghost.x,ghost.y,pts));}
      else if(!ghost.eaten&&!ghost.inHouse){this.#setState(STATE.DYING);this.#deathTimer=CFG.DEATH_FRAMES;this.#pac.deathFrame=0;HUD.setReady(false);return;}
    }
    if(this.#maze.cleared)this.#triggerLevelClear();
  }

  #checkFruitSpawn(){
    const T=CFG.TILE,spawnX=10*T+T/2,spawnY=17*T+T/2;
    if(!this.#fruit1Spawned&&this.#dotEatenCount>=70){this.#fruit1Spawned=true;this.#spawnFruit(spawnX,spawnY);}
    else if(!this.#fruit2Spawned&&this.#dotEatenCount>=170){this.#fruit2Spawned=true;this.#spawnFruit(spawnX,spawnY);}
  }

  #spawnFruit(x,y){const def=fruitForLevel(this.#level);this.#bonus=new BonusFruit(def,x,y);HUD.setActiveFruit(def);}

  #handleDeath(){this.#lives--;HUD.setLives(this.#lives);if(this.#lives<=0)this.#triggerGameOver();else this.#initLevel();}

  #triggerLevelClear(){
    this.#setState(STATE.LEVELCLEAR);HUD.show('overlay-levelclear');
    setTimeout(()=>{HUD.hide('overlay-levelclear');this.#level++;HUD.setLevel(this.#level);this.#initLevel();},2400);
  }

  #triggerGameOver(){
    this.#setState(STATE.GAMEOVER);HUD.setFinalScore(this.#score.score);
    const msgs=TRIBUTE.gameoverMessages;HUD.setGameOverMsg(msgs[Math.floor(Math.random()*msgs.length)]);
    HUD.show('overlay-gameover');
  }

  #draw(){
    const ctx=this.#ctx;
    ctx.fillStyle='#000008';ctx.fillRect(0,0,this.#canvas.width,this.#canvas.height);
    this.#maze.draw(ctx,this.#frame);

    if(this.#state!==STATE.IDLE&&this.#state!==STATE.GAMEOVER){
      const dying=this.#state===STATE.DYING;
      if(!dying||this.#pac.deathFrame<75)this.#pac.draw(ctx,this.#frame,dying);
      this.#bonus?.draw(ctx,this.#frame);
      this.#ghosts.forEach(g=>g.draw(ctx,this.#frame,this.#frightTimer));
      this.#popups.forEach(p=>p.draw(ctx));
    }

    // BABS watermark — soft pulse every 700 frames
    if(this.#state===STATE.PLAYING){
      const cycle=this.#frame%700;
      if(cycle<140){
        const alpha=Math.sin((cycle/140)*Math.PI)*.055;
        ctx.save();ctx.globalAlpha=alpha;
        ctx.fillStyle='#FFAB76';ctx.font='bold 18px "Press Start 2P"';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('B A B S',this.#canvas.width/2,this.#canvas.height/2-10);
        ctx.font='12px "Playfair Display"';ctx.fillStyle='#FFD4B0';
        ctx.fillText('Georgia Peach 🍑',this.#canvas.width/2,this.#canvas.height/2+14);
        ctx.restore();
      }
    }
  }

  #bindInput(){
    const keyMap=new Map([
      ['ArrowLeft',[-1,0]],['a',[-1,0]],['ArrowRight',[1,0]],['d',[1,0]],
      ['ArrowUp',[0,-1]],  ['w',[0,-1]],['ArrowDown',[0,1]], ['s',[0,1]],
    ]);
    const tryStart=()=>{if(this.#state===STATE.IDLE||this.#state===STATE.GAMEOVER)this.startGame();};
    document.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){tryStart();return;}
      if(this.#state!==STATE.PLAYING)return;
      const dir=keyMap.get(e.key);
      if(dir){const[dx,dy]=dir;this.#pac.setDir(dx,dy);e.preventDefault();}
    });
    Object.entries({'dpad-up':[0,-1],'dpad-down':[0,1],'dpad-left':[-1,0],'dpad-right':[1,0]})
      .forEach(([id,[dx,dy]])=>{
        document.getElementById(id)?.addEventListener('touchstart',e=>{e.preventDefault();tryStart();if(this.#state===STATE.PLAYING)this.#pac.setDir(dx,dy);},{passive:false});
      });
    let sx=0,sy=0;
    this.#canvas.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;tryStart();},{passive:true});
    this.#canvas.addEventListener('touchend',e=>{
      if(this.#state!==STATE.PLAYING)return;
      const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
      Math.abs(dx)>Math.abs(dy)?this.#pac.setDir(dx>0?1:-1,0):this.#pac.setDir(0,dy>0?1:-1);
    },{passive:true});
  }
}

// ══════════════════════════════════════════════════════════
// SPLASH + BOOT
// ══════════════════════════════════════════════════════════
const splash=document.getElementById('splash');
const dismissSplash=()=>{splash.classList.add('fade-out');setTimeout(()=>splash.classList.add('gone'),800);};
setTimeout(dismissSplash,5000);
splash.addEventListener('click',dismissSplash,{once:true});
document.addEventListener('keydown',dismissSplash,{once:true});

const game=new Game('canvas');
window.__babs__=game;
