/**
 * sound.js  --  Ms. Pac-Man "Georgia Peach Edition"
 * Web Audio API synthesis only.  No external audio files.
 *
 * LOOP ARCHITECTURE (v4 -- persistent osc + gain cancellation):
 *
 *   Previous versions had one of two problems:
 *     a) setInterval-spawned nodes \u2192 node churn \u2192 audio glitch clicks
 *     b) rAF with 300ms lookahead \u2192 cancelAnimationFrame doesn't cancel
 *        already-scheduled gain automation \u2192 siren "hangs" 300ms after stop
 *
 *   v4 solution:
 *     - ONE persistent OscillatorNode per loop sound, running forever at gain=0
 *     - A rAF scheduler pre-fills only 150ms ahead (short window)
 *     - On stop():  cancelAnimationFrame  +  gain.cancelScheduledValues(now)
 *                   +  gain.setValueAtTime(0, now)
 *       The cancelScheduledValues() wipes any pre-buffered gain automation
 *       instantly \u2192 zero tail, zero glitch.
 *     - No oscillator nodes are ever created/destroyed during play.
 */

class ArcadeSound {
  #ctx    = null;
  #master = null;   // master GainNode
  #muted  = false;

  // Siren (sawtooth, persistent)
  #sirOsc  = null;
  #sirGain = null;
  #sirRaf  = null;
  #sirStep = 0;
  #sirNext = 0;
  #sirFast = false;

  // Fright warble (square, persistent)
  #frtOsc  = null;
  #frtGain = null;
  #frtRaf  = null;
  #frtStep = 0;
  #frtNext = 0;

  #wakaFlip = false;

  // Frequency tables
  static #SIR_SLOW  = [200,213,226,240,253,240,226,213];
  static #SIR_FAST  = [268,286,302,320,336,320,302,286];
  static #FRT_TABLE = [138,156,142,165,149,170,144,160];

