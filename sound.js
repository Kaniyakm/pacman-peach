/**
 * sound.js — BABS' PAC-MAN Georgia Peach Edition
 * ─────────────────────────────────────────────────────────────────────────
 * Loads WAV files from assets/sounds/.  Falls back to Web Audio synthesis
 * automatically if any file is missing.
 *
 * WAV files (put in assets/sounds/):
 *   start.wav  waka.wav  power.wav  eat-ghost.wav  fruit.wav  death.wav
 *
 * Continuous loops (always synthesised):
 *   sirenStart() / sirenFast() / sirenStop()
 *   frightStart() / frightStop()
 *
 * Loop design: one persistent OscillatorNode per loop at gain=0 when silent.
 * rAF scheduler fills 120ms ahead.
 * sirenFast() raises frequency table AND cuts step time 88ms→52ms.
 * Stop = cancelAnimationFrame + gain.cancelScheduledValues → instant silence.
 *
 * Exposed as window.SOUND — no ES-module import needed.
 */
window.SOUND = (() => {
  let ctx=null, master=null, muted=false;

  // WAV buffers
  const buf = {start:null,waka:null,power:null,ghost:null,fruit:null,death:null};

  // Siren state
  let sirOsc=null,sirGain=null,sirRaf=null,sirStep=0,sirNext=0,sirFast=false;

  // Fright state
  let frtOsc=null,frtGain=null,frtRaf=null,frtStep=0,frtNext=0;

  let wakaFlip=false;

  // Frequency tables
  const SIR_SLOW=[200,210,221,233,246,233,221,210];
  const SIR_FAST=[262,277,294,311,330,311,294,277];
  const FRT_TBL =[138,156,142,165,149,170,144,160];

  // ── AudioContext boot ──────────────────────────────────────────────────
  function boot(){
    if(ctx){if(ctx.state==='suspended')ctx.resume();return;}
    ctx=new(window.AudioContext||window.webkitAudioContext)();
    master=ctx.createGain();master.gain.value=0.30;
    master.connect(ctx.destination);
    loadWavs();
  }

  function loadWavs(){
    const FILES={
      start:'assets/sounds/start.wav',waka:'assets/sounds/waka.wav',
      power:'assets/sounds/power.wav',ghost:'assets/sounds/eat-ghost.wav',
      fruit:'assets/sounds/fruit.wav',death:'assets/sounds/death.wav',
    };
    for(const[k,url]of Object.entries(FILES)){
      fetch(url).then(r=>{if(!r.ok)throw 0;return r.arrayBuffer();})
        .then(ab=>ctx.decodeAudioData(ab)).then(d=>{buf[k]=d;})
        .catch(()=>{});
    }
  }

  // ── Synth primitives ───────────────────────────────────────────────────
  function note(freq,dur,vol=0.20,shape='square',at=null){
    if(muted||!ctx)return;
    const t=at??ctx.currentTime;
    const osc=ctx.createOscillator(),env=ctx.createGain();
    osc.type=shape;osc.frequency.setValueAtTime(freq,t);
    env.gain.setValueAtTime(vol,t);
    env.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    osc.connect(env);env.connect(master);osc.start(t);osc.stop(t+dur+0.015);
  }

  function seq(notes,at=null){
    if(muted||!ctx)return;
    let t=at??(ctx.currentTime+0.04);
    for(const{f,d,v=0.20,s='square'}of notes){
      if(f>0)note(f,d,v,s,t);t+=d+0.005;
    }
  }

  // ── Play WAV or fallback ───────────────────────────────────────────────
  function wav(key,fb,vol=1.0){
    if(muted||!ctx)return;
    if(buf[key]){
      const src=ctx.createBufferSource(),g=ctx.createGain();
      src.buffer=buf[key];g.gain.value=vol;
      src.connect(g);g.connect(master);src.start();
    } else { fb(); }
  }

  // ════════════════════════ ONE-SHOT SOUNDS ════════════════════════════

  function start(){
    boot();
    wav('start',()=>seq([
      {f:494,d:0.09},{f:0,d:0.03},{f:370,d:0.07},{f:0,d:0.02},
      {f:311,d:0.07},{f:0,d:0.02},{f:330,d:0.07},{f:0,d:0.02},
      {f:494,d:0.09},{f:0,d:0.03},{f:370,d:0.15},{f:0,d:0.05},
      {f:494,d:0.09},{f:0,d:0.03},{f:370,d:0.07},{f:0,d:0.02},
      {f:311,d:0.07},{f:0,d:0.02},{f:330,d:0.07},{f:0,d:0.02},
      {f:494,d:0.20},{f:0,d:0.06},
      {f:587,d:0.08},{f:698,d:0.08},{f:784,d:0.08},{f:988,d:0.22},
    ]));
  }

  function waka(){
    boot();if(muted)return;
    if(buf.waka){
      const src=ctx.createBufferSource(),g=ctx.createGain();
      src.buffer=buf.waka;
      // Alternating playback rate = waka-waka pitch variation from ONE file
      src.playbackRate.value=wakaFlip?1.0:1.28;
      g.gain.value=0.80;src.connect(g);g.connect(master);src.start();
    } else {
      note(wakaFlip?440:330,0.058,0.16,'square');
    }
    wakaFlip=!wakaFlip;
  }

  function power(){
    boot();
    wav('power',()=>{
      if(!ctx)return;
      const now=ctx.currentTime;
      const osc=ctx.createOscillator(),env=ctx.createGain();
      osc.type='square';
      osc.frequency.setValueAtTime(150,now);
      osc.frequency.exponentialRampToValueAtTime(850,now+0.35);
      env.gain.setValueAtTime(0.24,now);
      env.gain.exponentialRampToValueAtTime(0.0001,now+0.35);
      osc.connect(env);env.connect(master);osc.start(now);osc.stop(now+0.37);
    });
  }

  function ghost(mul=1){
    boot();
    wav('ghost',()=>{
      if(!ctx)return;
      const base=Math.min(110*mul,880),now=ctx.currentTime;
      [[base,0.09],[base*1.5,0.09],[base*2,0.09],[base*3,0.14]]
        .forEach(([f,d],i)=>note(f,d,0.20,'square',now+i*0.085));
    });
  }

  function fruit(isPeach=false){
    boot();
    wav('fruit',()=>{
      if(isPeach){
        seq([{f:523,d:0.07},{f:659,d:0.07},{f:784,d:0.07},
             {f:1047,d:0.07},{f:1319,d:0.07},{f:1568,d:0.15}]);
      } else {
        seq([{f:659,d:0.09},{f:784,d:0.09},{f:1047,d:0.14}]);
      }
    });
    // Peach shimmer added even when WAV plays
    if(isPeach&&buf.fruit&&ctx&&!muted){
      seq([{f:1319,d:0.07},{f:1568,d:0.07},{f:2093,d:0.14}],
          ctx.currentTime+0.32);
    }
  }

  function death(){
    boot();
    wav('death',()=>{
      if(!ctx)return;
      const now=ctx.currentTime;
      [960,900,840,780,720,660,600,540,480,420,360,300,240,185,140,80]
        .forEach((f,i)=>note(f,0.082,0.24,'sawtooth',now+i*0.078));
    });
  }

  function levelClear(){
    boot();if(muted)return;
    seq([{f:523,d:0.10},{f:659,d:0.10},{f:784,d:0.10},{f:1047,d:0.10},
         {f:784,d:0.06},{f:880,d:0.06},{f:1047,d:0.34}]);
  }

  // ════════════════════════ CONTINUOUS LOOPS ════════════════════════════

  // ── Siren ──────────────────────────────────────────────────────────────
  function makeSiren(){
    if(sirOsc)return;
    sirOsc=ctx.createOscillator();sirGain=ctx.createGain();
    sirOsc.type='sawtooth';sirOsc.frequency.value=200;sirGain.gain.value=0;
    sirOsc.connect(sirGain);sirGain.connect(master);sirOsc.start();
  }

  function sirLoop(){
    if(!ctx||!sirGain)return;
    const now=ctx.currentTime;
    const tbl=sirFast?SIR_FAST:SIR_SLOW;
    // slow=88ms/step, fast=52ms/step  ← tempo difference audible like arcade
    const step=sirFast?0.052:0.088;
    const vol=muted?0:0.072;
    while(sirNext<now+0.12){
      sirOsc.frequency.setValueAtTime(tbl[sirStep%tbl.length],sirNext);
      sirGain.gain.setValueAtTime(vol,sirNext);
      sirGain.gain.setValueAtTime(0,sirNext+step*0.40); // 40% duty
      sirNext+=step;sirStep++;
    }
    sirRaf=requestAnimationFrame(sirLoop);
  }

  function sirenStart(){
    boot();makeSiren();
    // Cancel any leftover schedule before starting fresh
    if(sirRaf){cancelAnimationFrame(sirRaf);sirRaf=null;}
    if(sirGain&&ctx){
      const now=ctx.currentTime;
      sirGain.gain.cancelScheduledValues(now);
      sirGain.gain.setValueAtTime(0,now);
    }
    sirFast=false;sirStep=0;sirNext=ctx.currentTime+0.01;
    sirLoop();
  }

  function sirenFast(){
    // If siren not yet started, start it
    if(!sirOsc){sirenStart();}
    // Cancel current schedule, switch to fast table immediately
    if(sirRaf){cancelAnimationFrame(sirRaf);sirRaf=null;}
    if(sirGain&&ctx){
      const now=ctx.currentTime;
      sirGain.gain.cancelScheduledValues(now);
      sirGain.gain.setValueAtTime(0,now);
    }
    sirFast=true;sirStep=0;sirNext=ctx.currentTime+0.01;
    sirLoop();
  }

  function sirenStop(){
    if(sirRaf){cancelAnimationFrame(sirRaf);sirRaf=null;}
    if(sirGain&&ctx){
      const now=ctx.currentTime;
      sirGain.gain.cancelScheduledValues(now);
      sirGain.gain.setValueAtTime(0,now);
    }
  }

  // ── Fright warble ──────────────────────────────────────────────────────
  function makeFright(){
    if(frtOsc)return;
    frtOsc=ctx.createOscillator();frtGain=ctx.createGain();
    frtOsc.type='square';frtOsc.frequency.value=138;frtGain.gain.value=0;
    frtOsc.connect(frtGain);frtGain.connect(master);frtOsc.start();
  }

  function frtLoop(){
    if(!ctx||!frtGain)return;
    const now=ctx.currentTime,step=0.068,vol=muted?0:0.088;
    while(frtNext<now+0.12){
      frtOsc.frequency.setValueAtTime(FRT_TBL[frtStep%FRT_TBL.length],frtNext);
      frtGain.gain.setValueAtTime(vol,frtNext);
      frtGain.gain.setValueAtTime(0,frtNext+step*0.50);
      frtNext+=step;frtStep++;
    }
    frtRaf=requestAnimationFrame(frtLoop);
  }

  function frightStart(){
    sirenStop(); // instant silence before warble starts
    boot();makeFright();
    if(frtRaf){cancelAnimationFrame(frtRaf);frtRaf=null;}
    if(frtGain&&ctx){
      const now=ctx.currentTime;
      frtGain.gain.cancelScheduledValues(now);
      frtGain.gain.setValueAtTime(0,now);
    }
    frtStep=0;frtNext=ctx.currentTime+0.01;
    frtLoop();
  }

  function frightStop(){
    if(frtRaf){cancelAnimationFrame(frtRaf);frtRaf=null;}
    if(frtGain&&ctx){
      const now=ctx.currentTime;
      frtGain.gain.cancelScheduledValues(now);
      frtGain.gain.setValueAtTime(0,now);
    }
  }

  // ── Mute ───────────────────────────────────────────────────────────────
  function toggleMute(){
    muted=!muted;
    if(master&&ctx){
      const now=ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(muted?0:0.30,now);
    }
    return muted;
  }

  // ── play() dispatcher ──────────────────────────────────────────────────
  function play(name,arg){
    switch(name){
      case 'start':      return start();
      case 'waka':       return waka();
      case 'power':      return power();
      case 'ghost':
      case 'eat-ghost':  return ghost(arg);
      case 'fruit':      return fruit(arg);
      case 'death':      return death();
      case 'levelClear': return levelClear();
    }
  }

  return {
    play,start,waka,power,ghost,fruit,death,levelClear,
    sirenStart,sirenFast,sirenStop,frightStart,frightStop,toggleMute,
    get isMuted(){return muted;},
  };
})();
