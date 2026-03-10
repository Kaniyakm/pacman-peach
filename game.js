/**
 * BABS' PAC-MAN — Georgia Peach Edition
 * game.js — complete build with authentic Ms. Pac-Man sounds
 * For Barbara "Babs" Jackson 🍑
 */

'use strict';

// ── SOUND safety shim — never throws even if sound.js loads late ───────────
if (typeof window.SOUND === 'undefined') {
  const noop = () => {};
  window.SOUND = {
    play:noop, start:noop, waka:noop, power:noop,
    ghost:noop, eatGhost:noop,
    fruit:noop, death:noop, levelClear:noop,
    sirenStart:noop, sirenUpdate:noop, sirenFast:noop, sirenStop:noop,
    frightStart:noop, frightStop:noop,
    eyesStart:noop, eyesStop:noop,
    intermissionStart:(cb)=>{if(cb)cb();}, intermissionStop:noop, intermissionBump:noop,
    toggleMute:()=>false, isMuted:false,
  };
}
const SOUND = window.SOUND;

// ══════════════════════════════════════════════════════════
// § 1  CONSTANTS
// ══════════════════════════════════════════════════════════
const TRIBUTE = Object.freeze({
  name:'Barbara Jackson', nickname:'BABS', hiScore:3_333_330, hiYear:'1987',
  gameoverMessages:[
    "Babs would've kept going! 🍑","Sweet as a peach — try again! 🍑",
    "Georgia never quits! 🍑","One more for Babs! 🍑",
    "She never gave up — neither should you! 🍑",
    "Babs scored higher with her eyes closed! 🍑",
  ],
});

const T   = 18;   // tile size px
const CFG = Object.freeze({
  TILE:T, COLS:28, ROWS:31, CELL:32,
  PAC_SPEED:1.8, GHOST_SPEED:1.4,
  FRIGHT_BASE:300, FRIGHT_MIN:80,
  READY_FRAMES:150, DEATH_FRAMES:90,
  SCORE:Object.freeze({DOT:10, POWER:50, GHOST_BASE:200}),
  PEACH_DURATION:110,
  FRUIT_DURATION:400,
});

// Tile types
const TT = Object.freeze({WALL:1, DOT:2, POWER:3, EMPTY:0, HOUSE:4, DOOR:5});

// Scatter/chase phase durations (frames)
const PHASE_TIMES = [280,700,200,1600,200,1600,200,Infinity];

const STATE = Object.freeze({
  IDLE:Symbol(), READY:Symbol(), PLAYING:Symbol(),
  DYING:Symbol(), LEVELCLEAR:Symbol(), GAMEOVER:Symbol(),
});

// ══════════════════════════════════════════════════════════
// § 2  MAP  — 28×31 authentic Ms. Pac-Man style
//             col13 row14 = DOOR(5): ghosts pass, Pac-Man blocked
// ══════════════════════════════════════════════════════════
// 0=path(gets dot), 1=wall, 2=power pellet, 3=ghost house interior
// 4=door(ghost passable, pac blocked), 9=tunnel(no dot, wraps)
const BASE_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // 0
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1],  // 1
  [1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1],  // 2
  [1,2,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,2,1],  // 3  power pellets
  [1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1],  // 4
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // 5  full corridor
  [1,0,1,1,1,1,0,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,1,1,1,1,0,1],  // 6
  [1,0,1,1,1,1,0,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,1,1,1,1,0,1],  // 7
  [1,0,0,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0,0,1],  // 8
  [1,1,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,1,1],  // 9
  [1,1,1,1,1,1,0,1,1,1,1,1,0,0,0,0,1,1,1,1,1,0,1,1,1,1,1,1],  // 10
  [1,1,1,1,1,1,0,1,1,0,0,0,0,1,1,0,0,0,0,1,1,0,1,1,1,1,1,1],  // 11
  [9,9,9,9,9,9,0,1,1,0,1,1,3,3,3,3,1,1,0,1,1,0,9,9,9,9,9,9],  // 12  tunnel row
  [1,1,1,1,1,1,0,1,1,0,1,3,3,3,3,3,3,1,0,1,1,0,1,1,1,1,1,1],  // 13
  [1,1,1,1,1,1,0,0,0,0,1,3,4,3,3,4,3,1,0,0,0,0,1,1,1,1,1,1],  // 14  DOOR cols 12,15
  [9,9,9,9,9,9,0,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,9,9,9,9,9,9],  // 15  tunnel row
  [1,1,1,1,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,1,1,1,1,1,1],  // 16
  [1,1,1,1,1,1,0,1,1,0,1,1,1,0,0,1,1,1,0,1,1,0,1,1,1,1,1,1],  // 17
  [1,1,1,1,1,1,0,0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,1,1,1,1,1,1],  // 18
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1],  // 19  full corridor
  [1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1],  // 20
  [1,2,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,2,1],  // 21  power pellets
  [1,1,1,0,1,1,0,1,0,1,1,1,1,1,1,1,1,1,1,0,1,0,1,1,0,1,1,1],  // 22
  [1,1,1,0,0,0,0,1,0,0,0,0,0,1,1,0,0,0,0,0,1,0,0,0,0,0,1,1],  // 23
  [1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,1,1,1,1,1,1,1,1,0,0,1,1],  // 24
  [1,0,0,0,0,0,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,0,0,0,0,0,1],  // 25
  [1,0,1,1,1,1,0,1,1,1,1,1,0,0,0,0,1,1,1,1,1,0,1,1,1,1,0,1],  // 26
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],  // 27  full corridor
  [1,0,1,1,1,1,0,1,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,0,1],  // 28
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1],  // 29
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // 30
];

// Total dot count (pre-computed for siren tier math)
const TOTAL_DOTS = BASE_MAP.flat().filter(v => v === TT.DOT || v === TT.POWER).length;