  // ----------------------------------------------------------------- boot ---
  #boot() {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') this.#ctx.resume();
      return;
    }
    this.#ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this.#master = this.#ctx.createGain();
    this.#master.gain.value = 0.28;
    this.#master.connect(this.#ctx.destination);
  }

  // ---------------------------------------------------------------- notes ---
  // One-shot disposable oscillator \u2014 auto-cleans-up via osc.stop()
  #note(freq, dur, vol = 0.20, shape = 'square', at = null) {
    if (this.#muted || !this.#ctx) return;
    const t   = at ?? this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const env = this.#ctx.createGain();
    osc.type  = shape;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env); env.connect(this.#master);
    osc.start(t); osc.stop(t + dur + 0.015);
  }

  #seq(notes, startAt = null) {
    if (this.#muted || !this.#ctx) return;
    let t = startAt ?? (this.#ctx.currentTime + 0.04);
    for (const { f, d, v = 0.20, shape = 'square' } of notes) {
      if (f > 0) this.#note(f, d, v, shape, t);
      t += d + 0.005;
    }
  }

  // ======================================================= ONE-SHOT SOUNDS

  /** Intro jingle at game start. */
  start() {
    this.#boot();
    if (this.#muted) return;
    this.#seq([
      { f: 494, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 587, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 698, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 784, d: 0.15 }, { f: 0,   d: 0.04 },
      { f: 698, d: 0.08 },
      { f: 784, d: 0.22 }, { f: 0,   d: 0.06 },
      { f: 740, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 659, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 587, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 523, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 494, d: 0.08 }, { f: 0,   d: 0.03 },
      { f: 440, d: 0.30 },
    ]);
  }

  /** Alternating two-tone waka per dot eaten. */
  waka() {
    this.#boot();
    if (this.#muted) return;
    this.#note(this.#wakaFlip ? 410 : 290, 0.058, 0.16, 'square');
    this.#wakaFlip = !this.#wakaFlip;
  }

  /** Descending sweep on power pellet. */
  power() {
    this.#boot();
    if (this.#muted || !this.#ctx) return;
    const now = this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const env = this.#ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.44);
    env.gain.setValueAtTime(0.24, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
    osc.connect(env); env.connect(this.#master);
    osc.start(now); osc.stop(now + 0.46);
  }

  /** 4-note ascending chord when ghost eaten; pitch scales with combo. */
  ghost(mul = 1) {
    this.#boot();
    if (this.#muted) return;
    const base = Math.min(110 * mul, 880);
    const now  = this.#ctx.currentTime;
    [[base,0.09],[base*1.5,0.09],[base*2,0.09],[base*3,0.14]]
      .forEach(([f, d], i) => this.#note(f, d, 0.20, 'square', now + i * 0.085));
  }

  /** 16-step descending crash on death. */
  death() {
    this.#boot();
    if (this.#muted) return;
    const now = this.#ctx.currentTime;
    [960,900,840,780,720,660,600,540,480,420,360,300,240,180,120,80]
      .forEach((f, i) => this.#note(f, 0.082, 0.24, 'square', now + i * 0.078));
  }

  /** Ascending fanfare on level clear. */
  levelClear() {
    this.#boot();
    if (this.#muted) return;
    this.#seq([
      { f: 523,  d: 0.10 }, { f: 659,  d: 0.10 },
      { f: 784,  d: 0.10 }, { f: 1047, d: 0.10 },
      { f: 784,  d: 0.06 }, { f: 880,  d: 0.06 },
      { f: 1047, d: 0.34 },
    ]);
  }

  /** Fruit collected \u2014 peach gets extra sparkle. */
  fruit(isPeach = false) {
    this.#boot();
    if (this.#muted) return;
    if (isPeach) {
      this.#seq([
        { f: 523, d: 0.07 }, { f: 659, d: 0.07 }, { f: 784,  d: 0.07 },
        { f:1047, d: 0.07 }, { f:1319, d: 0.07 }, { f:1568,  d: 0.15 },
      ]);
    } else {
      this.#seq([{ f:659,d:0.09 },{ f:784,d:0.09 },{ f:1047,d:0.14 }]);
    }
  }

  /** Danger sting when level timer expires. */
  timeUp() {
    this.#boot();
    if (this.#muted) return;
    const now = this.#ctx.currentTime;
    [[880,0.12],[698,0.12],[587,0.12],[440,0.26]]
      .forEach(([f, d], i) => this.#note(f, d, 0.26, 'square', now + i * 0.13));
  }

  // ======================================================= CONTINUOUS LOOPS
  //
  // Design: ONE OscillatorNode per loop, started once, runs at gain=0.
  // A rAF scheduler fills only 150ms of gain automation ahead.
  // Stop = cancelAnimationFrame + gain.cancelScheduledValues() + gain=0.
  // This gives TRUE instant silence with zero node creation/destruction.

  // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 SIREN helpers
  #makeSiren() {
    if (this.#sirOsc) return;   // already exists
    this.#sirOsc  = this.#ctx.createOscillator();
    this.#sirGain = this.#ctx.createGain();
    this.#sirOsc.type = 'sawtooth';
    this.#sirOsc.frequency.value = 200;
    this.#sirGain.gain.value = 0;
    this.#sirOsc.connect(this.#sirGain);
    this.#sirGain.connect(this.#master);
    this.#sirOsc.start();
  }

  #sirLoop = () => {
    if (!this.#ctx || !this.#sirGain) return;
    const now   = this.#ctx.currentTime;
    const table = this.#sirFast ? ArcadeSound.#SIR_FAST : ArcadeSound.#SIR_SLOW;
    const step  = this.#sirFast ? 0.060 : 0.088;
    const vol   = this.#muted   ? 0 : 0.07;   // quiet \u2014 must not clash with waka

    // Fill only 150ms ahead (short window \u2192 cancelScheduledValues clears quickly)
    while (this.#sirNext < now + 0.15) {
      const f = table[this.#sirStep % table.length];
      this.#sirOsc.frequency.setValueAtTime(f, this.#sirNext);
      this.#sirGain.gain.setValueAtTime(vol, this.#sirNext);
      this.#sirGain.gain.setValueAtTime(0,   this.#sirNext + step * 0.45); // 45% duty
      this.#sirNext += step;
      this.#sirStep++;
    }
    this.#sirRaf = requestAnimationFrame(this.#sirLoop);
  };

  sirenStart() {
    this.#boot();
    this.#makeSiren();
    this.#sirFast = false;
    this.#sirStep = 0;
    this.#sirNext = this.#ctx.currentTime + 0.01;
    if (!this.#sirRaf) this.#sirLoop();
  }

  sirenFast() {
    if (!this.#sirOsc) { this.sirenStart(); }
    this.#sirFast = true;
  }

  sirenStop() {
    // Cancel rAF so no more scheduling
    if (this.#sirRaf) { cancelAnimationFrame(this.#sirRaf); this.#sirRaf = null; }
    // Cancel ALL pre-buffered gain automation \u2192 true instant silence
    if (this.#sirGain && this.#ctx) {
      const now = this.#ctx.currentTime;
      this.#sirGain.gain.cancelScheduledValues(now);
      this.#sirGain.gain.setValueAtTime(0, now);
    }
    // Oscillator stays running silently \u2014 avoids cost of re-creating nodes on next sirenStart
  }

  // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 FRIGHT helpers
  #makeFright() {
    if (this.#frtOsc) return;
    this.#frtOsc  = this.#ctx.createOscillator();
    this.#frtGain = this.#ctx.createGain();
    this.#frtOsc.type = 'square';
    this.#frtOsc.frequency.value = 138;
    this.#frtGain.gain.value = 0;
    this.#frtOsc.connect(this.#frtGain);
    this.#frtGain.connect(this.#master);
    this.#frtOsc.start();
  }

  #frtLoop = () => {
    if (!this.#ctx || !this.#frtGain) return;
    const now  = this.#ctx.currentTime;
    const step = 0.072;
    const vol  = this.#muted ? 0 : 0.09;

    while (this.#frtNext < now + 0.15) {
      const f = ArcadeSound.#FRT_TABLE[this.#frtStep % ArcadeSound.#FRT_TABLE.length];
      this.#frtOsc.frequency.setValueAtTime(f, this.#frtNext);
      this.#frtGain.gain.setValueAtTime(vol, this.#frtNext);
      this.#frtGain.gain.setValueAtTime(0,   this.#frtNext + step * 0.5);
      this.#frtNext += step;
      this.#frtStep++;
    }
    this.#frtRaf = requestAnimationFrame(this.#frtLoop);
  };

  frightStart() {
    this.sirenStop();   // silence siren instantly before starting fright
    this.#boot();
    this.#makeFright();
    this.#frtStep = 0;
    this.#frtNext = this.#ctx.currentTime + 0.01;
    if (!this.#frtRaf) this.#frtLoop();
  }

  frightStop() {
    if (this.#frtRaf) { cancelAnimationFrame(this.#frtRaf); this.#frtRaf = null; }
    if (this.#frtGain && this.#ctx) {
      const now = this.#ctx.currentTime;
      this.#frtGain.gain.cancelScheduledValues(now);
      this.#frtGain.gain.setValueAtTime(0, now);
    }
  }

  // ----------------------------------------------------------------- mute ---
  toggleMute() {
    this.#muted = !this.#muted;
    if (this.#master && this.#ctx) {
      const now = this.#ctx.currentTime;
      this.#master.gain.cancelScheduledValues(now);
      this.#master.gain.setValueAtTime(this.#muted ? 0 : 0.28, now);
    }
    return this.#muted;
  }
}

export const snd = new ArcadeSound();
