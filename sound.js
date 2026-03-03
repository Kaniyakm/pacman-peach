/**
 * BABS PAC-MAN  sound.js
 * Classic arcade sounds via Web Audio API.
 * No files. No uploads. Works on GitHub Pages.
 */
class SoundEngine {
  #ac=null; #muted=false; #sirenTimer=null; #frightTimer=null;
  #sirenPhase=0; #wakaPhase=0;

  #ctx() {
    if(!this.#ac) this.#ac=new(window.AudioContext||window.webkitAudioContext)();
    if(this.#ac.state==='suspended') this.#ac.resume();
    return this.#ac;
  }

  #tone(freq,type,t,dur,vol=0.18) {
    if(this.#muted)return;
    const ac=this.#ctx(),osc=ac.createOscillator(),g=ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    osc.type=type;
    osc.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    osc.start(t); osc.stop(t+dur+0.02);
  }

  #sweep(f0,f1,type,t,dur,vol=0.15) {
    if(this.#muted)return;
    const ac=this.#ctx(),osc=ac.createOscillator(),g=ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    osc.type=type;
    osc.frequency.setValueAtTime(f0,t);
    osc.frequency.linearRampToValueAtTime(f1,t+dur);
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    osc.start(t); osc.stop(t+dur+0.02);
  }

  get isMuted(){return this.#muted;}

  toggleMute(){
    this.#muted=!this.#muted;
    if(this.#muted){this.sirenStop();this.frightStop();}
    return this.#muted;
  }

  /* Opening jingle - Namco Pac-Man intro theme approximation */
  start(){
    if(this.#muted)return;
    const ac=this.#ctx(),t=ac.currentTime+0.05;
    [[494,0.00,0.11],[370,0.12,0.08],[311,0.21,0.08],
     [330,0.30,0.08],[494,0.39,0.11],[370,0.51,0.17],
     [494,0.72,0.11],[370,0.84,0.08],[311,0.93,0.08],
     [330,1.02,0.08],[494,1.11,0.22],
     [587,1.36,0.09],[698,1.46,0.09],[784,1.56,0.09],[988,1.66,0.20]]
    .forEach(([f,o,d])=>this.#tone(f,'square',t+o,d,0.20));
  }

  /* Waka-waka dot chomp - alternates hi/lo pitch */
  waka(){
    if(this.#muted)return;
    const ac=this.#ctx();
    this.#tone(this.#wakaPhase===0?440:330,'square',ac.currentTime,0.055,0.13);
    this.#wakaPhase^=1;
  }

  /* Power pellet - rising warble */
  power(){
    if(this.#muted)return;
    const ac=this.#ctx(),t=ac.currentTime;
    this.#sweep(130,520,'sawtooth',t,0.10,0.22);
    this.#sweep(520,1040,'square',t+0.09,0.10,0.16);
  }

  /* Ghost eaten - double blip, pitch rises each ghost */
  ghost(multiplier=1){
    if(this.#muted)return;
    const ac=this.#ctx(),t=ac.currentTime,f=260*multiplier;
    this.#sweep(f,f*2.1,'square',t,0.07,0.22);
    this.#sweep(f*2.1,f,'square',t+0.07,0.07,0.18);
    this.#tone(f*3,'sine',t+0.16,0.10,0.14);
  }

  /* Fruit collected - arpeggio. Peach gets shimmer trill */
  fruit(isPeach=false){
    if(this.#muted)return;
    const ac=this.#ctx(),t=ac.currentTime;
    const notes=isPeach?[523,659,784,1047,1319,1568]:[523,659,784,1047];
    notes.forEach((f,i)=>this.#tone(f,'square',t+i*0.07,0.09,0.18));
    if(isPeach) this.#sweep(1568,2093,'sine',t+notes.length*0.07,0.18,0.12);
  }

  /* Death - 12-step descending chromatic run */
  death(){
    if(this.#muted)return;
    const ac=this.#ctx(),t=ac.currentTime+0.08;
    [494,466,440,415,392,370,349,330,311,294,277,261]
      .forEach((f,i)=>this.#tone(f,'sawtooth',t+i*0.075,0.10,0.20));
    this.#sweep(130,55,'sawtooth',t+12*0.075,0.28,0.28);
  }

  /* Level clear - ascending fanfare */
  levelClear(){
    if(this.#muted)return;
    const ac=this.#ctx(),t=ac.currentTime+0.05;
    [[523,0.00,0.10],[659,0.11,0.10],[784,0.22,0.10],[1047,0.33,0.12],
     [784,0.47,0.08],[1047,0.56,0.10],[1319,0.68,0.22]]
      .forEach(([f,o,d])=>this.#tone(f,'square',t+o,d,0.20));
    this.#sweep(1319,1760,'sine',t+0.95,0.22,0.16);
  }

  /* Background siren loop */
  sirenStart(){this.sirenStop();this.#runSiren(400);}
  sirenFast() {this.sirenStop();this.#runSiren(220);}

  #runSiren(interval){
    if(this.#muted)return;
    this.#sirenPhase=0;
    this.#sirenTimer=setInterval(()=>{
      if(this.#muted)return;
      const ac=this.#ctx();
      const[f0,f1]=this.#sirenPhase===0?[200,260]:[260,200];
      this.#sweep(f0,f1,'sine',ac.currentTime,(interval/1000)*0.85,0.07);
      this.#sirenPhase^=1;
    },interval);
  }

  sirenStop(){
    if(this.#sirenTimer){clearInterval(this.#sirenTimer);this.#sirenTimer=null;}
  }

  /* Fright warble while ghosts are blue */
  frightStart(){
    this.frightStop();
    if(this.#muted)return;
    this.#frightTimer=setInterval(()=>{
      if(this.#muted)return;
      const ac=this.#ctx();
      this.#sweep(160,220,'sine',ac.currentTime,0.13,0.07);
    },260);
  }

  frightStop(){
    if(this.#frightTimer){clearInterval(this.#frightTimer);this.#frightTimer=null;}
  }
}

export const snd=new SoundEngine();