// Fruit spawn spots — ALL verified as path cells (0) in BASE_MAP
const FRUIT_SPOTS = [
  {col:6,  row:5 },{col:21, row:5 },   // top full corridor
  {col:1,  row:8 },{col:26, row:8 },   // sides upper open
  {col:9,  row:10},{col:18, row:10},   // centre upper
  {col:1,  row:19},{col:26, row:19},   // sides lower open
  {col:6,  row:18},{col:21, row:18},   // lower inner
  {col:9,  row:27},{col:18, row:27},   // bottom full corridor
];

// ══════════════════════════════════════════════════════════
// § 3  SPRITES
// ══════════════════════════════════════════════════════════
class SpriteSheet {
  #img=null; #ready=false;
  constructor(src){
    this.#img=new Image();
    this.#img.onload=()=>{this.#ready=true;};
    this.#img.onerror=()=>console.warn('Sprite missing:',src);
    this.#img.src=src;
  }
  get ready(){return this.#ready;}
  blit(ctx,col,row,dx,dy,scale,flipX=false){
    if(!this.#ready)return false;
    const C=CFG.CELL,sc=scale??(T/C),dim=C*sc;
    ctx.save();
    if(flipX){ctx.translate(dx,dy);ctx.scale(-1,1);ctx.drawImage(this.#img,col*C,row*C,C,C,-dim/2,-dim/2,dim,dim);}
    else{ctx.drawImage(this.#img,col*C,row*C,C,C,dx-dim/2,dy-dim/2,dim,dim);}
    ctx.restore();return true;
  }
}
const SPRITES={
  pacman: new SpriteSheet('assets/sprites/pacman.png'),
  ghosts: new SpriteSheet('assets/sprites/ghosts.png'),
  fruits: new SpriteSheet('assets/sprites/fruits.png'),
  pellets:new SpriteSheet('assets/sprites/pellets.png'),
};

function pacRow(dx,dy){if(dy<0)return 1;if(dy>0)return 2;return 0;}
function pacCol(f){const n=f%16;return n<8?Math.floor(n/2):7-Math.floor(n/2);}
function ghostDirCol(dx,dy,f){
  let d=0;if(dx>0)d=0;else if(dx<0)d=1;else if(dy<0)d=2;else d=3;
  return d*2+(Math.floor(f/8)%2);
}
const FRUIT_COL=new Map([
  ['cherry',0],['strawberry',1],['orange',2],['apple',3],['melon',4],
  ['grapes',5],['watermelon',6],['bell',7],['key',8],['peach',9],
]);

// ══════════════════════════════════════════════════════════
// § 4  CANVAS FALLBACK DRAWING
// ══════════════════════════════════════════════════════════
function fbPacman(ctx,x,y,dx,dy,mouth,dying,df){
  const r=T*.47;ctx.save();ctx.translate(x,y);
  ctx.shadowColor='#FFD700';ctx.shadowBlur=14;
  const g=ctx.createRadialGradient(-r*.2,-r*.2,0,0,0,r);
  g.addColorStop(0,'#FFE88A');g.addColorStop(.6,'#FFD700');g.addColorStop(1,'#FF9900');
  ctx.fillStyle=g;
  if(dying){const p=Math.min(df/80,1),a=p*Math.PI*.97;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,a,Math.PI*2-a);ctx.closePath();ctx.fill();}
  else{ctx.rotate(Math.atan2(dy,dx||1));const m=mouth*Math.PI;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,m,Math.PI*2-m);ctx.closePath();ctx.fill();}
  ctx.restore();
}
function fbGhost(ctx,x,y,color,dx,dy,frightened,ft,frame){
  const r=T*.47;ctx.save();ctx.translate(x,y);
  let col=color;
  if(frightened)col=(ft<60&&Math.floor(frame/7)%2===0)?'#FFF':'#0000BB';
  ctx.shadowColor=frightened?'#000088':color;ctx.shadowBlur=10;ctx.fillStyle=col;
  ctx.beginPath();ctx.arc(0,-r*.05,r,Math.PI,0);
  const pts=[-r,-r/3,r/3,r];
  for(let i=0;i<3;i++){const mx=(pts[i]+pts[i+1])/2,py=i%2===0?r*.85:r*.5;ctx.quadraticCurveTo(mx,py,pts[i+1],r*(i%2===0?.5:.85));}
  ctx.closePath();ctx.fill();
  [[-0.3,-0.22],[0.3,-0.22]].forEach(([ex,ey])=>{
    ctx.fillStyle='white';ctx.beginPath();ctx.ellipse(r*ex,r*ey,r*.21,r*.25,0,0,Math.PI*2);ctx.fill();
    if(!frightened){ctx.fillStyle='#1144FF';ctx.beginPath();ctx.arc(r*ex+dx*r*.09,r*ey+dy*r*.09,r*.12,0,Math.PI*2);ctx.fill();}
  });
  ctx.restore();
}
function fbFruit(ctx,x,y,def){
  ctx.save();ctx.font=`${Math.round(T*.9)}px serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  if(def.id==='peach'){ctx.shadowColor='#FFAB76';ctx.shadowBlur=16;}
  ctx.fillText(def.emoji||def.name[0],x,y);ctx.restore();
}

// ══════════════════════════════════════════════════════════
// § 5  FRUITS
// ══════════════════════════════════════════════════════════
const FRUITS=Object.freeze([
  {id:'cherry',    emoji:'🍒',name:'Cherry',    basePoints:100, mult:1,minLevel:1},
  {id:'strawberry',emoji:'🍓',name:'Strawberry',basePoints:300, mult:1,minLevel:2},
  {id:'orange',    emoji:'🍊',name:'Orange',    basePoints:500, mult:1,minLevel:3},
  {id:'apple',     emoji:'🍎',name:'Apple',     basePoints:700, mult:1,minLevel:4},
  {id:'melon',     emoji:'🍈',name:'Melon',     basePoints:1000,mult:1,minLevel:5},
  {id:'grapes',    emoji:'🍇',name:'Grapes',    basePoints:2000,mult:1,minLevel:6},
  {id:'watermelon',emoji:'🍉',name:'Watermelon',basePoints:3000,mult:1,minLevel:7},
  {id:'bell',      emoji:'🔔',name:'Bell',      basePoints:3000,mult:1,minLevel:8},
  {id:'key',       emoji:'🗝️', name:'Key',       basePoints:5000,mult:1,minLevel:9},
  {id:'peach',     emoji:'🍑',name:'Peach',     basePoints:500, mult:3,minLevel:1},
]);
const PEACH_DEF = FRUITS.find(f=>f.id==='peach');

function fruitForLevel(level){
  const eligible=FRUITS.filter(f=>f.id!=='peach'&&f.minLevel<=level);
  return eligible.length?eligible[eligible.length-1]:FRUITS[0];
}

// ══════════════════════════════════════════════════════════
// § 6  BONUS FRUIT
// ══════════════════════════════════════════════════════════
class BonusFruit{
  #def;#x;#y;#maxTimer;#timer;#collected=false;#bobFrame=0;#collectFrame=-1;
  constructor(def,x,y,duration){
    this.#def=def;this.#x=x;this.#y=y;
    this.#maxTimer=duration;this.#timer=duration;
  }
  get def(){return this.#def;}
  get x(){return this.#x;}
  get y(){return this.#y;}
  get alive(){return !this.#collected&&this.#timer>0;}
  get collected(){return this.#collected;}
  collect(){this.#collected=true;this.#collectFrame=0;}
  update(){this.#timer--;this.#bobFrame++;if(this.#collectFrame>=0)this.#collectFrame++;}

  draw(ctx,_frame){
    if(!this.alive&&this.#collectFrame<0)return;
    const {x,y}=this;
    const bob=Math.sin(this.#bobFrame*.12)*2.5;
    const fade=this.#timer<50?this.#timer/50:1;
    const col=FRUIT_COL.get(this.#def.id)??0;
    const isPeach=this.#def.id==='peach';
    ctx.save();
    ctx.globalAlpha=this.#collected?Math.max(0,1-this.#collectFrame/12):fade;

    if(isPeach&&!this.#collected){
      const urgentFlash=this.#timer<40&&Math.floor(this.#bobFrame/3)%2===0;
      ctx.shadowColor='#FF7043';
      ctx.shadowBlur=20+10*Math.sin(this.#bobFrame*.25);
      if(urgentFlash)ctx.globalAlpha=0.25;
      ctx.save();
      ctx.font=`${Math.round(T*1.1)}px serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('🍑',x,y+bob);
      ctx.restore();
      if(this.#timer>this.#maxTimer-60){
        ctx.save();
        ctx.globalAlpha=(this.#maxTimer-this.#timer)/60*0.9;
        ctx.font='bold 7px "Press Start 2P"';
        ctx.fillStyle='#FF8C69';ctx.textAlign='center';
        ctx.fillText('CATCH!',x,y+bob-14);
        ctx.restore();
      }
    } else {
      const drawn=SPRITES.fruits.blit(ctx,col,0,x,y+bob);
      if(!drawn)fbFruit(ctx,x,y+bob,this.#def);
    }
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 7  SCORE POPUP
// ══════════════════════════════════════════════════════════
class ScorePopup{
  constructor(x,y,v,isTriple=false){this.x=x;this.y=y;this.v=v;this.isTriple=isTriple;this.life=75;}
  update(){this.y-=.55;this.life--;}
  get alive(){return this.life>0;}
  draw(ctx){
    ctx.save();ctx.globalAlpha=Math.min(this.life/28,1);
    const col=this.isTriple?'#FF8C69':'#00FFFF';
    ctx.fillStyle=col;ctx.shadowColor=col;ctx.shadowBlur=8;
    ctx.font=`bold ${this.isTriple?9:8}px "Press Start 2P"`;
    ctx.textAlign='center';
    if(this.isTriple)ctx.fillText('🍑×3',this.x,this.y-10);
    ctx.fillText(this.v,this.x,this.y);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 8  SCORE MANAGER
// ══════════════════════════════════════════════════════════
class ScoreManager{
  #score=0;#ghostMul=1;
  #sync(){document.getElementById('score').textContent=String(this.#score).padStart(7,'0');}
  add(pts){this.#score+=pts;this.#sync();}
  reset(){this.#score=0;this.#ghostMul=1;this.#sync();}
  get score(){return this.#score;}
  ghostEaten(){const p=CFG.SCORE.GHOST_BASE*this.#ghostMul;this.#ghostMul=Math.min(this.#ghostMul*2,8);this.add(p);return p;}
  resetGhostMul(){this.#ghostMul=1;}
  get ghostMul(){return this.#ghostMul;}
}

// ══════════════════════════════════════════════════════════
// § 9  MAZE
// ══════════════════════════════════════════════════════════
class Maze{
  #grid=[];#dotsLeft=0;

  clone(){
    this.#grid=BASE_MAP.map(r=>[...r]);
    this.#dotsLeft=this.#grid.flat().filter(v=>v===TT.DOT||v===TT.POWER).length;
    return this;
  }

  eat(col,row){
    const v=this.#grid[row]?.[col];
    if(v===TT.DOT){this.#grid[row][col]=TT.EMPTY;this.#dotsLeft--;return'dot';}
    if(v===TT.POWER){this.#grid[row][col]=TT.EMPTY;this.#dotsLeft--;return'power';}
    return null;
  }

  isWall(col,row){const v=this.#grid[row]?.[col];return v===TT.WALL;}
  isGhostPassable(col,row){const v=this.#grid[row]?.[col];return v!==undefined&&v!==TT.WALL;}
  isPacPassable(col,row){const v=this.#grid[row]?.[col];return v!==undefined&&v!==TT.WALL&&v!==TT.DOOR;}

  get dotsLeft(){return this.#dotsLeft;}
  get cleared(){return this.#dotsLeft<=0;}

  *walls(){for(let r=0;r<CFG.ROWS;r++)for(let c=0;c<CFG.COLS;c++){const v=this.#grid[r]?.[c];if(v===TT.WALL||v===TT.DOOR)yield{r,c,isDoor:v===TT.DOOR};}}
  *pickups(){for(let r=0;r<CFG.ROWS;r++)for(let c=0;c<CFG.COLS;c++){const v=this.#grid[r]?.[c];if(v===TT.DOT||v===TT.POWER)yield{r,c,type:v};}}

  draw(ctx,frame){
    ctx.fillStyle='#000008';
    ctx.fillRect(0,0,CFG.COLS*T,CFG.ROWS*T);

    for(const{r,c,isDoor}of this.walls()){
      const x=c*T,y=r*T;
      ctx.fillStyle='#07071e';ctx.fillRect(x,y,T,T);
      if(isDoor){
        ctx.save();
        ctx.strokeStyle='#FF8FA3';ctx.lineWidth=3;ctx.lineCap='round';
        ctx.shadowColor='#FF4D7A';ctx.shadowBlur=8;
        ctx.beginPath();ctx.moveTo(x+2,y+T/2);ctx.lineTo(x+T-2,y+T/2);ctx.stroke();
        ctx.restore();
      } else {
        this.#drawEdges(ctx,r,c,x,y,frame);
      }
    }

    for(const{r,c,type}of this.pickups()){
      const cx=c*T+T/2,cy=r*T+T/2;
      if(type===TT.DOT){
        const drawn=SPRITES.pellets.blit(ctx,0,0,cx,cy);
        if(!drawn){ctx.fillStyle='#FFB8AE';ctx.beginPath();ctx.arc(cx,cy,2.2,0,Math.PI*2);ctx.fill();}
      } else {
        const pCol=1+Math.floor(frame/8)%5;
        const drawn=SPRITES.pellets.blit(ctx,pCol,0,cx,cy);
        if(!drawn){
          const sc=.72+.28*Math.sin(frame*.14);
          ctx.save();ctx.shadowColor='#FFAB76';ctx.shadowBlur=14;
          ctx.fillStyle='#FFD4B0';ctx.beginPath();ctx.arc(cx,cy,5.8*sc,0,Math.PI*2);ctx.fill();ctx.restore();
        }
      }
    }
  }

  #drawEdges(ctx,r,c,x,y,frame){
    const iw=(dr,dc)=>{const v=this.#grid[r+dr]?.[c+dc];return v===TT.WALL||v===TT.DOOR;};
    ctx.save();
    const pulse=Math.sin(frame*.018)*.5+.5;
    const R=Math.round(210+45*pulse), G=Math.round(60+55*pulse), B=Math.round(160+20*(1-pulse));
    ctx.strokeStyle=`rgb(${R},${G},${B})`;
    ctx.shadowColor=`rgb(${R},${G},${B})`;
    ctx.shadowBlur=5;ctx.lineWidth=2;ctx.lineCap='round';
    [[!iw(-1,0),x,    y+1,   x+T,y+1  ],
     [!iw(1,0), x,    y+T-1, x+T,y+T-1],
     [!iw(0,-1),x+1,  y,     x+1,y+T  ],
     [!iw(0,1), x+T-1,y,     x+T-1,y+T]]
    .forEach(([show,x1,y1,x2,y2])=>{
      if(!show)return;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    });
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 10  ENTITY BASE
// ══════════════════════════════════════════════════════════
class Entity{
  constructor(x,y,speed){this.x=x;this.y=y;this.dx=0;this.dy=0;this.speed=speed;}
  get col(){return Math.round((this.x-T/2)/T);}
  get row(){return Math.round((this.y-T/2)/T);}
  _hitsPacWall(maze,nx,ny,m=.42){
    const mg=T*m;
    for(let r=Math.floor((ny-mg)/T);r<=Math.floor((ny+mg)/T);r++)
      for(let c=Math.floor((nx-mg)/T);c<=Math.floor((nx+mg)/T);c++)
        if(!maze.isPacPassable(c,r))return true;
    return false;
  }
  _wrapX(){const w=CFG.COLS*T;if(this.x<0)this.x=w;if(this.x>w)this.x=0;}
}

// ══════════════════════════════════════════════════════════
// § 11  PAC-MAN
// ══════════════════════════════════════════════════════════
class Pacman extends Entity{
  #mouth=.25;#mouthDir=1;#nextDx=0;#nextDy=0;
  deathFrame=0;
  constructor(x,y){super(x,y,CFG.PAC_SPEED);}
  setDir(dx,dy){this.#nextDx=dx;this.#nextDy=dy;}
  get isMoving(){return this.dx!==0||this.dy!==0;}

  update(maze){
    if((this.#nextDx!==this.dx||this.#nextDy!==this.dy)&&
       !this._hitsPacWall(maze,this.x+this.#nextDx*this.speed,this.y+this.#nextDy*this.speed))
      {this.dx=this.#nextDx;this.dy=this.#nextDy;}
    if(!this._hitsPacWall(maze,this.x+this.dx*this.speed,this.y+this.dy*this.speed))
      {this.x+=this.dx*this.speed;this.y+=this.dy*this.speed;}
    this._wrapX();
    this.#mouth+=.05*this.#mouthDir;
    if(this.#mouth>=.26||this.#mouth<=.01)this.#mouthDir*=-1;
  }

  draw(ctx,frame,dying=false){
    const{x,y}=this;
    if(dying){
      const col=Math.min(7,Math.floor(this.deathFrame/(CFG.DEATH_FRAMES/8)));
      if(!SPRITES.pacman.blit(ctx,col,3,x,y))fbPacman(ctx,x,y,this.dx,this.dy,this.#mouth,true,this.deathFrame);
      return;
    }
    if(!SPRITES.pacman.blit(ctx,pacCol(frame),pacRow(this.dx,this.dy),x,y,undefined,this.dx<0))
      fbPacman(ctx,x,y,this.dx,this.dy,this.#mouth,false,0);
  }
}

// ══════════════════════════════════════════════════════════
// § 12  GHOST
// ══════════════════════════════════════════════════════════
// Ghost house (28×31 map):
//   HOUSE cells:  row12–13 cols 12–15, row14 cols 11–17
//   DOOR cells:   row14 col 12 & col 15  (TT.DOOR=4)
//   Exit corridor: row 11, col 6–9 & 18–21 (open path)
//
// Exit phases for in-house ghosts:
//   0 = bob+wait   1 = slide to col13 centre   2 = rise to row11   3 = playing

const GHOST_DEFS=Object.freeze([
  // Blinky: starts outside above house at row 11
  {name:'BLINKY',color:'#FF0000',startCol:13,startRow:11,houseCol:13,houseRow:13},
  {name:'PINKY', color:'#FFB8FF',startCol:13,startRow:13,houseCol:13,houseRow:13},
  {name:'INKY',  color:'#00FFFF',startCol:12,startRow:13,houseCol:12,houseRow:13},
  {name:'CLYDE', color:'#FFB852',startCol:15,startRow:13,houseCol:15,houseRow:13},
]);

const SCATTER_TILES=[{col:25,row:1},{col:2,row:1},{col:25,row:29},{col:2,row:29}];
const AI_TARGET=[
  (g,pac)=>({col:pac.col,row:pac.row}),
  (g,pac)=>({col:pac.col+pac.dx*4,row:pac.row+pac.dy*4}),
  (g,pac,all)=>{const b=all[0],px=pac.col+pac.dx*2,py=pac.row+pac.dy*2;return{col:Math.round(px*2-b.col),row:Math.round(py*2-b.row)};},
  (g,pac)=>Math.hypot(g.col-pac.col,g.row-pac.row)>8?{col:pac.col,row:pac.row}:SCATTER_TILES[3],
];
const DIRS=[{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}];

class Ghost{
  color;name;dx=0;dy=0;x=0;y=0;
  #idx;#aiFn;#speed;
  #frightened=false;#eaten=false;#inHouse=true;
  #exitPhase=0;
  #leaveCountdown=0;
  // Track whether eyes sound is currently playing for this ghost
  #eyesSoundPlaying=false;

  constructor(def,idx,speed){
    this.name=def.name;this.color=def.color;
    this.#idx=idx;this.#aiFn=AI_TARGET[idx];this.#speed=speed;
    this.x=def.startCol*T+T/2;
    this.y=def.startRow*T+T/2;
    this.#leaveCountdown=[0,60,120,180][idx];
    if(idx===0){
      this.#inHouse=false;this.#exitPhase=3;this.dx=-1;this.dy=0;
    } else {
      this.dy=1;
    }
  }

  get col(){return Math.floor(this.x/T);}
  get row(){return Math.floor(this.y/T);}
  get frightened(){return this.#frightened;}
  get eaten(){return this.#eaten;}
  get inHouse(){return this.#inHouse;}

  setFrightened(on){
    if(this.#eaten)return;
    if(on&&!this.#frightened&&this.#exitPhase===3){this.dx=-this.dx;this.dy=-this.dy;}
    this.#frightened=on;
  }

  setEaten(){
    this.#eaten=true;this.#frightened=false;
    // Start eyes sound when first ghost gets eaten this fright
    if(!this.#eyesSoundPlaying){
      SOUND.eyesStart();
      this.#eyesSoundPlaying=true;
    }
  }

  resetToHouse(){
    const def=GHOST_DEFS[this.#idx];
    this.#eaten=false;this.#frightened=false;
    this.#inHouse=true;this.#exitPhase=0;
    this.#leaveCountdown=90;
    this.x=def.houseCol*T+T/2;
    this.y=def.houseRow*T+T/2;
    this.dx=0;this.dy=1;
    // Eyes sound stops when ghost fully returns
    if(this.#eyesSoundPlaying){
      SOUND.eyesStop();
      this.#eyesSoundPlaying=false;
    }
  }

  update(maze,pac,all,scatterPhase){
    const spd=this.#eaten?this.#speed*2.2:this.#frightened?this.#speed*0.5:this.#speed;

    // ── A: Eaten eyes — beeline to house through walls ─────────────────
    if(this.#eaten){
      const def=GHOST_DEFS[this.#idx];
      const hx=def.houseCol*T+T/2,hy=def.houseRow*T+T/2;
      if(Math.hypot(this.x-hx,this.y-hy)<spd+2){this.resetToHouse();return;}
      const dist=Math.hypot(hx-this.x,hy-this.y);
      this.x+=(hx-this.x)/dist*spd;
      this.y+=(hy-this.y)/dist*spd;
      return;
    }

    // ── B: Inside house — bob then exit ────────────────────────────────
    if(this.#inHouse){
      if(this.#exitPhase===0){
        this.y+=this.dy*spd*0.5;
        const baseY=GHOST_DEFS[this.#idx].houseRow*T+T/2;
        if(this.y>baseY+5)this.dy=-1;
        else if(this.y<baseY-5)this.dy=1;
        if(this.#leaveCountdown>0){this.#leaveCountdown--;return;}
        this.#exitPhase=1;this.dx=0;this.dy=0;
      }

      if(this.#exitPhase===1){
        const doorX=13*T+T/2;
        const diff=doorX-this.x;
        if(Math.abs(diff)<=spd+1){
          this.x=doorX;this.dx=0;this.dy=-1;this.#exitPhase=2;
        } else {
          this.x+=diff>0?spd:-spd;this.dy=0;
        }
        return;
      }

      if(this.#exitPhase===2){
        this.y-=spd;
        const targetY=11*T+T/2;
        if(this.y<=targetY){
          this.y=targetY;
          this.#inHouse=false;this.#exitPhase=3;
          this.dx=this.#idx%2===0?-1:1;this.dy=0;
        }
        return;
      }
    }

    // ── C: Normal maze movement ─────────────────────────────────────────
    const cx=this.col*T+T/2,cy=this.row*T+T/2;
    if(Math.abs(this.x-cx)<spd+0.5&&Math.abs(this.y-cy)<spd+0.5){
      this.x=cx;this.y=cy;
      const col=this.col,row=this.row;
      let valid=DIRS.filter(d=>{
        if(d.dx===-this.dx&&d.dy===-this.dy)return false;
        return maze.isGhostPassable(col+d.dx,row+d.dy);
      });
      if(!valid.length)valid=DIRS.filter(d=>maze.isGhostPassable(col+d.dx,row+d.dy));
      if(!valid.length)return;

      let chosen;
      if(this.#frightened){
        chosen=valid[Math.floor(Math.random()*valid.length)];
      } else {
        const target=scatterPhase
          ?SCATTER_TILES[this.#idx]
          :(()=>{const t=this.#aiFn(this,pac,all);return{col:Math.round(t.col),row:Math.round(t.row)};})();
        chosen=valid.reduce((best,d)=>{
          const dc=col+d.dx-target.col,dr=row+d.dy-target.row,dist=dc*dc+dr*dr;
          return dist<best.dist?{d,dist}:{...best};
        },{d:valid[0],dist:Infinity}).d;
      }
      this.dx=chosen.dx;this.dy=chosen.dy;
    }

    const nx=this.x+this.dx*spd,ny=this.y+this.dy*spd;
    const chkC=this.dx!==0?Math.floor((nx+this.dx*T*.45)/T):Math.floor(nx/T);
    const chkR=this.dy!==0?Math.floor((ny+this.dy*T*.45)/T):Math.floor(ny/T);
    if(maze.isGhostPassable(chkC,chkR)){this.x=nx;this.y=ny;}
    else{this.x=this.col*T+T/2;this.y=this.row*T+T/2;}

    const w=CFG.COLS*T;
    if(this.x<0)this.x=w;if(this.x>w)this.x=0;
  }

  draw(ctx,frame,ft){
    const{x,y}=this;
    ctx.save();
    if(this.#inHouse)ctx.globalAlpha=0.55;
    let drawn=false;
    if(this.#eaten){
      let dc=0;if(this.dx>0)dc=0;else if(this.dx<0)dc=2;else if(this.dy<0)dc=4;else dc=6;
      drawn=SPRITES.ghosts.blit(ctx,dc,6,x,y);
    } else if(this.#frightened){
      const flash=ft<60&&Math.floor(frame/7)%2===0;
      drawn=SPRITES.ghosts.blit(ctx,Math.floor(frame/6)%8,flash?5:4,x,y);
    } else {
      drawn=SPRITES.ghosts.blit(ctx,ghostDirCol(this.dx,this.dy,frame),this.#idx,x,y);
    }
    if(!drawn)fbGhost(ctx,x,y,this.color,this.dx,this.dy,this.#frightened,ft,frame);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════
// § 13  HUD
// ══════════════════════════════════════════════════════════
const HUD={
  setLevel(n){document.getElementById('level').textContent=String(n).padStart(2,'0');},
  setLives(n){document.querySelectorAll('.life-icon').forEach((el,i)=>el.classList.toggle('dead',i>=n));},
  show(id){document.getElementById(id)?.classList.remove('overlay--hidden');},
  hide(id){document.getElementById(id)?.classList.add('overlay--hidden');},
  setFinalScore(n){document.getElementById('final-score').textContent=String(n).padStart(7,'0');},
  setGameOverMsg(m){document.getElementById('gameover-msg').textContent=m;},
  setReady(on){document.getElementById('ready-text')?.classList.toggle('overlay--hidden',!on);},
  setMuteBtn(m){const b=document.getElementById('mute-btn');if(b)b.textContent=m?'🔇 MUTED':'🔊 SOUND';},
  setActiveFruit(def){
    if(!def){
      document.getElementById('active-fruit-icon').textContent='·';
      document.getElementById('active-fruit-name').textContent='—';
      document.getElementById('active-fruit-pts').textContent='';
      return;
    }
    const pts=def.basePoints*def.mult;
    document.getElementById('active-fruit-icon').textContent=def.emoji||def.name[0];
    document.getElementById('active-fruit-name').textContent=def.name+(def.mult>1?` ×${def.mult}!`:'');
    document.getElementById('active-fruit-pts').textContent=`${pts} PTS`;
    document.getElementById('active-fruit-icon').style.color=def.id==='peach'?'#FF8C69':'';
  },
};

// ══════════════════════════════════════════════════════════
// § 14  GAME
// ══════════════════════════════════════════════════════════
class Game{
  #canvas;#ctx;
  #maze=new Maze();
  #score=new ScoreManager();
  #pac=null;#ghosts=[];#popups=[];
  #state=STATE.IDLE;
  #frame=0;#frightTimer=0;#readyTimer=0;#deathTimer=0;
  #level=1;#lives=3;
  #dotEatenCount=0;
  #totalDotsThisLevel=0;
  #fruits=[];#fruitSpawnDots=[];#peachScheduled=false;
  #phaseTimer=0;#phaseIdx=0;#scatterPhase=true;
  #idleFrames=0;

  constructor(canvasId){
    this.#canvas=document.getElementById(canvasId);
    this.#ctx=this.#canvas.getContext('2d');
    this.#canvas.width=CFG.COLS*T;
    this.#canvas.height=CFG.ROWS*T;
    this.#bindInput();
    this.#maze.clone();
    document.getElementById('highscore').textContent=String(TRIBUTE.hiScore).padStart(7,'0');
    HUD.show('overlay-start');
    requestAnimationFrame(this.#loop);
  }

  #setState(s){this.#state=s;}

  startGame(){
    HUD.hide('overlay-start');HUD.hide('overlay-gameover');
    this.#score.reset();this.#level=1;this.#lives=3;
    HUD.setLevel(1);HUD.setLives(3);
    this.#initLevel();
    SOUND.start();
  }

  #initLevel(){
    this.#maze.clone();
    this.#totalDotsThisLevel=this.#maze.dotsLeft;
    this.#pac=new Pacman(4*T+T/2,23*T+T/2);
    const spd=Math.min(CFG.GHOST_SPEED+(this.#level-1)*.08,2.2);
    this.#ghosts=GHOST_DEFS.map((def,i)=>new Ghost(def,i,spd));
    this.#popups=[];this.#frightTimer=0;
    this.#dotEatenCount=0;this.#fruits=[];this.#peachScheduled=false;
    this.#phaseTimer=0;this.#phaseIdx=0;this.#scatterPhase=true;
    this.#idleFrames=0;
    this.#score.resetGhostMul();

    const total=this.#totalDotsThisLevel||240;
    this.#fruitSpawnDots=[
      Math.floor(total*.25+Math.random()*12),
      Math.floor(total*.55+Math.random()*12),
      Math.floor(total*.80+Math.random()*8),
    ].sort((a,b)=>a-b);

    this.#setState(STATE.READY);
    this.#readyTimer=CFG.READY_FRAMES;
    HUD.setReady(true);HUD.setActiveFruit(null);
    SOUND.sirenStop();SOUND.frightStop();SOUND.eyesStop();
  }

  #loop=()=>{this.#update();this.#draw();requestAnimationFrame(this.#loop);};

  #update(){
    this.#frame++;
    switch(this.#state){
      case STATE.READY:
        if(--this.#readyTimer<=0){
          this.#setState(STATE.PLAYING);
          HUD.setReady(false);
          // Start siren at correct tier for current dot count
          SOUND.sirenUpdate(this.#maze.dotsLeft, this.#totalDotsThisLevel);
        }
        break;
      case STATE.PLAYING: this.#updatePlaying(); break;
      case STATE.DYING:
        this.#pac.deathFrame++;
        if(--this.#deathTimer<=0)this.#handleDeath();
        break;
    }
    this.#popups=this.#popups.filter(p=>{p.update();return p.alive;});
  }

  #updatePlaying(){
    // Scatter/chase phase timer
    if(this.#frightTimer===0){
      this.#phaseTimer++;
      const limit=PHASE_TIMES[this.#phaseIdx]??Infinity;
      if(this.#phaseTimer>=limit){
        this.#phaseTimer=0;this.#phaseIdx++;
        this.#scatterPhase=!this.#scatterPhase;
        this.#ghosts.forEach(g=>{if(!g.inHouse&&!g.eaten){g.dx=-g.dx;g.dy=-g.dy;}});
      }
    }

    // Fright countdown
    if(this.#frightTimer>0){
      this.#frightTimer--;
      if(this.#frightTimer===0){
        this.#ghosts.forEach(g=>g.setFrightened(false));
        SOUND.frightStop();
        // Resume siren at correct tier
        SOUND.sirenUpdate(this.#maze.dotsLeft, this.#totalDotsThisLevel);
      }
    }

    this.#pac.update(this.#maze);

    // Idle mute: silence siren when pac-man hasn't moved for ~1.5s
    if(!this.#pac.isMoving){
      this.#idleFrames++;
      if(this.#idleFrames===90&&this.#frightTimer===0)SOUND.sirenStop();
    } else {
      if(this.#idleFrames>=90&&this.#frightTimer===0)
        SOUND.sirenUpdate(this.#maze.dotsLeft, this.#totalDotsThisLevel);
      this.#idleFrames=0;
    }

    // Eat dot / power pellet
    const eaten=this.#maze.eat(this.#pac.col,this.#pac.row);
    if(eaten==='dot'){
      this.#score.add(CFG.SCORE.DOT);
      this.#dotEatenCount++;
      this.#checkFruitSpawn();
      SOUND.waka();
      // ── sirenUpdate drives tier changes automatically every dot ──────
      if(this.#frightTimer===0 && this.#idleFrames<90)
        SOUND.sirenUpdate(this.#maze.dotsLeft, this.#totalDotsThisLevel);
    } else if(eaten==='power'){
      this.#score.add(CFG.SCORE.POWER);
      const dur=Math.max(CFG.FRIGHT_MIN,CFG.FRIGHT_BASE-(this.#level-1)*25);
      this.#frightTimer=dur;
      this.#score.resetGhostMul();
      this.#ghosts.forEach(g=>g.setFrightened(true));
      SOUND.power();
      SOUND.sirenStop();   // sirenUpdate handles restart after fright ends
      SOUND.frightStart();
    }

    // Fruit updates + collection
    for(const fruit of this.#fruits){
      if(!fruit.alive)continue;
      fruit.update();
      if(Math.hypot(fruit.x-this.#pac.x,fruit.y-this.#pac.y)<T*.9){
        const def=fruit.def,pts=def.basePoints*def.mult;
        this.#score.add(pts);
        this.#popups.push(new ScorePopup(fruit.x,fruit.y,pts,def.mult>1));
        fruit.collect();
        SOUND.fruit(def.id==='peach');
      }
    }
    this.#fruits=this.#fruits.filter(f=>f.alive||f.collected);
    const live=this.#fruits.find(f=>f.alive);
    HUD.setActiveFruit(live?live.def:null);

    // Ghost updates
    this.#ghosts.forEach(g=>g.update(this.#maze,this.#pac,this.#ghosts,this.#scatterPhase));

    // Ghost collisions
    for(const ghost of this.#ghosts){
      if(Math.hypot(ghost.x-this.#pac.x,ghost.y-this.#pac.y)>=T*.75)continue;
      if(ghost.frightened){
        const pts=this.#score.ghostEaten();
        ghost.setEaten();   // eyes sound triggered inside Ghost.setEaten()
        this.#popups.push(new ScorePopup(ghost.x,ghost.y,pts));
        SOUND.eatGhost(this.#score.ghostMul);
        // If no more frightened ghosts, end fright audio
        if(!this.#ghosts.some(g=>g.frightened)){
          SOUND.frightStop();
          SOUND.sirenUpdate(this.#maze.dotsLeft, this.#totalDotsThisLevel);
        }
      } else if(!ghost.eaten&&!ghost.inHouse){
        SOUND.sirenStop();SOUND.frightStop();SOUND.eyesStop();
        this.#setState(STATE.DYING);
        this.#deathTimer=CFG.DEATH_FRAMES;
        this.#pac.deathFrame=0;
        SOUND.death();
        return;
      }
    }

    if(this.#maze.cleared)this.#triggerLevelClear();
  }

  // ── Fruit spawning ────────────────────────────────────────
  #checkFruitSpawn(){
    while(this.#fruitSpawnDots.length&&this.#dotEatenCount>=this.#fruitSpawnDots[0]){
      this.#fruitSpawnDots.shift();
      this.#spawnFruitWave();
    }
  }

  #spawnFruitWave(){
    const occupied=new Set(this.#fruits.filter(f=>f.alive).map(f=>`${f.x|0},${f.y|0}`));
    const avail=[...FRUIT_SPOTS].filter(s=>{
      const px=(s.col*T+T/2)|0,py=(s.row*T+T/2)|0;
      return !occupied.has(`${px},${py}`);
    });
    for(let i=avail.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[avail[i],avail[j]]=[avail[j],avail[i]];}

    const count=Math.min(3,avail.length);
    for(let i=0;i<count;i++){
      const s=avail[i];
      this.#fruits.push(new BonusFruit(fruitForLevel(this.#level),s.col*T+T/2,s.row*T+T/2,CFG.FRUIT_DURATION));
    }

    if(!this.#peachScheduled){
      this.#peachScheduled=true;
      setTimeout(()=>{
        if(this.#state!==STATE.PLAYING)return;
        const busy=new Set(this.#fruits.filter(f=>f.alive).map(f=>`${f.x|0},${f.y|0}`));
        const pa=FRUIT_SPOTS.filter(s=>!busy.has(`${(s.col*T+T/2)|0},${(s.row*T+T/2)|0}`));
        if(!pa.length)return;
        const s=pa[Math.floor(Math.random()*pa.length)];
        this.#fruits.push(new BonusFruit(PEACH_DEF,s.col*T+T/2,s.row*T+T/2,CFG.PEACH_DURATION));
        SOUND.fruit(true);
      },2500);
    }
    HUD.setActiveFruit(fruitForLevel(this.#level));
  }

  // ── Death / level / game over ─────────────────────────────
  #handleDeath(){
    this.#lives--;HUD.setLives(this.#lives);
    if(this.#lives<=0)this.#triggerGameOver();
    else this.#initLevel();
  }

  #triggerLevelClear(){
    this.#setState(STATE.LEVELCLEAR);
    SOUND.sirenStop();SOUND.frightStop();SOUND.eyesStop();
    HUD.show('overlay-levelclear');
    // Play intermission music, advance level when it finishes (or after 9s max)
    let advanced = false;
    const advance = () => {
      if(advanced)return; advanced=true;
      SOUND.intermissionStop();
      HUD.hide('overlay-levelclear');
      this.#level++;HUD.setLevel(this.#level);
      this.#initLevel();
    };
    SOUND.intermissionStart(advance);
    // Safety timeout: if intermission WAV missing, synth fallback fires advance() itself
    // but cap total wait at 9.5s regardless
    setTimeout(advance, 9500);
  }

  #triggerGameOver(){
    this.#setState(STATE.GAMEOVER);
    SOUND.sirenStop();SOUND.frightStop();SOUND.eyesStop();
    HUD.setFinalScore(this.#score.score);
    HUD.setGameOverMsg(TRIBUTE.gameoverMessages[Math.floor(Math.random()*TRIBUTE.gameoverMessages.length)]);
    HUD.show('overlay-gameover');
  }

  // ── Draw ──────────────────────────────────────────────────
  #draw(){
    const ctx=this.#ctx;
    ctx.fillStyle='#000008';
    ctx.fillRect(0,0,this.#canvas.width,this.#canvas.height);
    this.#maze.draw(ctx,this.#frame);

    if(this.#state!==STATE.IDLE&&this.#state!==STATE.GAMEOVER){
      const dying=this.#state===STATE.DYING;
      if(!dying||this.#pac.deathFrame<75)this.#pac.draw(ctx,this.#frame,dying);
      this.#fruits.forEach(f=>f.draw(ctx,this.#frame));
      this.#ghosts.forEach(g=>g.draw(ctx,this.#frame,this.#frightTimer));
      this.#popups.forEach(p=>p.draw(ctx));
    }

    // BABS watermark — subtle pulse
    if(this.#state===STATE.PLAYING){
      const cycle=this.#frame%700;
      if(cycle<140){
        const alpha=Math.sin((cycle/140)*Math.PI)*.05;
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

  // ── Input ─────────────────────────────────────────────────
  #bindInput(){
    const keyMap=new Map([
      ['ArrowLeft',[-1,0]],['a',[-1,0]],['ArrowRight',[1,0]],['d',[1,0]],
      ['ArrowUp',[0,-1]],  ['w',[0,-1]],['ArrowDown',[0,1]],  ['s',[0,1]],
    ]);
    const tryStart=()=>{if(this.#state===STATE.IDLE||this.#state===STATE.GAMEOVER)this.startGame();};
    document.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){tryStart();return;}
      if(e.key==='m'||e.key==='M'){HUD.setMuteBtn(SOUND.toggleMute());return;}
      if(this.#state!==STATE.PLAYING)return;
      const dir=keyMap.get(e.key);
      if(dir){this.#pac.setDir(...dir);e.preventDefault();}
    });
    document.getElementById('mute-btn')?.addEventListener('click',()=>HUD.setMuteBtn(SOUND.toggleMute()));
    Object.entries({'dpad-up':[0,-1],'dpad-down':[0,1],'dpad-left':[-1,0],'dpad-right':[1,0]})
      .forEach(([id,[dx,dy]])=>{
        document.getElementById(id)?.addEventListener('touchstart',e=>{
          e.preventDefault();tryStart();
          if(this.#state===STATE.PLAYING)this.#pac.setDir(dx,dy);
        },{passive:false});
      });
    let sx=0,sy=0;
    this.#canvas.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;tryStart();},{passive:true});
    this.#canvas.addEventListener('touchend',e=>{
      if(this.#state!==STATE.PLAYING)return;
      const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
      Math.abs(dx)>Math.abs(dy)?this.#pac.setDir(dx>0?1:-1,0):this.#pac.setDir(0,dy>0?1:-1);
    },{passive:true});
  }

  toggleMute(){const m=SOUND.toggleMute();HUD.setMuteBtn(m);return m;}
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
