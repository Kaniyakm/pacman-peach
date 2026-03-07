/**
 * BABS' PAC-MAN — Georgia Peach Edition  v3.0
 * game.js  — complete verified rewrite
 * For Barbara "Babs" Jackson 🍑
 *
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  SOUND ENGINE  — rebuilt, zero-click Web Audio
// ═══════════════════════════════════════════════════════════════
const snd = (() => {
  let AC = null;
  let muted = false;
  let sirenNode  = null;
  let frightNode = null;
  let sirenIsFast = false;
  let wakaPhase  = 0;
  let wakaNextOK = 0;

  function ac() {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  // Waka: throttled to 85ms minimum gap between calls
  function waka() {
    if (muted) return;
    const c=ac(), now=c.currentTime;
    if (now < wakaNextOK) return;
    wakaNextOK = now + 0.085;
    const f = wakaPhase++%2===0 ? 370 : 250;
    const dur=0.075;
    const g=c.createGain();
    g.gain.setValueAtTime(0.22,now);
    g.gain.linearRampToValueAtTime(0.0001,now+dur);
    g.connect(c.destination);
    const o=c.createOscillator();
    o.type='square'; o.frequency.setValueAtTime(f,now);
    o.frequency.linearRampToValueAtTime(f*0.65,now+dur);
    o.connect(g); o.start(now); o.stop(now+dur+0.01);
  }

  function power() {
    if (muted) return;
    const c=ac(),now=c.currentTime,dur=0.50;
    const g=c.createGain();
    g.gain.setValueAtTime(0.32,now);
    g.gain.linearRampToValueAtTime(0.0001,now+dur);
    g.connect(c.destination);
    const o=c.createOscillator();
    o.type='sawtooth';
    o.frequency.setValueAtTime(130,now);
    o.frequency.linearRampToValueAtTime(48,now+dur);
    o.connect(g); o.start(now); o.stop(now+dur+0.02);
  }

  function ghost(mul=1) {
    if (muted) return;
    const c=ac(),now=c.currentTime,f0=260+mul*70,dur=0.18;
    const g=c.createGain();
    g.gain.setValueAtTime(0.28,now);
    g.gain.linearRampToValueAtTime(0.0001,now+dur);
    g.connect(c.destination);
    const o=c.createOscillator();
    o.type='square';
    o.frequency.setValueAtTime(f0,now);
    o.frequency.exponentialRampToValueAtTime(f0*2.4,now+dur*0.8);
    o.connect(g); o.start(now); o.stop(now+dur+0.02);
  }

  function death() {
    if (muted) return;
    const c=ac(),now=c.currentTime;
    const notes=[[494,0],[466,0.10],[440,0.18],[415,0.26],[392,0.34],[370,0.40],
                 [349,0.46],[330,0.52],[311,0.57],[294,0.62],[277,0.67],[262,0.72]];
    notes.forEach(([f,t])=>{
      const dur=0.10;
      const g=c.createGain();
      g.gain.setValueAtTime(0.26,now+t);
      g.gain.linearRampToValueAtTime(0.0001,now+t+dur);
      g.connect(c.destination);
      const o=c.createOscillator();
      o.type='square'; o.frequency.value=f;
      o.connect(g); o.start(now+t); o.stop(now+t+dur+0.02);
    });
  }

  function fruit(isPeach=false) {
    if (muted) return;
    const c=ac(),now=c.currentTime;
    const mel=isPeach
      ? [[880,0],[1046,0.07],[1318,0.14],[1567,0.21],[1318,0.30],[1567,0.38],[2093,0.46]]
      : [[523,0],[659,0.07],[784,0.14],[1046,0.22]];
    mel.forEach(([f,t])=>{
      const dur=isPeach?0.10:0.09;
      const g=c.createGain();
      g.gain.setValueAtTime(0.20,now+t);
      g.gain.linearRampToValueAtTime(0.0001,now+t+dur);
      g.connect(c.destination);
      const o=c.createOscillator();
      o.type=isPeach?'sine':'triangle'; o.frequency.value=f;
      o.connect(g); o.start(now+t); o.stop(now+t+dur+0.02);
    });
  }

  function levelClear() {
    if (muted) return;
    const c=ac(),now=c.currentTime;
    const seq=[[523,0],[659,0.12],[784,0.24],[1046,0.37],[784,0.54],[880,0.66],[1046,0.78]];
    seq.forEach(([f,t])=>{
      const dur=0.16;
      const g=c.createGain();
      g.gain.setValueAtTime(0.26,now+t);
      g.gain.linearRampToValueAtTime(0.0001,now+t+dur);
      g.connect(c.destination);
      const o=c.createOscillator();
      o.type='square'; o.frequency.value=f;
      o.connect(g); o.start(now+t); o.stop(now+t+dur+0.02);
    });
  }

  function _kill(node) {
    if (!node) return null;
    try { node.osc.stop(); }     catch(_){}
    try { node.lfo.stop(); }     catch(_){}
    try { node.gain.disconnect(); } catch(_){}
    return null;
  }

  function _siren(fast) {
    if (muted) return null;
    const c=ac();
    const gn=c.createGain(); gn.gain.value=0.11; gn.connect(c.destination);
    const lfo=c.createOscillator(); const lg=c.createGain();
    lg.gain.value=fast?45:28; lfo.frequency.value=fast?5.5:3.0; lfo.type='sine';
    lfo.connect(lg);
    const osc=c.createOscillator(); osc.type='sawtooth'; osc.frequency.value=fast?220:160;
    lg.connect(osc.frequency); osc.connect(gn);
    lfo.start(); osc.start();
    return {osc,lfo,gain:gn};
  }

  function _fright() {
    if (muted) return null;
    const c=ac();
    const gn=c.createGain(); gn.gain.value=0.11; gn.connect(c.destination);
    const lfo=c.createOscillator(); const lg=c.createGain();
    lg.gain.value=65; lfo.frequency.value=9; lfo.type='sine';
    lfo.connect(lg);
    const osc=c.createOscillator(); osc.type='square'; osc.frequency.value=195;
    lg.connect(osc.frequency); osc.connect(gn);
    lfo.start(); osc.start();
    return {osc,lfo,gain:gn};
  }

  function sirenStart()  { if (!sirenNode)  sirenNode  = _siren(sirenIsFast); }
  function sirenStop()   { sirenNode  = _kill(sirenNode); }
  function sirenFastFn() { sirenIsFast=true; sirenStop(); sirenStart(); }
  function frightStart() { if (!frightNode) frightNode = _fright(); }
  function frightStop()  { frightNode = _kill(frightNode); }

  function toggleMute() {
    muted=!muted;
    if (muted) { sirenStop(); frightStop(); }
    return muted;
  }

  return { waka,power,ghost,death,fruit,levelClear,
    sirenStart,sirenStop,sirenFast:sirenFastFn,
    frightStart,frightStop,toggleMute,
    start(){ ac(); },
    get muted(){ return muted; } };
})();

// ═══════════════════════════════════════════════════════════════
//  TRIBUTE
// ═══════════════════════════════════════════════════════════════
const TRIBUTE = Object.freeze({
  name:'Barbara Jackson', nickname:'BABS', hiScore:3333330,
  msgs:[
    "Babs would've kept going! 🍑","Sweet as a peach — try again! 🍑",
    "Georgia never quits! 🍑","One more for Babs! 🍑",
    "She never gave up — neither should you! 🍑",
    "Babs scored higher with her eyes closed! 🍑",
  ],
});

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════
const CFG = Object.freeze({
  TILE:20, COLS:21, ROWS:23, CELL:32,
  PAC_SPEED:1.8, GHOST_SPEED:1.4,
  FRIGHT_BASE:300, FRIGHT_MIN:40,
  READY_FRAMES:150, DEATH_FRAMES:90,
  CLEAR_FRAMES:240,
  SCORE:Object.freeze({DOT:10,POWER:50,GHOST_BASE:200}),
});
const TT = Object.freeze({WALL:1,DOT:2,POWER:3,EMPTY:0,HOUSE:4});
const STATE = Object.freeze({
  IDLE:Symbol('idle'), READY:Symbol('ready'), PLAYING:Symbol('playing'),
  DYING:Symbol('dying'), LEVELCLEAR:Symbol('levelclear'), GAMEOVER:Symbol('gameover'),
});

// ═══════════════════════════════════════════════════════════════
//  SPRITE SHEET
// ═══════════════════════════════════════════════════════════════
class SS {
  #img=null; #ok=false;
  constructor(src){ this.#img=new Image(); this.#img.onload=()=>{this.#ok=true;}; this.#img.onerror=()=>console.warn('Sprite missing:',src); this.#img.src=src; }
  get ready(){ return this.#ok; }
  blit(ctx,col,row,dx,dy,scale,flipX=false){
    if(!this.#ok) return false;
    const C=CFG.CELL,sc=scale??(CFG.TILE/C),dim=C*sc;
    ctx.save();
    if(flipX){ ctx.translate(dx,dy); ctx.scale(-1,1); ctx.drawImage(this.#img,col*C,row*C,C,C,-dim/2,-dim/2,dim,dim); }
    else      { ctx.drawImage(this.#img,col*C,row*C,C,C,dx-dim/2,dy-dim/2,dim,dim); }
    ctx.restore(); return true;
  }
}
const SPR={pac:new SS('assets/sprites/pacman.png'),ghosts:new SS('assets/sprites/ghosts.png'),fruits:new SS('assets/sprites/fruits.png'),pellets:new SS('assets/sprites/pellets.png')};
const FCOL=new Map([['cherry',0],['strawberry',1],['orange',2],['apple',3],['melon',4],['grapes',5],['watermelon',6],['bell',7],['key',8],['peach',9]]);

// ═══════════════════════════════════════════════════════════════
//  CANVAS FALLBACKS
// ═══════════════════════════════════════════════════════════════
function fbPac(ctx,x,y,dx,dy,mouth,dying,df){
  const r=CFG.TILE*0.47; ctx.save(); ctx.translate(x,y);
  ctx.shadowColor='#FFD700'; ctx.shadowBlur=14;
  const g=ctx.createRadialGradient(-r*.2,-r*.2,0,0,0,r);
  g.addColorStop(0,'#FFE88A'); g.addColorStop(0.6,'#FFD700'); g.addColorStop(1,'#FF9900');
  ctx.fillStyle=g;
  if(dying){ const a=Math.min(df/80,1)*Math.PI*.97; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,a,Math.PI*2-a); ctx.closePath(); ctx.fill(); }
  else{ ctx.rotate(Math.atan2(dy,dx||1)); const m=mouth*Math.PI; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,m,Math.PI*2-m); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

function fbGhost(ctx,x,y,color,dx,dy,fright,ftimer,frame){
  const r=CFG.TILE*0.47; ctx.save(); ctx.translate(x,y);
  const col=fright?((ftimer<60&&Math.floor(frame/7)%2===0)?'#FFFFFF':'#0000BB'):color;
  ctx.shadowColor=fright?'#000088':color; ctx.shadowBlur=10; ctx.fillStyle=col;
  ctx.beginPath(); ctx.arc(0,-r*.05,r,Math.PI,0);
  const pts=[-r,-r/3,r/3,r];
  for(let i=0;i<3;i++){const mx=(pts[i]+pts[i+1])/2,py=i%2===0?r*.85:r*.5; ctx.quadraticCurveTo(mx,py,pts[i+1],r*(i%2===0?.5:.85));}
  ctx.closePath(); ctx.fill();
  [[-0.3,-0.22],[0.3,-0.22]].forEach(([ex,ey])=>{
    ctx.fillStyle='white'; ctx.beginPath(); ctx.ellipse(r*ex,r*ey,r*.21,r*.25,0,0,Math.PI*2); ctx.fill();
    if(!fright){ctx.fillStyle='#1144FF'; ctx.beginPath(); ctx.arc(r*ex+dx*r*.09,r*ey+dy*r*.09,r*.12,0,Math.PI*2); ctx.fill();}
  });
  ctx.restore();
}

function fbFruit(ctx,x,y,def){
  ctx.save();
  ctx.font=`${Math.round(CFG.TILE*.95)}px serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='white';
  if(def.isPeach){ctx.shadowColor='#FFAB76'; ctx.shadowBlur=18;}
  ctx.fillText(def.emoji||'?',x,y);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  FRUITS
// ═══════════════════════════════════════════════════════════════
const FRUITS=Object.freeze([
  {id:'cherry',    emoji:'🍒',name:'Cherry',    pts:100,  isPeach:false},
  {id:'strawberry',emoji:'🍓',name:'Strawberry',pts:300,  isPeach:false},
  {id:'orange',    emoji:'🍊',name:'Orange',    pts:500,  isPeach:false},
  {id:'apple',     emoji:'🍎',name:'Apple',     pts:700,  isPeach:false},
  {id:'melon',     emoji:'🍈',name:'Melon',     pts:1000, isPeach:false},
  {id:'grapes',    emoji:'🍇',name:'Grapes',    pts:2000, isPeach:false},
  {id:'watermelon',emoji:'🍉',name:'Watermelon',pts:3000, isPeach:false},
  {id:'bell',      emoji:'🔔',name:'Bell',      pts:3000, isPeach:false},
  {id:'key',       emoji:'🗝', name:'Key',       pts:5000, isPeach:false},
  {id:'peach',     emoji:'🍑',name:'PEACH ×3',  pts:500,  isPeach:true,mult:3},
]);

// 3 spawn positions: centre, left nook, right nook — matching real Pac-Man
const SPAWNS=[{col:10,row:16},{col:3,row:16},{col:17,row:16}];

function pickFruit(level){
  const pool=FRUITS.filter(f=>!f.isPeach);
  const idx=Math.min(level-1,pool.length-1);
  return Math.random()<0.65?pool[idx]:pool[Math.floor(Math.random()*pool.length)];
}

// ═══════════════════════════════════════════════════════════════
//  BONUS FRUIT
// ═══════════════════════════════════════════════════════════════
const FADE=20;
class BonusFruit{
  #def;#x;#y;#timer;#bob=0;#fade=-1;#collected=false;
  constructor(def,x,y,dur){this.#def=def;this.#x=x;this.#y=y;this.#timer=dur;}
  get def(){return this.#def;}
  get x(){return this.#x;}
  get y(){return this.#y;}
  get alive(){return !this.#collected&&this.#timer>0;}
  get collected(){return this.#collected;}
  get done(){return this.#fade>=FADE;}
  collect(){this.#collected=true;this.#fade=0;}
  update(){
    if(this.alive){this.#timer--;this.#bob++;}
    else if(this.#fade<0){this.#fade=0;}
    if(this.#fade>=0&&this.#fade<FADE)this.#fade++;
  }
  draw(ctx,frame){
    if(this.done)return;
    const {x,y}=this;
    const bob=Math.sin(this.#bob*0.12)*2.5;
    let alpha=1;
    if(this.#fade>=0) alpha=Math.max(0,1-this.#fade/FADE);
    else if(this.#def.isPeach) alpha=0.60+0.40*Math.abs(Math.sin(frame*0.38));
    else if(this.#timer<80) alpha=0.35+0.65*(this.#timer/80);
    ctx.save(); ctx.globalAlpha=alpha;
    const col=FCOL.get(this.#def.id)??0;
    if(!SPR.fruits.blit(ctx,col,0,x,y+bob)) fbFruit(ctx,x,y+bob,this.#def);
    // Peach: urgent pulsing ring
    if(this.#def.isPeach&&this.alive){
      const ring=0.5+0.5*Math.abs(Math.sin(frame*0.45));
      ctx.globalAlpha=alpha*ring*0.85;
      ctx.strokeStyle='#FF8C00'; ctx.lineWidth=3;
      ctx.shadowColor='#FF4400'; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.arc(x,y+bob,CFG.TILE*0.62,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════
//  SCORE POPUP
// ═══════════════════════════════════════════════════════════════
class Popup{
  constructor(x,y,val,isPeach=false){this.x=x;this.y=y;this.val=val;this.isPeach=isPeach;this.life=80;}
  update(){this.y-=0.5;this.life--;}
  get alive(){return this.life>0;}
  draw(ctx){
    ctx.save(); ctx.globalAlpha=Math.min(this.life/25,1);
    const col=this.isPeach?'#FF8C00':'#00FFFF';
    ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=10;
    ctx.font=`bold ${this.isPeach?10:8}px "Press Start 2P"`; ctx.textAlign='center';
    if(this.isPeach) ctx.fillText('🍑 ×3!',this.x,this.y-12);
    ctx.fillText(this.val,this.x,this.y);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════
//  SCORE MANAGER
// ═══════════════════════════════════════════════════════════════
class Score{
  #n=0;#mul=1;
  #sync(){document.getElementById('score').textContent=String(this.#n).padStart(7,'0');}
  add(v){this.#n+=v;this.#sync();}
  reset(){this.#n=0;this.#mul=1;this.#sync();}
  get score(){return this.#n;}
  ghostEat(){const p=CFG.SCORE.GHOST_BASE*this.#mul;this.#mul=Math.min(this.#mul*2,8);this.add(p);return p;}
  resetMul(){this.#mul=1;}
  get mul(){return this.#mul;}
}

// ═══════════════════════════════════════════════════════════════
//  MAP
// ═══════════════════════════════════════════════════════════════
const BASE=[
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

// ═══════════════════════════════════════════════════════════════
//  MAZE
// ═══════════════════════════════════════════════════════════════
class Maze{
  #g=[];#dots=0;#flash=false;
  reset(){this.#g=BASE.map(r=>[...r]);this.#dots=this.#g.flat().filter(v=>v===TT.DOT||v===TT.POWER).length;this.#flash=false;return this;}
  eat(c,r){const v=this.#g[r]?.[c];if(v===TT.DOT){this.#g[r][c]=TT.EMPTY;this.#dots--;return'dot';}if(v===TT.POWER){this.#g[r][c]=TT.EMPTY;this.#dots--;return'power';}return null;}
  isWall(c,r){return this.#g[r]?.[c]===TT.WALL;}
  get dotsLeft(){return this.#dots;}
  get cleared(){return this.#dots<=0;}
  set flashOn(v){this.#flash=v;}
  *walls(){for(let r=0;r<CFG.ROWS;r++)for(let c=0;c<CFG.COLS;c++)if(this.#g[r]?.[c]===TT.WALL)yield{r,c};}
  *pickups(){for(let r=0;r<CFG.ROWS;r++)for(let c=0;c<CFG.COLS;c++){const v=this.#g[r]?.[c];if(v===TT.DOT||v===TT.POWER)yield{r,c,type:v};}}
  draw(ctx,frame){
    const T=CFG.TILE,ft=Math.floor(frame/7)%2===0;
    const wf=this.#flash?(ft?'#FFFFFF':'#0000FF'):'#000035';
    const wl=this.#flash?(ft?'#0000FF':'#FFFFFF'):'#2323ee';
    for(const{r,c}of this.walls()){const x=c*T,y=r*T;ctx.fillStyle=wf;ctx.fillRect(x,y,T,T);this.#edges(ctx,r,c,x,y,wl);}
    if(this.#flash)return;
    for(const{r,c,type}of this.pickups()){
      const cx=c*T+T/2,cy=r*T+T/2;
      if(type===TT.DOT){if(!SPR.pellets.blit(ctx,0,0,cx,cy)){ctx.fillStyle='#FFB8AE';ctx.beginPath();ctx.arc(cx,cy,2.2,0,Math.PI*2);ctx.fill();}}
      else{if(!SPR.pellets.blit(ctx,1+Math.floor(frame/8)%5,0,cx,cy)){const sc=0.72+0.28*Math.sin(frame*0.14);ctx.save();ctx.shadowColor='#FFAB76';ctx.shadowBlur=14;ctx.fillStyle='#FFD4B0';ctx.beginPath();ctx.arc(cx,cy,5.8*sc,0,Math.PI*2);ctx.fill();ctx.restore();}}
    }
  }
  #edges(ctx,r,c,x,y,col){
    const T=CFG.TILE,iw=(dr,dc)=>this.#g[r+dr]?.[c+dc]===TT.WALL;
    ctx.save();ctx.strokeStyle=col;ctx.shadowColor=col;ctx.shadowBlur=4;ctx.lineWidth=2.5;ctx.lineCap='round';
    [[!iw(-1,0),x,y+1,x+T,y+1],[!iw(1,0),x,y+T-1,x+T,y+T-1],[!iw(0,-1),x+1,y,x+1,y+T],[!iw(0,1),x+T-1,y,x+T-1,y+T]]
    .forEach(([s,x1,y1,x2,y2])=>{if(!s)return;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();});
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════
//  ENTITY BASE
// ═══════════════════════════════════════════════════════════════
class Entity{
  constructor(x,y,spd){this.x=x;this.y=y;this.dx=0;this.dy=0;this.speed=spd;}
  get col(){return Math.round((this.x-CFG.TILE/2)/CFG.TILE);}
  get row(){return Math.round((this.y-CFG.TILE/2)/CFG.TILE);}
  get tileX(){return this.col*CFG.TILE+CFG.TILE/2;}
  get tileY(){return this.row*CFG.TILE+CFG.TILE/2;}
  _wall(maze,nx,ny,m=0.42){const mg=CFG.TILE*m,T=CFG.TILE;for(let r=Math.floor((ny-mg)/T);r<=Math.floor((ny+mg)/T);r++)for(let c=Math.floor((nx-mg)/T);c<=Math.floor((nx+mg)/T);c++)if(maze.isWall(c,r))return true;return false;}
  _wrapX(){const w=CFG.COLS*CFG.TILE;if(this.x<0)this.x=w;if(this.x>w)this.x=0;}
}

// ═══════════════════════════════════════════════════════════════
//  PAC-MAN
// ═══════════════════════════════════════════════════════════════
class Pacman extends Entity{
  #m=0.25;#md=1;#wdx=0;#wdy=0;deathFrame=0;
  constructor(x,y,spd){super(x,y,spd);}
  setDir(dx,dy){this.#wdx=dx;this.#wdy=dy;}
  update(maze){
    if((this.#wdx!==this.dx||this.#wdy!==this.dy)&&!this._wall(maze,this.x+this.#wdx*this.speed,this.y+this.#wdy*this.speed)){this.dx=this.#wdx;this.dy=this.#wdy;}
    if(!this._wall(maze,this.x+this.dx*this.speed,this.y+this.dy*this.speed)){this.x+=this.dx*this.speed;this.y+=this.dy*this.speed;}
    this._wrapX();
    this.#m+=0.05*this.#md; if(this.#m>=0.26||this.#m<=0.01)this.#md*=-1;
  }
  draw(ctx,frame,dying=false){
    const{x,y}=this;
    if(dying){const col=Math.min(7,Math.floor(this.deathFrame/(CFG.DEATH_FRAMES/8)));if(!SPR.pac.blit(ctx,col,3,x,y))fbPac(ctx,x,y,this.dx,this.dy,this.#m,true,this.deathFrame);return;}
    const row=this.dy<0?1:this.dy>0?2:0;
    const cf=frame%16,col=cf<8?Math.floor(cf/2):7-Math.floor(cf/2);
    if(!SPR.pac.blit(ctx,col,row,x,y,undefined,this.dx<0))fbPac(ctx,x,y,this.dx,this.dy,this.#m,false,0);
  }
}

// ═══════════════════════════════════════════════════════════════
//  GHOST
//
//  EXIT (verified):
//  • row 7, col 10 in BASE_MAP = 0 (EMPTY). Confirmed open tile.
//  • Ghosts exit by teleporting there then moving dy=-1 (upward).
//  • Blinky (idx 0): spawns outside already at row 7, dx=1.
//  • Pinky  (idx 1): leaves after   1 frame  (immediate).
//  • Inky   (idx 2): leaves after  90 frames (~1.5s).
//  • Clyde  (idx 3): leaves after 180 frames (~3s).
// ═══════════════════════════════════════════════════════════════
const GAI=[
  (g,p)=>({x:p.x,y:p.y}),
  (g,p)=>({x:p.x+p.dx*CFG.TILE*4,y:p.y+p.dy*CFG.TILE*4}),
  (g,p,all)=>{const b=all[0],px=p.x+p.dx*CFG.TILE*2,py=p.y+p.dy*CFG.TILE*2;return{x:2*px-b.x,y:2*py-b.y};},
  (g,p)=>Math.hypot(g.x-p.x,g.y-p.y)>CFG.TILE*8?{x:p.x,y:p.y}:{x:0,y:CFG.ROWS*CFG.TILE},
];
const GDEFS=Object.freeze([
  {name:'BLINKY',color:'#FF0000',sc:10,sr:7, out:true, scat:{x:CFG.COLS*CFG.TILE,y:0}},
  {name:'PINKY', color:'#FFB8FF',sc:10,sr:10,out:false,scat:{x:0,y:0}},
  {name:'INKY',  color:'#00FFFF',sc:9, sr:10,out:false,scat:{x:CFG.COLS*CFG.TILE,y:CFG.ROWS*CFG.TILE}},
  {name:'CLYDE', color:'#FFB852',sc:11,sr:10,out:false,scat:{x:0,y:CFG.ROWS*CFG.TILE}},
]);

class Ghost extends Entity{
  #fright=false;#eaten=false;#house=true;#leaveT=0;#idx;#scat;
  color;name;

  constructor(def,idx,spd){
    const T=CFG.TILE;
    super(def.sc*T+T/2,def.sr*T+T/2,spd);
    this.name=def.name;this.color=def.color;this.#idx=idx;this.#scat=def.scat;
    if(def.out){
      // Blinky: already outside, patrol right
      this.#house=false;this.#leaveT=0;this.dx=1;this.dy=0;
    } else {
      // Leave timers: idx1=1, idx2=90, idx3=180
      this.#leaveT=[0,1,90,180][idx];
      this.dy=idx%2===0?-1:1; // alternating bob direction
    }
  }

  get frightened(){return this.#fright;}
  get eaten(){return this.#eaten;}
  get inHouse(){return this.#house;}

  scare(on){if(!this.#eaten)this.#fright=on;}
  eat(){this.#eaten=true;this.#fright=false;}

  returnHome(){
    this.#eaten=false;this.#house=true;this.#leaveT=90;
    this.x=CFG.TILE*10+CFG.TILE/2;this.y=CFG.TILE*10+CFG.TILE/2;
    this.dx=0;this.dy=1;
  }

  update(maze,pac,all,frame,scatter){
    const T=CFG.TILE;

    // ── IN HOUSE: bob, then exit ─────────────────────────────
    if(this.#house){
      // Gentle vertical bob
      const next=this.y+this.dy*0.4;
      const lo=T*9.5+T/2,hi=T*10.5+T/2;
      if(next<lo||next>hi) this.dy*=-1;
      this.y+=this.dy*0.4;

      if(--this.#leaveT<=0){
        this.#house=false;
        // Teleport to open corridor above ghost house door
        // BASE_MAP[7][10] = 0 (EMPTY) — verified
        this.x=T*10+T/2;
        this.y=T*7+T/2;
        this.dx=0;this.dy=-1; // move UP into main maze
      }
      return;
    }

    // ── EATEN: return to house ────────────────────────────────
    if(this.#eaten){
      const hx=T*10+T/2,hy=T*10+T/2;
      if(Math.hypot(this.x-hx,this.y-hy)<this.speed*2+2){this.returnHome();return;}
    }

    const spd=this.#eaten?this.speed*2.2:this.#fright?this.speed*0.5:this.speed;
    const nearTile=Math.abs(this.x-this.tileX)<spd+0.5&&Math.abs(this.y-this.tileY)<spd+0.5;
    if(nearTile){this.x=this.tileX;this.y=this.tileY;this.#pick(maze,pac,all,scatter);}

    if(!this._wall(maze,this.x+this.dx*spd,this.y+this.dy*spd)){
      this.x+=this.dx*spd;this.y+=this.dy*spd;
    } else {
      this.#pick(maze,pac,all,scatter);
    }
    this._wrapX();
  }

  #pick(maze,pac,all,scatter){
    const T=CFG.TILE;
    const DIRS=[{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const valid=DIRS.filter(d=>!(d.dx===-this.dx&&d.dy===-this.dy)&&!this._wall(maze,this.x+d.dx*T,this.y+d.dy*T));
    if(!valid.length){const rev=DIRS.find(d=>d.dx===-this.dx&&d.dy===-this.dy);if(rev){this.dx=rev.dx;this.dy=rev.dy;}return;}
    if(this.#fright){const p=valid[Math.floor(Math.random()*valid.length)];this.dx=p.dx;this.dy=p.dy;return;}
    const tgt=this.#eaten?{x:CFG.TILE*10+CFG.TILE/2,y:CFG.TILE*10+CFG.TILE/2}:scatter?this.#scat:GAI[this.#idx](this,pac,all);
    let best=null,bd=Infinity;
    for(const d of valid){const dist=Math.hypot(this.x+d.dx*T-tgt.x,this.y+d.dy*T-tgt.y);if(dist<bd){bd=dist;best=d;}}
    if(best){this.dx=best.dx;this.dy=best.dy;}
  }

  draw(ctx,frame,ftimer){
    const{x,y}=this;ctx.save();
    if(this.#house)ctx.globalAlpha=0.55;
    let ok=false;
    if(this.#eaten){
      let dc=this.dx>0?0:this.dx<0?2:this.dy<0?4:6;
      dc+=Math.floor(frame/8)%2;
      ok=SPR.ghosts.blit(ctx,dc,6,x,y);
    } else if(this.#fright){
      const fl=ftimer<60&&Math.floor(frame/7)%2===0;
      ok=SPR.ghosts.blit(ctx,Math.floor(frame/6)%8,fl?5:4,x,y);
    } else {
      const di=this.dx>0?0:this.dx<0?1:this.dy<0?2:3;
      ok=SPR.ghosts.blit(ctx,di*2+Math.floor(frame/8)%2,this.#idx,x,y);
    }
    if(!ok)fbGhost(ctx,x,y,this.color,this.dx,this.dy,this.#fright,ftimer,frame);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════════════════════════
const HUD={
  score(n){document.getElementById('score').textContent=String(n).padStart(7,'0');},
  level(n){document.getElementById('level').textContent=String(n).padStart(2,'0');},
  lives(n){document.querySelectorAll('.life-icon').forEach((el,i)=>el.classList.toggle('dead',i>=n));},
  show(id){document.getElementById(id)?.classList.remove('overlay--hidden');},
  hide(id){document.getElementById(id)?.classList.add('overlay--hidden');},
  final(n){document.getElementById('final-score').textContent=String(n).padStart(7,'0');},
  msg(m){document.getElementById('gameover-msg').textContent=m;},
  ready(on){document.getElementById('ready-text')?.classList.toggle('overlay--hidden',!on);},
  mute(m){const b=document.getElementById('mute-btn');if(b)b.textContent=m?'🔇 MUTED':'🔊 SOUND';},
  fruit(def){
    if(!def){
      document.getElementById('active-fruit-icon').textContent='·';
      document.getElementById('active-fruit-name').textContent='—';
      document.getElementById('active-fruit-pts').textContent='';
      document.getElementById('active-fruit-icon').style.color='';
      return;
    }
    const mult=def.mult??1,pts=def.pts*mult;
    document.getElementById('active-fruit-icon').textContent=def.emoji||'?';
    document.getElementById('active-fruit-name').textContent=def.isPeach?'🍑 PEACH ×3!':def.name;
    document.getElementById('active-fruit-pts').textContent=pts+' PTS';
    document.getElementById('active-fruit-icon').style.color=def.isPeach?'#FF8C00':'';
  },
};

// ═══════════════════════════════════════════════════════════════
//  SCATTER/CHASE SCHEDULE
// ═══════════════════════════════════════════════════════════════
function mkSchedule(lvl){
  const S7=420,S5=300,S1=60,C20=1200,CI=Number.MAX_SAFE_INTEGER;
  return lvl===1
    ?[{s:true,d:S7},{s:false,d:C20},{s:true,d:S7},{s:false,d:C20},{s:true,d:S5},{s:false,d:C20},{s:true,d:S5},{s:false,d:CI}]
    :[{s:true,d:S5},{s:false,d:C20},{s:true,d:S5},{s:false,d:C20},{s:true,d:S5},{s:false,d:C20},{s:true,d:S1},{s:false,d:CI}];
}

// ═══════════════════════════════════════════════════════════════
//  PER-LEVEL CONFIG
// ═══════════════════════════════════════════════════════════════
function lc(lvl){
  return{
    ghostSpd:Math.min(CFG.GHOST_SPEED+(lvl-1)*0.08,2.2),
    pacSpd:  Math.min(CFG.PAC_SPEED+(lvl-1)*0.04,2.4),
    frightDur:Math.max(CFG.FRIGHT_MIN,CFG.FRIGHT_BASE-(lvl-1)*25),
    fruitDur:Math.max(240,480-(lvl-1)*15),
    // Peach lasts 130-180 frames (≈2.2–3s). Short and hard to catch.
    peachDur:()=>130+Math.floor(Math.random()*50),
    // Peach spawns when dots eaten hits this threshold (varies per level)
    peachThr:90+Math.floor(lvl*5),
  };
}

// ═══════════════════════════════════════════════════════════════
//  GAME
// ═══════════════════════════════════════════════════════════════
class Game{
  #canvas;#ctx;
  #maze=new Maze();#score=new Score();
  #pac=null;#ghosts=[];#popups=[];
  #fruits=[];
  #f1=false;#f2=false;#peach=false;
  #state=STATE.IDLE;
  #frame=0;#ftimer=0;#rtimer=0;#dtimer=0;
  #lvl=1;#lives=3;#dots=0;#fast=false;
  #sched=[];#phase=0;#mtimer=0;#scatter=true;
  #ctimer=0;
  #cfg=null;

  constructor(id){
    this.#canvas=document.getElementById(id);
    this.#ctx=this.#canvas.getContext('2d');
    this.#canvas.width=CFG.COLS*CFG.TILE;
    this.#canvas.height=CFG.ROWS*CFG.TILE;
    this.#bind();
    this.#maze.reset();
    document.getElementById('highscore').textContent=String(TRIBUTE.hiScore).padStart(7,'0');
    HUD.show('overlay-start');
    requestAnimationFrame(this.#loop);
  }

  #set(s){this.#state=s;}

  start(){
    HUD.hide('overlay-start');HUD.hide('overlay-gameover');
    this.#score.reset();this.#lvl=1;this.#lives=3;
    HUD.level(1);HUD.lives(3);
    this.#init();snd.start();
  }

  #init(){
    this.#cfg=lc(this.#lvl);
    this.#maze.reset();
    const T=CFG.TILE;
    this.#pac=new Pacman(10*T+T/2,16*T+T/2,this.#cfg.pacSpd);
    this.#ghosts=GDEFS.map((d,i)=>new Ghost(d,i,this.#cfg.ghostSpd));
    this.#popups=[];this.#fruits=[];
    this.#f1=false;this.#f2=false;this.#peach=false;
    this.#dots=0;this.#ftimer=0;this.#fast=false;this.#ctimer=0;
    this.#score.resetMul();
    this.#sched=mkSchedule(this.#lvl);
    this.#phase=0;this.#scatter=this.#sched[0].s;this.#mtimer=this.#sched[0].d;
    this.#set(STATE.READY);this.#rtimer=CFG.READY_FRAMES;
    HUD.ready(true);HUD.fruit(null);
    snd.sirenStop();snd.frightStop();
  }

  #loop=()=>{this.#update();this.#draw();requestAnimationFrame(this.#loop);};

  #update(){
    this.#frame++;
    switch(this.#state){
      case STATE.READY:
        if(--this.#rtimer<=0){this.#set(STATE.PLAYING);HUD.ready(false);snd.sirenStart();}
        break;
      case STATE.PLAYING: this.#tick(); break;
      case STATE.DYING:
        this.#pac.deathFrame++;
        if(--this.#dtimer<=0)this.#die();
        break;
      case STATE.LEVELCLEAR:
        this.#ctimer--;
        this.#maze.flashOn=Math.floor(this.#ctimer/7)%2===0;
        if(this.#ctimer<=0){this.#maze.flashOn=false;this.#lvl++;HUD.level(this.#lvl);this.#init();}
        break;
    }
    this.#popups=this.#popups.filter(p=>{p.update();return p.alive;});
  }

  #modeT(){
    if(this.#ftimer>0)return;
    if(--this.#mtimer<=0){
      const n=this.#phase+1;
      if(n<this.#sched.length){this.#phase=n;this.#scatter=this.#sched[n].s;this.#mtimer=this.#sched[n].d;}
      else{this.#scatter=false;this.#mtimer=Number.MAX_SAFE_INTEGER;}
    }
  }

  #tick(){
    this.#modeT();

    // Fright countdown
    if(this.#ftimer>0){
      if(--this.#ftimer===0){this.#ghosts.forEach(g=>g.scare(false));snd.frightStop();snd.sirenStart();}
    }

    this.#pac.update(this.#maze);

    // Pellets
    const ate=this.#maze.eat(this.#pac.col,this.#pac.row);
    if(ate==='dot'){
      this.#score.add(CFG.SCORE.DOT);this.#dots++;snd.waka();
      this.#trySpawnFruit();
      if(!this.#fast&&this.#maze.dotsLeft<30&&this.#ftimer===0){this.#fast=true;snd.sirenFast();}
    } else if(ate==='power'){
      this.#score.add(CFG.SCORE.POWER);
      this.#ftimer=this.#cfg.frightDur;
      this.#score.resetMul();
      this.#ghosts.forEach(g=>g.scare(true));
      snd.power();snd.sirenStop();snd.frightStart();
    }

    // Fruit: update all, check eat, prune done
    for(let i=this.#fruits.length-1;i>=0;i--){
      const f=this.#fruits[i];
      f.update();
      if(f.alive&&Math.hypot(f.x-this.#pac.x,f.y-this.#pac.y)<CFG.TILE*0.88){
        const mult=f.def.mult??1,pts=f.def.pts*mult;
        this.#score.add(pts);
        this.#popups.push(new Popup(f.x,f.y,pts,f.def.isPeach));
        f.collect();snd.fruit(f.def.isPeach);
        this.#hudFruit();
      }
      if(!f.alive&&!f.collected)this.#hudFruit(); // clear HUD when timed out
      if(f.done)this.#fruits.splice(i,1);
    }

    // Ghosts
    this.#ghosts.forEach(g=>g.update(this.#maze,this.#pac,this.#ghosts,this.#frame,this.#scatter));

    // Collision
    for(const g of this.#ghosts){
      if(Math.hypot(g.x-this.#pac.x,g.y-this.#pac.y)>=CFG.TILE*0.75)continue;
      if(g.frightened){
        const pts=this.#score.ghostEat();g.eat();
        this.#popups.push(new Popup(g.x,g.y,pts,false));snd.ghost(this.#score.mul);
        if(!this.#ghosts.some(h=>h.frightened)){snd.frightStop();snd.sirenStart();}
      } else if(!g.eaten&&!g.inHouse){
        snd.sirenStop();snd.frightStop();
        this.#set(STATE.DYING);this.#dtimer=CFG.DEATH_FRAMES;this.#pac.deathFrame=0;
        HUD.ready(false);snd.death();return;
      }
    }

    // Level clear
    if(this.#maze.cleared){
      snd.sirenStop();snd.frightStop();snd.levelClear();
      this.#fruits=[];HUD.fruit(null);
      this.#set(STATE.LEVELCLEAR);this.#ctimer=CFG.CLEAR_FRAMES;
    }
  }

  #trySpawnFruit(){
    const T=CFG.TILE,cfg=this.#cfg;
    // Fruit 1 at 70 dots — centre spawn
    if(!this.#f1&&this.#dots>=70){
      this.#f1=true;
      const p=SPAWNS[0];
      this.#fruits.push(new BonusFruit(pickFruit(this.#lvl),p.col*T+T/2,p.row*T+T/2,cfg.fruitDur));
      this.#hudFruit();
    }
    // Peach — left nook, short window, once per level
    if(!this.#peach&&this.#dots>=cfg.peachThr){
      this.#peach=true;
      const p=SPAWNS[1];
      const peach=FRUITS.find(f=>f.isPeach);
      this.#fruits.push(new BonusFruit(peach,p.col*T+T/2,p.row*T+T/2,cfg.peachDur()));
      this.#hudFruit();
    }
    // Fruit 2 at 170 dots — right nook
    if(!this.#f2&&this.#dots>=170){
      this.#f2=true;
      const p=SPAWNS[2];
      this.#fruits.push(new BonusFruit(pickFruit(this.#lvl),p.col*T+T/2,p.row*T+T/2,cfg.fruitDur));
      this.#hudFruit();
    }
  }

  #hudFruit(){
    const alive=this.#fruits.filter(f=>f.alive);
    HUD.fruit(alive.length?(alive.find(f=>f.def.isPeach)||alive[0]).def:null);
  }

  #die(){
    if(--this.#lives<=0){
      this.#set(STATE.GAMEOVER);snd.sirenStop();snd.frightStop();
      HUD.final(this.#score.score);
      HUD.msg(TRIBUTE.msgs[Math.floor(Math.random()*TRIBUTE.msgs.length)]);
      HUD.show('overlay-gameover');
    } else {
      HUD.lives(this.#lives);this.#init();
    }
  }

  #draw(){
    const ctx=this.#ctx;
    ctx.fillStyle='#000008';ctx.fillRect(0,0,this.#canvas.width,this.#canvas.height);
    this.#maze.draw(ctx,this.#frame);

    if(this.#state!==STATE.IDLE&&this.#state!==STATE.GAMEOVER){
      const dying=this.#state===STATE.DYING;
      if(!dying||this.#pac.deathFrame<75)this.#pac.draw(ctx,this.#frame,dying);
      for(const f of this.#fruits)f.draw(ctx,this.#frame);
      this.#ghosts.forEach(g=>g.draw(ctx,this.#frame,this.#ftimer));
      this.#popups.forEach(p=>p.draw(ctx));
    }

    if(this.#state===STATE.LEVELCLEAR&&this.#ctimer>CFG.CLEAR_FRAMES*0.5){
      const a=Math.min(1,(this.#ctimer-CFG.CLEAR_FRAMES*0.5)/30);
      ctx.save();ctx.globalAlpha=a;
      ctx.fillStyle='#FFD700';ctx.shadowColor='#FFD700';ctx.shadowBlur=24;
      ctx.font='bold 14px "Press Start 2P"';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('LEVEL CLEAR!',this.#canvas.width/2,this.#canvas.height/2);
      ctx.restore();
    }

    if(this.#state===STATE.PLAYING){
      const c=this.#frame%700;
      if(c<140){
        const a=Math.sin((c/140)*Math.PI)*0.05;
        ctx.save();ctx.globalAlpha=a;
        ctx.fillStyle='#FFAB76';ctx.font='bold 18px "Press Start 2P"';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('B A B S',this.#canvas.width/2,this.#canvas.height/2-10);
        ctx.fillStyle='#FFD4B0';ctx.font='12px serif';
        ctx.fillText('Georgia Peach 🍑',this.#canvas.width/2,this.#canvas.height/2+14);
        ctx.restore();
      }
    }
  }

  #bind(){
    const D=new Map([['ArrowLeft',[-1,0]],['a',[-1,0]],['ArrowRight',[1,0]],['d',[1,0]],['ArrowUp',[0,-1]],['w',[0,-1]],['ArrowDown',[0,1]],['s',[0,1]]]);
    const go=()=>{if(this.#state===STATE.IDLE||this.#state===STATE.GAMEOVER)this.start();};
    document.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){go();return;}
      if(e.key==='m'||e.key==='M'){HUD.mute(snd.toggleMute());return;}
      if(this.#state!==STATE.PLAYING)return;
      const d=D.get(e.key);if(d){this.#pac.setDir(d[0],d[1]);e.preventDefault();}
    });
    document.getElementById('mute-btn')?.addEventListener('click',()=>HUD.mute(snd.toggleMute()));
    [['dpad-up',[0,-1]],['dpad-down',[0,1]],['dpad-left',[-1,0]],['dpad-right',[1,0]]].forEach(([id,d])=>{
      document.getElementById(id)?.addEventListener('touchstart',e=>{e.preventDefault();go();if(this.#state===STATE.PLAYING)this.#pac.setDir(d[0],d[1]);},{passive:false});
    });
    let sx=0,sy=0;
    this.#canvas.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;go();},{passive:true});
    this.#canvas.addEventListener('touchend',e=>{
      if(this.#state!==STATE.PLAYING)return;
      const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
      Math.abs(dx)>Math.abs(dy)?this.#pac.setDir(dx>0?1:-1,0):this.#pac.setDir(0,dy>0?1:-1);
    },{passive:true});
  }

  toggleMute(){const m=snd.toggleMute();HUD.mute(m);return m;}
}

// ═══════════════════════════════════════════════════════════════
//  SPLASH + BOOT
// ═══════════════════════════════════════════════════════════════
const splash=document.getElementById('splash');
const bye=()=>{splash.classList.add('fade-out');setTimeout(()=>splash.classList.add('gone'),800);};
setTimeout(bye,5000);
splash.addEventListener('click',bye,{once:true});
document.addEventListener('keydown',bye,{once:true});
const game=new Game('canvas');
window.__babs__=game;
